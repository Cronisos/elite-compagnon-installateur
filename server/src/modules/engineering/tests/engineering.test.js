// Tests du module Ingénierie : calcul des matériaux, inventaire, emplacements.
// Les tests marqués « données » utilisent les données de référence téléchargées
// (server/data/reference) et sont ignorés si elles sont absentes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadReference } from '../../../core/reference/refdata.js';
import { remainingSteps, moduleNeeds, planNeeds, sharedStock, engineerStatus } from '../services/calc.js';
import { Inventory, buildInventory, verifyInventory } from '../services/inventory.js';
import { buildFleet, mapLoadout } from '../services/fleet.js';
import { loadEddb, decodeEdsy, extractHash, edsyToTargets, findLoadout, hashEncode, hashEncodeT } from '../../../core/reference/edsy.js';
import { REF_DIR } from '../../../core/reference/download.js';

const ref = loadReference();
const withData = ref ? test : test.skip;
const FSD = 'int_hyperdrive_size5_class5';
const toObj = (m) => Object.fromEntries([...m].sort());

test('étapes : module vierge → G1 à G5', () => {
  assert.deepEqual(remainingSteps({ module: FSD, blueprint: 'FSD_LongRange', grade: 5 }, null).grades, [1, 2, 3, 4, 5]);
});

test('étapes : déjà en G3 de la bonne modification → seulement G4 et G5', () => {
  const cur = { module: FSD, blueprint: 'FSD_LongRange', grade: 3, quality: 1 };
  assert.deepEqual(remainingSteps({ module: FSD, blueprint: 'FSD_LongRange', grade: 5 }, cur).grades, [4, 5]);
  // Qualité 0 sur un grade posé : ingénierie ancienne, comptée comme finie (comme avant)
  assert.deepEqual(remainingSteps({ module: FSD, blueprint: 'FSD_LongRange', grade: 5 }, { ...cur, quality: 0 }).grades, [4, 5]);
});

test('étapes : G3 commencé (40 %) → on finit le G3 avant le G4 (grade suivant seulement à 100 %, mesuré)', () => {
  const cur = { module: FSD, blueprint: 'FSD_LongRange', grade: 3, quality: 0.4 };
  const r = remainingSteps({ module: FSD, blueprint: 'FSD_LongRange', grade: 5 }, cur);
  assert.deepEqual(r.grades, [3, 4, 5]);
  assert.equal(r.startQuality, 0.4);
  // Visé au même grade : il reste à le finir
  assert.deepEqual(remainingSteps({ module: FSD, blueprint: 'FSD_LongRange', grade: 3 }, cur).grades, [3]);
  // 99 % compte comme fini (un passage au grade suivant mesuré à 99 %)
  assert.equal(remainingSteps({ module: FSD, blueprint: 'FSD_LongRange', grade: 3 }, { ...cur, quality: 0.99 }).done, true);
});

test('étapes : autre modification ou autre module → on repart de G1, expérimental perdu', () => {
  const cur = { module: FSD, blueprint: 'FSD_FastBoot', grade: 5, experimental: 'special_fsd_heavy' };
  const r = remainingSteps({ module: FSD, blueprint: 'FSD_LongRange', grade: 5, experimental: 'special_fsd_heavy' }, cur);
  assert.deepEqual(r.grades, [1, 2, 3, 4, 5]);
  assert.equal(r.experimental, true);
  const r2 = remainingSteps({ module: 'int_hyperdrive_size6_class5', blueprint: 'FSD_LongRange', grade: 2 }, { ...cur, blueprint: 'FSD_LongRange' });
  assert.deepEqual(r2.grades, [1, 2]);
});

test('étapes : grade atteint et expérimental posé → terminé (casse ignorée)', () => {
  const cur = { module: FSD, blueprint: 'fsd_longrange', grade: 5, experimental: 'special_fsd_heavy' };
  assert.equal(remainingSteps({ module: FSD, blueprint: 'FSD_LongRange', grade: 5, experimental: 'special_fsd_heavy' }, cur).done, true);
  assert.equal(remainingSteps({ module: FSD, blueprint: null, grade: 0 }, null).done, true);
});

withData('données : FSD G5 Portée augmentée de zéro (rang 5) donne la bonne liste', () => {
  const n = moduleNeeds(ref, { module: FSD, blueprint: 'FSD_LongRange', grade: 5 }, null, 'fsd');
  // G1×1 + G2×2 + G3×3 + G4×4 + G5×5 applications
  assert.deepEqual(toObj(n.materials), {
    arsenic: 5,
    chemicaldistillery: 4,
    chemicalmanipulators: 5,
    chemicalprocessors: 5, // 2 (G2) + 3 (G3)
    dataminedwake: 5,
    disruptedwakeechoes: 3, // 1 (G1) + 2 (G2)
    hyperspacetrajectories: 4,
    manganese: 4,
    phosphorus: 3,
    wakesolutions: 3,
  });
  assert.equal(n.rolls, 15);
  assert.ok(n.steps[4].engineers.includes('Felicity Farseer'));
});

withData('données : depuis G3, seuls G4 et G5 sont comptés ; expérimental ajouté', () => {
  const cur = { module: FSD, blueprint: 'FSD_LongRange', grade: 3 };
  const n = moduleNeeds(ref, { module: FSD, blueprint: 'FSD_LongRange', grade: 5, experimental: 'special_fsd_heavy' }, cur, 'fsd');
  assert.equal(n.materials.get('manganese'), 4);
  assert.equal(n.materials.get('arsenic'), 5);
  assert.equal(n.materials.get('phosphorus'), undefined);
  assert.ok(n.steps.some((s) => s.experimental === 'special_fsd_heavy'));
  assert.ok(n.materials.size > 6, 'matériaux de l’effet expérimental inclus');
});

withData('données : Anaconda, emplacements aux bonnes tailles', () => {
  const s = ref.shipSlots('anaconda');
  const sizes = (g) => s.filter((x) => x.group === g).map((x) => x.size);
  assert.deepEqual(s.filter((x) => x.group === 'standard' && x.size != null).map((x) => x.size), [8, 7, 6, 5, 8, 8, 5]);
  assert.deepEqual(sizes('hardpoint'), [4, 3, 3, 3, 2, 2, 1, 1]);
  assert.equal(sizes('utility').length, 8);
  assert.deepEqual(sizes('internal'), [7, 6, 6, 6, 5, 5, 5, 5, 4, 4, 4, 2, 1, 1]);
  assert.equal(s.find((x) => x.restriction === 'Military').size, 5);
});

withData('données : association du Loadout malgré les trous de numérotation (Slot08 puis Slot13)', () => {
  const lo = {
    Modules: [
      { Slot: 'FrameShiftDrive', Item: 'int_hyperdrive_size6_class5', Engineering: { BlueprintName: 'FSD_LongRange', Level: 3, Quality: 0.5 } },
      { Slot: 'HugeHardpoint1', Item: 'hpt_pulselaser_gimbal_huge' },
      { Slot: 'TinyHardpoint3', Item: 'hpt_shieldbooster_size0_class5' },
      { Slot: 'Slot01_Size7', Item: 'int_cargorack_size7_class1' },
      { Slot: 'Slot08_Size4', Item: 'int_cargorack_size4_class1' },
      { Slot: 'Slot13_Size2', Item: 'int_dockingcomputer_advanced' },
      { Slot: 'Slot14_Size1', Item: 'int_supercruiseassist' },
      { Slot: 'PaintJob', Item: 'paintjob_x' },
    ],
  };
  const slots = mapLoadout(ref, 'anaconda', lo);
  const at = (k) => slots.find((s) => s.key === k);
  assert.equal(at('std-fsd').current.grade, 3);
  assert.equal(at('hp-0').current.module, 'hpt_pulselaser_gimbal_huge');
  assert.equal(slots.filter((s) => s.group === 'utility')[2].current.module, 'hpt_shieldbooster_size0_class5');
  const internal = slots.filter((s) => s.group === 'internal');
  assert.equal(internal.find((s) => s.current?.module === 'int_cargorack_size4_class1').size, 4);
  assert.equal(internal.find((s) => s.current?.module === 'int_dockingcomputer_advanced').size, 2);
  assert.equal(internal.find((s) => s.current?.module === 'int_supercruiseassist').size, 1);
  assert.equal(slots.filter((s) => s.key.startsWith('j-')).length, 0, 'aucun module orphelin');
});

test('inventaire : état complet puis ajouts et retraits', () => {
  const inv = buildInventory([
    { timestamp: 't0', event: 'Materials', Raw: [{ Name: 'arsenic', Count: 10 }], Manufactured: [{ Name: 'chemicalprocessors', Name_Localised: 'Processeurs chimiques', Count: 5 }], Encoded: [] },
    { timestamp: 't1', event: 'MaterialCollected', Category: 'Raw', Name: 'arsenic', Count: 3 },
    { timestamp: 't2', event: 'EngineerCraft', Ingredients: [{ Name: 'arsenic', Count: 1 }, { Name: 'chemicalprocessors', Count: 2 }] },
    { timestamp: 't3', event: 'MaterialTrade', Paid: { Material: 'arsenic', Quantity: 6 }, Received: { Material: 'tin', Category: 'Raw', Quantity: 1 } },
    { timestamp: 't4', event: 'MissionCompleted', MaterialsReward: [{ Name: 'tin', Category: 'Raw', Count: 2 }] },
    { timestamp: 't5', event: 'MaterialDiscarded', Name: 'chemicalprocessors', Count: 10 },
  ]);
  assert.equal(inv.count('arsenic'), 6);
  assert.equal(inv.count('tin'), 3);
  assert.equal(inv.count('chemicalprocessors'), 0, 'jamais négatif');
  assert.equal(inv.items.get('chemicalprocessors').label, 'Processeurs chimiques');
});

test('inventaire : contrôle par rapport au « Materials » suivant', () => {
  const r = verifyInventory([
    { timestamp: 't0', event: 'Materials', Raw: [{ Name: 'iron', Count: 10 }] },
    { timestamp: 't1', event: 'MaterialCollected', Category: 'Raw', Name: 'iron', Count: 2 },
    { timestamp: 't2', event: 'Materials', Raw: [{ Name: 'iron', Count: 12 }] },
  ]);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].diffs, []);
});

test('flotte : vaisseaux, vente, rangs des ingénieurs', () => {
  const f = buildFleet([
    { event: 'StoredShips', ShipsHere: [{ ShipID: 1, ShipType: 'Anaconda', Name: 'A' }], ShipsRemote: [{ ShipID: 2, ShipType: 'cutter', StarSystem: 'Sol' }] },
    { event: 'Loadout', ShipID: 3, Ship: 'panthermkii', ShipName: ' ', Modules: [], timestamp: 't' },
    { event: 'ShipyardSell', SellShipID: 2 },
    { event: 'EngineerProgress', Engineers: [{ Engineer: 'Felicity Farseer', EngineerID: 300100, Progress: 'Unlocked', Rank: 5 }] },
    { event: 'EngineerProgress', Engineer: 'Elvira Martuuk', EngineerID: 300160, Progress: 'Invited' },
  ]);
  assert.deepEqual([...f.ships.keys()].sort(), [1, 3]);
  assert.equal(f.currentShipId, 3);
  assert.equal(f.engineers.get('Felicity Farseer').rank, 5);
  const st = engineerStatus(['Felicity Farseer', 'Elvira Martuuk'], 5, f.engineers);
  assert.equal(st.best.name, 'Felicity Farseer');
  assert.equal(st.estimate, false);
  assert.equal(engineerStatus(['Elvira Martuuk'], 3, f.engineers).available, false);
});

test('flotte : une modification est reportée sur le module, sans attendre le prochain Loadout', () => {
  const module = { Slot: 'HugeHardpoint1', Item: 'Hpt_MultiCannon_Gimbal_Huge' };
  const loadout = { event: 'Loadout', ShipID: 3, Ship: 'corvette', Modules: [module, { Slot: 'Radar', Item: 'int_sensors_size8_class5' }] };
  const craft = {
    event: 'EngineerCraft', Slot: 'HugeHardpoint1', Module: 'hpt_multicannon_gimbal_huge', Engineer: 'Tod McQuinn',
    BlueprintName: 'Weapon_Overcharged', Level: 5, Quality: 1, ExperimentalEffect: 'special_auto_loader',
  };
  const events = [loadout, craft];
  const crafted = () => buildFleet(events).ships.get(3).loadout.Modules[0].Engineering;
  assert.equal(crafted().Level, 5);
  assert.equal(crafted().ExperimentalEffect, 'special_auto_loader');
  assert.equal(module.Engineering, undefined, 'le Loadout enregistré reste intact pour les recalculs');
  const needs = remainingSteps({ module: 'hpt_multicannon_gimbal_huge', blueprint: 'MC_Overcharged', grade: 5, experimental: 'special_auto_loader' }, { module: 'hpt_multicannon_gimbal_huge', blueprint: crafted().BlueprintName, grade: crafted().Level, experimental: crafted().ExperimentalEffect });
  assert.equal(needs.done, true);

  const swapped = buildFleet([loadout, { ...craft, Module: 'hpt_autre' }]);
  assert.equal(swapped.ships.get(3).loadout.Modules[0].Engineering, undefined, 'module différent : on attend le Loadout');
  const fresh = { ...loadout, Modules: [{ ...module, Engineering: { Level: 1 } }] };
  assert.equal(buildFleet([loadout, craft, fresh]).ships.get(3).loadout.Modules[0].Engineering.Level, 1, 'le Loadout suivant fait foi');
  assert.doesNotThrow(() => buildFleet([craft]));
});

// --- Import EDSY ---
// Lien écrit à la main au format v20 des liens edsy.org (décrit dans core/reference/edsyLink.js), avec les identifiants d'eddb.js :
// Anaconda (#6), blindage composite militaire (#40113), FSD 6A (#43610) en Portée augmentée G5
// + Gestionnaire de masse, soute 4E (#450) au 8e emplacement interne, nom « Anaconda test é ».
const eddb = ref ? loadEddb(REF_DIR) : null;
const withEdsy = eddb ? test : test.skip;
function sampleHash() {
  const e = hashEncode;
  const slot = (modid, eng) => e(modid, 3) + e(eng ? 0x10 : 0, 1) + e(0, 1) + (eng ? e(eng, 2) + e(4000, 2) + e(0, 1) : '');
  const fsdEng = (2 << 7) | (5 << 4) | 3; // 2e modification (cfsd_ir), grade 5, 3e effet (cfsdx_mm)
  const ship = e(6, 1) + e(0, 1) + e(0, 1) + e(0, 2) + e(0, 1) + e(0x444, 2);
  const component = slot(40113) + e(199900 + 2, 3) + slot(43610, fsdEng);
  const internal = e(199900 + 7, 3) + slot(450);
  return e(20, 1) + [ship, '', '', component, '', internal, hashEncodeT('Anaconda test é')].join(',');
}

withEdsy('EDSY : décodage d’un lien v20 (vaisseau, modules, modification, grade, effet, nom)', () => {
  const url = `https://edsy.org/#/L=${encodeURIComponent(sampleHash())}`;
  const d = decodeEdsy(eddb, extractHash(url));
  assert.equal(d.version, 20);
  assert.equal(d.shipFdname, 'Anaconda');
  assert.equal(d.name, 'Anaconda test é');
  const fsd = d.slots.find((s) => s.group === 'component' && s.index === 3);
  assert.deepEqual([fsd.symbol, fsd.blueprint, fsd.grade, fsd.experimental], ['int_hyperdrive_size6_class5', 'FSD_LongRange', 5, 'special_fsd_heavy']);
  const cargo = d.slots.find((s) => s.group === 'internal');
  assert.deepEqual([cargo.index, cargo.size, cargo.symbol], [7, 4, 'int_cargorack_size4_class1']);
});

withEdsy('EDSY : association aux emplacements du vaisseau', () => {
  const d = decodeEdsy(eddb, sampleHash());
  const { targets, warnings } = edsyToTargets(ref, ref.shipKey(d.shipFdname), d);
  assert.deepEqual(warnings, []);
  assert.equal(targets.get('std-bh').module, 'anaconda_armour_grade3');
  assert.deepEqual(targets.get('std-fsd'), { module: 'int_hyperdrive_size6_class5', blueprint: 'FSD_LongRange', grade: 5, experimental: 'special_fsd_heavy' });
  const slots = ref.shipSlots('anaconda');
  const cargoKey = [...targets.keys()].find((k) => targets.get(k).module === 'int_cargorack_size4_class1');
  assert.equal(slots.find((s) => s.key === cargoKey).size, 4);
});

withEdsy('EDSY : la modification et l’effet d’un blindage sont conservés', () => {
  const hash = 'Kz00000O6C0S00,,,9onG05I_W0,,,';
  const armour = decodeEdsy(eddb, hash).slots.find((s) => s.group === 'component' && s.index === 0);
  assert.equal(armour.symbol, 'federation_corvette_armour_grade3');
  assert.ok(armour.blueprint, 'le blindage doit garder sa modification');
  assert.equal(armour.grade, 5);
});

withEdsy('EDSY : une modification nommée autrement dans son groupe garde ses ingénieurs', () => {
  assert.equal(ref.blueprintIn('mc', 'Weapon_Overcharged'), 'MC_Overcharged');
  assert.equal(ref.blueprintIn('ls', 'Misc_LightWeight'), 'LifeSupport_LightWeight');
  assert.equal(ref.blueprintIn('bl', 'Weapon_Efficient'), 'Weapon_Efficient');
  assert.ok(ref.engineersFor('mc', 'Weapon_Overcharged', 5).length > 0);
  // Déjà appliquée au grade visé, sous le nom du journal : rien à refaire
  const target = { module: 'x', blueprint: 'MC_Overcharged', grade: 5, experimental: null };
  assert.equal(remainingSteps(target, { module: 'x', blueprint: 'Weapon_Overcharged', grade: 5 }).done, true);
});

withEdsy('EDSY : lien trop ancien refusé avec un message clair', () => {
  assert.throws(() => decodeEdsy(eddb, `${hashEncode(12, 1)}6,,`), /trop ancien/);
});

test('import JSON : on retrouve la config dans un export au format Loadout', () => {
  const lo = findLoadout([{ header: {}, data: { event: 'Loadout', Ship: 'anaconda', Modules: [{ Slot: 'Armour', Item: 'x' }] } }]);
  assert.equal(lo.Ship, 'anaconda');
  assert.equal(findLoadout({ foo: 1 }), null);
});

withData('stock commun : un matériau partagé par deux plans n’est compté qu’une fois', () => {
  const inv = new Inventory();
  inv.add('arsenic', 6);
  const plans = [
    { id: 1, name: 'A', needs: new Map([['arsenic', 5]]) },
    { id: 2, name: 'B', needs: new Map([['arsenic', 5]]) },
  ];
  const s = sharedStock(ref, plans, inv);
  const row = s.global.materials.find((m) => m.key === 'arsenic');
  assert.deepEqual([row.need, row.owned, row.missing], [10, 6, 4]);
  assert.equal(s.perPlan[0].canFinishNow, true, 'chaque plan seul est faisable avec le stock');
});

withData('bilan d’un plan : nécessaire, possédé, manquant', () => {
  const inv = new Inventory();
  inv.add('arsenic', 2);
  inv.add('manganese', 10);
  const r = planNeeds(ref, {
    modules: [{ slot: 'std-fsd', label: 'FSD', grp: 'fsd', target: { module: FSD, blueprint: 'FSD_LongRange', grade: 5 }, current: { module: FSD, blueprint: 'FSD_LongRange', grade: 3 } }],
    inventory: inv,
    engineers: new Map([['Felicity Farseer', { progress: 'Unlocked', rank: 5 }]]),
  });
  const ars = r.materials.find((m) => m.key === 'arsenic');
  assert.deepEqual([ars.need, ars.owned, ars.missing], [5, 2, 3]);
  assert.equal(r.materials.find((m) => m.key === 'manganese').missing, 0);
  assert.equal(r.modules[0].estimate, false);
});
