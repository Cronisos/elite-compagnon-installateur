import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldGuide } from './lastSpot.js';

const RP = 1_000_000;
const deg = (m) => (m / RP) * (180 / Math.PI); // mètres → degrés de latitude
const NOW = Date.parse('2026-11-07T10:00:00Z');
const spot = { body: 'Synuefe OU-E c28-2 4', latitude: 0, longitude: 0, site: 25, at: '2026-11-07T09:30:00Z' };
const at = (m, extra = {}) => ({ body: spot.body, latitude: deg(m), longitude: 0, planetRadius: RP, ...extra });

test('retour au minage : boussole vers la dernière tonne si tu reviens sur la planète', () => {
  assert.equal(shouldGuide(spot, at(2000), NOW), true); // posé à 2 km
  assert.equal(shouldGuide(spot, at(100), NOW), false); // déjà sur place
  assert.equal(shouldGuide(spot, at(80000), NOW), false); // autre coin de la planète
  assert.equal(shouldGuide(spot, at(2000, { body: 'Ailleurs 1' }), NOW), false);
  assert.equal(shouldGuide(spot, at(2000), Date.parse(spot.at) + 30000), false); // dernière tonne d'il y a 30 s : pas parti
  assert.equal(shouldGuide(null, at(2000), NOW), false);
  assert.equal(shouldGuide(spot, { body: spot.body, planetRadius: RP }, NOW), false); // pas de position
});
