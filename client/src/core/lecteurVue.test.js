// Bloc « Lecteur de journaux » des Paramètres : pendant la relecture (dossier changé), jamais l'ancien journal montré
// comme s'il était le bon.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etatLecteur } from './lecteurVue.js';

test('relecture en cours : annoncée, au lieu de l’ancien journal', () => {
  assert.equal(etatLecteur({ dir: 'D:/Test', file: 'Journal.ancien.log', ready: false }), 'relecture');
});

test('lecture finie : journal actif montré ; état pas encore reçu : rien', () => {
  assert.equal(etatLecteur({ file: 'Journal.log', ready: true }), 'pret');
  assert.equal(etatLecteur({ file: null, ready: true, error: 'Dossier introuvable : D:/Test' }), 'pret');
  assert.equal(etatLecteur(null), null);
});
