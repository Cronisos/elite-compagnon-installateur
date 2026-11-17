// Phrases de la fiche « Chez l'ingénieur » (visitView.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aboardText, costLine, emptyText, footText, planLine, replacesText, taskLine, visitTitle } from './visitView.js';

test('fiche : titre, raisons, plan, tâches, avertissement R7, coût, bilan', () => {
  assert.equal(visitTitle({ host: { name: 'Broo Tarquin' } }), '🔧 Chez Broo Tarquin');
  assert.equal(emptyText({ reason: 'sans tâche', host: { name: 'Broo Tarquin' } }), 'Rien de prévu chez Broo Tarquin pour tes plans validés.');
  assert.equal(emptyText({ reason: null }), null);
  assert.equal(planLine({ planName: 'Krait', done: { done: 1, total: 2 }, manual: true }), 'Plan « Krait » · 1/2 fait · choisi à la main');
  assert.equal(taskLine({ kind: 'grades', blueprintLabel: 'Efficace', grades: [{ grade: 1, state: 'fait' }, { grade: 2, state: 'en-cours' }, { grade: 3, state: 'a-faire' }] }), 'Efficace : G1 ✓ · ▸G2 · G3');
  assert.equal(taskLine({ kind: 'effet', blueprintLabel: 'Efficace', experimentalLabel: 'Désossage', state: 'verrouille' }), 'Effet « Désossage » : 🔒 après le G1 de Efficace (sinon effacé)');
  assert.equal(replacesText({ blueprintLabel: 'Allégé', currentLabel: 'Efficace', replaces: { blueprint: 'Weapon_Efficient', grade: 3, experimental: 'x', experimentalLabel: 'Désossage', engineer: 'The Dweller' } }), '⚠ Il porte Efficace G3 + effet « Désossage » (The Dweller) : le 1er G1 de Allégé les efface, sans retour.');
  assert.equal(replacesText({ replaces: null }), null);
  assert.equal(aboardText({ aboard: 'pilote' }), 'sur le vaisseau que tu pilotes');
  assert.equal(aboardText({ aboard: 'plan' }), null);
  assert.equal(costLine({ label: 'Carbone', need: 5, owned: 2, missing: 3 }), 'Carbone 5 (tu en as 2, il en manque 3)');
  assert.equal(costLine({ label: 'Carbone', need: 5, owned: 9, missing: 0 }), 'Carbone 5 ✓');
  assert.equal(footText({ done: { all: true } }), '✓ Tout est fait ici pour ce plan.');
  assert.equal(footText({ done: { all: false }, cost: { missingCount: 2 } }), '2 matériaux à compléter avant de tout faire');
});
