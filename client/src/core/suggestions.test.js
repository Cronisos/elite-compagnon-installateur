import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creerSuggestions } from './suggestions.js';

const attendre = () => new Promise((r) => setImmediate(r));

test('frappe rapide : une seule requête, pour le dernier texte, après la pause', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const demandes = [];
  const recus = [];
  const s = creerSuggestions({ chercher: async (q) => { demandes.push(q); return [`${q} A`]; }, recevoir: (l) => recus.push(l) });
  for (const q of ['Syn', 'Synu', 'Synue', 'Synuef']) {
    s.demander(q);
    t.mock.timers.tick(100);
  }
  assert.deepEqual(demandes, [], 'rien pendant la frappe');
  t.mock.timers.tick(300);
  await attendre();
  assert.deepEqual(demandes, ['Synuef']);
  assert.deepEqual(recus, [['Synuef A']]);
});

test('moins de 3 caractères : pas de requête', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const demandes = [];
  const s = creerSuggestions({ chercher: async (q) => { demandes.push(q); return []; }, recevoir: () => {} });
  s.demander('Sy');
  t.mock.timers.tick(1000);
  await attendre();
  assert.deepEqual(demandes, []);
});

test('réponse d’une frappe dépassée : annulée et ignorée, jamais affichée après la bonne', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const enCours = [];
  const recus = [];
  const s = creerSuggestions({
    chercher: (q, signal) => new Promise((resolve, reject) => {
      enCours.push({ q, signal, resolve });
      signal?.addEventListener('abort', () => reject(new DOMException('annulée', 'AbortError')));
    }),
    recevoir: (l) => recus.push(l),
  });
  s.demander('Col');
  t.mock.timers.tick(300);
  await attendre();
  s.demander('Col 285');
  assert.equal(enCours[0].signal.aborted, true, 'la requête précédente est annulée');
  t.mock.timers.tick(300);
  await attendre();
  enCours[1].resolve(['Col 285 Sector']);
  enCours[0].resolve(['Colonia']); // trop tard : ignorée
  await attendre();
  assert.deepEqual(recus, [['Col 285 Sector']]);
});

test('échec du serveur : liste vide ; annuler() coupe la requête prévue', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const recus = [];
  let demandes = 0;
  const s = creerSuggestions({ chercher: async () => { demandes++; throw new Error('Ardent injoignable'); }, recevoir: (l) => recus.push(l) });
  s.demander('Sol');
  t.mock.timers.tick(300);
  await attendre();
  assert.deepEqual(recus, [[]]);
  s.demander('Achenar');
  s.annuler();
  t.mock.timers.tick(1000);
  await attendre();
  assert.equal(demandes, 1);
});
