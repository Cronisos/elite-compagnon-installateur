// Données publiques des ingénieurs (data/engineers.json) : forme stricte, rien des journaux d'un joueur, cohérence avec
// les données de référence figées (FDevIDs engineers.csv, coriolis, material.csv), et refus des copies abîmées.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateEngineerData, loadEngineerData, indexEngineerData, regionOf, referenceRegion, offersIndex, maxGradeOf, offersOf, normItem, normStation, canonicalBlueprint, DATA_FILE } from '../services/engineerData.js';
import { hostOf } from '../services/workshop.js';
import { ref, idx, DATA, id, tempDir } from './helpers/itinerary.js';

const withRef = ref ? test : test.skip;
const RAW = JSON.parse(fs.readFileSync(DATA_FILE(), 'utf8'));
const copy = () => JSON.parse(JSON.stringify(RAW));

test('données : 25 ingénieurs, ids uniques, région recalculée = région déclarée, chaîne des parrains sans boucle', () => {
  assert.equal(DATA.error, null);
  const list = DATA.data.engineers;
  assert.equal(list.length, 25);
  assert.equal(new Set(list.map((e) => e.id)).size, 25);
  for (const e of list) assert.equal(regionOf(e.coords, DATA.data.meta.regions), e.region, e.name);
  // referral.by cohérent avec le texte de discovery : connu du public, ou « Référence de <nom du parrain> »
  for (const e of list) {
    if (e.referral.by === null) assert.match(e.discovery, /^Connue? du public/, e.name);
    else {
      const p = idx.byId.get(e.referral.by);
      const shown = p.name.replace("Tod 'The Blaster' McQuinn", 'Tod « The Blaster » McQuinn');
      assert.ok(e.discovery.includes(shown), `${e.name} : ${e.discovery}`);
    }
    assert.doesNotMatch(e.discovery, /grade 3/, `${e.name} : « rang », pas « grade »`);
  }
  // Chaînes du § 1.2 : les 4 de Colonia ont leur parrain dans la Bulle
  for (const e of list.filter((x) => x.region === 'Colonia')) assert.equal(idx.byId.get(e.referral.by).region, 'Bulle', e.name);
  assert.equal(idx.byId.get(id('Professor Palin')).referral.by, id('Marco Qwent'));
  assert.equal(idx.byId.get(id('Marco Qwent')).referral.by, id('Elvira Martuuk'));
  assert.equal(idx.byId.get(id('Didi Vatermann')).referral.by, id('Selene Jean'));
});

test('données : aucune clé ni aucun texte tirés des journaux d’un joueur (parcours récursif)', () => {
  const keys = new Set();
  const texts = [];
  const walk = (v) => {
    if (typeof v === 'string') texts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); }
  };
  walk(RAW);
  for (const k of ['journal', 'derniereVisite', 'baseVisitee', 'padsJournal', 'stationNameJournal', 'systemAddressIdentique', 'deblocageObserve', 'contreVerification', 'coordsCheck']) assert.ok(!keys.has(k), k);
  for (const re of [/journa(l|ux) du joueur/i, /journaux de référence/i, /lecture seule/i, /[A-Za-z]:\\/, /Saved Games/i, /derni[eè]re visite/i]) {
    assert.ok(!texts.some((t) => re.test(t)), String(re));
  }
});

test('données : chaque valeur gardée a une source publique', () => {
  for (const e of DATA.data.engineers) {
    const sourced = Object.keys(e.sources).flatMap((k) => k.split(',').map((x) => x.trim()));
    for (const f of ['systemAddress', 'coords', 'base', 'body', 'discovery', 'invitation', 'unlock', 'marketId', 'unlock.items[].symbol']) {
      if (e[f.split('.')[0]] == null) continue;
      assert.ok(sourced.includes(f), `${e.name} : ${f} sans source`);
    }
    for (const v of Object.values(e.sources)) for (const s of [v].flat()) assert.ok(/^(https:\/\/|EDCD FDevIDs|coriolis-data|texte du jeu|calcul local|déduit du champ)/.test(s), `${e.name} : source ${s}`);
  }
});

test('données : les 25 objets de déblocage ont le type et le symbole du tableau (§ 4.2)', () => {
  const want = {
    'Didi Vatermann': ['marchandise', 'LavianBrandy'], 'Bill Turner': ['marchandise', 'Bromellite'], 'Broo Tarquin': ['marchandise', 'FujinTea'],
    'The Sarge': ['materiau', 'ShieldPatternAnalysis'], 'Zacariah Nemo': ['marchandise', 'XiheCompanions'], 'Liz Ryder': ['marchandise', 'Landmines'],
    'Hera Tani': ['marchandise', 'KamitraCigars'], 'Felicity Farseer': ['marchandise', 'MetaAlloys'], 'Ram Tah': ['materiau', 'ScanDatabanks'],
    'Lei Cheung': ['marchandise', 'Gold'], 'Petra Olmanova': ['marchandise', 'ProgenitorCells'], 'Colonel Bris Dekker': ['obligations', undefined],
    'Marsha Hicks': ['marchandise', 'Osmium'], 'Elvira Martuuk': ['marchandise', 'SoontillRelics'], 'The Dweller': ['credits', undefined],
    'Marco Qwent': ['marchandise', 'ModularTerminals'], 'Selene Jean': ['marchandise', 'Painite'], 'Professor Palin': ['materiau', 'UnknownEnergySource'],
    'Lori Jameson': ['marchandise', 'KonggaAle'], 'Juri Ishmaak': ['obligations', undefined], "Tod 'The Blaster' McQuinn": ['primes', undefined],
    'Tiana Fortune': ['materiau', 'DecodedEmissionData'], 'Mel Brandon': ['primes', undefined], 'Etienne Dorn': ['marchandise', 'OccupiedCryoPod'],
    'Chloe Sedesi': ['materiau', 'UnknownEnergySource'],
  };
  for (const e of DATA.data.engineers) {
    assert.equal(e.unlock.items.length, 1, e.name);
    const it = e.unlock.items[0];
    assert.deepEqual([it.type, it.symbol], want[e.name], e.name);
  }
  assert.deepEqual(idx.byId.get(id('Juri Ishmaak')).unlock.items[0].credits, [100000, 1000000]);
  assert.deepEqual(idx.byId.get(id('Colonel Bris Dekker')).unlock.items[0].credits, [1000000, 10000000]);
  assert.equal(idx.byId.get(id('Liz Ryder')).unlock.items[0].fr, null);
});

withRef('données de référence : nom, MarketID et SystemAddress égaux à FDevIDs ; chaque nom de coriolis retrouvé (Felicity, Tod)', () => {
  for (const e of DATA.data.engineers) {
    const b = ref.engineerBases.get(e.name);
    assert.ok(b, e.name);
    assert.equal(Number(b.marketId), e.marketId, e.name);
    assert.equal(Number(b.systemAddress), e.systemAddress, e.name);
  }
  for (const [grp, entry] of Object.entries(ref.modMods)) {
    for (const bp of Object.keys(entry.blueprints || {})) {
      for (const g of [1, 2, 3, 4, 5]) for (const n of ref.engineersFor(grp, bp, g)) assert.ok(idx.byName.has(n.toLowerCase().replace(/\s+/g, ' ')), `${grp} ${bp} G${g} : ${n}`);
    }
  }
  // Matériaux de déblocage : le nom anglais mène au même symbole (material.csv)
  for (const e of DATA.data.engineers) {
    for (const it of e.unlock.items.filter((x) => x.type === 'materiau')) assert.equal(ref.materialFromComponent(it.en)?.key, it.symbol.toLowerCase(), e.name);
  }
});

withRef('offres : grade maximal par plan (§ 1.2), plan canonique vérifié (Weapon_Overcharged → MC_Overcharged, jamais un plan d’un autre groupe)', () => {
  const g = (name, grp, bp) => maxGradeOf(ref, idx, id(name), grp, bp);
  assert.deepEqual(['Didi Vatermann', 'Elvira Martuuk', 'Lei Cheung', 'Mel Brandon'].map((n) => g(n, 'sg', 'ShieldGenerator_Reinforced')), [3, 3, 5, 5]);
  assert.deepEqual(['Colonel Bris Dekker', 'Elvira Martuuk', 'Felicity Farseer', 'Professor Palin', 'Chloe Sedesi', 'Mel Brandon'].map((n) => g(n, 'fsd', 'FSD_LongRange')), [3, 5, 5, 3, 3, 5]);
  assert.deepEqual(['Elvira Martuuk', 'Felicity Farseer', 'Professor Palin', 'Mel Brandon', 'Chloe Sedesi'].map((n) => g(n, 't', 'Engine_Dirty')), [2, 3, 5, 5, 5]);
  assert.deepEqual(['Bill Turner', 'Lori Jameson', 'Etienne Dorn'].map((n) => g(n, 'ls', 'LifeSupport_LightWeight')), [3, 4, 5]);
  assert.deepEqual(['Elvira Martuuk', 'Lori Jameson', 'Mel Brandon'].map((n) => g(n, 'scb', 'ShieldCellBank_Specialised')), [1, 3, 4]);
  assert.equal(g("Tod 'The Blaster' McQuinn", 'mc', 'Weapon_Overcharged'), 5);
  assert.equal(canonicalBlueprint(ref, 'mc', 'Weapon_Overcharged'), 'MC_Overcharged');
  assert.equal(canonicalBlueprint(ref, 'fsd', 'Weapon_Efficient'), null, 'blueprintIn rend la clé inchangée : hasOwn la refuse');
  assert.equal(canonicalBlueprint(ref, '__proto__', 'x'), null);
  assert.equal(g('Felicity Farseer', 'fsd', 'Weapon_Efficient'), 0);
  // Cache par ref et par index
  assert.equal(offersIndex(ref, idx), offersIndex(ref, idx));
  assert.ok(offersOf(ref, idx, id('Broo Tarquin')).some((o) => o.grp === 'bl' && o.blueprint === 'Weapon_Efficient' && o.maxGrade === 5));
});

test('régions : Bulle, Colonia, et « autre » rattaché au plus proche avec la phrase', () => {
  const R = DATA.data.meta.regions;
  assert.equal(regionOf([0, 0, 0], R), 'Bulle');
  assert.equal(regionOf([-9530.5, -910.28125, 19808.125], R), 'Colonia');
  assert.equal(regionOf([0, 0, 5000], R), 'autre');
  const r = referenceRegion([0, 0, 5000], R);
  assert.equal(r.region, 'Bulle');
  assert.match(r.note, /^Tu es à 5 000 al de la Bulle et à .+ al de Colonia : je prends la Bulle comme base\.$/);
  assert.deepEqual(referenceRegion([0, 0, 0], R), { region: 'Bulle', note: null });
});

test('reconnaissance : Cinder Dock + SystemAddress → Chloe Sedesi ; normalisation des libellés', () => {
  assert.equal(hostOf({ marketId: 128952752, station: 'Cinder Dock', stationType: 'Coriolis', systemAddress: 594676730147 }, idx)?.name, 'Chloe Sedesi');
  assert.equal(hostOf({ marketId: 128952752, station: 'cinder  dock', stationType: 'CraterPort', systemAddress: 594676730147 }, idx)?.by, 'nom');
  assert.equal(normItem('Nacelle d’évacuation occupée'), 'nacelledevacuationoccupee');
  assert.equal(normItem("Nacelle d'évacuation occupée"), 'nacelledevacuationoccupee');
  assert.equal(normStation('  Trader’s   Rest '), "trader's rest");
  assert.ok(Object.isFrozen(DATA.data.engineers[0].coords), 'données figées');
});

test('copies abîmées refusées, avec leur raison', () => {
  const cases = [
    [(j) => { j.engineers[0].journal = { x: 1 }; }, /clé interdite « journal »/],
    [(j) => { j.engineers[1].marketId = j.engineers[0].marketId; }, /en double/],
    [(j) => { j.engineers[0].region = 'Colonia'; }, /région « Colonia » fausse/],
    [(j) => { j.engineers[0].unlock.items[0] = { ...j.engineers[0].unlock.items[0], symbol: undefined }; }, /sans symbole/],
    [(j) => { j.engineers.find((e) => e.id === 300260).unlock.items[0].qty = 5; }, /primes avec une quantité/],
    [(j) => { j.meta.version = 2; }, /meta\.version/],
    [(j) => { j.engineers.pop(); }, /exactement 25/],
    [(j) => { j.engineers[0].note = 'vu dans les journaux de référence'; }, /texte interdit/],
    [(j) => { j.engineers[0].referral.by = 300000; }, /boucle/],
    [(j) => { j.engineers[0].permit.required = 'oui'; }, /permit\.required/],
  ];
  for (const [mutate, why] of cases) {
    const j = copy();
    mutate(j);
    assert.throws(() => validateEngineerData(j), why);
  }
  // __proto__ (clé propre, comme JSON.parse la crée)
  const j = JSON.parse(JSON.stringify(RAW).replace('"meta":{', '"meta":{"__proto__":{"x":1},'));
  assert.throws(() => validateEngineerData(j), /clé interdite « __proto__ »/);
  // Fichier illisible : la raison, jamais d'exception
  const dir = tempDir();
  try {
    const f = path.join(dir, 'engineers.json');
    fs.writeFileSync(f, '{abîmé');
    const r = loadEngineerData(f);
    assert.equal(r.data, null);
    assert.match(r.error, /JSON illisible/);
    assert.match(loadEngineerData(path.join(dir, 'absent.json')).error, /ENOENT|no such file/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.ok(indexEngineerData(validateEngineerData(copy())).byId.size === 25);
});
