// Partage avec l'escadron : ce que le joueur choisit d'envoyer (repère, build, route…) à tout l'escadron, à un rôle
// et au-dessus, ou à des commandants précis, et ce qu'il reçoit des autres.
//
// Opt-in : tant que le partage n'est pas activé ici, aucun appel ne part. Une fois activé, l'app ne parle qu'au
// serveur de l'escadron du joueur (celui du code qu'il a collé), avec son jeton. Un envoi vient d'un clic « Partager »,
// ou du partage automatique d'un type que le joueur a lui-même réglé (« tous mes repères de Rhino, à tel rôle ») :
// coupé pour chaque type par défaut.
//
// Vie privée : le serveur ne rend un partage qu'à son auteur et à ses destinataires ; la clé du chef n'en lit aucun.
// Ce qui est reçu est gardé à part (escadron-partage.json), jamais mélangé aux données du joueur : c'est lui qui
// copie ce qu'il veut garder, depuis l'onglet « Escadron » de chaque rubrique.

import crypto from 'node:crypto';
import path from 'node:path';
import { readJson, writeJsonAtomic } from './store.js';
import { TYPES_AUTO } from './sources.js';
import { CLE_PUBLIQUE, MAX_ENVELOPPE, TITRE_CHIFFRE, chiffrer, dechiffrer, estChiffre, nouvellePaire, paireValide } from './chiffre.js';

export const FICHIER_PARTAGE = 'escadron-partage.json';
const DELAI_MS = 15_000;
const FRAICHEUR_MS = 5 * 60 * 1000; // relu au plus toutes les 5 min quand une page le demande
const MAX_DONNEES = 8 * 1024; // comme le serveur
const GENRE = /^[a-z][a-z0-9-]{0,23}$/;
const ID_PARTAGE = /^[0-9a-f]{32}$/;
const ID_INSTALLATION = /^[0-9a-f]{12}$/;
const ROLE = /^[a-z0-9][a-z0-9-]{0,23}$/;
const MAX_PAR_PASSAGE = 30; // envois automatiques par passage : le reste au passage suivant (le serveur limite à 120 appels par minute)
const cleDe = (kind, ref) => `${kind}:${ref}`;
const signature = (objet, vers) => crypto.createHash('sha256').update(JSON.stringify([objet.title, objet.data, vers])).digest('hex').slice(0, 24);

/** Réglage automatique relu du disque : seulement des types connus, avec des destinataires valides. */
function autoPropre(lu) {
  const auto = {};
  for (const kind of Object.keys(TYPES_AUTO)) {
    try {
      if (lu && lu[kind]) auto[kind] = destinataires(lu[kind]);
    } catch { /* réglage illisible : ce type n'est pas partagé */ }
  }
  return auto;
}

function erreur(status, message) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}

const texte = (v, max) => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null);
const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Destinataires demandés, vérifiés : { all: true }, { role } ou { cmdrs: [...] } ; sinon erreur 400. */
export function destinataires(to) {
  if (to && to.all === true) return { all: true };
  if (to && typeof to.role === 'string' && ROLE.test(to.role)) return { role: to.role };
  if (to && Array.isArray(to.cmdrs)) {
    const cmdrs = [...new Set(to.cmdrs.map((c) => texte(c, 64)).filter(Boolean))];
    if (cmdrs.length >= 1 && cmdrs.length <= 30) return { cmdrs };
  }
  throw erreur(400, 'Choisis à qui partager : tout l’escadron, un rôle, ou au moins un commandant (30 au plus).');
}

/** Un partage reçu du serveur, réduit à ce que l'app montre (rien d'autre n'est gardé). */
function propre(s) {
  if (!s || typeof s !== 'object' || !ID_PARTAGE.test(s.id ?? '') || !GENRE.test(s.kind ?? '')) return null;
  const data = s.data && typeof s.data === 'object' && !Array.isArray(s.data) ? s.data : {};
  if (JSON.stringify(data).length > (estChiffre(data) ? MAX_ENVELOPPE : MAX_DONNEES)) return null;
  return {
    id: s.id, cmdr: String(s.cmdr ?? '').slice(0, 64), kind: s.kind, ref: String(s.ref ?? '').slice(0, 80),
    title: String(s.title ?? '').slice(0, 80), data,
    audience: ['all', 'role', 'cmdrs'].includes(s.audience) ? s.audience : 'all',
    role: typeof s.role === 'string' ? s.role.slice(0, 24) : null,
    to: Array.isArray(s.to) ? s.to.map((c) => String(c).slice(0, 64)).slice(0, 30) : undefined,
    createdAt: typeof s.created_at === 'string' ? s.created_at : null,
    updatedAt: typeof s.updated_at === 'string' ? s.updated_at : null,
    mine: s.mine === true,
    // Partage chiffré de bout en bout, déjà déchiffré ici (chiffre) ; ou chiffré pour une autre installation (illisible)
    ...(s.chiffre === true ? { chiffre: true } : {}),
    ...(s.illisible === true ? { illisible: true } : {}),
  };
}

/** Clés publiques d'un membre, relues sans confiance (10 au plus : une par installation). */
const clesPropres = (liste) => (Array.isArray(liste) ? liste : []).filter((c) => typeof c === 'string' && CLE_PUBLIQUE.test(c)).slice(0, 10);

const roles = (liste) => (Array.isArray(liste) ? liste : [])
  .filter((r) => r && ROLE.test(r.id ?? '') && typeof r.name === 'string' && Number.isInteger(r.rank))
  .map((r) => ({ id: r.id, name: r.name.slice(0, 40), rank: r.rank }))
  .slice(0, 20);

export class Partage {
  /** `acces` : () => ({ base, token, cmdr }) d'après le capteur (serveur et jeton du joueur, ou null). */
  constructor({ dir, fetch, acces, now = Date.now, onChange = () => {}, source = async () => [] }) {
    this.source = source; // async (kinds) => objets du joueur de ces types ([{ kind, ref, title, data }]), lus par l'API des autres modules
    this.synchro = null;
    this.fichier = path.join(dir, FICHIER_PARTAGE);
    this.fetch = fetch;
    this.acces = acces;
    this.now = now;
    this.onChange = onChange;
    this.enCours = null;
    const lu = readJson(this.fichier) || {};
    this.etat = {
      actif: lu.actif === true,
      serveur: typeof lu.serveur === 'string' ? lu.serveur : null, // le serveur d'où vient ce qui est gardé ici
      luAt: typeof lu.luAt === 'string' ? lu.luAt : null,
      attente: lu.attente === true,
      cmdr: typeof lu.cmdr === 'string' ? lu.cmdr : null,
      role: lu.role && typeof lu.role === 'object' ? roles([lu.role])[0] ?? null : null,
      roles: roles(lu.roles),
      membres: Array.isArray(lu.membres) ? lu.membres.filter((m) => m && typeof m.cmdr === 'string').map((m) => ({ cmdr: m.cmdr, role: typeof m.role === 'string' ? m.role : null, cles: clesPropres(m.cles) })) : [],
      // Paire de clés de cette installation (chiffre.js) : la privée ne quitte jamais ce PC. `clePubliee` : le serveur
      // qui connaît déjà la publique ; `sansChiffrement` : serveur d'avant, qui ne sait pas garder les clés
      cle: paireValide(lu.cle),
      clePubliee: typeof lu.clePubliee === 'string' ? lu.clePubliee : null,
      // Dernier envoi à des personnes : chiffré, ou en clair et pour qui il manquait une clé (dit à la page)
      dernierEnvoi: null,
      installations: Array.isArray(lu.installations) ? lu.installations.filter((i) => i && ID_INSTALLATION.test(i.id ?? '')) : [],
      partages: (Array.isArray(lu.partages) ? lu.partages : []).map((s) => propre({ ...s, created_at: s.createdAt, updated_at: s.updatedAt })).filter(Boolean),
      masques: Array.isArray(lu.masques) ? lu.masques.filter((id) => ID_PARTAGE.test(id)).slice(0, 2000) : [],
      // Partage automatique : destinataires par type ; ce qu'il a envoyé (clé → signature du contenu) ; ce que le
      // joueur a retiré lui-même (jamais renvoyé tout seul)
      auto: autoPropre(lu.auto),
      autoEnvoyes: lu.autoEnvoyes && typeof lu.autoEnvoyes === 'object' && !Array.isArray(lu.autoEnvoyes) ? Object.fromEntries(Object.entries(lu.autoEnvoyes).filter(([, v]) => typeof v === 'string').slice(0, 2000)) : {},
      autoExclus: Array.isArray(lu.autoExclus) ? lu.autoExclus.filter((c) => typeof c === 'string').slice(0, 2000) : [],
      autoAt: typeof lu.autoAt === 'string' ? lu.autoAt : null,
      autoErreur: null,
      erreur: null,
    };
  }

  enregistrer() {
    const { erreur: _, autoErreur: __, ...garde } = this.etat;
    writeJsonAtomic(this.fichier, garde);
    this.onChange();
  }

  /** Changement de serveur ou de jeton (capteur) : ce qui venait de l'ancien escadron ne reste pas. */
  oublierSiAutreServeur() {
    const a = this.acces();
    if (this.etat.serveur && (!a?.base || a.base !== this.etat.serveur)) {
      // Autre escadron : ni ses partages, ni les réglages automatiques (ses rôles ne sont pas ceux du nouveau)
      Object.assign(this.etat, { clePubliee: null, dernierEnvoi: null, serveur: null, luAt: null, attente: false, cmdr: null, role: null, roles: [], membres: [], installations: [], partages: [], masques: [], auto: {}, autoEnvoyes: {}, autoExclus: [], autoAt: null });
      this.enregistrer();
    }
  }

  view() {
    this.oublierSiAutreServeur();
    const a = this.acces();
    const e = this.etat;
    const masques = new Set(e.masques);
    return {
      actif: e.actif,
      pret: Boolean(a?.base && a?.token), // serveur et jeton réglés (page « Rejoindre l'escadron »)
      attente: e.attente, // cette installation doit être confirmée (par une autre à toi, ou par le chef)
      cmdr: e.cmdr,
      role: e.role,
      roles: e.roles,
      // Chaque membre, avec `chiffrable` : il a publié une clé, un partage pour lui sera chiffré de bout en bout
      membres: e.membres.map((m) => ({ cmdr: m.cmdr, role: m.role, chiffrable: (m.cles ?? []).length > 0 })),
      // Ce PC a sa clé et le serveur la connaît : les partages à des personnes peuvent être chiffrés
      chiffrement: Boolean(e.cle && e.clePubliee && a?.base === e.clePubliee),
      dernierEnvoi: e.dernierEnvoi,
      installations: e.installations,
      recus: e.partages.filter((s) => !s.mine && !masques.has(s.id)),
      masques: e.partages.filter((s) => !s.mine && masques.has(s.id)).length,
      miens: e.partages.filter((s) => s.mine),
      luAt: e.luAt,
      erreur: e.erreur,
      // Partage automatique, type par type : { kind, label, to (null : jamais), envoyes }
      auto: Object.entries(TYPES_AUTO).map(([kind, label]) => ({
        kind, label, to: e.auto[kind] ?? null,
        envoyes: Object.keys(e.autoEnvoyes).filter((c) => c.startsWith(`${kind}:`)).length,
      })),
      autoAt: e.autoAt,
      autoErreur: e.autoErreur,
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
    if (!a?.base || !a?.token) throw erreur(409, 'Rejoins d’abord ton escadron (code de l’escadron) : le partage passe par son serveur.');
    if (!this.etat.actif) throw erreur(409, 'Active d’abord le partage avec l’escadron (Paramètres, ou page Escadron).');
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
    if (res.status === 404 || res.status === 405) throw erreur(409, `Le serveur de l’escadron ne sait pas « ${quoi} » : il date d’avant le partage, le chef doit le mettre à jour.`);
    if (res.status === 413) throw erreur(413, 'Trop gros pour être partagé (8 Ko au plus).');
    if (res.status === 429) throw erreur(429, 'Trop de partages ou d’appels : réessaie dans une minute (300 partages au plus par commandant).');
    if (res.status === 400) throw erreur(400, `Le serveur de l’escadron refuse « ${quoi} » : destinataire inconnu ou contenu invalide.`);
    if (!res.ok) throw erreur(502, `Le serveur de l’escadron refuse « ${quoi} » (erreur ${res.status}).`);
    return res.json();
  }

  /** Relit moi, les membres, les rôles et les partages. Un seul appel à la fois. */
  lire() {
    this.enCours ??= this.#lire().finally(() => {
      this.enCours = null;
    });
    return this.enCours;
  }

  async #lire() {
    this.oublierSiAutreServeur();
    const a = this.exiger();
    try {
      const moi = await this.appel('lire ton compte', 'GET', '/v1/me');
      this.etat.serveur = a.base;
      this.etat.cmdr = typeof moi?.cmdr === 'string' ? moi.cmdr.slice(0, 64) : null;
      this.etat.attente = moi?.pending === true;
      this.etat.role = roles([moi?.role])[0] ?? null;
      this.etat.installations = (Array.isArray(moi?.installations) ? moi.installations : [])
        .filter((i) => i && ID_INSTALLATION.test(i.id ?? ''))
        .map((i) => ({ id: i.id, depuis: typeof i.created_at === 'string' ? i.created_at : null, attente: i.pending === true, ici: i.current === true }));
      if (!this.etat.attente) {
        await this.publierCle(a);
        const [liste, membres] = [await this.appel('lire les partages', 'GET', '/v1/shares'), await this.appel('lire les membres', 'GET', '/v1/members')];
        this.etat.partages = (Array.isArray(liste?.shares) ? liste.shares : []).map((s) => propre(this.dechiffre(s))).filter(Boolean);
        this.etat.roles = roles(membres?.roles);
        this.etat.membres = (Array.isArray(membres?.members) ? membres.members : [])
          .filter((m) => m && typeof m.cmdr === 'string')
          .map((m) => ({ cmdr: m.cmdr.slice(0, 64), role: typeof m.role === 'string' ? m.role : null, cles: clesPropres(m.keys) }))
          .slice(0, 2000);
        const connus = new Set(this.etat.partages.map((s) => s.id));
        this.etat.masques = this.etat.masques.filter((id) => connus.has(id));
      } else {
        this.etat.partages = [];
        this.etat.membres = [];
      }
      this.etat.luAt = iso(this.now());
      this.etat.erreur = null;
    } catch (err) {
      this.etat.erreur = err.publicMessage || 'Lecture impossible.';
      this.enregistrer();
      throw err;
    }
    this.enregistrer();
    return this.view();
  }

  /**
   * Publie la clé publique de cette installation sur le serveur de l'escadron, une fois par serveur (la paire est créée
   * à la première fois). Un serveur d'avant, qui ne sait pas garder les clés, n'empêche rien : les partages à des
   * personnes partiront en clair, et la page le dit.
   */
  async publierCle(a) {
    this.etat.cle ??= nouvellePaire();
    if (this.etat.clePubliee === a.base) return;
    try {
      await this.appel('publier ta clé de chiffrement', 'PUT', '/v1/key', { key: this.etat.cle.publique });
      this.etat.clePubliee = a.base;
    } catch (err) {
      if (err.status !== 409) throw err; // 409 : le serveur ne connaît pas encore les clés
      this.etat.clePubliee = null;
    }
  }

  /** Partage reçu du serveur : déchiffré s'il est chiffré pour cette installation, marqué illisible sinon. */
  dechiffre(s) {
    if (!s || !estChiffre(s.data)) return s;
    const clair = this.etat.cle ? dechiffrer(s.data, this.etat.cle) : null;
    if (!clair) return { ...s, title: TITRE_CHIFFRE, data: {}, illisible: true };
    return { ...s, title: String(clair.titre).slice(0, 80), data: clair.data, chiffre: true };
  }

  /**
   * Ce qui part au serveur pour un partage : chiffré de bout en bout s'il est adressé à des personnes qui ont toutes
   * publié une clé (le serveur ne reçoit alors qu'un titre neutre et une enveloppe), en clair sinon. Rend
   * { title, data, chiffre, sansCle: [noms] }.
   */
  pourServeur(titre, data, vers) {
    if (!Array.isArray(vers?.cmdrs)) return { title: titre, data, chiffre: false, sansCle: [] };
    const a = this.acces();
    const cles = new Map(this.etat.membres.map((m) => [m.cmdr.toLowerCase(), m.cles ?? []]));
    const sansCle = vers.cmdrs.filter((c) => !(cles.get(String(c).toLowerCase()) ?? []).length);
    if (sansCle.length || !this.etat.cle || this.etat.clePubliee !== a?.base) return { title: titre, data, chiffre: false, sansCle };
    // Les destinataires, et moi (toutes mes installations) pour relire mon propre partage
    const pour = [this.etat.cle.publique, ...(cles.get(String(this.etat.cmdr ?? '').toLowerCase()) ?? []), ...vers.cmdrs.flatMap((c) => cles.get(String(c).toLowerCase()))];
    const enveloppe = chiffrer({ titre, data }, pour);
    if (JSON.stringify(enveloppe).length > MAX_ENVELOPPE) throw erreur(413, 'Trop de destinataires pour un partage chiffré : partage-le à moins de personnes à la fois.');
    return { title: TITRE_CHIFFRE, data: enveloppe, chiffre: true, sansCle: [] };
  }

  /** Relecture en arrière-plan si ce qui est gardé a plus de 5 min (une page vient de le demander). */
  rafraichirSiVieux() {
    const a = this.acces();
    if (!this.etat.actif || !a?.base || !a?.token || this.enCours) return;
    const age = this.etat.luAt ? this.now() - Date.parse(this.etat.luAt) : Infinity;
    if (age > FRAICHEUR_MS) this.lire().catch(() => {});
  }

  /**
   * Partager : { kind, ref, title, data, to }. Même (kind, ref) : le partage est remplacé. Sans `data`, le contenu
   * est lu ici, chez le module de l'objet (build, route commerciale) : la page ne donne que son type et son numéro.
   */
  async envoyer({ kind, ref, title, data, to } = {}) {
    if (!GENRE.test(kind ?? '')) throw erreur(400, 'Type de partage invalide.');
    if (data === undefined) {
      this.exiger();
      destinataires(to);
      let objets;
      try {
        objets = await this.source([kind]);
      } catch {
        throw erreur(502, 'Lecture de cet objet impossible pour l’instant : réessaie.');
      }
      const o = (Array.isArray(objets) ? objets : []).find((x) => x.kind === kind && String(x.ref) === String(ref));
      if (!o) throw erreur(404, 'Objet introuvable chez toi (supprimé ?), ou pas partageable.');
      ({ title, data } = o);
    }
    const cle = texte(String(ref ?? ''), 80);
    const titre = texte(title, 80);
    if (!cle || !titre) throw erreur(400, 'Partage sans nom : donne-lui un titre (80 caractères au plus).');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw erreur(400, 'Contenu du partage invalide.');
    if (JSON.stringify(data).length > MAX_DONNEES) throw erreur(413, 'Trop gros pour être partagé (8 Ko au plus).');
    const vers = destinataires(to);
    // À des personnes : on relit d'abord les membres, pour avoir leurs clés du moment
    if (Array.isArray(vers.cmdrs)) await this.lire();
    const envoi = this.pourServeur(titre, data, vers);
    await this.appel('partager', 'PUT', '/v1/shares', { kind, ref: cle, title: envoi.title, data: envoi.data, to: vers });
    this.etat.dernierEnvoi = Array.isArray(vers.cmdrs) ? { chiffre: envoi.chiffre, sansCle: envoi.sansCle } : null;
    // Partagé à la main : le partage automatique n'y touche plus (ni mise à jour, ni retrait)
    delete this.etat.autoEnvoyes[cleDe(kind, cle)];
    this.etat.autoExclus = [...new Set([...this.etat.autoExclus, cleDe(kind, cle)])].slice(-2000);
    return this.lire();
  }

  async retirer(id) {
    if (!ID_PARTAGE.test(id ?? '')) throw erreur(400, 'Partage introuvable.');
    await this.appel('retirer un partage', 'DELETE', `/v1/shares/${id}`);
    // Retiré par le joueur : le partage automatique ne le renverra pas
    const s = this.etat.partages.find((p) => p.id === id);
    if (s) {
      delete this.etat.autoEnvoyes[cleDe(s.kind, s.ref)];
      this.etat.autoExclus = [...new Set([...this.etat.autoExclus, cleDe(s.kind, s.ref)])].slice(-2000);
    }
    return this.lire();
  }

  /** Masquer (ou remontrer) un partage reçu, sur ce PC seulement : l'auteur n'en sait rien. */
  masquer(id, masque) {
    if (!ID_PARTAGE.test(id ?? '')) throw erreur(400, 'Partage introuvable.');
    const m = new Set(this.etat.masques);
    if (masque === false) m.delete(id);
    else m.add(id);
    this.etat.masques = [...m];
    this.enregistrer();
  }

  /** Tout remontrer. */
  demasquer() {
    this.etat.masques = [];
    this.enregistrer();
  }

  /** Confirmer une autre installation à mon nom, depuis celle-ci (déjà confirmée). */
  async confirmer(id) {
    if (!ID_INSTALLATION.test(id ?? '')) throw erreur(400, 'Installation introuvable.');
    await this.appel('confirmer une installation', 'POST', `/v1/installations/${id}/approve`);
    return this.lire();
  }

  // --- Partage automatique ---

  /**
   * Régler un type : `to` (tout l'escadron, un rôle, des personnes), ou null pour « jamais ». Couper un type ne
   * retire pas ce qui est déjà partagé (« Ce que je partage » le fait) : il cesse seulement d'être tenu à jour.
   */
  reglerAuto(kind, to) {
    if (!Object.hasOwn(TYPES_AUTO, kind)) throw erreur(400, 'Type de partage automatique inconnu.');
    // Le réglage vaut pour cet escadron : noté avec son serveur, oublié si le joueur en change
    this.oublierSiAutreServeur();
    const acces = this.acces();
    if (acces?.base) this.etat.serveur ??= acces.base;
    if (to == null) delete this.etat.auto[kind];
    else this.etat.auto[kind] = destinataires(to);
    this.enregistrer();
  }

  /** Remettre dans le partage automatique ce que le joueur avait retiré ou partagé à la main. */
  reprendreAuto() {
    this.etat.autoExclus = [];
    this.enregistrer();
  }

  autoDemande() {
    const a = this.acces();
    return this.etat.actif && Boolean(a?.base && a?.token) && Object.keys(this.etat.auto).length > 0;
  }

  /** Un passage du partage automatique (un seul à la fois). Sans type réglé, ou partage coupé : rien, aucun appel. */
  synchroniser() {
    if (!this.autoDemande()) return Promise.resolve(this.view());
    this.synchro ??= this.#synchroniser().finally(() => {
      this.synchro = null;
    });
    return this.synchro;
  }

  async #synchroniser() {
    const e = this.etat;
    try {
      this.oublierSiAutreServeur();
      if (!this.autoDemande()) return this.view();
      const objets = await this.source(Object.keys(e.auto)); // un échec de lecture arrête tout : rien n'est retiré sur une liste douteuse
      if (!Array.isArray(objets)) throw erreur(502, 'Lecture de tes données impossible : rien n’a été partagé.');
      if (!e.luAt || e.attente) await this.lire();
      if (e.attente) throw erreur(409, 'Cette installation doit d’abord être confirmée.');
      const exclus = new Set(e.autoExclus);
      const vus = new Set();
      let envois = 0;
      for (const o of objets) {
        const vers = e.auto[o.kind];
        if (!vers || !GENRE.test(o.kind) || !texte(o.title, 80) || !texte(String(o.ref ?? ''), 80)) continue;
        const cle = cleDe(o.kind, String(o.ref));
        vus.add(cle);
        if (exclus.has(cle)) continue;
        if (JSON.stringify(o.data ?? {}).length > MAX_DONNEES) continue;
        const sig = signature(o, vers);
        if (e.autoEnvoyes[cle] === sig) continue;
        if (envois >= MAX_PAR_PASSAGE) continue; // la suite au prochain passage
        const envoi = this.pourServeur(o.title.trim(), o.data, vers);
        await this.appel('partager', 'PUT', '/v1/shares', { kind: o.kind, ref: String(o.ref), title: envoi.title, data: envoi.data, to: vers });
        e.autoEnvoyes[cle] = sig;
        envois += 1;
      }
      // Ce que le partage automatique avait envoyé et qui n'existe plus chez le joueur (supprimé, devenu « pas
      // rentable ») : retiré, pour les types encore réglés seulement
      let retraits = 0;
      for (const cle of Object.keys(e.autoEnvoyes)) {
        const kind = cle.slice(0, cle.indexOf(':'));
        if (vus.has(cle) || !e.auto[kind]) continue;
        const s = e.partages.find((p) => p.mine && cleDe(p.kind, p.ref) === cle);
        if (s) {
          try {
            await this.appel('retirer un partage', 'DELETE', `/v1/shares/${s.id}`);
          } catch (err) {
            if (err.status !== 409 || !/ne sait pas/.test(err.publicMessage)) throw err; // déjà retiré : on continue
          }
        }
        delete e.autoEnvoyes[cle];
        retraits += 1;
      }
      e.autoAt = iso(this.now());
      e.autoErreur = null;
      if (envois || retraits) await this.lire();
      else this.enregistrer();
    } catch (err) {
      e.autoErreur = err.publicMessage || 'Partage automatique impossible pour l’instant.';
      this.enregistrer();
    }
    return this.view();
  }
}
