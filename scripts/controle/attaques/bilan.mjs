// Tenue des comptes des attaques : chaque requête est jouée, comparée à son résultat attendu, puis passée aux contrôles
// communs à TOUTES les réponses (aucun X-Powered-By, aucun en-tête CORS, en-têtes sandbox et nosniff sur chaque image,
// jamais d'erreur 500, jamais un refus sans raison). Un écart = une ligne lisible, la famille de l'attaque en tête.

import { envoyer } from './http.mjs';

const ERREUR_INTERNE = 'Erreur interne du serveur.';
const extrait = (rep) => (rep.json?.error ?? rep.texte ?? '').toString().replace(/\s+/g, ' ').slice(0, 160);
const court = (chemin) => (chemin.length > 140 ? `${chemin.slice(0, 120)}…(${chemin.length} caractères)` : chemin);

export const COMMUNS = {
  secret: 'Jeton d’escadron jamais renvoyé en clair',
  poweredBy: 'Aucun X-Powered-By',
  cors: 'Aucun CORS',
  images: 'En-têtes sandbox et nosniff des images',
  erreurs: 'Jamais d’erreur 500',
  raisons: 'Refus toujours expliqué',
};

/** Écarts des contrôles communs pour une réponse : [[famille, texte]]. */
export function controlesCommuns(rep) {
  const out = [];
  const h = rep.entetes || {};
  if (Object.hasOwn(h, 'x-powered-by')) out.push([COMMUNS.poweredBy, `X-Powered-By: ${h['x-powered-by']}`]);
  for (const k of Object.keys(h)) if (k.startsWith('access-control-')) out.push([COMMUNS.cors, `${k}: ${h[k]}`]);
  const type = String(h['content-type'] || '').toLowerCase();
  if (type.startsWith('image/') || /svg/.test(type)) {
    if (!/(^|;|\s)sandbox(\s|;|$)/.test(String(h['content-security-policy'] || ''))) out.push([COMMUNS.images, `image ${type} sans « Content-Security-Policy: sandbox »`]);
    if (String(h['x-content-type-options'] || '').toLowerCase() !== 'nosniff') out.push([COMMUNS.images, `image ${type} sans « X-Content-Type-Options: nosniff »`]);
  }
  // 502, 503, 504 : service extérieur indisponible (réseau coupé), seulement avec une raison lisible
  const exterieur = [502, 503, 504].includes(rep.statut) && typeof rep.json?.error === 'string' && rep.json.error && rep.json.error !== ERREUR_INTERNE;
  if (rep.statut >= 500 && !exterieur) out.push([COMMUNS.erreurs, `erreur ${rep.statut} : ${extrait(rep)}`]);
  if (rep.statut >= 400 && rep.json?.error === ERREUR_INTERNE) out.push([COMMUNS.raisons, `refus ${rep.statut} « ${ERREUR_INTERNE} » : la raison n'est pas dite`]);
  return out;
}

export class Bilan {
  /**
   * @param {object} o
   * @param {string} o.base     adresse visée (serveur isolé ou proxy de l'interface)
   * @param {string} [o.cible]  nom de la cible dans les écarts
   * @param {() => string[]} [o.secrets] secrets (jeton d'escadron) qu'aucune réponse ne doit contenir, même en partie
   */
  constructor({ base, cible = 'serveur isolé', secrets = () => [] }) {
    this.base = base;
    this.cible = cible;
    this.secrets = secrets;
    this.familles = new Map(); // nom → { total, ecarts: [], attendu: Set }
    this.reponses = 0;
    this.reponsesFouillees = 0; // reçues pendant qu'un secret était enregistré (fouillées pour lui)
    /** Écarts structurés (famille, méthode, route déclarée, cas, obtenu) : écrits en JSON à côté du journal. */
    this.releves = [];
    this.images = 0;
    this.imagesParChemin = new Map();
  }

  famille(nom) {
    if (!this.familles.has(nom)) this.familles.set(nom, { total: 0, ecarts: [], attendus: new Set() });
    return this.familles.get(nom);
  }

  /** Constat qui ne vient pas d'une seule requête (fichiers, journaux du serveur, sonde) : ecart null si conforme. */
  constat(famille, nom, attendu, ecart) {
    const f = this.famille(famille);
    f.total += 1;
    f.attendus.add(attendu);
    if (ecart) {
      f.ecarts.push(`${nom} : attendu ${attendu} ; obtenu ${ecart}`);
      this.releves.push({ cible: this.cible, famille, cas: nom, obtenu: ecart });
    }
    return !ecart;
  }

  /** Joue une attaque, la compare à son résultat attendu, puis aux contrôles communs. Rend la réponse (ou null). */
  async jouer(a) {
    const f = this.famille(a.famille);
    f.total += 1;
    f.attendus.add(a.attendu.texte);
    const titre = `${a.methode} ${court(a.chemin)} (${a.nom})`;
    let rep;
    try {
      rep = await envoyer({ base: a.base || this.base, methode: a.methode, chemin: a.chemin, entetes: a.entetes, corps: a.corps, delaiMs: a.delaiMs });
    } catch (err) {
      f.ecarts.push(`${titre} : attendu ${a.attendu.texte} ; pas de réponse (${err.message})`);
      return null;
    }
    this.reponses += 1;
    const statuts = a.attendu.statuts;
    const bonStatut = typeof statuts === 'function' ? statuts(rep.statut, rep) : statuts.includes(rep.statut);
    let ecart = bonStatut ? null : `${rep.statut} « ${extrait(rep)} »`;
    if (!ecart && a.attendu.message && !a.attendu.message.test(String(rep.json?.error ?? rep.texte))) ecart = `${rep.statut} avec le message « ${extrait(rep)} »`;
    if (!ecart && a.attendu.verifier) ecart = a.attendu.verifier(rep) || null;
    const relever = (famille, obtenu) => this.releves.push({ cible: this.cible, famille, methode: a.methode, route: a.modele || a.chemin, chemin: court(a.chemin), cas: a.nom, statut: rep.statut, obtenu });
    if (ecart) {
      f.ecarts.push(`${titre} : attendu ${a.attendu.texte} ; obtenu ${ecart}`);
      relever(a.famille, ecart);
    }
    // Un secret (ou ses 16 premiers caractères) dans le corps ou les en-têtes d'une réponse : fuite
    const brut = `${JSON.stringify(rep.entetes)}\n${rep.texte}`;
    if (this.secrets().length) this.reponsesFouillees += 1;
    for (const s of this.secrets()) {
      if (s && (brut.includes(s) || brut.includes(s.slice(0, 16)))) {
        this.famille(COMMUNS.secret).ecarts.push(`${titre} : le jeton est dans la réponse`);
        relever(COMMUNS.secret, 'le jeton est dans la réponse');
      }
    }
    for (const [famille, texte] of controlesCommuns(rep)) {
      this.famille(famille).ecarts.push(`${titre} : ${texte}`);
      relever(famille, texte);
    }
    const type = String(rep.entetes['content-type'] || '');
    if (/^image\//i.test(type)) {
      this.images += 1;
      this.imagesParChemin.set(a.chemin, type);
    }
    return rep;
  }

  /** Joue une liste d'attaques, une à la fois (une base SQLite n'aime pas les écritures en rafale). */
  async jouerTout(attaques) {
    for (const a of attaques) await this.jouer(a);
  }

  /** Contrôles communs : leur compte est celui des réponses reçues. */
  clore() {
    for (const nom of Object.values(COMMUNS)) {
      const f = this.famille(nom);
      f.total = nom === COMMUNS.secret ? this.reponsesFouillees : this.reponses;
      f.attendus.add(nom === COMMUNS.secret ? 'sur chaque réponse reçue une fois le jeton enregistré' : 'sur chaque réponse reçue');
    }
  }

  ecarts() {
    return [...this.familles].flatMap(([nom, f]) => f.ecarts.map((e) => `[${this.cible}] [${nom}] ${e}`));
  }

  resume() {
    return [...this.familles].map(([nom, f]) => ({ famille: nom, total: f.total, ecarts: f.ecarts.length, attendus: [...f.attendus] }));
  }
}
