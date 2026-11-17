// Fiche « Chez l'ingénieur » (services/visit.js) : ouverture à quai chez un ingénieur qui a des tâches, cases en direct,
// choix du plan, module monté sur le vaisseau piloté, alertes R7 et « autre module », fermeture au départ et par ✕.
// Service factice : rien du journal réel, aucun nom de joueur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Visit, gradeState, effectState, replaces } from '../services/visit.js';
import { fingerprintOf } from '../services/validation.js';

const BROO = 300030;
const MARKET = 128674695;

test('grades, effet et ce qu’une autre modification efface', () => {
  const cur = { module: 'hpt_x', blueprint: 'Weapon_Efficient', grade: 2, quality: 0.4, experimental: null };
  assert.equal(gradeState(cur, 'weapon_efficient', 1), 'fait');
  assert.equal(gradeState(cur, 'Weapon_Efficient', 2), 'en-cours');
  assert.equal(gradeState(cur, 'Weapon_Efficient', 3), 'a-faire');
  assert.equal(gradeState({ ...cur, quality: 1 }, 'Weapon_Efficient', 2), 'fait');
  assert.equal(gradeState(cur, 'Weapon_LightWeight', 1), 'a-faire');
  assert.equal(effectState(cur, 'Weapon_Efficient', 'special_x'), 'a-faire');
  assert.equal(effectState({ ...cur, blueprint: 'Weapon_Sturdy' }, 'Weapon_Efficient', 'special_x'), 'verrouille', 'posé avant le plan, il serait effacé (R7)');
  assert.equal(effectState({ ...cur, experimental: 'special_x' }, 'Weapon_Efficient', 'special_x'), 'fait');
  assert.equal(replaces(cur, 'Weapon_Efficient'), null);
  assert.deepEqual(replaces({ ...cur, experimental: 'special_y', experimentalLabel: 'Y', engineer: 'The Dweller' }, 'Weapon_LightWeight'), { blueprint: 'Weapon_Efficient', grade: 2, experimental: 'special_y', experimentalLabel: 'Y', engineer: 'The Dweller' });
  assert.equal(replaces({ module: 'x', blueprint: null, grade: 0 }, 'Weapon_Efficient'), null);
});

function banc() {
  const plan = { id: 1, name: 'Krait chasse', shipId: 5, shipType: 'krait_mkii', modules: [{ slot: 'hp1', module: 'hpt_x', blueprint: 'Weapon_Efficient', grade: 3, experimental: 'special_x' }] };
  const other = { id: 2, name: 'Python mineur', shipId: 6, shipType: 'python', modules: [{ slot: 'hp2', module: 'hpt_y', blueprint: 'Weapon_Efficient', grade: 2, experimental: null }] };
  const ships = { 5: { current: { module: 'hpt_x', blueprint: null, grade: 0, quality: 0, experimental: null } }, 6: { current: { module: 'hpt_y', blueprint: null, grade: 0, quality: 0, experimental: null } }, 9: { current: { module: 'hpt_x', blueprint: null, grade: 0, quality: 0, experimental: null } } };
  const tasks = [
    { planId: 1, slot: 'hp1', kind: 'grades', blueprint: 'Weapon_Efficient', grades: [1, 2, 3], label: 'Point d’emport 1' },
    { planId: 1, slot: 'hp1', kind: 'effet', blueprint: 'Weapon_Efficient', experimental: 'special_x' },
    { planId: 2, slot: 'hp2', kind: 'grades', blueprint: 'Weapon_Efficient', grades: [1, 2], label: 'Point d’emport 2' },
  ];
  const fleet = { currentShipId: 5, ships: new Map([[5, { shipId: 5, type: 'krait_mkii' }], [6, { shipId: 6, type: 'python' }], [9, { shipId: 9, type: 'anaconda' }]]) };
  const svc = {
    engIdx: { byMarketId: new Map([[MARKET, { id: BROO, name: 'Broo Tarquin' }]]), byStation: new Map() },
    itin: {
      route: { read: () => ({ result: { parts: [{ stops: [{ engineer: BROO, tasks, materials: [{ key: 'carbon', label: 'Carbone', need: 5 }] }] }] } }) },
      validated: { read: () => ({ plans: { 1: { fingerprint: fingerprintOf(plan) }, 2: { fingerprint: fingerprintOf(other) } } }) },
    },
    prisma: { engineeringPlan: { findMany: async () => [plan, other] } },
    shipSlots: (type, id) => (ships[id] ? [{ key: id === 9 ? 'x9' : id === 6 ? 'hp2' : 'hp1', journalSlot: 'SmallHardpoint1', current: ships[id].current }] : []),
    fleet,
    inventory: { count: (k) => (k === 'carbon' ? 2 : 0) },
    ref: null,
  };
  const ouvertures = [];
  const v = new Visit(svc, { overlay: { setExtra: (page, on) => ouvertures.push([page, on]) }, delayMs: 0 });
  return { v, ships, fleet, ouvertures };
}

const docked = { event: 'Docked', MarketID: MARKET, StationName: 'Broo’s Legacy', StationType: 'CraterOutpost', StarSystem: 'Muang', SystemAddress: 1 };

test('à quai chez l’ingénieur : fiche ouverte, tâches du plan piloté, coût comparé à l’inventaire ; départ : fermée', async () => {
  const { v, ships, ouvertures } = banc();
  assert.equal((await v.state()).reason, 'pas à quai');
  v.onEvent(docked);
  let s = await v.publish();
  assert.equal(s.open, true);
  assert.deepEqual(ouvertures, [['engineering-visit', true]]);
  assert.equal(s.host.name, 'Broo Tarquin');
  assert.equal(s.planId, 1, 'le plan du vaisseau piloté');
  assert.deepEqual(s.plans.map((p) => [p.planId, p.tasks]), [[1, 2], [2, 1]]);
  assert.deepEqual(s.modules[0].grades.map((g) => g.state), ['a-faire', 'a-faire', 'a-faire']);
  assert.equal(s.modules[1].state, 'verrouille');
  assert.deepEqual(s.cost.materials, [{ key: 'carbon', label: 'Carbone', need: 5, owned: 2, missing: 3 }]);
  // Le G1 puis le G2 en cours : cases cochées en direct (l'état du module vient de la flotte)
  ships[5].current = { module: 'hpt_x', blueprint: 'Weapon_Efficient', grade: 2, quality: 0.5, experimental: null };
  s = await v.state();
  assert.deepEqual(s.modules[0].grades.map((g) => g.state), ['fait', 'en-cours', 'a-faire']);
  assert.equal(s.modules[1].state, 'a-faire');
  ships[5].current = { ...ships[5].current, grade: 3, quality: 1, experimental: 'special_x' };
  s = await v.state();
  assert.deepEqual(s.done, { done: 2, total: 2, all: true });
  // Choix à la main d'un autre plan, puis départ
  s = await v.choosePlan(2);
  assert.deepEqual([s.planId, s.manual, s.modules.length], [2, true, 1]);
  v.onEvent({ event: 'Undocked' });
  s = await v.publish();
  assert.deepEqual([s.open, s.reason], [false, 'pas à quai']);
  assert.deepEqual(ouvertures.at(-1), ['engineering-visit', false]);
});

test('jamais ouverte à la seule relecture, ni sans tâche ; ✕ la ferme jusqu’au prochain amarrage', async () => {
  const { v } = banc();
  v.dock = { marketId: 42, station: 'Ailleurs', systemAddress: 2 };
  assert.equal((await v.state()).reason, 'pas une base d’ingénieur');
  v.onEvent(docked);
  v.close();
  assert.deepEqual([(await v.state()).open, (await v.state()).reason], [false, 'fermée']);
  v.onEvent({ event: 'Undocked' });
  v.onEvent(docked);
  assert.equal((await v.state()).open, true);
});

test('modules du plan montés sur le vaisseau piloté : lus là, et la fiche le dit', async () => {
  const { v, ships, fleet } = banc();
  fleet.currentShipId = 9; // un autre vaisseau, qui porte le module hpt_x du plan
  ships[9].current = { module: 'hpt_x', blueprint: 'Weapon_Efficient', grade: 1, quality: 1, experimental: null };
  v.onEvent(docked);
  const s = await v.state();
  assert.equal(s.planId, 1, 'aucun plan pour le vaisseau piloté : le premier');
  assert.equal(s.modules[0].aboard, 'pilote');
  assert.equal(s.modules[0].grades[0].state, 'fait');
});

test('plan du n° 5 d’un autre commandant (audit M7) : piloter TON n° 5 n’est pas être à bord du vaisseau du plan', async () => {
  const { v, fleet } = banc();
  fleet.currentShipId = 5; // ton n° 5 ; le plan 1 vise le n° 5 du compte principal (svc.ownShipId : pas à toi)
  v.svc.ownShipId = (p) => (p.id === 1 ? null : p.shipId);
  v.onEvent(docked);
  const s = await v.state();
  assert.equal(s.planId, 1, 'aucun plan pour le vaisseau piloté : le premier');
  assert.notEqual(s.modules[0].aboard, 'plan', 'avant : « à bord du vaisseau du plan », sur la foi du seul numéro');
});

test('alertes : remplacement prévu, effet effacé (R7), application sur un autre module', async () => {
  const { v, ships } = banc();
  v.onEvent(docked);
  await v.state(); // tâches connues
  ships[5].current = { module: 'hpt_x', blueprint: 'Weapon_Sturdy', grade: 3, quality: 1, experimental: null };
  v.onEvent({ event: 'EngineerCraft', Slot: 'SmallHardpoint1', BlueprintName: 'Weapon_Efficient', Level: 1 });
  assert.equal(v.alerts.at(-1).kind, 'remplace-prevu');
  ships[5].current = { module: 'hpt_x', blueprint: 'Weapon_Efficient', grade: 2, quality: 1, experimental: 'special_z', experimentalLabel: 'Z', engineer: 'Broo Tarquin' };
  v.onEvent({ event: 'EngineerCraft', Slot: 'SmallHardpoint1', BlueprintName: 'Weapon_LightWeight', Level: 1 });
  assert.equal(v.alerts.at(-1).kind, 'effet-efface');
  assert.match(v.alerts.at(-1).text, /Effet « Z » perdu/);
  ships[5].current = { module: 'hpt_autre', blueprint: null, grade: 0, quality: 0, experimental: null };
  v.onEvent({ event: 'EngineerCraft', Slot: 'SmallHardpoint1', BlueprintName: 'Weapon_Efficient', Level: 1 });
  assert.equal(v.alerts.at(-1).kind, 'autre-module');
  const id = v.alerts[0].id;
  v.dismiss(id);
  assert.ok(!v.alerts.some((a) => a.id === id));
});
