import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tenter, texteEchec } from './actions.js';

test('échec de lecture : ce qui manque et pourquoi, en français', () => {
  assert.equal(texteEchec("l'état des données de référence", "L'app ne répond plus"), "Impossible de lire l'état des données de référence : L'app ne répond plus");
  assert.equal(texteEchec('la liste'), 'Impossible de lire la liste.');
});

test('réussite : résultat renvoyé, ancienne erreur effacée', async () => {
  const vus = [];
  assert.equal(await tenter(async () => 42, (m) => vus.push(m)), 42);
  assert.deepEqual(vus, [null]);
});

test('échec : message remis à la page, aucune promesse rejetée', async () => {
  const vus = [];
  const r = await tenter(async () => {
    throw new Error("L'app ne répond plus");
  }, (m) => vus.push(m));
  assert.equal(r, undefined);
  assert.deepEqual(vus, ["L'app ne répond plus"]);
});

test('requête annulée : ni erreur ni message', async () => {
  const vus = [];
  await tenter(async () => {
    throw new DOMException('annulée', 'AbortError');
  }, (m) => vus.push(m));
  assert.deepEqual(vus, []);
});

test('sans fonction d’erreur : l’échec reste silencieux mais ne rejette pas', async () => {
  await assert.doesNotReject(tenter(async () => {
    throw new Error('x');
  }));
});
