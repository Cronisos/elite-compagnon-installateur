// Projet de colonisation de l'escadron, côté membre : l'app lit le projet que le chef a publié sur le serveur de
// l'escadron (systèmes, chantiers dans l'ordre de priorité, relevé du dépôt de chacun) et y envoie le relevé du dépôt
// des chantiers de ces systèmes quand le sien est plus récent. Seul le plus récent compte : un membre qui passe au
// chantier met à jour la liste de courses de tous.
//
// Opt-in, comme le reste de l'escadron : aucun appel tant que le joueur n'a pas rejoint l'escadron et activé le
// projet (page Colonisation). Ce qui part, pour les seuls chantiers des systèmes du projet (jamais les autres) : le
// MarketID, le système et le nom du chantier, l'heure du relevé, son avancement et ses marchandises (demandé, livré
// par tous les CMDR). Le serveur sait qui l'envoie (le jeton), et les autres membres le voient (« relevé par … »).
// Une lecture provisoire (tes livraisons ajoutées en attendant le dépôt) ne part jamais : seulement ce que le jeu a écrit.

import path from 'node:path';
import { readJson, writeJsonAtomic } from './store.js';

export const FICHIER_COLONISATION = 'escadron-colonisation.json';
const DELAI_MS = 15_000;
const FRAICHEUR_MS = 30_000; // relu au plus toutes les 30 s quand une page le demande
const MAX_ENVOIS = 10; // relevés envoyés par passage : le reste au passage suivant
const RAFRAICHIR_MS = 30 * 60_000; // même contenu que le serveur : renvoyé seulement si son relevé a plus de 30 min
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
const ms = (v) => (typeof v === 'string' ? Date.parse(v) : NaN);
const entier = (n) => Number.isInteger(n) && n >= 0;
const texte = (v, max) => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null);

function erreur(status, message) {
  return Object.assign(new Error(message), { status, publicMessage: message });
}

/** Ce que le serveur rend, relu sans confiance : { projet, version, updatedAt, releves }. */
export function lectureServeur(r) {
  const p = r?.projet;
  const systems = Array.isArray(p?.systems) ? p.systems.map((s) => texte(s, 64)).filter(Boolean).slice(0, 10) : [];
  if (!systems.length) return { projet: null, version: null, updatedAt: null, releves: [] };
  const sites = (Array.isArray(p.sites) ? p.sites : [])
    .filter((s) => Number.isSafeInteger(s?.marketId) && s.marketId > 0 && typeof s.system === 'string')
    .slice(0, 40)
    .map((s) => ({ marketId: s.marketId, system: s.system.slice(0, 64), name: texte(s.name, 100) }));
  const releves = (Array.isArray(r.releves) ? r.releves : [])
    .filter((x) => Number.isSafeInteger(x?.marketId) && x.marketId > 0 && TIMESTAMP.test(x.at ?? '') && Array.isArray(x.resources))
    .slice(0, 100)
    .map((x) => ({
      marketId: x.marketId, system: texte(x.system, 64), station: texte(x.station, 100), at: x.at,
      progress: typeof x.progress === 'number' && x.progress >= 0 && x.progress <= 1 ? x.progress : null,
      complete: x.complete === true, failed: x.failed === true,
      resources: x.resources.filter((m) => typeof m?.symbol === 'string' && entier(m.required) && entier(m.provided)).slice(0, 60)
        .map((m) => ({ symbol: m.symbol.slice(0, 48), name: texte(m.name, 64), required: m.required, provided: m.provided })),
      cmdr: texte(x.cmdr, 64), receivedAt: typeof x.receivedAt === 'string' ? x.receivedAt : null,
    }));
  return {
    projet: { systems, sites },
    version: Number.isInteger(r.version) ? r.version : null,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : null,
    releves,
  };
}

/** Heure d'un chantier suivi ici : sa dernière lecture du dépôt, ou sa fin si elle est plus récente (fin déduite de l'amarrage). */
export function heureLocale(site) {
  const lu = ms(site?.updatedAt);
  const fin = site?.complete ? ms(site.completedAt) : NaN;
  const t = Math.max(Number.isFinite(lu) ? lu : -Infinity, Number.isFinite(fin) ? fin : -Infinity);
  return Number.isFinite(t) ? t : null;
}

/** Relevé à envoyer pour un chantier suivi ici, ou null (jamais lu, ou lecture provisoire). */
export function releveDe(site) {
  const t = heureLocale(site);
  if (t == null || !site.system || (site.provisional && !site.complete)) return null;
  const resources = (site.resources || []).filter((r) => typeof r.symbol === 'string' && entier(r.required) && entier(r.provided))
    .map((r) => ({ symbol: r.symbol, ...(texte(r.name, 64) ? { name: texte(r.name, 64) } : {}), required: r.required, provided: r.provided }));
  if (!resources.length && !site.complete) return null;
  return {
    marketId: site.marketId, system: site.system.slice(0, 64), at: iso(t), ...(texte(site.station, 100) ? { station: texte(site.station, 100) } : {}),
    progress: typeof site.progress === 'number' ? Math.min(1, Math.max(0, site.progress)) : null,
    complete: site.complete === true, failed: site.failed === true, resources,
  };
}

/** Même contenu (avancement, fin, marchandises) : rien de neuf pour l'escadron. */
const contenu = (r) => JSON.stringify([r.progress, r.complete, r.failed, [...r.resources].sort((a, b) => (a.symbol < b.symbol ? -1 : 1)).map((m) => [m.symbol, m.required, m.provided])]);

export class ColonisationEscadron {
  /**
   * @param acces  () => ({ base, token }) d'après le capteur (serveur et jeton du joueur, ou null)
   * @param source async (systèmes) => chantiers suivis ici dans ces systèmes (API locale du module Colonisation)
   * @param chef   () => ce PC gère-t-il le serveur (page : bouton « Modifier le projet ») ?
   */
  constructor({ dir, fetch, acces, source = async () => [], chef = () => false, now = Date.now, onChange = () => {} }) {
    this.fichier = path.join(dir, FICHIER_COLONISATION);
    this.fetch = fetch;
    this.acces = acces;
    this.source = source;
    this.chef = chef;
    this.now = now;
    this.onChange = onChange;
    this.enCours = null;
    const lu = readJson(this.fichier) || {};
    const serveur = lectureServeur(lu);
    this.etat = {
      actif: lu.actif === true,
      serveur: typeof lu.serveur === 'string' ? lu.serveur : null, // le serveur d'où vient ce qui est gardé ici
      ...serveur,
      luAt: typeof lu.luAt === 'string' ? lu.luAt : null,
      attente: lu.attente === true,
      // Dernier relevé envoyé, par chantier : heure du journal (pour la page ; c'est le serveur qui dit s'il a plus récent)
      envoyes: lu.envoyes && typeof lu.envoyes === 'object' && !Array.isArray(lu.envoyes)
        ? Object.fromEntries(Object.entries(lu.envoyes).filter(([k, v]) => /^\d{1,16}$/.test(k) && TIMESTAMP.test(String(v))).slice(0, 200)) : {},
      envoiAt: typeof lu.envoiAt === 'string' ? lu.envoiAt : null,
      erreur: null,
    };
  }

  enregistrer() {
    const { erreur: _, ...garde } = this.etat;
    writeJsonAtomic(this.fichier, garde);
    this.onChange();
  }

  /** Changement de serveur (autre escadron) : son projet et ses relevés ne restent pas. */
  oublierSiAutreServeur() {
    const a = this.acces();
    if (this.etat.serveur && (!a?.base || a.base !== this.etat.serveur)) {
      Object.assign(this.etat, { serveur: null, projet: null, version: null, updatedAt: null, releves: [], luAt: null, attente: false, envoyes: {}, envoiAt: null });
      this.enregistrer();
    }
  }

  view() {
    this.oublierSiAutreServeur();
    const a = this.acces();
    const e = this.etat;
    return {
      actif: e.actif,
      pret: Boolean(a?.base && a?.token), // escadron rejoint (page « Rejoindre l'escadron »)
      chef: Boolean(this.chef()),
      attente: e.attente,
      projet: e.projet,
      version: e.version,
      updatedAt: e.updatedAt,
      releves: e.releves,
      luAt: e.luAt,
      envoiAt: e.envoiAt,
      envoyes: Object.keys(e.envoyes).length,
      erreur: e.erreur,
    };
  }

  activer(actif) {
    if (typeof actif !== 'boolean') throw erreur(400, 'actif : vrai ou faux.');
    this.etat.actif = actif;
    this.etat.erreur = null;
    this.enregistrer();
  }

  exiger() {
    const a = this.acces();
    if (!a?.base || !a?.token) throw erreur(409, 'Rejoins d’abord ton escadron (code de l’escadron) : le projet passe par son serveur.');
    if (!this.etat.actif) throw erreur(409, 'Active d’abord le projet de l’escadron (page Colonisation).');
    return a;
  }

  async appel(quoi, method, chemin, json) {
    const a = this.exiger();
    let res;
    try {
      res = await this.fetch(`${a.base}${chemin}`, {
        method,
        headers: { authorization: `Bearer ${a.token}`, ...(json ? { 'content-type': 'application/json' } : {}) },
        body: json ? JSON.stringify(json) : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(DELAI_MS),
      });
    } catch {
      throw erreur(502, `Serveur de l’escadron injoignable (${quoi}).`);
    }
    if (res.status === 401) throw erreur(409, 'Le serveur de l’escadron refuse ton jeton : rejoins de nouveau l’escadron.');
    if (res.status === 403) {
      this.etat.attente = true;
      throw erreur(409, 'Cette installation doit d’abord être confirmée : depuis une autre installation à ton nom, ou par le chef de l’escadron.');
    }
    if (res.status === 404 || res.status === 405) throw erreur(409, `Le serveur de l’escadron ne sait pas « ${quoi} » : il date d’avant le projet de colonisation, le chef doit le mettre à jour (page du chef, étape 1).`);
    if (res.status === 409) return { horsProjet: true }; // chantier sorti du projet entre-temps
    if (res.status === 429) throw erreur(429, 'Trop d’appels au serveur de l’escadron : réessaie dans une minute.');
    if (!res.ok) throw erreur(502, `Le serveur de l’escadron refuse « ${quoi} » (erreur ${res.status}).`);
    return res.json();
  }

  /** Lit le projet et les relevés, puis envoie les relevés d'ici plus récents que ceux du serveur. Un passage à la fois. */
  passage() {
    this.enCours ??= this.#passage().finally(() => {
      this.enCours = null;
    });
    return this.enCours;
  }

  async #passage() {
    this.oublierSiAutreServeur();
    const a = this.exiger();
    try {
      await this.#lire(a);
      if (this.etat.projet && (await this.#envoyer())) await this.#lire(a);
      this.etat.erreur = null;
    } catch (err) {
      this.etat.erreur = err.publicMessage || 'Lecture impossible.';
      this.enregistrer();
      throw err;
    }
    this.enregistrer();
    return this.view();
  }

  async #lire(a) {
    const r = lectureServeur(await this.appel('lire le projet de colonisation', 'GET', '/v1/colonisation'));
    Object.assign(this.etat, r, { serveur: a.base, attente: false, luAt: iso(this.now()) });
    // Chantiers sortis du projet : plus rien à retenir de ce qui leur a été envoyé
    const dans = new Set((r.projet?.systems ?? []).map((s) => s.toLowerCase()));
    if (!dans.size) this.etat.envoyes = {};
  }

  /** Envoie ce qui est plus récent ici que sur le serveur ; rend le nombre de relevés envoyés. */
  async #envoyer() {
    const systemes = this.etat.projet.systems;
    const dans = new Set(systemes.map((s) => s.toLowerCase()));
    const chantiers = (await this.source(systemes)).filter((s) => s && dans.has(String(s.system ?? '').toLowerCase()));
    const serveur = new Map(this.etat.releves.map((r) => [r.marketId, r]));
    let envoyes = 0;
    for (const site of chantiers) {
      if (envoyes >= MAX_ENVOIS) break;
      const r = releveDe(site);
      if (!r) continue;
      const la = serveur.get(r.marketId);
      if (la && ms(la.at) >= ms(r.at)) continue; // le serveur a plus récent (ou le même)
      if (la && contenu(la) === contenu(r) && ms(r.at) - ms(la.at) < RAFRAICHIR_MS) continue; // rien de neuf
      const res = await this.appel('envoyer un relevé de chantier', 'PUT', '/v1/colonisation/releve', r);
      if (res?.horsProjet) continue;
      this.etat.envoyes[r.marketId] = r.at;
      this.etat.envoiAt = iso(this.now());
      envoyes++;
    }
    return envoyes;
  }

  /** Passage en arrière-plan (minuterie, relevé du dépôt écrit par le jeu) : seulement si le projet est activé ici. */
  enFond() {
    const a = this.acces();
    if (!this.etat.actif || !a?.base || !a?.token) return Promise.resolve(null);
    return this.passage().catch(() => null);
  }

  /** Passage demandé par la page : tout de suite, sauf si le dernier a moins de 30 s (deux pages ouvertes). */
  async lire({ force = false } = {}) {
    const age = this.etat.luAt ? this.now() - Date.parse(this.etat.luAt) : Infinity;
    if (!force && age < FRAICHEUR_MS && !this.etat.erreur) return this.view();
    return this.passage();
  }
}
