// Tests des objectifs communautaires du Coup d'œil, sur les lignes réelles du journal de référence
// (OC 863 « Opération minière » et 864 « Opération commerciale » de Faulcon DeLacy, 24 oct. – 7 nov. 2026).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommunityGoals, tierNumber, leftText, ZERO_CONTRIBUTION_ALERT_HOURS } from './communityGoals.js';
import { buildGlance, GLANCE_EVENTS } from './state.js';

const JOIN = '{ "timestamp":"2026-10-26T20:03:06Z", "event":"CommunityGoalJoin", "CGID":863, "Name":"Opération minière de Faulcon DeLacy  ", "System":"Reorte" }';
const AFTER_JOIN = '{ "timestamp":"2026-10-26T20:03:48Z", "event":"CommunityGoal", "CurrentGoals":[ { "CGID":864, "Title":"Opération commerciale de Faulcon DeLacy", "SystemName":"AD Leonis", "MarketName":"Homer Platform", "Expiry":"2026-10-29T10:00:00Z", "IsComplete":false, "CurrentTotal":73074392, "PlayerContribution":789, "NumContributors":11438, "TopTier":{ "Name":"Niveau 6", "Bonus":"" }, "TopRankSize":10, "PlayerInTopRank":false, "TierReached":"Niveau 3", "PlayerPercentileBand":75, "Bonus":170000000 }, { "CGID":863, "Title":"Opération minière de Faulcon DeLacy  ", "SystemName":"Reorte", "MarketName":"Davies High", "Expiry":"2026-10-29T10:00:00Z", "IsComplete":false, "CurrentTotal":2347388, "PlayerContribution":0, "NumContributors":6299, "TopTier":{ "Name":"Niveau 5", "Bonus":"" }, "TopRankSize":10, "PlayerInTopRank":false, "PlayerPercentileBand":100 } ] }';
const EVE = '{ "timestamp":"2026-10-28T17:18:11Z", "event":"CommunityGoal", "CurrentGoals":[ { "CGID":863, "Title":"Opération minière de Faulcon DeLacy  ", "SystemName":"Reorte", "MarketName":"Davies High", "Expiry":"2026-10-29T10:00:00Z", "IsComplete":false, "CurrentTotal":3505179, "PlayerContribution":0, "NumContributors":7902, "TopTier":{ "Name":"Tier 5", "Bonus":"" }, "TopRankSize":10, "PlayerInTopRank":false, "TierReached":"Tier 1", "PlayerPercentileBand":100, "Bonus":50000000 }, { "CGID":864, "Title":"Opération commerciale de Faulcon DeLacy", "SystemName":"AD Leonis", "MarketName":"Homer Platform", "Expiry":"2026-10-29T10:00:00Z", "IsComplete":false, "CurrentTotal":94592757, "PlayerContribution":789, "NumContributors":13227, "TopTier":{ "Name":"Tier 6", "Bonus":"" }, "TopRankSize":10, "PlayerInTopRank":false, "TierReached":"Tier 3", "PlayerPercentileBand":75, "Bonus":170000000 } ] }';
const LAST = '{ "timestamp":"2026-11-07T21:15:32Z", "event":"CommunityGoal", "CurrentGoals":[ { "CGID":863, "Title":"Opération minière de Faulcon DeLacy  ", "SystemName":"Reorte", "MarketName":"Davies High", "Expiry":"2026-10-29T10:00:00Z", "IsComplete":true, "CurrentTotal":3975062, "PlayerContribution":0, "NumContributors":8552, "TopTier":{ "Name":"Tier 5", "Bonus":"" }, "TopRankSize":10, "PlayerInTopRank":false, "TierReached":"Tier 1", "PlayerPercentileBand":100, "Bonus":50000000 }, { "CGID":864, "Title":"Opération commerciale de Faulcon DeLacy", "SystemName":"AD Leonis", "MarketName":"Homer Platform", "Expiry":"2026-10-29T10:00:00Z", "IsComplete":true, "CurrentTotal":102482894, "PlayerContribution":789, "NumContributors":13931, "TopTier":{ "Name":"Tier 6", "Bonus":"" }, "TopRankSize":10, "PlayerInTopRank":false, "TierReached":"Tier 3", "PlayerPercentileBand":75, "Bonus":170000000 } ] }';

const build = (...lines) => {
  const cg = new CommunityGoals();
  for (const l of lines) cg.apply(typeof l === 'string' ? JSON.parse(l) : l);
  return cg;
};
const at = (iso) => Date.parse(iso);

test('paliers : le numéro se lit en anglais comme en français', () => {
  assert.equal(tierNumber('Tier 3'), 3);
  assert.equal(tierNumber('Niveau 6'), 6);
  assert.equal(tierNumber(''), null);
  assert.equal(tierNumber(undefined), null);
});

test('durée restante lisible', () => {
  assert.equal(leftText(0.25), '15 min');
  assert.equal(leftText(16.7), '17 h');
  assert.equal(leftText(62), '3 j');
});

test('OC rejoint le 26 oct. : temps restant, contribution, tranche et palier ; titre nettoyé', () => {
  const s = build(JOIN, AFTER_JOIN).summary(at('2026-10-26T20:03:48Z'));
  assert.deepEqual(s.active.map((g) => g.id).sort(), [863, 864]);
  const trade = s.active.find((g) => g.id === 864);
  assert.equal(trade.station, 'Homer Platform');
  assert.equal(trade.contribution, 789);
  assert.equal(trade.band, 75);
  assert.deepEqual([trade.tier, trade.topTier, trade.tierName], [3, 6, 'Niveau 3']);
  assert.equal(trade.reward, 170_000_000);
  assert.equal(Math.round(trade.hoursLeft), 62);
  const mining = s.active.find((g) => g.id === 863);
  assert.equal(mining.title, 'Opération minière de Faulcon DeLacy');
  assert.equal(mining.contribution, 0);
  assert.equal(mining.band, null, 'pas de tranche sans contribution');
  assert.equal(mining.tier, null, 'aucun palier atteint le 26 oct.');
  assert.equal(mining.reward, null);
  assert.equal(mining.zeroAlert, false, 'plus de 24 h restantes');
  assert.deepEqual(s.toClaim, []);
});

test('veille de la fin (28 oct. 17:18) : alerte « contribution nulle » sur l’OC minier seulement', () => {
  const cg = build(JOIN, AFTER_JOIN, EVE);
  const s = cg.summary(at('2026-10-28T17:18:11Z'));
  const mining = s.active.find((g) => g.id === 863);
  assert.equal(mining.zeroAlert, true);
  assert.ok(mining.hoursLeft < ZERO_CONTRIBUTION_ALERT_HOURS);
  assert.equal(s.active.find((g) => g.id === 864).zeroAlert, false);
  const r = cg.reminders(at('2026-10-28T17:18:11Z'));
  assert.equal(r.length, 1);
  assert.match(r[0].text, /« Opération minière de Faulcon DeLacy » à Davies High \(Reorte\) : contribution nulle, fin dans 17 h/);
});

test('7 nov. : récompense de l’OC commercial à réclamer à Homer Platform, rien pour l’OC minier à 0', () => {
  const cg = build(JOIN, AFTER_JOIN, EVE, LAST);
  const s = cg.summary(at('2026-11-07T21:15:32Z'));
  assert.deepEqual(s.active, []);
  assert.equal(s.toClaim.length, 1);
  const c = s.toClaim[0];
  assert.deepEqual([c.id, c.status, c.reward, c.band, c.tier], [864, 'claim', 170_000_000, 75, 3]);
  assert.deepEqual(c.claimAt, { station: 'Homer Platform', system: 'AD Leonis' });
  const r = cg.reminders(at('2026-11-07T21:15:32Z'));
  assert.equal(r.length, 1);
  assert.match(r[0].text, /^Récompense d'objectif communautaire à réclamer à Homer Platform \(AD Leonis\) : « Opération commerciale de Faulcon DeLacy », 170 M cr\.$/);
});

test('récompense touchée ou OC abandonné : plus rien à afficher', () => {
  const paid = build(LAST, { timestamp: '2026-11-08T10:00:00Z', event: 'CommunityGoalReward', CGID: 864, Name: 'Opération commerciale de Faulcon DeLacy', System: 'AD Leonis', Reward: 170_000_000 });
  assert.deepEqual(paid.summary(at('2026-11-08T10:00:00Z')).toClaim, []);
  assert.equal(paid.goals.get(864).reward, 170_000_000);
  const dropped = build(JOIN, AFTER_JOIN, { timestamp: '2026-10-27T08:00:00Z', event: 'CommunityGoalDiscard', CGID: 863, Name: 'x', System: 'Reorte' });
  assert.deepEqual(dropped.summary(at('2026-10-27T08:00:00Z')).active.map((g) => g.id), [864]);
});

test('un OC absent du relevé suivant n’est plus suivi', () => {
  const only864 = JSON.parse(AFTER_JOIN);
  only864.timestamp = '2026-10-27T08:00:00Z';
  only864.CurrentGoals = only864.CurrentGoals.filter((g) => g.CGID === 864);
  const s = build(AFTER_JOIN, only864).summary(at('2026-10-27T08:00:00Z'));
  assert.deepEqual(s.active.map((g) => g.id), [864]);
});

test('inscription juste faite, avant le relevé : OC affiché, contribution inconnue, pas d’alerte', () => {
  const s = build(JOIN).summary(at('2026-10-26T20:03:10Z'));
  assert.equal(s.active.length, 1);
  assert.deepEqual([s.active[0].title, s.active[0].system, s.active[0].contribution, s.active[0].zeroAlert], ['Opération minière de Faulcon DeLacy', 'Reorte', null, false]);
});

test('fin passée mais IsComplete encore faux : résultats en attente, ni alerte ni récompense', () => {
  const s = build(EVE).summary(at('2026-10-29T10:30:00Z'));
  assert.deepEqual(s.active.map((g) => [g.id, g.status, g.zeroAlert]), [[864, 'pending', false]]);
  assert.deepEqual(s.toClaim, []);
});

test('fin passée sans contribution (863, 29 oct. 10:15:24, IsComplete encore faux) : rien à attendre, l’OC disparaît', () => {
  // Relevé réel du 29 oct. 10:15:24 : fin passée, résultats pas encore publiés
  const ended = JSON.parse(EVE);
  ended.timestamp = '2026-10-29T10:15:24Z';
  const cg = build(JOIN, AFTER_JOIN, EVE, ended);
  const s = cg.summary(at('2026-10-29T10:15:24Z'));
  assert.equal(s.active.find((g) => g.id === 863), undefined, 'pas de « résultats en attente » à contribution nulle');
  assert.equal(s.active.find((g) => g.id === 864).status, 'pending', 'l’OC commercial attend bien ses résultats');
  assert.deepEqual(cg.reminders(at('2026-10-29T10:15:24Z')), []);
  // Contribution et tranche absentes du relevé (inconnues) : on attend les résultats
  const blind = JSON.parse(JSON.stringify(ended));
  for (const g of blind.CurrentGoals) {
    delete g.PlayerContribution;
    delete g.PlayerPercentileBand;
  }
  const unknown = build(blind).summary(at('2026-10-29T10:15:24Z'));
  assert.deepEqual(unknown.active.map((g) => [g.id, g.status]).sort(), [[863, 'pending'], [864, 'pending']]);
});

test('entrées douteuses ignorées : CGID non numérique, CurrentGoals absent', () => {
  const cg = build(
    { timestamp: 't', event: 'CommunityGoal', CurrentGoals: [{ CGID: '__proto__', Title: 'x' }, null] },
    { timestamp: 't', event: 'CommunityGoal' },
    { timestamp: 't', event: 'CommunityGoalJoin', CGID: 'constructor' },
  );
  assert.equal(cg.goals.size, 0);
  assert.equal(cg.apply({ event: 'Bounty' }), false);
});

test('Coup d’œil : les OC passent par l’état commun et la liste des événements', () => {
  assert.ok(GLANCE_EVENTS.includes('CommunityGoal') && GLANCE_EVENTS.includes('CommunityGoalReward'));
  const g = buildGlance([JSON.parse(LAST), { event: 'Bounty', TotalReward: 1000 }]);
  assert.equal(g.bounties, 1000);
  assert.equal(g.communityGoals.summary(at('2026-11-07T21:15:32Z')).toClaim[0].station, 'Homer Platform');
});
