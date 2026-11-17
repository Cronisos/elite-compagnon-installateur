// Client de l'API publique Ardent Insight (prix du marché transmis par les joueurs via EDDN).
// Documentation : https://github.com/iaincollins/ardent-api — pas de clé, pas de limite
// annoncée, mais un usage raisonnable est demandé : cache de 15 min et 6 requêtes en parallèle
// au maximum. Aucune donnée personnelle n'est envoyée (seulement des noms de systèmes et de
// marchandises).

import { netFetch } from '../../core/net.js'; // passerelle réseau unique (liste blanche, délai, taille)

const BASE = 'https://api.ardent-insight.com/v2';
const TTL_MS = 15 * 60 * 1000;
const MAX_PARALLEL = 6;
const TIMEOUT_MS = 20000;
// Réponses gardées : une recherche en fait environ 120, l'autocomplétion une par frappe. Borné, et les réponses
// périmées lues sont retirées : avant, toutes restaient en mémoire jusqu'au redémarrage.
export const CACHE_MAX = 500;

export class ArdentClient {
  constructor({ fetchImpl = netFetch } = {}) {
    this.fetch = fetchImpl;
    this.cache = new Map(); // url → { at, data }
    this.active = 0;
    this.queue = [];
    this.stats = { requests: 0, cached: 0 };
  }

  async slot() {
    if (this.active < MAX_PARALLEL) {
      this.active++;
      return;
    }
    await new Promise((resolve) => this.queue.push(resolve));
    this.active++;
  }

  release() {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }

  /** GET JSON avec cache ; 404 → null. */
  async get(path, params = {}) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
    const url = `${BASE}${path}${qs.size ? `?${qs}` : ''}`;
    const hit = this.cache.get(url);
    if (hit && Date.now() - hit.at < TTL_MS) {
      this.stats.cached++;
      return hit.data;
    }
    if (hit) this.cache.delete(url); // périmée
    await this.slot();
    try {
      this.stats.requests++;
      const res = await this.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Ardent Insight a répondu ${res.status}`);
      const data = await res.json();
      this.cache.delete(url);
      this.cache.set(url, { at: Date.now(), data });
      while (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value); // la plus ancienne
      return data;
    } finally {
      this.release();
    }
  }

  /** Toutes les marchandises échangées, avec fourchettes de prix (rapport quotidien). */
  commodities() {
    return this.get('/commodities');
  }

  system(name) {
    return this.get(`/system/name/${encodeURIComponent(name)}`);
  }

  searchSystems(partial) {
    return this.get(`/search/system/name/${encodeURIComponent(partial)}`);
  }

  /**
   * Stations qui vendent (exports) ou achètent (imports) une marchandise autour d'un système.
   * Le système lui-même n'en fait pas partie : voir systemTrades.
   */
  async nearby(system, commodity, kind, { maxDistance, maxDaysAgo }) {
    const path = `/system/name/${encodeURIComponent(system)}/commodity/name/${encodeURIComponent(commodity)}/nearby/${kind}`;
    return (await this.get(path, { maxDistance, maxDaysAgo, fleetCarriers: false })) || [];
  }

  /** Toutes les marchandises vendues (exports) ou achetées (imports) dans un système. */
  async systemTrades(system, kind, { maxDaysAgo }) {
    const rows = await this.get(`/system/name/${encodeURIComponent(system)}/commodities/${kind}`, { maxDaysAgo, fleetCarriers: false });
    return (rows || []).map((r) => ({ ...r, distance: 0 }));
  }
}
