// Tests du module Combat : kills comptés, session, et mérites rattachés au combat ou non.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCombat } from './state.js';

const T = (sec) => new Date(Date.UTC(2026, 10, 4, 20, 0, sec)).toISOString();

test('primes, obligations et vaisseaux capitaux comptent chacun un kill', () => {
  const c = buildCombat([
    { event: 'LoadGame', timestamp: T(0) },
    { event: 'Bounty', timestamp: T(10), TotalReward: 117698, Target: 'viper_mkiv', Target_Localised: 'Viper Mk IV', PilotName_Localised: 'Roy Kilner', VictimFaction: 'Deciat Blue Dragons' },
    { event: 'FactionKillBond', timestamp: T(20), Reward: 33163, VictimFaction: 'Archon Delaine' },
    { event: 'CapShipBond', timestamp: T(30), Reward: 500000, VictimFaction: 'Thargoids' },
    { event: 'PVPKill', timestamp: T(40), Victim: 'Cmdr X' },
  ]).summary();
  assert.equal(c.kills, 4);
  assert.equal(c.credits, 117698 + 33163 + 500000);
  assert.equal(c.bounties.count, 1);
  assert.equal(c.recent[0].kind, 'Joueur');
  assert.deepEqual(c.recent[3], { at: T(10), kind: 'Prime', reward: 117698, ship: 'Viper Mk IV', pilot: 'Roy Kilner', faction: 'Deciat Blue Dragons', merits: 0 });
});

test('un nouveau lancement du jeu ouvre une nouvelle session', () => {
  const c = buildCombat([
    { event: 'Bounty', timestamp: T(10), TotalReward: 1000 },
    { event: 'LoadGame', timestamp: T(20) },
    { event: 'Bounty', timestamp: T(30), TotalReward: 500 },
  ]).summary();
  assert.equal(c.startedAt, T(20));
  assert.equal(c.kills, 1);
  assert.equal(c.credits, 500);
});

test('mérites après un ciblage ou un kill : comptés en combat (séquence du 25 octobre)', () => {
  const c = buildCombat([
    { event: 'ShipTargeted', timestamp: T(21), TargetLocked: true, ScanStage: 3 },
    { event: 'PowerplayMerits', timestamp: T(27), MeritsGained: 7 },
    { event: 'Bounty', timestamp: T(40), TotalReward: 1000 },
    { event: 'PowerplayMerits', timestamp: T(41), MeritsGained: 14 },
  ]).summary();
  assert.equal(c.merits.combat, 21);
  assert.equal(c.merits.other, 0);
});

test('mérites d\'une vente, même pendant un combat, ou sans combat récent : hors combat', () => {
  const c = buildCombat([
    { event: 'Bounty', timestamp: T(0), TotalReward: 1000 },
    { event: 'MarketSell', timestamp: T(5) },
    { event: 'PowerplayMerits', timestamp: T(6), MeritsGained: 390 },
  ]).summary();
  assert.equal(c.merits.other, 390);
  const late = buildCombat([
    { event: 'ShipTargeted', timestamp: T(0), TargetLocked: true },
    { event: 'PowerplayMerits', timestamp: new Date(Date.parse(T(0)) + 61_000).toISOString(), MeritsGained: 7 },
  ]).summary();
  assert.deepEqual(late.merits, { combat: 0, other: 7 });
});

test('perdre sa cible ne compte pas comme un signe de combat', () => {
  const c = buildCombat([
    { event: 'ShipTargeted', timestamp: T(0), TargetLocked: false },
    { event: 'PowerplayMerits', timestamp: T(5), MeritsGained: 7 },
  ]).summary();
  assert.deepEqual(c.merits, { combat: 0, other: 7 });
});

test('la remise à zéro vide la session', () => {
  const c = buildCombat([{ event: 'Bounty', timestamp: T(0), TotalReward: 1000 }, { event: 'Died', timestamp: T(1) }]);
  c.reset(T(2));
  assert.equal(c.summary().kills, 0);
  assert.equal(c.summary().deaths, 0);
  assert.equal(c.summary().startedAt, T(2));
});

test('mérites reçus juste après un kill : rattachés à ce kill, pas ceux arrivés plus tard', () => {
  const c = buildCombat([
    { event: 'Bounty', timestamp: T(10), TotalReward: 1000 },
    { event: 'PowerplayMerits', timestamp: T(11), MeritsGained: 28 },
    { event: 'PowerplayMerits', timestamp: T(25), MeritsGained: 7 },
  ]).summary();
  assert.equal(c.recent[0].merits, 28);
  assert.equal(c.merits.combat, 35);
});

test('doublon du journal (4 nov. 20:17) : ni compté dans le total, ni dans le kill', () => {
  const c = buildCombat([
    { event: 'Powerplay', timestamp: T(0), Merits: 1172304 },
    { event: 'Bounty', timestamp: T(10), TotalReward: 742196, Rewards: [{ Faction: 'Portuguese Royal Navy', Reward: 274011 }, { Faction: 'Far Systems Protectorate', Reward: 468185 }] },
    { event: 'PowerplayMerits', timestamp: T(11), MeritsGained: 62, TotalMerits: 1172366 },
    { event: 'PowerplayMerits', timestamp: T(11), MeritsGained: 36, TotalMerits: 1172402 },
    { event: 'PowerplayMerits', timestamp: T(11), MeritsGained: 36, TotalMerits: 1172438 },
    { event: 'Bounty', timestamp: T(28), TotalReward: 132528 },
    { event: 'PowerplayMerits', timestamp: T(28), MeritsGained: 17, TotalMerits: 1172419 },
  ]).summary();
  assert.equal(c.recent[1].merits, 98);
  assert.equal(c.recent[0].merits, 17);
  assert.equal(c.merits.combat, 98 + 17);
});

test('mérites arrivés 12 s après le kill (5 nov. 17:55) : rattachés au kill', () => {
  const c = buildCombat([
    { event: 'Bounty', timestamp: T(20), TotalReward: 1059037, Rewards: [{ Faction: 'A', Reward: 1 }, { Faction: 'B', Reward: 2 }] },
    { event: 'PowerplayMerits', timestamp: T(32), MeritsGained: 27 },
    { event: 'PowerplayMerits', timestamp: T(32), MeritsGained: 71 },
  ]).summary();
  assert.equal(c.recent[0].merits, 98);
});

test('deux kills dans la même seconde (5 nov. 17:44) : chacun ses mérites, dans l\'ordre', () => {
  const c = buildCombat([
    { event: 'Bounty', timestamp: T(21), TotalReward: 151540, Rewards: [{ Faction: 'A', Reward: 151540 }] },
    { event: 'Bounty', timestamp: T(21), TotalReward: 574147, Rewards: [{ Faction: 'B', Reward: 190198 }, { Faction: 'A', Reward: 383949 }] },
    { event: 'PowerplayMerits', timestamp: T(22), MeritsGained: 25 },
    { event: 'PowerplayMerits', timestamp: T(22), MeritsGained: 51 },
    { event: 'PowerplayMerits', timestamp: T(22), MeritsGained: 20 },
  ]).summary();
  assert.equal(c.recent[1].merits, 25);
  assert.equal(c.recent[0].merits, 71);
});

test('ligne qui annule la précédente (7 nov. 13:50) : le kill garde le gain réel, pas la somme des deux', () => {
  const c = buildCombat([
    { event: 'Powerplay', timestamp: T(0), Merits: 1000000 },
    { event: 'Bounty', timestamp: T(10), TotalReward: 50000, Rewards: [{ Faction: 'A', Reward: 50000 }] },
    { event: 'PowerplayMerits', timestamp: T(13), MeritsGained: 2015, TotalMerits: 1002015 },
    { event: 'PowerplayMerits', timestamp: T(22), MeritsGained: 1773, TotalMerits: 1001773 },
  ]).summary();
  assert.equal(c.recent[0].merits, 1773);
  assert.equal(c.merits.combat, 1773);
});
