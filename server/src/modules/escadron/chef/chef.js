// Côté gestion du serveur de l'escadron, sans console : le monter sur un compte Cloudflare (le chef, ou un membre pour tout
// l'escadron), ou reprendre un serveur existant ; installer le suivi Discord sur GitHub ; tenir la route à jour sur le
// serveur ; gérer les membres et le code de l'escadron. Les clés Cloudflare et GitHub collées dans la page ne servent
// que le temps de l'opération et ne sont jamais gardées.
//
// Gardé sur ce PC, dans son propre fichier (escadron-chef.json, jamais renvoyé à la page en dehors du code de gestion
// demandé exprès, jamais distribué) : l'adresse du serveur, la clé de chef (ADMIN_TOKEN : membres, route), la clé du
// suivi (TRACKER_TOKEN) et le mot de passe de l'escadron (il est dans le code posté pour tous).

import crypto from 'node:crypto';
import path from 'node:path';
import { changerMotDePasse, changerSecret, erreurPublique, monterServeur } from './cloudflare.js';
import { installerSuivi } from './github.js';
import { codeEscadron, codeGestion, lireCodeGestion } from '../code.js';
import { readJson, writeJsonAtomic } from '../store.js';
import { userHostError } from '../../../core/net.js';

export const FICHIER_CHEF = 'escadron-chef.json';
const DELAI_MS = 15_000;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
export const OBJECTIFS = { Prise: 480_000, 'Consolidé': 1_880_000, Forteresse: 4_480_000 }; // mérites, à 4 par point
const SPANSH = 'https://spansh.co.uk/api/search?q=';
const nouvelleCle = () => crypto.randomBytes(32).toString('base64url');
const CLE = /^[\w-]{20,200}$/;

/** Mot de passe de l'escadron : 8 à 200 caractères. */
export function verifierMotDePasse(v) {
  if (typeof v !== 'string' || v.length < 8 || v.length > 200) {
    throw erreurPublique(400, 'Mot de passe de l’escadron : au moins 8 caractères (12 ou plus, c’est mieux).');
  }
  return v;
}

/** Adresse d'un serveur d'escadron : https, nom public, origine seule ; sinon erreur 400. */
export function adresseServeur(v) {
  let u;
  try {
    u = new URL(String(v ?? '').trim());
  } catch {
    throw erreurPublique(400, 'Adresse du serveur illisible (« https://….workers.dev »).');
  }
  const err = u.protocol !== 'https:' || u.port || u.username || u.search ? 'https, sans port ni paramètre' : userHostError(u.hostname);
  if (err) throw erreurPublique(400, `Adresse du serveur : ${err}.`);
  return `https://${u.hostname.toLowerCase()}`;
}

/** Lien de webhook Discord, normalisé sur discord.com ; sinon erreur 400. */
export function webhookValide(v) {
  const m = typeof v === 'string' && v.trim().match(/^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/(\d{5,25})\/([\w-]{20,120})\/?$/);
  if (!m) throw erreurPublique(400, 'Lien du webhook illisible : dans Discord, Modifier le salon, Intégrations, Webhooks, puis « Copier l’URL du webhook ».');
  return `https://discord.com/api/webhooks/${m[1]}/${m[2]}`;
}

/** Route du suivi (format du Squadron Tracker), vérifiée et nettoyée ; sinon erreur 400. */
export function routeValide(r) {
  const err = (m) => erreurPublique(400, `Route : ${m}`);
  if (!r || typeof r !== 'object') throw err('illisible.');
  const texte = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
  if (!texte(r.power, 64)) throw err('la puissance manque.');
  if (!TIMESTAMP.test(r.since ?? '')) throw err('date de début illisible.');
  if (!Array.isArray(r.stops) || r.stops.length === 0 || r.stops.length > 80) throw err('de 1 à 80 systèmes.');
  const vus = new Set();
  const stops = r.stops.map((s, i) => {
    if (!texte(s?.name, 64)) throw err(`système ${i + 1} sans nom.`);
    if (vus.has(s.name.toLowerCase())) throw err(`${s.name} est deux fois sur la route.`);
    vus.add(s.name.toLowerCase());
    if (!Object.hasOwn(OBJECTIFS, s.goal)) throw err(`objectif de ${s.name} : Prise, Consolidé ou Forteresse.`);
    const merits = Number.isInteger(s.merits) && s.merits > 0 && s.merits <= 50_000_000 ? s.merits : OBJECTIFS[s.goal];
    return { name: s.name, goal: s.goal, merits, ...(texte(s.short, 32) ? { short: s.short } : {}), ...(s.noLarge === true ? { noLarge: true } : {}) };
  });
  return {
    title: texte(r.title, 60) ? r.title : 'ROUTE DE L’ESCADRON',
    subtitle: texte(r.subtitle, 80) ? r.subtitle : '',
    power: r.power,
    meritsPerPoint: 4,
    since: r.since,
    theme: r.theme === 'prism' ? 'prism' : 'orange',
    stops,
  };
}

/**
 * Projet de colonisation de l'escadron, saisi par le chef : { systems: [nom], sites: [{ marketId, system, name? }] }
 * (sites dans l'ordre de priorité, chacun dans un système du projet). Vérifié et nettoyé au format du serveur ; sinon
 * erreur 400. Les noms de systèmes sont comparés sans tenir compte de la casse, comme ceux du journal.
 */
export function colonisationValide(p) {
  const err = (m) => erreurPublique(400, `Projet de colonisation : ${m}`);
  if (!p || typeof p !== 'object') throw err('illisible.');
  const texte = (v, max) => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null);
  if (!Array.isArray(p.systems) || p.systems.length === 0 || p.systems.length > 10) throw err('de 1 à 10 systèmes.');
  const parNom = new Map();
  p.systems.forEach((s, i) => {
    const nom = texte(s, 64);
    if (!nom) throw err(`système ${i + 1} sans nom (64 caractères au plus).`);
    if (parNom.has(nom.toLowerCase())) throw err(`${nom} est deux fois dans le projet.`);
    parNom.set(nom.toLowerCase(), nom);
  });
  const liste = p.sites ?? [];
  if (!Array.isArray(liste) || liste.length > 40) throw err('40 chantiers au plus.');
  const ids = new Set();
  const sites = liste.map((s, i) => {
    if (!Number.isSafeInteger(s?.marketId) || s.marketId <= 0) throw err(`chantier ${i + 1} sans MarketID.`);
    if (ids.has(s.marketId)) throw err(`le chantier ${s.marketId} est deux fois dans les priorités.`);
    ids.add(s.marketId);
    const system = parNom.get(String(texte(s.system, 64) ?? '').toLowerCase());
    if (!system) throw err(`le chantier ${texte(s.name, 100) ?? s.marketId} n'est dans aucun système du projet.`);
    const name = texte(s.name, 100);
    return { marketId: s.marketId, system, ...(name ? { name } : {}) };
  });
  return { systems: [...parNom.values()], sites };
}

export class Chef {
  /** `allowHost(hôte|null)` : ajoute le serveur géré à la liste blanche de la passerelle (core/net.js). */
  constructor({ dir, fetch, allowHost = () => {}, now = Date.now }) {
    this.file = path.join(dir, FICHIER_CHEF);
    this.fetch = fetch;
    this.allowHost = allowHost;
    this.now = now;
    this.etat = readJson(this.file) ?? {};
    this.etapeEnCours = null;
    this.occupe = false;
    this.pauseSpansh = 250; // entre deux demandes à Spansh (0 dans les tests)
    if (this.etat.url) this.autoriser();
  }

  autoriser() {
    try {
      this.allowHost(new URL(this.etat.url).hostname);
    } catch {
      this.etat.url = null;
    }
  }

  enregistrer() {
    writeJsonAtomic(this.file, this.etat);
  }

  /** Ce que la page voit : le code de l'escadron (fait pour être partagé), jamais les clés. */
  view() {
    const e = this.etat;
    return {
      serveur: e.url ? { url: e.url, compte: e.compte ?? null, depuis: e.monteLe ?? null, monteIci: Boolean(e.compte), ancien: Boolean(e.ancien) } : null,
      code: e.url && e.motDePasse ? codeEscadron(e.url, e.motDePasse) : null,
      cleSuivi: Boolean(e.trackerToken),
      suivi: e.depot ? { depot: e.depot, adresse: e.depotAdresse ?? null, depuis: e.suiviLe ?? null } : null,
      route: e.routeEnvoyee ?? null,
      colonisation: e.colonisationEnvoyee ?? null,
      occupe: this.occupe,
      etape: this.etapeEnCours,
    };
  }

  /** Une opération à la fois (deux clics ne lancent pas deux installations). */
  async seul(fn) {
    if (this.occupe) throw erreurPublique(409, 'Une opération est déjà en cours : attends qu’elle finisse.');
    this.occupe = true;
    try {
      return await fn();
    } finally {
      this.occupe = false;
      this.etapeEnCours = null;
    }
  }

  /**
   * Monte ou met à jour le serveur. Les clés de chef et du suivi déjà connues ici sont gardées : un serveur repris puis
   * remonté garde ses clés, et sa carte Discord continue. Un serveur en place dont ce PC n'a pas les clés n'est
   * remplacé que sur confirmation (`remplacer`), car ses clés changeront.
   */
  async monter({ cloudflare, motDePasse, sousDomaine, remplacer = false }) {
    const mdp = verifierMotDePasse(motDePasse);
    return this.seul(async () => {
      const e = this.etat;
      const connues = Boolean(e.adminToken && e.trackerToken);
      const secrets = { ADMIN_TOKEN: e.adminToken ?? nouvelleCle(), TRACKER_TOKEN: e.trackerToken ?? nouvelleCle(), JOIN_PASSWORD: mdp };
      const r = await monterServeur({
        fetch: this.fetch, token: cloudflare, secrets, sousDomaine: sousDomaine || null, remplacer: remplacer === true || connues,
        etape: (t) => { this.etapeEnCours = t; },
      });
      // Autre serveur, ou serveur remplacé avec de nouvelles clés : la carte installée ne marche plus avec elles
      if ((e.url && e.url !== r.url) || (r.existait && !connues)) Object.assign(e, { depot: null, depotAdresse: null, routeEnvoyee: null });
      Object.assign(e, {
        url: r.url, compte: r.compte, monteLe: new Date(this.now()).toISOString(),
        adminToken: secrets.ADMIN_TOKEN, trackerToken: secrets.TRACKER_TOKEN, motDePasse: mdp,
      });
      delete e.ancien;
      this.enregistrer();
      this.autoriser();
      return this.view();
    });
  }

  /**
   * Reprendre un serveur existant (monté par quelqu'un d'autre, ou à la main) : code de gestion, ou adresse + clé de chef
   * (+ clé du suivi et mot de passe, facultatifs). La clé est vérifiée auprès du serveur avant d'être gardée.
   */
  async relier({ code, url, cleChef, cleSuivi, motDePasse }) {
    const g = code ? lireCodeGestion(code) : { url, adminToken: cleChef, trackerToken: cleSuivi || null, motDePasse: motDePasse || null };
    if (!g) throw erreurPublique(400, 'Code de gestion illisible : il commence par « EGC1. ».');
    const adresse = adresseServeur(g.url);
    if (!CLE.test(g.adminToken ?? '')) throw erreurPublique(400, 'Clé de chef illisible (la valeur de ADMIN_TOKEN).');
    if (g.trackerToken && !CLE.test(g.trackerToken)) throw erreurPublique(400, 'Clé du suivi illisible (la valeur de TRACKER_TOKEN).');
    if (g.motDePasse) verifierMotDePasse(g.motDePasse);
    const avant = this.etat;
    this.etat = { url: adresse, adminToken: g.adminToken, trackerToken: g.trackerToken, motDePasse: g.motDePasse };
    this.autoriser();
    try {
      await this.membres(); // la clé de chef marche-t-elle ?
    } catch (err) {
      // Serveur d'avant cette version (monté à la main) : il ne sait pas répondre, donc la clé ne peut pas être
      // vérifiée. On la garde quand même, marquée « ancien » : le remonter (étape 1) repose ces mêmes clés sur le
      // serveur, et la carte Discord comme les jetons des membres continuent de marcher.
      if (err.status !== 409) {
        this.etat = avant;
        if (avant.url) this.autoriser();
        throw err;
      }
      this.etat.ancien = true;
    }
    this.enregistrer();
    return this.view();
  }

  /** Code de gestion : tous les droits sur le serveur, à ne passer qu'à qui gère avec toi. */
  codeGestion() {
    this.exigerServeur();
    const e = this.etat;
    return codeGestion({ url: e.url, adminToken: e.adminToken, trackerToken: e.trackerToken, motDePasse: e.motDePasse });
  }

  /** Ce PC ne gère plus ce serveur (le serveur, lui, continue). */
  oublier() {
    this.etat = {};
    this.enregistrer();
    this.allowHost(null);
    return this.view();
  }

  exigerServeur() {
    if (!this.etat.url || !this.etat.adminToken) throw erreurPublique(409, 'Monte ou reprends d’abord le serveur de l’escadron (étape 1).');
  }

  /** Le serveur répond-il ? (une adresse workers.dev neuve peut mettre quelques minutes à exister) */
  async enLigne() {
    this.exigerServeur();
    try {
      const res = await this.fetch(`${this.etat.url}/v1/merits`, { redirect: 'manual', signal: AbortSignal.timeout(DELAI_MS) });
      res.body?.cancel?.().catch?.(() => {});
      return res.status === 404 || res.status === 405 || res.status === 401;
    } catch {
      return false;
    }
  }

  /** Appel au serveur avec la clé de chef. */
  async admin(quoi, method, chemin, json) {
    this.exigerServeur();
    let res;
    try {
      res = await this.fetch(`${this.etat.url}${chemin}`, {
        method,
        headers: { authorization: `Bearer ${this.etat.adminToken}`, ...(json ? { 'content-type': 'application/json' } : {}) },
        body: json ? JSON.stringify(json) : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(DELAI_MS),
      });
    } catch {
      throw erreurPublique(502, `Serveur de l’escadron injoignable (${quoi}).`);
    }
    if (res.status === 401) throw erreurPublique(400, 'Le serveur refuse la clé de chef : vérifie-la, ou remonte le serveur depuis ce PC.');
    if (res.status === 404 || res.status === 405) throw erreurPublique(409, `Le serveur ne sait pas « ${quoi} » : il date d’avant cette version, remonte-le (étape 1).`);
    if (!res.ok) throw erreurPublique(502, `Le serveur de l’escadron refuse « ${quoi} » (erreur ${res.status}).`);
    return res.json();
  }

  async membres() {
    const r = await this.admin('lister les membres', 'GET', '/admin/members');
    return (r?.members ?? []).map((m) => ({
      cmdr: String(m.cmdr), depuis: m.created_at ?? null, installations: m.installations ?? null,
      attente: Number.isInteger(m.pending) ? m.pending : 0, role: typeof m.role === 'string' ? m.role : null,
      // Dernier mérite reçu de lui (absent d'un serveur d'avant cette version : undefined, la page n'en dit rien)
      ...(m.last_merit_at !== undefined ? { dernierEnvoi: typeof m.last_merit_at === 'string' ? m.last_merit_at : null } : {}),
    }));
  }

  /** Nouveau jeton pour un membre (plugin d'avant le code, cas particulier) : montré une fois, jamais gardé. */
  async nouveauJeton(cmdr) {
    const nom = nomCommandant(cmdr);
    const r = await this.admin('donner un jeton', 'POST', '/admin/members', { cmdr: nom });
    return { cmdr: r.cmdr, jeton: r.token };
  }

  async retirer(cmdr) {
    const nom = nomCommandant(cmdr);
    await this.admin('retirer un membre', 'DELETE', `/admin/members/${encodeURIComponent(nom)}`);
  }

  /** Les rôles de l'escadron, du plus haut au plus bas : [{ id, name, rank }]. */
  async roles() {
    const r = await this.admin('lire les rôles', 'GET', '/admin/roles');
    return Array.isArray(r?.roles) ? r.roles : [];
  }

  /**
   * Remplace la liste des rôles. Reçue dans l'ordre de la hiérarchie, du plus haut au plus bas : [{ id?, name }].
   * L'identifiant d'un rôle existant est gardé (ses membres le conservent) ; un nouveau en reçoit un d'après son nom.
   */
  async enregistrerRoles(liste) {
    const roles = rolesValides(liste);
    const r = await this.admin('enregistrer les rôles', 'PUT', '/admin/roles', { roles });
    return Array.isArray(r?.roles) ? r.roles : [];
  }

  /** Donne un rôle à un membre (identifiant du rôle), ou le lui retire (null). */
  async donnerRole(cmdr, role) {
    const nom = nomCommandant(cmdr);
    if (role !== null && !(typeof role === 'string' && ID_ROLE.test(role))) throw erreurPublique(400, 'Rôle inconnu.');
    await this.admin('donner un rôle', 'PUT', `/admin/members/${encodeURIComponent(nom)}/role`, { role });
  }

  /** Confirme les installations en attente d'un membre : elles accèdent aux partages. */
  async confirmerInstallations(cmdr) {
    const nom = nomCommandant(cmdr);
    await this.admin('confirmer ses installations', 'POST', `/admin/members/${encodeURIComponent(nom)}/approve`);
  }

  /** Couper les installations d'un membre (jetons du code) sans toucher à ses mérites : il rejoint de nouveau. */
  async couperInstallations(cmdr) {
    const nom = nomCommandant(cmdr);
    await this.admin('couper ses installations', 'DELETE', `/admin/members/${encodeURIComponent(nom)}/tokens`);
  }

  /** Inscriptions ouvertes ou fermées (les inscrits continuent d'envoyer). */
  async inscriptions() {
    return { ouvertes: (await this.admin('lire les inscriptions', 'GET', '/admin/join'))?.open !== false };
  }

  async reglerInscriptions(ouvertes) {
    if (typeof ouvertes !== 'boolean') throw erreurPublique(400, 'Inscriptions : ouvertes ou fermées.');
    return { ouvertes: (await this.admin(ouvertes ? 'rouvrir les inscriptions' : 'fermer les inscriptions', 'PUT', '/admin/join', { open: ouvertes }))?.open !== false };
  }

  /**
   * Nouvelle clé de chef (ADMIN_TOKEN), posée sur le serveur avec la clé Cloudflare : les anciens codes de gestion ne
   * marchent plus (un adjoint parti, un code qui a traîné). La clé du suivi ne change pas : la carte continue.
   */
  async changerCleChef({ cloudflare }) {
    this.exigerServeur();
    return this.seul(async () => {
      const cle = nouvelleCle();
      await changerSecret({ fetch: this.fetch, token: cloudflare, nom: 'ADMIN_TOKEN', valeur: cle });
      this.etat.adminToken = cle;
      this.enregistrer();
      return this.view();
    });
  }

  async motDePasse({ cloudflare, motDePasse }) {
    const mdp = verifierMotDePasse(motDePasse);
    this.exigerServeur();
    return this.seul(async () => {
      await changerMotDePasse({ fetch: this.fetch, token: cloudflare, motDePasse: mdp });
      this.etat.motDePasse = mdp;
      this.enregistrer();
      return this.view();
    });
  }

  /** Le mot de passe actuel, pour afficher le code (serveur repris sans lui). Non vérifiable : le serveur ne le dit pas. */
  noterMotDePasse(motDePasse) {
    this.exigerServeur();
    this.etat.motDePasse = verifierMotDePasse(motDePasse);
    this.enregistrer();
    return this.view();
  }

  /** La route en service sur le serveur : { route, version, updatedAt }, ou {} . */
  routeServeur() {
    return this.admin('lire la route', 'GET', '/v1/route');
  }

  /** Chaque système existe-t-il sur Spansh, sous ce nom exact ? (le suivi s'arrêterait sur un nom inconnu) */
  async verifierSystemes(noms, pauseMs = 250) {
    const inconnus = [];
    const nonVerifies = [];
    const file = [...noms];
    const un = async () => {
      for (let nom = file.shift(); nom; nom = file.shift()) {
        try {
          const res = await this.fetch(`${SPANSH}${encodeURIComponent(nom)}`, { signal: AbortSignal.timeout(DELAI_MS) });
          if (!res.ok) {
            res.body?.cancel?.().catch?.(() => {});
            nonVerifies.push(nom);
          } else if (!(await res.json())?.results?.some((r) => r.record?.name === nom)) inconnus.push(nom);
        } catch {
          nonVerifies.push(nom);
        }
        if (pauseMs) await new Promise((r) => setTimeout(r, pauseMs)); // Spansh est un service gratuit : sans rafale
      }
    };
    await Promise.all([un(), un()]);
    return { inconnus, nonVerifies };
  }

  /** Envoie la route au serveur ; le suivi la prend au passage suivant et se recale sans fausse annonce. */
  async envoyerRoute(route) {
    const r = routeValide(route);
    this.exigerServeur();
    return this.seul(async () => {
      this.etapeEnCours = 'Vérification des systèmes sur Spansh';
      const { inconnus, nonVerifies } = await this.verifierSystemes(r.stops.map((s) => s.name), this.pauseSpansh);
      if (inconnus.length) {
        throw erreurPublique(400, `Systèmes introuvables sur Spansh sous ce nom exact : ${inconnus.join(', ')}. Corrige la route (majuscules, tirets) puis renvoie-la.`);
      }
      if (nonVerifies.length) {
        throw erreurPublique(503, `Spansh ne répond pas pour l'instant (${nonVerifies.length} système${nonVerifies.length > 1 ? 's' : ''} non vérifié${nonVerifies.length > 1 ? 's' : ''}) : réessaie dans quelques minutes. La route n'est envoyée qu'une fois chaque nom vérifié.`);
      }
      this.etapeEnCours = 'Envoi au serveur';
      const res = await this.admin('enregistrer la route', 'PUT', '/admin/route', r);
      this.etat.routeEnvoyee = { titre: r.title, systemes: r.stops.length, version: res.version ?? null, le: res.updatedAt ?? null };
      this.enregistrer();
      return this.view();
    });
  }

  /** Ce PC gère-t-il le serveur de l'escadron (adresse et clé de chef connues) ? */
  gere() {
    return Boolean(this.etat.url && this.etat.adminToken);
  }

  /** Le projet de colonisation en service sur le serveur, avec ses relevés : { projet, version, updatedAt, releves }. */
  colonisationServeur() {
    return this.admin('lire le projet de colonisation', 'GET', '/v1/colonisation');
  }

  /** Publie le projet de colonisation : les apps des membres le prennent à leur lecture suivante. */
  async envoyerColonisation(projet) {
    const p = colonisationValide(projet);
    const res = await this.admin('enregistrer le projet de colonisation', 'PUT', '/admin/colonisation', p);
    this.etat.colonisationEnvoyee = { systemes: p.systems.length, chantiers: p.sites.length, version: res?.version ?? null, le: res?.updatedAt ?? null };
    this.enregistrer();
    return res;
  }

  /** Fin du projet de colonisation : le serveur efface le projet et tous ses relevés. */
  async arreterColonisation() {
    const res = await this.admin('arrêter le projet de colonisation', 'DELETE', '/admin/colonisation');
    this.etat.colonisationEnvoyee = null;
    this.enregistrer();
    return res;
  }

  /** Suivi Discord sur GitHub, 24 h/24 : installe le suivi sur le compte GitHub de la clé, puis envoie la route. */
  async suiviGithub({ github, webhook, route }) {
    this.exigerServeur();
    if (!this.etat.trackerToken) {
      throw erreurPublique(409, 'Il manque la clé du suivi (TRACKER_TOKEN) : reprends le serveur avec le code de gestion complet, ou remonte-le depuis ce PC.');
    }
    const hook = webhookValide(webhook);
    const r = routeValide(route);
    await this.envoyerRoute(r);
    return this.seul(async () => {
      const res = await installerSuivi({
        fetch: this.fetch,
        token: github,
        // ROUTE_JSON : secours seulement (le suivi lit d'abord la route du serveur)
        secrets: { ROUTE_JSON: JSON.stringify(r), DISCORD_WEBHOOK_URL: hook, API_URL: this.etat.url, TRACKER_TOKEN: this.etat.trackerToken },
        etape: (t) => { this.etapeEnCours = t; },
      });
      Object.assign(this.etat, { depot: res.depot, depotAdresse: res.adresse, suiviLe: new Date(this.now()).toISOString() });
      this.enregistrer();
      return this.view();
    });
  }
}

// Nom de commandant envoyé au serveur de l'escadron : lettres, chiffres, espaces et . _ ' - (64 au plus), comme dans le
// jeu. Refusé avant tout appel, même sans serveur monté : ni chemin (« .. », barres, deux-points), ni caractère de
// contrôle, ni nom réservé de Windows (CON, NUL, COM1…), qui n'ont rien à faire dans une adresse.
const NOM_COMMANDANT = /^[\p{L}\p{N}](?:[\p{L}\p{N} ._'-]{0,62}[\p{L}\p{N}._'-])?$/u;
const NOM_RESERVE = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i;

/** Le nom, sans espaces autour ; lève une erreur 400 s'il n'est pas un nom de commandant. */
export function nomCommandant(cmdr) {
  const nom = typeof cmdr === 'string' ? cmdr.trim() : '';
  if (!NOM_COMMANDANT.test(nom) || nom.includes('..') || NOM_RESERVE.test(nom)) throw erreurPublique(400, 'Nom du commandant : 1 à 64 lettres, chiffres, espaces, points, tirets ou apostrophes.');
  return nom;
}

const ID_ROLE = /^[a-z0-9][a-z0-9-]{0,23}$/;

/**
 * Rôles saisis par le chef, du plus haut au plus bas → [{ id, name, rank }] pour le serveur (rank : plus grand = plus
 * haut). Refus (400) : pas une liste, plus de 20, nom vide ou trop long, deux fois le même nom.
 */
export function rolesValides(liste) {
  if (!Array.isArray(liste) || liste.length > 20) throw erreurPublique(400, 'Rôles : une liste de 20 au plus.');
  const ids = new Set();
  const noms = new Set();
  const roles = [];
  liste.forEach((r, i) => {
    const name = typeof r?.name === 'string' ? r.name.trim() : '';
    if (!name || name.length > 40) throw erreurPublique(400, 'Chaque rôle a un nom (40 caractères au plus).');
    if (noms.has(name.toLowerCase())) throw erreurPublique(400, `Deux rôles s’appellent « ${name} ».`);
    noms.add(name.toLowerCase());
    let id = typeof r.id === 'string' && ID_ROLE.test(r.id) ? r.id : null;
    if (!id || ids.has(id)) {
      const base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'role';
      id = base;
      for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    }
    ids.add(id);
    roles.push({ id, name, rank: (liste.length - i) * 10 });
  });
  return roles;
}
