// Tests de la simulation de vente.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNumber, simulate, gradeCounts } from './sim.js';

test('saisie : espaces, virgule, vide', () => {
  assert.equal(parseNumber('835 153'), 835153);
  assert.equal(parseNumber('835 153'), 835153);
  assert.equal(parseNumber('2,5'), 2.5);
  assert.equal(parseNumber(''), 0);
  assert.equal(parseNumber('abc'), 0);
  assert.equal(parseNumber('-3'), 0);
});

test('plusieurs minerais : tonnes et crédits additionnés', () => {
  const r = simulate([{ label: 'Iridium', tons: '100', price: '800 000' }, { label: 'Platine', tons: 50, price: 200000 }]);
  assert.equal(r.tons, 150);
  assert.equal(r.lines[0].credits, 80000000);
  assert.equal(r.credits, 90000000);
});

test('mérites : retrouve les deux ventes réelles à 0,3 % près', () => {
  const r = simulate([
    { label: 'Platine', tons: 399, price: 192906 }, // 29 947 mérites reçus
    { label: 'Iridium', tons: 785, price: 566181 }, // 173 355 mérites reçus
  ]);
  assert.ok(Math.abs(r.lines[0].merits - 29947) / 29947 < 0.003);
  assert.ok(Math.abs(r.lines[1].merits - 173355) / 173355 < 0.003);
  assert.ok(Math.abs(r.merits - 203302) / 203302 < 0.003);
});

test('vente hors du système de minage : aucun mérite', () => {
  const r = simulate([{ label: 'Iridium', tons: 100, price: 800000 }], { sameSystem: false });
  assert.equal(r.credits, 80000000);
  assert.equal(r.merits, 0);
});

test('matériaux : les quantités sont additionnées par grade', () => {
  const materials = [
    { label: 'Fer', grade: 1, count: 12 },
    { label: 'Nickel', grade: 1, count: 3 },
    { label: 'Polymères', grade: 3, count: 7 },
    { label: 'Inconnu', count: 50 },
  ];
  assert.deepEqual(gradeCounts(materials), [15, 0, 7, 0, 0]);
});
