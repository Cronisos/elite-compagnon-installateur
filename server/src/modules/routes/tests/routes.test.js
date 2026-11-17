// Tests de la détection de route et des calculs, sur un extrait réel du journal
// (Journal.2026-10-27T181355.01.log, route Port Draught ⇄ Cemiess).
// Lancer : npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLines } from '../../../core/journalFiles.js';
import { buildTimeline } from '../services/timeline.js';
import { detectRoute } from '../services/detector.js';
import { extractLoops, markPauses, median, activeBetween, activeUntilLast } from '../services/loops.js';
import { project, priceTrend, ladenRange, stockTrend, slope, computeStats } from '../services/calc.js';

const fixture = fileURLToPath(new URL('./fixtures/port-draught-cemiess.log', import.meta.url));
const events = parseLines(fs.readFileSync(fixture, 'utf8'));
const timeline = buildTimeline(events);
const PD = 'ICZ KC-U b3-4';

function routeFrom(d) {
  return { startSystem: d.startSystem, startStation: d.startStation, startCommodity: d.startCommodity, stops: d.stops };
}

test('le fixture est lisible', () => {
  assert.ok(events.length > 400);
});

test('détection : route Port Draught ⇄ Cemiess (départ Port Draught)', () => {
  const d = detectRoute(timeline, { anchorSystem: PD });
  assert.ok(d, 'une route doit être détectée');
  assert.equal(d.startStation, 'Port Draught');
  assert.equal(d.startSystem, PD);
  assert.equal(d.startMarketId, 4362099715);
  assert.equal(d.startCommodity, 'bauxite');
  assert.equal(d.stops.length, 1);
  assert.equal(d.stops[0].system, 'Cemiess');
  assert.ok(['Meech Dock', 'Shoemaker City'].includes(d.stops[0].station));
  assert.equal(d.stops[0].sells[0].commodity, 'bauxite');
  assert.equal(d.stops[0].buys[0].commodity, 'indium');
  assert.deepEqual(d.legCommodities.map((c) => c.commodity), ['bauxite', 'indium']);
  // Aller : NLTT 4671 puis Cemiess ; retour : 2 sauts jusqu'à ICZ KC-U b3-4
  assert.deepEqual(d.legs[0].jumps.map((j) => j.system), ['NLTT 4671', 'Cemiess']);
  assert.equal(d.legs[1].jumps.at(-1).system, PD);
  assert.equal(d.jumpsPerLoop, 4);
  assert.equal(d.stations[0].pad, 'L');
});

test('détection : sans point de départ imposé, la route part de là où la série a commencé', () => {
  const d = detectRoute(timeline);
  assert.ok(d);
  // Le journal finit par un achat d'indium à Cemiess, mais la série a commencé à Port Draught
  assert.equal(d.startSystem, PD);
  assert.equal(d.startCommodity, 'bauxite');
  assert.deepEqual(d.legCommodities.map((c) => c.commodity), ['bauxite', 'indium']);
  assert.deepEqual(d.anchors.map((a) => a.system).sort(), ['Cemiess', PD].sort());
  assert.ok(d.occurrences > 10);
});

test('détection : une boucle avec un mauvais achat (retour au départ en cours de route) est ignorée', () => {
  // Cas réel du 28 oct. : bertrandite achetée par erreur à Port Draught au lieu de la bauxite
  const at = (m) => new Date(Date.UTC(2026, 9, 29, 10, m)).toISOString();
  const dock = (m, st, sys, id) => ({ timestamp: at(m), event: 'Docked', StationName: st, StarSystem: sys, MarketID: id });
  const buy = (m, id, type, n, p) => ({ timestamp: at(m), event: 'MarketBuy', MarketID: id, Type: type, Count: n, BuyPrice: p, TotalCost: n * p });
  const sell = (m, id, type, n, p) => ({ timestamp: at(m), event: 'MarketSell', MarketID: id, Type: type, Count: n, SellPrice: p, TotalSale: n * p });
  const und = (m) => ({ timestamp: at(m), event: 'Undocked' });
  const ev = [
    dock(0, 'Port Draught', PD, 1), buy(1, 1, 'bauxite', 100, 706), und(2),
    dock(8, 'Shoemaker City', 'Cemiess', 2), sell(9, 2, 'bauxite', 100, 41661), buy(10, 2, 'indium', 100, 2360), und(11),
    dock(17, 'Port Draught', PD, 1), sell(18, 1, 'indium', 100, 24700), buy(19, 1, 'bauxite', 100, 706), und(20),
    dock(26, 'Shoemaker City', 'Cemiess', 2), sell(27, 2, 'bauxite', 100, 41661), buy(28, 2, 'indium', 100, 2360), und(29),
    dock(35, 'Port Draught', PD, 1), sell(36, 1, 'indium', 100, 24700), buy(37, 1, 'bertrandite', 100, 16380), und(38),
    dock(44, 'Shoemaker City', 'Cemiess', 2), sell(45, 2, 'bertrandite', 100, 2138), buy(46, 2, 'indium', 100, 2360), und(47),
    dock(53, 'Port Draught', PD, 1), sell(54, 1, 'indium', 100, 24700), buy(55, 1, 'bauxite', 100, 706),
  ];
  const d = detectRoute(buildTimeline(ev), { anchorSystem: PD });
  assert.equal(d.stops.length, 1);
  assert.equal(d.loopStart, at(1));
  assert.deepEqual(d.legCommodities.map((c) => c.commodity), ['bauxite', 'indium']);

  // Cas qui a donné 9,8 M par boucle : sans point de départ imposé, la dernière boucle
  // complète est Shoemaker (indium) → Port Draught (bertrandite) → Shoemaker. Elle ne doit pas gagner.
  const more = [...ev, und(56), dock(62, 'Shoemaker City', 'Cemiess', 2), sell(63, 2, 'bauxite', 100, 41661), buy(64, 2, 'indium', 100, 2360)];
  const d2 = detectRoute(buildTimeline(more));
  assert.ok(!d2.legCommodities.some((c) => c.commodity === 'bertrandite'), 'la bertrandite n’est pas une marchandise de la route');
  assert.equal(d2.startSystem, PD);
});

test('détection : aucune boucle dans un journal sans commerce', () => {
  assert.equal(detectRoute(buildTimeline([])), null);
});

test('boucle du 27 oct. 23 h 39 (Paris) : 74 591 507 cr, 2 053 mérites, 14,0 min', () => {
  const d = detectRoute(timeline, { anchorSystem: PD });
  const { loops } = extractLoops(timeline, routeFrom(d));
  const l = loops.find((x) => x.startAt === '2026-10-27T22:39:33.000Z');
  assert.ok(l, 'boucle trouvée');
  assert.equal(l.netGain, 74591507);
  assert.equal(l.merits, 2053);
  assert.equal((l.durationSec / 60).toFixed(1), '14.0');
  assert.equal(l.cargo, 1168);
});

test('boucle du 28 oct. 00 h 35 (Paris) : 78 548 150 cr, 2 176 mérites, 12,7 min, soute 1 232 t', () => {
  const d = detectRoute(timeline, { anchorSystem: PD });
  const { loops } = extractLoops(timeline, routeFrom(d));
  const l = loops.find((x) => x.startAt === '2026-10-27T23:35:09.000Z');
  assert.ok(l);
  assert.equal(l.netGain, 78548150);
  assert.equal(l.merits, 2176);
  assert.equal((l.durationSec / 60).toFixed(1), '12.7');
  assert.equal(l.cargo, 1232);
});

test('gain net = somme exacte des événements (au crédit près) sur chaque boucle', () => {
  const d = detectRoute(timeline, { anchorSystem: PD });
  const { loops } = extractLoops(timeline, routeFrom(d));
  for (const l of loops) {
    const expected = l.sales - l.purchases - l.fuel - l.repairs - l.ammo - l.wages - l.rebuy;
    assert.equal(l.netGain, expected);
    assert.ok(Number.isInteger(l.netGain));
  }
});

test('destruction du 28 oct. 04 h 39 UTC : boucle marquée, rachat lu (0, aucun Resurrect)', () => {
  const d = detectRoute(timeline, { anchorSystem: PD });
  const { loops } = extractLoops(timeline, routeFrom(d));
  const l = loops.find((x) => x.startAt === '2026-10-28T04:24:53.000Z');
  assert.ok(l);
  assert.equal(l.destroyed, true);
  assert.equal(l.rebuy, 0);
  assert.ok(l.tags.some((t) => t.type === 'destroyed'));
  assert.ok(l.netGain < 74e6, 'la cargaison d’indium est perdue');
});

test('changement de station dans Cemiess détecté (Meech Dock / Shoemaker City)', () => {
  const d = detectRoute(timeline, { anchorSystem: PD });
  const { loops } = extractLoops(timeline, routeFrom(d));
  const other = d.stops[0].station === 'Meech Dock' ? 'Shoemaker City' : 'Meech Dock';
  assert.ok(loops.some((l) => l.tags.some((t) => t.type === 'station' && t.label.includes(other))));
});

test('temps joué : les boucles de référence, sans pause, gardent leur durée', () => {
  const d = detectRoute(timeline, { anchorSystem: PD });
  const { loops } = extractLoops(timeline, routeFrom(d));
  for (const start of ['2026-10-27T22:39:33.000Z', '2026-10-27T23:35:09.000Z']) {
    const l = loops.find((x) => x.startAt === start);
    assert.equal(l.activeSec, l.durationSec, start);
    assert.ok(!l.tags.some((t) => t.type === 'pause'));
  }
  // Sur le vrai journal, aucune boucle normale ne perd de temps à tort
  const normal = loops.filter((l) => l.durationSec < 20 * 60);
  assert.ok(normal.every((l) => l.durationSec - l.activeSec < 60), 'pas de fausse pause');
});

test('temps joué : blanc de plus de 4 min et retour au menu non comptés', () => {
  const s = (t, extra = {}) => ({ t: t * 1000, kind: 'act', ...extra });
  // 0 → 60 → 120 s : joué ; 120 → 720 s (10 min sans action) : pause ; 720 → 780 : joué
  assert.equal(activeBetween([s(0), s(60), s(120), s(720), s(780)], 0, 780 * 1000), 180);
  // Menu principal à 100 s, reprise à 200 s : les 100 s de menu ne comptent pas
  assert.equal(activeBetween([s(0), s(100, { menu: true }), s(200), s(260)], 0, 260 * 1000), 160);
  // Boucle en cours : arrêtée à la dernière action
  const r = activeUntilLast([s(0), s(50), s(90)], 0);
  assert.deepEqual([r.active, r.lastT], [90, 90000]);
});

test('pauses : une boucle de plus de 2× la médiane est marquée', () => {
  const loops = [600, 620, 640, 3000].map((s) => ({ durationSec: s }));
  const med = markPauses(loops);
  assert.equal(med, 630);
  assert.deepEqual(loops.map((l) => l.pause), [false, false, false, true]);
  assert.equal(median([]), null);
});

test('projection : arrêt dès que le cumul dépasse le restant', () => {
  const legs = [{ sell: 100, buy: 0, erosion: 0, buyRise: 0 }];
  const p = project({ remaining: 1000, cargo: 3, legs, costPerLoop: 0 });
  assert.equal(p.loops, 4); // 300 par boucle → 4 boucles pour 1 000
  assert.equal(p.firstGain, 300);
  assert.equal(p.reachable, true);
});

test('projection : érosion du prix de vente et hausse du prix d’achat à la boucle i', () => {
  const legs = [{ sell: 100, buy: 0, erosion: 10, buyRise: 5 }];
  const p = project({ remaining: 1e9, cargo: 1, legs, costPerLoop: 0 });
  // boucle i : 100 − 10i − 5i > 0  ⇒  i ≤ 6 : 7 boucles rentables, puis arrêt
  assert.equal(p.loops, 7);
  assert.equal(p.reachable, false);
  assert.equal(p.firstGain, 100);
  assert.equal(p.lastGain, 10);
});

test('projection : objectif déjà atteint', () => {
  assert.equal(project({ remaining: -5, cargo: 1, legs: [], costPerLoop: 0 }).loops, 0);
});

test('érosion mesurée par régression sur les prix de vente', () => {
  const mk = (sell) => ({ trades: [{ commodity: 'indium', side: 'sell', count: 10, total: sell * 10 }, { commodity: 'indium', side: 'buy', count: 10, total: 23000 }] });
  const loops = [25000, 24980, 24960, 24940].map(mk);
  const t = priceTrend(loops, 'indium');
  assert.equal(t.erosion, 20);
  assert.equal(t.lastSell, 24940);
  assert.equal(t.lastBuy, 2300);
  assert.equal(t.buyRise, 0);
  assert.equal(slope([{ x: 0, y: 0 }, { x: 1, y: 2 }]), 2);
});

test('érosion réelle de l’indium sur le journal : positive et réaliste', () => {
  const d = detectRoute(timeline, { anchorSystem: PD });
  const { loops } = extractLoops(timeline, routeFrom(d));
  const t = priceTrend(loops, 'indium');
  assert.ok(t.erosion > 0 && t.erosion < 100, `érosion ${t.erosion}`);
  const b = priceTrend(loops, 'bauxite');
  assert.equal(b.lastSell, 41661);
  assert.ok(b.fixedFor >= 5, 'prix de la bauxite fixe');
});

test('statistiques complètes sur la vraie route', () => {
  const d = detectRoute(timeline, { anchorSystem: PD });
  const { loops } = extractLoops(timeline, routeFrom(d));
  const s = computeStats({ loops, structure: d, goal: 7e9, balance: 3744458253, cargoCapacity: 1232, hoursPerEvening: 3 });
  assert.ok(s.avgMinutes > 10 && s.avgMinutes < 20);
  assert.ok(s.projection.loops > 30 && s.projection.loops < 60, `boucles ${s.projection.loops}`);
  assert.equal(s.projection.jumps, s.projection.loops * 4);
  assert.ok(s.projection.perHour > 150e6);
  assert.ok(s.meritsPerLoop > 1900 && s.meritsPerLoop < 2300);
  assert.equal(s.sensitivity[0].current, true);
  assert.deepEqual(s.sensitivity.slice(1).map((x) => x.price), [30000, 20000, 10000]);
});

test('portée chargée : Panther Clipper Mk II du journal (FSD SCO G5)', () => {
  const loadout = {
    maxJumpRange: 37.843025,
    unladenMass: 1506,
    fuelCapacity: 64,
    fsd: { size: 7, cls: 5, overcharge: true, optimalMass: 4650, maxFuelPerJump: null },
  };
  const r = ladenRange(loadout, 1232, 64);
  assert.ok(r > 20.3 && r < 20.7, `portée ${r}`);
  assert.ok(r > 16.7, 'le plus long saut (16,7 al) passe');
  assert.equal(ladenRange(null, 0, 0), null);
});

// 124 309 t → 59 755 t en 5 h 06 : environ 12 650 t/h
test('tendance du stock : baisse mesurée et heure d’épuisement (indium à Shoemaker City)', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const t = stockTrend(
    [
      { at: '2026-10-28T05:51:00Z', stock: 124309 },
      { at: '2026-10-28T10:57:00Z', stock: 59755 },
    ],
    now
  );
  assert.ok(t.ratePerHour < -12500 && t.ratePerHour > -12800, `${t.ratePerHour}`);
  assert.ok(t.emptyAt > '2026-10-28T10:57:00Z');
});
