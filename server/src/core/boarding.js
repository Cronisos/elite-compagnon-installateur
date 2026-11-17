// Vaisseau du joueur et embarquement, d'après le journal : dans quel vaisseau à lui il est (ShipID), quand il en change
// vraiment, et le nom de chaque vaisseau (nom en jeu, modèle lisible). Sert aux rôles des vaisseaux (core/roleSwitch.js).
//
// Formes vérifiées dans les journaux de référence (23 oct.-7 nov. 2026, lecture seule) :
// - LoadGame : Ship, Ship_Localised, ShipID du vaisseau… ou du SRV si le jeu se lance en SRV (« MEV_Rhino » n° 40 et 44,
//   « TestBuggy » n° 32 ; SRV et vaisseaux partagent les numéros), ou de la combinaison à pied (« ExplorationSuit_Class1 »
//   n° 4293000002). Plusieurs LoadGame dans un même journal, de vaisseaux différents (25 oct.) : chacun est un lancement.
// - ShipyardBuy (sans numéro du nouveau vaisseau, StoreShipID ou SellShipID de l'ancien) puis ShipyardNew (NewShipID,
//   ShipType, ShipType_Localised pas toujours) puis Loadout du nouveau, à la seconde près.
// - ShipyardSwap (ShipID, ShipType, StoreShipID) puis Loadout du vaisseau pris.
// - Loadout du même vaisseau après l'équipement, après DockSRV (retour du SRV), après Resurrect (rachat) et après
//   Embark (retour à bord à pied) : ce n'est pas un changement de vaisseau.
// - Jeu lancé à pied près du Rhino (30 oct., LoadGame ExplorationSuit_Class1 n° 4293000002), puis Embark SRV:true et
//   plusieurs sorties, DockSRV et Loadout du vaisseau deux heures plus tard : le lancement compte dès l'Embark dans le
//   SRV (tu es avec ton vaisseau), pas au retour.
// - Embark / Disembark : SRV, Taxi, Multicrew, ID (vaisseau, ou SRV si SRV:true). Aucun Taxi:true ni Multicrew:true dans
//   ces journaux : taxi et équipage multijoueur sont traités d'après la documentation du journal (à vérifier en jeu).
// - Ventes : ShipyardSell (SellShipID), ShipyardBuy (SellShipID quand l'ancien est vendu), SellShipOnRebuy (SellShipId).
//
// Le vaisseau d'un autre CMDR (équipage multijoueur), un taxi, un chasseur, un SRV ou une combinaison ne sont jamais
// « ton vaisseau » : rien ne change, rien ne bascule. En taxi, de l'Embark Taxi au Disembark Taxi ; en équipage, du
// JoinACrew (ou Embark Multicrew) au QuitACrew, à pied compris (Disembark Multicrew : « tu sors du vaisseau d'un autre
// joueur », tu restes dans son équipage et peux y remonter) ; un LoadGame, un Shutdown ou ton propre vaisseau (Embark,
// sans Taxi ni Multicrew) y mettent fin aussi.
//
// Plusieurs commandants sur le même PC (core/commander.js) : chaque commandant a ses vaisseaux et ses numéros (le n° 1
// du compte principal n'est pas le n° 1 du second compte). Le tracker suit le commandant chargé ; un LoadGame d'un autre
// commandant est un changement de vaisseau, jamais « le même vaisseau » ni « un autre modèle sous ce numéro ».

import fs from 'node:fs';
import path from 'node:path';
import { cleanText } from './text.js';
import { referenceDir } from './paths.js';
import { parseShipId, shipType } from './shipRoles.js';
import { CommanderTracker } from './commander.js';

/** Événements du journal suivis (historique compris) pour connaître le vaisseau actuel et les noms. */
export const BOARDING_EVENTS = [
  'LoadGame', 'Loadout', 'ShipyardSwap', 'ShipyardNew', 'ShipyardBuy', 'ShipyardSell', 'SellShipOnRebuy',
  'ShipyardTransfer', 'StoredShips', 'SetUserShipName', 'Embark', 'Disembark', 'JoinACrew', 'QuitACrew', 'Shutdown',
];

/**
 * Modèles qui ne sont pas un vaisseau à soi : SRV (« testbuggy », « combat_multicrew_srv_01 », « mev_rhino », mesurés),
 * chasseurs (« …_fighter… »), combinaisons (« …Suit… », mesuré) et taxis (« adder_taxi », à vérifier).
 */
const NOT_OWN_SHIP = /buggy|_srv|rhino|fighter|suit|taxi/i;
export const isOwnShipType = (raw) => {
  const t = shipType(raw);
  return Boolean(t) && !NOT_OWN_SHIP.test(t);
};

/** Numéro de vaisseau lu dans le journal : un nombre, jamais un texte (le jeu écrit des nombres). */
const jid = (v) => (typeof v === 'number' ? parseShipId(v) : null);

const capitalize = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

// Noms officiels des modèles (table FDevIDs shipyard.csv, dans les données de référence téléchargées) : relue seulement
// si le fichier change. Sans elle, le nom interne, en capitales.
let shipyard = { stamp: null, names: new Map() };
function shipyardNames() {
  const file = path.join(referenceDir(), 'fdevids', 'shipyard.csv');
  let stamp = null;
  try {
    const st = fs.statSync(file);
    stamp = `${st.mtimeMs}:${st.size}`;
  } catch {
    return new Map();
  }
  if (stamp === shipyard.stamp) return shipyard.names;
  const names = new Map();
  try {
    const [head, ...rows] = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
    const keys = head.split(',');
    const iSymbol = keys.indexOf('symbol');
    const iName = keys.indexOf('name');
    for (const row of rows) {
      const v = row.split(',');
      const t = shipType(v[iSymbol]);
      const name = cleanText(v[iName]);
      if (t && name) names.set(t, name);
    }
  } catch {
    // illisible : noms internes
  }
  shipyard = { stamp, names };
  return names;
}

/** Modèle lisible : nom traduit vu dans le journal, sinon celui des données de référence, sinon le nom interne. */
export function modelName(type, localised = null) {
  return cleanText(localised) || shipyardNames().get(shipType(type)) || capitalize(type) || '';
}

export class ShipTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.current = null; // { id, type } : ton vaisseau (tu y es, ou tu en es sorti en SRV, à pied)
    this.running = false; // LoadGame vu, pas encore de Shutdown
    this.lastAt = null; // dernier horodatage vu (ms)
    this.away = null; // 'taxi' | 'crew' | null : à bord d'un vaisseau qui n'est pas le tien
    this.pendingLaunch = false; // partie lancée hors de ton vaisseau (à pied, en taxi) : l'embarquement compte comme lancement
    this.boardedAt = null; // dernier vrai changement de vaisseau (ms, relecture comprise) : un choix fait avant ne vaut plus
    this.switched = false; // commandant changé, pas encore remonté à bord : le prochain embarquement est un changement
    this.at = null; // horodatage de l'événement en cours (ms)
    this.commanders = new CommanderTracker(); // commandant chargé (core/commander.js), et ceux vus
    this.fleets = new Map(); // commandant (null : inconnu) → Map ShipID → { type, model (traduit), name (nom en jeu) }
    this.ships = this.fleetOf(null); // vaisseaux du commandant chargé
  }

  /** Commandant chargé (FID, sinon « nom:… »), ou null tant qu'aucun n'est connu. */
  get commander() {
    return this.commanders.current;
  }

  fleetOf(commander) {
    if (!this.fleets.has(commander)) this.fleets.set(commander, new Map());
    return this.fleets.get(commander);
  }

  /**
   * Suit le commandant de l'événement. Un autre commandant que le précédent (connu) : ses vaisseaux à lui, et plus de
   * vaisseau actuel (celui d'avant est à l'autre). Rend true si le commandant a changé.
   */
  followCommander(ev) {
    const before = this.commanders.current;
    const now = this.commanders.see(ev);
    if (now === before) return false;
    this.ships = this.fleetOf(now);
    // Commandant enfin connu (premier LoadGame) : les vaisseaux vus avant lui sont les siens
    if (before === null) {
      for (const [id, s] of this.fleets.get(null) ?? []) if (!this.ships.has(id)) this.ships.set(id, s);
      this.fleets.delete(null);
      if (this.current) this.current.commander = now;
      return true;
    }
    this.current = null;
    this.away = null;
    this.switched = true;
    return true;
  }

  info(id) {
    let s = this.ships.get(id);
    if (!s) {
      s = { type: null, model: null, name: null };
      this.ships.set(id, s);
    }
    return s;
  }

  learn(id, { type, model, name } = {}) {
    if (id === null) return;
    const s = this.info(id);
    if (shipType(type) && shipType(type) !== s.type) {
      // Autre modèle sous ce numéro (vaisseau vendu, numéro repris) : son nom traduit et son nom en jeu ne valent plus
      if (s.type) {
        s.model = null;
        s.name = null;
      }
      s.type = shipType(type);
    }
    if (cleanText(model)) s.model = cleanText(model);
    if (name !== undefined) s.name = cleanText(name) || null; // le jeu écrit parfois un nom fait d'espaces : sans nom
  }

  /** Modèle connu du vaisseau `id` (nom interne en minuscules), ou null. */
  typeOf(id) {
    return this.ships.get(id)?.type ?? (this.current?.id === id ? this.current.type : null) ?? null;
  }

  /** Ce qui, du vaisseau actuel, se voit à l'écran (sans lire la table des noms : appelé à chaque événement relu). */
  shownKey() {
    if (!this.current) return '';
    return JSON.stringify([this.commander, this.current.id, this.current.type, this.ships.get(this.current.id) ?? null]);
  }

  /** Vaisseau actuel : { shipId, type, model, name } (nom en jeu), ou null. */
  ship() {
    if (!this.current) return null;
    const s = this.ships.get(this.current.id) || {};
    const type = this.current.type || s.type || null;
    return { shipId: this.current.id, commander: this.commander, type, model: modelName(type, s.model), name: s.name || null };
  }

  /**
   * Tu es à bord de ton vaisseau `id` : rend l'embarquement ({ kind, shipId, previous }) ou null (toujours le même).
   * Un autre numéro, un autre modèle sous le même numéro, ou un vaisseau neuf (fresh) : changement. Le même au
   * lancement du jeu (launch, ou partie lancée à pied ou en taxi) : lancement.
   */
  board(id, type, { launch = false, fresh = false } = {}) {
    const previous = this.current?.id ?? null;
    const before = this.current?.type ?? null;
    const now = shipType(type) || this.ships.get(id)?.type || null;
    // Premier vaisseau après un changement de commandant : toujours un changement de vaisseau (jamais « le même »)
    const switched = this.switched;
    this.switched = false;
    this.current = { id, type: now, commander: this.commander };
    this.away = null;
    const changed = previous !== id || fresh || switched || Boolean(before && now && before !== now);
    // Vrai changement (pas la découverte de ton vaisseau au début du journal) : noté, même pendant la relecture
    if (changed && (previous !== null || fresh || switched)) this.boardedAt = this.at;
    if (!changed && !launch && !this.pendingLaunch) return null;
    this.pendingLaunch = false;
    return { kind: changed ? 'change' : 'launch', shipId: id, previous };
  }

  /**
   * Un événement du journal (relu ou en direct).
   * @returns {{ boarding: null | { kind: 'change'|'launch', shipId, previous }, sold: number[], changed: boolean }}
   *   boarding : tu montes dans ton vaisseau (change : un autre que le précédent ; launch : le même, au lancement du jeu) ;
   *   sold : vaisseaux vendus ; changed : vaisseau actuel ou noms changés ; commander : commandant de l'événement (ses
   *   ventes, son vaisseau) ; commanderChanged : autre commandant que l'événement d'avant (ou premier connu)
   */
  apply(ev) {
    const out = { boarding: null, sold: [], changed: false, commander: null, commanderChanged: false };
    const t = Date.parse(ev?.timestamp);
    this.at = Number.isFinite(t) ? t : null;
    if (Number.isFinite(t)) this.lastAt = this.lastAt === null ? t : Math.max(this.lastAt, t);
    const before = this.shownKey();
    out.commanderChanged = this.followCommander(ev);
    out.commander = this.commander; // commandant de l'événement : ses ventes, son embarquement
    switch (ev?.event) {
      case 'LoadGame': {
        this.running = true;
        this.away = null;
        const id = jid(ev.ShipID);
        if (id !== null && isOwnShipType(ev.Ship)) {
          this.learn(id, { type: ev.Ship, model: ev.Ship_Localised, ...(ev.ShipName !== undefined ? { name: ev.ShipName } : {}) });
          out.boarding = this.board(id, ev.Ship, { launch: true });
        } else if (/rhino|buggy|_srv/i.test(String(ev.Ship || '')) && this.current) {
          // Lancé en SRV : tu es avec ton vaisseau (le dernier connu), c'est un lancement
          this.pendingLaunch = false;
          out.boarding = { kind: 'launch', shipId: this.current.id, previous: this.current.id };
        } else {
          // À pied, en taxi, ou vaisseau inconnu : le lancement compte quand tu remontes à bord
          if (/taxi/i.test(String(ev.Ship || ''))) this.away = 'taxi';
          this.pendingLaunch = true;
        }
        break;
      }
      case 'Shutdown':
        this.running = false;
        this.away = null;
        break;
      case 'Loadout': {
        const id = jid(ev.ShipID);
        if (this.away || id === null || !isOwnShipType(ev.Ship)) break; // taxi, équipage d'un autre, chasseur, SRV
        this.learn(id, { type: ev.Ship, ...(ev.ShipName !== undefined ? { name: ev.ShipName } : {}) });
        out.boarding = this.board(id, ev.Ship);
        break;
      }
      case 'ShipyardSwap': {
        const id = jid(ev.ShipID);
        if (id === null || !isOwnShipType(ev.ShipType)) break;
        this.learn(id, { type: ev.ShipType, model: ev.ShipType_Localised });
        out.boarding = this.board(id, ev.ShipType);
        break;
      }
      case 'ShipyardNew': {
        const id = jid(ev.NewShipID);
        if (id === null || !isOwnShipType(ev.ShipType)) break;
        this.learn(id, { type: ev.ShipType, model: ev.ShipType_Localised, name: '' });
        // Vaisseau neuf : toujours un changement, même quand il reprend le numéro de l'ancien vendu à l'achat
        out.boarding = this.board(id, ev.ShipType, { fresh: true });
        break;
      }
      case 'ShipyardBuy': {
        // Le nouveau vaisseau arrive avec ShipyardNew ; ici, seulement l'ancien quand il est vendu
        const sold = jid(ev.SellShipID);
        if (sold !== null) out.sold.push(sold);
        break;
      }
      case 'ShipyardSell': {
        const sold = jid(ev.SellShipID);
        if (sold !== null) out.sold.push(sold);
        break;
      }
      case 'SellShipOnRebuy': {
        const sold = jid(ev.SellShipId ?? ev.SellShipID);
        if (sold !== null) out.sold.push(sold);
        break;
      }
      case 'ShipyardTransfer': {
        const id = jid(ev.ShipID);
        if (id !== null && isOwnShipType(ev.ShipType)) this.learn(id, { type: ev.ShipType, model: ev.ShipType_Localised });
        break;
      }
      case 'StoredShips':
        for (const x of [...(Array.isArray(ev.ShipsHere) ? ev.ShipsHere : []), ...(Array.isArray(ev.ShipsRemote) ? ev.ShipsRemote : [])]) {
          const id = jid(x?.ShipID);
          if (id !== null && isOwnShipType(x.ShipType)) this.learn(id, { type: x.ShipType, model: x.ShipType_Localised, ...(x.Name !== undefined ? { name: x.Name } : {}) });
        }
        break;
      case 'SetUserShipName': {
        const id = jid(ev.ShipID);
        if (id !== null && isOwnShipType(ev.Ship)) this.learn(id, { type: ev.Ship, name: ev.UserShipName });
        break;
      }
      case 'Embark': {
        if (ev.Taxi) this.away = 'taxi';
        else if (ev.Multicrew) this.away = 'crew';
        else if (ev.SRV) {
          // Partie lancée à pied, puis à bord du SRV de ton vaisseau : tu es avec lui, c'est le lancement
          if (this.pendingLaunch && this.current && !this.away) {
            this.pendingLaunch = false;
            out.boarding = { kind: 'launch', shipId: this.current.id, previous: this.current.id };
          }
        } else {
          const id = jid(ev.ID);
          if (id !== null) out.boarding = this.board(id, null);
        }
        break;
      }
      case 'Disembark':
        // Descendu du taxi : le trajet est fini. Descendu à pied du vaisseau de l'hôte (Multicrew) : toujours dans son
        // équipage, ton vaisseau n'est pas là (l'équipage finit au QuitACrew)
        if (ev.Taxi) this.away = null;
        break;
      case 'JoinACrew':
        this.away = 'crew';
        break;
      case 'QuitACrew':
        this.away = null;
        break;
      default:
        break;
    }
    for (const id of out.sold) {
      this.ships.delete(id);
      // Vendu en en achetant un autre (ShipyardBuy, SellOldShip) : tu n'as plus ce vaisseau ; ShipyardNew suit
      if (this.current?.id === id) this.current = null;
    }
    out.changed = Boolean(out.boarding) || out.sold.length > 0 || this.shownKey() !== before;
    return out;
  }
}
