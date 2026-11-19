// Vigie des règles (outil de l’auteur, 9 nov. 2026) : compare les règles du dépôt (server/src/regles/) à ce que le jeu fait.
//
// Les modules lui signalent leurs mesures (observe) : la règle concernée (id de fiche), la valeur attendue, la valeur
// vue, s'il y a écart, et l'explication connue de l'écart s'il y en a une (passage de semaine, relevé périmé, vaisseau
// inconnu…). Décisions de l’auteur (9 nov. 2026) :
//   - alerte au 3e écart INEXPLIQUÉ sur une même règle (SEUIL), jamais au premier ;
//   - l'alerte s'ouvre dans l'overlay (fenêtre « vigie ») ; « Compris » la ferme et remet le compte à zéro ;
//   - « Proposer une valeur » la NOTE seulement (decisions) : la règle n'est changée que dans le code, à la session
//     suivante, contrôles compris. Jamais une valeur mal mesurée appliquée en silence.
// Seules les mesures en direct sont signalées (jamais la relecture du journal au démarrage : elle doublerait tout).
//
// Fichiers (dossier des données) :
//   - vigie.jsonl : une ligne par observation, en ajout, jamais relue pour décider (« lis les logs ») ; 5 Mo au plus,
//     l'ancien passe en vigie.1.jsonl ;
//   - vigie-etat.json : compteurs par règle, alertes, propositions, comptes par jour, réglage (écrit d'un coup,
//     core/atomic.js).
//
// Outil de développement (15 nov. 2026) : coupée par défaut chez tout le monde. Allumée seulement par le réglage
// (Paramètres → « Vigie des règles (outil de développement) », noté dans vigie-etat.json) ou, sans choix enregistré,
// par ELITE_VIGIE=1. Coupée, elle note encore ses observations, mais n'ouvre jamais de fenêtre en jeu.

import fs from 'node:fs';
import path from 'node:path';
import { isPlainObject, readJsonFile, writeJsonAtomicSync } from './atomic.js';

export const SEUIL = 3;
export const JOURNAL_MAX = 5 * 1024 * 1024;
const MAX_PROPOSITIONS = 200;
const MAX_JOURS = 60;
const MAX_TEXTE = 500;
const BLOC = 64 * 1024; // lecture du journal par la fin (observations)

/** Valeur courte et sûre pour le journal et l'état (texte borné, nombres finis, objets simples). */
function borne(v, profondeur = 0) {
  if (v == null || typeof v === 'boolean') return v ?? null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return v.slice(0, MAX_TEXTE);
  if (profondeur > 2) return null;
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => borne(x, profondeur + 1));
  if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).slice(0, 20).map(([k, x]) => [String(k).slice(0, 40), borne(x, profondeur + 1)]));
  return String(v).slice(0, MAX_TEXTE);
}

const jourDe = (ms) => new Date(ms).toISOString().slice(0, 10);
const mediane = (l) => {
  const s = [...l].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

export class Vigie {
  /**
   * @param {object} o
   * @param {(id: string) => object|null} o.fiche fiche du dépôt par son id (regles/index.js)
   * @param {object[]} o.fiches toutes les fiches (pour l'état de la page)
   * @param {string} o.dossier dossier des données
   * @param {(etat) => void} [o.onChange] état changé (temps réel)
   * @param {(alertes: object[]) => void} [o.onAlertes] alertes ouvertes (fenêtre de l'overlay)
   * @param {boolean} [o.actifParDefaut] allumée sans choix enregistré (ELITE_VIGIE=1) ; coupée sinon
   */
  constructor({ fiche, fiches, dossier, onChange = () => {}, onAlertes = () => {}, now = Date.now, warn = console.warn, actifParDefaut = false }) {
    this.fiche = fiche;
    this.fiches = fiches;
    this.journal = path.join(dossier, 'vigie.jsonl');
    this.etatFichier = path.join(dossier, 'vigie-etat.json');
    this.onChange = onChange;
    this.onAlertes = onAlertes;
    this.now = now;
    this.warn = warn;
    this.actifParDefaut = actifParDefaut === true;
    const lu = readJsonFile(this.etatFichier, { fallback: null, accept: (v) => isPlainObject(v) && v.version === 1, label: 'Vigie des règles' });
    this.etat = {
      version: 1,
      regles: isPlainObject(lu?.regles) ? Object.fromEntries(Object.entries(lu.regles).filter(([id]) => fiche(id))) : {},
      propositions: Array.isArray(lu?.propositions) ? lu.propositions.filter((p) => isPlainObject(p) && fiche(p.regle)).slice(-MAX_PROPOSITIONS) : [],
      jours: isPlainObject(lu?.jours) ? lu.jours : {},
      fenetreFermee: lu?.fenetreFermee === true,
      ...(typeof lu?.actif === 'boolean' ? { actif: lu.actif } : {}),
    };
  }

  /** Allumée : choix enregistré du joueur, sinon ELITE_VIGIE=1. */
  actif() {
    return typeof this.etat.actif === 'boolean' ? this.etat.actif : this.actifParDefaut;
  }

  /** Réglage (Paramètres) : { actif, parDefaut }. */
  reglage() {
    return { actif: this.actif(), parDefaut: this.actifParDefaut };
  }

  /** Allume ou coupe la vigie (Paramètres). Coupée, sa fenêtre en jeu se ferme ; allumée, elle s'ouvre s'il y a une alerte. */
  regler(actif) {
    this.etat.actif = actif === true;
    this.enregistrer();
    this.onChange(this.vue());
    this.onAlertes(this.alertes());
    return this.reglage();
  }

  regle(id) {
    if (typeof id !== 'string' || id === '__proto__' || id === 'constructor' || id === 'prototype') throw new TypeError('Identifiant de règle invalide.');
    if (!Object.hasOwn(this.etat.regles, id)) this.etat.regles[id] = { total: 0, conformes: 0, expliques: 0, ecarts: 0, ecartsDepuis: 0, recents: [], dernier: null, alerte: null };
    return this.etat.regles[id];
  }

  /**
   * Une mesure en direct. Rend l'observation notée, ou null si la règle est inconnue (avertissement, rien de noté).
   * @param {{ regle: string, attendu: any, observe: any, ecart: boolean, explication?: string|null, details?: object }} o
   */
  observe({ regle, attendu, observe, ecart, explication = null, details = null }) {
    const f = this.fiche(regle);
    if (!f) {
      this.warn(`Vigie des règles : observation pour une règle inconnue (« ${String(regle).slice(0, 60)} »), ignorée.`);
      return null;
    }
    const t = this.now();
    const obs = { at: new Date(t).toISOString(), regle, attendu: borne(attendu), observe: borne(observe), ecart: ecart === true, explication: explication ? String(explication).slice(0, MAX_TEXTE) : null, details: borne(details) };
    const r = this.regle(regle);
    r.total += 1;
    r.dernier = obs;
    const inexplique = obs.ecart && !obs.explication;
    if (!obs.ecart) r.conformes += 1;
    else if (obs.explication) r.expliques += 1;
    else {
      r.ecarts += 1;
      r.ecartsDepuis += 1;
      r.recents = [...r.recents, obs.observe].slice(-10);
    }
    const jour = jourDe(t);
    const j = (this.etat.jours[jour] ||= {});
    const c = (j[regle] ||= { observations: 0, ecarts: 0, expliques: 0 });
    c.observations += 1;
    if (inexplique) c.ecarts += 1;
    else if (obs.ecart) c.expliques += 1;
    const jours = Object.keys(this.etat.jours).sort();
    for (const vieux of jours.slice(0, Math.max(0, jours.length - MAX_JOURS))) delete this.etat.jours[vieux];
    let nouvelle = false;
    if (inexplique && r.ecartsDepuis >= SEUIL && !r.alerte) {
      const nums = r.recents.filter((x) => typeof x === 'number');
      r.alerte = { at: obs.at, ecarts: r.ecartsDepuis, attendu: obs.attendu, valeurEstimee: nums.length ? mediane(nums) : obs.observe };
      nouvelle = true;
    } else if (r.alerte) r.alerte.ecarts = r.ecartsDepuis;
    if (nouvelle) this.etat.fenetreFermee = false;
    this.ajouterAuJournal(obs);
    this.enregistrer();
    this.onChange(this.vue());
    if (nouvelle) this.onAlertes(this.alertes());
    return obs;
  }

  /** « Compris » : l'alerte se ferme, le compte d'écarts inexpliqués repart de zéro. */
  compris(id) {
    if (!this.fiche(id)) return null;
    const r = this.regle(id);
    r.alerte = null;
    r.ecartsDepuis = 0;
    r.recents = [];
    this.enregistrer();
    this.onChange(this.vue());
    this.onAlertes(this.alertes());
    return this.vue();
  }

  /** Valeur proposée par l’auteur : notée seulement (décision 4B du 9 nov. 2026), à appliquer dans le code. */
  proposer(id, { valeur, note = '' }) {
    if (!this.fiche(id)) return null;
    this.etat.propositions = [...this.etat.propositions, { at: new Date(this.now()).toISOString(), regle: id, valeur: borne(valeur), note: String(note || '').slice(0, MAX_TEXTE), appliquee: false }].slice(-MAX_PROPOSITIONS);
    this.enregistrer();
    this.onChange(this.vue());
    return this.vue();
  }

  /** ✕ de la fenêtre en jeu : fermée jusqu'à la prochaine nouvelle alerte. */
  fermerFenetre() {
    this.etat.fenetreFermee = true;
    this.enregistrer();
    this.onAlertes(this.alertes());
  }

  alertes() {
    return Object.entries(this.etat.regles).filter(([, r]) => r.alerte).map(([id, r]) => {
      const f = this.fiche(id);
      return { regle: id, titre: f.titre, domaine: f.domaine, valeur: f.valeur, unite: f.unite || null, ...r.alerte };
    });
  }

  /** Fenêtre de l'overlay ouverte : vigie allumée, au moins une alerte, et pas fermée par ✕ depuis la dernière nouvelle. */
  fenetreOuverte() {
    return this.actif() && !this.etat.fenetreFermee && this.alertes().length > 0;
  }

  /** État pour la page : chaque fiche avec ses compteurs, les alertes, les propositions. */
  vue() {
    return {
      actif: this.actif(),
      seuil: SEUIL,
      alertes: this.alertes(),
      propositions: this.etat.propositions,
      regles: Object.fromEntries(Object.entries(this.etat.regles).map(([id, r]) => [id, { total: r.total, conformes: r.conformes, expliques: r.expliques, ecarts: r.ecarts, ecartsDepuis: r.ecartsDepuis, dernier: r.dernier, alerte: r.alerte }])),
    };
  }

  /** Résumé d'un jour, en français, pour « lis les logs » : règles observées, écarts, explications. */
  resume(jour = jourDe(this.now())) {
    const j = this.etat.jours[jour];
    if (!j) return `Vigie des règles, ${jour} : aucune observation.`;
    const lignes = Object.entries(j).sort(([a], [b]) => a.localeCompare(b)).map(([id, c]) => {
      const f = this.fiche(id);
      const r = this.etat.regles[id];
      const ecarts = c.ecarts ? `, ${c.ecarts} écart(s) inexpliqué(s)` : '';
      const expl = c.expliques ? `, ${c.expliques} expliqué(s)` : '';
      return `- ${f?.titre || id} (${id}) : ${c.observations} observation(s)${ecarts}${expl}${r?.alerte ? ' — ALERTE en cours' : ''}`;
    });
    return [`Vigie des règles, ${jour} :`, ...lignes].join('\n');
  }

  /** Dernières observations du journal (lecture pour la page), de la plus récente à la plus ancienne. */
  // Lu par la fin, morceau par morceau (BLOC octets) : on s'arrête dès qu'il y a assez d'observations, sans relire les
  // 5 Mo du journal à chaque demande. Les lignes sont coupées sur l'octet « \n », sûr en UTF-8.
  observations({ regle = null, limite = 100 } = {}) {
    let fd;
    try {
      fd = fs.openSync(this.journal, 'r');
    } catch {
      return [];
    }
    const out = [];
    const prendre = (ligne) => {
      if (!ligne.length) return;
      try {
        const o = JSON.parse(ligne.toString('utf8'));
        if (!regle || o.regle === regle) out.push(o);
      } catch {
        // ligne coupée : ignorée
      }
    };
    try {
      let pos = fs.fstatSync(fd).size;
      let reste = Buffer.alloc(0); // début de ligne pas encore complet (son début est plus haut dans le fichier)
      while (pos > 0 && out.length < limite) {
        const n = Math.min(BLOC, pos);
        pos -= n;
        const morceau = Buffer.alloc(n);
        fs.readSync(fd, morceau, 0, n, pos);
        const buf = Buffer.concat([morceau, reste]);
        let fin = buf.length;
        for (let i = buf.length - 1; i >= 0 && out.length < limite; i--) {
          if (buf[i] !== 0x0a) continue;
          prendre(buf.subarray(i + 1, fin));
          fin = i;
        }
        reste = buf.subarray(0, fin);
      }
      if (pos === 0 && out.length < limite) prendre(reste); // première ligne du fichier
    } catch {
      // journal illisible en cours de route : ce qui a été lu
    } finally {
      fs.closeSync(fd);
    }
    return out;
  }

  ajouterAuJournal(obs) {
    try {
      fs.mkdirSync(path.dirname(this.journal), { recursive: true });
      let taille = 0;
      try {
        taille = fs.statSync(this.journal).size;
      } catch {
        // pas encore de journal
      }
      if (taille > JOURNAL_MAX) fs.renameSync(this.journal, this.journal.replace(/\.jsonl$/, '.1.jsonl'));
      fs.appendFileSync(this.journal, `${JSON.stringify(obs)}\n`);
    } catch (err) {
      this.warn(`Vigie des règles : journal non écrit (${err.message}).`);
    }
  }

  enregistrer() {
    try {
      writeJsonAtomicSync(this.etatFichier, this.etat);
    } catch (err) {
      this.warn(`Vigie des règles : état non enregistré (${err.message}).`);
    }
  }
}

/**
 * Routes du réglage (Paramètres → Vigie des règles) : GET /api/vigie/reglage, et PUT avec { actif: true | false }.
 * Montées sur l'app, après la garde de l'API locale (en-tête X-Elite-Compagnon exigé pour écrire) et le lecteur JSON.
 */
export function monterReglageVigie(app, vigie) {
  app.get('/api/vigie/reglage', (req, res) => res.json(vigie.reglage()));
  app.put('/api/vigie/reglage', (req, res) => {
    if (typeof req.body?.actif !== 'boolean') return res.status(400).json({ error: 'Réglage invalide : { actif: true ou false } attendu.' });
    res.json(vigie.regler(req.body.actif));
  });
}

/** Demande de proposition vérifiée ({ valeur, note }), ou un message d'erreur en français. */
export function propositionInvalide(body) {
  if (!isPlainObject(body) || !Object.hasOwn(body, 'valeur')) return 'Proposition invalide : { valeur, note } attendu.';
  if (JSON.stringify(body.valeur ?? null).length > 2000) return 'Valeur trop longue (2 000 caractères au plus).';
  if (body.note != null && (typeof body.note !== 'string' || body.note.length > MAX_TEXTE)) return `Note invalide : un texte de ${MAX_TEXTE} caractères au plus.`;
  return null;
}
