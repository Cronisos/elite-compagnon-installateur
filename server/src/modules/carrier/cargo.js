// Cargaison des porteurs, ESTIMÉE d'après tes journaux. Le jeu n'écrit nulle part le contenu d'un porteur : seulement
// ce que tu y fais toi-même. L'estimation additionne, porteur par porteur (son MarketID, qui est aussi son CarrierID) :
//   - CargoTransfer à quai au porteur : « tocarrier » ajoute, « toship » retire (« tosrv » : vers ton SRV, ignoré) ;
//   - MarketSell à son marché ajoute (tu lui vends), MarketBuy retire (tu lui achètes).
// Ce qui n'y est pas : les achats et les ventes des autres joueurs à son marché, les transferts des autres membres
// (porteur d'escadron), et tout ce qui précède tes journaux. Le jeu donne le total réel en tonnes dans CarrierStats
// (SpaceUsage.Cargo) pour TON porteur : l'écart avec l'estimation est montré, jamais corrigé en silence.
// À vérifier avec un vrai journal : sens « toship » à quai au porteur (vers le vaisseau, depuis le porteur), noms des
// marchandises de CargoTransfer (forme « steel » supposée, comme Cargo.json).

export const CARGO_EVENTS = ['CarrierStats', 'Docked', 'Undocked', 'Location', 'CargoTransfer', 'MarketBuy', 'MarketSell'];

const isId = (v) => Number.isSafeInteger(v) && v > 0;
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const tonnes = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** Nom de marchandise du journal (« $Steel_name; », « steel ») ramené à un symbole simple : « steel ». */
export function commodityKey(name) {
  if (typeof name !== 'string') return null;
  const s = name.trim().toLowerCase().replace(/^\$/, '').replace(/_name;$/, '').replace(/[^a-z0-9]/g, '');
  return s && s.length <= 60 ? s : null;
}

export class CarrierCargo {
  constructor() {
    this.carriers = new Map(); // MarketID → { id, name, callsign, mine, cargo: Map symbole → { name, count }, reported, since, updatedAt }
    this.dockedAt = null; // MarketID du porteur où tu es à quai, ou null
  }

  carrier(id, at) {
    if (!this.carriers.has(id)) this.carriers.set(id, { id, name: null, callsign: null, mine: false, cargo: new Map(), reported: null, since: at ?? null, updatedAt: null });
    return this.carriers.get(id);
  }

  /** Ajoute (delta > 0) ou retire (delta < 0) des tonnes d'une marchandise ; jamais sous zéro. */
  move(id, name, delta, at) {
    const symbol = commodityKey(name);
    if (!symbol || !Number.isInteger(delta) || delta === 0) return false;
    const c = this.carrier(id, at);
    const cur = c.cargo.get(symbol) ?? { name: null, count: 0 };
    c.cargo.set(symbol, { name: cur.name, count: Math.max(0, cur.count + delta) });
    c.updatedAt = at ?? c.updatedAt;
    return true;
  }

  /** Un événement du journal ; rend vrai si la cargaison estimée ou le porteur ont changé. */
  apply(ev) {
    const at = typeof ev?.timestamp === 'string' ? ev.timestamp : null;
    switch (ev?.event) {
      case 'CarrierStats': {
        if (!isId(ev.CarrierID)) return false;
        const c = this.carrier(ev.CarrierID, at);
        Object.assign(c, { mine: true, name: text(ev.Name) ?? c.name, callsign: text(ev.Callsign) ?? c.callsign });
        const total = ev.SpaceUsage?.Cargo;
        if (Number.isFinite(total) && total >= 0) c.reported = { cargo: Math.floor(total), at };
        return true;
      }
      case 'Docked':
      case 'Location':
        this.dockedAt = (ev.event === 'Docked' || ev.Docked === true) && ev.StationType === 'FleetCarrier' && isId(ev.MarketID) ? ev.MarketID : null;
        if (this.dockedAt != null) {
          const c = this.carrier(this.dockedAt, at);
          c.callsign ??= text(ev.StationName); // l'indicatif, pour un porteur qui n'est pas le tien
        }
        return false;
      case 'Undocked':
        this.dockedAt = null;
        return false;
      case 'CargoTransfer': {
        if (this.dockedAt == null || !Array.isArray(ev.Transfers)) return false;
        let changed = false;
        for (const t of ev.Transfers) {
          const sign = t?.Direction === 'tocarrier' ? 1 : t?.Direction === 'toship' ? -1 : 0;
          if (!sign) continue;
          if (this.move(this.dockedAt, t.Type, sign * tonnes(t.Count), at)) {
            changed = true;
            this.nameOf(this.dockedAt, t.Type, t.Type_Localised);
          }
        }
        return changed;
      }
      case 'MarketSell':
      case 'MarketBuy': {
        // Seulement au marché d'un porteur : le tien (CarrierStats), ou celui où tu es à quai
        const id = isId(ev.MarketID) ? ev.MarketID : null;
        if (id == null || !(this.carriers.get(id)?.mine || id === this.dockedAt)) return false;
        const sign = ev.event === 'MarketSell' ? 1 : -1;
        if (!this.move(id, ev.Type, sign * tonnes(ev.Count), at)) return false;
        this.nameOf(id, ev.Type, ev.Type_Localised);
        return true;
      }
      default:
        return false;
    }
  }

  nameOf(id, type, localised) {
    const c = this.carriers.get(id);
    const symbol = commodityKey(type);
    const label = text(localised);
    if (c && symbol && label && c.cargo.has(symbol)) c.cargo.get(symbol).name = label;
  }

  /**
   * Les porteurs connus, le tien d'abord : { id, name, callsign, mine, cargo: [{ symbol, name, count }] (le plus gros
   * d'abord), total, reported: { cargo, at } | null (total réel donné par le jeu), gap (réel − estimé), since, updatedAt }.
   */
  view() {
    return [...this.carriers.values()]
      .sort((a, b) => b.mine - a.mine)
      .map((c) => {
        const cargo = [...c.cargo].filter(([, v]) => v.count > 0).map(([symbol, v]) => ({ symbol, name: v.name ?? symbol, count: v.count }))
          .sort((a, b) => b.count - a.count || a.symbol.localeCompare(b.symbol));
        const total = cargo.reduce((s, x) => s + x.count, 0);
        return {
          id: c.id, name: c.name, callsign: c.callsign, mine: c.mine, cargo, total, reported: c.reported,
          gap: c.reported ? c.reported.cargo - total : null, since: c.since, updatedAt: c.updatedAt,
        };
      });
  }
}
