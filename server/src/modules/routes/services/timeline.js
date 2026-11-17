// Transforme les événements bruts du journal en une chronologie simplifiée,
// où chaque achat/vente connaît sa station et son système.

import { MeritCounter } from '../../../core/merits.js';

export const ROUTE_EVENTS = [
  'Docked', 'Undocked', 'Location', 'FSDJump', 'CarrierJump',
  'MarketBuy', 'MarketSell',
  'RefuelAll', 'RefuelPartial', 'RepairAll', 'Repair', 'BuyAmmo',
  'NpcCrewPaidWage', 'Powerplay', 'PowerplayMerits', 'Died', 'Resurrect',
  'Loadout', 'ShieldState',
  ...ACTIVITY_EVENTS_LIST(),
];

/**
 * Actions du joueur qui prouvent qu'il joue (sert à détecter les pauses).
 * Les messages reçus, les signaux détectés, etc. arrivent même quand on est absent : exclus.
 */
function ACTIVITY_EVENTS_LIST() {
  return [
    'StartJump', 'SupercruiseEntry', 'SupercruiseExit', 'SupercruiseDestinationDrop',
    'DockingRequested', 'DockingGranted', 'FSDTarget', 'NavRoute', 'ApproachBody', 'LeaveBody',
    'Touchdown', 'Liftoff', 'Market', 'LoadGame', 'Shutdown', 'Music',
  ];
}
const ACTIVITY_EVENTS = new Set(ACTIVITY_EVENTS_LIST());

/** "$bauxite_name;" ou "Bauxite" → "bauxite" */
export function commodityKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^\$/, '')
    .replace(/_name;$/, '')
    .trim();
}

export function capitalize(s) {
  s = String(s || '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * @param {object[]} events événements du journal, dans l'ordre chronologique
 * @returns {object[]} entrées { t, kind, system, station, marketId, ... }
 */
export function buildTimeline(events) {
  const builder = new TimelineBuilder();
  for (const ev of events) builder.add(ev);
  return builder.entries;
}

/**
 * Chronologie tenue au fil du journal : chaque événement y ajoute ses entrées, sans relire les précédents. Le suivi des
 * routes ne garde donc plus les événements bruts (un FSDJump pèse plusieurs Ko, et il les gardait tous depuis le
 * premier journal), seulement ces entrées et la station de chaque marché vu.
 */
export class TimelineBuilder {
  entries = []; // { t, kind, system, station, marketId, ... }
  markets = new Map(); // MarketID → { station, system }
  system = null;
  station = null;
  marketId = null;
  // Mérites réels (core/merits.js) : le doublon d'une ligne PowerplayMerits est retiré à la suivante, comme dans les
  // bilans et le combat. Total de départ : l'événement Powerplay de la connexion.
  merites = new MeritCounter();

  /** Ajoute ce que l'événement apporte à la chronologie. */
  add(ev) {
    if (!ev || typeof ev !== 'object') return;
    const out = this.entries;
    const markets = this.markets;
    let { system, station, marketId } = this;
    const push = (t, kind, extra = {}) => {
      out.push({ t, kind, system, station, marketId, ...extra });
    };
    const t = Date.parse(ev.timestamp);
    if (!Number.isFinite(t)) return;
    switch (ev.event) {
      case 'Docked':
        system = ev.StarSystem;
        station = ev.StationName;
        marketId = ev.MarketID ?? null;
        if (marketId != null) markets.set(marketId, { station, system });
        push(t, 'dock', { pad: largestPad(ev.LandingPads), stationType: ev.StationType || null });
        break;
      case 'Location':
        system = ev.StarSystem;
        if (ev.Docked) {
          station = ev.StationName;
          marketId = ev.MarketID ?? null;
          if (marketId != null) markets.set(marketId, { station, system });
          push(t, 'dock', { fromLocation: true });
        } else {
          station = null;
          marketId = null;
        }
        break;
      case 'Undocked':
        push(t, 'undock');
        station = null;
        marketId = null;
        break;
      case 'FSDJump':
      case 'CarrierJump':
        system = ev.StarSystem;
        if (ev.event === 'FSDJump') {
          station = null;
          marketId = null;
        }
        push(t, 'jump', { dist: ev.JumpDist ?? 0 });
        break;
      case 'MarketBuy':
      case 'MarketSell': {
        // La station est retrouvée grâce au MarketID (plus sûr que l'état courant)
        const known = markets.get(ev.MarketID);
        const entry = {
          commodity: commodityKey(ev.Type),
          name: ev.Type_Localised || capitalize(commodityKey(ev.Type)),
          count: ev.Count || 0,
        };
        if (ev.event === 'MarketBuy') {
          Object.assign(entry, { price: ev.BuyPrice || 0, total: ev.TotalCost || 0 });
        } else {
          Object.assign(entry, { price: ev.SellPrice || 0, total: ev.TotalSale || 0 });
        }
        out.push({
          t,
          kind: ev.event === 'MarketBuy' ? 'buy' : 'sell',
          system: known?.system ?? system,
          station: known?.station ?? station,
          marketId: ev.MarketID ?? marketId,
          ...entry,
        });
        break;
      }
      case 'RefuelAll':
      case 'RefuelPartial':
        push(t, 'fuel', { cost: ev.Cost || 0 });
        break;
      case 'RepairAll':
      case 'Repair':
        push(t, 'repair', { cost: ev.Cost || 0 });
        break;
      case 'BuyAmmo':
        push(t, 'ammo', { cost: ev.Cost || 0 });
        break;
      case 'NpcCrewPaidWage':
        push(t, 'wage', { cost: ev.Amount || 0 });
        break;
      case 'Powerplay':
        this.merites.setTotal(ev.Merits);
        break;
      case 'PowerplayMerits':
        push(t, 'merits', { merits: this.merites.gain(ev) }); // négatif quand le jeu retire un doublon
        break;
      case 'Died':
        push(t, 'died');
        break;
      case 'Resurrect':
        // Le rachat peut valoir 0 (vaisseau acheté en ARX) : on lit toujours la valeur
        push(t, 'rebuy', { cost: ev.Cost || 0 });
        break;
      case 'Loadout':
        push(t, 'loadout', { cargoCapacity: ev.CargoCapacity ?? null });
        break;
      case 'ShieldState':
        push(t, 'shields', { up: !!ev.ShieldsUp });
        break;
      default:
        if (!ACTIVITY_EVENTS.has(ev.event)) break;
        if (ev.event === 'Music') {
          // Seul le menu principal compte : c'est une pause
          if (ev.MusicTrack === 'MainMenu') push(t, 'act', { menu: true });
        } else {
          push(t, 'act', { menu: ev.event === 'Shutdown' });
        }
        break;
    }
    this.system = system;
    this.station = station;
    this.marketId = marketId;
  }
}

/** Plus grande plateforme d'atterrissage de la station : "L", "M" ou "S". */
function largestPad(pads) {
  if (!pads) return null;
  if (pads.Large > 0) return 'L';
  if (pads.Medium > 0) return 'M';
  if (pads.Small > 0) return 'S';
  return null;
}

/**
 * Regroupe la chronologie en « passages à quai » : de l'amarrage au décollage.
 * Chaque passage contient ses achats et ses ventes.
 */
export function dockSessions(timeline) {
  const sessions = [];
  let cur = null;
  const close = () => {
    if (cur) sessions.push(cur);
    cur = null;
  };
  timeline.forEach((e, idx) => {
    if (e.kind === 'dock') {
      // Un "Location" au même endroit (relance du jeu) ne crée pas de nouveau passage
      if (cur && cur.marketId === e.marketId) return;
      close();
      cur = newSession(e, idx);
    } else if (e.kind === 'undock' || e.kind === 'jump' || e.kind === 'died') {
      close();
    } else if (e.kind === 'buy' || e.kind === 'sell') {
      if (!cur || cur.marketId !== e.marketId) {
        close();
        cur = newSession(e, idx);
      }
      (e.kind === 'buy' ? cur.buys : cur.sells).push(e);
      cur.endIdx = idx;
    }
  });
  close();
  return sessions;
}

function newSession(e, idx) {
  return {
    t: e.t,
    system: e.system,
    station: e.station,
    marketId: e.marketId,
    pad: e.pad ?? null,
    startIdx: idx,
    endIdx: idx,
    buys: [],
    sells: [],
  };
}

/** Agrège des achats/ventes par marchandise. */
export function aggregate(list) {
  const map = new Map();
  for (const x of list) {
    const a = map.get(x.commodity) || { commodity: x.commodity, name: x.name, count: 0, total: 0, t: x.t };
    a.count += x.count;
    a.total += x.total;
    map.set(x.commodity, a);
  }
  return [...map.values()]
    .map((a) => ({ ...a, price: a.count ? Math.round(a.total / a.count) : 0 }))
    .sort((a, b) => b.count - a.count);
}

/** Marchandise principale achetée pendant un passage (plus gros tonnage). */
export function primaryBuy(session) {
  return aggregate(session.buys)[0] || null;
}
