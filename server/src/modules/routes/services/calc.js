// Calculs du module Routes : moyennes, érosion des prix, projection jusqu'à l'objectif,
// tableau de sensibilité, portée chargée, tendance du stock.
// Fonctions pures, sans accès à la base : faciles à tester.

import { median, loopSec } from './loops.js';

export const DEFAULT_COST_PER_LOOP = 30000; // carburant + réparations si aucun historique
export const BUY_RISE_RATIO = 0.16; // hausse du prix d'achat ≈ 16 % de l'érosion (à défaut de mesure)
export const RECENT_LOOPS = 20; // fenêtre des moyennes et de l'érosion
export const SENSITIVITY_PRICES = [30000, 20000, 10000];
export const LOW_HOURLY_GAIN = 150e6;

/** Pente d'une régression linéaire (y en fonction de x). */
export function slope(points) {
  const n = points.length;
  if (n < 2) return 0;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den ? num / den : 0;
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Prix moyen pondéré d'une marchandise dans une boucle (achat ou vente). */
function loopPrice(loop, commodity, side) {
  const t = loop.trades.filter((x) => x.commodity === commodity && x.side === side);
  const count = t.reduce((a, x) => a + x.count, 0);
  return count ? t.reduce((a, x) => a + x.total, 0) / count : null;
}

/**
 * Série de prix d'une marchandise sur les boucles, avec dernier prix et érosion mesurée.
 * Érosion = baisse moyenne du prix de vente par boucle (cr/t).
 */
export function priceTrend(loops, commodity) {
  const recent = loops.slice(-RECENT_LOOPS);
  const sells = [];
  const buys = [];
  recent.forEach((l, i) => {
    const s = loopPrice(l, commodity, 'sell');
    const b = loopPrice(l, commodity, 'buy');
    if (s != null) sells.push({ x: i, y: s });
    if (b != null) buys.push({ x: i, y: b });
  });
  const lastOf = (side) => {
    for (let i = loops.length - 1; i >= 0; i--) {
      const p = loopPrice(loops[i], commodity, side);
      if (p != null) return Math.round(p);
    }
    return null;
  };
  const enough = sells.length >= 3;
  const erosion = enough ? Math.max(0, -slope(sells)) : 0;
  const buyRise = buys.length >= 3 ? Math.max(0, slope(buys)) : erosion * BUY_RISE_RATIO;
  const sellValues = sells.map((p) => p.y);
  const fixedFor = countTrailingEqual(loops.map((l) => loopPrice(l, commodity, 'sell')).filter((p) => p != null));
  return {
    commodity,
    lastSell: lastOf('sell'),
    lastBuy: lastOf('buy'),
    firstSell: sellValues.length ? Math.round(sellValues[0]) : null,
    erosion: round2(erosion),
    buyRise: round2(buyRise),
    measured: enough,
    fixedFor, // nombre de boucles consécutives avec un prix de vente identique
    series: sells.map((p) => Math.round(p.y)),
  };
}

function countTrailingEqual(values) {
  if (!values.length) return 0;
  const last = Math.round(values[values.length - 1]);
  let n = 0;
  for (let i = values.length - 1; i >= 0 && Math.round(values[i]) === last; i--) n++;
  return n;
}

/**
 * Projection boucle par boucle jusqu'à l'objectif.
 * À la boucle i, chaque prix de vente baisse de érosion × i et chaque prix d'achat
 * monte de buyRise × i. Arrêt dès que le cumul dépasse le restant, ou si une boucle
 * n'est plus rentable.
 */
export function project({ remaining, cargo, legs, costPerLoop, maxLoops = 100000 }) {
  if (remaining <= 0) return { loops: 0, reachable: true, firstGain: null, lastGain: null, total: 0 };
  let cum = 0;
  let first = null;
  let last = null;
  let i = 0;
  while (cum < remaining && i < maxLoops) {
    const margin = legs.reduce(
      (acc, l) => acc + (l.sell - l.erosion * i) - (l.buy + l.buyRise * i),
      0
    );
    const gain = cargo * margin - costPerLoop;
    if (gain <= 0) return { loops: i, reachable: false, firstGain: first, lastGain: last, total: cum };
    if (first == null) first = gain;
    last = gain;
    cum += gain;
    i++;
  }
  return { loops: i, reachable: cum >= remaining, firstGain: first, lastGain: last, total: cum };
}

/**
 * Statistiques complètes d'une route.
 * @param {object} p
 * @param {object[]} p.loops boucles enregistrées (avec trades), ordre chronologique
 * @param {object} p.structure structure de la route (detectRoute)
 * @param {number} p.goal objectif de crédits
 * @param {number|null} p.balance solde actuel
 * @param {number|null} p.cargoCapacity soute (Loadout)
 * @param {number} p.hoursPerEvening heures de jeu par soirée
 * @param {object} [p.overrides] valeurs saisies à la main
 */
export function computeStats({ loops, structure, goal, balance, cargoCapacity, hoursPerEvening, overrides = {} }) {
  const normal = loops.filter((l) => !l.pause && !l.destroyed);
  const recent = normal.slice(-RECENT_LOOPS);

  const avgMinutes = num(overrides.minutesPerLoop) ?? (recent.length ? avg(recent.map(loopSec)) / 60 : null);
  const costPerLoop = recent.length
    ? avg(recent.map((l) => l.fuel + l.repairs + l.ammo + l.wages))
    : DEFAULT_COST_PER_LOOP;
  const meritsPerLoop = recent.length ? avg(recent.map((l) => l.merits)) : 0;
  const avgNet = normal.length ? avg(normal.map((l) => l.netGain)) : null;
  const cargo = num(overrides.cargoCapacity) ?? cargoCapacity ?? loops[loops.length - 1]?.cargo ?? 0;

  // Prix et érosion de chaque marchandise principale (une par étape)
  const trends = (structure.legCommodities || []).filter(Boolean).map((c) => ({
    ...priceTrend(loops, c.commodity),
    name: c.name,
  }));
  const legs = trends
    .filter((t) => t.lastSell != null && t.lastBuy != null)
    .map((t) => ({ sell: t.lastSell, buy: t.lastBuy, erosion: t.erosion, buyRise: t.buyRise }));

  const remaining = balance != null && goal ? goal - balance : null;
  const proj = remaining != null && legs.length ? project({ remaining, cargo, legs, costPerLoop }) : null;
  const hours = proj && avgMinutes ? (proj.loops * avgMinutes) / 60 : null;
  const perHour = proj?.firstGain && avgMinutes ? (proj.firstGain * 60) / avgMinutes : null;

  // Sensibilité au prix de vente de la marchandise aller
  const sensitivity = [];
  if (remaining != null && legs.length) {
    const prices = [legs[0].sell, ...SENSITIVITY_PRICES.filter((p) => p !== legs[0].sell)];
    for (const price of prices) {
      const variant = legs.map((l, i) => (i === 0 ? { ...l, sell: price } : l));
      const p = project({ remaining, cargo, legs: variant, costPerLoop });
      const g = p.firstGain ?? cargo * variant.reduce((a, l) => a + l.sell - l.buy, 0) - costPerLoop;
      const h = avgMinutes ? (g * 60) / avgMinutes : null;
      sensitivity.push({
        price,
        current: price === legs[0].sell,
        gainPerLoop: g,
        gainPerHour: h,
        low: h != null && h < LOW_HOURLY_GAIN,
        loops: p.reachable ? p.loops : null,
      });
    }
  }

  // Durée moyenne de chaque étape
  const legCount = (structure.legs || []).length;
  const legAverages = [];
  for (let k = 0; k < legCount; k++) {
    const vals = recent.map((l) => l.legTimes?.[k]).filter((x) => Number.isFinite(x));
    legAverages.push(vals.length ? avg(vals) : null);
  }

  // Pertes liées aux destructions : manque à gagner par rapport à une boucle normale
  const destroyedLoops = loops.filter((l) => l.destroyed);
  const destructionLoss = avgNet != null
    ? destroyedLoops.reduce((a, l) => a + Math.max(0, avgNet - l.netGain), 0)
    : 0;

  // Contrôle : le gain calculé avec les prix doit coller au gain réellement mesuré
  const last10 = normal.slice(-10);
  const measured = last10.length >= 3 ? avg(last10.map((l) => l.netGain)) : null;
  const projectedNow = proj?.firstGain ?? null;
  const check = measured != null && projectedNow != null
    ? { measured, projected: projectedNow, gap: Math.abs(projectedNow - measured) / Math.abs(measured), ok: Math.abs(projectedNow - measured) <= 0.2 * Math.abs(measured) }
    : null;

  return {
    check,
    loopsCount: loops.length,
    normalCount: normal.length,
    medianMinutes: median(loops.map(loopSec)) / 60 || null,
    avgMinutes,
    avgNet,
    costPerLoop,
    meritsPerLoop,
    cargo,
    trends,
    goal,
    balance,
    remaining,
    progress: goal && balance != null ? Math.min(1, balance / goal) : null,
    projection: proj && {
      ...proj,
      jumps: proj.loops * (structure.jumpsPerLoop || 0),
      hours,
      evenings: hours != null && hoursPerEvening ? Math.ceil(hours / hoursPerEvening) : null,
      perHour,
      merits: Math.round(proj.loops * meritsPerLoop),
    },
    sensitivity,
    legAverages,
    totals: {
      net: loops.reduce((a, l) => a + l.netGain, 0),
      merits: loops.reduce((a, l) => a + l.merits, 0),
      repairs: loops.reduce((a, l) => a + l.repairs, 0),
      wages: loops.reduce((a, l) => a + l.wages, 0),
      rebuy: loops.reduce((a, l) => a + l.rebuy, 0),
      destroyed: destroyedLoops.length,
      destructionLoss,
      playSec: loops.reduce((a, l) => a + loopSec(l), 0), // temps réellement joué
    },
  };
}

// Portée chargée : calcul partagé du cœur (core/ship.js)
export { ladenRange } from '../../../core/ship.js';

/**
 * Tendance du stock d'une marchandise à partir des relevés de Market.json.
 * @param {{ at: Date|string, stock: number }[]} points relevés (ordre quelconque)
 * @returns {{ stock, ratePerHour, emptyAt, spanHours } | null}
 */
export function stockTrend(points, now = Date.now()) {
  const pts = points
    .map((p) => ({ t: new Date(p.at).getTime(), stock: p.stock }))
    .filter((p) => now - p.t <= 24 * 3600e3)
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return pts.length ? { stock: pts[0].stock, ratePerHour: null, emptyAt: null, spanHours: 0 } : null;
  const t0 = pts[0].t;
  const spanHours = (pts[pts.length - 1].t - t0) / 3600e3;
  const last = pts[pts.length - 1];
  if (spanHours < 1 / 3) return { stock: last.stock, ratePerHour: null, emptyAt: null, spanHours };
  const rate = slope(pts.map((p) => ({ x: (p.t - t0) / 3600e3, y: p.stock })));
  const emptyAt = rate < 0 ? new Date(last.t + (last.stock / -rate) * 3600e3).toISOString() : null;
  return { stock: last.stock, ratePerHour: Math.round(rate), emptyAt, spanHours };
}

function num(v) {
  const n = Number(v);
  return v !== '' && v != null && Number.isFinite(n) && n > 0 ? n : null;
}

function round2(x) {
  return Math.round(x * 100) / 100;
}
