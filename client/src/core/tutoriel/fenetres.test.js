// Fenêtres en jeu en démonstration : quels jeux de fenêtres sont montrés, et quand l'invitation apparaît.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES } from '../modes.js';
import { DONNEES } from './demo/donnees.js';
import { PARCOURS } from './parcours.js';

// Ces deux modules sont des composants React (JSX) : on n'en teste que la logique, recopiée ici par import dynamique
// impossible sous Node. Les fonctions pures sont donc dans des fichiers lus tels quels par les tests ci-dessous.
import fs from 'node:fs';

const source = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');

test('chaque mode qui a des fenêtres en jeu a sa page de démonstration, sa taille et son nom', () => {
  const page = source('./FenetresEnJeu.jsx');
  for (const m of MODES.filter((x) => x.windows.length)) {
    const principale = m.windows[0];
    assert.match(page, new RegExp(`['"]?${principale.replace('-', '\\-')}['"]?: \\[\\d+, \\d+\\]`), `taille de ${principale}`);
  }
  assert.match(page, /PARAMETRE_DEMO\}=1/, 'les fenêtres sont chargées en démonstration');
  assert.ok(!/src=\{`\/hud\/\$\{page\}`\}/.test(page), 'jamais la vraie fenêtre dans un cadre');
});

test('chaque fenêtre montrée a des données fictives à lire', () => {
  for (const chemin of ['/modules/waypoints/session', '/modules/waypoints/waypoints', '/modules/waypoints/sweep', '/modules/waypoints/here',
    '/modules/shipmining/session', '/modules/combat/session', '/modules/groundcombat/session', '/modules/rescue/session',
    '/modules/materials/session', '/modules/glance/summary']) {
    assert.ok(DONNEES[chemin] && typeof DONNEES[chemin] === 'object', chemin);
  }
  assert.equal(DONNEES['/modules/waypoints/here'].system, 'Système Test');
  assert.equal(DONNEES['/modules/glance/summary'].commander, 'Testeur');
});

test('un tutoriel de fenêtres en jeu vise la page de son mode, et ses étapes de fenêtre ont une cible', () => {
  const jeux = PARCOURS.filter((p) => p.id.startsWith('jeu-'));
  for (const p of jeux) {
    assert.match(p.chemin, /^\/fenetres-en-jeu(\/[a-z]+)?$/, p.id);
    assert.ok(p.etapes.length <= 14, `${p.id} : ${p.etapes.length} étapes`);
    for (const e of p.etapes.filter((x) => x.fenetre)) {
      assert.ok(e.cible, `${p.id} : ${e.titre}`);
      assert.match(e.fenetre, /^[a-z-]+$/);
    }
  }
});
