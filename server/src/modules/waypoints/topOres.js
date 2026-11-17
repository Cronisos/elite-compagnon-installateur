// Minerais du Rhino à chercher en priorité : classés par meilleure offre d'achat du moment dans toute la galaxie,
// seulement là où la demande atteint 1 000 t (en dessous, impossible d'y vendre une soute). Source : Ardent Insight
// (prix des joueurs via EDDN, relevés de moins de 48 h), une requête par minerai, 30 min de cache.

import { netFetch } from '../../core/net.js'; // passerelle réseau unique (liste blanche, délai, taille)

const BASE = 'https://api.ardent-insight.com/v2';
const TTL_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 20000;
export const MIN_DEMAND = 1000;
const PAD_SIZES = new Map([[1, 'S'], [2, 'M'], [3, 'L']]);
const MAX_DAYS = 2;

/** Meilleure offre d'une liste Ardent (imports d'une marchandise), demande suffisante, ou null. */
export function bestOffer(rows, minDemand = MIN_DEMAND) {
  let best = null;
  for (const r of rows || []) {
    if (!(r.demand >= minDemand) || !(r.sellPrice > 0)) continue;
    if (!best || r.sellPrice > best.sellPrice) best = r;
  }
  return best && {
    sell: best.sellPrice, demand: best.demand, station: best.stationName, system: best.systemName,
    pad: PAD_SIZES.get(best.maxLandingPadSize) ?? null, updatedAt: best.updatedAt || null, // Map : jamais une clé héritée
  };
}

export class OrePrices {
  /** `symbols` : nom français → nom de la marchandise dans le jeu. */
  constructor(symbols, { fetchImpl = netFetch } = {}) {
    this.symbols = symbols;
    this.fetch = fetchImpl;
    this.cache = null; // { at, list }
  }

  async offer(symbol) {
    const url = `${BASE}/commodity/name/${encodeURIComponent(symbol)}/imports?minVolume=${MIN_DEMAND}&maxDaysAgo=${MAX_DAYS}&fleetCarriers=false`;
    const res = await this.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Ardent Insight a répondu ${res.status}`);
    return bestOffer(await res.json());
  }

  /** Les minerais du plus cher au moins cher ; ceux sans offre suffisante sont écartés. */
  async ranking() {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) return this.cache.list;
    const offers = await Promise.all(Object.entries(this.symbols).map(async ([ore, sym]) => {
      const o = await this.offer(sym).catch(() => undefined); // undefined : injoignable
      return o === undefined ? { ore, failed: true } : o && { ore, ...o };
    }));
    if (offers.every((o) => o?.failed)) {
      // Service extérieur indisponible (ou réseau coupé) : 503 et message lisible, pas « Erreur interne du serveur »
      const message = 'Ardent Insight injoignable : prix des minerais indisponibles pour le moment.';
      throw Object.assign(new Error(message), { status: 503, publicMessage: message });
    }
    const list = offers.filter((o) => o && !o.failed).sort((a, b) => b.sell - a.sell);
    this.cache = { at: Date.now(), list };
    return list;
  }
}
