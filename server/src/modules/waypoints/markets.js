// Où vendre les minerais du Rhino dans le système : prix et demande de chaque station, pour la bulle de la carte du
// balayage. Deux sources, et pour chaque station on garde la plus récente :
// - Ardent Insight (prix transmis par les joueurs via EDDN, sans clé ; on ne lui envoie qu'un nom de système), une
//   requête par système et 15 min de cache ;
// - tes propres relevés, quand tu as été docké dans la station : ceux archivés par le module Routes (lus par son API
//   HTTP) et Market.json, le tout dernier.

import { netFetch } from '../../core/net.js'; // passerelle réseau unique (liste blanche, délai, taille)
import { LOAD_GAP_MS, tooSoon } from './survey.js';

const BASE = 'https://api.ardent-insight.com/v2';
const TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 50; // systèmes gardés (la carte et le Top 10 ne demandent que le système du balayage ou le tien)
const TIMEOUT_MS = 20000;

/** Minerais du Rhino (noms français de l'app) → noms des marchandises dans les données du jeu. */
export const ORE_SYMBOLS = {
  Iridium: 'iridium',
  Platine: 'platinum',
  Or: 'gold',
  Rhodplumsite: 'rhodplumsite',
  Palladium: 'palladium',
  Osmium: 'osmium',
  Argent: 'silver',
  Uranium: 'uranium',
  Titane: 'titanium',
  Hématite: 'haematite',
  Magnésite: 'magnesite',
  Hélium: 'helium', // vu sur les panneaux d'EEP
};
// Clés venues d'Ardent (relevés EDDN, publiés par n'importe qui) : des Map, jamais un objet ordinaire, où
// « constructor » ou « __proto__ » trouvaient une propriété héritée (faux minerais classés en tête, piste effacée)
const ORE_OF = new Map(Object.entries(ORE_SYMBOLS).map(([ore, sym]) => [sym, ore]));
export const PADS = new Map([[1, 'S'], [2, 'M'], [3, 'L']]);
/** Taille de piste d'Ardent (1, 2, 3) → S, M, L ; autre chose : null. */
export const padOf = (size) => PADS.get(size) ?? null;
/** Minerai connu de ce nom de marchandise (texte seulement), ou undefined. */
const oreOf = (sym) => (typeof sym === 'string' ? ORE_OF.get(sym) : undefined);

/** « $iridium_name; » → « iridium ». */
const symbolOf = (name) => String(name || '').replace(/^\$/, '').replace(/_name;$/i, '').toLowerCase();
const time = (iso) => (iso ? Date.parse(iso) || 0 : 0);

/**
 * Market.json → relevé au même format que ceux du module Routes, ou null s'il n'est pas de ce système.
 * Seules les marchandises que la station achète vraiment comptent (comme dans l'archive).
 */
export function liveSnapshot(m, system) {
  if (!m?.Items || !m.MarketID || m.StarSystem !== system) return null;
  return {
    marketId: m.MarketID, station: m.StationName, at: m.timestamp || null,
    items: m.Items.filter((i) => i.SellPrice > 0 && i.Demand > 0).map((i) => ({ commodity: symbolOf(i.Name), sellPrice: i.SellPrice, demand: i.Demand })),
  };
}

/**
 * Prix de vente par minerai, stations triées : celles qui en veulent vraiment (demande > 1) d'abord, puis du plus
 * offrant au moins offrant. `rows` : lignes Ardent (imports du système) ; `mine` : tes relevés
 * [{ marketId, station, at, items: [{ commodity, sellPrice, demand }] }]. Pour chaque station, le relevé le plus
 * récent l'emporte en entier : une marchandise absente de ton relevé, la station ne l'achète plus.
 */
export function marketsByOre(rows, mine = []) {
  const stations = new Map(); // marketId → { station, type, pad, distance, updatedAt, source, prices: Map(sym → {sell, demand}) }
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r !== 'object') continue; // ligne qui n'en est pas une (réponse d'Ardent imprévue)
    const id = String(r.marketId);
    if (!stations.has(id)) {
      stations.set(id, {
        station: r.stationName, type: r.stationType || null, pad: padOf(r.maxLandingPadSize),
        distance: Number.isFinite(r.distanceToArrival) ? Math.round(r.distanceToArrival) : null,
        updatedAt: null, source: 'ardent', prices: new Map(),
      });
    }
    const st = stations.get(id);
    if (time(r.updatedAt) > time(st.updatedAt)) st.updatedAt = r.updatedAt;
    // Prix et demande : des nombres finis seulement (sinon « NaN Cr » dans la bulle, et un tri faussé)
    if (oreOf(r.commodityName) && Number.isFinite(r.sellPrice) && Number.isFinite(r.demand)) st.prices.set(r.commodityName, { sell: r.sellPrice, demand: r.demand });
  }
  // Tes relevés : le plus récent de chaque station, s'il est plus jeune que celui d'Ardent
  const latest = new Map();
  for (const snap of mine || []) {
    const id = String(snap.marketId);
    if (!latest.has(id) || time(snap.at) > time(latest.get(id).at)) latest.set(id, snap);
  }
  for (const [id, snap] of latest) {
    const known = stations.get(id);
    if (known && time(known.updatedAt) >= time(snap.at)) continue;
    const prices = new Map();
    for (const it of snap.items || []) {
      const sym = symbolOf(it.commodity);
      if (oreOf(sym)) prices.set(sym, { sell: it.sellPrice, demand: it.demand });
    }
    stations.set(id, {
      ...(known || { type: null, pad: null, distance: null }),
      station: snap.station || known?.station || '?', updatedAt: snap.at, source: 'mine', prices,
    });
  }
  const byOre = new Map();
  for (const st of stations.values()) {
    for (const [sym, p] of st.prices) {
      const ore = oreOf(sym);
      if (!byOre.has(ore)) byOre.set(ore, []);
      byOre.get(ore).push({
        station: st.station, type: st.type, pad: st.pad, distance: st.distance, updatedAt: st.updatedAt,
        mine: st.source === 'mine', sell: p.sell, demand: p.demand,
      });
    }
  }
  for (const list of byOre.values()) list.sort((a, b) => (b.demand > 1) - (a.demand > 1) || b.sell - a.sell);
  return Object.fromEntries(byOre); // clés : seulement les noms français connus (ORE_SYMBOLS)
}

/**
 * Classement du système (vendre sur place, pour les mérites) : chaque minerai qu'au moins une station achète
 * (demande > 1), à son meilleur prix, avec la demande cumulée de toutes ses stations, sans seuil de demande.
 * Les 10 plus chers.
 */
export function systemRanking(ores) {
  return Object.entries(ores || {})
    .map(([ore, list]) => {
      const buying = list.filter((s) => s.demand > 1);
      if (!buying.length) return null;
      const best = buying.reduce((a, b) => (b.sell > a.sell ? b : a));
      return { ore, sell: best.sell, station: best.station, demand: buying.reduce((t, s) => t + s.demand, 0), stations: buying.length };
    })
    .filter(Boolean)
    .sort((a, b) => b.sell - a.sell)
    .slice(0, 10);
}

/**
 * Imports d'un système chez Ardent, en cache 15 min. Une seule demande à la fois par système (un appel de plus attend
 * la même réponse) ; au clic (`force`), 30 s au moins depuis la dernière tentative pour ce système, sinon refus 429
 * (tooSoon), sans rien demander.
 */
export class SystemMarkets {
  constructor({ fetchImpl = netFetch, now = Date.now, gapMs = LOAD_GAP_MS } = {}) {
    this.fetch = fetchImpl;
    this.now = now;
    this.gapMs = gapMs;
    this.cache = new Map(); // système → { at, rows } ; 50 systèmes au plus, le moins récent part le premier
    this.tried = new Map(); // système → heure de la dernière tentative (réussie ou non) ; 50 au plus
    this.pending = new Map(); // système → demande en cours (promesse des lignes)
  }

  /** Réponse gardée de moins de 15 min, ou null. */
  cached(system) {
    const hit = this.cache.get(system);
    return hit && this.now() - hit.at < TTL_MS ? hit : null;
  }

  /** Imports du système chez Ardent (le cache d'abord, sauf `force`). Système inconnu d'Ardent (404) : aucun. */
  async rows(system, { force = false } = {}) {
    const hit = !force && this.cached(system);
    if (hit) return hit.rows;
    const pending = this.pending.get(system);
    if (pending) return pending;
    const now = this.now();
    const last = this.tried.get(system);
    if (force && last != null && now - last < this.gapMs) throw tooSoon('Ardent Insight', this.gapMs - (now - last));
    this.tried.delete(system);
    this.tried.set(system, now);
    while (this.tried.size > CACHE_MAX) this.tried.delete(this.tried.keys().next().value);
    const ask = this.#ask(system);
    this.pending.set(system, ask);
    try {
      return await ask;
    } finally {
      this.pending.delete(system);
    }
  }

  async #ask(system) {
    const url = `${BASE}/system/name/${encodeURIComponent(system)}/commodities/imports?fleetCarriers=false`;
    const res = await this.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } });
    if (!res.ok && res.status !== 404) throw new Error(`Ardent Insight a répondu ${res.status}`);
    const data = res.status === 404 ? [] : await res.json();
    const rows = Array.isArray(data) ? data : []; // autre chose qu'une liste : rien
    this.cache.delete(system);
    this.cache.set(system, { at: this.now(), rows });
    while (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value);
    return rows;
  }

  /**
   * Prix par minerai du système ; `mine` : tes relevés de ce système. Ardent n'est interrogé qu'avec `online` (réglage
   * des recherches automatiques activé, ou clic) : sans lui, seule une réponse déjà gardée sert, avec tes relevés.
   * Ardent injoignable : tes relevés seuls. `ardent.loaded` : une réponse d'Ardent est là (reçue à `ardent.at`).
   */
  async forSystem(system, mine = [], { online = false, force = false } = {}) {
    let rows = this.cached(system)?.rows || [];
    let error = null;
    if (online) {
      try {
        rows = await this.rows(system, { force });
      } catch (e) {
        if (e?.status === 429) throw e; // clic trop rapproché : refusé tel quel, rien n'a été demandé
        error = e.message;
      }
    }
    const ores = marketsByOre(rows, mine);
    const kept = this.cached(system);
    return { ores, ranking: systemRanking(ores), error, ardent: { loaded: Boolean(kept), at: kept ? new Date(kept.at).toISOString() : null } };
  }
}
