// Cache des réponses d'Ardent (Calculateur de routes) : borné, et les réponses périmées lues sont retirées. Avant,
// chaque recherche (environ 120 adresses) et chaque frappe de l'autocomplétion restaient en mémoire jusqu'au
// redémarrage. Faux fetch : rien ne part.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ArdentClient, CACHE_MAX } from './ardent.js';

const faux = () => {
  let n = 0;
  const fn = async () => {
    n += 1;
    return { ok: true, status: 200, json: async () => ({ n }) };
  };
  fn.count = () => n;
  return fn;
};

test('1 000 adresses différentes : le cache reste au plafond, les plus anciennes partent', async () => {
  const f = faux();
  const a = new ArdentClient({ fetchImpl: f });
  for (let i = 0; i < 1000; i++) await a.get(`/system/name/Sys${i}`);
  assert.equal(CACHE_MAX, 500);
  assert.equal(a.cache.size, CACHE_MAX);
  assert.ok(a.cache.has('https://api.ardent-insight.com/v2/system/name/Sys999'));
  assert.ok(!a.cache.has('https://api.ardent-insight.com/v2/system/name/Sys0'));
  await a.get('/system/name/Sys999');
  assert.equal(f.count(), 1000, 'une réponse récente est servie par le cache');
});

test('réponse périmée (plus de 15 min) : retirée à la lecture, puis redemandée', async (t) => {
  let now = Date.UTC(2026, 10, 8, 12);
  t.mock.method(Date, 'now', () => now);
  const f = faux();
  const a = new ArdentClient({ fetchImpl: f });
  await a.get('/commodities');
  now += 20 * 60_000;
  const r = await a.get('/commodities');
  assert.equal(f.count(), 2);
  assert.deepEqual(r, { n: 2 });
  assert.equal(a.cache.size, 1, 'remplacée, pas en double');
  mock.restoreAll();
});
