import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveSnapshot, marketsByOre, SystemMarkets, systemRanking } from './markets.js';

const SYS = 'Synuefe OU-E c28-2';
// Relevés Ardent du 4 et du 6 nov. 2026 pour ce système
const ROWS = [
  { commodityName: 'iridium', marketId: 1, stationName: 'Flinders City', stationType: 'Outpost', maxLandingPadSize: 2, distanceToArrival: 1872.9, sellPrice: 311649, demand: 15551, updatedAt: '2026-11-04T19:06:07.000Z' },
  { commodityName: 'iridium', marketId: 2, stationName: 'Rivers Depot', stationType: 'AsteroidBase', maxLandingPadSize: 3, distanceToArrival: 1873.1, sellPrice: 194781, demand: 946, updatedAt: '2026-11-06T18:18:57.000Z' },
  { commodityName: 'gold', marketId: 1, stationName: 'Flinders City', stationType: 'Outpost', maxLandingPadSize: 2, sellPrice: 44707, demand: 1, updatedAt: '2026-11-04T19:06:07.000Z' },
  { commodityName: 'gold', marketId: 2, stationName: 'Rivers Depot', stationType: 'AsteroidBase', maxLandingPadSize: 3, sellPrice: 43389, demand: 50, updatedAt: '2026-11-06T18:18:57.000Z' },
  { commodityName: 'tea', marketId: 1, stationName: 'Flinders City', sellPrice: 2000, demand: 10 },
];
const snap = (marketId, at, items, station = 'Rivers Depot') => ({ marketId, station, at, items });

test('prix par minerai : stations du plus offrant au moins offrant, piste et distance', () => {
  const m = marketsByOre(ROWS);
  assert.deepEqual(Object.keys(m).sort(), ['Iridium', 'Or']);
  assert.deepEqual(m.Iridium.map((s) => [s.station, s.sell, s.pad, s.distance, s.mine]), [['Flinders City', 311649, 'M', 1873, false], ['Rivers Depot', 194781, 'L', 1873, false]]);
  // Une demande de 1, c'est pas de demande : la station passe après, même plus chère
  assert.deepEqual(m.Or.map((s) => s.station), ['Rivers Depot', 'Flinders City']);
});

test('ton relevé plus récent qu’Ardent : il l’emporte pour sa station, en entier', () => {
  const m = marketsByOre(ROWS, [snap(2, '2026-11-07T10:45:25Z', [{ commodity: 'iridium', sellPrice: 250000, demand: 4000 }])]);
  const rivers = m.Iridium.find((s) => s.station === 'Rivers Depot');
  assert.deepEqual([rivers.sell, rivers.demand, rivers.mine, rivers.pad, rivers.updatedAt], [250000, 4000, true, 'L', '2026-11-07T10:45:25Z']);
  assert.ok(!m.Or.some((s) => s.station === 'Rivers Depot'), 'l’or n’est plus dans ton relevé : plus acheté');
  // L'autre station garde Ardent
  assert.equal(m.Iridium.find((s) => s.station === 'Flinders City').mine, false);
});

test('ton relevé plus vieux qu’Ardent : Ardent l’emporte ; station inconnue d’Ardent : ton relevé', () => {
  let m = marketsByOre(ROWS, [snap(2, '2026-11-01T08:00:00Z', [{ commodity: 'iridium', sellPrice: 100000, demand: 10 }])]);
  assert.equal(m.Iridium.find((s) => s.station === 'Rivers Depot').sell, 194781);
  m = marketsByOre(ROWS, [snap(9, '2026-11-02T08:00:00Z', [{ commodity: 'iridium', sellPrice: 280000, demand: 300 }], 'Ma Base')]);
  assert.deepEqual(m.Iridium.map((s) => s.station), ['Flinders City', 'Ma Base', 'Rivers Depot']);
  // Plusieurs relevés d'une même station : le plus récent
  m = marketsByOre([], [
    snap(9, '2026-11-02T08:00:00Z', [{ commodity: 'iridium', sellPrice: 280000, demand: 300 }], 'Ma Base'),
    snap(9, '2026-11-05T08:00:00Z', [{ commodity: 'iridium', sellPrice: 290000, demand: 200 }], 'Ma Base'),
  ]);
  assert.equal(m.Iridium[0].sell, 290000);
});

test('Market.json : relevé de ce système seulement, marchandises vraiment achetées', () => {
  const live = {
    timestamp: '2026-11-07T12:00:00Z', MarketID: 2, StationName: 'Rivers Depot', StarSystem: SYS,
    Items: [{ Name: '$iridium_name;', SellPrice: 250000, Demand: 4000 }, { Name: '$gold_name;', SellPrice: 40000, Demand: 0 }],
  };
  assert.deepEqual(liveSnapshot(live, SYS), snap(2, '2026-11-07T12:00:00Z', [{ commodity: 'iridium', sellPrice: 250000, demand: 4000 }]));
  assert.equal(liveSnapshot({ ...live, StarSystem: 'Ailleurs' }, SYS), null);
});

test('Ardent : une requête par système, puis le cache ; injoignable, tes relevés seuls', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    assert.match(url, /system\/name\/Synuefe%20OU-E%20c28-2\/commodities\/imports\?fleetCarriers=false$/);
    return { ok: true, status: 200, json: async () => ROWS };
  };
  const markets = new SystemMarkets({ fetchImpl });
  await markets.forSystem(SYS, [], { online: true });
  const { ores } = await markets.forSystem(SYS, [], { online: true });
  assert.equal(calls, 1);
  assert.equal(ores.Iridium[0].sell, 311649);
  const down = new SystemMarkets({ fetchImpl: async () => ({ ok: false, status: 503 }) });
  const r = await down.forSystem(SYS, [snap(2, '2026-11-01T08:00:00Z', [{ commodity: 'iridium', sellPrice: 1, demand: 5 }])], { online: true });
  assert.match(r.error, /503/);
  assert.equal(r.ores.Iridium[0].sell, 1);
});

test('classement du système : meilleur prix, demande cumulée, sans seuil, sans les stations qui n’achètent pas', () => {
  const ores = {
    Iridium: [{ station: 'Rivers Depot', sell: 194781, demand: 946 }, { station: 'Flinders City', sell: 193567, demand: 15552 }],
    Or: [{ station: 'Rivers Depot', sell: 43389, demand: 50 }, { station: 'Flinders City', sell: 44707, demand: 1 }],
    Argent: [{ station: 'Flinders City', sell: 33775, demand: 1 }],
  };
  assert.deepEqual(systemRanking(ores), [
    { ore: 'Iridium', sell: 194781, station: 'Rivers Depot', demand: 16498, stations: 2 },
    { ore: 'Or', sell: 43389, station: 'Rivers Depot', demand: 50, stations: 1 },
  ]);
});
