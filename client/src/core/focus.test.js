import { test } from 'node:test';
import assert from 'node:assert/strict';
import { focusSuivant } from './focus.js';

const [a, b, c] = ['fermer', 'champ', 'valider'];

test('Tab sur le dernier élément : retour au premier de la fenêtre', () => {
  assert.equal(focusSuivant([a, b, c], c), a);
});

test('Maj+Tab sur le premier : vers le dernier', () => {
  assert.equal(focusSuivant([a, b, c], a, true), c);
});

test('au milieu : le navigateur avance seul', () => {
  assert.equal(focusSuivant([a, b, c], b), null);
  assert.equal(focusSuivant([a, b, c], b, true), null);
});

test('focus parti hors de la fenêtre : ramené dedans', () => {
  assert.equal(focusSuivant([a, b, c], 'page derrière'), a);
  assert.equal(focusSuivant([a, b, c], 'page derrière', true), c);
});

test('fenêtre sans élément focalisable : rien à faire', () => {
  assert.equal(focusSuivant([], a), null);
});
