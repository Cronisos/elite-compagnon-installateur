// Coup d'œil : les objectifs communautaires et le rachat, arrivés après l'idée 7, nettoient aussi leurs textes du jeu
// (core/text.js). Ces champs ne sont pas des *_Localised : la lecture du journal ne les nettoie pas d'elle-même.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommunityGoals } from './communityGoals.js';
import { RebuyState } from './rebuy.js';

const NBSP = ' ';

test('objectifs communautaires : titre, station et palier nettoyés', () => {
  const cg = new CommunityGoals();
  cg.apply({
    event: 'CommunityGoal',
    timestamp: '2026-10-26T20:03:48Z',
    CurrentGoals: [{ CGID: 1, Title: 'Opération &amp; minière  ', SystemName: 'Reorte', MarketName: ' Davies&nbsp;High', Expiry: '2026-10-29T10:00:00Z', IsComplete: false, PlayerContribution: 0, TierReached: 'Niveau&nbsp;3 ', Bonus: 1 }],
  });
  const goal = cg.goals.get(1);
  assert.equal(goal.title, 'Opération & minière');
  assert.equal(goal.station, `Davies${NBSP}High`);
  assert.equal(goal.tier, 3);
});

test('rachat : nom du groupe privé et nom donné au vaisseau nettoyés', () => {
  const r = new RebuyState();
  r.apply({ event: 'LoadGame', timestamp: '2026-11-07T21:00:00Z', GameMode: 'Group', Group: ' EDFR&amp;co ', Ship: 'LakonMiner', Ship_Localised: 'Type-11 Prospector', ShipID: 43 });
  assert.equal(r.mode.group, 'EDFR&co');
  r.apply({ event: 'Loadout', timestamp: '2026-11-07T21:00:01Z', Ship: 'lakonminer', ShipID: 43, ShipName: ' Mine&nbsp;d’or ', Rebuy: 1000 });
  assert.equal(r.ship.name, `Mine${NBSP}d’or`);
});
