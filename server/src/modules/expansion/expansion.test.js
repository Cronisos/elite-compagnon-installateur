// Tests du module Projet extension : portée des sauts, bilan de la route, vérification d'une route reçue.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRoute, parseJump, rangeErrors, REACH, ROLES, summary } from './route.js';
import { ACQUISITION_REACH_FORTIFIED_LY, ACQUISITION_REACH_STRONGHOLD_LY } from '../../regles/powerplay.js';

const route = [
  { name: 'A', jump: 0, role: 'held-stronghold' },
  { name: 'B', jump: 29.87, role: 'fortified' },
  { name: 'C', jump: 20, role: 'stronghold' },
  { name: 'D', jump: 30, role: 'target' },
];

test('portée : 30 AL depuis une Forteresse, 20 AL pile depuis un Consolidé', () => {
  assert.deepEqual(rangeErrors(route), []);
});

test('portée : 20,01 AL depuis un Consolidé est refusé', () => {
  const errors = rangeErrors([{ name: 'A', jump: 0, role: 'fortified' }, { name: 'B', jump: 20.01, role: 'target' }]);
  assert.equal(errors.length, 1);
});

test('portée : 30,01 AL depuis une Forteresse est refusé', () => {
  const errors = rangeErrors([{ name: 'A', jump: 0, role: 'stronghold' }, { name: 'B', jump: 30.01, role: 'target' }]);
  assert.equal(errors.length, 1);
});

test('bilan : le système déjà tenu ne compte pas dans les systèmes à prendre', () => {
  assert.deepEqual(summary(route), { toTake: 3, strongholds: 1, distance: 79.87, longest: 30 });
});

test('portée : lue dans le dépôt des règles, pas recopiée (B41)', () => {
  assert.equal(REACH.stronghold, ACQUISITION_REACH_STRONGHOLD_LY);
  assert.equal(REACH['held-stronghold'], ACQUISITION_REACH_STRONGHOLD_LY);
  assert.equal(REACH.fortified, ACQUISITION_REACH_FORTIFIED_LY);
  assert.equal(REACH['held-fortified'], ACQUISITION_REACH_FORTIFIED_LY);
  assert.deepEqual(ROLES, ['held-stronghold', 'held-fortified', 'stronghold', 'fortified', 'target']);
});

test('saut : virgule décimale acceptée ; vide, illisible ou négatif repéré (B49)', () => {
  assert.equal(parseJump('25,4'), 25.4);
  assert.equal(parseJump(' 25.4 '), 25.4);
  assert.equal(parseJump(12), 12);
  assert.equal(parseJump(0), 0);
  assert.equal(parseJump(''), null);
  assert.equal(parseJump(null), null);
  assert.equal(parseJump(undefined), null);
  for (const v of ['-40', -40, 'abc', '1e3', '12,3,4', NaN, Infinity, {}, [], true]) assert.ok(Number.isNaN(parseJump(v)), `${String(v)} doit être refusé`);
});

test('route reçue : saut illisible, manquant ou négatif refusé avec un message clair (B49)', () => {
  const two = (jump) => ({ steps: [{ name: 'Système Test', role: 'held-stronghold' }, { name: 'Système Test 2', role: 'target', jump }] });
  assert.equal(cleanRoute(two('25,4')).route.steps[1].jump, 25.4);
  assert.match(cleanRoute(two('-40')).error, /saut illisible/);
  assert.match(cleanRoute(two(null)).error, /saut manquant/);
  assert.match(cleanRoute(two('abc')).error, /saut illisible « abc »/);
  assert.match(cleanRoute(two('30,5')).error, /hors de portée.*30,5 AL/);
  // Saut vide : calculé depuis les positions du journal quand elles sont connues
  assert.equal(cleanRoute(two(''), { distance: () => 17.25 }).route.steps[1].jump, 17.25);
  // Le départ n'a pas de saut
  assert.equal(cleanRoute({ steps: [{ name: 'A', role: 'held-fortified', jump: 'n’importe quoi' }, { name: 'B', role: 'target', jump: 3 }] }).route.steps[0].jump, 0);
});

test('route reçue : noms, objectifs, doublons sans tenir compte de la casse, orthographe du journal (B43)', () => {
  const canon = (n) => ({ 'synuefe ga-i b57-6': 'Synuefe GA-I b57-6' })[n.toLowerCase()] ?? n;
  const { route: r } = cleanRoute({ name: '  Ma route ', steps: [{ name: 'Départ', role: 'held-stronghold' }, { name: 'synuefe ga-i b57-6', role: 'fortified', jump: 12 }] }, { canon });
  assert.equal(r.name, 'Ma route');
  assert.equal(r.steps[1].name, 'Synuefe GA-I b57-6');
  assert.match(cleanRoute({ steps: [{ name: 'A', role: 'held-stronghold' }, { name: 'a', role: 'target', jump: 1 }] }).error, /deux fois/);
  assert.match(cleanRoute({ steps: [{ name: 'A', role: 'held-stronghold' }, { name: ' ', role: 'target', jump: 1 }] }).error, /Système n° 1 : nom manquant/, 'colonne # : 0 pour le départ');
  assert.match(cleanRoute({ steps: [{ name: ' ', role: 'held-stronghold' }, { name: 'B', role: 'target', jump: 1 }] }).error, /^Départ : nom manquant/);
  assert.match(cleanRoute({ steps: [{ name: 'A', role: 'held-stronghold' }, { name: 'B', role: 'roi', jump: 1 }] }).error, /objectif inconnu/);
  assert.match(cleanRoute({ steps: [{ name: 'A', role: 'held-stronghold' }] }).error, /au moins deux/);
  assert.match(cleanRoute({}).error, /au moins deux/);
  assert.match(cleanRoute({ steps: Array.from({ length: 61 }, (_, i) => ({ name: `S${i}`, role: 'fortified', jump: 1 })) }).error, /au plus 60/);
  assert.equal(cleanRoute({ name: { x: 1 }, steps: [{ name: 'A', role: 'held-stronghold' }, { name: 'B', role: 'target', jump: 1 }] }).route.name, 'Sans nom');
});
