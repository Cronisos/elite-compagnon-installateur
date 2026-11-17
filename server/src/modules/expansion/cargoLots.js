// Provenance de la soute, par lot : où chaque tonne a été minée, achetée ou ramassée, et l'état Powerplay du système à
// ce moment-là. L'app suppose que le jeu juge une vente tonne par tonne d'après cette provenance, et qu'une vente prend
// les lots les plus anciens d'abord (premier entré, premier sorti) : hypothèse LOT_BY_LOT_OLDEST_FIRST, à vérifier.
//
// La soute du SRV et celle du vaisseau forment un seul stock : le minerai raffiné en SRV passe ensuite au vaisseau
// (SRV_CARGO_TO_SHIP_ON_DOCK). Ce que porte le SRV est suivi à part (srvHeld) : une mort dans le SRV ne retire que ça.
// Le porteur a son propre stock : un lot qui y passe garde sa provenance et le note (« passé par le porteur » n'est pas
// documenté, à mesurer).

import { NOT_FOR_SALE } from './saleRules.js';

export const ARRIVALS = new Set(['Location', 'FSDJump', 'CarrierJump']);
const MAX_SYSTEMS = 1000;
const MAX_LOTS = 500;

/** « $iridium_name; », « Iridium » → « iridium » */
export const normType = (t) => String(t || '').toLowerCase().replace(/^\$/, '').replace(/_name;$/, '');

const KINDS = new Set(['mined', 'bought', 'rare', 'collected', 'unknown']);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** État Powerplay d'un système, tel que le jeu l'écrit à l'arrivée. */
export function placeFromArrival(ev) {
  return {
    system: ev.StarSystem,
    power: typeof ev.ControllingPower === 'string' ? ev.ControllingPower : null,
    state: typeof ev.PowerplayState === 'string' ? ev.PowerplayState : null,
    powers: Array.isArray(ev.Powers) ? ev.Powers.filter((p) => typeof p === 'string') : [],
    starPos: Array.isArray(ev.StarPos) && ev.StarPos.length === 3 ? ev.StarPos.map(Number) : null,
    t: ev.timestamp,
  };
}

function cleanLot(l) {
  if (!l || typeof l.type !== 'string' || !(num(l.count) > 0)) return null;
  return {
    type: l.type,
    count: Math.round(num(l.count)),
    kind: KINDS.has(l.kind) ? l.kind : 'unknown',
    system: typeof l.system === 'string' ? l.system : null,
    place: l.place && typeof l.place === 'object' ? l.place : null,
    t: typeof l.t === 'string' ? l.t : null,
    ...(l.buyPrice ? { buyPrice: num(l.buyPrice) } : {}),
    ...(l.viaCarrier ? { viaCarrier: true } : {}),
  };
}

export class CargoLots {
  /** @param seed état enregistré (saleStore) : lots, porteur, systèmes connus, marchandises rares, puissance */
  constructor(seed = {}) {
    this.power = typeof seed.power === 'string' ? seed.power : null;
    this.system = typeof seed.system === 'string' ? seed.system : null;
    this.systems = new Map();
    for (const p of Array.isArray(seed.systems) ? seed.systems : []) if (p && typeof p.system === 'string') this.systems.set(p.system, p);
    this.lots = (Array.isArray(seed.lots) ? seed.lots : []).map(cleanLot).filter(Boolean);
    this.carrier = (Array.isArray(seed.carrier) ? seed.carrier : []).map(cleanLot).filter(Boolean);
    this.rares = new Set(Array.isArray(seed.rares) ? seed.rares.filter((r) => typeof r === 'string') : []);
    // Marchandises Powerplay et objets de sauvetage vus dans le journal : pas de vente au marché (NOT_FOR_SALE)
    this.noMarket = new Set(Array.isArray(seed.noMarket) ? seed.noMarket.filter((r) => typeof r === 'string') : []);
    this.labels = new Map();
    this.docked = false;
    this.station = null;
    this.stationType = null;
    this.marketId = null;
    this.dockedAt = null;
    this.srvCount = 0;
    this.srvInventory = null; // Map type → tonnes, d'après le dernier Cargo du SRV
    this.srvHeld = new Map(); // type → tonnes que porte le SRV, d'après les raffinages et transferts faits en SRV
    this.vehicle = 'ship'; // 'ship' | 'srv' | 'foot' | 'taxi' : où est le joueur, pour savoir ce qu'une mort détruit
  }

  /** Ne se vend pas au marché : drones, marchandises Powerplay, objets de sauvetage. */
  notForSale(type) {
    return NOT_FOR_SALE.has(type) || this.noMarket.has(type);
  }

  /** État Powerplay connu d'un système (dernière arrivée), ou un état vide. */
  placeOf(name) {
    return this.systems.get(name) || { system: name, power: null, state: null, powers: [], starPos: null, t: null, unknown: true };
  }

  label(type) {
    return this.labels.get(type) || type.charAt(0).toUpperCase() + type.slice(1);
  }

  setLabel(type, label) {
    if (typeof label === 'string' && label && !label.startsWith('$')) this.labels.set(type, label);
  }

  /** Marchandises rares listées dans un Market.json (champ Rare). */
  learnMarket(market) {
    for (const item of Array.isArray(market?.Items) ? market.Items : []) {
      const type = normType(item.Name);
      if (item.Rare === true) this.rares.add(type);
      this.setLabel(type, item.Name_Localised);
    }
  }

  /**
   * Ajoute des tonnes au stock (soute ou porteur), regroupées avec le dernier lot de la même marchandise quand la
   * provenance est la même (l'ordre ne compte qu'entre lots d'une même marchandise).
   */
  add(type, count, kind, { system = this.system, buyPrice = null, t = null, pool = this.lots, viaCarrier = false } = {}) {
    if (!type || this.notForSale(type) || !(count > 0)) return;
    const last = pool.findLast((l) => l.type === type);
    if (last && last.kind === kind && last.system === system && Boolean(last.viaCarrier) === viaCarrier && (last.buyPrice ?? null) === (buyPrice ?? null)) {
      last.count += count;
      return;
    }
    const place = system ? { ...this.placeOf(system) } : null;
    if (place) delete place.unknown;
    pool.push({ type, count, kind, system, place, t, ...(buyPrice ? { buyPrice } : {}), ...(viaCarrier ? { viaCarrier: true } : {}) });
    if (pool.length > MAX_LOTS) pool.splice(0, pool.length - MAX_LOTS);
  }

  /**
   * Retire des tonnes, les plus anciennes d'abord (les plus récentes avec newest). Ce qui manque revient en lot de
   * provenance inconnue.
   */
  take(type, count, pool = this.lots, { newest = false } = {}) {
    const out = [];
    let left = count;
    const order = newest ? [...pool.keys()].reverse() : [...pool.keys()];
    for (const i of order) {
      if (left <= 0) break;
      const lot = pool[i];
      if (lot.type !== type) continue;
      const n = Math.min(lot.count, left);
      out.push({ ...lot, count: n });
      lot.count -= n;
      left -= n;
    }
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i].count <= 0) pool.splice(i, 1);
    if (left > 0) out.push({ type, count: left, kind: 'unknown', system: null, place: null, t: null });
    return out;
  }

  /** Les tonnes qu'une vente prendrait maintenant, sans les retirer. */
  peek(type, count) {
    return this.take(type, count, this.lots.map((l) => ({ ...l })));
  }

  /** Tonnes suivies par marchandise. */
  totals(pool = this.lots) {
    const m = new Map();
    for (const l of pool) m.set(l.type, (m.get(l.type) || 0) + l.count);
    return m;
  }

  /** Recale le stock sur l'inventaire du jeu : ce qui manque est retiré (les plus anciens), le surplus est inconnu. */
  reconcile(inventory) {
    const want = new Map();
    for (const item of inventory) {
      if (item.MissionID != null) continue; // cargaison de mission : jamais vendue
      const type = normType(item.Name);
      if (this.notForSale(type)) continue;
      want.set(type, (want.get(type) || 0) + num(item.Count));
      this.setLabel(type, item.Name_Localised);
    }
    // Ce que porte le SRV : son dernier Cargo détaillé, sinon ce que l'app a suivi s'il tombe sur le bon total
    const held = [...this.srvHeld.values()].reduce((s, n) => s + n, 0);
    const srv = this.srvInventory || (held === this.srvCount ? this.srvHeld : null);
    if (this.srvCount > 0 && !srv) return; // le SRV porte une soute inconnue : on ne retire rien
    const inSrv = (type) => (this.srvCount > 0 ? srv.get(type) || 0 : 0);
    const have = this.totals();
    for (const [type, n] of have) {
      const expected = (want.get(type) || 0) + inSrv(type);
      if (n > expected) this.take(type, n - expected);
    }
    for (const [type, n] of want) {
      const missing = n + inSrv(type) - (have.get(type) || 0);
      if (missing > 0) this.add(type, missing, 'unknown', { system: null });
    }
  }

  /** Tonnes entrées dans le SRV (raffinées, ramassées, transférées) ou sorties (négatif). */
  srvAdd(type, n) {
    const v = Math.max(0, (this.srvHeld.get(type) || 0) + n);
    if (v) this.srvHeld.set(type, v);
    else this.srvHeld.delete(type);
  }

  /** SRV détruit : sa cargaison est perdue, celle du vaisseau reste. Le SRV porte les tonnes raffinées en dernier. */
  loseSrvCargo() {
    for (const [type, n] of this.srvHeld) this.take(type, n, this.lots, { newest: true });
    this.srvHeld = new Map();
    this.srvCount = 0;
    this.srvInventory = new Map();
  }

  /**
   * Applique un événement du journal. Une vente (MarketSell) renvoie { sold } : les lots vendus.
   * @returns {{ sold?: object[] } | null}
   */
  apply(ev) {
    if (ARRIVALS.has(ev.event)) {
      if (typeof ev.StarSystem !== 'string') return null;
      this.system = ev.StarSystem;
      this.systems.delete(ev.StarSystem); // la dernière arrivée passe en fin de liste
      this.systems.set(ev.StarSystem, placeFromArrival(ev));
      if (this.systems.size > MAX_SYSTEMS) this.systems.delete(this.systems.keys().next().value);
      if (ev.event === 'Location') {
        this.setDock(ev.Docked ? ev : null);
        this.vehicle = ev.InSRV ? 'srv' : ev.OnFoot ? 'foot' : ev.Taxi ? 'taxi' : 'ship';
      } else if (ev.event === 'FSDJump') {
        this.setDock(null);
        this.vehicle = ev.Taxi ? 'taxi' : 'ship';
      }
      return null;
    }
    const type = normType(ev.Type);
    const inSrv = this.vehicle === 'srv';
    switch (ev.event) {
      case 'Powerplay':
      case 'PowerplayJoin':
      case 'PowerplayMerits':
        if (typeof ev.Power === 'string') this.power = ev.Power;
        break;
      case 'PowerplayDefect':
        if (typeof ev.ToPower === 'string') this.power = ev.ToPower;
        break;
      case 'PowerplayLeave':
        this.power = null;
        break;
      case 'Docked':
        if (typeof ev.StarSystem === 'string') this.system = ev.StarSystem;
        this.setDock(ev);
        break;
      case 'Undocked':
      case 'Shutdown': // jeu fermé : plus à quai pour l'app
        this.setDock(null);
        break;
      case 'MiningRefined':
        this.setLabel(type, ev.Type_Localised);
        this.add(type, 1, 'mined', { t: ev.timestamp });
        if (inSrv && !this.notForSale(type)) this.srvAdd(type, 1);
        break;
      case 'CollectCargo':
        this.setLabel(type, ev.Type_Localised);
        this.add(type, 1, 'collected', { t: ev.timestamp });
        if (inSrv && !this.notForSale(type)) this.srvAdd(type, 1);
        break;
      case 'PowerplayCollect':
      case 'PowerplayDeliver':
      case 'SearchAndRescue': {
        // Marchandise Powerplay ou objet de sauvetage : se livre, ne se vend pas au marché
        const t = ev.event === 'SearchAndRescue' ? normType(ev.Name) : type;
        if (!t) break;
        this.setLabel(t, ev.event === 'SearchAndRescue' ? ev.Name_Localised : ev.Type_Localised);
        if (ev.event !== 'PowerplayCollect') this.take(t, Math.round(num(ev.Count)));
        this.noMarket.add(t);
        break;
      }
      case 'MarketBuy':
        this.setLabel(type, ev.Type_Localised);
        this.add(type, Math.round(num(ev.Count)), this.rares.has(type) ? 'rare' : 'bought', { t: ev.timestamp, buyPrice: num(ev.BuyPrice) || null });
        break;
      case 'MarketSell':
        this.setLabel(type, ev.Type_Localised);
        return { sold: this.notForSale(type) ? [] : this.take(type, Math.round(num(ev.Count))) };
      case 'EjectCargo':
        this.take(type, Math.round(num(ev.Count)), this.lots, { newest: inSrv });
        if (inSrv) this.srvAdd(type, -Math.round(num(ev.Count)));
        break;
      case 'Died':
        // Mort dans le SRV : seul le SRV est détruit (SRV_CARGO_TO_SHIP_ON_DOCK). À pied ou en taxi : le vaisseau
        // n'est pas en jeu, le Cargo détaillé écrit après Resurrect recale la soute. Dans le vaisseau : tout est perdu.
        if (inSrv) this.loseSrvCargo();
        else if (this.vehicle === 'ship') {
          this.lots = [];
          this.srvCount = 0;
          this.srvInventory = null;
          this.srvHeld = new Map();
        }
        break;
      case 'SRVDestroyed':
        this.loseSrvCargo();
        break;
      case 'LaunchSRV':
        if (ev.PlayerControlled !== false) this.vehicle = 'srv';
        break;
      case 'DockSRV':
        // Sa cargaison passe dans le vaisseau (SRV_CARGO_TO_SHIP_ON_DOCK) : le SRV est vide
        this.vehicle = 'ship';
        this.srvHeld = new Map();
        this.srvCount = 0;
        this.srvInventory = new Map();
        break;
      case 'Disembark':
        this.vehicle = 'foot';
        break;
      case 'Embark':
        this.vehicle = ev.SRV ? 'srv' : ev.Taxi ? 'taxi' : 'ship';
        break;
      case 'CargoTransfer':
        for (const t of Array.isArray(ev.Transfers) ? ev.Transfers : []) this.transfer(t);
        break;
      case 'Cargo':
        this.applyCargo(ev);
        break;
      default:
        return null;
    }
    return null;
  }

  setDock(ev) {
    this.docked = Boolean(ev);
    this.station = ev?.StationName ?? null;
    this.stationType = ev?.StationType ?? null;
    this.marketId = ev?.MarketID ?? null;
    this.dockedAt = ev ? ev.timestamp : null;
  }

  /**
   * Transfert avec le porteur (à quai sur un porteur) ; vers ou depuis le SRV : même stock, seul ce que porte le SRV
   * change.
   */
  transfer(t) {
    const type = normType(t.Type);
    const count = Math.round(num(t.Count));
    if (!count || this.notForSale(type)) return;
    const onCarrier = this.docked && this.stationType === 'FleetCarrier';
    if (t.Direction === 'tocarrier') {
      for (const lot of this.take(type, count)) this.carrier.push({ ...lot, viaCarrier: true });
    } else if (t.Direction === 'toship' && onCarrier) {
      for (const lot of this.take(type, count, this.carrier)) this.lots.push({ ...lot, viaCarrier: true });
    } else if (t.Direction === 'toship') {
      this.srvAdd(type, -count);
    } else if (t.Direction === 'tosrv') {
      this.srvAdd(type, count);
    }
  }

  applyCargo(ev) {
    if (ev.Vessel === 'SRV') {
      this.srvCount = num(ev.Count);
      if (Array.isArray(ev.Inventory)) {
        this.srvInventory = new Map();
        for (const i of ev.Inventory) this.srvInventory.set(normType(i.Name), (this.srvInventory.get(normType(i.Name)) || 0) + num(i.Count));
        this.srvHeld = new Map(this.srvInventory);
      } else if (!this.srvCount) {
        this.srvInventory = new Map();
        this.srvHeld = new Map();
      } else this.srvInventory = null;
      return;
    }
    if (ev.Vessel && ev.Vessel !== 'Ship') return;
    if (Array.isArray(ev.Inventory)) this.reconcile(ev.Inventory);
    else if (num(ev.Count) === 0 && this.srvCount === 0) this.lots = []; // soute vide : plus rien à suivre
  }

  /** État à enregistrer (saleStore). */
  snapshot() {
    return {
      power: this.power,
      system: this.system,
      systems: [...this.systems.values()],
      lots: this.lots,
      carrier: this.carrier,
      rares: [...this.rares],
      noMarket: [...this.noMarket],
    };
  }
}
