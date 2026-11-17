// Session de minage en vaisseau : astéroïdes prospectés (ProspectedAsteroid), drones lancés, minerai raffiné
// par la raffinerie du vaisseau (MiningRefined hors SRV). Une session commence au lancement du jeu ou à une
// remise à zéro.

import { readFileSync } from 'node:fs';

// Prix des minerais relevés une fois (ore-prices.json) : il s'agit de comparer les minerais entre eux, pas du
// prix exact du jour. Pour les mettre à jour : relever à nouveau la médiane des meilleures offres sur Ardent Insight.
export const ORE_PRICES = JSON.parse(readFileSync(new URL('./ore-prices.json', import.meta.url), 'utf8'));

export const SHIP_MINING_EVENTS = ['LoadGame', 'ProspectedAsteroid', 'LaunchDrone', 'MiningRefined', 'LaunchSRV', 'DockSRV', 'SRVDestroyed'];

// Verdict sur la valeur estimée par tonne collectée (somme teneur × prix des minerais) : bon dès 40 000 cr,
// moyen dès 15 000 cr. Sans prix connu, repli sur la teneur du meilleur minerai : bon dès 30 %, moyen dès 15 %.
export const GOOD_VALUE = 40_000;
export const FAIR_VALUE = 15_000;
export const GOOD = 30;
export const FAIR = 15;
const RECENT = 15;
const RATE_WINDOW_MS = 30 * 60_000; // rythme sur la dernière demi-heure

const CONTENT = { High: 'élevée', Medium: 'moyenne', Low: 'faible' };
const lower = (s) => String(s || '').toLowerCase();

/** Astéroïde prospecté : minerais triés par valeur, valeur estimée par tonne, verdict, filon mère. */
export function prospect(ev, prices = ORE_PRICES.prices) {
  const materials = (ev.Materials || [])
    .map((m) => {
      const proportion = Math.round((m.Proportion || 0) * 10) / 10;
      const price = prices[lower(m.Name)] ?? null;
      return { name: m.Name_Localised || m.Name, proportion, price, value: price == null ? null : Math.round((proportion / 100) * price) };
    })
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || b.proportion - a.proportion);
  const best = Math.max(0, ...materials.map((m) => m.proportion));
  const priced = materials.filter((m) => m.value != null);
  const value = priced.length ? priced.reduce((a, m) => a + m.value, 0) : null;
  const content = String(ev.Content || '').match(/_(High|Medium|Low);?$/)?.[1];
  return {
    at: ev.timestamp,
    materials,
    best,
    value, // cr par tonne collectée, estimation ; null sans prix connu
    verdict: value != null
      ? (value >= GOOD_VALUE ? 'good' : value >= FAIR_VALUE ? 'fair' : 'poor')
      : (best >= GOOD ? 'good' : best >= FAIR ? 'fair' : 'poor'),
    content: CONTENT[content] || null,
    motherlode: ev.MotherlodeMaterial_Localised || ev.MotherlodeMaterial || null,
    remaining: ev.Remaining ?? null, // 100 = jamais miné
  };
}

export class ShipMiningState {
  constructor() {
    this.inSrv = false;
    this.reset(null);
  }

  reset(startedAt) {
    this.startedAt = startedAt;
    this.prospects = []; // du plus récent au plus ancien
    this.prospected = 0;
    this.drones = { prospector: 0, collection: 0 };
    this.refined = new Map(); // minerai → tonnes
    this.refinedAt = []; // heures de raffinage, pour le rythme
  }

  apply(ev) {
    switch (ev.event) {
      case 'LoadGame':
        this.reset(ev.timestamp);
        this.inSrv = false;
        break;
      case 'LaunchSRV':
        this.inSrv = true;
        return false;
      case 'DockSRV':
      case 'SRVDestroyed':
        this.inSrv = false;
        return false;
      case 'ProspectedAsteroid':
        this.prospected++;
        this.prospects.unshift(prospect(ev));
        if (this.prospects.length > RECENT) this.prospects.length = RECENT;
        break;
      case 'LaunchDrone': {
        const type = lower(ev.Type);
        if (!(type in this.drones)) return false;
        this.drones[type]++;
        break;
      }
      case 'MiningRefined': {
        if (this.inSrv) return false; // minage au SRV : suivi par Mes repères
        const name = ev.Type_Localised || ev.Type;
        this.refined.set(name, (this.refined.get(name) || 0) + 1);
        this.refinedAt.push(Date.parse(ev.timestamp));
        break;
      }
      default:
        return false;
    }
    return true;
  }

  /** @param hold soute actuelle { count, capacity, drones } */
  summary(hold = null, now = Date.now()) {
    const refined = [...this.refined].map(([name, tons]) => ({ name, tons })).sort((a, b) => b.tons - a.tons);
    const total = refined.reduce((a, r) => a + r.tons, 0);
    const recent = this.refinedAt.filter((t) => now - t <= RATE_WINDOW_MS).length;
    return {
      startedAt: this.startedAt,
      hold,
      prospected: this.prospected,
      drones: this.drones,
      refined,
      totalRefined: total,
      // Tonnes par heure sur la dernière demi-heure, dès 10 minutes de raffinage
      perHour: this.refinedAt.length && now - this.refinedAt[0] >= 10 * 60_000 ? Math.round(recent * (3_600_000 / RATE_WINDOW_MS)) : null,
      pricesDate: ORE_PRICES.date,
      last: this.prospects[0] || null,
      prospects: this.prospects,
    };
  }
}
