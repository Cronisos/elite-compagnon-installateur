import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bilanRoute, etapesRoute } from './ficheRecue.js';

const ROUTE = {
  name: 'Station Test ⇄ Port Test',
  depart: { system: 'Système Test', station: 'Station Test', pad: 'L', achete: { name: 'Indium', prix: 2360 } },
  etapes: [{ system: 'Système Test 2', station: 'Port Test', pad: 'M', trajet: { sauts: 2, distance: 31.3 }, vend: { name: 'Indium', prix: 24467 }, achete: { name: 'Bauxite', prix: 706 } }],
  retour: { trajet: { sauts: 1, distance: 16.1 }, vend: { name: 'Bauxite', prix: 41661 } },
  gainMoyen: 75516872, minutesMoyennes: 16.775, soute: 1232, boucles: 8, sautLePlusLong: 18.5,
};

test('route reçue : les étapes dans l’ordre, avec quoi acheter et vendre', () => {
  const e = etapesRoute(ROUTE);
  assert.equal(e.length, 3);
  assert.equal(e[0].lieu, 'Station Test · Système Test · plateforme L');
  assert.match(e[0].faire[0], /^Acheter : Indium à 2.360 cr\/t$/);
  assert.equal(e[1].lieu, 'Port Test · Système Test 2 · plateforme M');
  assert.match(e[1].trajet, /^2 sauts, 31,3 al$/);
  assert.equal(e[1].faire.length, 2);
  assert.equal(e[2].lieu, 'Retour à Station Test');
  assert.match(e[2].trajet, /^1 saut, 16,1 al$/);
});

test('route reçue incomplète : rien ne casse', () => {
  assert.deepEqual(etapesRoute(null), []);
  assert.deepEqual(etapesRoute({}), []);
  const e = etapesRoute({ depart: { station: 'Station Test', system: 'Système Test' } });
  assert.equal(e.length, 2);
  assert.deepEqual(e[0].faire, []);
  assert.equal(bilanRoute({}), '');
  assert.equal(bilanRoute(null), '');
});

test('bilan de la route', () => {
  const b = bilanRoute(ROUTE);
  assert.match(b, /par boucle/);
  assert.match(b, /≈ 17 min/);
  assert.match(b, /8 boucles mesurées/);
});
