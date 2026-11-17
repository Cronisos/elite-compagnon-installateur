// Alertes de passage (services/passage.js) : ingénieurs et échangeurs utiles aux plans dans le système où l'on arrive.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASSAGE_PAGE, Passage, alertesPassage } from '../services/passage.js';

const step = (grade, engineers, unlocked = []) => ({ grade, engineers, status: { list: engineers.map((name) => ({ name, unlocked: unlocked.includes(name) })) } });
const plans = [
  { name: 'Corvette opti', modules: [
    { label: 'Support vital · 5A Support vital', done: false, steps: [step(1, ['Etienne Dorn', 'Bill Turner']), step(2, ['Etienne Dorn']), step(5, ['Etienne Dorn'])] },
    { label: 'Propulseurs', done: true, steps: [step(5, ['Etienne Dorn'])] },
  ] },
  { name: 'Cutter soin', modules: [{ label: 'FSD', done: false, steps: [step(5, ['Felicity Farseer'], ['Felicity Farseer'])] }] },
];
const bases = new Map([['Etienne Dorn', { systemAddress: '111' }], ['Bill Turner', { systemAddress: '222' }], ['Felicity Farseer', { systemAddress: '111' }]]);

test('ingénieurs ici : grades encore à faire, regroupés par module et par plan ; modules finis ignorés', () => {
  const a = alertesPassage({ systemAddress: 111, plans, bases });
  assert.deepEqual(a.map((x) => x.titre), ['Etienne Dorn est ici (pas encore débloqué)', 'Felicity Farseer est ici']);
  assert.deepEqual(a[0].lignes, ['Support vital · 5A Support vital G1 → G5 · Corvette opti']);
  assert.deepEqual(a[1].lignes, ['FSD G5 · Cutter soin']);
  assert.deepEqual(alertesPassage({ systemAddress: 999, plans, bases }), []);
  assert.deepEqual(alertesPassage({ systemAddress: null, plans, bases }), []);
});

test('échangeur ici : seulement si un échange proposé est de son type', () => {
  const propositions = [{ key: 'cc', label: 'Composants conducteurs', echanges: [{ donne: 2, label: 'Protection impériale', recoit: 9 }, { donne: 1, label: 'Polymères', recoit: 3, perdu: 2 }] }, { key: 'x', label: 'X', echanges: [] }];
  const types = new Map([['cc', 'Manufactured'], ['x', 'Raw']]);
  const a = alertesPassage({ systemAddress: 5, echangeurs: [{ station: 'Coggia Hub', type: 'Manufactured', exact: true }, { station: 'Autre', type: 'Raw', exact: false }], propositions, types });
  assert.deepEqual(a, [{ genre: 'echangeur', titre: 'Échangeur ici : Coggia Hub', lignes: ['2 Protection impériale → 9 Composants conducteurs', '1 Polymères → 3 Composants conducteurs (dont 2 perdus au plafond)'] }]);
});

test('en direct : ouvre la fenêtre en arrivant là où c’est utile, la ferme au saut suivant ; rien à la relecture', async () => {
  const appels = [];
  const diffusions = [];
  const svc = {
    ref: { engineerBases: bases },
    traders: { stations: new Map() },
    dashboardData: async () => ({ result: { echanges: { propositions: [] }, global: { materials: [] } }, items: plans.map((p) => ({ name: p.name, view: { calc: { modules: p.modules } } })) }),
  };
  const p = new Passage(svc, { overlay: { setExtra: (page, on) => appels.push([page, on]) }, broadcast: (t, d) => diffusions.push(d), dureeMs: 60_000 });
  p.onEvent({ event: 'FSDJump', StarSystem: 'Ici', SystemAddress: 111, timestamp: 't' });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(appels.at(-1), [PASSAGE_PAGE, true]);
  assert.equal(p.state().alertes.length, 2);
  p.onEvent({ event: 'FSDJump', StarSystem: 'Vide', SystemAddress: 999, timestamp: 't' });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(appels.at(-1), [PASSAGE_PAGE, false]);
  assert.deepEqual(p.state().alertes, []);
  p.onEvent({ event: 'Docked', SystemAddress: 111 });
  assert.equal(diffusions.length, 2, 'un amarrage n’est pas une arrivée');
  p.close();
});
