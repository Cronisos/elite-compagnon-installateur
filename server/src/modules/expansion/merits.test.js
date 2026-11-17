// Tests de l'historique des mérites : activité d'un gain, système crédité, semaines du jeudi au jeudi.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeritLog, weekReport, weekStart, workSystem } from './merits.js';

const ev = (timestamp, event, extra = {}) => ({ timestamp, event, ...extra });

function log(events) {
  const l = new MeritLog();
  for (const e of events) l.apply(e);
  return l;
}

test('semaine : du jeudi 7 h UTC au jeudi suivant', () => {
  assert.equal(new Date(weekStart(Date.parse('2026-11-06T17:00:00Z'))).toISOString(), '2026-11-05T07:00:00.000Z');
  assert.equal(new Date(weekStart(Date.parse('2026-11-05T06:59:00Z'))).toISOString(), '2026-10-29T07:00:00.000Z');
  assert.equal(new Date(weekStart(Date.parse('2026-11-05T07:00:00Z'))).toISOString(), '2026-11-05T07:00:00.000Z');
});

test('activité : vente de minerai, livraison tardive de 13 s, kill, sauvetage', () => {
  const l = log([
    ev('2026-11-06T10:00:00Z', 'Location', { StarSystem: 'A' }),
    ev('2026-11-06T10:00:01Z', 'Powerplay', { Merits: 1000 }),
    ev('2026-11-06T10:00:10Z', 'MarketSell', { Type: 'iridium', Count: 785 }),
    ev('2026-11-06T10:00:23Z', 'PowerplayMerits', { MeritsGained: 500, TotalMerits: 1500 }),
    ev('2026-11-06T11:00:00Z', 'FSDJump', { StarSystem: 'B' }),
    ev('2026-11-06T11:00:05Z', 'Bounty', { TotalReward: 1 }),
    ev('2026-11-06T11:00:07Z', 'PowerplayMerits', { MeritsGained: 28, TotalMerits: 1528 }),
    ev('2026-11-06T11:10:00Z', 'SearchAndRescue', { Name: 'damagedescapepod', Count: 1 }),
    ev('2026-11-06T11:10:01Z', 'PowerplayMerits', { MeritsGained: 40, TotalMerits: 1568 }),
    ev('2026-11-06T11:20:00Z', 'MarketSell', { Type: 'tea', Count: 1 }),
    ev('2026-11-06T11:20:01Z', 'PowerplayMerits', { MeritsGained: 3, TotalMerits: 1571 }),
    ev('2026-11-06T12:00:00Z', 'PowerplayMerits', { MeritsGained: 7, TotalMerits: 1578 }),
  ]);
  assert.deepEqual(l.entries.map((e) => [e.system, e.activity, e.merits]), [
    ['A', 'mining', 500], ['B', 'combat', 28], ['B', 'rescue', 40], ['B', 'trade', 3], ['B', 'other', 7],
  ]);
});

test('activité : un kill après une vente, et un minerai raffiné hors liste', () => {
  const l = log([
    ev('2026-11-06T10:00:00Z', 'Location', { StarSystem: 'A' }),
    ev('2026-11-06T10:00:01Z', 'MarketSell', { Type: 'tea', Count: 1 }),
    ev('2026-11-06T10:00:05Z', 'FactionKillBond', { Reward: 1 }),
    ev('2026-11-06T10:00:06Z', 'PowerplayMerits', { MeritsGained: 20 }),
    ev('2026-11-06T10:10:00Z', 'MiningRefined', { Type: '$weirdrock_name;' }),
    ev('2026-11-06T10:20:00Z', 'MarketSell', { Type: 'weirdrock', Count: 1 }),
    ev('2026-11-06T10:20:01Z', 'PowerplayMerits', { MeritsGained: 5 }),
  ]);
  assert.deepEqual(l.entries.map((e) => e.activity), ['combat', 'mining']);
});

test('bons encaissés (B48) : seuls les bons de combat comptent « combat », pas un bon codex ou trade', () => {
  const l = log([
    ev('2026-11-06T10:00:00Z', 'Location', { StarSystem: 'A' }),
    ev('2026-11-06T10:00:01Z', 'RedeemVoucher', { Type: 'bounty', Amount: 1000 }),
    ev('2026-11-06T10:00:03Z', 'PowerplayMerits', { MeritsGained: 20 }),
    ev('2026-11-06T10:10:00Z', 'RedeemVoucher', { Type: 'CombatBond', Amount: 1000 }),
    ev('2026-11-06T10:10:03Z', 'PowerplayMerits', { MeritsGained: 15 }),
    ev('2026-11-06T10:20:00Z', 'RedeemVoucher', { Type: 'codex', Amount: 1000 }),
    ev('2026-11-06T10:20:03Z', 'PowerplayMerits', { MeritsGained: 6 }),
    ev('2026-11-06T10:30:00Z', 'Bounty', { TotalReward: 1 }), // un kill juste avant ne fait pas du bon trade un bon de combat
    ev('2026-11-06T10:30:05Z', 'RedeemVoucher', { Type: 'trade', Amount: 1000 }),
    ev('2026-11-06T10:30:07Z', 'PowerplayMerits', { MeritsGained: 4 }),
  ]);
  assert.deepEqual(l.entries.map((e) => e.activity), ['combat', 'combat', 'other', 'other']);
});

test('relevé d’arrivée (B47) : mis de côté jusqu’à l’événement Powerplay, puis lu pour ta puissance seulement', () => {
  const arrivee = (t, system, power) => ev(t, 'Location', {
    StarSystem: system, ControllingPower: power, PowerplayState: 'Fortified', PowerplayStateControlProgress: 0.5,
    PowerplayStateReinforcement: 1000, PowerplayStateUndermining: 0,
  });
  const l = log([
    arrivee('2026-11-06T10:00:00Z', 'Système Test', 'Puissance Autre'),
    arrivee('2026-11-06T10:01:00Z', 'Système Test 2', 'Puissance Test'),
  ]);
  assert.equal(l.readings.size, 2, 'puissance pas encore connue : relevés provisoires');
  l.apply(ev('2026-11-06T10:02:00Z', 'Powerplay', { Power: 'Puissance Test', Merits: 100 }));
  assert.deepEqual([...l.readings.keys()], ['Système Test 2'], 'puissance connue : le relevé de l’autre puissance est retiré');
  assert.equal(l.readings.get('Système Test 2').length, 1, 'pas de relevé en double');
  assert.equal(l.readings.get('Système Test 2')[0].points, 1000);
  l.apply(arrivee('2026-11-06T10:03:00Z', 'Système Test 3', 'Puissance Autre'));
  assert.equal(l.readings.has('Système Test 3'), false);
});

test('relevé d’arrivée (B47) : sans puissance, les relevés du jeu restent montrés (puissance qui tient le système)', () => {
  const arrivee = (t, system, power) => ev(t, 'FSDJump', {
    StarSystem: system, ControllingPower: power, PowerplayState: 'Fortified', PowerplayStateControlProgress: 0.5,
    PowerplayStateReinforcement: 1000, PowerplayStateUndermining: 0,
  });
  const liste = [];
  for (let i = 0; i < 30; i++) liste.push(arrivee(`2026-11-06T10:${String(i).padStart(2, '0')}:00Z`, `Système Test ${i}`, 'Puissance Autre'));
  const l = log(liste);
  assert.equal(l.readings.size, 30, 'aucune arrivée perdue au-delà des 20 mises de côté');
  assert.equal(l.readings.get('Système Test 29')[0].points, 1000);
  assert.ok(l.enAttente.length <= 20);
});

test('doublon retiré par le jeu : repris sur le même système et la même activité', () => {
  const l = log([
    ev('2026-11-06T10:00:00Z', 'Location', { StarSystem: 'A' }),
    ev('2026-11-06T10:00:01Z', 'Powerplay', { Merits: 100 }),
    ev('2026-11-06T10:00:02Z', 'Bounty', {}),
    ev('2026-11-06T10:00:03Z', 'PowerplayMerits', { MeritsGained: 28, TotalMerits: 128 }),
    ev('2026-11-06T10:00:03Z', 'PowerplayMerits', { MeritsGained: 28, TotalMerits: 156 }),
    ev('2026-11-06T10:05:00Z', 'FSDJump', { StarSystem: 'B' }),
    ev('2026-11-06T10:09:00Z', 'PowerplayMerits', { MeritsGained: 7, TotalMerits: 135 }),
  ]);
  const r = weekReport(l.entries, { now: Date.parse('2026-11-06T12:00:00Z') });
  assert.deepEqual(r.systems.map((s) => [s.system, s.merits]), [['A', 28], ['B', 7]]);
  assert.equal(r.merits, 35);
});

test('rapport : jours, classement, points (6 mérites par point en exploration) et filtre de systèmes', () => {
  const entries = [
    { t: Date.parse('2026-11-05T08:00:00Z'), system: 'A', merits: 400, activity: 'mining' },
    { t: Date.parse('2026-11-05T06:00:00Z'), system: 'A', merits: 999, activity: 'mining' }, // semaine d'avant
    { t: Date.parse('2026-11-07T10:00:00Z'), system: 'A', merits: 60, activity: 'exploration' },
    { t: Date.parse('2026-11-07T11:00:00Z'), system: 'Z', merits: 800, activity: 'combat' },
  ];
  const r = weekReport(entries, { systems: ['A'], now: Date.parse('2026-11-08T00:00:00Z') });
  assert.equal(r.merits, 460);
  assert.equal(r.points, 110);
  assert.deepEqual(r.ranking.map((x) => x.activity), ['mining', 'exploration']);
  assert.deepEqual(r.days.map((d) => d.merits), [400, 0, 60, 0, 0, 0, 0]);
  assert.deepEqual(r.topDays.map((d) => d.merits), [400, 60]);
  assert.equal(r.weeks.length, 2);
  const before = weekReport(entries, { systems: ['A'], week: Date.parse('2026-11-01T00:00:00Z') });
  assert.equal(before.merits, 999);
  assert.equal(before.current, false);
});

const arrival = (timestamp, system, extra) => ev(timestamp, 'FSDJump', { StarSystem: system, ...extra });
const held = (reinforcement, progress = 0.4) => ({
  ControllingPower: 'Aisling Duval', PowerplayState: 'Exploited', PowerplayStateControlProgress: progress, PowerplayStateReinforcement: reinforcement,
});
const unoccupied = (progress) => ({ PowerplayState: 'Unoccupied', PowerplayConflictProgress: [{ Power: 'Zemina Torval', ConflictProgress: 0.9 }, { Power: 'Aisling Duval', ConflictProgress: progress }] });

test('points : 4 mérites = 1 point en prise comme en renforcement (relevés du 30 oct. et du 6 nov.)', () => {
  const l = log([
    ev('2026-11-06T09:00:00Z', 'Powerplay', { Power: 'Aisling Duval', Merits: 0 }),
    arrival('2026-11-06T10:00:00Z', 'Tenu', held(100)),
    ev('2026-11-06T10:01:00Z', 'Bounty', {}),
    ev('2026-11-06T10:01:01Z', 'PowerplayMerits', { MeritsGained: 1000, TotalMerits: 1000 }),
    arrival('2026-11-06T11:00:00Z', 'Prise', unoccupied(0.002775)),
    ev('2026-11-06T11:01:00Z', 'MarketSell', { Type: 'soontillrelics', Count: 1 }),
    ev('2026-11-06T11:01:01Z', 'PowerplayMerits', { MeritsGained: 2322, TotalMerits: 3322 }),
    arrival('2026-11-06T12:00:00Z', 'Prise', unoccupied(0.007608)),
    arrival('2026-11-06T13:00:00Z', 'Tenu', held(1050)),
  ]);
  const r = weekReport(l.entries, { now: Date.parse('2026-11-06T14:00:00Z'), readings: l.readings });
  const by = Object.fromEntries(r.systems.map((s) => [s.system, s]));
  assert.equal(by.Prise.points, 580.5);
  assert.equal(by.Prise.check.game, 580); // 0,004833 × 120 000, depuis le relevé d'avant la vente
  assert.equal(by.Prise.check.counted, true);
  assert.equal(by.Tenu.points, 250);
  assert.equal(by.Tenu.check.game, 1050); // remis à zéro au passage de semaine : le relevé est le total
  assert.equal(by.Tenu.check.counted, true);
});

test('vérification : relevé trop bas, et gains pas encore relevés', () => {
  const l = log([
    ev('2026-10-30T09:00:00Z', 'Powerplay', { Power: 'Aisling Duval', Merits: 0 }),
    arrival('2026-10-30T10:00:00Z', 'Fort', held(0)),
    ev('2026-10-30T10:58:36Z', 'MarketSell', { Type: 'iridium', Count: 785 }),
    ev('2026-10-30T10:58:49Z', 'PowerplayMerits', { MeritsGained: 203302, TotalMerits: 203302 }),
    arrival('2026-10-30T12:44:00Z', 'Fort', held(30000)),
    ev('2026-10-30T13:00:00Z', 'MarketSell', { Type: 'iridium', Count: 1 }),
    ev('2026-10-30T13:00:01Z', 'PowerplayMerits', { MeritsGained: 500, TotalMerits: 203802 }),
  ]);
  const { check } = weekReport(l.entries, { now: Date.parse('2026-10-30T14:00:00Z'), readings: l.readings }).systems[0];
  assert.equal(check.game, 30000);
  assert.equal(check.mine, 50825.5); // 203 302 ÷ 4 : le relevé de tous les joueurs est plus bas
  assert.equal(check.counted, false);
  assert.equal(check.pendingMerits, 500);
});

test('route : le vaisseau sur le premier système pas encore à son objectif, avec sa jauge', async () => {
  const { routeProgress } = await import('./merits.js');
  const steps = [
    { name: 'A', role: 'held-stronghold' },
    { name: 'B', role: 'fortified' },
    { name: 'C', role: 'stronghold' },
    { name: 'D', role: 'target' },
  ];
  const r = (mode, state, progress) => [{ t: 1, mode, state, progress }];
  assert.deepEqual(routeProgress(steps, new Map([['B', r('reinforcement', 'Exploited', 0.46)]])), { index: 1, frac: 0.46 });
  const readings = new Map([['B', r('reinforcement', 'Fortified', 0.1)], ['C', r('reinforcement', 'Fortified', 0.3)]]);
  assert.deepEqual(routeProgress(steps, readings), { index: 2, frac: 0.3 });
  readings.set('C', r('reinforcement', 'Stronghold', 0)).set('D', r('acquisition', 'Unoccupied', 0.4));
  assert.deepEqual(routeProgress(steps, readings), { index: 3, frac: 0.4 });
});

test('relevé du 6 nov. : 60 779 mérites, +19 468 au relevé avec les autres joueurs, cohérent en 4 pour 1', () => {
  const l = log([
    ev('2026-11-06T09:00:00Z', 'Powerplay', { Power: 'Aisling Duval', Merits: 1187987 }),
    arrival('2026-11-06T14:30:14Z', 'Synuefe OU-E c28-2', held(16079, 0.458581)),
    ev('2026-11-06T17:15:00Z', 'MarketSell', { Type: 'iridium', Count: 268 }),
    ev('2026-11-06T17:15:05Z', 'PowerplayMerits', { MeritsGained: 20209, TotalMerits: 1208196 }),
    ev('2026-11-06T18:25:30Z', 'MarketSell', { Type: 'iridium', Count: 268 }),
    ev('2026-11-06T18:25:39Z', 'PowerplayMerits', { MeritsGained: 20285, TotalMerits: 1228481 }),
    ev('2026-11-06T20:27:00Z', 'MarketSell', { Type: 'iridium', Count: 268 }),
    ev('2026-11-06T20:27:13Z', 'PowerplayMerits', { MeritsGained: 20285, TotalMerits: 1248766 }),
    arrival('2026-11-06T21:09:32Z', 'Synuefe OU-E c28-2', held(35547, 0.514204)),
  ]);
  const [s] = weekReport(l.entries, { now: Date.parse('2026-11-06T22:00:00Z'), readings: l.readings }).systems;
  assert.equal(s.merits, 60779);
  assert.equal(s.points, 15194.75);
  assert.equal(s.check.game, 35547);
  assert.equal(s.check.counted, true);
});

test('infos du système : niveau, palier suivant et objectif de la route (relevé du 6 nov. à 21 h 09)', async () => {
  const { systemInfo } = await import('./merits.js');
  const readings = new Map([['OU-E', [{ t: 10, mode: 'reinforcement', state: 'Exploited', progress: 0.514204, points: 35547, undermining: 5175 }]]]);
  const entries = [
    { t: 5, system: 'OU-E', merits: 40000, activity: 'mining' },
    { t: 20, system: 'OU-E', merits: 4000, activity: 'mining' }, // après le relevé
  ];
  const info = systemInfo('OU-E', { entries, readings, role: 'fortified' });
  assert.equal(info.reading.state, 'Exploited');
  assert.equal(info.bandPoints, 179971);
  assert.equal(info.next, 'Fortified');
  assert.equal(info.missingNext, 170029);
  assert.equal(info.missingGoal, 170029);
  assert.equal(info.pendingPoints, 1000);
  assert.deepEqual(info.mine, { merits: 44000, points: 11000 });
  // Une Forteresse visée depuis Exploité : le reste du palier, puis les 650 000 du suivant
  assert.equal(systemInfo('OU-E', { entries, readings, role: 'stronghold' }).missingGoal, 820029);
  // Prise : 120 000 points pour 1,0
  const acq = new Map([['P', [{ t: 1, mode: 'acquisition', state: 'Unoccupied', progress: 0.25, points: 30000 }]]]);
  const p = systemInfo('P', { readings: acq, role: 'fortified' });
  assert.deepEqual([p.next, p.missingNext, p.missingGoal], ['Exploited', 90000, 440000]);
  // Érosion prévue au passage : (179 971 + 1 000 pas encore relevés − 87 500) ÷ 12 ; rien en prise
  assert.deepEqual(info.erosion, { points: 7789, base: 180971, verifiee: true });
  assert.equal(p.erosion, null);
});

test('palier déclaré atteint : jauge pleine, plus rien à faire, étape suivante ; le vrai relevé reste, la prise jamais', async () => {
  const { systemInfo, routeProgress } = await import('./merits.js');
  const { Paliers } = await import('./paliers.js');
  // Relevé du 15 nov. 2026 à 0 h 23 : 0,971091, 10 118 points sous le palier ; la vente ne paie plus que la moitié
  const readings = new Map([['OU-E', [{ t: 1, mode: 'reinforcement', state: 'Exploited', progress: 0.971091, points: 86373, undermining: 15091 }]]]);
  assert.equal(systemInfo('OU-E', { readings, role: 'fortified' }).missingNext, 10118);
  const info = systemInfo('OU-E', { readings, role: 'stronghold', declared: true });
  assert.equal(info.declared, true);
  assert.equal(info.bandPoints, 350000);
  assert.equal(info.missingNext, 0);
  assert.equal(info.missingGoal, 650000, 'reste le palier suivant en entier');
  assert.equal(info.erosion, null);
  assert.equal(info.reading.progress, 0.971091, 'le relevé du jeu n’est pas touché');
  const acq = new Map([['P', [{ t: 1, mode: 'acquisition', state: 'Unoccupied', progress: 0.5, points: 60000 }]]]);
  assert.equal(systemInfo('P', { readings: acq, declared: true }).declared, false, 'une prise ne se déclare pas');
  const steps = [{ name: 'OU-E', role: 'fortified' }, { name: 'HIP', role: 'fortified' }];
  assert.deepEqual(routeProgress(steps, readings), { index: 0, frac: 0.971091 });
  assert.deepEqual(routeProgress(steps, readings, new Set(['OU-E'])), { index: 1, frac: 0 });
  // Une déclaration ne vaut que pour sa semaine, se retire, et les vieilles semaines s'oublient
  const ecrits = [];
  const p = new Paliers('x.json', { lire: () => null, ecrire: (f, d) => ecrits.push(d) });
  p.regler('OU-E', 1000, true, new Date('2026-11-15T00:30:00Z'));
  assert.deepEqual([...p.pour(1000)], ['OU-E']);
  assert.deepEqual([...p.pour(2000)], []);
  p.regler('OU-E', 1000, false);
  assert.deepEqual([...p.pour(1000)], []);
  // Casse libre (B43) : une déclaration d'une autre orthographe est remplacée, sans doublon, et se retire
  p.regler('ou-e', 1000, true);
  p.regler('OU-E', 1000, true);
  assert.deepEqual([...p.pour(1000)], ['OU-E']);
  p.regler('Ou-E', 1000, false);
  assert.deepEqual([...p.pour(1000)], []);
  for (let w = 1; w <= 10; w++) p.regler('S', w, true);
  assert.deepEqual(Object.keys(ecrits.at(-1).semaines).sort((a, b) => a - b), ['3', '4', '5', '6', '7', '8', '9', '10']);
  const relu = new Paliers('x.json', { lire: () => ({ semaines: { 5: { 'OU-E': '2026-11-15T00:30:00Z', bad: 3 }, x: { A: 'y' } } }) });
  assert.deepEqual([...relu.pour(5)], ['OU-E']);
  assert.deepEqual([...relu.pour('x')], []);
});

test('érosion prévue : celle mesurée le 12 nov. 2026 à Synuefe OU-E c28-2, plancher, palier atteint', async () => {
  const { systemInfo } = await import('./merits.js');
  const lu = (progress, state = 'Exploited') => new Map([['S', [{ t: 1, mode: 'reinforcement', state, progress, points: 0 }]]]);
  // Points au passage reconstitués : 268 600 → 15 091, la sape du journal
  assert.equal(systemInfo('S', { readings: lu(268600 / 350000) }).erosion.points, 15091);
  assert.equal(systemInfo('S', { readings: lu(0.724311) }).erosion.points, 13834); // ce matin : prévu pour le 19 nov.
  assert.equal(systemInfo('S', { readings: lu(0.154283) }).erosion.points, 0); // sous 25 % du palier
  assert.equal(systemInfo('S', { readings: lu(1) }).erosion, null); // Consolidé au passage : effet inconnu
  assert.equal(systemInfo('S', { readings: lu(0.5, 'Fortified') }).erosion.verifiee, false);
});

test('Coup d’œil : le système en cours de la route, ce qu’il reste avant le passage de semaine et le rythme', () => {
  const now = Date.parse('2026-11-09T07:00:00Z'); // lundi : jeudi 12 à 07:00 dans 3 jours
  const steps = [{ name: 'Départ', role: 'held-stronghold' }, { name: 'Synuefe OU-E c28-2', role: 'fortified' }, { name: 'HIP 73834', role: 'target' }];
  const readings = new Map([['Synuefe OU-E c28-2', [{ t: now - 3600000, mode: 'reinforcement', state: 'Exploited', progress: 0.5, points: 40000, undermining: 0 }]]]);
  const entries = [
    { t: now - 7200000, system: 'Synuefe OU-E c28-2', merits: 8000, activity: 'mining', mode: 'reinforcement' },
    { t: now - 600000, system: 'Synuefe OU-E c28-2', merits: 4000, activity: 'mining', mode: 'reinforcement' }, // après le relevé
  ];
  const w = workSystem([{ id: 1, name: 'Route', steps }], 'synuefe ou-e c28-2', { entries, readings, now });
  assert.equal(w.index, 1);
  assert.equal(w.next, 'HIP 73834');
  assert.equal(w.info.missingNext, 175000); // la moitié de 350 000
  assert.equal(w.left, 174000); // moins tes 1 000 pts pas encore relevés
  assert.equal(w.perDay, 58000); // 3 jours
  assert.equal(w.week.merits, 12000);
  assert.equal(workSystem([{ id: 1, name: 'Route', steps }], 'HIP 73834', { entries, readings, now }), null); // pas encore son tour
});

test('Coup d’œil : un palier déclaré atteint fait passer à l’étape suivante, comme dans l’onglet (M11)', () => {
  const now = Date.parse('2026-11-14T12:00:00Z'); // samedi
  const steps = [{ name: 'Départ', role: 'held-stronghold' }, { name: 'Système Test A', role: 'fortified' }, { name: 'Système Test B', role: 'fortified' }];
  const readings = new Map([
    ['Système Test A', [{ t: now - 3600000, mode: 'reinforcement', state: 'Exploited', progress: 0.97, points: 1000, undermining: 0 }]],
    ['Système Test B', [{ t: now - 1800000, mode: 'reinforcement', state: 'Exploited', progress: 0.2, points: 0, undermining: 0 }]],
  ]);
  const projects = [{ id: 1, name: 'Route', steps }];
  assert.equal(workSystem(projects, 'Système Test A', { readings, now }).info.missingNext, 10500, 'sans déclaration : A');
  const declared = new Set(['Système Test A']);
  assert.equal(workSystem(projects, 'Système Test A', { readings, now, declared }), null, 'A déclaré : ce n’est plus le système de travail');
  const b = workSystem(projects, 'Système Test B', { readings, now, declared });
  assert.equal(b.index, 2);
  assert.equal(b.info.missingNext, 280000);
});

test('relevé d’avant le passage de jeudi : ni renforcement, ni érosion, ni points manquants (M12)', async () => {
  const { systemInfo, routeProgress } = await import('./merits.js');
  const now = Date.parse('2026-11-14T12:00:00Z'); // samedi 14 : semaine du jeudi 12 à 7 h
  const end = weekStart(now) + 7 * 86400000;
  const wednesday = Date.parse('2026-11-11T20:00:00Z');
  const readings = new Map([['A', [{ t: wednesday, mode: 'reinforcement', state: 'Exploited', progress: 0.97, points: 1000, undermining: 300 }]]]);
  const info = systemInfo('A', { readings, role: 'fortified', end });
  assert.equal(info.reading.stale, true);
  assert.equal(info.reading.week, null, 'renforcement remis à zéro au passage');
  assert.equal(info.reading.undermining, 0);
  assert.equal(info.erosion, null, 'l’érosion a déjà eu lieu');
  assert.equal(info.missingNext, null, 'à relever');
  assert.equal(info.missingGoal, null);
  assert.equal(info.reading.state, 'Exploited', 'niveau d’avant le passage, présenté comme tel');
  // Points pas encore relevés : seulement ceux d'après le passage (ceux du mercredi soir ont déjà compté)
  const entries = [
    { t: Date.parse('2026-11-11T22:00:00Z'), system: 'A', merits: 2000, activity: 'mining' },
    { t: Date.parse('2026-11-14T10:00:00Z'), system: 'A', merits: 1000, activity: 'mining' },
  ];
  const after = systemInfo('A', { entries: entries.slice(1), readings, role: 'fortified', end });
  const both = systemInfo('A', { entries, readings, role: 'fortified', end });
  assert.ok(after.pendingPoints > 0);
  assert.equal(both.pendingPoints, after.pendingPoints, 'gains d’avant le passage exclus');
  assert.equal(both.mine.merits, 3000, 'ils restent dans ton total');
  const ownEnd = weekStart(wednesday) + 7 * 86400000;
  const before = systemInfo('A', { entries: entries.slice(0, 1), readings, role: 'fortified', end: ownEnd });
  assert.ok(before.pendingPoints > 0);
  assert.equal(systemInfo('A', { entries, readings, role: 'fortified', end: ownEnd }).pendingPoints, before.pendingPoints, 'la semaine du relevé : seulement le mercredi soir');
  // Le même relevé dans sa propre semaine reste complet
  const own = systemInfo('A', { readings, role: 'fortified', end: weekStart(wednesday) + 7 * 86400000 });
  assert.equal(own.reading.stale, false);
  assert.equal(own.reading.week, 1000);
  assert.equal(own.missingNext, 10500);
  // Route : jauge pleine avant le passage = palier passé jeudi, l'étape suivante est en cours
  const steps = [{ name: 'A', role: 'fortified' }, { name: 'B', role: 'target' }];
  const full = new Map([['A', [{ t: wednesday, mode: 'reinforcement', state: 'Exploited', progress: 1 }]]]);
  assert.deepEqual(routeProgress(steps, full, new Set(), { end }), { index: 1, frac: 0 });
  assert.deepEqual(routeProgress(steps, full, new Set(), { end: weekStart(wednesday) + 7 * 86400000 }), { index: 0, frac: 1 }, 'la semaine du relevé : pas encore passé');
  const taken = new Map([['B', [{ t: wednesday, mode: 'acquisition', state: 'Unoccupied', progress: 1.02 }]]]);
  assert.deepEqual(routeProgress([{ name: 'Z', role: 'held-fortified' }, { name: 'B', role: 'target' }], taken, new Set(), { end }), { index: 2, frac: 1 }, 'prise à 1,0 avant le passage : système pris');
  // Jauge pas pleine : l'étape reste en cours, avec la jauge d'avant le passage
  assert.deepEqual(routeProgress(steps, readings, new Set(), { end }), { index: 0, frac: 0.97 });
});

test('historique d’une semaine passée : relevés d’après la fin de la semaine ignorés (B52)', async () => {
  const { routeProgress } = await import('./merits.js');
  const lastWeek = Date.parse('2026-11-08T12:00:00Z');
  const end = weekStart(lastWeek) + 7 * 86400000;
  const steps = [{ name: 'A', role: 'fortified' }, { name: 'B', role: 'target' }];
  const readings = new Map([['A', [
    { t: lastWeek, mode: 'reinforcement', state: 'Exploited', progress: 0.4 },
    { t: Date.parse('2026-11-13T12:00:00Z'), mode: 'reinforcement', state: 'Fortified', progress: 0.1 },
  ]]]);
  assert.deepEqual(routeProgress(steps, readings), { index: 1, frac: 0 }, 'aujourd’hui : A est Consolidé');
  assert.deepEqual(routeProgress(steps, readings, new Set(), { end }), { index: 0, frac: 0.4 }, 'la semaine passée : A en cours');
});

test('noms de systèmes sans tenir compte de la casse : rapport, infos, route, paliers (B43)', async () => {
  const { systemInfo, routeProgress } = await import('./merits.js');
  const now = Date.parse('2026-11-14T12:00:00Z');
  const readings = new Map([['Synuefe GA-I b57-6', [{ t: now - 1000, mode: 'reinforcement', state: 'Exploited', progress: 0.5, points: 10, undermining: 0 }]]]);
  const entries = [{ t: now - 500, system: 'Synuefe GA-I b57-6', merits: 400, activity: 'mining' }];
  const typed = 'synuefe ga-i b57-6';
  const r = weekReport(entries, { systems: [typed], now, readings, roles: new Map([[typed, 'fortified']]), declared: new Set([typed]) });
  assert.equal(r.merits, 400);
  assert.equal(r.systems[0].info.goal, 'Fortified');
  assert.equal(r.systems[0].info.declared, true);
  const info = systemInfo(typed, { entries, readings, role: 'fortified' });
  assert.equal(info.reading.progress, 0.5);
  assert.equal(info.mine.merits, 400);
  assert.deepEqual(routeProgress([{ name: typed, role: 'fortified' }], readings), { index: 0, frac: 0.5 });
  assert.deepEqual(routeProgress([{ name: typed, role: 'fortified' }], readings, new Set(['SYNUEFE GA-I B57-6'])), { index: 1, frac: 1 });
});

test('journal : orthographe et position des systèmes visités, distance entre deux systèmes', () => {
  const l = log([
    arrival('2026-11-06T10:00:00Z', 'Système Test', { StarPos: [0, 0, 0] }),
    arrival('2026-11-06T11:00:00Z', 'Système Test 2', { StarPos: [3, 4, 12] }),
    arrival('2026-11-06T12:00:00Z', 'Sans Position', { StarPos: ['x', 1, 2] }),
  ]);
  assert.equal(l.canon('système test 2'), 'Système Test 2');
  assert.equal(l.canon('Inconnu'), 'Inconnu');
  assert.equal(l.distance('système test', 'SYSTÈME TEST 2'), 13);
  assert.equal(l.distance('Système Test', 'Sans Position'), null);
  assert.equal(l.distance('Système Test', 'Inconnu'), null);
});
