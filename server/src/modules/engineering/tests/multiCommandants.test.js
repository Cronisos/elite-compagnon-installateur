// Plusieurs commandants sur le même PC (audit du 15 nov. 2026, M7) : « Testeur » (F0000001) a une Anaconda n° 1,
// « Testeur 2 » (F0000002) une Cobra n° 1, sur le même dossier de journaux. Flotte, plans, rangs : par (commandant,
// ShipID). Base factice en mémoire : rien n'est écrit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EngineeringService, rankEventOf } from '../services/service.js';
import { buildFleet } from '../services/fleet.js';
import { buildRankLog } from '../services/ranks.js';
import { planOut } from '../index.js';
import { COMMANDER, commanderOf } from '../../../core/commander.js';

const UN = { FID: 'F0000001', Commander: 'Testeur' };
const DEUX = { FID: 'F0000002', Commander: 'Testeur 2' };
let n = 0;
const ts = () => `2026-11-09T10:00:${String((n += 1) % 60).padStart(2, '0')}Z`;
const loadGame = (who, Ship) => ({ timestamp: ts(), event: 'LoadGame', ...who, Ship, ShipID: 1 });
const fsd = (Level = 0, Quality = 0) => ({ Slot: 'FrameShiftDrive', Item: 'int_hyperdrive_size5_class5', ...(Level ? { Engineering: { Engineer: 'Felicity Farseer', BlueprintName: 'FSD_LongRange', Level, Quality } } : {}) });
const loadout = (Ship, modules = [fsd()]) => ({ timestamp: ts(), event: 'Loadout', Ship, ShipID: 1, ShipName: '', ShipIdent: '', Modules: modules });

/** Journaux : l'Anaconda du compte principal, puis la Cobra du second compte (le dernier chargé). */
const HISTOIRE = () => [loadGame(UN, 'Anaconda'), loadout('anaconda', [fsd(3, 0.5)]), { timestamp: ts(), event: 'Shutdown' }, loadGame(DEUX, 'CobraMkIII'), loadout('cobramkiii')];

test('flotte : chaque commandant a la sienne ; le n° 1 du second compte ne remplace pas l’Anaconda', () => {
  const fleet = buildFleet(HISTOIRE());
  assert.equal(fleet.commander, 'F0000002');
  assert.equal(fleet.ships.get(1).type, 'cobramkiii', 'flotte du commandant chargé');
  assert.equal(fleet.currentShipId, 1);
  assert.equal(fleet.shipOf('F0000001', 1).type, 'anaconda', 'avant : un seul vaisseau n° 1, le dernier vu');
  assert.equal(fleet.shipOf('F0000001', 1).loadout.Modules[0].Engineering.Level, 3);
  assert.equal(fleet.shipOf(null, 1), null, 'plan d’avant les commandants, deux commandants : aucun vaisseau');
  // Vente du n° 1 par le second compte : l'Anaconda reste
  fleet.apply({ timestamp: ts(), event: 'ShipyardSell', ShipType: 'cobramkiii', SellShipID: 1 });
  assert.equal(fleet.ships.has(1), false);
  assert.equal(fleet.shipOf('F0000001', 1).type, 'anaconda');
  // Second compte lancé à pied : plus de vaisseau piloté (celui d'avant est à l'autre)
  const f2 = buildFleet([loadGame(UN, 'Anaconda'), loadout('anaconda'), { timestamp: ts(), event: 'LoadGame', ...DEUX, Ship: 'ExplorationSuit_Class1', ShipID: 4293000002 }]);
  assert.equal(f2.ships.has(1), false);
  assert.equal(f2.ships.get(1)?.type, undefined);
});

/** Service réduit : flotte des journaux, référence et base simulées (où commanderId compte, null compris). */
function service(events = HISTOIRE()) {
  const svc = Object.create(EngineeringService.prototype);
  svc.shipLocks = new Map();
  svc.ref = {
    ships: { anaconda: {}, cobra_mk_iii: {} },
    shipKey: (t) => ({ anaconda: 'anaconda', cobramkiii: 'cobra_mk_iii' })[String(t).toLowerCase()] ?? null,
    shipName: (k) => ({ anaconda: 'Anaconda', cobra_mk_iii: 'Cobra Mk III' })[k] ?? k,
    shipSlots: () => [{ key: 'std-fsd', group: 'standard', journal: 'FrameShiftDrive', size: 5 }],
    blueprintKey: (b) => b || null,
  };
  svc.fleet = buildFleet(events);
  const plans = [];
  const match = (where) => (p) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' ? Object.hasOwn(v, 'not') && p[k] !== v.not : (p[k] ?? null) === v));
  svc.prisma = {
    engineeringPlan: {
      findFirst: async ({ where }) => plans.find(match(where)) ?? null,
      create: async ({ data }) => {
        const { modules, ...rest } = data;
        const plan = { id: plans.length + 1, ...rest, modules: modules?.create ?? [] };
        plans.push(plan);
        return plan;
      },
      updateMany: async ({ where, data }) => {
        const list = plans.filter(match(where));
        for (const p of list) Object.assign(p, data);
        return { count: list.length };
      },
    },
  };
  return { svc, plans };
}

test('plan : « Créer le plan » de la Cobra ne rend jamais celui de l’Anaconda ; chacun est rattaché à son commandant', async () => {
  const { svc, plans } = service();
  plans.push({ id: 1, shipId: 1, commanderId: 'F0000001', shipType: 'anaconda', name: 'Anaconda · plan', modules: [] });
  const cobra = await svc.createPlan({ shipId: 1 });
  assert.notEqual(cobra.id, 1, 'avant : le plan de l’Anaconda, pour la Cobra');
  assert.equal(cobra.commanderId, 'F0000002');
  assert.equal(cobra.shipType, 'cobra_mk_iii');
  assert.equal((await svc.createPlan({ shipId: 1 })).id, cobra.id, 'le sien, une fois créé');
  assert.equal(svc.shipLocks.size, 0);
  // Plan vierge : à personne
  assert.equal((await svc.createPlan({ shipType: 'anaconda' })).commanderId, null);
});

test('plan : configuration actuelle lue sur le vaisseau de SON commandant, jamais sur le n° 1 de l’autre', () => {
  const { svc } = service();
  const anaconda = { id: 1, shipId: 1, commanderId: 'F0000001', shipType: 'anaconda' };
  const lo = svc.loadoutOf(anaconda.shipType, anaconda.shipId, anaconda.commanderId);
  assert.equal(lo?.Ship, 'anaconda', 'pendant que le second compte joue : l’Anaconda, pas la Cobra');
  assert.equal(svc.loadoutOf('anaconda', 1), null, 'commandant chargé (la Cobra) : pas une Anaconda');
  assert.equal(svc.loadoutOf('cobra_mk_iii', 1)?.Ship, 'cobramkiii');
  assert.equal(svc.shipSlots('anaconda', 1, 'F0000001')[0].current.grade, 3);
  assert.equal(svc.ownShipId(anaconda), null, 'pas un vaisseau du commandant chargé : ni piloté, ni où transférer');
  assert.equal(svc.ownShipId({ ...anaconda, commanderId: 'F0000002' }), 1);
  // Plan d'avant les commandants : deux commandants, à personne ; un seul, le sien
  assert.equal(svc.loadoutOf('anaconda', 1, null), null);
  assert.equal(svc.ownShipId({ ...anaconda, commanderId: null }), null);
  const seul = service([loadGame(UN, 'Anaconda'), loadout('anaconda')]).svc;
  assert.equal(seul.loadoutOf('anaconda', 1, null)?.Ship, 'anaconda');
  assert.equal(seul.ownShipId({ ...anaconda, commanderId: null }), 1);
});

test('plans d’avant les commandants : rattachés au plus vu ; tant qu’un seul commandant joue, « Créer le plan » rend le sien', async () => {
  const seul = service([loadGame(UN, 'Anaconda'), loadout('anaconda')]);
  seul.plans.push({ id: 1, shipId: 1, commanderId: null, shipType: 'anaconda', name: 'Ancien plan', modules: [] });
  assert.equal((await seul.svc.createPlan({ shipId: 1 })).id, 1, 'un seul commandant : le plan d’avant est le sien');
  const deux = service();
  deux.plans.push({ id: 1, shipId: 1, commanderId: null, shipType: 'anaconda', name: 'Ancien plan', modules: [] }, { id: 2, shipId: null, commanderId: null, shipType: 'anaconda', name: 'Vierge', modules: [] });
  assert.notEqual((await deux.svc.createPlan({ shipId: 1 })).id, 1, 'deux commandants, pas rattaché : à personne');
  assert.equal(await deux.svc.adoptPlans('F0000001'), 1);
  assert.equal(deux.plans[0].commanderId, 'F0000001');
  assert.equal(deux.plans[1].commanderId, null, 'un plan vierge reste à personne');
  assert.equal(await deux.svc.adoptPlans(null), 0);
});

test('interface : un plan part sans le FID, avec « mine »', () => {
  const { svc } = service();
  const out = planOut(svc, { id: 1, shipId: 1, commanderId: 'F0000001', name: 'Anaconda · plan' });
  assert.deepEqual(out, { id: 1, shipId: 1, name: 'Anaconda · plan', mine: false });
  assert.equal(planOut(svc, { id: 2, shipId: 1, commanderId: 'F0000002' }).mine, true);
  assert.equal(planOut(svc, { id: 3, shipId: null, commanderId: null }).mine, true, 'plan vierge');
});

test('rangs : le Loadout du n° 1 du second compte n’efface pas l’état des modules du n° 1 du compte principal', () => {
  const craft = { timestamp: ts(), event: 'EngineerCraft', Slot: 'FrameShiftDrive', Module: 'int_hyperdrive_size5_class5', Engineer: 'Felicity Farseer', EngineerID: 300100, BlueprintName: 'FSD_LongRange', Level: 3, Quality: 0.7, Ingredients: [] };
  // Copies réduites gardées par le service (rankEventOf) : le commandant noté par le lecteur des journaux les suit
  const noted = (ev, who) => Object.assign(ev, { [COMMANDER]: who.FID });
  const events = [
    noted(loadGame(UN, 'Anaconda'), UN), noted(loadout('anaconda', [fsd(3, 0.5)]), UN),
    noted(loadGame(DEUX, 'CobraMkIII'), DEUX), noted(loadout('cobramkiii'), DEUX),
    noted(loadGame(UN, 'Anaconda'), UN), noted(craft, UN),
  ].map(rankEventOf).filter(Boolean);
  assert.equal(commanderOf(events[1]), 'F0000001', 'copie réduite du Loadout : commandant gardé');
  const log = buildRankLog(events);
  assert.equal(log.applications.length, 1);
  assert.equal(log.applications[0].step, 0.2, 'pas mesuré depuis G3 à 50 % (avant : état perdu, pas inconnu)');
});
