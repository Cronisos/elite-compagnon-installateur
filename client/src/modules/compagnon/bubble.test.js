// Tests de la bulle du compagnon : durée selon la longueur, reste d'une phrase déjà dite, images distinctes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MS, MIN_MS, bubbleMs, distinctImages, remainingMs } from './bubble.js';

test('durée de la bulle : bornée, plus longue pour une longue phrase', () => {
  assert.equal(bubbleMs(''), MIN_MS);
  assert.equal(bubbleMs('o7'), MIN_MS);
  assert.ok(bubbleMs('x'.repeat(80)) > bubbleMs('x'.repeat(40)));
  assert.equal(bubbleMs('x'.repeat(500)), MAX_MS);
});

test('phrase déjà dite : le reste de son temps, ou 0', () => {
  const at = '2026-11-07T21:15:00.000Z';
  const line = { text: 'Salut Testeur !', at };
  const t = Date.parse(at);
  assert.equal(remainingMs(line, t), bubbleMs(line.text));
  assert.equal(remainingMs(line, t + 1000), bubbleMs(line.text) - 1000);
  assert.equal(remainingMs(line, t + 60_000), 0);
  assert.equal(remainingMs(null, t), 0);
  assert.equal(remainingMs({ text: 'x', at: 'pas une date' }, t), 0);
});

test('images distinctes d’un pack : l’image neutre reprise par une humeur manquante n’est chargée qu’une fois', () => {
  const pack = { moods: { neutre: '/a', content: '/a', ravi: '/b', triste: null } };
  assert.deepEqual(distinctImages(pack), ['/a', '/b']);
  assert.deepEqual(distinctImages(null), []);
});
