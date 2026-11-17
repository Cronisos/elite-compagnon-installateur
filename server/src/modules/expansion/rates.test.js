// Tests de « Mérites par heure active » : temps actif sans les pauses, travail rattaché à chaque gain, état du
// système, rendements par activité et par état, modificateurs saisis (dossiers temporaires du système).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ActiveClock, KNOWN_MODIFIERS, MIN_UNITS, RULE_CHANGES, arrivalOf, lastRuleChange, marketActivity,
  rateReport, replayRates, stateOf,
} from './rates.js';
import { ActionMarks, ModifierStore, STATUSES, cleanModifier, validDate } from './rateStore.js';
import { periodStart, registerRates } from './ratesRoutes.js';

const MIN = 60_000;
const T0 = Date.parse('2026-11-06T10:00:00Z');
const at = (m, s = 0) => new Date(T0 + m * MIN + s * 1000).toISOString();
const ev = (m, event, extra = {}) => ({ timestamp: at(m), event, ...extra });
const evs = (m, s, event, extra = {}) => ({ timestamp: at(m, s), event, ...extra });

const AISLING = 'Aisling Duval';
const held = (name, state = 'Exploited') => ({ StarSystem: name, ControllingPower: AISLING, Powers: [AISLING], PowerplayState: state });
/** Arrivée, allégeance connue, et une action par minute (comme un vol normal) de from à to. */
function flying(from, to, event = 'Music') {
  const out = [];
  for (let m = from; m <= to; m++) out.push(ev(m, event));
  return out;
}
function run(events, moves) {
  return replayRates(events, moves).units;
}
const start = [
  ev(0, 'LoadGame'),
  ev(0, 'Location', { ...held('Synuefe OU-E c28-2'), Docked: false }),
  ev(0, 'Powerplay', { Power: AISLING, Merits: 1_000_000 }),
];

test('temps actif : à quai, jeu fermé et plus de 10 min sans action ne comptent pas', () => {
  const c = new ActiveClock();
  c.apply(ev(0, 'LoadGame'));
  for (let m = 1; m <= 20; m++) c.touch(T0 + m * MIN); // 20 min de vol
  c.apply(ev(20, 'Docked'));
  c.touch(T0 + 25 * MIN); // à quai : pause
  c.apply(ev(30, 'Undocked'));
  c.touch(T0 + 35 * MIN); // 5 min
  c.touch(T0 + 50 * MIN); // trou de 15 min : pause d'inactivité
  c.touch(T0 + 52 * MIN); // 2 min
  c.apply(ev(52, 'Shutdown'));
  assert.equal(c.at(T0 + 52 * MIN), 27 * MIN);
  c.apply(ev(120, 'LoadGame')); // jeu relancé : le temps d'avant est gardé
  c.touch(T0 + 130 * MIN);
  assert.equal(c.at(T0 + 130 * MIN), 37 * MIN);
});

test('état du système pour ta puissance : renforcement, sape, prise, autre puissance, sans puissance', () => {
  assert.deepEqual(stateOf(arrivalOf(held('A', 'Fortified')), AISLING), { mode: 'reinforcement', state: 'Fortified' });
  assert.deepEqual(stateOf(arrivalOf({ ControllingPower: 'Zemina Torval', Powers: ['Zemina Torval'], PowerplayState: 'Stronghold' }), AISLING),
    { mode: 'undermining', state: 'Stronghold' });
  assert.deepEqual(stateOf(arrivalOf({ Powers: [AISLING], PowerplayState: 'Unoccupied', PowerplayConflictProgress: [{ Power: AISLING, ConflictProgress: 0.007 }] }), AISLING),
    { mode: 'acquisition', state: 'Unoccupied' });
  assert.deepEqual(stateOf(arrivalOf({ Powers: ['Yuri Grom'], PowerplayState: 'Unoccupied' }), AISLING), { mode: 'outside', state: 'Unoccupied' });
  assert.deepEqual(stateOf(arrivalOf({}), AISLING), { mode: 'none', state: null });
  assert.deepEqual(stateOf(null, AISLING), { mode: 'unknown', state: null });
  assert.deepEqual(stateOf(arrivalOf(held('A')), null), { mode: 'unknown', state: null });
});

test('vente de minerai : le temps de minage et de trajet, sans le temps à quai, et les mérites du TotalMerits', () => {
  const units = run([
    ...start,
    ev(0, 'Undocked'),
    ...flying(1, 40, 'MiningRefined'),
    ev(45, 'Docked'),
    evs(50, 0, 'MarketSell', { Type: 'iridium', Count: 268, AvgPricePaid: 0 }),
    // Le jeu écrit le gain deux fois et ne crédite qu'une fois : le TotalMerits suivant repart du vrai total
    evs(50, 13, 'PowerplayMerits', { Power: AISLING, MeritsGained: 18311, TotalMerits: 1_018_311 }),
    evs(50, 13, 'PowerplayMerits', { Power: AISLING, MeritsGained: 18311, TotalMerits: 1_036_622 }),
    evs(52, 0, 'PowerplayMerits', { Power: AISLING, MeritsGained: 7, TotalMerits: 1_018_318 }),
  ]);
  const mining = units.filter((u) => u.activity === 'mining');
  assert.equal(mining.length, 1);
  assert.equal(mining[0].activeMs, 45 * MIN); // de la fin du travail précédent (jamais) à l'amarrage
  assert.equal(mining[0].merits, 18311);
  assert.deepEqual([mining[0].mode, mining[0].state, mining[0].system], ['reinforcement', 'Exploited', 'Synuefe OU-E c28-2']);
  assert.equal(units.reduce((s, u) => s + u.merits, 0), 18318); // le +7 d'origine inconnue compte aussi
  assert.equal(units.find((u) => u.activity === 'other').activeMs, 0); // mais sans temps
  const r = rateReport(units);
  assert.deepEqual([r.total.units, r.total.gains], [1, 2]); // et ce n'est pas un travail
  assert.deepEqual(r.recent.map((u) => u.activity), ['mining']);
});

test('allégeance quittée : les travaux suivants ne comptent plus', () => {
  const units = run([
    ...start,
    ev(1, 'Bounty', {}),
    ev(2, 'PowerplayLeave', { Power: AISLING }),
    ev(3, 'Bounty', {}),
  ]);
  assert.deepEqual(units.map((u) => u.power), [AISLING, null]);
  assert.equal(rateReport(units).total.units, 1);
});

test("vente à 0 mérite : le travail compte quand même, avec son temps", () => {
  const units = run([
    ...start,
    ev(0, 'FSDJump', { StarSystem: 'HIP 8060' }),
    ...flying(1, 20, 'MiningRefined'),
    ev(21, 'MarketSell', { Type: 'rhodplumsite', Count: 10, AvgPricePaid: 0 }),
  ]);
  assert.equal(units.length, 1);
  assert.deepEqual([units[0].activity, units[0].mode, units[0].merits, units[0].activeMs], ['mining', 'none', 0, 21 * MIN]);
});

test('approche : au plus 30 min actives avant le premier signe de l’activité, le reste est écarté', () => {
  const units = run([
    ...start,
    ...flying(1, 120), // 2 h chez les ingénieurs
    ...flying(121, 130, 'MiningRefined'), // 10 min de minage
    ev(131, 'MarketSell', { Type: 'iridium', Count: 10, AvgPricePaid: 0 }),
    evs(131, 10, 'PowerplayMerits', { Power: AISLING, MeritsGained: 500, TotalMerits: 1_000_500 }),
  ]);
  const [u] = units;
  assert.equal(u.activeMs, 40 * MIN); // de 91 à 131
  assert.equal(u.skippedMs, 91 * MIN);
});

test('approche : un travail seul, sans aucun signe de son activité depuis le précédent, a 30 min avant le passage', () => {
  const units = run([
    ...start,
    ev(1, 'Bounty', { TotalReward: 1 }),
    ...flying(2, 200), // 3 h 20 d'autre chose, sans aucun signe d'une activité
    ev(201, 'RedeemVoucher', { Type: 'bounty', Amount: 1 }),
  ]);
  assert.deepEqual(units.map((u) => [u.activity, u.activeMs, u.skippedMs]), [['combat', 1 * MIN, 0], ['combat', 30 * MIN, 170 * MIN]]);
});

/**
 * Les mêmes événements, avec les deux actions du passage en station dans un ordre puis dans l'autre.
 * @param actions [(minute) => événements] ; les gains sans TotalMerits, pour qu'ils ne dépendent pas de l'ordre
 */
function visit(before, [a, b], at = 91) {
  return [[a, b], [b, a]].map(([x, y]) => run([...before, ...x(at), ...y(at + 2)]));
}
const gain = (m, merits) => evs(m, 5, 'PowerplayMerits', { Power: AISLING, MeritsGained: merits });
const pick = (units) => units.filter((u) => !u.orphan).map((u) => [u.activity, u.activeMs, u.merits]).sort((a, b) => a[0].localeCompare(b[0]));

test('même passage en station : un bon de prime sans signe ne prend pas le temps de l’exobiologie, dans les deux ordres', () => {
  const before = [
    ...start,
    ...[1, 10, 20, 30, 40, 50, 60].flatMap((m) => [ev(m, 'ScanOrganic', { ScanType: 'Analyse' }), ...flying(m + 1, m + 9)]),
    ...flying(70, 89), // retour à la station
    ev(90, 'Docked'),
  ];
  const docked = [
    (m) => [ev(m, 'RedeemVoucher', { Type: 'bounty', Amount: 1 })],
    (m) => [ev(m, 'SellOrganicData', { BioData: [] }), gain(m, 415)],
  ];
  for (const units of visit(before, docked)) {
    assert.deepEqual(pick(units), [['combat', 0, 0], ['exobiology', 90 * MIN, 415]]); // depuis le lancement (moins de 30 min avant le 1er scan)
  }
});

test('bons codex et trade : pas un travail, ils ne prennent aucun temps', () => {
  const units = run([
    ...start,
    ev(1, 'ScanOrganic'), ...flying(2, 40),
    ev(41, 'Docked'),
    ev(42, 'RedeemVoucher', { Type: 'codex', Amount: 105000 }),
    ev(42, 'RedeemVoucher', { Type: 'trade', Amount: 2090 }),
    ev(43, 'SellOrganicData', {}),
  ]);
  assert.deepEqual(units.map((u) => [u.activity, u.activeMs]), [['exobiology', 41 * MIN]]);
});

test('même passage : minage puis nacelles de sauvetage, chacun son temps, dans les deux ordres', () => {
  const before = [
    ...start,
    ...flying(1, 40, 'MiningRefined'),
    ...flying(45, 55, 'CollectCargo'), // nacelles ramassées après le minage
    ...flying(56, 69),
    ev(70, 'Docked'),
  ];
  const docked = [
    (m) => [ev(m, 'MarketSell', { Type: 'iridium', Count: 100, AvgPricePaid: 0 }), gain(m, 6841)],
    (m) => [ev(m, 'SearchAndRescue', { Name: 'occupiedcryopod', Count: 4 }), gain(m, 3788)],
  ];
  for (const units of visit(before, docked, 71)) {
    assert.deepEqual(pick(units), [['mining', 45 * MIN, 6841], ['rescue', 25 * MIN, 3788]]);
  }
});

test('gain isolé après un scan de vaisseau : compté sans temps, il ne coupe pas le minage', () => {
  const units = run([
    ...start,
    ...flying(1, 20, 'MiningRefined'),
    evs(20, 30, 'ShipTargeted', { TargetLocked: true, ScanStage: 3, Ship: 'anaconda' }),
    evs(20, 31, 'PowerplayMerits', { Power: AISLING, MeritsGained: 7, TotalMerits: 1_000_007 }),
    evs(20, 31, 'PowerplayMerits', { Power: AISLING, MeritsGained: 2000, TotalMerits: 1_002_007 }), // trop gros pour un scan
    ...flying(21, 40, 'MiningRefined'),
    evs(40, 30, 'UnderAttack'),
    evs(40, 40, 'PowerplayMerits', { Power: AISLING, MeritsGained: 7, TotalMerits: 1_002_014 }), // sans kill ni scan
    ev(45, 'MarketSell', { Type: 'iridium', Count: 100, AvgPricePaid: 0 }),
    evs(45, 13, 'PowerplayMerits', { Power: AISLING, MeritsGained: 5000, TotalMerits: 1_007_014 }),
  ]);
  assert.deepEqual(units.map((u) => [u.activity, u.activeMs, u.merits, Boolean(u.orphan)]), [
    ['scan', 0, 7, true], ['other', 0, 2000, true], ['other', 0, 7, true], ['mining', 45 * MIN, 5000, false],
  ]);
  const scan = rateReport(units).byActivity.find((r) => r.activity === 'scan');
  assert.deepEqual([scan.units, scan.gains, scan.rate], [0, 1, null]);
});

test('un achat juste après la vente ouvre le travail suivant : le trajet entier lui revient', () => {
  const units = run([
    ...start,
    ev(0, 'Docked'),
    ev(1, 'MarketBuy', { Type: 'indium', Count: 700 }),
    ev(2, 'Undocked'), ...flying(3, 44), ev(45, 'Docked'),
    ev(46, 'MarketSell', { Type: 'indium', Count: 700, AvgPricePaid: 5000 }),
    ev(47, 'MarketBuy', { Type: 'bauxite', Count: 700 }),
    ev(48, 'Undocked'), ...flying(49, 90), ev(91, 'Docked'),
    ev(92, 'MarketSell', { Type: 'bauxite', Count: 700, AvgPricePaid: 3000 }),
  ]);
  assert.deepEqual(units.map((u) => [u.activity, u.activeMs]), [['trade', 43 * MIN], ['trade', 43 * MIN]]);
});

test('kills enchaînés et ventes à la suite au même endroit : un seul travail', () => {
  const units = run([
    ...start,
    ...flying(1, 9),
    ev(10, 'UnderAttack'),
    evs(12, 0, 'Bounty', { TotalReward: 1 }),
    evs(12, 2, 'PowerplayMerits', { Power: AISLING, MeritsGained: 28, TotalMerits: 1_000_028 }),
    evs(12, 30, 'FactionKillBond', { Reward: 1 }),
    evs(12, 33, 'PowerplayMerits', { Power: AISLING, MeritsGained: 30, TotalMerits: 1_000_058 }),
    evs(20, 0, 'Bounty', { TotalReward: 1 }),
    evs(20, 1, 'PowerplayMerits', { Power: AISLING, MeritsGained: 28, TotalMerits: 1_000_086 }),
  ]);
  assert.deepEqual(units.map((u) => [u.activity, u.gains, u.merits, Math.round(u.activeMs / 1000)]), [
    ['combat', 2, 58, 12 * 60 + 30], // 12 min 30 depuis le lancement (moins de 30 min avant la première attaque)
    ['combat', 1, 28, 7 * 60 + 30],
  ]);
});

test("minerai acheté puis revendu : du commerce, et le gain que merits.js range en minage lui revient", () => {
  assert.equal(marketActivity({ Type: 'indium', AvgPricePaid: 5000 }, new Set(['indium'])), 'trade');
  assert.equal(marketActivity({ Type: '$indium_name;', AvgPricePaid: 0 }, new Set(['indium'])), 'mining');
  assert.equal(marketActivity({ Type: 'soontillrelics', AvgPricePaid: 0 }, new Set(['indium'])), 'trade');
  const units = run([
    ...start,
    ev(1, 'MarketBuy', { Type: 'indium', Count: 700 }),
    ...flying(2, 30),
    ev(31, 'MarketSell', { Type: 'indium', Count: 700, AvgPricePaid: 5000 }),
    evs(31, 15, 'PowerplayMerits', { Power: AISLING, MeritsGained: 4000, TotalMerits: 1_004_000 }),
  ]);
  assert.deepEqual(units.map((u) => [u.activity, u.merits, u.activeMs]), [['trade', 4000, 31 * MIN]]);
});

test('actions vues dans Status.json : elles comblent les trous du journal (minage en SRV)', () => {
  const events = [
    ...start,
    ev(1, 'MiningRefined'),
    ev(13, 'MiningRefined'), // 12 min sans rien dans le journal
    ev(14, 'MarketSell', { Type: 'iridium', Count: 10, AvgPricePaid: 0 }),
  ];
  assert.equal(run(events)[0].activeMs, 2 * MIN); // le trou compte comme une pause
  const moves = [4, 7, 10].map((m) => T0 + m * MIN); // le SRV roule
  assert.equal(run(events, moves)[0].activeMs, 14 * MIN);
});

test('rendements : par activité, par état, croisés, avec la taille de l’échantillon', () => {
  const unit = (activity, mode, state, merits, minutes, t = T0) => ({ t, activity, mode, state, merits, gains: merits ? 1 : 0, activeMs: minutes * MIN, skippedMs: 0, power: AISLING, system: 'A' });
  const units = [
    unit('mining', 'reinforcement', 'Stronghold', 30_000, 60),
    unit('mining', 'reinforcement', 'Stronghold', 30_000, 60),
    unit('mining', 'acquisition', 'Unoccupied', 0, 60),
    unit('combat', 'reinforcement', 'Stronghold', 100, 0.5),
    { ...unit('trade', 'none', null, 0, 60), power: null }, // avant l'allégeance : ignoré
    unit('trade', 'reinforcement', 'Stronghold', 5000, 60, T0 - 3600_000), // avant la période
  ];
  const r = rateReport(units, { from: T0 });
  assert.equal(r.total.merits, 60_100);
  assert.equal(r.total.units, 4);
  const mining = r.byActivity.find((x) => x.activity === 'mining');
  assert.deepEqual([mining.rate, mining.units, mining.zero, mining.small], [20_000, 3, 1, 3 < MIN_UNITS]);
  assert.equal(r.byActivity.find((x) => x.activity === 'combat').rate, null); // 30 s : pas de taux
  assert.deepEqual(r.byState.map((x) => [x.key, x.rate]), [['reinforcement:Stronghold', 29_925], ['acquisition:Unoccupied', 0]]);
  assert.deepEqual(r.cross.map((x) => x.key), ['mining|reinforcement:Stronghold', 'combat|reinforcement:Stronghold', 'mining|acquisition:Unoccupied']);
});

test('modificateur saisi sur un système : ce que tu y as fait pendant sa semaine Powerplay', () => {
  const u = (system, t, merits) => ({ t, system, activity: 'trade', mode: 'reinforcement', state: 'Fortified', merits, gains: 1, activeMs: 30 * MIN, skippedMs: 0, power: AISLING });
  const units = [u('Marked', T0, 10_000), u('marked', T0 + 3600_000, 5000), u('Marked', T0 + 8 * 86400_000, 1), u('Other', T0, 99)];
  const [m, none] = rateReport(units, { modifiers: [{ id: 'x', system: 'Marked', date: '2026-11-06' }, { id: 'y', system: '', date: '2026-11-06' }] }).modifiers;
  assert.deepEqual([m.measured.merits, m.measured.units, m.measured.rate], [15_000, 2, 15_000]);
  assert.equal(none.measured, null);
});

test('règles connues : chaque entrée a une date, un statut et une source (pour la vigie des règles)', () => {
  for (const r of [...RULE_CHANGES, ...KNOWN_MODIFIERS]) {
    assert.ok(validDate(r.date), r.id);
    assert.ok(STATUSES.includes(r.status), r.id);
    assert.ok(r.source && r.label, r.id);
  }
  assert.equal(lastRuleChange().id, 'operations');
  assert.equal(lastRuleChange([{ id: 'moi', date: '2026-12-10', kind: 'rules' }]).id, 'moi');
  assert.equal(periodStart('rules', { rules: { date: '2026-07-01' } }).from, Date.parse('2026-07-01T00:00:00Z'));
  assert.equal(periodStart('week', { now: Date.parse('2026-11-07T12:00:00Z') }).from, Date.parse('2026-11-05T07:00:00Z'));
  assert.equal(periodStart('n importe quoi', { rules: null }).kind, 'rules');
});

test('saisie : libellé et date obligatoires, choix connus seulement', () => {
  assert.ok(cleanModifier({ label: 'x', date: '2026-02-30' }).error);
  assert.ok(cleanModifier({ label: '', date: '2026-02-03' }).error);
  assert.ok(cleanModifier({ label: 'x', date: '2026-02-03', status: 'sûre' }).error);
  assert.ok(cleanModifier({ label: 'x', date: '2026-02-03', kind: '__proto__' }).error);
  const { value } = cleanModifier({ label: '  Système marqué ', date: '2026-11-06', system: 'Synuefe OU-E c28-2', effect: '+35 %', extra: 1 });
  assert.deepEqual(value, {
    kind: 'modifier', label: 'Système marqué', date: '2026-11-06', status: 'à vérifier', effect: '+35 %', scope: '',
    system: 'Synuefe OU-E c28-2', source: '', note: '',
  });
  assert.equal(cleanModifier({ kind: 'rules', label: 'Patch', date: '2026-12-10', system: 'A' }).value.system, '');
});

test('modificateurs enregistrés : fichier écrit d’un bloc, relu au redémarrage, suppression par identifiant', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-rates-'));
  try {
    const file = path.join(dir, 'expansion-modifiers.json');
    const store = new ModifierStore(file);
    const { value } = store.add({ label: 'Marqué', date: '2026-11-06', status: 'mesurée' });
    assert.ok(store.add({ label: '' }).error);
    assert.deepEqual(fs.readdirSync(dir), ['expansion-modifiers.json']); // pas de fichier temporaire laissé
    const again = new ModifierStore(file);
    assert.deepEqual(again.list().map((m) => [m.id, m.label, m.status]), [[value.id, 'Marqué', 'mesurée']]);
    assert.equal(again.remove('__proto__'), false);
    assert.equal(again.remove(value.id), true);
    assert.deepEqual(new ModifierStore(file).list(), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('minutes jouées : une par minute, gardées un an, écrites seulement s’il y a du nouveau', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-rates-'));
  try {
    const file = path.join(dir, 'expansion-activity.json');
    const now = Date.parse('2026-11-07T12:00:00Z');
    fs.writeFileSync(file, JSON.stringify([Math.floor((now - 400 * 86400_000) / MIN), 'x', Math.floor(now / MIN) - 5]));
    const marks = new ActionMarks(file, { now });
    marks.merge([now, now + 10_000, now + 61_000]);
    assert.deepEqual(marks.times(), [Math.floor(now / MIN) * MIN - 5 * MIN, now, now + MIN]);
    marks.flush(now);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).length, 3);
    fs.rmSync(file);
    marks.flush(now); // rien de nouveau : pas d'écriture
    assert.equal(fs.existsSync(file), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('routes : rendements de la période, ajout et suppression d’un modificateur', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-rates-'));
  try {
    const routes = new Map();
    const router = {
      get: (p, fn) => routes.set(`GET ${p}`, fn),
      post: (p, fn) => routes.set(`POST ${p}`, fn),
      delete: (p, fn) => routes.set(`DELETE ${p}`, fn),
    };
    const journal = Object.assign(new EventEmitter(), { addInterest() {} });
    const sent = [];
    registerRates({ router, journal, broadcast: (type) => sent.push(type), dataDir: dir, moves: { times: [], onAction() {} } });
    journal.emit('ready', {
      history: [
        { ...start[0], timestamp: new Date().toISOString() },
        { ...start[1], timestamp: new Date().toISOString() },
        { ...start[2], timestamp: new Date().toISOString() },
      ],
    });
    journal.emit('event', { timestamp: new Date().toISOString(), event: 'Bounty', TotalReward: 1 });
    const call = (key, req = {}) => {
      let status = 200;
      let body;
      const res = { status: (s) => ((status = s), res), json: (b) => ((body = b), res), end: () => res };
      routes.get(key)({ query: {}, params: {}, ...req }, res, (err) => { throw err; });
      return { status, body };
    };
    const r = call('GET /rates', { query: { period: 'week' } }).body;
    assert.equal(r.period.kind, 'week');
    assert.equal(r.total.units, 1);
    assert.equal(r.rules.last.id, 'operations');
    const added = call('POST /modifiers', { body: { kind: 'rules', label: 'Patch de décembre', date: '2026-12-10', status: 'publiée' } });
    assert.equal(added.status, 201);
    assert.equal(call('POST /modifiers', { body: { label: 'x' } }).status, 400);
    assert.equal(call('GET /rates').body.rules.last.label, 'Patch de décembre');
    assert.equal(call('DELETE /modifiers/:id', { params: { id: added.body.id } }).status, 204);
    assert.equal(call('DELETE /modifiers/:id', { params: { id: added.body.id } }).status, 404);
    assert.ok(sent.includes('expansion:rates'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** Le module branché sur un faux journal et un faux suivi d'activité (actions de Status.json). */
function plugged(dataDir, times = []) {
  const journal = Object.assign(new EventEmitter(), { addInterest() {} });
  const listeners = [];
  const router = { get() {}, post() {}, delete() {} };
  const handle = registerRates({ router, journal, broadcast() {}, dataDir, moves: { times, onAction: (fn) => listeners.push(fn) } });
  return { journal, act: (t) => listeners.forEach((fn) => fn(t)), ...handle };
}

test('en direct puis après un redémarrage : les minutes jouées enregistrées redonnent les mêmes travaux', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-rates-'));
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-rates-'));
  try {
    const base = Math.floor(Date.now() / MIN) * MIN - 3 * 3600_000; // il y a 3 h : dans l'année gardée
    const e = (m, event, extra = {}) => ({ timestamp: new Date(base + m * MIN).toISOString(), event, ...extra });
    const events = [
      e(0, 'LoadGame'), e(0, 'Location', { ...held('Synuefe OU-E c28-2'), Docked: false }), e(0, 'Powerplay', { Power: AISLING, Merits: 1_000_000 }),
      e(1, 'MiningRefined', { Type: 'iridium' }),
      e(13, 'MiningRefined', { Type: 'iridium' }), // 12 min sans rien dans le journal : tu mines en SRV
      e(14, 'Docked'),
      e(15, 'MarketSell', { Type: 'iridium', Count: 10, AvgPricePaid: 0 }),
      e(15.25, 'PowerplayMerits', { Power: AISLING, MeritsGained: 500, TotalMerits: 1_000_500 }),
      e(16, 'Undocked'),
      e(17, 'UnderAttack'), e(18, 'Music'),
      e(30, 'Bounty', { TotalReward: 1 }), // 12 min de combat sans action écrite
      e(30.1, 'PowerplayMerits', { Power: AISLING, MeritsGained: 28, TotalMerits: 1_000_528 }),
      e(31, 'ReceiveText'), // message reçu : ni action ni travail
    ];
    // Actions vues dans Status.json, entre deux débuts de minute (le fichier les garde à la minute)
    const actions = [4, 7, 10, 21, 24, 27].map((m) => base + m * MIN + 20_000);
    const live = plugged(dir);
    live.journal.emit('ready', { history: [] });
    const feed = [...events.map((x) => [Date.parse(x.timestamp), x]), ...actions.map((t) => [t, null])].sort((a, b) => a[0] - b[0]);
    for (const [t, x] of feed) (x ? live.journal.emit('event', x) : live.act(t));
    live.flush();
    const units = live.units().map((u) => ({ ...u }));
    assert.deepEqual(units.map((u) => [u.activity, u.activeMs, u.merits]), [['mining', 14 * MIN, 500], ['combat', 14 * MIN, 28]]);

    // Redémarrage : core/activity.js a encore les actions (moins de 3 jours), ou plus du tout
    for (const times of [actions, []]) {
      const again = plugged(dir, times);
      again.journal.emit('ready', { history: events });
      assert.deepEqual(again.units(), units);
    }
    // Sans les minutes enregistrées, les trous du journal deviennent des pauses
    const lost = plugged(empty);
    lost.journal.emit('ready', { history: events });
    assert.deepEqual(lost.units().map((u) => u.activeMs), [2 * MIN, 2 * MIN]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(empty, { recursive: true, force: true });
  }
});
