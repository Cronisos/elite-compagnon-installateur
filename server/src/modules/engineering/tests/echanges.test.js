// Échangeur de matériaux (services/echanges.js) : taux mesurés, lots entiers, choix des matériaux à donner.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lot, planEchanges, taux } from '../services/echanges.js';

const m = (key, grade, category, extra = {}) => ({ key, label: key, type: 'Manufactured', grade, category, ...extra });

test('taux : ceux mesurés dans les journaux du joueur', () => {
  assert.equal(taux(m('a', 5, 'Chemical'), m('b', 1, 'Heat')), 13.5); // 2 isolants pharmaceutiques → 27 câblages
  assert.equal(taux(m('a', 5, 'Chemical'), m('b', 2, 'Heat')), 4.5); // 8 → 36
  assert.equal(taux(m('a', 5, 'Chemical'), m('b', 1, 'Chemical')), 81);
  assert.equal(taux(m('a', 1, 'Chemical'), m('b', 2, 'Chemical')), 1 / 6);
  assert.equal(taux(m('a', 3, 'Heat'), m('b', 4, 'Chemical')), 1 / 36);
});

test('lots entiers, comme au comptoir', () => {
  assert.deepEqual(lot(13.5), { donne: 2, recoit: 27 });
  assert.deepEqual(lot(3), { donne: 1, recoit: 3 });
  assert.deepEqual(lot(0.5), { donne: 2, recoit: 1 });
  assert.deepEqual(lot(1 / 36), { donne: 36, recoit: 1 });
});

test('échanges : surplus seulement, matériau au plafond d’abord, même catégorie ensuite', () => {
  const manques = [m('cible', 3, 'Chemical', { missing: 4 })];
  const stock = [
    m('plein', 1, 'Heat', { count: 300, max: 300, need: 0 }), // au plafond (perdu à la prochaine collecte), autre catégorie
    m('chimie', 2, 'Chemical', { count: 60, max: 250, need: 0 }), // même catégorie : 6 → 1
    m('reserve', 4, 'Chemical', { count: 10, max: 150, need: 10 }), // tout est réservé aux plans
  ];
  const [p] = planEchanges(manques, stock);
  assert.equal(p.reste, 0);
  assert.equal(p.echanges[0].key, 'plein', 'le matériau au plafond passe d’abord');
  // G1 → G3 d'une autre catégorie : 6² × 6 = 216 pour 1 ; 300 en surplus : un seul lot, le reste par la même catégorie
  assert.deepEqual([p.echanges[0].donne, p.echanges[0].recoit], [216, 1]);
  assert.deepEqual([p.echanges[1].key, p.echanges[1].donne, p.echanges[1].recoit], ['chimie', 18, 3]);
  assert.ok(!p.echanges.some((e) => e.key === 'reserve'), 'jamais ce que les plans utilisent');
});

test('échanges : rien d’échangeable (gardiens), ou pas assez de surplus', () => {
  const [g] = planEchanges([{ key: 'guardian', label: 'Gardien', type: 'Manufactured', grade: 3, category: 'None', missing: 2 }], []);
  assert.deepEqual([g.echangeable, g.reste], [false, 2]);
  const [p] = planEchanges([m('cible', 5, 'Chemical', { missing: 2 })], [m('peu', 4, 'Chemical', { count: 7, max: 150, need: 0 })]);
  assert.deepEqual([p.echanges[0].donne, p.echanges[0].recoit, p.reste], [6, 1, 1]);
});

test('échanges : plafond du matériau reçu (max − stock), seul le reçu utile compte, à faire en plusieurs passages', () => {
  // 100 en stock, plafond 300, il en manque 300 : 200 de place seulement
  const [p] = planEchanges([m('fer', 1, 'Heat', { missing: 300 })], [m('fer', 1, 'Heat', { count: 100, max: 300 }), m('source', 2, 'Heat', { count: 250, max: 250 })]);
  // Lots de 3 : 66 lots (198) tiennent, le 67e déborde d'un (perdu, signalé) pour les 2 derniers
  assert.deepEqual([p.echanges[0].recoit, p.echanges[0].perdu, p.reste, p.place, p.plusieursPassages], [201, 1, 100, 200, true]);
  // 290/300, il en manque 5 : seul un lot de 27 existe (2 G5 d'une autre catégorie) → 5 utiles, 17 perdus au plafond
  const [q] = planEchanges([m('cable', 1, 'Heat', { missing: 5 })], [m('cable', 1, 'Heat', { count: 290, max: 300 }), m('pharma', 5, 'Chemical', { count: 10, max: 100 })]);
  assert.deepEqual([q.echanges[0].donne, q.echanges[0].recoit, q.echanges[0].perdu, q.reste, q.plusieursPassages], [2, 27, 17, 0, undefined]);
  // Un lot qui tient sous le plafond passe avant celui qui déborde, même s'il coûte plus
  const [r] = planEchanges([m('cable', 1, 'Heat', { missing: 5 })], [
    m('cable', 1, 'Heat', { count: 290, max: 300 }),
    m('pharma', 5, 'Chemical', { count: 10, max: 100 }),
    m('chaleur', 2, 'Heat', { count: 50, max: 250 }), // 1 → 3, même catégorie
  ]);
  assert.deepEqual(r.echanges.map((e) => [e.key, e.recoit, e.perdu]), [['chaleur', 6, undefined]]);
  assert.equal(r.reste, 0);
  // Stock déjà au plafond : rien à recevoir maintenant
  const [s] = planEchanges([m('plein', 1, 'Heat', { missing: 4 })], [m('plein', 1, 'Heat', { count: 300, max: 300 }), m('source', 2, 'Heat', { count: 50, max: 250 })]);
  assert.deepEqual([s.echanges.length, s.reste, s.place, s.plusieursPassages], [0, 4, 0, true]);
});
