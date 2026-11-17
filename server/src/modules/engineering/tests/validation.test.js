// Plan validé : empreinte, photo des modules visés, changements, validation stricte du fichier.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintOf, snapshot, changesOf, validationState, validateValidatedFile, targetsOf } from '../services/validation.js';

const plan = (modules, extra = {}) => ({ id: 6, name: 'Krait', selected: true, shipId: 12, shipType: 'krait_mkii', modules, ...extra });
const FSD = { slot: 'std-fsd', module: 'int_hyperdrive_size5_class5', blueprint: 'FSD_LongRange', grade: 5, experimental: 'special_fsd_heavy' };
const T = { slot: 'std-t', module: 'int_engine_size6_class5', blueprint: 'Engine_Dirty', grade: 5, experimental: null };
const NONE = { slot: 'std-pp', module: 'int_powerplant_size7_class5', blueprint: null, grade: 0, experimental: null };

test('empreinte : stable ; ni le nom, ni la case du Dashboard, ni l’ordre des modules n’y entrent ; une cible qui change, si', () => {
  const a = fingerprintOf(plan([FSD, T, NONE]));
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(fingerprintOf(plan([T, NONE, FSD], { name: 'Autre', selected: false })), a);
  assert.notEqual(fingerprintOf(plan([{ ...FSD, grade: 4 }, T])), a);
  assert.notEqual(fingerprintOf(plan([{ ...FSD, experimental: 'special_fsd_cooled' }, T])), a);
  assert.notEqual(fingerprintOf(plan([FSD, T], { shipId: 13 })), a);
  assert.deepEqual(targetsOf(plan([T, FSD, NONE])).map((t) => t[0]), ['std-fsd', 'std-t']);
});

test('photo : emplacement du journal, état actuel et auteur de la modification ; sans config connue : current null', () => {
  const slots = [
    { key: 'std-fsd', journalSlot: 'FrameShiftDrive', current: { module: 'int_hyperdrive_size5_class5', blueprint: 'FSD_LongRange', grade: 2, quality: 1, experimental: null } },
    { key: 'std-t', journalSlot: 'MainEngines', current: { module: 'int_engine_size6_class5', blueprint: null, grade: 0, quality: 0, experimental: null } },
  ];
  const loadout = { Modules: [{ Slot: 'FrameShiftDrive', Item: 'int_hyperdrive_size5_class5', Engineering: { EngineerID: 300100, BlueprintName: 'FSD_LongRange', Level: 2, Quality: 1 } }] };
  const s = snapshot(plan([FSD, T]), slots, loadout, '2026-11-09T10:12:00.000Z');
  assert.deepEqual(s.bind, [
    { slot: 'std-fsd', journalSlot: 'FrameShiftDrive', current: { module: 'int_hyperdrive_size5_class5', blueprint: 'FSD_LongRange', grade: 2, quality: 1, experimental: null, engineerId: 300100 } },
    { slot: 'std-t', journalSlot: 'MainEngines', current: { module: 'int_engine_size6_class5', blueprint: null, grade: 0, quality: 0, experimental: null, engineerId: null } },
  ]);
  assert.deepEqual(s.targets, [['std-fsd', FSD.module, 'FSD_LongRange', 5, 'special_fsd_heavy'], ['std-t', T.module, 'Engine_Dirty', 5, null]]);
  const none = snapshot(plan([FSD]), slots, null, '2026-11-09T10:12:00.000Z');
  assert.equal(none.bind[0].current, null);
  // Le fichier relu accepte exactement cette forme
  assert.deepEqual(validateValidatedFile({ version: 1, plans: { 6: s } }).plans['6'], s);
});

test('changements et état : modifié depuis la validation, vaisseau remplacé (R17)', () => {
  const saved = snapshot(plan([FSD, T]), [], null, '2026-11-09T10:12:00.000Z');
  assert.deepEqual(validationState(saved, plan([FSD, T]), { shipKeyNow: 'krait_mkii' }), { at: saved.at, stale: false, changes: [], bound: true, ship: 'ok' });
  const st = validationState(saved, plan([{ ...FSD, grade: 4 }]), { shipKeyNow: 'python_nx' });
  assert.equal(st.stale, true);
  assert.equal(st.ship, 'remplace');
  assert.deepEqual(st.changes, [
    { slot: 'std-fsd', label: 'std-fsd', from: { module: FSD.module, blueprint: 'FSD_LongRange', grade: 5, experimental: 'special_fsd_heavy' }, to: { module: FSD.module, blueprint: 'FSD_LongRange', grade: 4, experimental: 'special_fsd_heavy' } },
    { slot: 'std-t', label: 'std-t', from: { module: T.module, blueprint: 'Engine_Dirty', grade: 5, experimental: null }, to: null },
  ]);
  assert.deepEqual(changesOf(saved, plan([FSD, T])), []);
  assert.equal(validationState(null, plan([FSD])), null);
  assert.equal(validationState(saved, plan([FSD, T], { shipId: null })).bound, false);
  assert.equal(validationState(saved, plan([FSD, T], { shipId: null })).ship, null);
});

test('fichier des plans validés : forme stricte (clés, champs, noms, grades, qualité)', () => {
  const ok = snapshot(plan([FSD]), [], null, '2026-11-09T10:12:00.000Z');
  const bad = [
    { version: 1, plans: { 'x': ok } },
    { version: 1, plans: { '01': ok } },
    { version: 1, plans: { 6: { ...ok, extra: 1 } } },
    { version: 1, plans: { 6: { ...ok, targets: [['std-fsd', FSD.module, 'FSD LongRange', 5, null]] } } },
    { version: 1, plans: { 6: { ...ok, targets: [['std-fsd', FSD.module, 'FSD_LongRange', 6, null]] } } },
    { version: 1, plans: { 6: { ...ok, bind: [{ slot: 'std-fsd', journalSlot: 'FrameShiftDrive', current: { module: 'a', blueprint: null, grade: 1, quality: 2, experimental: null, engineerId: null } }] } } },
    { version: 1, plans: { 6: { ...ok, at: 'hier' } } },
    { version: 1, plans: {}, x: 1 },
    { version: 2, plans: {} },
    JSON.parse('{"version":1,"plans":{"__proto__":{}}}'),
  ];
  for (const b of bad) assert.throws(() => validateValidatedFile(b), JSON.stringify(b).slice(0, 80));
});
