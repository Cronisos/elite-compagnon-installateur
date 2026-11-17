// Mode démonstration : ce qui est lu, ce que rend une écriture, et la garde sur les données fictives livrées.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estDemo, reponseDemo } from './demo.js';
import { DONNEES } from './tutoriel/demo/donnees.js';

test('démonstration : seulement avec « demo » dans l’adresse', () => {
  assert.equal(estDemo('?demo=1'), true);
  assert.equal(estDemo('?onglet=vente&demo'), true);
  assert.equal(estDemo(''), false);
  assert.equal(estDemo('?demonstration=1'), false);
});

test('lecture : la donnée du chemin, avec ou sans ses paramètres ; rien de prévu : null ; toujours une copie', () => {
  const d = { '/a': { n: 1 }, '/b?x=1': [1, 2], '/vide': null };
  assert.deepEqual(reponseDemo(d, '/a'), { n: 1 });
  assert.deepEqual(reponseDemo(d, '/a?system=Sol'), { n: 1 });
  assert.deepEqual(reponseDemo(d, '/b?x=1'), [1, 2]);
  assert.equal(reponseDemo(d, '/inconnu'), null);
  assert.equal(reponseDemo(d, '/vide'), null);
  reponseDemo(d, '/a').n = 2;
  assert.equal(d['/a'].n, 1, 'la donnée d’origine n’est jamais modifiée');
  assert.equal(reponseDemo(d, 'constructor'), null, 'jamais une propriété d’Object');
});

test('écriture : rien ne change, et jamais d’erreur', () => {
  const d = { '/a': { n: 1 } };
  assert.deepEqual(reponseDemo(d, '/a', 'PUT'), { n: 1 });
  assert.deepEqual(reponseDemo(d, '/inconnu', 'POST'), {});
  assert.deepEqual(reponseDemo(d, '/a', 'DELETE'), { n: 1 });
  // Action d'un bandeau : la session du module, inchangée (jamais un objet vide que la fenêtre ne saurait pas lire)
  const b = { '/modules/combat/session': { kills: 3, recent: [] } };
  assert.deepEqual(reponseDemo(b, '/modules/combat/pause', 'POST'), { kills: 3, recent: [] });
  assert.deepEqual(reponseDemo(b, '/modules/combat/reset-time', 'POST'), { kills: 3, recent: [] });
  assert.deepEqual(reponseDemo(b, '/modules/rescue/pause', 'POST'), {});
  // Action sur un objet : l'objet lui-même (« Nouveau centre » du balayage rend le balayage)
  const s = { '/modules/waypoints/sweep': { state: 'ready', steps: [1] }, '/modules/waypoints/waypoints': [1, 2] };
  assert.deepEqual(reponseDemo(s, '/modules/waypoints/sweep/center', 'POST'), { state: 'ready', steps: [1] });
  assert.deepEqual(reponseDemo(s, '/modules/waypoints/waypoints/12', 'PUT'), {}, 'jamais une liste à la place d’un objet');
});

test('données livrées : des chemins d’API, un commandant fictif, aucune adresse ni clé', () => {
  const chemins = Object.keys(DONNEES);
  assert.ok(chemins.length >= 10);
  for (const c of chemins) assert.match(c, /^\/[a-z0-9/?=&%._-]+$/i, c);
  const texte = JSON.stringify(DONNEES);
  assert.ok(texte.includes('Testeur'));
  assert.ok(texte.includes('Système Test'));
  for (const interdit of [/https?:\/\//i, /@[a-z0-9-]+\.[a-z]{2,}/i, /ESC1\./, /EGC1\./, /\bF\d{6,8}\b/]) assert.ok(!interdit.test(texte), String(interdit));
});
