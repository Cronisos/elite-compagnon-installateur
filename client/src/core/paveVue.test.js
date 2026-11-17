// Pavé tactile (paveVue.js) : boutons à chaque niveau.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FAVORIS, MODE, basculerFavori, favorisVue, filPave, vuePave } from './paveVue.js';
import { PLAN } from './navigation.js';

test('racine : Mode de jeu puis les rubriques, chacune ouvre un sous-menu', () => {
  const v = vuePave([]);
  assert.deepEqual(v.boutons.map((b) => b.titre), ['Mode de jeu', ...PLAN.map((r) => r.titre)]);
  assert.ok(v.boutons.every((b) => b.sous));
  assert.equal(vuePave([MODE]).mode, true);
});

test('dans un menu : « Ouvrir » quand l’entrée a sa page, puis ses enfants ; une feuille ouvre sa page', () => {
  const vaisseaux = PLAN.find((r) => r.id === 'vaisseaux');
  const v = vuePave([vaisseaux]);
  assert.equal(v.boutons[0].page, true);
  assert.equal(v.boutons[0].chemin, '/vaisseaux');
  const ing = PLAN.find((r) => r.id === 'ingenierie');
  const vi = vuePave([ing]);
  assert.ok(!vi.boutons.some((b) => b.page), 'le tableau de bord reprend déjà /ingenierie');
  assert.ok(vi.boutons.some((b) => b.chemin === '/ingenierie/materiaux' && !b.sous));
  const activites = PLAN.find((r) => r.id === 'activites');
  const minage = activites.enfants.find((e) => e.id === 'minage');
  assert.equal(vuePave([activites]).boutons.find((b) => b.id === 'minage').sous, true);
  assert.deepEqual(vuePave([activites, minage]).boutons.map((b) => b.chemin), ['/reperes', '/minage-vaisseau']);
  assert.equal(filPave([activites, minage]), 'Menu › Activités › Minage');
});

test('favoris : pages du plan et modes de jeu, dans l’ordre choisi ; ajout, retrait, 8 au plus', () => {
  const modes = [{ id: 'rescue', label: 'Sauvetage', icon: '✚' }];
  const v = favorisVue(['/combat', 'mode:rescue', '/n-existe-plus', 'mode:inconnu', '/ingenierie/materiaux'], PLAN, modes);
  assert.deepEqual(v.map((b) => b.titre), ['Combat', 'Sauvetage', 'Matériaux']);
  assert.equal(v[1].modeId, 'rescue');
  assert.deepEqual(basculerFavori(['/combat'], '/combat'), []);
  assert.deepEqual(basculerFavori(['/combat'], 'mode:rescue'), ['/combat', 'mode:rescue']);
  const plein = Array.from({ length: MAX_FAVORIS }, (_, i) => `/p${i}`);
  assert.equal(basculerFavori(plein, '/encore'), plein, 'plein : rien n’est ajouté');
});
