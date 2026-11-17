// Tests du module Minage vaisseau : lecture du prospecteur (journaux de référence, 24 oct. 2026), drones, raffinage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prospect, ShipMiningState } from './state.js';

const gold = {
  event: 'ProspectedAsteroid', timestamp: '2026-10-24T07:39:01Z',
  Materials: [{ Name: 'gold', Name_Localised: 'Or', Proportion: 39.146961 }, { Name: 'coltan', Proportion: 15.750734 }, { Name: 'Samarium', Proportion: 6.472422 }],
  Content: '$AsteroidMaterialContent_Medium;', Content_Localised: 'Présence de matériaux : moyenne', Remaining: 100,
};

const PRICES = { gold: 56400, coltan: 7800, samarium: 36800, lepidolite: 6500, platinum: 274600, bauxite: 14200 };

test('prospecteur : valeur estimée par tonne (teneur × prix), minerais triés par valeur', () => {
  const p = prospect(gold, PRICES);
  assert.deepEqual(p.materials[0], { name: 'Or', proportion: 39.1, price: 56400, value: 22052 });
  assert.equal(p.value, 22052 + 1232 + 2392);
  assert.equal(p.verdict, 'fair');
  assert.equal(p.content, 'moyenne');
  assert.equal(p.motherlode, null);
});

test('prix avant teneur : 20 % de platine valent mieux que 40 % de bauxite', () => {
  const platinum = prospect({ ...gold, Materials: [{ Name: 'platinum', Proportion: 20 }] }, PRICES);
  const bauxite = prospect({ ...gold, Materials: [{ Name: 'bauxite', Proportion: 40 }] }, PRICES);
  assert.equal(platinum.verdict, 'good');
  assert.equal(bauxite.verdict, 'poor');
});

test('sans prix connu : repli sur la teneur', () => {
  assert.equal(prospect({ ...gold, Materials: [{ Name: 'inconnu', Proportion: 35 }] }, {}).verdict, 'good');
});

test('prospecteur : astéroïde pauvre, et filon mère', () => {
  const poor = prospect({ ...gold, Materials: [{ Name: 'lepidolite', Name_Localised: 'Lépidolite', Proportion: 10.49 }] }, PRICES);
  assert.equal(poor.verdict, 'poor');
  const core = prospect({ ...gold, MotherlodeMaterial: 'Painite', MotherlodeMaterial_Localised: 'Painite', Content: '$AsteroidMaterialContent_High;' });
  assert.equal(core.motherlode, 'Painite');
  assert.equal(core.content, 'élevée');
});

test('raffinage du vaisseau compté ; celui fait au SRV ignoré', () => {
  const s = new ShipMiningState();
  const refine = (t) => ({ event: 'MiningRefined', timestamp: t, Type: '$platinum_name;', Type_Localised: 'Platine' });
  for (const ev of [
    { event: 'LoadGame', timestamp: '2026-11-05T10:00:00Z' },
    { event: 'LaunchDrone', timestamp: 'x', Type: 'Prospector' },
    { event: 'LaunchDrone', timestamp: 'x', Type: 'Collection' },
    refine('2026-11-05T10:05:00Z'),
    refine('2026-11-05T10:20:00Z'),
    { event: 'LaunchSRV', timestamp: 'x' },
    refine('2026-11-05T10:21:00Z'),
    { event: 'DockSRV', timestamp: 'x' },
    gold,
  ]) s.apply(ev);
  const m = s.summary({ count: 120, capacity: 512, drones: 30 }, Date.parse('2026-11-05T10:25:00Z'));
  assert.deepEqual(m.refined, [{ name: 'Platine', tons: 2 }]);
  assert.deepEqual(m.drones, { prospector: 1, collection: 1 });
  assert.equal(m.perHour, 4);
  assert.equal(m.last.best, 39.1);
});
