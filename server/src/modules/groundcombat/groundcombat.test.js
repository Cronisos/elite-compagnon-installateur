// Session de combat au sol (state.js) : seuls les kills à pied comptent, guerres du système, installation, équipement.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GroundCombatState, guerresDe } from './state.js';

const T = (s) => `2026-11-11T20:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}Z`;
const ev = (s, event, extra = {}) => ({ timestamp: T(s), event, ...extra });

test('combat au sol : kills à pied (obligations, primes), mérites à pied, morts, consommables ; rien en vaisseau', () => {
  const g = new GroundCombatState();
  g.apply(ev(0, 'LoadGame'));
  g.apply(ev(1, 'Powerplay', { Merits: 1000 }));
  // En vaisseau : pour le module Combat
  g.apply(ev(2, 'FactionKillBond', { Reward: 50000, AwardingFaction: 'A', VictimFaction: 'B' }));
  g.apply(ev(3, 'PowerplayMerits', { MeritsGained: 20, TotalMerits: 1020 }));
  g.apply(ev(10, 'Disembark', { OnPlanet: true }));
  g.apply(ev(60, 'FactionKillBond', { Reward: 30000, AwardingFaction: 'Alliance A', VictimFaction: 'Empire B' }));
  g.apply(ev(61, 'PowerplayMerits', { MeritsGained: 15, TotalMerits: 1035 }));
  g.apply(ev(120, 'FactionKillBond', { Reward: 30000, AwardingFaction: 'Alliance A', VictimFaction: 'Empire B' }));
  g.apply(ev(180, 'Bounty', { TotalReward: 12000, Rewards: [{ Faction: 'Alliance A', Reward: 12000 }], VictimFaction: 'Pirates' }));
  g.apply(ev(200, 'UseConsumable', { Name: 'healthpack', Name_Localised: 'Trousse médicale', Type: 'Consumable' }));
  g.apply(ev(201, 'UseConsumable', { Name: 'healthpack', Name_Localised: 'Trousse médicale', Type: 'Consumable' }));
  g.apply(ev(250, 'Died'));
  const s = g.summary();
  assert.equal(s.kills, 3);
  assert.equal(s.bonds, 60000);
  assert.deepEqual(s.primes, { n: 1, total: 12000 });
  assert.equal(s.gains, 72000);
  assert.equal(s.merites, 15);
  assert.equal(s.morts, 1);
  assert.deepEqual(s.parVictime, [{ label: 'Empire B', n: 2 }, { label: 'Pirates', n: 1 }]);
  assert.deepEqual(s.consommables, [{ label: 'Trousse médicale', n: 2 }]);
  assert.equal(s.killsHeure, 60, '2 kills en 2 min après le premier : 60 par heure');
  assert.equal(s.recent[0].kind, 'prime');
  g.apply(ev(300, 'Embark'));
  g.apply(ev(310, 'FactionKillBond', { Reward: 9, AwardingFaction: 'A', VictimFaction: 'B' }));
  assert.equal(g.summary().kills, 3, 'remonté à bord : plus compté ici');
});

test('relance du jeu en plein combat : la session continue ; après une longue coupure, elle repart de zéro', () => {
  const g = new GroundCombatState();
  g.apply(ev(0, 'LoadGame'));
  g.apply(ev(5, 'Disembark'));
  g.apply(ev(60, 'FactionKillBond', { Reward: 1000, AwardingFaction: 'A', VictimFaction: 'B' }));
  g.apply(ev(600, 'LoadGame')); // 9 min après : relance pour se débloquer
  g.apply(ev(610, 'Location', { OnFoot: true, StarSystem: 'S' }));
  g.apply(ev(620, 'FactionKillBond', { Reward: 1000, AwardingFaction: 'A', VictimFaction: 'B' }));
  assert.equal(g.summary().kills, 2);
  g.apply({ timestamp: '2026-11-11T22:30:00Z', event: 'LoadGame' }); // plus de 30 min après
  assert.equal(g.summary().kills, 0);
});

test('contexte : guerres du système (enjeu, jours gagnés), installation approchée, combinaison et armes', () => {
  assert.deepEqual(guerresDe({ Conflicts: [
    { WarType: 'civilwar', Status: 'active', Faction1: { Name: 'A', Stake: 'Base X', WonDays: 2 }, Faction2: { Name: 'B', Stake: '', WonDays: 1 } },
    { WarType: 'election', Status: 'active', Faction1: { Name: 'C' }, Faction2: { Name: 'D' } },
  ] }), [{ type: 'Guerre civile', enCours: true, a: { nom: 'A', enjeu: 'Base X', jours: 2 }, b: { nom: 'B', enjeu: null, jours: 1 } }]);
  const g = new GroundCombatState();
  g.apply(ev(0, 'FSDJump', { StarSystem: 'Système Test', Conflicts: [{ WarType: 'war', Status: 'active', Faction1: { Name: 'A', WonDays: 0 }, Faction2: { Name: 'B', WonDays: 3 } }] }));
  g.apply(ev(5, 'ApproachSettlement', { Name: 'Bastion Test', StationFaction: { Name: 'B' }, BodyName: 'Système Test 2 a' }));
  g.apply(ev(6, 'SuitLoadout', { SuitName: 'utilitysuit_class3', SuitName_Localised: 'Maverick', LoadoutName: 'Assaut', Modules: [{ ModuleName_Localised: 'Karma AR-50' }, { ModuleName: 'wpn_s_pistol_kinetic_sauto', ModuleName_Localised: 'Karma P-15' }] }));
  const s = g.summary();
  assert.equal(s.systeme, 'Système Test');
  assert.equal(s.guerres[0].b.jours, 3);
  assert.deepEqual(s.installation, { nom: 'Bastion Test', faction: 'B', corps: 'Système Test 2 a' });
  assert.deepEqual(s.equipement, { combinaison: 'Maverick', config: 'Assaut', armes: ['Karma AR-50', 'Karma P-15'] });
  g.apply(ev(9, 'FSDJump', { StarSystem: 'Ailleurs' }));
  assert.equal(g.summary().installation, null, 'autre système : plus d’installation');
});
