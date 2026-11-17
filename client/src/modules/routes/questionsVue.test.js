import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionRetiree } from './questionsVue.js';

test('réponse prise par le serveur : la question disparaît', () => {
  assert.equal(questionRetiree(null), true);
});

test('question déjà traitée ailleurs (404) : elle disparaît aussi', () => {
  assert.equal(questionRetiree(Object.assign(new Error('Question déjà traitée.'), { status: 404 })), true);
});

test('serveur injoignable ou autre échec : la question reste pour réessayer', () => {
  assert.equal(questionRetiree(Object.assign(new Error('L’app ne répond plus'), { status: 0 })), false);
  assert.equal(questionRetiree(Object.assign(new Error('Erreur'), { status: 500 })), false);
});
