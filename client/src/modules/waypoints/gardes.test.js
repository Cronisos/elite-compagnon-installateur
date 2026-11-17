// Gardes de la page Mes repères : Échap dans la carte d'un EEP ferme la fenêtre sans quitter la page (B58), et
// « Marquer ici » cliqué deux fois ne crée qu'un repère (B60).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { echapRemonte, uneFois } from './gardes.js';

const page = (modale = false) => ({ querySelector: (s) => (modale && s === '[aria-modal="true"]' ? {} : null) });
const touche = (extra = {}) => ({ key: 'Escape', defaultPrevented: false, target: { closest: () => null }, ...extra });

test('Échap : remonte d’un écran, sauf fenêtre ouverte, Échap déjà pris par elle, ou saisie en cours', () => {
  assert.equal(echapRemonte(touche(), page()), true);
  assert.equal(echapRemonte(touche({ key: 'Enter' }), page()), false);
  assert.equal(echapRemonte(touche({ defaultPrevented: true }), page()), false, 'la Modale l’a déjà pris pour se fermer');
  assert.equal(echapRemonte(touche(), page(true)), false, 'carte d’un EEP ouverte');
  assert.equal(echapRemonte(touche({ target: { closest: () => ({}) } }), page()), false, 'dans un champ');
});

test('« Marquer ici » : un double clic ne lance qu’une création, le bouton est grisé pendant', async () => {
  const verrou = { current: false };
  const etats = [];
  let creations = 0;
  let finir;
  const creer = () => new Promise((r) => { creations++; finir = r; });
  const premier = uneFois(verrou, creer, (v) => etats.push(v));
  const second = await uneFois(verrou, creer, (v) => etats.push(v));
  assert.equal(second, null, 'deuxième clic ignoré');
  finir('repère');
  assert.equal(await premier, 'repère');
  assert.equal(creations, 1);
  assert.deepEqual(etats, [true, false]);
  // Une erreur libère le bouton
  await assert.rejects(uneFois(verrou, async () => { throw new Error('refusé'); }));
  assert.equal(verrou.current, false);
});
