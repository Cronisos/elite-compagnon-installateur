// Raccourcis clavier : combinaison lue au clavier, écriture en français, doublons, pages proposées.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinaison, doubles, ecrire, pagesProposees } from './raccourcisVue.js';
import { aPlat } from './navigation.js';

const ev = (o) => ({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...o });

test('combinaison pressée : attend une touche, exige Ctrl ou Alt, lit la lettre du clavier du joueur', () => {
  assert.deepEqual(combinaison(ev({ key: 'Alt', code: 'AltLeft', altKey: true })), { attente: true });
  assert.deepEqual(combinaison(ev({ key: 'Shift', code: 'ShiftLeft', shiftKey: true })), { attente: true });
  assert.deepEqual(combinaison(ev({ key: 'K', code: 'KeyK', altKey: true, shiftKey: true })), { touche: 'Alt+Shift+K' });
  assert.deepEqual(combinaison(ev({ key: 'm', code: 'KeyM', ctrlKey: true, altKey: true })), { touche: 'Ctrl+Alt+M' });
  // Azerty : la touche physique « Q » produit « a »
  assert.deepEqual(combinaison(ev({ key: 'a', code: 'KeyQ', altKey: true })), { touche: 'Alt+A' });
  // Chiffre du haut sur un clavier français (« & » sans Maj) : lu par sa place
  assert.deepEqual(combinaison(ev({ key: '&', code: 'Digit1', altKey: true, shiftKey: true })), { touche: 'Alt+Shift+1' });
  assert.deepEqual(combinaison(ev({ key: 'F5', code: 'F5', ctrlKey: true })), { touche: 'Ctrl+F5' });
  assert.match(combinaison(ev({ key: 'k', code: 'KeyK' })).erreur, /Ctrl ou Alt/);
  assert.match(combinaison(ev({ key: 'K', code: 'KeyK', shiftKey: true })).erreur, /Ctrl ou Alt/);
  assert.match(combinaison(ev({ key: 'Escape', code: 'Escape', altKey: true })).erreur, /lettre, un chiffre/);
  assert.match(combinaison(ev({ key: 'k', code: 'KeyK', metaKey: true, altKey: true })).erreur, /Windows/);
});

test('écriture en français, doublons d’un réglage en cours', () => {
  assert.equal(ecrire('Alt+Shift+K'), 'Alt + Maj + K');
  assert.equal(ecrire('Ctrl+Alt+F5'), 'Ctrl + Alt + F5');
  assert.equal(ecrire(null), 'aucun');
  assert.deepEqual(doubles([{ touche: 'Alt+Shift+K' }, { touche: null }, { touche: 'Alt+Shift+H' }], [{ touche: 'Alt+Shift+K' }]), ['Alt+Shift+K']);
  assert.deepEqual(doubles([{ touche: 'Alt+Shift+K' }], [{ touche: 'Alt+Shift+1' }]), []);
});

test('pages proposées : l’accueil d’abord, chaque adresse une fois, avec son chemin dans le menu', () => {
  const pages = pagesProposees(aPlat());
  assert.deepEqual(pages[0], { chemin: '/', titre: 'Accueil' });
  assert.equal(new Set(pages.map((p) => p.chemin)).size, pages.length);
  assert.ok(pages.some((p) => p.chemin === '/vaisseaux' && p.titre === 'Mes vaisseaux'));
  assert.ok(pages.some((p) => p.chemin === '/reperes' && /Minage/.test(p.titre)));
  assert.ok(pages.length > 30);
});
