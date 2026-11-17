// Recherche Spansh des Systèmes importants : une réponse anormale (count toujours au plafond, count absent, même page
// sans fin) ne fait plus tourner la recherche sans fin. Faux fetch : rien ne part.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchBodies, MAX_REQUESTS } from './spansh.js';

const PARAMS = { subtypes: ['Metal-rich body'], maxGravity: 2, maxDistance: 500 };
const corps = (i) => ({ id: i, name: `Corps ${i}`, system_name: `Sys ${i}`, system_x: i, system_y: 0, system_z: 0, distance: i, distance_to_arrival: 10, gravity: 0.5, signals: [] });

function faux(reponse) {
  const appels = [];
  const fn = async (url, options) => {
    const body = JSON.parse(options.body);
    appels.push({ min: Number(body.filters.distance.min), max: Number(body.filters.distance.max), page: body.page });
    return { ok: true, json: async () => reponse(body, appels.length) };
  };
  fn.appels = appels;
  return fn;
}

test('count toujours au plafond (filtre de distance ignoré) : tranches jamais plus fines que 0,5 al, arrêt à 200 requêtes', async () => {
  const f = faux(() => ({ count: 25_000, results: Array.from({ length: 500 }, (_, i) => corps(i)) }));
  await assert.rejects(fetchBodies(PARAMS, () => {}, f, 0), (err) => err.status === 502 && /recherche trop longue \(plus de 200 requêtes à Spansh\) : resserre/.test(err.publicMessage));
  assert.equal(f.appels.length, MAX_REQUESTS, 'jamais plus de requêtes que la borne');
  assert.ok(f.appels.every((a) => a.max - a.min >= 0.5 / 2), 'aucune tranche à 0');
});

test('tranche fine au plafond : ses 10 000 premiers résultats gardés, « tronqué », et la même page ne boucle pas', async () => {
  const f = faux((body) => ({ count: body.filters.distance.max - body.filters.distance.min <= 1 ? 12_000 : 0, results: body.filters.distance.max - body.filters.distance.min <= 1 ? Array.from({ length: 500 }, (_, i) => corps(i + body.page * 500)) : [] }));
  const list = await fetchBodies({ ...PARAMS, maxDistance: 1 }, () => {}, f, 0);
  assert.equal(list.truncated, true);
  assert.equal(list.length, 10_000, 'les 10 000 premiers résultats (20 pages de 500)');
  // La tranche de 1 al coupée une fois ; 20 pages pour la première moitié ; la seconde renvoie les mêmes corps : arrêt
  assert.equal(f.appels.length, 1 + 20 + 1);
});

test('« count » absent ou pas un entier : erreur lisible tout de suite, pas de boucle', async () => {
  for (const reponse of [{ results: [corps(1)] }, { count: 'beaucoup', results: [corps(1)] }, { count: 3 }, null]) {
    const f = faux(() => reponse);
    await assert.rejects(fetchBodies(PARAMS, () => {}, f, 0), (err) => err.status === 502 && /Réponse de Spansh illisible/.test(err.publicMessage));
    assert.equal(f.appels.length, 1, JSON.stringify(reponse));
  }
});

test('la même page renvoyée sans fin, count honnête : arrêt dès qu’une page n’apporte rien de nouveau', async () => {
  const f = faux(() => ({ count: 5000, results: Array.from({ length: 500 }, (_, i) => corps(i)) }));
  const list = await fetchBodies(PARAMS, () => {}, f, 0);
  assert.equal(list.length, 500);
  assert.equal(f.appels.length, 2, 'la deuxième page n’apporte rien : arrêt');
});

test('recherche ordinaire : toutes les pages lues, pas tronquée', async () => {
  const f = faux((body) => ({ count: 1200, results: Array.from({ length: body.page < 2 ? 500 : 200 }, (_, i) => corps(i + body.page * 500)) }));
  const list = await fetchBodies(PARAMS, () => {}, f, 0);
  assert.equal(list.length, 1200);
  assert.equal(list.truncated, false);
  assert.equal(f.appels.length, 3);
});

test('durée totale bornée : arrêt au-delà de 5 min', async () => {
  let t = 0;
  const f = faux(() => {
    t += 60_000;
    return { count: 25_000, results: [] };
  });
  await assert.rejects(fetchBodies(PARAMS, () => {}, f, 0, { now: () => t }), /plus de 5 min/);
  assert.ok(f.appels.length <= 7);
});
