// calc.js pour l'itinéraire : atelier à distance (rang fixe), montée de référence (goal), choix imposé dans planNeeds,
// sans rien changer aux résultats actuels (les tests existants le vérifient aussi).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateEngineer, planNeeds, engineerModel, rollsToFinish } from '../services/calc.js';
import { Inventory } from '../services/inventory.js';
import { ref, U, mod, FSD, T6 } from './helpers/itinerary.js';

const withRef = ref ? test : test.skip;
const task = (key, grades, blueprint = 'A', startUnits = 0) => ({ key, blueprint, grades, startUnits });

test('à distance (fixedRank) : rang 3, G3 en 5 applications ; G4 impossible ; aucune montée', () => {
  const r = simulateEngineer({ rank: 3, progress: 0 }, [task('a', [3])], 'prudent', { fixedRank: true });
  assert.deepEqual([r.applications, r.impossible, r.rank, r.ups.length, r.extras.length], [5, false, 3, 0, 0]);
  assert.deepEqual(r.tasks.get('a').per, [{ grade: 3, rolls: 5, ranks: [3], byRank: [{ rank: 3, rolls: 5 }] }]);
  assert.equal(simulateEngineer({ rank: 3, progress: 0 }, [task('a', [3, 4])], 'prudent', { fixedRank: true }).impossible, true);
  // Rang 5 : G1 à G5 en 15 applications, comme à l'atelier (R3d)
  assert.equal(simulateEngineer({ rank: 5, progress: 0 }, [task('a', [1, 2, 3, 4, 5])], 'prudent', { fixedRank: true }).applications, 15);
  // Grade commencé : la qualité de départ compte
  assert.equal(simulateEngineer({ rank: 5, progress: 0 }, [task('a', [3], 'A', 40)], 'prudent', { fixedRank: true }).applications, rollsToFinish(5, 3, 40));
});

test('montée de référence (goal) : rang 2 à 0 %, sans tâche, table seule → 11 applications (4 G1, 3 G2 ; puis 2 G2, 2 G3)', () => {
  const r = simulateEngineer({ rank: 2, progress: 0 }, [], 'prudent', { model: null, goal: { rank: 3, progress: 50 }, climbBlueprint: 'B' });
  assert.equal(r.applications, 11);
  assert.deepEqual(r.extras.map((x) => [x.rank, x.kind, x.grades.map((g) => [g.grade, g.count])]), [[2, 'référence', [[1, 4], [2, 3]]], [3, 'référence', [[2, 2], [3, 2]]]]);
  assert.equal(r.rank, 3);
  // L'ordre : les applications du rang 2, la montée, puis celles du rang 3
  assert.deepEqual(r.order.map((o) => (o.up ? 'montée' : o.extra ? `${o.extra.rank}` : '?')), ['2', 'montée', '3']);
  // Un tiers de la barre : 10
  assert.equal(simulateEngineer({ rank: 2, progress: 0 }, [], 'prudent', { model: null, goal: { rank: 3, progress: 34 }, climbBlueprint: 'B' }).applications, 10);
  // Avec le pire cas du modèle (prudent), au plus 11
  assert.ok(simulateEngineer({ rank: 2, progress: 0 }, [], 'prudent', { goal: { rank: 3, progress: 50 }, climbBlueprint: 'B' }).applications <= 11);
  // Déjà assez haut : rien en plus
  assert.equal(simulateEngineer({ rank: 4, progress: 0 }, [], 'prudent', { goal: { rank: 3, progress: 50 }, climbBlueprint: 'B' }).applications, 0);
  // Des tâches qui font monter le rang comptent pour la référence
  const withTasks = simulateEngineer({ rank: 2, progress: 0 }, [task('a', [1, 2, 3, 4, 5])], 'prudent', { model: null, goal: { rank: 3, progress: 50 }, climbBlueprint: 'B' });
  assert.equal(withTasks.extras.filter((x) => x.kind === 'référence').length, 0);
});

withRef('engineerModel : applications en plus dues aux rangs, mémoïsées ; Infinity si impossible', () => {
  const m = engineerModel(ref, new Map([['Lei Cheung', { progress: 'Known' }], ['Felicity Farseer', U(5)], ['Broo Tarquin', U(3)]]));
  const g5 = [task('x', [1, 2, 3, 4, 5], 'ShieldGenerator_Reinforced')];
  assert.equal(m.extraRolls('Lei Cheung', g5), 10, 'pas encore débloqué : 25 applications au lieu de 15');
  assert.equal(m.extraRolls('Felicity Farseer', g5), 0);
  assert.equal(m.extraRolls('Broo Tarquin', [task('y', [1, 2, 3], 'Weapon_Efficient')], { fixedRank: true, rank: 3 }), 6, 'à distance au rang 3 : 3 + 4 + 5 au lieu de 1 + 2 + 3');
  assert.equal(m.extraRolls('Broo Tarquin', [task('y', [4], 'Weapon_Efficient')], { fixedRank: true, rank: 3 }), Infinity);
  assert.equal(m.simulate('Lei Cheung', g5), m.simulate('Lei Cheung', g5), 'mémoïsé');
});

withRef('planNeeds avec un choix imposé : identique au calcul sans choix quand c’est le même ingénieur ; part à distance ; découpage', () => {
  const engineers = new Map([['Felicity Farseer', U(5)], ['Professor Palin', U(5)], ['Elvira Martuuk', U(5)]]);
  const modules = [mod('std-fsd', FSD, 'FSD_LongRange', 5)];
  const free = planNeeds(ref, { modules, inventory: new Inventory(), engineers });
  const who = free.modules[0].engineer;
  assert.ok(['Felicity Farseer', 'Elvira Martuuk'].includes(who));
  const forced = planNeeds(ref, { modules, inventory: new Inventory(), engineers }, { choice: new Map([[0, { engineer: who }]]) });
  assert.deepEqual(forced.materials, free.materials);
  assert.deepEqual(forced.modules[0].steps.map((s) => s.rolls), free.modules[0].steps.map((s) => s.rolls));
  // À distance chez Felicity au rang 5 : mêmes applications, ligne d'ingénieur « remote »
  const remote = planNeeds(ref, { modules, inventory: new Inventory(), engineers }, { choice: new Map([[0, { remote: 'Felicity Farseer', rank: 5 }]]) });
  assert.equal(remote.rolls, 15);
  assert.deepEqual(remote.engineers.map((e) => [e.name, !!e.remote]), [['Felicity Farseer', true]]);
  assert.equal(remote.modules[0].engineer, 'Felicity Farseer');
  assert.ok(remote.modules[0].steps.every((s) => s.status.best?.name === 'Felicity Farseer'));
  // Découpage : G1 à G3 à distance chez Palin (rang 3 : 12 applications), G4 et G5 chez Elvira
  const split = planNeeds(ref, { modules, inventory: new Inventory(), engineers }, { choice: new Map([[0, { split: { remote: 'Professor Palin', rank: 3, upTo: 3 }, engineer: 'Elvira Martuuk' }]]) });
  assert.deepEqual(split.modules[0].steps.map((s) => [s.grade, s.rolls, s.status.best?.name]), [[1, 3, 'Professor Palin'], [2, 4, 'Professor Palin'], [3, 5, 'Professor Palin'], [4, 4, 'Elvira Martuuk'], [5, 5, 'Elvira Martuuk']]);
  assert.deepEqual(split.engineers.map((e) => [e.name, !!e.remote]).sort(), [['Elvira Martuuk', false], ['Professor Palin', true]]);
  // Sans choix : le calcul habituel (inchangé)
  const thrusters = planNeeds(ref, { modules: [mod('std-t', T6, 'Engine_Dirty', 5)], inventory: new Inventory(), engineers });
  assert.equal(thrusters.rolls, 15);
});
