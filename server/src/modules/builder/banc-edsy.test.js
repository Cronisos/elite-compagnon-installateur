// Corrections du banc EDSY du 15 nov. 2026 (245 builds de l'app comparés à edsy.org) : chaque défaut trouvé par le
// banc a ici son test. Valeurs attendues : celles d'edsy.org (fixtures/banc-edsy.json), ou la règle d'EDSY reprise.
//   familles 4 et 8 : import d'un Loadout (plans des scanners utilitaires, Exposing Seeker sans nom Frontier) ;
//   familles 2, 3, 5, 9 : soutenabilité WEP, autonomie des munitions (condensateur vide, chargeur sans réserve,
//                         Balle à plasma rechargée sur le carburant) ;
//   famille 6 : rotation avec la réserve de carburant ; famille 7 : renforts de modules cumulés ;
//   famille 1 : portée des capteurs ; famille 12 : chargeur arrondi ; famille 10 : grade borné à la lecture ;
//   sondes P1 à P4 : stabilisateur d'armes expérimentales, effets interdits, effet sans plan, modules cachés.
// Nécessite les données de référence (sinon ignorés), sauf les tests sur tables fictives.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { REF_DIR } from '../../core/reference/download.js';
import { loadEddb, blueprintFor, effectFor } from '../../core/reference/eddbData.js';
import { boundBuild, boundGrade, decodedToBuild, loadoutToBuild, maxCoreBuild, moduleAllowed, moduleOf } from '../../core/reference/edsyBuild.js';
import { decodeEdsy, extractHash } from '../../core/reference/edsy.js';
import { computeStats } from './stats.js';
import { fitModule } from './attributes.js';
import { depassements } from './limites.js';
import builder from './index.js';

const present = fs.existsSync(`${REF_DIR}/edsy/eddb.js`) && fs.existsSync(`${REF_DIR}/meta.json`);
const eddb = present ? loadEddb(REF_DIR) : null;
const withEdsy = eddb ? test : test.skip;
const banc = JSON.parse(fs.readFileSync(new URL('./fixtures/banc-edsy.json', import.meta.url), 'utf8'));
const bancBuild = (id) => banc.builds.find((b) => b.id === id);
const near = (got, want, tol = 1e-6) => Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));

const PYTHON = 5;
const CUTTER = 62;
const ANACONDA = 6;
const STABILISER_3F = 13360;
const STABILISER_5F = 13560;

/** Premier emplacement du groupe où le module peut aller (et pas déjà pris), sinon -1. */
function freeSlot(build, group, modid) {
  return (build.slots[group] || []).findIndex((s, i) => !s?.modid && moduleAllowed(eddb, build.shipId, group, i, modid));
}

/** Vaisseau aux modules de base au maximum, armé d'autant d'armes expérimentales (limit 'hex') que demandé. */
function withExperimental(shipId, count, stabiliser = null) {
  const build = maxCoreBuild(eddb, shipId);
  build.slots.hardpoint = build.slots.hardpoint.map(() => null);
  build.slots.internal = build.slots.internal.map(() => null);
  const hex = Object.keys(eddb.module).map(Number).filter((id) => eddb.module[id].limit === 'hex');
  for (let i = 0, placed = 0; i < build.slots.hardpoint.length && placed < count; i++) {
    const modid = hex.find((id) => moduleAllowed(eddb, shipId, 'hardpoint', i, id));
    if (modid) {
      build.slots.hardpoint[i] = { modid, bpid: null, grade: 0, expid: null };
      placed++;
    }
  }
  if (stabiliser) {
    const i = freeSlot(build, 'internal', stabiliser);
    assert.ok(i >= 0, 'emplacement pour le stabilisateur');
    build.slots.internal[i] = { modid: stabiliser, bpid: null, grade: 0, expid: null };
  }
  return build;
}

// --- Branchement réel du module (routes), journal et base simulés ---

function setup({ loadouts = [] } = {}) {
  const journal = new EventEmitter();
  journal.addInterest = () => {};
  const game = new EventEmitter();
  game.snapshot = () => ({ system: null });
  const rows = [];
  const prisma = {
    build: {
      findMany: async () => rows,
      findUnique: async ({ where }) => rows.find((r) => r.id === where.id) || null,
      create: async ({ data }) => {
        const r = { id: rows.length + 1, createdAt: new Date(), updatedAt: new Date(), notes: '', ...data };
        rows.push(r);
        return r;
      },
    },
    shipNickname: { findMany: async () => [] },
  };
  const routes = new Map();
  const router = new Proxy({}, { get: (_, method) => (path, fn) => routes.set(`${method} ${path}`, fn) });
  builder.register({ router, prisma, journal, game });
  journal.emit('ready', { history: loadouts });
  const call = (method, path, req = {}) => new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json: resolve };
    routes.get(`${method} ${path}`)({ params: {}, body: {}, ...req }, res, reject);
  });
  return { call, rows };
}

// --- Familles 4 et 8 : import d'un Loadout ---

withEdsy('famille 4 : plan Sensor_LongRange / Sensor_WideAngle résolu par le type du module (capteurs ou scanner)', () => {
  const sheet = (modid) => moduleOf(eddb, null, modid);
  assert.equal(blueprintFor(eddb, sheet(46110), 'Sensor_LongRange'), 'cs_lr'); // capteurs
  for (const scanner of [56010, 57010, 55010]) { // scanner de sillage FSD, de mandat, de cargaison
    assert.equal(blueprintFor(eddb, sheet(scanner), 'Sensor_LongRange'), 'scan_lr', String(scanner));
    assert.equal(blueprintFor(eddb, sheet(scanner), 'sensor_wideangle'), 'scan_wa', String(scanner));
  }
  assert.equal(blueprintFor(eddb, sheet(46110), 'Sensor_WideAngle'), 'cs_wa');
  assert.equal(blueprintFor(eddb, sheet(46110), 'Weapon_Overcharged'), null); // nom connu, mais pas pour ce type
  assert.equal(effectFor(eddb, sheet(46110), 'special_auto_loader'), null);
});

withEdsy('famille 4 : Loadout avec un scanner de sillage Longue portée G5 et un scanner de mandat Grand angle', () => {
  const { build, warnings } = loadoutToBuild(eddb, {
    Ship: 'sidewinder',
    Modules: [
      { Slot: 'TinyHardpoint1', Item: 'Hpt_CloudScanner_Size0_Class5', Engineering: { BlueprintName: 'Sensor_LongRange', Level: 5, Quality: 1 } },
      { Slot: 'TinyHardpoint2', Item: 'Hpt_CrimeScanner_Size0_Class5', Engineering: { BlueprintName: 'Sensor_WideAngle', Level: 3, Quality: 0.5 } },
    ],
  });
  assert.deepEqual(warnings, []);
  assert.deepEqual(build.slots.utility[0], { modid: 56010, bpid: 'scan_lr', grade: 5, expid: null });
  assert.deepEqual(build.slots.utility[1], { modid: 57010, bpid: 'scan_wa', grade: 3, expid: null });
});

withEdsy('familles 4 et 8 : export SLEF d\'EDSY réimporté à l\'identique (scanner, Exposing Seeker), masse à vide juste', () => {
  for (const id of ['1-5', '12-2', '3-4']) {
    const b = bancBuild(id);
    const { build, warnings } = loadoutToBuild(eddb, b.slef);
    assert.deepEqual(warnings, [], id);
    assert.deepEqual(build.slots, b.build.slots, id);
    assert.ok(near(computeStats(eddb, build).mass.dry, computeStats(eddb, b.build).mass.dry, 1e-12), id);
  }
});

withEdsy('famille 8 : plan sans nom Frontier (Exposing Seeker) retrouvé par le type ; nom inconnu signalé', () => {
  const one = (Item, Engineering) => loadoutToBuild(eddb, { Ship: 'python', Modules: [{ Slot: 'LargeHardpoint1', Item, Engineering }] });
  const seeker = one('Hpt_DumbfireMissileRack_Fixed_Large', { BlueprintName: null, Level: 4, Quality: 1 });
  assert.deepEqual(seeker.warnings, []);
  assert.deepEqual(seeker.build.slots.hardpoint.find(Boolean), { modid: 82310, bpid: 'wpn_exp', grade: 4, expid: null });
  // Sans nom ni grade : rien à retrouver
  assert.equal(one('Hpt_DumbfireMissileRack_Fixed_Large', { BlueprintName: '', Level: 0 }).build.slots.hardpoint.find(Boolean).bpid, null);
  // Un canon n'a pas de plan sans nom : rien n'est inventé
  assert.equal(one('Hpt_Cannon_Fixed_Large', { BlueprintName: '', Level: 3 }).build.slots.hardpoint.find(Boolean).bpid, null);
  const unknown = one('Hpt_Cannon_Fixed_Large', { BlueprintName: 'Weapon_Inconnu', Level: 3, ExperimentalEffect: 'special_force_shell' });
  assert.deepEqual(unknown.warnings, ['Modification inconnue pour ce module : Weapon_Inconnu (Hpt_Cannon_Fixed_Large)']);
  assert.deepEqual(unknown.build.slots.hardpoint.find(Boolean).expid, null); // pas d'effet sans plan
  const badEffect = one('Hpt_Cannon_Fixed_Large', { BlueprintName: 'Weapon_Overcharged', Level: 9, ExperimentalEffect: 'special_inconnu' });
  assert.deepEqual(badEffect.warnings, ['Effet expérimental inconnu pour ce module : special_inconnu (Hpt_Cannon_Fixed_Large)']);
  assert.equal(badEffect.build.slots.hardpoint.find(Boolean).grade, 5); // grade borné au maximum du plan
});

// --- Familles 2, 3, 5, 9 : armement ---

withEdsy('familles 2 et 3 : soutenabilité WEP et autonomie des munitions, comme edsy.org', () => {
  for (const id of ['1-2', '2-2', '3-4', '9-5', '28-2']) {
    const { build, edsy } = bancBuild(id);
    const a = computeStats(eddb, build).armament;
    assert.ok(near(a.wepSustain, edsy.wpn_max_sus, 1e-9), `${id} soutenabilité : EDSY ${edsy.wpn_max_sus}, nous ${a.wepSustain}`);
    assert.ok(near(a.ammoTime, edsy.wpn_amm_dur, 1e-9), `${id} munitions : EDSY ${edsy.wpn_amm_dur}, nous ${a.ammoTime}`);
  }
  // 3-4 (Imperial Clipper) : condensateur vide après 37,8 s, puis tir à 69,5 % : 317,19 s au lieu de 232 s
  const a = computeStats(eddb, bancBuild('3-4').build).armament;
  assert.ok(near(a.ammoTime, 317.1893408088936, 1e-9));
  assert.ok(a.wepDrainSustained > computeStats(eddb, bancBuild('3-4').build).distributor.wep.chg);
  // 28-2 : une arme sans tirage WEP tire toujours à plein (pondération par le DPS, famille 11 du banc)
  assert.ok(near(computeStats(eddb, bancBuild('28-2').build).armament.wepSustain, 0.9344232911979483, 1e-9));
});

withEdsy('famille 2 : tirage WEP soutenu sous la recharge → soutenabilité 100 %, même si la rafale la dépasse', () => {
  const { build } = bancBuild('2-2');
  const s = computeStats(eddb, build);
  assert.ok(s.armament.wepDrain > s.distributor.wep.chg, 'rafale au-dessus de la recharge');
  assert.ok(s.armament.wepDrainSustained <= s.distributor.wep.chg, 'tir soutenu tenable');
  assert.equal(s.armament.wepSustain, 1);
});

withEdsy('famille 5 : lance-torpilles (chargeur sans réserve) : 1I = 5 s, 2I = 6 s, 3I = 8 s', () => {
  const tubes = Object.entries(eddb.module).filter(([, m]) => m.mtype === 'htp' && m.rating === 'I' && !m.reserved).map(([id, m]) => [Number(id), m.class]);
  const want = { 1: 5, 2: 6, 3: 8 };
  for (const cls of [1, 2, 3]) {
    const build = maxCoreBuild(eddb, PYTHON);
    const ids = tubes.filter(([, c]) => c === cls).map(([id]) => id);
    const i = build.slots.hardpoint.findIndex((_, k) => ids.some((id) => moduleAllowed(eddb, PYTHON, 'hardpoint', k, id)));
    const modid = ids.find((id) => moduleAllowed(eddb, PYTHON, 'hardpoint', i, id));
    build.slots.hardpoint[i] = { modid, bpid: null, grade: 0, expid: null };
    const w = computeStats(eddb, build).armament.list.find((x) => x.slot === i);
    assert.equal(w.ammo.max, 0);
    assert.equal(w.ammo.fuel, false);
    assert.ok(near(w.ammoTime, want[cls], 1e-9), `${cls}I : ${w.ammoTime}`);
  }
});

withEdsy('famille 9 : Balle à plasma (réserve à −100 %) rechargée sur le carburant : autonomie sans fin', () => {
  const { build } = bancBuild('15-2');
  const plasma = computeStats(eddb, build).armament.list.filter((w) => w.ammo?.fuel);
  assert.ok(plasma.length >= 1);
  for (const w of plasma) {
    assert.equal(w.ammoTime, null);
    assert.equal(w.ammo.max, 0);
  }
  // EDSY donne la durée d'un seul chargeur (2,03 s) : écart d'EDSY, l'arme se recharge en jeu sur le réservoir
  assert.equal(bancBuild('15-2').edsy.wpn_amm_dur, 2.03);
  assert.ok(computeStats(eddb, build).armament.ammoTime > 2.03);
});

withEdsy('soutenabilité nulle (recharge WEP à 0) : les armes sur le WEP s\'arrêtent, « WEP vide » plutôt que ∞', () => {
  const { build } = bancBuild('3-4');
  const dist = build.slots.component[5].modid;
  const fake = { ...eddb, module: { ...eddb.module, [dist]: { ...eddb.module[dist], wepchg: 0 } } };
  const a = computeStats(fake, build).armament;
  assert.equal(a.wepSustain, 0);
  assert.ok(a.wepTime > 0);
  assert.equal(a.wepStall, true);
  const stalled = a.list.filter((w) => w.wepStall);
  assert.ok(stalled.length >= 1);
  for (const w of stalled) assert.equal(w.ammoTime, null);
  // Recharge normale : aucune arme à l'arrêt
  assert.equal(computeStats(eddb, build).armament.wepStall, false);
  assert.ok(computeStats(eddb, build).armament.list.every((w) => !w.wepStall));
});

withEdsy('soutenabilité : existe dès qu\'il y a une arme et un distributeur, null sans arme', () => {
  const empty = maxCoreBuild(eddb, PYTHON);
  empty.slots.hardpoint = empty.slots.hardpoint.map(() => null);
  const a = computeStats(eddb, empty).armament;
  assert.equal(a.wepSustain, null);
  assert.equal(a.wepStall, false);
  assert.equal(a.ammoTime, null);
});

// --- Familles 6 et 7 ---

withEdsy('famille 6 : rotation à la masse avec la réserve de carburant, comme edsy.org', () => {
  for (const id of ['1-2', '3-4', '9-5', '28-2']) {
    const { build, edsy } = bancBuild(id);
    const r = computeStats(eddb, build).rotation;
    assert.ok(near(r.pitch, edsy.max_pitch, 1e-9) && near(r.roll, edsy.max_roll, 1e-9) && near(r.yaw, edsy.max_yaw, 1e-9), `${id} : ${JSON.stringify(r)}`);
  }
});

withEdsy('famille 7 : renforts de modules cumulés et leur intégrité (9-5 : 3 renforts, 97,2 %)', () => {
  for (const id of ['1-2', '3-4', '9-5', '28-2']) {
    const { build, edsy } = bancBuild(id);
    const h = computeStats(eddb, build).hull;
    assert.ok(near(h.moduleProtectionTotal, edsy.mod_armour_protect * 100, 1e-9), `${id} : ${h.moduleProtectionTotal}`);
    assert.ok(near(h.moduleIntegrity, edsy.mod_armour_integ, 1e-9), `${id} : ${h.moduleIntegrity}`);
  }
  const h = computeStats(eddb, bancBuild('9-5').build).hull;
  assert.equal(h.moduleProtection.length, 3);
  assert.ok(h.moduleProtectionTotal > Math.max(...h.moduleProtection));
});

// --- Famille 1 : capteurs ; famille 12 : chargeur ---

withEdsy('famille 1 : la portée des capteurs suit Longue portée et Grand angle (cs_lr G5 → 14 km, cs_wa G3 → 7,04 km)', () => {
  assert.ok(near(fitModule(eddb, null, { modid: 46110, bpid: 'cs_lr', grade: 5 }).value('maxrng'), 14, 1e-12));
  assert.ok(near(fitModule(eddb, null, { modid: 46140, bpid: 'cs_wa', grade: 3 }).value('maxrng'), 7.04, 1e-12));
  assert.equal(fitModule(eddb, null, { modid: 46110 }).value('maxrng'), 8);
});

withEdsy('famille 12 : multi-canon 2E Haute capacité G3 : chargeur de 168 coups (100 × 1,68), pas 169 comme EDSY', () => {
  assert.equal(fitModule(eddb, null, { modid: 72250, bpid: 'wpn_hc', grade: 3 }).value('ammoclip'), 168);
});

// --- Sonde P1 : stabilisateur d'armes expérimentales ---

withEdsy('P1 : stabilisateur 5F : 6 armes expérimentales permises ; sans lui, 4 ; 7 dépassent', () => {
  assert.equal(eddb.module[STABILISER_5F].unlimit, 'hex');
  assert.deepEqual(depassements(eddb, withExperimental(PYTHON, 5, STABILISER_5F)), []);
  assert.deepEqual(depassements(eddb, withExperimental(PYTHON, 5, STABILISER_3F)), []); // 4 + 1
  const without = depassements(eddb, withExperimental(PYTHON, 5));
  assert.equal(without.length, 1);
  assert.equal(without[0].max, 4);
  const seven = depassements(eddb, withExperimental(ANACONDA, 7, STABILISER_5F));
  assert.equal(seven.length, 1);
  assert.equal(seven[0].max, 6);
  assert.match(seven[0].texte, /^6 armes expérimentales au plus par vaisseau \(7 installés\)$/);
});

withEdsy('P1 : catalogue : le stabilisateur relève la limite, texte de la limite relevée pour le grisé', async () => {
  const { call } = setup();
  const cat = await call('get', '/catalog/:shipId', { params: { shipId: String(PYTHON) } });
  assert.deepEqual(cat.modules[STABILISER_5F].unlimit, { key: 'hex', count: 2 });
  assert.equal(cat.limits.hex.max, 4);
  assert.match(cat.limits.hex.textes[6], /^6 armes expérimentales au plus par vaisseau avec le stabilisateur/);
  // Enregistrement : 5 armes expérimentales et un stabilisateur 5F, accepté
  const build = withExperimental(PYTHON, 5, STABILISER_5F);
  const saved = await call('post', '/builds', { body: { ...build, name: 'Python AX' } });
  assert.equal(saved.name, 'Python AX');
  const r = await call('post', '/stats', { body: build });
  assert.ok(!r.warnings.some((w) => /Impossible dans le jeu/.test(w)), r.warnings.join(' / '));
});

// --- Sondes P2 à P4 : effets interdits, effet sans plan, modules cachés ---

withEdsy('P2 et P3 : effet interdit sur ce module, ou sans plan : retiré du build', async () => {
  const { call } = setup();
  const build = maxCoreBuild(eddb, PYTHON);
  // Lance-missiles 2B : Munitions à traînée interdites (noexpeffects) ; Abrasion Blaster : aucun effet
  assert.ok(eddb.module[82220].noexpeffects?.wpnx_drmu && eddb.mtype.hmr.expeffects.includes('wpnx_drmu'));
  assert.ok(eddb.module[81141].noexpeffects?.['*']);
  const rack = freeSlot(build, 'hardpoint', 82220);
  build.slots.hardpoint[rack] = { modid: 82220, bpid: 'wpn_hc', grade: 5, expid: 'wpnx_drmu' };
  const blaster = freeSlot(build, 'hardpoint', 81141);
  const mtBlaster = eddb.mtype[eddb.module[81141].mtype];
  build.slots.hardpoint[blaster] = { modid: 81141, bpid: mtBlaster.blueprints[0] || null, grade: 1, expid: mtBlaster.expeffects[0] || 'wpnx_inro' };
  // Canon sans plan avec Obus de force : effet retiré (P3)
  const cannon = Object.keys(eddb.module).map(Number).find((id) => eddb.module[id].mtype === 'hc' && freeSlot(build, 'hardpoint', id) >= 0);
  const k = freeSlot(build, 'hardpoint', cannon);
  build.slots.hardpoint[k] = { modid: cannon, bpid: null, grade: 0, expid: 'wpnx_fosh' };
  const saved = await call('post', '/builds', { body: { ...build, name: 'Sonde' } });
  assert.equal(saved.slots.hardpoint[rack].expid, null);
  assert.equal(saved.slots.hardpoint[rack].bpid, 'wpn_hc');
  assert.equal(saved.slots.hardpoint[blaster].expid, null);
  assert.deepEqual(saved.slots.hardpoint[k], { modid: cannon, bpid: null, grade: 0, expid: null });
  // Catalogue : effets interdits listés pour l'éditeur
  const cat = await call('get', '/catalog/:shipId', { params: { shipId: String(PYTHON) } });
  assert.deepEqual(cat.modules[82220].noexp, ['wpnx_drmu']);
  assert.deepEqual(cat.modules[81141].noexp, ['*']);
});

withEdsy('noblueprints : modification interdite sur ce module retirée par le serveur, comme dans le catalogue', async () => {
  const { call } = setup();
  const build = maxCoreBuild(eddb, PYTHON);
  // Multi-canon AX amélioré 2D : aucune modification ; renfort gardien 1D : pas de Renforts lourds ; renfort 1D : permis
  const AX_MC = 86246;
  const GUARDIAN_HRP = 4141;
  const HRP = 4140;
  assert.ok(eddb.module[AX_MC].noblueprints?.['*'] && eddb.module[GUARDIAN_HRP].noblueprints?.ihrp_hd && !eddb.module[HRP].noblueprints?.ihrp_hd);
  const h = freeSlot(build, 'hardpoint', AX_MC);
  build.slots.hardpoint[h] = { modid: AX_MC, bpid: eddb.mtype[eddb.module[AX_MC].mtype].blueprints[0], grade: 3, expid: null };
  const g = freeSlot(build, 'internal', GUARDIAN_HRP);
  build.slots.internal[g] = { modid: GUARDIAN_HRP, bpid: 'ihrp_hd', grade: 5, expid: null };
  const n = freeSlot(build, 'internal', HRP);
  build.slots.internal[n] = { modid: HRP, bpid: 'ihrp_hd', grade: 5, expid: null };
  const saved = await call('post', '/builds', { body: { ...build, name: 'Sonde' } });
  assert.deepEqual(saved.slots.hardpoint[h], { modid: AX_MC, bpid: null, grade: 0, expid: null });
  assert.deepEqual(saved.slots.internal[g], { modid: GUARDIAN_HRP, bpid: null, grade: 0, expid: null });
  assert.equal(saved.slots.internal[n].bpid, 'ihrp_hd');
  const cat = await call('get', '/catalog/:shipId', { params: { shipId: String(PYTHON) } });
  assert.deepEqual(cat.modules[AX_MC].nobp, ['*']);
  assert.ok(cat.modules[GUARDIAN_HRP].nobp.includes('ihrp_hd'));
});

withEdsy('P4 : modules cachés d\'EDSY absents du choix, mais acceptés et décrits (vaisseau venu du journal)', async () => {
  const lo = {
    event: 'Loadout', timestamp: '2026-11-15T10:00:00Z', Ship: 'python', ShipID: 7,
    Modules: [{ Slot: 'Slot02_Size6', Item: 'Int_CorrosionProofCargoRack_Size6_Class1' }],
  };
  const { call } = setup({ loadouts: [lo] });
  const cat = await call('get', '/catalog/:shipId', { params: { shipId: String(PYTHON) } });
  const offered = new Set(Object.values(cat.slots).flat().flatMap((s) => s.options));
  assert.equal(offered.has(651), false); // Soute anti-corrosion 6 : cachée
  assert.ok(cat.modules[651], 'décrite pour l\'affichage');
  for (const id of offered) assert.ok(!moduleOf(eddb, eddb.ship[PYTHON], id).hidden, String(id));
  const start = await call('post', '/start', { body: { gameShipId: 7 } });
  assert.deepEqual(start.warnings, []);
  const internal = start.build.slots.internal.findIndex((s) => s?.modid === 651);
  assert.ok(internal >= 0);
  // Accepté par clean() dans un build complet (modules de base au maximum)
  const build = maxCoreBuild(eddb, PYTHON);
  build.slots.internal[internal] = { modid: 651, bpid: null, grade: 0, expid: null };
  const r = await call('post', '/stats', { body: build });
  assert.ok(r.stats.cargo >= 64);
});

// --- Famille 10 : grade borné à la lecture ---

test('famille 10 : grade d\'un build relu borné au grade maximal actuel du plan (tables fictives)', () => {
  const fake = { blueprint: { icr_xcr: { maxgrade: 4 }, wpn_hc: { maxgrade: 5 } } };
  const build = {
    shipId: 1,
    name: 'Ancien',
    slots: { internal: [{ modid: 550, bpid: 'icr_xcr', grade: 5, expid: null }, null, { modid: 551, bpid: 'retiré', grade: 5, expid: null }], hardpoint: [{ modid: 1, bpid: 'wpn_hc', grade: 3, expid: 'x' }] },
  };
  const bound = boundBuild(fake, build);
  assert.equal(bound.slots.internal[0].grade, 4);
  assert.equal(bound.slots.internal[1], null);
  assert.equal(bound.slots.internal[2].grade, 5); // plan inconnu des données : laissé tel quel
  assert.deepEqual(bound.slots.hardpoint[0], build.slots.hardpoint[0]);
  assert.equal(build.slots.internal[0].grade, 5, 'le build d\'origine n\'est pas modifié');
  assert.equal(boundGrade(fake, 'icr_xcr', 0), 1);
  assert.equal(boundGrade(fake, 'inconnu', 9), 5);
});

withEdsy('famille 10 : build enregistré en G5 au-delà du maximum relu au maximum (affichage et lien EDSY)', async () => {
  // Lance-leurres thermiques 0I, Capacité de munitions (uhsl_ammo : un seul grade), enregistré en G5
  const { call, rows } = setup();
  assert.equal(eddb.blueprint.uhsl_ammo.maxgrade, 1);
  const build = maxCoreBuild(eddb, CUTTER);
  const i = freeSlot(build, 'utility', 52090);
  build.slots.utility[i] = { modid: 52090, bpid: 'uhsl_ammo', grade: 5, expid: null };
  rows.push({ id: 1, name: 'Ancien', shipId: CUTTER, shipType: 'cutter', gameShipId: null, notes: '', createdAt: new Date(), updatedAt: new Date(), slots: JSON.stringify(build.slots) });
  const read = await call('get', '/builds/:id', { params: { id: '1' } });
  assert.equal(read.slots.utility[i].grade, 1);
  const linked = decodedToBuild(eddb, decodeEdsy(eddb, extractHash(read.edsy)));
  assert.equal(linked.slots.utility[i].grade, 1, 'lien EDSY au grade borné');
  assert.equal(JSON.parse(rows[0].slots).utility[i].grade, 5, 'la base n\'est pas réécrite');
});

// eddb.js 424029903 (épinglé dans download.js) : Soute à extension en G1-G4. Ignoré avec des données plus anciennes.
const with903 = eddb && eddb.version >= 424029903 ? test : test.skip;

with903('famille 10 : Soute à extension G5 enregistrée avant eddb 424029903 relue en G4 : 44 t en taille 5, comme edsy.org (47-5)', async () => {
  assert.equal(eddb.blueprint.icr_xcr.maxgrade, 4);
  assert.equal(fitModule(eddb, null, { modid: 550, bpid: 'icr_xcr', grade: 4 }).value('cargocap'), 44);
  const { call, rows } = setup();
  const build = maxCoreBuild(eddb, CUTTER);
  const i = freeSlot(build, 'internal', 550);
  build.slots.internal[i] = { modid: 550, bpid: 'icr_xcr', grade: 5, expid: null };
  rows.push({ id: 1, name: 'Ancien', shipId: CUTTER, shipType: 'cutter', gameShipId: null, notes: '', createdAt: new Date(), updatedAt: new Date(), slots: JSON.stringify(build.slots) });
  const read = await call('get', '/builds/:id', { params: { id: '1' } });
  assert.equal(read.slots.internal[i].grade, 4);
  const linked = decodedToBuild(eddb, decodeEdsy(eddb, extractHash(read.edsy)));
  assert.equal(linked.slots.internal[i].grade, 4, 'lien EDSY au grade borné');
  const sans = { ...read, slots: { ...read.slots, internal: read.slots.internal.map((s, k) => (k === i ? null : s)) } };
  assert.equal(computeStats(eddb, read).cargo, computeStats(eddb, sans).cargo + 44);
});
