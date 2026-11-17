// Identifiants stricts : « 1.5 », « 0x10 », « -1 », « 01 » ou « ١ » ne désignent jamais la ligne 1.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ROW_ID, gameShipId, requireRowId, rowId } from './ids.js';

test('rowId : entiers décimaux de 1 à 2 147 483 647 seulement', () => {
  for (const [v, attendu] of [['1', 1], ['42', 42], [String(MAX_ROW_ID), MAX_ROW_ID], [7, 7]]) assert.equal(rowId(v), attendu, String(v));
  for (const v of ['0', '-1', '1.5', '1.0', '01', ' 1', '1 ', '', '0x10', '1e3', 'Infinity', 'NaN', '١', '2147483648', '99999999999999999999', '__proto__', 'constructor', 'toString', 0, -1, 1.5, NaN, Infinity, 2 ** 31, null, undefined, [1], { valueOf: () => 1 }, true]) {
    assert.equal(rowId(v), null, JSON.stringify(v) ?? String(v));
  }
});

test('gameShipId : le ShipID 0 existe (premier vaisseau), le reste comme rowId', () => {
  assert.equal(gameShipId('0'), 0);
  assert.equal(gameShipId(0), 0);
  assert.equal(gameShipId('17'), 17);
  for (const v of ['00', '-0', '-1', '0.5', ' 0', '', '0x0', 0.5, -1]) assert.equal(gameShipId(v), null, String(v));
});

test('requireRowId : erreur 404 lisible pour un identifiant impossible', () => {
  assert.equal(requireRowId('3', 'Build introuvable.'), 3);
  assert.throws(() => requireRowId('1.5', 'Build introuvable.'), (err) => err.status === 404 && err.publicMessage === 'Build introuvable.');
});
