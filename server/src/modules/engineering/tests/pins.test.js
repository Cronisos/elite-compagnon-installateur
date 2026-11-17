// Épingles : déduction des applications à distance (R9), saisie du joueur, la plus récente l'emporte, portée par groupe.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deducePins, effectivePin, validatePinsFile } from '../services/pins.js';
import { ref, idx, id } from './helpers/itinerary.js';

const withRef = ref ? test : test.skip;
const app = (over) => ({ at: '2026-11-05T12:20:26Z', engineer: 'Broo Tarquin', engineerId: id('Broo Tarquin'), rank: 3, grade: 3, place: 'distance', experimental: false, blueprint: 'Weapon_Efficient', module: 'hpt_beamlaser_gimbal_large', stationType: 'Orbis', ...over });

withRef('déduction : seulement à distance et sans effet, la plus récente, clé canonique (Weapon_Overcharged + multicanon → MC_Overcharged)', () => {
  const log = {
    applications: [
      app({}),
      app({ at: '2026-11-05T12:20:37Z' }),
      app({ at: '2026-11-05T12:33:56Z', place: 'atelier', experimental: true, blueprint: 'Weapon_Efficient', engineer: 'The Dweller', engineerId: id('The Dweller') }),
      app({ at: '2026-11-05T12:34:06Z', place: 'atelier', blueprint: 'Weapon_LightWeight' }),
      app({ at: '2026-11-06T10:00:00Z', engineer: "Tod 'The Blaster' McQuinn", engineerId: id("Tod 'The Blaster' McQuinn"), rank: 5, grade: 4, blueprint: 'Weapon_Overcharged', module: 'hpt_multicannon_fixed_small' }),
      app({ at: '2026-11-06T11:00:00Z', place: 'inconnu', engineer: 'Felicity Farseer', engineerId: id('Felicity Farseer'), blueprint: 'FSD_LongRange', module: 'int_hyperdrive_size5_class5' }),
    ],
  };
  const pins = deducePins(log, ref, idx);
  assert.deepEqual(pins.get(id('Broo Tarquin')), { grp: 'bl', blueprint: 'Weapon_Efficient', at: '2026-11-05T12:20:37Z', grade: 3, rank: 3, count: 2, stationType: 'Orbis' });
  assert.equal(pins.get(id("Tod 'The Blaster' McQuinn")).blueprint, 'MC_Overcharged');
  assert.equal(pins.get(id("Tod 'The Blaster' McQuinn")).grp, 'mc');
  assert.equal(pins.has(id('The Dweller')), false, 'un effet n’est jamais une épingle');
  assert.equal(pins.has(id('Felicity Farseer')), false, 'lieu inconnu : rien de déduit');
  assert.equal(pins.size, 2, 'une seule épingle par ingénieur');
});

test('épingle retenue : les 7 cas (la plus récente l’emporte)', () => {
  const X = { grp: 'sg', blueprint: 'ShieldGenerator_Thermic', at: '2026-11-08T10:00:00Z' };
  const old = '2026-11-01T10:00:00Z';
  const recent = '2026-11-09T10:00:00Z';
  const Y = (at) => ({ choice: 'pinned', grp: 'sg', blueprint: 'ShieldGenerator_Reinforced', at });
  // aucune saisie, déduction X → X (journal)
  assert.deepEqual(effectivePin(null, X), { pin: { grp: 'sg', blueprint: 'ShieldGenerator_Thermic', source: 'journal', at: X.at }, unused: false, notice: null });
  // rien → rien
  assert.deepEqual(effectivePin(null, null), { pin: null, unused: false, notice: null });
  // saisie Y plus récente → Y
  assert.equal(effectivePin(Y(recent), X).pin.blueprint, 'ShieldGenerator_Reinforced');
  assert.equal(effectivePin(Y(recent), X).pin.source, 'saisie');
  // « Aucun » ou « Je ne sais pas » plus récents → aucune, unused
  for (const choice of ['none', 'unknown']) assert.deepEqual(effectivePin({ choice, at: recent }, X), { pin: null, unused: true, notice: null });
  // saisie Y ≠ X ou « Aucun », plus ancienne → X, contradiction
  for (const s of [Y(old), { choice: 'none', at: old }]) {
    const r = effectivePin(s, X);
    assert.equal(r.pin.blueprint, 'ShieldGenerator_Thermic');
    assert.equal(r.notice.kind, 'contradiction');
  }
  // « Je ne sais pas » plus ancien → X, nouvelle
  assert.equal(effectivePin({ choice: 'unknown', at: old }, X).notice.kind, 'nouvelle');
  // saisie X, quelle que soit la date → X, rien à signaler
  for (const at of [old, recent]) {
    const r = effectivePin({ choice: 'pinned', grp: 'sg', blueprint: 'ShieldGenerator_Thermic', at }, X);
    assert.equal(r.pin.blueprint, 'ShieldGenerator_Thermic');
    assert.equal(r.notice, null);
  }
  // saisie seule
  assert.equal(effectivePin(Y(old), null).pin.source, 'saisie');
});

test('fichier des épingles : forme stricte ; un id inconnu des données est gardé (et ignoré par le calcul)', () => {
  const ok = { version: 1, pins: { 300120: { choice: 'pinned', grp: 'sg', blueprint: 'ShieldGenerator_Thermic', at: '2026-11-08T10:00:00Z' }, 300999: { choice: 'none', at: '2026-11-08T10:00:00Z' } } };
  assert.deepEqual(validatePinsFile(ok), ok);
  const bad = [
    { version: 1, pins: { 300120: { choice: 'pinned', at: '2026-11-08T10:00:00Z' } } },
    { version: 1, pins: { 300120: { choice: 'none', grp: 'sg', at: '2026-11-08T10:00:00Z' } } },
    { version: 1, pins: { 30012: { choice: 'none', at: '2026-11-08T10:00:00Z' } } },
    { version: 1, pins: { 300120: { choice: 'peut-être', at: '2026-11-08T10:00:00Z' } } },
    { version: 1, pins: { 300120: { choice: 'pinned', grp: 'SG!', blueprint: 'x', at: '2026-11-08T10:00:00Z' } } },
    { version: 1, pins: { 300120: { choice: 'none', at: 'jamais' } } },
    { version: 1, pins: [] },
  ];
  for (const b of bad) assert.throws(() => validatePinsFile(b), JSON.stringify(b));
});
