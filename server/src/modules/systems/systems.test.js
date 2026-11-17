// Tests du module Systèmes importants : zones denses et découpage des recherches Spansh.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findClusters, summarize } from './cluster.js';
import { fetchBodies } from './spansh.js';

const body = (system, x, sites = 0, extra = {}) => ({ name: `${system} 1`, system, x, y: 0, z: 0, sol: Math.abs(x), arrival: 10, sites, power: null, ...extra });

test('zone : toutes les planètes tiennent dans le diamètre demandé', () => {
  const [z] = findClusters([body('A', 0), body('B', 15), body('C', -15), body('D', 25), body('E', 200)], { diameter: 40 });
  assert.equal(z.system, 'A');
  assert.equal(z.planetCount, 3); // D est à 25 AL du centre : hors de la bulle
  const xs = z.planets.map((p) => p.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) <= 40);
});

test('zones : une par région, triées par planètes ou par emplacements', () => {
  const bodies = [body('A', 0), body('A2', 5), body('A3', 10), body('Z', 500, 30), body('Z2', 505, 20)];
  const byPlanets = findClusters(bodies, { diameter: 40 });
  assert.deepEqual(byPlanets.map((c) => c.planetCount), [3, 2]); // A, A2 et A3 ne font qu'une zone
  assert.equal(findClusters(bodies, { diameter: 40, sort: 'sites' })[0].sites, 50);
});

test('zone : puissances comptées, planètes les plus riches en tête', () => {
  const [z] = findClusters([body('A', 0, 5, { power: 'Aisling Duval' }), body('B', 5, 20, { power: 'Aisling Duval' }), body('C', 8)], { diameter: 40 });
  assert.deepEqual(z.powers, { 'Aisling Duval': 2 });
  assert.equal(z.planets[0].system, 'B');
});

test('résumé : planètes possibles, EEP, distance depuis ma position et sauts', () => {
  const planets = [body('Loin', 300, 0), body('Z', 100, 20, { power: 'Aisling Duval' }), body('Z', 100, 5)];
  const s = summarize(planets, 'Z', { x: 0, y: 0, z: 0 }, 30);
  assert.equal(s.planetCount, 3);
  assert.equal(s.planetsWithSites, 2);
  assert.equal(s.sites, 25);
  assert.deepEqual(s.powers, { 'Aisling Duval': 1 });
  assert.equal(s.fromHere, 100); // depuis le système de référence, pas la première planète
  assert.equal(s.jumps, 4);
  assert.equal(s.minutes, 4);
});

test('résumé : sans position connue ni planètes, pas de distance', () => {
  assert.equal(summarize([body('Z', 10)], 'Z', null, 30).fromHere, null);
  assert.equal(summarize([], 'Z', { x: 0, y: 0, z: 0 }, 30).jumps, null);
});

test('Spansh : une tranche au plafond de 10 000 est coupée en deux, sans doublon', async () => {
  const seen = [];
  const fake = async (url, { body: raw }) => {
    const q = JSON.parse(raw);
    const { min, max } = q.filters.distance;
    seen.push(`${min}-${max}`);
    if (min === '0' && max === '100') return { ok: true, json: async () => ({ count: 10000, results: [] }) };
    const id = `${min}`;
    return { ok: true, json: async () => ({ count: 1, results: [{ id, name: id, system_name: id, signals: [{ name: 'Planetary Mining Location', count: 9 }] }] }) };
  };
  const bodies = await fetchBodies({ subtypes: ['Metal-rich body'], maxGravity: 2, maxDistance: 100 }, () => {}, fake, 0);
  assert.deepEqual(seen, ['0-100', '0-50', '50-100']);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].sites, 9);
});
