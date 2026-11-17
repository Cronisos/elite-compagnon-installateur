// État courant du jeu (commandant, solde, vaisseau, position, cargaison),
// reconstruit à partir des journaux et des fichiers d'état. Partagé par tous les modules.

import { EventEmitter } from 'node:events';
import { isOwnShipType } from './boarding.js';
import { shipType } from './shipRoles.js';
import { nomModele } from './ship.js';
import { commanderIdOf, commanderOf } from './commander.js';

export const GAME_STATE_EVENTS = [
  'LoadGame', 'Commander', 'Loadout', 'Location', 'Docked', 'Undocked',
  'FSDJump', 'CarrierJump', 'Cargo', 'CargoTransfer', 'Died', 'ShieldState',
  'ShipyardSwap', 'ShipyardNew', 'ShipyardBuy',
];

/**
 * Événements qui donnent le nom en clair d'un modèle de vaisseau : [champ du modèle, champ du nom].
 * Loadout ne le donne jamais (0 sur 232 dans les journaux du joueur, 7 nov. 2026) : sans ces noms appris, l'état
 * gardait l'ancien vaisseau après un échange au chantier (« Type-11 Prospector » avec l'équipement du Panther).
 */
const NOMS_MODELES = {
  LoadGame: ['Ship', 'Ship_Localised'],
  ShipyardSwap: ['ShipType', 'ShipType_Localised'],
  ShipyardNew: ['ShipType', 'ShipType_Localised'],
  ShipyardBuy: ['ShipType', 'ShipType_Localised'],
};

export class GameState extends EventEmitter {
  constructor() {
    super();
    this.shipNames = new Map(); // modèle (« panthermkii ») → nom en clair ; ne repart pas de zéro avec reset()
    this.reset();
    this.changeTimer = null;
  }

  reset() {
    // Commandant chargé (core/commander.js : FID du LoadGame, sinon son nom), ou null. Hors de l'état diffusé à
    // l'interface : le FID reste dans le serveur. Les données rangées par vaisseau le sont par (commandant, ShipID).
    this.commanderId = null;
    this.state = {
      commander: null,
      balance: null,
      balanceAt: null,
      ship: null,
      loadout: null, // { cargoCapacity, unladenMass, maxJumpRange, fuelMain, fsd }
      system: null,
      systemAddress: null,
      station: null,
      marketId: null,
      docked: false,
      cargo: [], // [{ name, label, count }]
      cargoCount: 0,
      legalState: null,
      shieldsUp: true,
      destination: null,
      lastDiedAt: null,
    };
  }

  /** Signale un changement (regroupé pour ne pas inonder le navigateur). */
  changed() {
    if (this.changeTimer) return;
    this.changeTimer = setTimeout(() => {
      this.changeTimer = null;
      this.emit('change', this.snapshot());
    }, 250);
  }

  setBalance(value, at) {
    if (typeof value !== 'number') return;
    this.state.balance = value;
    this.state.balanceAt = at || null;
  }

  /** Retient le nom en clair d'un modèle de vaisseau, quand l'événement le donne. */
  learnShipName(ev) {
    const champs = NOMS_MODELES[ev.event];
    const type = champs && shipType(ev[champs[0]]);
    const nom = champs && typeof ev[champs[1]] === 'string' ? ev[champs[1]].trim() : '';
    if (type && nom && nom.length <= 60 && !nom.startsWith('$')) this.shipNames.set(type, nom); // « $TacticalSuit…; » : nom interne, pas en clair
  }

  applyEvent(ev) {
    const s = this.state;
    this.learnShipName(ev);
    // Commandant de l'événement : celui que le lecteur des journaux y a noté, sinon celui du LoadGame ou du Commander
    const commanderId = commanderOf(ev) ?? commanderIdOf(ev);
    if (commanderId) this.commanderId = commanderId;
    switch (ev.event) {
      case 'LoadGame':
        s.commander = ev.Commander ?? s.commander;
        // Jeu lancé en SRV ou à pied : le vaisseau reste celui d'avant (son récapitulatif suivra au retour à bord)
        if (isOwnShipType(ev.Ship)) s.ship = ev.Ship_Localised || ev.Ship;
        this.setBalance(ev.Credits, ev.timestamp);
        break;
      case 'Commander':
        s.commander = ev.Name ?? s.commander;
        break;
      case 'Loadout':
        // Le vaisseau du récapitulatif, toujours : son nom appris, sinon le nom connu du modèle, sinon le modèle du journal
        s.ship = this.shipNames.get(shipType(ev.Ship)) || nomModele(ev.Ship) || ev.Ship || s.ship;
        s.loadout = parseLoadout(ev);
        break;
      case 'ShipyardSwap':
      case 'ShipyardNew':
      case 'ShipyardBuy':
        return; // noms appris plus haut ; le vaisseau change avec le récapitulatif qui suit
      case 'Location':
        s.system = ev.StarSystem;
        s.systemAddress = ev.SystemAddress ?? s.systemAddress;
        s.docked = !!ev.Docked;
        s.station = ev.Docked ? ev.StationName : null;
        s.marketId = ev.Docked ? ev.MarketID : null;
        break;
      case 'Docked':
        s.system = ev.StarSystem;
        s.systemAddress = ev.SystemAddress ?? s.systemAddress;
        s.station = ev.StationName;
        s.marketId = ev.MarketID;
        s.docked = true;
        break;
      case 'Undocked':
        s.docked = false;
        s.station = null;
        s.marketId = null;
        break;
      case 'FSDJump':
      case 'CarrierJump':
        s.system = ev.StarSystem;
        s.systemAddress = ev.SystemAddress ?? s.systemAddress;
        if (ev.event === 'FSDJump') {
          s.docked = false;
          s.station = null;
        }
        break;
      case 'Cargo':
        if (ev.Vessel && ev.Vessel !== 'Ship') break;
        s.cargoCount = ev.Count ?? s.cargoCount;
        if (Array.isArray(ev.Inventory)) s.cargo = parseInventory(ev.Inventory);
        else if (ev.Count === 0) s.cargo = [];
        break;
      // Le jeu n'écrit pas la soute du vaisseau tant qu'on est en SRV : on y reporte les transferts SRV ↔ vaisseau
      case 'CargoTransfer':
        for (const t of ev.Transfers || []) {
          const sign = t.Direction === 'toship' ? 1 : t.Direction === 'tosrv' ? -1 : 0;
          if (!sign || !t.Count) continue;
          const name = String(t.Type || '').toLowerCase();
          const item = s.cargo.find((c) => c.name === name);
          if (item) item.count = Math.max(0, item.count + sign * t.Count);
          else if (sign > 0) s.cargo.push({ name, label: t.Type_Localised || capitalize(t.Type), count: t.Count });
          s.cargoCount = Math.max(0, (s.cargoCount || 0) + sign * t.Count);
        }
        s.cargo = s.cargo.filter((c) => c.count > 0);
        break;
      case 'Died':
        s.lastDiedAt = ev.timestamp;
        s.cargo = [];
        s.cargoCount = 0;
        break;
      case 'ShieldState':
        s.shieldsUp = !!ev.ShieldsUp;
        break;
      default:
        return;
    }
    this.changed();
  }

  applyStatus(st) {
    const s = this.state;
    const before = `${s.balance}|${s.legalState}|${s.destination?.Name}|${s.loadout?.fuelMain}`;
    this.setBalance(st.Balance, st.timestamp);
    if (st.LegalState) s.legalState = st.LegalState;
    s.destination = st.Destination || null;
    if (st.Fuel && s.loadout) s.loadout.fuelMain = st.Fuel.FuelMain;
    const after = `${s.balance}|${s.legalState}|${s.destination?.Name}|${s.loadout?.fuelMain}`;
    if (before !== after) this.changed();
  }

  applyCargo(c) {
    if (c.Vessel && c.Vessel !== 'Ship') return;
    this.state.cargoCount = c.Count ?? this.state.cargoCount;
    if (Array.isArray(c.Inventory)) this.state.cargo = parseInventory(c.Inventory);
    this.changed();
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }
}

function parseInventory(items) {
  return items.map((i) => ({
    name: String(i.Name || '').toLowerCase(),
    label: i.Name_Localised || capitalize(i.Name),
    count: i.Count || 0,
    // Cargaison de mission : réservée à la mission (le module Colonisation ne la compte pas pour un chantier)
    ...(Number.isSafeInteger(i.MissionID) ? { missionId: i.MissionID } : {}),
  }));
}

function capitalize(s) {
  s = String(s || '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Extrait du Loadout ce qui sert aux calculs (soute, masse, FSD). */
export function parseLoadout(ev) {
  // Modules, modificateurs : des listes d'objets, sinon ignorés (un Loadout abîmé ne fait plus échouer l'état du jeu)
  const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
  const fsdModule = list(ev.Modules).find((m) => m.Slot === 'FrameShiftDrive');
  let fsd = null;
  if (fsdModule) {
    const item = String(fsdModule.Item || '').toLowerCase();
    const m = /size(\d)_class(\d)/.exec(item);
    const mods = list(fsdModule.Engineering?.Modifiers);
    const mod = (label) => mods.find((x) => x.Label === label)?.Value ?? null;
    fsd = {
      item,
      size: m ? Number(m[1]) : null,
      cls: m ? Number(m[2]) : null,
      overcharge: item.includes('overcharge'),
      optimalMass: mod('FSDOptimalMass'),
      maxFuelPerJump: mod('MaxFuelPerJump'),
    };
  }
  return {
    ship: ev.Ship,
    cargoCapacity: ev.CargoCapacity ?? null,
    unladenMass: ev.UnladenMass ?? null,
    maxJumpRange: ev.MaxJumpRange ?? null,
    fuelCapacity: ev.FuelCapacity?.Main ?? null,
    fuelMain: ev.FuelCapacity?.Main ?? null,
    fsd,
  };
}
