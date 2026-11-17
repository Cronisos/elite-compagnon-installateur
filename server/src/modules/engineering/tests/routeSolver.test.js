// Recherche de l'itinéraire : Held-Karp exact contre la force brute, chemins ouverts, contraintes d'ordre, déterminisme,
// passage en approché au-delà de 16 points ou du budget d'évaluations.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heldKarp, bruteOpen, nearestNeighbor2Opt, bestCover, bitsOf, pathLength, openPath } from '../services/routeSolver.js';

// Suite pseudo-aléatoire à graine fixe (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pointsOf = (r, n) => Array.from({ length: n }, (_, i) => ({ id: i, coords: { x: r() * 200 - 100, y: r() * 50, z: r() * 200 - 100 }, stopCost: 100 }));
const START = { x: 0, y: 0, z: 0 };

function permutations(list) {
  if (list.length <= 1) return [list];
  return list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((p) => [x, ...p]));
}

test('Held-Karp = force brute sur 50 tirages (K ≤ 8), chemin ouvert depuis le départ', () => {
  const r = rng(42);
  for (let k = 0; k < 50; k++) {
    const n = 1 + Math.floor(r() * 8);
    const pts = pointsOf(r, n);
    const hk = heldKarp(START, pts);
    const mask = (1 << n) - 1;
    let brute = Infinity;
    for (const p of permutations(pts.map((_, i) => i))) brute = Math.min(brute, pathLength(START, pts, p));
    assert.ok(Math.abs(hk.best(mask).length - brute) < 1e-6, `tirage ${k}`);
    const path = hk.pathOf(mask);
    assert.equal(path.order.length, n);
    assert.ok(Math.abs(pathLength(START, pts, path.order) - brute) < 1e-6);
    // Sous-ensemble au hasard : la même table le donne
    const sub = 1 + Math.floor(r() * mask);
    const idxs = bitsOf(sub);
    let b2 = Infinity;
    for (const p of permutations(idxs)) b2 = Math.min(b2, pathLength(START, pts, p));
    assert.ok(Math.abs(hk.best(sub).length - b2) < 1e-6);
    assert.ok(Math.abs(bruteOpen(START, pts, idxs).length - b2) < 1e-6);
  }
});

test('chemins : contraintes « a avant b » respectées (force brute, plus proche voisin, 2-opt, Or-opt) ; jamais plus court que le libre', () => {
  const r = rng(7);
  for (let k = 0; k < 20; k++) {
    const pts = pointsOf(r, 9);
    const idxs = pts.map((_, i) => i);
    const before = [[3, 1], [5, 2]];
    for (const res of [bruteOpen(START, pts, idxs.slice(0, 6), [[3, 1], [5, 2]]), nearestNeighbor2Opt(START, pts, { before }), openPath(START, pts, idxs, before)]) {
      const pos = new Map(res.order.map((x, i) => [x, i]));
      for (const [a, b] of before) if (pos.has(a) && pos.has(b)) assert.ok(pos.get(a) < pos.get(b));
    }
    const free = heldKarp(START, pts).best((1 << 9) - 1).length;
    assert.ok(nearestNeighbor2Opt(START, pts, { before }).length >= free - 1e-6);
  }
});

const problemOf = (pts, units, extra = {}) => ({
  startPos: START,
  points: pts,
  choosable: pts.map((_, i) => i),
  units,
  closureOf: (m) => m,
  classOf: () => [0, 0, 0],
  evaluate: (mask, hk) => {
    const idxs = bitsOf(mask);
    const len = hk ? hk.best(mask).length : nearestNeighbor2Opt(START, pts, { idxs }).length;
    return { w: len + idxs.length * 100 };
  },
  ...extra,
});

test('couverture : déterministe, exacte jusqu’à 16 points, sinon approchée ; budget d’évaluations', () => {
  const r = rng(3);
  const pts = pointsOf(r, 10);
  const units = [{ cands: [0, 3, 5] }, { cands: [1, 3] }, { cands: [7, 8] }];
  const a = bestCover(problemOf(pts, units), { exactMax: 16, maxEvaluations: 200000 });
  const b = bestCover(problemOf(pts, units), { exactMax: 16, maxEvaluations: 200000 });
  assert.equal(a.best.mask, b.best.mask);
  assert.equal(a.best.ev.w, b.best.ev.w);
  assert.equal(a.exact, true);
  // La meilleure couverture, par force brute sur les mêmes données
  let brute = null;
  for (let m = 0; m < 1 << 10; m++) {
    if (!units.every((u) => u.cands.some((i) => m & (1 << i)))) continue;
    const w = problemOf(pts, units).evaluate(m, heldKarp(START, pts)).w;
    if (!brute || w < brute.w - 1e-9) brute = { m, w };
  }
  assert.ok(Math.abs(brute.w - a.best.ev.w) < 1e-6);
  // Sans un membre : une autre solution (ou aucune)
  for (const i of bitsOf(a.best.mask)) assert.ok(!a.withoutBest.get(i) || !(a.withoutBest.get(i).mask & (1 << i)));
  // 17 points : approché
  const many = pointsOf(rng(5), 17);
  const big = bestCover(problemOf(many, [{ cands: [0, 16] }, { cands: [4, 9] }]), { exactMax: 16, maxEvaluations: 200000 });
  assert.equal(big.exact, false);
  assert.ok(big.best);
  // Budget dépassé : approché, dit comme tel
  const tight = bestCover(problemOf(pts, units), { exactMax: 16, maxEvaluations: 1 });
  assert.equal(tight.exact, false);
});

test('couverture : la classe (traversée, déblocages, étapes) passe avant le coût', () => {
  const pts = pointsOf(rng(11), 3);
  pts[0].coords = { x: 1, y: 0, z: 0 };
  pts[1].coords = { x: 500, y: 0, z: 0 };
  const res = bestCover(problemOf(pts, [{ cands: [0, 1] }], { classOf: (m) => [0, m & 1 ? 1 : 0, 0] }), { exactMax: 16, maxEvaluations: 1000 });
  assert.equal(res.best.mask, 2, 'le lointain, sans déblocage, plutôt que le proche à débloquer');
  assert.equal(res.bestIgnoringUnlocks.mask, 1);
});
