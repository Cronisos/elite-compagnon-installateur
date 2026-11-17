// Échangeurs connus (services/traders.js) : appris dans le journal, type exact ou déduit, le plus proche d'abord.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Traders } from '../services/traders.js';

const saut = (sys, addr, pos) => ({ event: 'FSDJump', StarSystem: sys, SystemAddress: addr, StarPos: pos, timestamp: '2026-11-10T10:00:00Z' });
const amarrage = (market, station, sys, addr, eco, services = ['dock', 'materialtrader']) => ({ event: 'Docked', MarketID: market, StationName: station, StarSystem: sys, SystemAddress: addr, StationEconomy: eco, StationServices: services });

test('échangeurs : appris à l’amarrage, type déduit puis exact, du plus proche au plus loin', () => {
  const t = new Traders();
  for (const ev of [
    saut('Loin', 1, [100, 0, 0]),
    amarrage(10, 'Station Loin', 'Loin', 1, '$economy_Industrial;'),
    saut('Pres', 2, [10, 0, 0]),
    amarrage(20, 'Station Pres', 'Pres', 2, '$economy_HighTech;'),
    { event: 'MaterialTrade', MarketID: 20, TraderType: 'manufactured' },
    amarrage(30, 'Sans echangeur', 'Pres', 2, '$economy_Industrial;', ['dock']),
    amarrage(40, 'Inconnue', 'Ailleurs', 3, '$economy_Industrial;'),
  ]) t.apply(ev);
  const m = t.plusProches('Manufactured', [0, 0, 0]);
  assert.deepEqual(m.map((x) => [x.station, x.distanceAl, x.exact]), [['Station Pres', 10, true], ['Station Loin', 100, false], ['Inconnue', null, false]]);
  assert.deepEqual(t.plusProches('Encoded', [0, 0, 0]), [], 'le type exact remplace celui déduit de l’économie');
  assert.deepEqual(t.plusProches('Raw', [0, 0, 0]), []);
  // Un nouvel amarrage ne fait pas oublier le type exact
  t.apply(amarrage(20, 'Station Pres', 'Pres', 2, '$economy_HighTech;'));
  assert.equal(t.plusProches('Manufactured', [0, 0, 0])[0].exact, true);
});
