// Accueil (accueilVue.js) : conseils, session, mérites, objectifs communautaires, à encaisser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { int } from './format.js';
import { aEncaisser, chantiers, chiffresSession, conseils, escadron, meritesSemaine, objectifs } from './accueilVue.js';

test('conseils : rappels du Coup d’œil repris, plans faisables, palier proche ; les plus urgents d’abord', () => {
  const glance = {
    reminders: [
      { level: 'warning', text: 'Données à vendre.' },
      { level: 'danger', text: 'Rachat non couvert.' },
      { level: 'info', text: 'Info.' },
      { level: 'warning' },
    ],
    system: { name: 'Synuefe', progress: 0.95, next: 'Consolidé' },
  };
  const ingenierie = { perPlan: [{ id: 3, name: 'Cutter', canFinishNow: true }, { id: 4, name: 'Corvette', canFinishNow: false }] };
  const c = conseils({ glance, ingenierie });
  assert.deepEqual(c.map((x) => x.ton), ['mauvais', 'attention', 'bon', 'info', 'info']);
  assert.equal(c[0].texte, 'Rachat non couvert.');
  assert.equal(c[2].lien, '/ingenierie/plan/3');
  assert.ok(c.some((x) => x.texte.includes('du palier Consolidé')));
  assert.deepEqual(conseils({ glance: { system: { name: 'X', progress: 0.5, next: 'Y' } } }), []);
  assert.deepEqual(conseils(), []);
});

test('session du mode en cours : chiffres par mode, rien pour un mode sans session', () => {
  assert.deepEqual(chiffresSession('rescue', { collected: 3, delivered: 2, credits: 2500000, merits: 120 }).map((x) => x.label), ['Récupérés', 'Livrés', 'Récompenses', 'Mérites']);
  assert.deepEqual(chiffresSession('combat', { kills: 4, credits: 1000, merits: { combat: 30, other: 9 } }).at(-1), { label: 'Mérites', valeur: '30' });
  assert.equal(chiffresSession('materials', { total: 10, byGrade: [1, 2, 3, 2, 2] })[1].valeur, '4');
  assert.deepEqual(chiffresSession('routes', { x: 1 }), []);
  assert.deepEqual(chiffresSession('rescue', null), []);
});

test('mérites de la semaine, objectifs communautaires, à encaisser', () => {
  const m = meritesSemaine({ merits: 200, ranking: [{ activity: 'mining', merits: 150 }, { activity: 'rescue', merits: 50 }, { activity: 'combat', merits: 0 }] });
  assert.deepEqual(m.activites.map((a) => [a.nom, a.part]), [['Minage', 0.75], ['Sauvetage', 0.25]]);
  assert.equal(meritesSemaine(null), null);
  const o = objectifs({
    active: [{ id: 1, title: 'A', station: 'S', system: 'Y', tier: 2, topTier: 6, band: 50, hoursLeft: 12 }],
    toClaim: [{ id: 2, title: 'B', claimAt: { station: 'P', system: 'Q' }, reward: 170000000 }],
  });
  assert.deepEqual(o.map((g) => [g.titre, g.aReclamer]), [['B', true], ['A', false]]);
  assert.equal(o[1].detail, 'palier 2/6 · top 50 %');
  assert.equal(o[0].lieu, 'P · Q');
  assert.deepEqual(objectifs(null), []);
  assert.deepEqual(aEncaisser({ bounties: 0, bonds: 5000, exploration: { value: 2500000, systems: 126 }, exobiology: { value: 0 } }).map((x) => x.label), ['Exploration', 'Obligations de combat']);
  assert.deepEqual(aEncaisser(null), []);
});

test('chantiers en cours (l’actif d’abord) et apport à l’escadron cette semaine', () => {
  const c = chantiers({ active: 2, sites: [
    { marketId: 1, label: 'Fini', complete: true },
    { marketId: 3, label: 'Autre', system: 'B', progress: 0.8, remaining: 500, trips: 2 },
    { marketId: 2, label: 'Actif', system: 'A', progress: 0.2, remaining: 4000, trips: 15 },
  ] });
  assert.deepEqual(c.map((x) => [x.titre, x.actif]), [['Actif', true], ['Autre', false]]);
  assert.equal(c[1].detail, '500 t restantes · 2 voyages');
  assert.deepEqual(chantiers(null), []);
  const e = escadron({ squadron: { name: 'Escadron Test', rank: 'PILOTE' }, rows: [
    { label: 'Powerplay', unit: 'mérites', delta: 162416 }, { label: 'Minage', unit: 'cr', delta: 267177109 }, { label: 'Commerce', unit: 'cr', delta: 0 },
  ] });
  assert.deepEqual(e, { nom: 'Escadron Test', rang: 'Pilote', lignes: [{ label: 'Powerplay', valeur: `${int(162416)} mérites` }, { label: 'Minage', valeur: '267,2 M cr' }] });
  assert.equal(escadron({}), null);
});
