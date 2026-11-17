// Flotte et configuration des vaisseaux, lues dans le journal, et rangs des ingénieurs.

import { HARDPOINT_SIZES } from '../../../core/reference/labels.js';
import { CommanderTracker } from '../../../core/commander.js';

export const FLEET_EVENTS = [
  'Loadout', 'StoredShips', 'ShipyardSell', 'SellShipOnRebuy', 'ShipyardBuy', 'ShipyardSwap',
  'ShipyardNew', 'EngineerProgress', 'LoadGame', 'EngineerCraft',
];

/** Le jeu n'écrit pas de Loadout après une modification : on la reporte sur le module concerné. */
function applyCraft(ship, ev) {
  const modules = Array.isArray(ship?.loadout?.Modules) ? ship.loadout.Modules : null;
  const target = modules?.find((m) => typeof m?.Slot === 'string' && typeof ev.Slot === 'string' && m.Slot.toLowerCase() === ev.Slot.toLowerCase());
  if (!target || String(target.Item).toLowerCase() !== String(ev.Module).toLowerCase()) return;
  const crafted = {
    ...target,
    Engineering: {
      ...target.Engineering,
      Engineer: ev.Engineer,
      EngineerID: ev.EngineerID,
      BlueprintID: ev.BlueprintID,
      BlueprintName: ev.BlueprintName,
      Level: ev.Level,
      Quality: ev.Quality,
      ExperimentalEffect: ev.ExperimentalEffect,
      ExperimentalEffect_Localised: ev.ExperimentalEffect_Localised,
    },
  };
  // Copie : l'événement Loadout d'origine sert encore aux prochains recalculs
  ship.loadout = { ...ship.loadout, Modules: modules.map((m) => (m === target ? crafted : m)) };
}

/**
 * @returns {{ ships: Map<number, object>, currentShipId: number|null, engineers: Map<string, object> }}
 */
export function buildFleet(events) {
  const fleet = new Fleet();
  for (const ev of events) fleet.apply(ev);
  return fleet;
}

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const list = (v) => (Array.isArray(v) ? v : []);

/**
 * Flotte tenue au fil du journal : chaque événement la met à jour, sans relire les précédents. Le module ne garde donc
 * plus tous les Loadout depuis le premier journal (plusieurs Ko chacun), seulement le dernier de chaque vaisseau, et
 * ne refait plus toute la flotte à chaque événement.
 */
export class Fleet {
  // Plusieurs commandants sur le même PC (core/commander.js) : chaque commandant a sa flotte, ses numéros. Le n° 1 du
  // second compte n'est jamais le n° 1 du compte principal (ni son Loadout, ni son plan).
  commanders = new CommanderTracker();
  fleets = new Map(); // commandant (null : inconnu) → Map ShipID → vaisseau
  ships = this.fleetOf(null); // flotte du commandant chargé : ShipID → { shipId, type, name, ident, loadout, system, lastSeen }
  engineers = new Map(); // nom → { id, progress, rank }
  currentShipId = null;

  /** Commandant chargé (FID, sinon « nom:… »), ou null. */
  get commander() {
    return this.commanders.current;
  }

  fleetOf(commander) {
    if (!this.fleets.has(commander)) this.fleets.set(commander, new Map());
    return this.fleets.get(commander);
  }

  /** Vaisseau `shipId` du commandant `commander` (null : celui d'avant les commandants, s'il est seul), ou null. */
  shipOf(commander, shipId) {
    if (!Number.isInteger(shipId)) return null;
    if (commander === null) return this.commanders.single() ? this.ships.get(shipId) ?? null : null;
    return this.fleets.get(commander)?.get(shipId) ?? null;
  }

  /** Suit le commandant de l'événement : un autre commandant, c'est une autre flotte (et plus de vaisseau actuel). */
  followCommander(ev) {
    const before = this.commanders.current;
    const now = this.commanders.see(ev);
    if (now === before) return;
    const unknown = before === null ? this.fleets.get(null) : null;
    this.ships = this.fleetOf(now);
    if (unknown) {
      // Commandant enfin connu : les vaisseaux vus avant lui sont les siens
      for (const [id, s] of unknown) if (!this.ships.has(id)) this.ships.set(id, s);
      this.fleets.delete(null);
      return;
    }
    this.currentShipId = null;
  }

  // Un événement sans identifiant de vaisseau (format changé, journal d'un autre outil) est ignoré : il faisait
  // échouer toute la reconstruction, à chaque événement suivant puis à chaque démarrage (serveur arrêté)
  touch(id, type) {
    if (!Number.isInteger(id)) return null;
    const s = this.ships.get(id) || { shipId: id, type: null, name: '', ident: '', loadout: null, system: null, lastSeen: null };
    if (type) s.type = String(type).toLowerCase();
    this.ships.set(id, s);
    return s;
  }

  apply(ev) {
    if (!ev || typeof ev !== 'object') return;
    this.followCommander(ev);
    const { ships, engineers } = this;
    const touch = (id, type) => this.touch(id, type);
    switch (ev.event) {
      case 'LoadGame':
        // ShipID entier seulement, comme les autres événements de flotte : un texte ne désigne aucun vaisseau
        if (touch(ev.ShipID, ev.Ship)) this.currentShipId = ev.ShipID;
        break;
      case 'Loadout': {
        const s = touch(ev.ShipID, ev.Ship);
        if (!s) break;
        s.name = text(ev.ShipName);
        s.ident = text(ev.ShipIdent);
        s.loadout = ev;
        s.lastSeen = ev.timestamp;
        this.currentShipId = ev.ShipID;
        break;
      }
      case 'StoredShips':
        for (const x of [...list(ev.ShipsHere), ...list(ev.ShipsRemote)]) {
          const s = touch(x?.ShipID, x?.ShipType);
          if (!s) continue;
          if (text(x.Name)) s.name = text(x.Name);
          s.system = x.StarSystem || ev.StarSystem || s.system;
        }
        break;
      case 'ShipyardSwap':
        if (touch(ev.ShipID, ev.ShipType)) this.currentShipId = ev.ShipID;
        break;
      case 'ShipyardNew':
        touch(ev.NewShipID, ev.ShipType);
        break;
      // Vaisseau vendu à l'achat d'un autre (SellOldShip, SellShipID) : il disparaît. Le neuf reprend souvent son numéro
      // (R17 de itineraryRules.js : 3 fois sur 3 dans les journaux de référence), sans jamais hériter de son Loadout.
      // Gardé à l'achat (StoreOldShip) : rien ne change, il reste garé avec ses modules.
      case 'ShipyardBuy':
        if (ev.SellShipID != null) ships.delete(ev.SellShipID);
        break;
      case 'ShipyardSell':
        ships.delete(ev.SellShipID);
        break;
      case 'SellShipOnRebuy':
        ships.delete(ev.SellShipId ?? ev.SellShipID);
        break;
      case 'EngineerCraft':
        applyCraft(ships.get(this.currentShipId), ev);
        break;
      case 'EngineerProgress': {
        const engs = Array.isArray(ev.Engineers) ? ev.Engineers : [ev];
        for (const e of engs) {
          if (!e || typeof e.Engineer !== 'string' || !e.Engineer) continue;
          const prev = engineers.get(e.Engineer) || {};
          engineers.set(e.Engineer, {
            id: e.EngineerID,
            progress: e.Progress || prev.progress || null,
            rank: e.Rank ?? prev.rank ?? null,
          });
        }
        break;
      }
      default:
        break;
    }
  }
}

/** Configuration actuelle d'un module d'après le Loadout. */
function currentOf(m) {
  if (!m) return null;
  const e = m.Engineering;
  return {
    module: String(m.Item || '').toLowerCase(),
    blueprint: e?.BlueprintName || null,
    grade: e?.Level || 0,
    quality: e?.Quality ?? 0,
    experimental: e?.ExperimentalEffect || null,
    experimentalLabel: e?.ExperimentalEffect_Localised || null,
    engineer: e?.Engineer || null,
  };
}

const IGNORED_SLOTS = /^(PaintJob|Decal\d|VesselVoice|ShipCockpit|CargoHatch|ShipName\d|ShipID\d|Bobble\d+|ShipKit|WeaponColour|EngineColour|StringLights)/i;

/**
 * Associe les modules du Loadout aux emplacements du vaisseau (données coriolis).
 * Le journal numérote les emplacements internes avec des trous (Slot08 puis Slot13) :
 * on associe par taille, dans l'ordre, plutôt que par numéro.
 * Vaisseau inconnu de coriolis : emplacements reconstruits depuis le journal seul.
 */
export function mapLoadout(ref, shipKey, loadout) {
  const modules = (Array.isArray(loadout?.Modules) ? loadout.Modules : []).filter((m) => m && typeof m === 'object' && typeof m.Slot === 'string' && !IGNORED_SLOTS.test(m.Slot));
  const bySlot = new Map(modules.map((m) => [m.Slot, m]));
  const used = new Set();
  const take = (name) => {
    const m = bySlot.get(name);
    if (m) used.add(name);
    return m;
  };

  const slots = ref.shipSlots(shipKey);
  if (!slots) return journalOnlySlots(modules);

  const sizeOf = (name) => Number(/_Size(\d+)/i.exec(name)?.[1] ?? NaN);
  const num = (name) => Number(/(\d+)/.exec(name)?.[1] ?? 0);
  const journalInternal = modules.map((m) => m.Slot).filter((s) => /^(Slot|Military|Cargo|Passenger)\d+/i.test(s)).sort((a, b) => num(a) - num(b));
  const nextInternal = (prefix, size) =>
    journalInternal.find((s) => !used.has(s) && s.toLowerCase().startsWith(prefix) && (size == null || Number.isNaN(sizeOf(s)) || sizeOf(s) === size));

  const hpCounters = {};
  const out = slots.map((slot) => {
    let m = null;
    let journal = null;
    if (slot.key === 'std-bh') journal = 'Armour';
    else if (slot.group === 'standard') journal = slot.journal;
    else if (slot.group === 'hardpoint' || slot.group === 'utility') {
      const prefix = HARDPOINT_SIZES[slot.size];
      hpCounters[prefix] = (hpCounters[prefix] || 0) + 1;
      journal = `${prefix}Hardpoint${hpCounters[prefix]}`;
    } else if (slot.restriction === 'PlanetaryApproachSuite') journal = 'PlanetaryApproachSuite';
    else if (slot.restriction === 'Military') journal = nextInternal('military', null);
    else if (slot.restriction === 'Cargo') journal = nextInternal('cargo', null);
    else if (slot.restriction === 'Passenger') journal = nextInternal('passenger', null); // Lynx Highliner : « Passenger01 »
    else journal = nextInternal('slot', slot.size);
    if (journal) m = take(journal);
    return { ...slot, journalSlot: journal || null, current: currentOf(m) };
  });

  // Modules du journal non associés (cas imprévu) : ajoutés tels quels
  for (const m of modules) {
    if (used.has(m.Slot)) continue;
    out.push({ key: `j-${m.Slot}`, group: 'internal', size: sizeOf(m.Slot) || null, label: m.Slot, journalSlot: m.Slot, current: currentOf(m) });
  }
  return out;
}

function journalOnlySlots(modules) {
  return modules.map((m) => {
    const s = m.Slot;
    const hp = /^(Huge|Large|Medium|Small|Tiny)Hardpoint/i.exec(s);
    const size = hp
      ? { huge: 4, large: 3, medium: 2, small: 1, tiny: 0 }[hp[1].toLowerCase()]
      : Number(/_Size(\d+)/i.exec(s)?.[1] ?? /size(\d)/.exec(m.Item)?.[1] ?? 0) || null;
    const group = s === 'Armour' || /^(PowerPlant|MainEngines|FrameShiftDrive|LifeSupport|PowerDistributor|Radar|FuelTank)$/.test(s)
      ? 'standard'
      : hp ? (size === 0 ? 'utility' : 'hardpoint') : 'internal';
    return { key: `j-${s}`, group, size, label: s, journalSlot: s, current: currentOf(m) };
  });
}
