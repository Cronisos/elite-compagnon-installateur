// Tests du module Saut du porteur : saut programmé, annulation, arrivée (journal du 4 nov. 2026).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCarrier } from './state.js';

const stats = { event: 'CarrierStats', timestamp: '2026-11-04T22:13:59Z', CarrierID: 3700000001, Name: 'PORTEUR 1', Callsign: 'TST-001', FuelLevel: 168 };
const request = {
  event: 'CarrierJumpRequest', timestamp: '2026-11-04T22:14:27Z', CarrierID: 3700000001,
  SystemName: 'ICZ RY-R b4-4', Body: 'ICZ RY-R b4-4', DepartureTime: '2026-11-04T22:30:10Z',
};
const at = (iso) => Date.parse(iso);

test('saut programmé : destination, heure de départ du jeu, et porteur', () => {
  const s = buildCarrier([stats, request]).summary(at('2026-11-04T22:20:00Z'));
  assert.equal(s.jump.system, 'ICZ RY-R b4-4');
  assert.equal(s.jump.body, null);
  assert.equal(s.jump.departure, '2026-11-04T22:30:10Z');
  assert.deepEqual(s.jump.carrier, { name: 'PORTEUR 1', callsign: 'TST-001', fuel: 168 });
});

test('le saut reste affiché 2 min après le départ, puis disparaît', () => {
  const c = buildCarrier([stats, request]);
  assert.ok(c.summary(at('2026-11-04T22:31:30Z')).jump);
  assert.equal(c.summary(at('2026-11-04T22:32:30Z')).jump, null);
});

test('annulation : plus de saut', () => {
  const c = buildCarrier([stats, request, { event: 'CarrierJumpCancelled', timestamp: '2026-11-04T22:20:00Z', CarrierID: 3700000001 }]);
  assert.equal(c.summary(at('2026-11-04T22:21:00Z')).jump, null);
});

test('arrivée à destination : saut terminé ; position d\'un autre porteur : sans effet', () => {
  const other = { event: 'CarrierLocation', timestamp: '2026-11-04T22:31:00Z', CarrierID: 3700000002, StarSystem: 'ICZ RY-R b4-4' };
  assert.ok(buildCarrier([stats, request, other]).summary(at('2026-11-04T22:31:10Z')).jump);
  const arrived = { event: 'CarrierJump', timestamp: '2026-11-04T22:31:05Z', MarketID: 3700000001, StarSystem: 'ICZ RY-R b4-4' };
  assert.equal(buildCarrier([stats, request, arrived]).summary(at('2026-11-04T22:31:10Z')).jump, null);
});
