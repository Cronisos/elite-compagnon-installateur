// Stations qui vendent les marchandises restantes d'un chantier, autour de son système, d'après Ardent Insight
// (prix transmis par les joueurs via EDDN). Seuls un nom de système et des symboles de marchandises sont envoyés.
//
// Endpoint (vérifié dans le code d'ardent-api 6.4.1 et testé le 7 nov. 2026) :
//   GET /v2/system/name/{système}/commodity/name/{symbole}/nearby/exports?maxDistance&maxDaysAgo&sort=distance
//   Le système lui-même est exclu : ses ventes viennent de /v2/system/name/{système}/commodities/exports, qui
//   applique aussi maxDaysAgo et fleetCarriers (vérifié le 8 nov. 2026 : sans porteurs, 87 lignes au lieu de 89).
//   Système inconnu : 404 (système colonisé trop récent, ou jamais signalé par EDDN). Symbole inconnu : 200 et [].
// Ardent ne filtre ni la taille de plateforme ni le stock nécessaire : on le fait ici, puis on reclasse par
// distance, distance à l'arrivée et fraîcheur. Ardent ne connaît pas les besoins des chantiers (pas de flux
// EDDN pour la colonisation) : ils viennent du journal.

import { netFetch } from '../../core/net.js'; // passerelle réseau unique (liste blanche, délai, taille)

const BASE = 'https://api.ardent-insight.com/v2';
export const TTL_MS = 30 * 60_000;
const TIMEOUT_MS = 20_000;
const MAX_PARALLEL = 4;
const MAX_CACHE = 500;
// Map, jamais un objet ordinaire : maxLandingPadSize vient d'Ardent (« constructor » ou « __proto__ » n'y trouvent rien)
const PADS = new Map([[1, 'S'], [2, 'M'], [3, 'L']]);
const PAD_RANK = new Map([['S', 1], ['M', 2], ['L', 3]]);

export const DEFAULTS = { maxDistance: 50, maxDaysAgo: 14, limit: 5 };

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const text = (v) => (typeof v === 'string' ? v : null);

/** Ligne d'Ardent mise en forme ; null si elle est inexploitable. */
export function stationRow(r, now = Date.now()) {
  if (r === null || typeof r !== 'object' || Array.isArray(r)) return null;
  const stock = finite(r.stock) ? r.stock : null;
  if (!text(r.stationName) || stock == null || stock <= 0) return null;
  const updated = Date.parse(r.updatedAt);
  return {
    station: r.stationName,
    stationType: text(r.stationType),
    system: text(r.systemName),
    distance: finite(r.distance) ? r.distance : null, // al, arrondi par Ardent
    arrival: finite(r.distanceToArrival) ? Math.round(r.distanceToArrival) : null, // ls
    pad: PADS.get(r.maxLandingPadSize) ?? null,
    stock,
    price: finite(r.buyPrice) ? r.buyPrice : null,
    updatedAt: Number.isFinite(updated) ? new Date(updated).toISOString() : null,
    ageDays: Number.isFinite(updated) ? Math.max(0, Math.round(((now - updated) / 86_400_000) * 10) / 10) : null,
    carrier: r.stationType === 'FleetCarrier',
  };
}

/** Plateforme assez grande pour le vaisseau ? Inconnue : gardée (marquée « ? » dans la page). */
export const padFits = (row, pad) => !PAD_RANK.has(pad) || !PAD_RANK.has(row.pad) || PAD_RANK.get(row.pad) >= PAD_RANK.get(pad);

/** Classement : plus près d'abord, puis plus près de l'arrivée, puis relevé le plus frais. */
export function rankRows(rows) {
  const v = (n) => (n == null ? Infinity : n);
  return [...rows].sort((a, b) => v(a.distance) - v(b.distance) || v(a.arrival) - v(b.arrival) || v(a.ageDays) - v(b.ageDays));
}

export class ColonisationSources {
  constructor({ fetchImpl = netFetch, now = () => Date.now(), ttlMs = TTL_MS } = {}) {
    this.fetch = fetchImpl;
    this.now = now;
    this.ttlMs = ttlMs;
    this.cache = new Map(); // url → { at, data }
    this.active = 0;
    this.queue = [];
    this.stats = { requests: 0, cached: 0 };
  }

  async slot() {
    while (this.active >= MAX_PARALLEL) await new Promise((resolve) => this.queue.push(resolve));
    this.active++;
  }

  release() {
    this.active--;
    this.queue.shift()?.();
  }

  /** GET JSON avec cache de 30 min : { status: 'ok', data } | { status: 'not-found' } ; erreur réseau : exception. */
  async get(path, params = {}) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
    const url = `${BASE}${path}${qs.size ? `?${qs}` : ''}`;
    const hit = this.cache.get(url);
    if (hit && this.now() - hit.at < this.ttlMs) {
      this.stats.cached++;
      return hit.data;
    }
    await this.slot();
    try {
      this.stats.requests++;
      const res = await this.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } });
      let data;
      if (res.status === 404) data = { status: 'not-found' };
      else if (!res.ok) throw new Error(`Ardent Insight a répondu ${res.status}`);
      else data = { status: 'ok', data: await res.json() };
      this.cache.delete(url);
      this.cache.set(url, { at: this.now(), data });
      if (this.cache.size > MAX_CACHE) this.cache.delete(this.cache.keys().next().value);
      return data;
    } finally {
      this.release();
    }
  }

  /**
   * Sources des marchandises restantes autour d'un système.
   * @param commodities [{ symbol, name, remaining }] (seules celles qui restent sont cherchées)
   * @param pad taille de plateforme du vaisseau ('S' | 'M' | 'L' | null)
   * @returns { system, pad, maxDistance, maxDaysAgo, carriers, at, error, results: [{ symbol, name, remaining, stations, error }] }
   */
  async nearby({ system, commodities, pad = null, maxDistance = DEFAULTS.maxDistance, maxDaysAgo = DEFAULTS.maxDaysAgo, carriers = false, limit = DEFAULTS.limit }) {
    const out = { system: system || null, pad, maxDistance, maxDaysAgo, carriers, at: new Date(this.now()).toISOString(), error: null, results: [] };
    const wanted = (commodities || []).filter((c) => c.symbol && (c.remaining == null || c.remaining > 0));
    if (!system) {
      out.error = 'Système du chantier inconnu : amarre-toi au chantier une fois pour que le journal le donne.';
      return out;
    }
    if (!wanted.length) return out;
    const sys = encodeURIComponent(system);
    const fleetCarriers = carriers ? undefined : false; // absent : porteurs compris
    let local = [];
    try {
      const r = await this.get(`/system/name/${sys}/commodities/exports`, { maxDaysAgo, fleetCarriers });
      if (r.status === 'not-found') {
        out.error = `Système « ${system} » inconnu d'Ardent Insight : trop récent, ou jamais signalé par EDDN.`;
        return out;
      }
      local = Array.isArray(r.data) ? r.data : [];
    } catch (err) {
      out.error = unreachable(err);
      return out;
    }
    const now = this.now();
    out.results = await Promise.all(wanted.map(async (c) => {
      const result = { symbol: c.symbol, name: c.name || c.symbol, remaining: c.remaining ?? null, stations: [], error: null };
      try {
        const r = await this.get(`/system/name/${sys}/commodity/name/${encodeURIComponent(c.symbol)}/nearby/exports`, { maxDistance, maxDaysAgo, fleetCarriers, sort: 'distance' });
        const near = r.status === 'ok' && Array.isArray(r.data) ? r.data : [];
        const here = local.filter((x) => x && String(x.commodityName || '').toLowerCase() === c.symbol).map((x) => ({ ...x, distance: 0, systemName: x.systemName || system }));
        const rows = [...here, ...near].map((x) => stationRow(x, now)).filter((x) => x && padFits(x, pad) && (carriers || !x.carrier));
        result.stations = rankRows(rows).slice(0, limit).map((x) => ({ ...x, enough: c.remaining == null || x.stock >= c.remaining }));
      } catch (err) {
        result.error = unreachable(err);
      }
      return result;
    }));
    return out;
  }
}

function unreachable(err) {
  const why = err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'pas de réponse en 20 s' : err?.message || 'erreur inconnue';
  return `Ardent Insight injoignable (${why}). Réessaie plus tard.`;
}
