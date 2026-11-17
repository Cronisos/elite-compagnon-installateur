// Tests de la mise en forme des objectifs communautaires du Coup d'œil (données de l'OC 863 et 864 de l’auteur, oct. 2026).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandText, communityGoalCash, communityGoalRewardTotal, endText, shownGoals, tierText, zeroAlert } from './communityGoalsView.js';

const mining = {
  id: 863, title: 'Opération minière de Faulcon DeLacy', system: 'Reorte', station: 'Davies High', expiry: '2026-10-29T10:00:00Z',
  status: 'active', contribution: 0, noContribution: true, band: null, inTopRank: false, topRankSize: 10, tier: 1, tierName: 'Tier 1', topTier: 5, reward: null,
};
const trade = {
  id: 864, title: 'Opération commerciale de Faulcon DeLacy', system: 'AD Leonis', station: 'Homer Platform', expiry: '2026-10-29T10:00:00Z',
  status: 'claim', contribution: 789, noContribution: false, band: 75, inTopRank: false, topRankSize: 10, tier: 3, tierName: 'Tier 3', topTier: 6, reward: 170_000_000,
};
const at = (iso) => Date.parse(iso);

test('temps restant : jours, heures, minutes, puis résultats en attente', () => {
  assert.equal(endText(mining, at('2026-10-26T20:03:48Z')), 'fin dans 2 j 13 h');
  assert.equal(endText(mining, at('2026-10-28T17:18:11Z')), 'fin dans 16 h 41');
  assert.equal(endText(mining, at('2026-10-29T09:20:00Z')), 'fin dans 40 min');
  assert.equal(endText(mining, at('2026-10-29T10:30:00Z')), 'terminé · résultats en attente');
  assert.equal(endText({ status: 'active' }), 'fin inconnue');
});

test('alerte « contribution nulle » : seulement à moins de 24 h de la fin', () => {
  assert.equal(zeroAlert(mining, 24, at('2026-10-26T20:03:48Z')), false);
  assert.equal(zeroAlert(mining, 24, at('2026-10-28T10:00:01Z')), true);
  assert.equal(zeroAlert(mining, 24, at('2026-10-29T10:00:01Z')), false, 'fini : trop tard');
  assert.equal(zeroAlert({ ...trade, status: 'active' }, 24, at('2026-10-28T17:18:11Z')), false);
});

test('tranche et palier', () => {
  assert.equal(bandText(trade), 'top 75 %');
  assert.equal(bandText(mining), 'aucune tranche');
  assert.equal(bandText({ ...trade, inTopRank: true }), 'dans les 10 premiers');
  assert.equal(tierText(trade), 'palier 3/6');
  assert.equal(tierText({ ...mining, tier: null, tierName: null }), 'aucun palier (sur 5)');
});

test('à encaisser : récompense avec la station, regroupée par station, total connu', () => {
  const cg = { toClaim: [trade] };
  assert.deepEqual(communityGoalCash(cg), [{ label: 'OC · Homer Platform (AD Leonis)', short: 'OC · Homer Platform', value: '170,0 M' }]);
  assert.equal(communityGoalRewardTotal(cg), 170_000_000);
  const two = communityGoalCash({ toClaim: [trade, { ...trade, id: 900, reward: null }] });
  assert.deepEqual(two, [{ label: '2 OC · Homer Platform (AD Leonis)', short: '2 OC · Homer Platform', value: '≥ 170,0 M' }]);
  assert.deepEqual(communityGoalCash(undefined), []);
  assert.equal(communityGoalRewardTotal(undefined), 0);
});

test('OC affichés : un OC sans contribution disparaît dès sa fin, même si le résumé du serveur date d’avant', () => {
  const pendingTrade = { ...trade, status: 'pending', expiry: '2026-10-29T10:00:00Z' };
  const cg = { active: [mining, { ...trade, status: 'active' }] };
  assert.deepEqual(shownGoals(cg, at('2026-10-28T17:18:11Z')).map((g) => g.id), [863, 864]);
  assert.deepEqual(shownGoals(cg, at('2026-10-29T10:00:30Z')).map((g) => g.id), [864], 'fin passée : plus rien à attendre pour 863');
  assert.deepEqual(shownGoals({ active: [{ ...mining, status: 'pending' }, pendingTrade] }).map((g) => g.id), [864]);
  assert.deepEqual(shownGoals({ active: [{ ...mining, expiry: null }] }).map((g) => g.id), [863], 'fin inconnue : affiché');
  assert.deepEqual(shownGoals(undefined), []);
});
