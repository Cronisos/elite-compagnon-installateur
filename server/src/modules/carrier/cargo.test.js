// Cargaison estimée des porteurs (cargo.js) : transferts à quai au porteur, ventes et achats à son marché, écart au
// total donné par le jeu. Événements d'exemple (forme des journaux 4.x), pas un vrai porteur de l'auteur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CarrierCargo, commodityKey } from './cargo.js';

const MIEN = 3700000001;
const AUTRE = 3700000002;
const stats = (cargo) => ({ event: 'CarrierStats', timestamp: '2026-11-19T20:00:00Z', CarrierID: MIEN, Name: 'PORTEUR 1', Callsign: 'TST-001', SpaceUsage: { TotalCapacity: 25000, Cargo: cargo, FreeSpace: 20000 } });
const docked = (id, name = 'TST-001') => ({ event: 'Docked', timestamp: '2026-11-19T20:01:00Z', StationName: name, StationType: 'FleetCarrier', MarketID: id });
const transfer = (...list) => ({ event: 'CargoTransfer', timestamp: '2026-11-19T20:02:00Z', Transfers: list.map(([Type, Count, Direction, Type_Localised]) => ({ Type, Count, Direction, ...(Type_Localised ? { Type_Localised } : {}) })) });
const run = (events) => {
  const c = new CarrierCargo();
  for (const ev of events) c.apply(ev);
  return c.view();
};

test('noms de marchandise : la même clé, quelle que soit la forme du journal', () => {
  assert.equal(commodityKey('$Steel_name;'), 'steel');
  assert.equal(commodityKey('steel'), 'steel');
  assert.equal(commodityKey('CMM Composite'), 'cmmcomposite');
  assert.equal(commodityKey(42), null);
});

test('transferts à quai à ton porteur : vers le porteur ajoute, vers le vaisseau retire, jamais sous zéro', () => {
  const [c] = run([
    stats(0), docked(MIEN),
    transfer(['steel', 720, 'tocarrier', 'Acier'], ['aluminium', 300, 'tocarrier']),
    transfer(['steel', 100, 'toship'], ['aluminium', 999, 'toship'], ['water', 5, 'tosrv']),
  ]);
  assert.equal(c.mine, true);
  assert.equal(c.name, 'PORTEUR 1');
  assert.deepEqual(c.cargo, [{ symbol: 'steel', name: 'Acier', count: 620 }]);
  assert.equal(c.total, 620);
});

test('hors d’un porteur : rien ne compte ; ventes et achats à son marché, oui', () => {
  const [c] = run([
    stats(0),
    transfer(['steel', 720, 'tocarrier']), // pas à quai à un porteur
    { event: 'MarketBuy', timestamp: '2026-11-19T20:03:00Z', MarketID: 128000001, Type: 'steel', Count: 720, BuyPrice: 300 }, // une station
    { event: 'MarketSell', timestamp: '2026-11-19T20:04:00Z', MarketID: MIEN, Type: '$titanium_name;', Type_Localised: 'Titane', Count: 400, SellPrice: 1000 },
    { event: 'MarketBuy', timestamp: '2026-11-19T20:05:00Z', MarketID: MIEN, Type: 'titanium', Count: 150, BuyPrice: 1000 },
  ]);
  assert.deepEqual(c.cargo, [{ symbol: 'titanium', name: 'Titane', count: 250 }]);
});

test('écart au total donné par le jeu : montré, jamais corrigé', () => {
  const [c] = run([stats(1000), docked(MIEN), transfer(['steel', 600, 'tocarrier'])]);
  assert.equal(c.total, 600);
  assert.deepEqual(c.reported, { cargo: 1000, at: '2026-11-19T20:00:00Z' });
  assert.equal(c.gap, 400);
});

test('le porteur d’un autre (escadron) : suivi à part, pas comme le tien', () => {
  const v = run([stats(0), docked(AUTRE, 'ESC-042'), transfer(['steel', 64, 'tocarrier']), { event: 'Undocked', timestamp: '2026-11-19T20:06:00Z', MarketID: AUTRE }, transfer(['steel', 64, 'tocarrier'])]);
  assert.deepEqual(v.map((c) => [c.id, c.mine, c.callsign, c.total]), [[MIEN, true, 'TST-001', 0], [AUTRE, false, 'ESC-042', 64]]);
});
