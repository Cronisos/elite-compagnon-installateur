// Chiffrement de bout en bout des partages adressés à des personnes (partage.js). Le serveur de l'escadron range et
// distribue le partage, mais ne peut pas le lire : seul le contenu chiffré lui est confié, et les clés privées ne
// quittent jamais le PC de chaque joueur.
//
// Chaque installation de l'app a sa paire de clés X25519 ; elle publie sa clé publique sur le serveur. Pour partager
// à des personnes, l'app tire une clé de contenu au hasard, chiffre le titre et le contenu avec elle (AES-256-GCM),
// puis enveloppe cette clé pour chaque clé publique des destinataires (et les siennes) : échange Diffie-Hellman avec
// une clé éphémère propre au partage, dérivation HKDF-SHA256, AES-256-GCM. Tout vient de node:crypto, sans paquet.
//
// Limite assumée : ce chiffrement ne vaut que pour les partages à des personnes. Un partage « à tout l'escadron » ou
// « à un rôle » reste lisible par celui qui héberge le serveur (il faudrait redistribuer une clé à chaque arrivée ou
// départ). Le serveur voit toujours qui partage à qui, le type du partage et sa date. Et il distribue les clés
// publiques : un serveur malveillant pourrait en glisser une à lui. Rien ne protège de cela ici.

import crypto from 'node:crypto';

export const VERSION = 1;
/** Clé publique X25519 brute (32 octets) en base64. */
export const CLE_PUBLIQUE = /^[A-Za-z0-9+/]{43}=$/;
/** Titre que voit le serveur à la place du vrai. */
export const TITRE_CHIFFRE = 'Partage chiffré';
/** Taille maximale d'une enveloppe (contenu chiffré et clés enveloppées), comme le serveur. */
export const MAX_ENVELOPPE = 24 * 1024;

const PREFIXE_SPKI = Buffer.from('302a300506032b656e032100', 'hex'); // en-tête DER d'une clé publique X25519
const INFO = 'elite-compagnon partage v1';
const b64 = (buf) => Buffer.from(buf).toString('base64');
const de64 = (s) => Buffer.from(String(s), 'base64');

const clePublique = (brute64) => crypto.createPublicKey({ key: Buffer.concat([PREFIXE_SPKI, de64(brute64)]), format: 'der', type: 'spki' });
const clePrivee = (pkcs864) => crypto.createPrivateKey({ key: de64(pkcs864), format: 'der', type: 'pkcs8' });
const brute = (publique) => publique.export({ format: 'der', type: 'spki' }).subarray(PREFIXE_SPKI.length);

/** Empreinte courte d'une clé publique : dit quelle clé enveloppée est pour qui, sans la clé elle-même. */
export const empreinte = (brute64) => crypto.createHash('sha256').update(de64(brute64)).digest('hex').slice(0, 16);

/** Nouvelle paire de clés d'une installation : { publique, privee } en base64 (brute, et PKCS#8). */
export function nouvellePaire() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  return { publique: b64(brute(publicKey)), privee: b64(privateKey.export({ format: 'der', type: 'pkcs8' })) };
}

/** Paire relue sans confiance : utilisable, ou null. */
export function paireValide(p) {
  if (!p || typeof p.publique !== 'string' || typeof p.privee !== 'string' || !CLE_PUBLIQUE.test(p.publique)) return null;
  try {
    const priv = clePrivee(p.privee);
    if (b64(brute(crypto.createPublicKey(priv))) !== p.publique) return null;
    return { publique: p.publique, privee: p.privee };
  } catch {
    return null;
  }
}

/** Clé qui enveloppe la clé de contenu pour un destinataire : dérivée du secret partagé, liée aux deux clés publiques. */
function cleEnveloppe(secret, eph64, dest64) {
  return Buffer.from(crypto.hkdfSync('sha256', secret, Buffer.concat([de64(eph64), de64(dest64)]), INFO, 32));
}

function sceller(cle, clair) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cle, iv);
  return { iv: b64(iv), ct: b64(Buffer.concat([c.update(clair), c.final(), c.getAuthTag()])) };
}

function ouvrir(cle, iv64, ct64) {
  const tout = de64(ct64);
  const d = crypto.createDecipheriv('aes-256-gcm', cle, de64(iv64));
  d.setAuthTag(tout.subarray(tout.length - 16));
  return Buffer.concat([d.update(tout.subarray(0, tout.length - 16)), d.final()]);
}

/** Ce contenu est-il une enveloppe chiffrée ? */
export const estChiffre = (data) => Boolean(data) && typeof data === 'object' && data.e2e === VERSION && typeof data.ct === 'string';

/**
 * Chiffre { titre, data } pour ces clés publiques (base64, doublons ignorés). Rend l'enveloppe à confier au serveur :
 * { e2e, eph, iv, ct, cles: [{ a, iv, w }] }. Lève une erreur sans aucune clé valable.
 */
export function chiffrer({ titre, data }, cles) {
  const destinataires = [...new Set((Array.isArray(cles) ? cles : []).filter((c) => typeof c === 'string' && CLE_PUBLIQUE.test(c)))];
  if (!destinataires.length) throw new Error('aucune clé de destinataire');
  const contenu = crypto.randomBytes(32);
  const eph = crypto.generateKeyPairSync('x25519');
  const eph64 = b64(brute(eph.publicKey));
  const corps = sceller(contenu, Buffer.from(JSON.stringify({ titre, data }), 'utf8'));
  return {
    e2e: VERSION,
    eph: eph64,
    iv: corps.iv,
    ct: corps.ct,
    cles: destinataires.map((dest) => {
      const secret = crypto.diffieHellman({ privateKey: eph.privateKey, publicKey: clePublique(dest) });
      const s = sceller(cleEnveloppe(secret, eph64, dest), contenu);
      return { a: empreinte(dest), iv: s.iv, w: s.ct };
    }),
  };
}

/**
 * Déchiffre une enveloppe avec la paire de cette installation : { titre, data }, ou null si elle n'est pas pour elle,
 * si elle est abîmée ou si elle a été modifiée en route (l'authentification échoue alors).
 */
export function dechiffrer(enveloppe, paire) {
  if (!estChiffre(enveloppe) || !paire || !Array.isArray(enveloppe.cles) || !CLE_PUBLIQUE.test(enveloppe.eph ?? '')) return null;
  const mienne = enveloppe.cles.find((c) => c && c.a === empreinte(paire.publique));
  if (!mienne) return null;
  try {
    const secret = crypto.diffieHellman({ privateKey: clePrivee(paire.privee), publicKey: clePublique(enveloppe.eph) });
    const contenu = ouvrir(cleEnveloppe(secret, enveloppe.eph, paire.publique), mienne.iv, mienne.w);
    const clair = JSON.parse(ouvrir(contenu, enveloppe.iv, enveloppe.ct).toString('utf8'));
    if (!clair || typeof clair.titre !== 'string' || !clair.data || typeof clair.data !== 'object' || Array.isArray(clair.data)) return null;
    return { titre: clair.titre, data: clair.data };
  } catch {
    return null;
  }
}
