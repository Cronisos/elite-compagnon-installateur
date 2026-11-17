import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caches, cleContexte, eeps, planetes, reperesDe, systemes, visibles, vueAuto } from './navReperes.js';

const NOW = new Date('2026-11-12T12:00:00Z');
const TARI = '2027-01-01T00:00:00Z'; // tari jusqu'à cette date
const W = [
  { id: 1, label: 'Iridium', system: 'Système Test', body: 'Système Test 4', siteNumber: 25, drills: 3, depletedUntil: TARI },
  { id: 2, label: 'Iridium', system: 'Système Test', body: 'Système Test 4', siteNumber: 25, drills: 2 },
  { id: 3, label: 'Hélium', system: 'Système Test', body: 'Système Test 4', siteNumber: 10, drills: 4 },
  { id: 4, label: 'Tritium', system: 'Système Test', body: 'Système Test 10 a', siteNumber: 8 },
  { id: 5, label: 'Vieux', system: 'Système Test', body: 'Système Test 2', siteNumber: 17, unprofitable: true },
  { id: 6, label: 'Platine', system: 'Autre Test', body: 'Autre Test 1', siteNumber: null },
];

test('repères : taris et pas rentables cachés sauf demande', () => {
  assert.deepEqual(visibles(W, false, NOW).map((w) => w.id), [2, 3, 4, 6]);
  assert.equal(visibles(W, true, NOW).length, 6);
  assert.equal(caches(W, NOW), 2);
});

test('repères : systèmes (le tien d’abord), planètes (2 avant 10), EEP (sans EEP à la fin)', () => {
  assert.deepEqual(systemes(W, 'autre test').map((s) => [s.system, s.n]), [['Autre Test', 1], ['Système Test', 5]]);
  assert.deepEqual(planetes(W, 'Système Test').map((p) => [p.nom, p.n, p.eeps]), [['2', 1, 1], ['4', 3, 2], ['10 a', 1, 1]]);
  assert.deepEqual(eeps(W, 'Système Test 4', NOW), [{ site: 10, n: 1, taris: 0 }, { site: 25, n: 2, taris: 1 }]);
  assert.deepEqual(eeps(W, 'Autre Test 1', NOW), [{ site: null, n: 1, taris: 0 }]);
  assert.deepEqual(reperesDe(W, 'Système Test 4', 25).map((w) => w.id), [1, 2]);
});

test('repères : la fenêtre suit où tu es (système, planète, EEP ciblé), et repart quand tu en changes', () => {
  const v = visibles(W, false, NOW);
  assert.deepEqual(vueAuto(null, v), {});
  assert.deepEqual(vueAuto({ system: 'Système Test' }, v), { system: 'Système Test' });
  assert.deepEqual(vueAuto({ system: 'Système Test', body: 'Système Test 4' }, v), { system: 'Système Test', body: 'Système Test 4' });
  assert.deepEqual(vueAuto({ system: 'Système Test', body: 'Système Test 4' }, v, { body: 'Système Test 4', site: 25 }), { system: 'Système Test', body: 'Système Test 4', site: 25 });
  // EEP ciblé sans repère : on reste sur la planète ; planète sans repère : sur le système
  assert.deepEqual(vueAuto({ system: 'Système Test', body: 'Système Test 4' }, v, { body: 'Système Test 4', site: 3 }), { system: 'Système Test', body: 'Système Test 4' });
  assert.deepEqual(vueAuto({ system: 'Système Test', body: 'Système Test 7' }, v), { system: 'Système Test' });
  // La position bouge sur la planète : même contexte ; nouvel EEP ciblé ou nouvelle planète : autre contexte
  const ici = { system: 'S', body: 'S 4', latitude: 1 };
  assert.equal(cleContexte(ici, null), cleContexte({ ...ici, latitude: 2 }, null));
  assert.notEqual(cleContexte(ici, null), cleContexte(ici, { body: 'S 4', site: 25 }));
  assert.notEqual(cleContexte(ici, null), cleContexte({ ...ici, body: 'S 5' }, null));
});
