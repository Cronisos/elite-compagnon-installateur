// Tests de l'alerte du vaisseau (vaisseau.js) : coque en direct, modules au dernier relevé, réparations, seuil.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EtatVaisseau, nomModule, seuilValide } from './vaisseau.js';
import { buildCombat } from './state.js';

const T = (sec) => new Date(Date.UTC(2026, 10, 11, 15, 0, sec)).toISOString();
const loadout = (sec, modules, hull = 1) => ({
  event: 'Loadout', timestamp: T(sec), Ship: 'federation_corvette', ShipName: 'Test', HullHealth: hull,
  Modules: [
    { Slot: 'Armour', Item: 'Federation_Corvette_Armour_Grade3', Health: 1 },
    { Slot: 'PaintJob', Item: 'paintjob_x', Health: 0.1 },
    { Slot: 'Decal1', Item: 'decal_combat_master', Health: 0.1 },
    { Slot: 'VesselVoice', Item: 'voicepack_verity', Health: 0.1 },
    ...modules,
  ],
});

test('noms des modules : emplacements principaux, familles, armes avec leur point d’emport', () => {
  assert.equal(nomModule('FrameShiftDrive', 'int_hyperdrive_overcharge_size7_class5'), 'FSD');
  assert.equal(nomModule('MainEngines', 'int_engine_size7_class5'), 'Propulseurs');
  assert.equal(nomModule('Slot01_Size7', 'int_shieldgenerator_size7_class5'), 'Générateur de boucliers');
  assert.equal(nomModule('HugeHardpoint1', 'hpt_multicannon_gimbal_huge'), 'Multicanon · énorme 1');
  assert.equal(nomModule('TinyHardpoint2', 'Hpt_ShieldBooster_Size0_Class5'), 'Survolteur de bouclier · utilitaire 2');
  assert.equal(nomModule('Slot09_Size1', 'int_inconnu_size1'), 'Slot09_Size1');
  assert.equal(nomModule('Cargo01', 'int_largecargorack_size8_class1'), 'Soute');
});

test('modules au dernier relevé : sous le seuil, du plus abîmé au moins ; apparence et blindage ignorés', () => {
  const v = new EtatVaisseau();
  v.apply(loadout(0, [
    { Slot: 'FrameShiftDrive', Item: 'int_hyperdrive_size7_class5', Health: 0.32 },
    { Slot: 'MainEngines', Item: 'int_engine_size7_class5', Health: 0.385 },
    { Slot: 'PowerPlant', Item: 'int_powerplant_size7_class5', Health: 0.9 },
  ], 0.95));
  const vue = v.vue(40);
  assert.deepEqual(vue.sousSeuil, [{ nom: 'FSD', sante: 32 }, { nom: 'Propulseurs', sante: 38 }]);
  assert.equal(vue.modules.length, 3);
  assert.equal(vue.coque, 95);
  assert.equal(vue.coqueBasse, false);
  assert.equal(vue.alerte, true);
  assert.equal(vue.releveAt, T(0));
  assert.equal(v.vue(30).alerte, false);
});

test('coque en direct (HullDamage de ton vaisseau, pas du chasseur), boucliers', () => {
  const v = new EtatVaisseau();
  v.apply(loadout(0, []));
  v.apply({ event: 'ShieldState', timestamp: T(5), ShieldsUp: false });
  v.apply({ event: 'HullDamage', timestamp: T(10), Health: 0.598, PlayerPilot: true, Fighter: false });
  assert.equal(v.apply({ event: 'HullDamage', timestamp: T(11), Health: 0.2, PlayerPilot: false, Fighter: true }), false);
  let vue = v.vue(40);
  assert.equal(vue.coque, 59);
  assert.equal(vue.coqueDirect, true);
  assert.equal(vue.boucliers, false);
  assert.equal(vue.alerte, false);
  v.apply({ event: 'HullDamage', timestamp: T(20), Health: 0.3866, PlayerPilot: true, Fighter: false });
  vue = v.vue(40);
  assert.equal(vue.coque, 38);
  assert.equal(vue.coqueBasse, true);
  assert.equal(vue.alerte, true);
});

test('réparations : tout à quai, une pièce, l’AFMU', () => {
  const v = new EtatVaisseau();
  v.apply(loadout(0, [
    { Slot: 'FrameShiftDrive', Item: 'int_hyperdrive_size7_class5', Health: 0.3 },
    { Slot: 'MainEngines', Item: 'int_engine_size7_class5', Health: 0.2 },
  ], 0.5));
  v.apply({ event: 'AfmuRepairs', timestamp: T(5), Module: '$int_hyperdrive_size7_class5_name;', Health: 0.8, FullyRepaired: false });
  assert.deepEqual(v.vue(40).sousSeuil, [{ nom: 'Propulseurs', sante: 20 }]);
  v.apply({ event: 'Repair', timestamp: T(10), Item: 'int_engine_size7_class5', Cost: 100 });
  assert.deepEqual(v.vue(40).sousSeuil, []);
  assert.equal(v.vue(40).coque, 50);
  v.apply({ event: 'Repair', timestamp: T(15), Items: ['Hull'], Cost: 100 });
  assert.equal(v.vue(40).coque, 100);
  v.apply({ event: 'HullDamage', timestamp: T(20), Health: 0.2, PlayerPilot: true });
  v.apply({ event: 'RepairAll', timestamp: T(30), Cost: 1000 });
  assert.equal(v.vue(40).coque, 100);
  assert.equal(v.vue(40).alerte, false);
});

test('session de combat : l’état du vaisseau survit à la remise à zéro et au lancement du jeu', () => {
  const c = buildCombat([
    loadout(0, [{ Slot: 'FrameShiftDrive', Item: 'int_hyperdrive_size7_class5', Health: 0.3 }]),
    { event: 'LoadGame', timestamp: T(5) },
  ]);
  c.reset(T(6));
  assert.deepEqual(c.vaisseau.vue(40).sousSeuil, [{ nom: 'FSD', sante: 30 }]);
  assert.equal(c.summary().kills, 0);
});

test('seuil : entier de 5 à 95 %', () => {
  assert.equal(seuilValide(40), 40);
  assert.equal(seuilValide('40'), 40);
  assert.equal(seuilValide(4), null);
  assert.equal(seuilValide(96), null);
  assert.equal(seuilValide(40.5), null);
  assert.equal(seuilValide('abc'), null);
});
