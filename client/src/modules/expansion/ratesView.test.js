// Tests des libellés de l'onglet « Mérites par heure ».

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RATE_ACTIVITIES, periodLabel, ruleDate, sampleText, stateLabel } from './ratesView.js';

test('état du système en français', () => {
  assert.equal(stateLabel('reinforcement', 'Stronghold'), 'Renforcement · Forteresse');
  assert.equal(stateLabel('acquisition', 'Unoccupied'), 'Prise · Inoccupé');
  assert.equal(stateLabel('undermining', 'Exploited'), 'Sape · Exploité');
  assert.equal(stateLabel('none', null), 'Sans puissance');
  assert.equal(stateLabel('reinforcement', 'NouvelÉtat'), 'Renforcement · NouvelÉtat');
});

test('dates et périodes', () => {
  assert.equal(ruleDate('2025-12-02'), '2 décembre 2025');
  assert.equal(periodLabel('rules', { date: '2026-07-01' }), 'Depuis le dernier changement de règles (1er juillet 2026)');
  assert.equal(periodLabel('week'), 'Semaine Powerplay en cours');
});

test('taille de l’échantillon', () => {
  assert.equal(sampleText({ units: 1, gains: 0, zero: 1 }), '1 travail · 0 gain · dont 1 à 0 mérite');
  assert.equal(sampleText({ units: 12, gains: 14, zero: 0 }), '12 travaux · 14 gains');
  // Gains sans travail (scan de vaisseau, autre) : pas de temps, donc pas de taux
  assert.equal(sampleText({ units: 0, gains: 134, zero: 0 }), '0 travail · 134 gains · sans temps : aucun travail juste avant');
  assert.equal(RATE_ACTIVITIES.get('scan').label, 'Scan de vaisseaux');
});
