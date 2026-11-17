// Rôles des vaisseaux, choisis par le joueur : un rôle principal au plus (ouvert de lui-même à l'embarquement) et des
// rôles secondaires facultatifs (proposés quand l'activité est détectée). Rôles = modes de jeu + Polyvalent (core/modes.js).
//
// Gardés par (commandant, ShipID du jeu) : deux Cutter restent distincts, et le vaisseau n° 1 d'un second compte n'est
// pas celui du compte principal (core/commander.js). Dans le dossier des données (core/paths.js), fichier
// ship-roles.json, écrit d'un coup (core/jsonFile.js). Fichier :
//   { "version": 2,
//     "commanders": { "F0000001": { "43": { "primary": "waypoints", "secondary": ["shipmining"], "type": "lakonminer", "at": "…" } } },
//     "ships": { "12": { … } } }
// type : modèle du vaisseau (nom interne du journal) quand le rôle a été donné ; at : heure du choix.
// ships : rôles sans commandant (fichier de la version 1, ou commandant pas encore connu). Ils ne valent pour aucun
// commandant connu ; à la relecture du journal, ils sont rattachés au commandant le plus vu (ou au seul), marqués
// « guessed » (rattachés d'office : le ménage « numéro repris » ne les efface pas, voir core/roleSwitch.js roleOf).
// Un fichier de la version 1 ({ "version": 1, "ships": {…} }) est relu tel quel : tous ses rôles sont sans commandant.
// Fichier là mais pas relu (verrouillé, droits ; ou illisible et ni renommé ni copié) : jamais écrit par-dessus, chaque
// écriture le relit d'abord (ensureRead) : les rôles se donnent un par un, une table vide les effacerait tous.
//
// Vaisseau vendu : le jeu réutilise son ShipID pour le suivant (mesuré, journaux de référence : Panther n° 30 vendu à l'achat
// d'un Mandalay, qui a reçu le n° 30 ; Python Mk II n° 37 puis Krait Mk II n° 37, 24-25 oct. 2026). Son rôle passerait au
// nouveau. Il est donc effacé à la vente (ShipyardSell, SellShipOnRebuy, ShipyardBuy avec SellShipID), en direct comme
// à la relecture du journal (vente faite après le choix du rôle, pendant que l'app était fermée), et un rôle dont le
// modèle ne correspond plus au vaisseau qui porte ce numéro ne s'applique pas (roleFor) : il est inoffensif.

import path from 'node:path';
import { checkRole, hasRole, isMode, isRole, MAX_SECONDARY_ROLES, POLYVALENT } from './modes.js';
import { readJsonOrSetAside, writeJsonAtomic } from './jsonFile.js';
import { isCommanderId, shipKey } from './commander.js';

/**
 * ShipID le plus grand accepté. Le jeu numérote les vaisseaux achetés à la suite (0, 1, 2… ; 44 au plus dans les journaux
 * de l’auteur, 23 oct.-7 nov. 2026 ; SRV et vaisseaux partagent ce compteur). Une combinaison à pied a un numéro à part
 * (LoadGame à pied : ShipID 4293000002, mesuré) : jamais un vaisseau, refusée. Choix de l'app : large marge.
 */
export const MAX_SHIP_ID = 1_000_000;
export const ROLES_FILE_VERSION = 2;
/** Versions relues : 1 (sans commandant), 2 (par commandant). */
const READABLE_VERSIONS = new Set([1, 2]);
const TYPE = /^[a-z0-9_]{1,40}$/;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** ShipID d'une adresse ou d'un fichier : entier décimal de 0 à MAX_SHIP_ID, écrit sans zéro devant ; sinon null. */
export function parseShipId(raw) {
  let s;
  if (typeof raw === 'number') s = Number.isSafeInteger(raw) ? String(raw) : '';
  else if (typeof raw === 'string') s = raw;
  else return null;
  if (!/^(0|[1-9]\d{0,6})$/.test(s)) return null;
  const n = Number(s);
  return n <= MAX_SHIP_ID ? n : null;
}

/** Modèle du journal en minuscules (« LakonMiner » → « lakonminer »), ou null s'il n'a pas une forme connue. */
export function shipType(raw) {
  const t = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return TYPE.test(t) ? t : null;
}

/**
 * Corps d'une écriture de rôle (PUT /api/ships/:shipId/role) : { primary, secondary } et rien d'autre.
 * @returns {{ ok: true, role: { primary, secondary } } | { ok: false, error: string }}
 */
export function checkRoleBody(body) {
  if (!isPlainObject(body)) return { ok: false, error: 'Rôle illisible : envoie { primary, secondary }.' };
  const extra = Object.keys(body).filter((k) => k !== 'primary' && k !== 'secondary');
  if (extra.length) return { ok: false, error: `Champ inconnu : « ${extra[0].slice(0, 40)} ». Seuls primary et secondary sont permis.` };
  // Un corps vide n'efface pas un rôle par mégarde : « aucun rôle principal » s'écrit primary: null
  if (!Object.hasOwn(body, 'primary')) return { ok: false, error: 'Rôle principal manquant : primary (un rôle, ou null pour aucun).' };
  return checkRole(body);
}

/**
 * Valeur écartée, pour un avertissement : un texte tel quel (tronqué), sinon seulement sa sorte. Jamais String(v) : un
 * objet JSON dont « toString » n'est pas une fonction ({"toString":0}) le ferait lever une erreur, au démarrage.
 */
const shown = (v) => {
  if (typeof v === 'string') return `« ${v.slice(0, 40)} »`;
  return v === null ? 'null' : typeof v;
};

/**
 * Entrée du fichier, nettoyée : ce qui n'est plus un rôle connu (un mode retiré de l'app…) est enlevé, avec une raison.
 * @returns {{ entry: object|null, notes: string[] }} entry null : plus rien d'utile
 */
function cleanEntry(raw) {
  const notes = [];
  let primary = raw.primary ?? null;
  if (primary !== null && !isRole(primary)) {
    notes.push(`rôle principal inconnu retiré (${shown(primary)})`);
    primary = null;
  }
  let secondary = Array.isArray(raw.secondary) ? raw.secondary : [];
  if (raw.secondary !== undefined && !Array.isArray(raw.secondary)) notes.push('rôles secondaires illisibles retirés');
  const kept = [];
  for (const s of secondary) {
    if (!isMode(s) || s === primary || kept.includes(s)) notes.push(`rôle secondaire retiré (${shown(s)})`);
    else kept.push(s);
  }
  secondary = kept;
  if (primary === POLYVALENT.id && secondary.length) {
    notes.push('rôles secondaires retirés : Polyvalent couvre déjà tout');
    secondary = [];
  }
  if (secondary.length > MAX_SECONDARY_ROLES) {
    notes.push(`rôles secondaires au-delà de ${MAX_SECONDARY_ROLES} retirés`);
    secondary = secondary.slice(0, MAX_SECONDARY_ROLES);
  }
  const role = { primary, secondary };
  if (!hasRole(role)) return { entry: null, notes };
  const at = typeof raw.at === 'string' && Number.isFinite(Date.parse(raw.at)) ? raw.at : null;
  return { entry: { ...role, type: shipType(raw.type), at, ...(raw.guessed === true ? { guessed: true } : {}) }, notes };
}

/** Entrée du fichier, pour l'écrire : { primary, secondary, type, at } (et guessed s'il y a lieu). */
const fileEntry = (e) => ({ primary: e.primary, secondary: e.secondary, type: e.type, at: e.at, ...(e.guessed ? { guessed: true } : {}) });

/** Entrées triées par numéro de vaisseau. */
const byShipId = (entries) => [...entries].sort((a, b) => a.shipId - b.shipId);

export class ShipRoles {
  /**
   * @param {{ file: string, warn?: (msg: string) => void, now?: () => number }} o now : horloge (ms), pour l'heure du choix
   */
  constructor({ file, warn = console.warn, now = () => Date.now() }) {
    this.file = file;
    this.warn = warn;
    this.now = now;
    // shipKey(commandant, ShipID) → { commander, shipId, primary, secondary, type, at, guessed? } ; commander null : sans
    // commandant (fichier de la version 1, ou commandant pas encore connu)
    this.ships = new Map();
    // Fichier là mais pas relu : 'erreur' (verrouillé, droits), 'illisible' sans copie mise de côté, ou 'imprevu' (la
    // lecture a échoué d'une façon que rien n'a prévue). L'écrire effacerait les rôles qu'il garde : aucune écriture
    // tant qu'il n'est pas relu (ensureRead)
    this.unread = null;
    this.unreadWhy = null; // raison d'un échec imprévu
  }

  /**
   * Relit le fichier. Illisible : mis de côté, départ à vide (core/jsonFile.js). Entrées douteuses : écartées une à une,
   * signalées. Pas relu (voir unread) : table vide en attendant, et aucune écriture.
   * Ne lève jamais d'erreur : appelé au démarrage du serveur (index.js), une panne l'arrêterait à chaque lancement. Une
   * panne imprévue laisse la table vide, sans rien écrire par-dessus le fichier (unread 'imprevu', nouvel essai à
   * chaque écriture).
   */
  load() {
    this.ships = new Map();
    this.unread = null;
    this.unreadWhy = null;
    try {
      const r = readJsonOrSetAside(this.file, {
        label: 'Rôles des vaisseaux',
        accept: (d) => isPlainObject(d) && READABLE_VERSIONS.has(d.version) && isPlainObject(d.ships)
          && (d.version === 1 ? d.commanders === undefined : isPlainObject(d.commanders ?? {})),
        warn: this.warn,
        now: this.now(),
      });
      this.unread = r.status === 'erreur' || (r.status === 'illisible' && !r.aside) ? r.status : null;
      if (this.unread) this.warn(`Rôles des vaisseaux : aucune écriture tant que ${this.file} n'est pas relu (nouvel essai au prochain changement de rôle).`);
      if (r.data) {
        const ships = this.readEntries(r.data.ships, null);
        for (const id of Object.keys(r.data.commanders ?? {})) {
          const list = r.data.commanders[id];
          if (!isCommanderId(id) || !isPlainObject(list)) {
            this.warn(`Rôles des vaisseaux : commandant « ${id.slice(0, 20)} » ignoré (identifiant ou contenu illisible).`);
            continue;
          }
          for (const [k, e] of this.readEntries(list, id)) ships.set(k, e);
        }
        this.ships = ships;
      }
    } catch (err) {
      this.ships = new Map();
      this.unread = 'imprevu';
      this.unreadWhy = String(err?.message ?? 'erreur inconnue').slice(0, 200);
      this.warn(`Rôles des vaisseaux : ${this.file} pas relu (${this.unreadWhy}) ; aucun rôle en attendant, et aucune écriture tant qu'il n'est pas relu (nouvel essai au prochain changement de rôle).`);
    }
    return this;
  }

  /**
   * Entrées du fichier (un objet ShipID → rôle, déjà vérifié) d'un commandant (null : sans commandant), nettoyées :
   * Map shipKey → entrée. Une entrée qui pose problème est écartée seule, avec un avertissement : les autres restent.
   */
  readEntries(ships, commander) {
    const out = new Map();
    for (const key of Object.keys(ships)) {
      const id = parseShipId(key);
      const raw = ships[key];
      if (id === null || !isPlainObject(raw)) {
        this.warn(`Rôles des vaisseaux : entrée « ${key.slice(0, 20)} » ignorée (numéro de vaisseau ou contenu illisible).`);
        continue;
      }
      let cleaned;
      try {
        cleaned = cleanEntry(raw);
      } catch (err) {
        this.warn(`Rôles des vaisseaux : vaisseau ${id}, entrée ignorée (${String(err?.message ?? 'illisible').slice(0, 100)}).`);
        continue;
      }
      if (cleaned.notes.length) this.warn(`Rôles des vaisseaux : vaisseau ${id}, ${cleaned.notes.join(', ')}.`);
      if (cleaned.entry) out.set(shipKey(commander, id), { commander, shipId: id, ...cleaned.entry });
    }
    return out;
  }

  /** Rôle enregistré du vaisseau `shipId` du commandant `commander` (null : sans commandant), en copie, ou null. */
  get(shipId, commander = null) {
    const e = this.ships.get(shipKey(commander, shipId));
    if (!e) return null;
    const { commander: _c, shipId: _s, ...rest } = e;
    return { ...rest, secondary: [...e.secondary] };
  }

  /**
   * Rôle qui s'applique au vaisseau `shipId` du modèle `type` du commandant `commander` : null si aucun, ou si le rôle a
   * été donné à un autre modèle qui portait ce numéro (vaisseau vendu, numéro réutilisé par le jeu). Le rôle d'un autre
   * commandant ne s'applique jamais, même au même numéro.
   */
  roleFor(shipId, type = null, commander = null) {
    const e = this.get(shipId, commander);
    if (!e) return null;
    if (e.type && type && e.type !== type) return null;
    return e;
  }

  /** Rôles d'un commandant (null : sans commandant), pour l'API : { "43": { primary, secondary } }. */
  view(commander = null) {
    const mine = byShipId([...this.ships.values()].filter((e) => e.commander === commander));
    return Object.fromEntries(mine.map((e) => [String(e.shipId), { primary: e.primary, secondary: [...e.secondary] }]));
  }

  /** Il reste des rôles sans commandant (fichier de la version 1, ou donnés avant qu'un commandant soit connu). */
  hasUnowned() {
    return [...this.ships.values()].some((e) => e.commander === null);
  }

  toJSON() {
    const ships = {};
    const commanders = {};
    for (const e of byShipId(this.ships.values())) {
      if (e.commander === null) ships[String(e.shipId)] = fileEntry(e);
      else (commanders[e.commander] ??= {})[String(e.shipId)] = fileEntry(e);
    }
    return { version: ROLES_FILE_VERSION, ships, commanders: Object.fromEntries(Object.keys(commanders).sort().map((c) => [c, commanders[c]])) };
  }

  /**
   * Avant toute écriture : fichier pas relu (au démarrage, ou au dernier essai), on le relit d'abord. Toujours pas
   * lisible : erreur (err.unread), rien n'est écrit. Sinon l'écriture partirait d'une table vide et effacerait les rôles
   * de tous les autres vaisseaux, sans copie.
   */
  ensureRead() {
    if (!this.unread) return;
    this.load();
    if (!this.unread) return;
    const name = path.basename(this.file);
    const why = {
      erreur: `${name} n'a pas pu être relu (fichier verrouillé par un autre programme, ou droits refusés)`,
      illisible: `${name} est illisible et n'a pas pu être mis de côté`,
      imprevu: `${name} n'a pas pu être relu (${this.unreadWhy})`,
    }[this.unread];
    const err = new Error(`${why} ; rien n'est écrit, pour ne pas effacer les rôles qu'il garde. Ferme le programme qui le tient (antivirus, synchronisation) puis réessaie, ou relance l'app.`);
    err.unread = true;
    throw err;
  }

  /** Écrit la table `next` puis, seulement si l'écriture a réussi, la garde (rien de changé en mémoire sinon). */
  commit(next) {
    if (this.unread) throw Object.assign(new Error("Rôles des vaisseaux non relus : rien n'est écrit."), { unread: true }); // garde-fou : ensureRead passe avant
    const before = this.ships;
    this.ships = next;
    try {
      writeJsonAtomic(this.file, this.toJSON());
    } catch (err) {
      this.ships = before;
      throw err;
    }
  }

  /**
   * Donne (ou retire, si rôle vide) le rôle d'un vaisseau du commandant `commander` (null : commandant inconnu). `role`
   * doit venir de checkRole / checkRoleBody. Un rôle redonné n'est plus « rattaché d'office ».
   * @returns {object|null} l'entrée enregistrée, ou null si le vaisseau n'a plus de rôle
   */
  set(shipId, role, { type = null, commander = null } = {}) {
    if (parseShipId(shipId) === null) throw new Error(`Vaisseau invalide : ${shipId}.`);
    if (commander !== null && !isCommanderId(commander)) throw new Error('Commandant invalide.');
    const checked = checkRole(role);
    if (!checked.ok) throw new Error(checked.error);
    this.ensureRead();
    const key = shipKey(commander, shipId);
    const next = new Map(this.ships);
    if (!hasRole(checked.role)) next.delete(key);
    else {
      const t = shipType(type) ?? (this.ships.get(key)?.type || null);
      next.set(key, { commander, shipId, ...checked.role, type: t, at: new Date(this.now()).toISOString() });
    }
    this.commit(next);
    return this.get(shipId, commander);
  }

  /** Efface le rôle d'un vaisseau d'un commandant. @returns {boolean} il en avait un (fichier pas relu : erreur, voir ensureRead) */
  remove(shipId, commander = null) {
    this.ensureRead();
    const key = shipKey(commander, shipId);
    if (!this.ships.has(key)) return false;
    const next = new Map(this.ships);
    next.delete(key);
    this.commit(next);
    return true;
  }

  /**
   * Vente relue dans le journal (`at` : son horodatage), par le commandant `commander` : efface le rôle de SON vaisseau
   * s'il a été donné avant la vente (il visait le vaisseau vendu). Donné après, il vise le nouveau vaisseau qui a repris
   * ce numéro : gardé. Le vaisseau d'un autre commandant au même numéro n'est jamais touché.
   * @returns {boolean} effacé
   */
  soldAt(shipId, at, commander = null) {
    this.ensureRead();
    const e = this.ships.get(shipKey(commander, shipId));
    if (!e) return false;
    const sold = Date.parse(at);
    const given = e.at ? Date.parse(e.at) : NaN;
    if (Number.isFinite(sold) && Number.isFinite(given) && given > sold) return false;
    return this.remove(shipId, commander);
  }

  /**
   * Rattache les rôles sans commandant au commandant `commander` (le plus vu dans les journaux, ou le seul) : marqués
   * « guessed » (rattachés d'office). Un rôle que ce commandant a déjà pour ce numéro passe avant. Rien à rattacher, ou
   * commandant inconnu : rien n'est écrit.
   * @returns {number} rôles rattachés
   */
  adopt(commander) {
    if (!isCommanderId(commander) || !this.hasUnowned()) return 0;
    this.ensureRead();
    const next = new Map();
    let n = 0;
    for (const [key, e] of this.ships) if (e.commander !== null) next.set(key, e);
    for (const e of this.ships.values()) {
      if (e.commander !== null) continue;
      const key = shipKey(commander, e.shipId);
      if (next.has(key)) continue; // le sien d'abord : le rôle sans commandant est abandonné
      next.set(key, { ...e, commander, guessed: true });
      n++;
    }
    this.commit(next);
    return n;
  }
}
