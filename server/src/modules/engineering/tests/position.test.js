// Position (R10) et distances à vol d'oiseau, depuis les coordonnées des données publiques.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionOf, distanceLy, START_POINTS, POSITION_EVENTS } from '../services/position.js';
import { regionOf, referenceRegion } from '../services/engineerData.js';
import { idx, id, DATA, close } from './helpers/itinerary.js';

const at = (name) => idx.byId.get(id(name)).coords;

test('position : StarPos de Location, FSDJump et CarrierJump ; StarPos invalide → null', () => {
  for (const event of ['Location', 'FSDJump', 'CarrierJump']) {
    const p = positionOf({ timestamp: '2026-11-05T12:28:05Z', event, StarSystem: 'Muang', SystemAddress: 4481966019282, StarPos: [17.03125, -172.78125, -3.46875] });
    assert.deepEqual(p, { system: 'Muang', systemAddress: 4481966019282, starPos: [17.03125, -172.78125, -3.46875], at: '2026-11-05T12:28:05Z', event });
  }
  assert.deepEqual(POSITION_EVENTS, ['FSDJump', 'CarrierJump']);
  for (const StarPos of [undefined, null, [1, 2], [1, 2, 'x'], [1, 2, Infinity], [1, 2, NaN], '1,2,3', { x: 1, y: 2, z: 3 }]) {
    assert.equal(positionOf({ event: 'FSDJump', StarSystem: 'X', StarPos }), null, JSON.stringify(StarPos));
  }
  assert.equal(positionOf({ event: 'Docked', StarPos: [0, 0, 0] }), null);
});

test('distances : valeurs du § 1.2 (au centième)', () => {
  const sol = START_POINTS.sol.starPos;
  const colonia = START_POINTS.colonia.starPos;
  const cases = [
    [sol, 'Lei Cheung', 118.18], [sol, 'The Dweller', 33.84], [sol, 'Professor Palin', 98.02], [sol, 'Mel Brandon', 22013.55],
    [colonia, 'Mel Brandon', 19.63], [colonia, 'Elvira Martuuk', 21979.0],
  ];
  for (const [from, name, d] of cases) assert.ok(close(distanceLy(from, at(name)), d, 0.006), `${name} : ${distanceLy(from, at(name))}`);
  assert.ok(close(distanceLy(at('Lei Cheung'), at('Mel Brandon')), 21899.49, 0.006));
  assert.ok(close(distanceLy(at('Professor Palin'), at('Felicity Farseer')), 128.11, 0.006));
  assert.ok(close(distanceLy(at('Lori Jameson'), at('Etienne Dorn')), 22001.57, 0.006));
});

test('régions : Bulle, Colonia, « autre » (la plus proche, avec la phrase)', () => {
  const R = DATA.data.meta.regions;
  assert.equal(regionOf(START_POINTS.sol.starPos, R), 'Bulle');
  assert.equal(regionOf(at('Etienne Dorn'), R), 'Colonia');
  assert.equal(regionOf(at('Chloe Sedesi'), R), 'Bulle', '877 al de Sol');
  const mid = [-4765, -455, 9904];
  const r = referenceRegion(mid, R);
  assert.ok(['Bulle', 'Colonia'].includes(r.region));
  assert.match(r.note, /^Tu es à .+ al de la Bulle et à .+ al de Colonia : je prends (la Bulle|Colonia) comme base\.$/);
});
