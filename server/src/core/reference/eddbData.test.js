// Tests du chargement d'eddb.js : lu comme une donnée (jamais exécuté), fichiers piégés refusés, et garde-fou
// contre le retour d'une exécution de code dans les modules qui lisent les données d'EDSY.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEddb, moduleOf, fdnameIndex, hullModuleIndex } from './eddbData.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eddb-test-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** Dossier de référence temporaire contenant edsy/eddb.js avec ce texte. */
function refDirWith(text) {
  const dir = fs.mkdtempSync(path.join(tmp, 'ref-'));
  fs.mkdirSync(path.join(dir, 'edsy'));
  fs.writeFileSync(path.join(dir, 'edsy', 'eddb.js'), text);
  return dir;
}

const MINIMAL = `'use strict';
var eddb = {
  version: 1,
  ship: { 6: { fdname: 'Anaconda', name: 'Anaconda', mass: 400, module: { 40113: { fdname: 'Anaconda_Armour_Grade3', mass: 30, cost: 1 } } } },
  module: {
    40113: { mtype: 'cbh', name: 'Military Grade Composite', class: 1, rating: 'I', kinres: -20, mass: 0 },
    450: { mtype: 'icr', name: 'Cargo Rack', fdname: 'Int_CargoRack_Size4_Class1', cargocap: 16 },
    451: { mtype: 'icr', name: 'Cargo Rack', fdname: 'int_cargorack_size4_class1', cargocap: 17 },
  },
  mtype: { cbh: { blueprints: ['cbh_hd'] }, icr: {} },
  blueprint: { cbh_hd: { fdname: 'Armour_HeavyDuty' } },
  expeffect: { cbhx_dp: { fdname: 'special_armour_chunky' } },
  attributes: {},
  group: {},
};
`;

test('eddb.js absent : null', () => {
  assert.equal(loadEddb(path.join(tmp, 'nulle-part')), null);
});

test('eddb.js valide : tables lues, valeurs spéciales comprises', () => {
  const eddb = loadEddb(refDirWith(`${String.fromCharCode(0xfeff)}/* licence */\n${MINIMAL}`));
  assert.equal(eddb.version, 1);
  assert.equal(eddb.module[450].cargocap, 16);
  assert.deepEqual(eddb.mtype.cbh.blueprints, ['cbh_hd']);
});

test('eddb.js piégé : refusé, rien n\'est exécuté', () => {
  globalThis.__eddbTrap = false;
  const traps = [
    `${MINIMAL}globalThis.__eddbTrap = true;`,
    `globalThis.__eddbTrap = true;\n${MINIMAL}`,
    "var eddb = (globalThis.__eddbTrap = true, { ship: {}, module: {}, mtype: {} });",
    "var eddb = { ship: {}, module: {}, mtype: {}, x: (() => { globalThis.__eddbTrap = true })() };",
    "var eddb = { ship: {}, module: {}, mtype: {}, x: require('child_process').execSync('calc') };",
    'var eddb = { ship: {}, module: {}, mtype: {}, get x() { globalThis.__eddbTrap = true; return 1 } };',
    'var eddb = { ship: {}, module: {}, mtype: {}, __proto__: { polluted: true } };',
    'while (true) {}',
  ];
  for (const t of traps) assert.throws(() => loadEddb(refDirWith(t)), /eddb\.js illisible/, t);
  assert.equal(globalThis.__eddbTrap, false);
  assert.equal({}.polluted, undefined);
  delete globalThis.__eddbTrap;
});

test('eddb.js sans les tables attendues : erreur claire', () => {
  assert.throws(() => loadEddb(refDirWith('var eddb = { ship: {} };')), /incomplet.*module, mtype/);
  assert.throws(() => loadEddb(refDirWith('var eddb = 42;')), /incomplet/);
  assert.throws(() => loadEddb(refDirWith('var eddb = { ship: {}, module: {}, mtype: {}, blueprint: {}, expeffect: {}, group: {} };')), /incomplet.*attributes/);
});

test('fiche d\'un module sur une coque : la fiche propre au vaisseau l\'emporte', () => {
  const eddb = loadEddb(refDirWith(MINIMAL));
  const ship = eddb.ship[6];
  const armour = moduleOf(eddb, ship, 40113);
  assert.deepEqual([armour.mtype, armour.name, armour.fdname, armour.mass, armour.kinres], ['cbh', 'Military Grade Composite', 'Anaconda_Armour_Grade3', 30, -20]);
  assert.equal(moduleOf(eddb, null, 40113).mass, 0);
  assert.equal(moduleOf(eddb, ship, 99999), null);
  // Index par nom Frontier, insensible à la casse ; à nom égal, la dernière entrée l'emporte
  assert.equal(fdnameIndex(eddb).modules.get('int_cargorack_size4_class1'), 451);
  assert.equal(fdnameIndex(eddb).blueprints.get('armour_heavyduty'), 'cbh_hd');
  assert.equal(fdnameIndex(eddb).effects.get('special_armour_chunky'), 'cbhx_dp');
  assert.equal(hullModuleIndex(ship).get('anaconda_armour_grade3'), 40113);
});

test('garde-fou : aucune exécution de code dans la lecture des données d\'EDSY', () => {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const files = ['jsLiteral.js', 'eddbData.js', 'edsy.js', 'edsyLink.js', 'edsyBuild.js'].map((f) => path.join(here, f));
  files.push(path.join(here, '..', '..', 'modules', 'builder', 'stats.js'), path.join(here, '..', '..', 'modules', 'builder', 'attributes.js'), path.join(here, '..', '..', 'modules', 'builder', 'formulas.js'));
  for (const file of files) {
    // Commentaires retirés : seul le code compte
    const code = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of [/node:vm|from 'vm'/, /\beval\s*\(/, /new\s+Function\b/, /\bimport\s*\(/, /child_process/]) {
      assert.doesNotMatch(code, forbidden, `${path.basename(file)} : ${forbidden}`);
    }
  }
});
