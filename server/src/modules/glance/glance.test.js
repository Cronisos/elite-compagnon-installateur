// Tests du module Coup d'œil : valeurs d'exploration, encaissements, pertes à la destruction.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanValue } from './exploration.js';
import { buildGlance, reminders } from './state.js';
import { systemChange, systemPowerplay } from './powerplay.js';

test('exploration : étoile M du 28 oct. (masse 0,34), déjà découverte → 1 206 cr', () => {
  assert.equal(scanValue({ StarType: 'M', StellarMass: 0.339844, WasDiscovered: true }), 1206);
});

test('exploration : première découverte ×2,6, ceinture d’astéroïdes non comptée', () => {
  assert.equal(scanValue({ StarType: 'M', StellarMass: 0.339844, WasDiscovered: false }), Math.round(1206.15 * 2.6));
  assert.equal(scanValue({ BodyName: 'A Belt Cluster 1' }), 0);
});

test('exploration : planète cartographiée efficacement vaut plus que scannée seule', () => {
  const p = { PlanetClass: 'High metal content body', MassEM: 0.5, WasDiscovered: true, WasMapped: true };
  const scanned = scanValue(p);
  const mapped = scanValue(p, { ProbesUsed: 3, EfficiencyTarget: 5 });
  assert.ok(mapped > scanned * 3);
});

test('encaissements : primes et obligations, puis rachat partiel', () => {
  const g = buildGlance([
    { event: 'Bounty', TotalReward: 1000 },
    { event: 'Bounty', TotalReward: 500 },
    { event: 'FactionKillBond', Reward: 300 },
    { event: 'RedeemVoucher', Type: 'bounty', Amount: 1000 },
  ]);
  assert.equal(g.bounties, 500);
  assert.equal(g.bonds, 300);
});

test('destruction : tout ce qui n’est pas encaissé est perdu', () => {
  const g = buildGlance([
    { event: 'Bounty', TotalReward: 1000 },
    { event: 'ScanOrganic', ScanType: 'Analyse', Species: 'x', Species_Localised: 'X' },
    { event: 'Scan', BodyID: 1, SystemAddress: 1, StarSystem: 'S', StarType: 'K', StellarMass: 1 },
    { event: 'Died', timestamp: 't' },
  ]);
  assert.equal(g.bounties, 0);
  assert.equal(g.exobiology().count, 0);
  assert.equal(g.exploration().bodies, 0);
});

test('exobiologie : valeur apprise des ventes précédentes, espèce vendue retirée', () => {
  const g = buildGlance([
    { event: 'SellOrganicData', BioData: [{ Species: 'strat', Value: 19010800 }] },
    { event: 'ScanOrganic', ScanType: 'Analyse', Species: 'strat', Species_Localised: 'Stratum Tectonicas' },
    { event: 'ScanOrganic', ScanType: 'Analyse', Species: 'inconnu', Species_Localised: 'Inconnu' },
  ]);
  const b = g.exobiology();
  assert.deepEqual([b.count, b.value, b.unknownValues], [2, 19010800, 1]);
  const r = reminders({ exploration: { value: 0 }, exobiology: b, bounties: 0, bonds: 0, missions: [], powerplayCargo: [], missionCargo: 0 });
  assert.match(r[0].text, /2 échantillons exobio à vendre chez Vista Genomics .*ne meurs pas/);
});

test('Powerplay : mérites et rang suivis', () => {
  const g = buildGlance([
    { event: 'Powerplay', Power: 'Aisling Duval', Rank: 110, Merits: 858504 },
    { event: 'PowerplayMerits', Power: 'Aisling Duval', MeritsGained: 2150, TotalMerits: 860654 },
    { event: 'PowerplayRank', Rank: 111 },
  ]);
  assert.deepEqual([g.powerplay.rank, g.powerplay.merits], [111, 860654]);
});

test('système actuel : points de contrôle relevés à l\'arrivée (Synuefe OU-E c28-2, 2 nov.)', () => {
  const g = buildGlance([{
    event: 'FSDJump', timestamp: '2026-11-02T20:18:17Z', StarSystem: 'Synuefe OU-E c28-2',
    ControllingPower: 'Aisling Duval', PowerplayState: 'Exploited', PowerplayStateControlProgress: 0.193812,
    PowerplayStateReinforcement: 1435, PowerplayStateUndermining: 0,
  }]);
  assert.equal(g.system.label, 'Exploité');
  assert.equal(g.system.points, 67834);
  assert.equal(g.system.tier, 350000);
  assert.equal(g.system.next, 'Consolidé');
  assert.equal(g.system.reinforcement, 1435);
});

test('système en conflit : progression de chaque puissance, la plus avancée d\'abord', () => {
  const g = buildGlance([{
    event: 'FSDJump', timestamp: 't', StarSystem: 'HJ 3456B', PowerplayState: 'Unoccupied',
    PowerplayConflictProgress: [{ Power: 'Denton Patreus', ConflictProgress: 0.000742 }, { Power: 'Li Yong-Rui', ConflictProgress: 0.893158 }],
  }]);
  assert.equal(g.system.label, 'Non occupé');
  assert.equal(g.system.points, null);
  assert.deepEqual(g.system.conflict[0], { power: 'Li Yong-Rui', progress: 0.893158, points: 107179, tier: 120000 });
});

test('primes encaissées chez un Interstellar Factors : la commission ne laisse pas de primes fantômes (2 nov.)', () => {
  // Wregoe NN-Z c27-13 : 11 978 147 cr de primes, 8 983 609 cr touchés après 25 % de commission
  const g = buildGlance([
    { event: 'Bounty', TotalReward: 11_978_147 },
    { event: 'RedeemVoucher', Type: 'bounty', Amount: 8_983_609, BrokerPercentage: 25, Factions: [{}, {}, {}, {}, {}] },
  ]);
  assert.equal(g.bounties, 0);
});

test('système actuel : évolution depuis le relevé précédent du même système', () => {
  const jump = (at, progress, state = 'Exploited') => ({ event: 'FSDJump', timestamp: at, StarSystem: 'Synuefe OU-E c28-2', PowerplayState: state, PowerplayStateControlProgress: progress });
  const g = buildGlance([jump('2026-11-04T20:40:00Z', 0.406094), { event: 'FSDJump', timestamp: 'x', StarSystem: 'Ailleurs' }, jump('2026-11-04T22:55:00Z', 0.420080)]);
  assert.deepEqual(systemChange(g.system, 'Aisling Duval'), { points: 147028 - 142133, since: '2026-11-04T20:40:00Z' });
  const promoted = buildGlance([jump('a', 0.99), jump('b', 0.01, 'Fortified')]);
  assert.equal(systemChange(promoted.system, 'Aisling Duval'), null);
});

test('Powerplay : érosion prévue au passage de jeudi dans le système où l’on est (12 nov. 2026, Synuefe OU-E c28-2)', () => {
  const ev = (state, p) => ({ event: 'Location', StarSystem: 'S', timestamp: '2026-11-12T10:01:55Z', PowerplayState: state, PowerplayStateControlProgress: p, PowerplayStateReinforcement: 0, PowerplayStateUndermining: 15091 });
  const s = systemPowerplay(ev('Exploited', 0.724311));
  assert.equal(s.points, 253509);
  assert.equal(s.erosion, 13834);
  assert.equal(s.erosionVerifiee, true);
  assert.equal(systemPowerplay(ev('Exploited', 0.1)).erosion, 0);
  assert.equal(systemPowerplay(ev('Exploited', 1)).erosion, null); // palier atteint : changement de niveau
  assert.equal(systemPowerplay(ev('Fortified', 0.5)).erosionVerifiee, false);
  assert.equal(systemPowerplay(ev('Stronghold', 0.5)).erosion, null); // palier de la Forteresse non suivi ici
  assert.equal(systemPowerplay(ev(undefined, null)).erosion, null);
});
