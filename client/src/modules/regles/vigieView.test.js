// Phrases de la vigie des règles (vigieView.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alerteTexte, compteurs, fichesVisibles, lireValeur, valeurCourte } from './vigieView.js';

test('valeurs courtes, compteurs, alerte', () => {
  assert.equal(valeurCourte(120000, 'points de contrôle'), '120 000');
  assert.equal(valeurCourte(9000, 'ms'), '9 000 ms');
  assert.equal(valeurCourte(true), 'oui');
  assert.equal(valeurCourte(['a', 'b', 'c', 'd', 'e']), 'a, b, c, d… (5)');
  assert.equal(valeurCourte(null), '—');
  assert.equal(compteurs(null, 'auto'), 'pas encore mesurée');
  assert.equal(compteurs({ total: 12, ecarts: 1, expliques: 1 }, 'auto'), '12 mesures · 2 écarts (1 expliqué)');
  assert.equal(compteurs({ total: 3, ecarts: 0, expliques: 0 }, 'auto'), '3 mesures · conforme');
  assert.equal(alerteTexte({ titre: 'Refroidissement du SCO', valeur: 9000, unite: 'ms', valeurEstimee: 7100, ecarts: 3 }), 'Refroidissement du SCO : la fiche dit 9 000 ms, le jeu montre 7 100 ms (3 écarts inexpliqués de suite).');
});

test('filtres et lecture d’une valeur proposée', () => {
  const domaines = [{ nom: 'a', fiches: [{ id: 'a.x.y', nom: 'X', titre: 'Portée', source: 's', controle: 'auto' }, { id: 'a.x.z', nom: 'Z', titre: 'Autre', source: 's', controle: 'manuel' }] }];
  assert.equal(fichesVisibles(domaines, {}, { controle: 'auto' })[0].fiches.length, 1);
  assert.equal(fichesVisibles(domaines, {}, { texte: 'portée' })[0].fiches[0].nom, 'X');
  assert.equal(fichesVisibles(domaines, { regles: { 'a.x.z': { alerte: {} } } }, { alertes: true })[0].fiches[0].nom, 'Z');
  assert.deepEqual(fichesVisibles(domaines, {}, { texte: 'rien' }), []);
  assert.equal(lireValeur('7 100'), 7100);
  assert.equal(lireValeur('0,05'), 0.05);
  assert.equal(lireValeur('oui'), true);
  assert.equal(lireValeur('Fortified'), 'Fortified');
});
