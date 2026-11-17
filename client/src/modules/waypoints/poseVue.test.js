// Saisie du tiroir « repère posé » (poseVue.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterChiffre, chercherMinerais, numeroSaisi } from './poseVue.js';

test('« Autre… » : recherche sans accents, début du nom d’abord, texte libre si inconnu', () => {
  const liste = ['Béryllium', 'Bromellite', 'Painite', 'Tritium', 'Uraninite'];
  assert.deepEqual(chercherMinerais(liste, ''), { trouves: liste, libre: null });
  assert.deepEqual(chercherMinerais(liste, 'TRI').trouves, ['Tritium']);
  assert.deepEqual(chercherMinerais(liste, 'ite').trouves, ['Bromellite', 'Painite', 'Uraninite']);
  assert.deepEqual(chercherMinerais(liste, 'beryl').trouves, ['Béryllium']);
  assert.equal(chercherMinerais(liste, 'tritium').libre, null);
  assert.equal(chercherMinerais(liste, '  gaz   rare ').libre, 'Gaz rare');
  assert.deepEqual(chercherMinerais(null, 'x'), { trouves: [], libre: 'X' });
});

test('pavé du numéro d’EEP : chiffres ajoutés, pas de zéro en tête, 3 chiffres au plus', () => {
  assert.equal(ajouterChiffre('', '1'), '1');
  assert.equal(ajouterChiffre('1', '2'), '12');
  assert.equal(ajouterChiffre('', '0'), '');
  assert.equal(ajouterChiffre('123', '4'), '123');
});

test('numéro à enregistrer : rien tapé, effacé, ou l’entier', () => {
  assert.equal(numeroSaisi(null), undefined);
  assert.equal(numeroSaisi(''), null);
  assert.equal(numeroSaisi('12'), 12);
});
