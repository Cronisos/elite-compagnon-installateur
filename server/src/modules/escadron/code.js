// Codes à copier-coller entre joueurs, même format que le plugin EDMC du Squadron Tracker (load.py, parse_code) :
//   - code de l'escadron : « ESC1. » + base64url de { u: adresse du serveur, p: mot de passe } ; le même pour tous,
//     posté sur Discord. Sans « ESC1. », le texte est le mot de passe seul, pour le serveur déjà réglé.
//   - code de gestion : « EGC1. » + base64url de { u, a: clé de chef, t: clé du suivi, p } ; donne tous les droits sur
//     le serveur (membres, route), à ne passer qu'à qui gère avec toi.

export const PREFIXE_ESCADRON = 'ESC1.';
export const PREFIXE_GESTION = 'EGC1.';

const encoder = (prefixe, data) => prefixe + Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');

function decoder(prefixe, code) {
  try {
    const data = JSON.parse(Buffer.from(code.trim().slice(prefixe.length), 'base64url').toString('utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/** Code de l'escadron pour ce serveur et ce mot de passe. */
export const codeEscadron = (url, motDePasse) => encoder(PREFIXE_ESCADRON, { u: url, p: motDePasse });

/**
 * Lit un code de l'escadron : { serveur (ou null : celui déjà réglé), motDePasse }, ou null s'il est illisible.
 * Le serveur n'est pas vérifié ici (workerBase le fait au réglage).
 */
export function lireCodeEscadron(code) {
  if (typeof code !== 'string' || !code.trim() || code.length > 2000) return null;
  const t = code.trim();
  if (!t.startsWith(PREFIXE_ESCADRON)) return { serveur: null, motDePasse: t };
  const d = decoder(PREFIXE_ESCADRON, t);
  if (!d || typeof d.p !== 'string' || !d.p || (d.u != null && typeof d.u !== 'string')) return null;
  return { serveur: d.u || null, motDePasse: d.p };
}

export const codeGestion = ({ url, adminToken, trackerToken = null, motDePasse = null }) =>
  encoder(PREFIXE_GESTION, { u: url, a: adminToken, ...(trackerToken ? { t: trackerToken } : {}), ...(motDePasse ? { p: motDePasse } : {}) });

/** Lit un code de gestion : { url, adminToken, trackerToken, motDePasse }, ou null. */
export function lireCodeGestion(code) {
  if (typeof code !== 'string' || !code.trim().startsWith(PREFIXE_GESTION) || code.length > 2000) return null;
  const d = decoder(PREFIXE_GESTION, code);
  if (!d || typeof d.u !== 'string' || typeof d.a !== 'string') return null;
  return {
    url: d.u,
    adminToken: d.a,
    trackerToken: typeof d.t === 'string' ? d.t : null,
    motDePasse: typeof d.p === 'string' ? d.p : null,
  };
}
