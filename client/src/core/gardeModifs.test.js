// Garde des changements non enregistrés (constructeur…) : quels clics la déclenchent, et la question avant une
// navigation par code (menus).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clicVersAutrePage, confirmerDepart, gardeActive, partirSiAccepte, poserGarde } from './gardeModifs.js';

const ICI = { origin: 'http://127.0.0.1:5173', pathname: '/builder/build/3', search: '', href: 'http://127.0.0.1:5173/builder/build/3' };

/** Clic simulé sur un lien (`attrs` : href, target, download). */
function clic(attrs, e = {}) {
  const lien = {
    getAttribute: (k) => attrs[k] ?? null,
    hasAttribute: (k) => k in attrs,
    target: attrs.target || '',
  };
  return { button: 0, defaultPrevented: false, target: { closest: (sel) => (sel === 'a[href]' && attrs.href != null ? lien : null) }, ...e };
}

test('lien vers une autre page de l’app : garde déclenchée', () => {
  assert.equal(clicVersAutrePage(clic({ href: '/builder/comparer' }), ICI), true);
  assert.equal(clicVersAutrePage(clic({ href: '/' }), ICI), true);
  assert.equal(clicVersAutrePage(clic({ href: '/builder/build/3?x=1' }), ICI), true);
});

test('même page, lien externe, nouvel onglet ou clic modifié : pas de garde', () => {
  assert.equal(clicVersAutrePage(clic({ href: '/builder/build/3' }), ICI), false);
  assert.equal(clicVersAutrePage(clic({ href: 'https://edsy.org/#/L=x', target: '_blank' }), ICI), false);
  assert.equal(clicVersAutrePage(clic({ href: 'https://inara.cz/' }), ICI), false);
  assert.equal(clicVersAutrePage(clic({ href: '/builder' }, { ctrlKey: true }), ICI), false);
  assert.equal(clicVersAutrePage(clic({ href: '/builder' }, { button: 1 }), ICI), false);
  assert.equal(clicVersAutrePage(clic({ href: '/builder' }, { defaultPrevented: true }), ICI), false);
  assert.equal(clicVersAutrePage(clic({ href: '/export.png', download: '' }), ICI), false);
});

test('clic hors d’un lien (bouton, champ) : pas de garde', () => {
  assert.equal(clicVersAutrePage(clic({}), ICI), false);
  assert.equal(clicVersAutrePage({ button: 0, target: null }, ICI), false);
});

test('navigation par code : libre sans garde, question posée avec une garde', () => {
  const questions = [];
  const demander = (m) => {
    questions.push(m);
    return false;
  };
  assert.equal(gardeActive(), false);
  assert.equal(confirmerDepart(demander), true);
  assert.equal(questions.length, 0);

  const retirer = poserGarde('Build non enregistré : quitter ?');
  assert.equal(gardeActive(), true);
  assert.equal(confirmerDepart(demander), false, 'le joueur choisit de rester');
  assert.deepEqual(questions, ['Build non enregistré : quitter ?']);
  assert.equal(confirmerDepart(() => true), true, 'le joueur choisit de partir');

  retirer();
  assert.equal(gardeActive(), false);
  assert.equal(confirmerDepart(demander), true);
});

test('menu Mode de jeu : le mode ne change qu’après accord ; « Annuler » laisse tout en place', () => {
  const faits = [];
  const avant = () => faits.push('mode');
  const aller = () => faits.push('page');

  const retirer = poserGarde('Build non enregistré : quitter ?');
  assert.equal(partirSiAccepte(aller, { avant, demander: () => false }), false);
  assert.deepEqual(faits, [], 'resté sur la page : ni le mode ni les fenêtres en jeu ne bougent');

  assert.equal(partirSiAccepte(aller, { avant, demander: () => true }), true);
  assert.deepEqual(faits, ['mode', 'page']);
  retirer();

  faits.length = 0;
  assert.equal(partirSiAccepte(aller, { avant, demander: () => assert.fail('aucune garde : pas de question') }), true);
  assert.deepEqual(faits, ['mode', 'page']);
});
