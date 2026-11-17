// Calcul des routes commerciales à partir des relevés de marché (Ardent Insight).
//
// - Achat possible : prix d'achat > 0 et stock > 0.
// - Vente possible : prix de vente > 0 et demande > 1 (une demande de 1 signifie que la
//   station n'importe pas la marchandise : elle la reprend à bas prix).
// - Quantité d'un échange = min(soute, stock au départ, demande à l'arrivée).
// - Aller simple A → B : meilleure marchandise. Boucle A ⇄ B : meilleur aller + meilleur retour.
// - Temps estimé par trajet : sauts (portée chargée) + supercroisière jusqu'à la station
//   + amarrage et marché. Ce n'est qu'une estimation, affichée « ≈ » ; le classement par
//   heure sert à comparer, la boucle réelle est mesurée par « Mes routes commerciales ».

export const PAD_RANK = { S: 1, M: 2, L: 3 };
const PLANETARY = new Set(['CraterOutpost', 'CraterPort', 'SurfaceStation', 'OnFootSettlement']);
const SETTLEMENT = 'OnFootSettlement';

// Paramètres de l'estimation de temps (secondes), calés sur des boucles réelles
// (2 sauts, station à quelques ls : ≈ 6 à 7 min par trajet, amarrage et marché compris).
export const TIME = { perJump: 65, dock: 200, scBase: 30, scPerSqrtLs: 4, planetary: 90 };

/** Station retenue selon les filtres (plateforme, distance à l'étoile, type). */
export function stationAllowed(r, f) {
  if (!r.marketId || r.stationType === 'FleetCarrier' || /Construction/i.test(r.stationType || '')) return false;
  if ((r.maxLandingPadSize || 0) < PAD_RANK[f.pad || 'S']) return false;
  if (f.maxArrival && (r.distanceToArrival ?? Infinity) > f.maxArrival) return false;
  if (r.stationType === SETTLEMENT && !f.settlements) return false;
  if (PLANETARY.has(r.stationType) && r.stationType !== SETTLEMENT && f.planetary === false) return false;
  return true;
}

/**
 * Regroupe les relevés par marché.
 * @param {object[]} rows relevés Ardent (exports et imports mélangés)
 * @param {object} f filtres { pad, maxArrival, planetary, settlements }
 * @returns {Map<number, object>} marketId → { station, system, coords, buys, sells }
 */
export function buildMarkets(rows, f = {}) {
  const markets = new Map();
  for (const r of rows) {
    if (!stationAllowed(r, f)) continue;
    let m = markets.get(r.marketId);
    if (!m) {
      m = {
        marketId: r.marketId,
        station: r.stationName,
        type: r.stationType,
        planetary: PLANETARY.has(r.stationType),
        system: r.systemName,
        systemAddress: r.systemAddress,
        x: r.systemX,
        y: r.systemY,
        z: r.systemZ,
        arrival: r.distanceToArrival ?? null,
        pad: r.maxLandingPadSize,
        distance: r.distance ?? null,
        buys: new Map(),
        sells: new Map(),
      };
      markets.set(r.marketId, m);
    }
    const c = r.commodityName;
    const at = r.updatedAt;
    if (r.buyPrice > 0 && r.stock > 0) m.buys.set(c, { price: r.buyPrice, stock: r.stock, at });
    if (r.sellPrice > 0 && r.demand > 1) m.sells.set(c, { price: r.sellPrice, demand: r.demand, at });
  }
  return markets;
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Durée estimée d'un trajet vers une station (secondes). */
export function legSeconds(from, to, range) {
  const d = distance(from, to);
  const jumps = d < 0.01 ? 0 : Math.ceil(d / Math.max(range || 1, 1));
  const sc = TIME.scBase + TIME.scPerSqrtLs * Math.sqrt(Math.max(to.arrival ?? 1000, 0));
  return { jumps, distance: d, seconds: jumps * TIME.perJump + sc + TIME.dock + (to.planetary ? TIME.planetary : 0) };
}

/**
 * Meilleurs échanges de A vers B, pour toutes les paires (A, B) possibles.
 * @returns {Map<string, object>} « idA|idB » → meilleur échange
 */
export function bestTrades(markets, cargo) {
  // Index des marchés acheteurs par marchandise
  const sellers = new Map();
  for (const m of markets.values()) {
    for (const [c, s] of m.sells) {
      if (!sellers.has(c)) sellers.set(c, []);
      sellers.get(c).push({ m, s });
    }
  }
  const best = new Map();
  for (const a of markets.values()) {
    for (const [c, b] of a.buys) {
      for (const { m, s } of sellers.get(c) || []) {
        if (m.marketId === a.marketId) continue;
        const margin = s.price - b.price;
        if (margin <= 0) continue;
        const units = Math.min(cargo, b.stock, s.demand);
        const profit = units * margin;
        const key = `${a.marketId}|${m.marketId}`;
        const cur = best.get(key);
        if (!cur || profit > cur.profit) {
          best.set(key, {
            commodity: c,
            buy: b.price,
            sell: s.price,
            margin,
            units,
            profit,
            stock: b.stock,
            demand: s.demand,
            buyAt: b.at,
            sellAt: s.at,
          });
        }
      }
    }
  }
  return best;
}

function oldest(...dates) {
  return dates.filter(Boolean).sort()[0] || null;
}

function stationView(m) {
  return {
    marketId: m.marketId,
    station: m.station,
    type: m.type,
    planetary: m.planetary,
    system: m.system,
    systemAddress: m.systemAddress,
    arrival: m.arrival,
    pad: m.pad,
    distance: m.distance,
  };
}

/**
 * Routes rentables, classées.
 * @param {Map} markets buildMarkets
 * @param {object} o { cargo, range, sort: 'hour'|'trip', limit, minProfit }
 * @returns {{ loops: object[], oneWay: object[] }}
 */
export function findRoutes(markets, { cargo, range, sort = 'hour', limit = 40, minProfit = 0 }) {
  const best = bestTrades(markets, cargo);
  const loops = [];
  const oneWay = [];
  for (const [key, out] of best) {
    if (out.profit < minProfit) continue;
    const [ida, idb] = key.split('|').map(Number);
    const a = markets.get(ida);
    const b = markets.get(idb);
    const go = legSeconds(a, b, range);
    oneWay.push({
      from: stationView(a),
      to: stationView(b),
      out,
      distance: go.distance,
      jumps: go.jumps,
      seconds: go.seconds,
      profit: out.profit,
      perHour: (out.profit / go.seconds) * 3600,
      oldest: oldest(out.buyAt, out.sellAt),
    });
    // Boucle : comptée une seule fois (A < B)
    if (ida < idb) {
      const back = best.get(`${idb}|${ida}`);
      if (!back) continue;
      const ret = legSeconds(b, a, range);
      const profit = out.profit + back.profit;
      const seconds = go.seconds + ret.seconds;
      loops.push({
        from: stationView(a),
        to: stationView(b),
        out,
        back,
        distance: go.distance,
        jumps: go.jumps + ret.jumps,
        seconds,
        profit,
        perHour: (profit / seconds) * 3600,
        oldest: oldest(out.buyAt, out.sellAt, back.buyAt, back.sellAt),
      });
    }
  }
  const key = sort === 'trip' ? 'profit' : 'perHour';
  const rank = (list) => list.sort((x, y) => y[key] - x[key]).slice(0, limit);
  return { loops: rank(loops), oneWay: rank(oneWay) };
}

/**
 * Marchandises à interroger : celles dont l'écart de prix dans la galaxie peut rapporter.
 * @param {object[]} report rapport /commodities d'Ardent
 */
export function pickCommodities(report, { minGap = 5000, max = 60 } = {}) {
  return (report || [])
    .filter((c) => c.totalStock > 5000 && c.totalDemand > 5000 && c.maxSellPrice - c.minBuyPrice >= minGap)
    .sort((a, b) => b.maxSellPrice - b.minBuyPrice - (a.maxSellPrice - a.minBuyPrice))
    .slice(0, max)
    .map((c) => c.commodityName);
}
