import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestOffer, OrePrices } from './topOres.js';

const row = (sellPrice, demand, stationName = 'Ham Legacy', systemName = 'Col 285 Sector CG-O d6-118') =>
  ({ sellPrice, demand, stationName, systemName, maxLandingPadSize: 3, updatedAt: '2026-11-07T11:10:24.000Z' });

test('meilleure offre : la plus chère parmi celles d’au moins 1 000 t de demande', () => {
  const o = bestOffer([row(1200000, 40), row(1049010, 9750), row(900000, 50000)]);
  assert.deepEqual([o.sell, o.demand, o.station, o.pad], [1049010, 9750, 'Ham Legacy', 'L']);
  assert.equal(bestOffer([row(500000, 999)]), null);
  assert.equal(bestOffer([]), null);
});

test('classement : du plus cher au moins cher, sans les minerais sans offre, en cache', async () => {
  const prices = { iridium: [row(1049010, 9750)], rhodplumsite: [row(842901, 1827)], titanium: [row(5865, 147822)], helium: [row(400000, 10)] };
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    assert.match(url, /minVolume=1000&maxDaysAgo=2&fleetCarriers=false$/);
    const sym = /commodity\/name\/([^/]+)\//.exec(url)[1];
    return { ok: true, status: 200, json: async () => prices[sym] || [] };
  };
  const p = new OrePrices({ Titane: 'titanium', Iridium: 'iridium', Hélium: 'helium', Rhodplumsite: 'rhodplumsite' }, { fetchImpl });
  const list = await p.ranking();
  assert.deepEqual(list.map((o) => [o.ore, o.sell]), [['Iridium', 1049010], ['Rhodplumsite', 842901], ['Titane', 5865]]);
  await p.ranking();
  assert.equal(calls, 4);
  const down = new OrePrices({ Iridium: 'iridium' }, { fetchImpl: async () => ({ ok: false, status: 503 }) });
  // 503 avec un message lisible (le gestionnaire d'erreurs du serveur le renvoie tel quel), pas une erreur interne
  await assert.rejects(down.ranking(), (err) => /injoignable/.test(err.message) && err.status === 503 && err.publicMessage === err.message);
});
