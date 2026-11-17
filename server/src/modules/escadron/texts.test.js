// Escadron : nom de l'escadron et du rang affichés nettoyés (core/text.js, idée 7). Le nom du commandant envoyé au
// Worker, lui, n'est jamais retouché (clé de déduplication partagée avec le plugin EDMC).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SquadronStats } from './stats.js';

test('SquadronStartup : nom et rang nettoyés pour la carte', () => {
  const s = new SquadronStats();
  s.apply({ event: 'SquadronStartup', timestamp: '2026-11-07T08:15:52Z', SquadronName: ' TRIPLE &amp; CROWN ', CurrentRankName: 'PILOTE ' });
  assert.deepEqual([s.squadron.name, s.squadron.rank], ['TRIPLE & CROWN', 'PILOTE']);
  s.apply({ event: 'SquadronStartup', timestamp: '2026-11-07T08:16:52Z', SquadronName: '', CurrentRankName: 7 });
  assert.deepEqual([s.squadron.name, s.squadron.rank], [null, null]);
});
