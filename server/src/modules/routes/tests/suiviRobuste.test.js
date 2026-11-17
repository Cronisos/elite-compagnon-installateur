// Suivi des routes, cas anormaux (audit du 15 nov. 2026) :
//   - H3 : une boucle enregistrée n'est effacée que si elle tient dans la période réellement relue, et jamais quand un
//     journal a été sauté ;
//   - B34 : les synchronisations de l'API passent par la même file que celles du suivi ; « Reprendre » en une transaction ;
//   - B35 : archive des marchés sans erreur sur un relevé en double, purgée au-delà de 30 jours ;
//   - B36 : une route abîmée en base n'arrête plus la synchronisation des autres, ni la liste.
// Base factice et chronologie tirée du fixture des routes : rien n'est écrit sur le disque.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLines } from '../../../core/journalFiles.js';
import { buildTimeline } from '../services/timeline.js';
import { detectRoute } from '../services/detector.js';
import { extractLoops } from '../services/loops.js';
import { RouteTracker, staleLoops } from '../services/tracker.js';
import { buildRouteView, isRouteStructure, publicRoute } from '../services/view.js';
import { applyAnswer, commodityQuestion, stationQuestion } from '../services/questions.js';
import { setupApi } from '../api.js';

const fixture = fileURLToPath(new URL('./fixtures/port-draught-cemiess.log', import.meta.url));
const timeline = buildTimeline(parseLines(fs.readFileSync(fixture, 'utf8')));
const PD = 'ICZ KC-U b3-4';
const d = detectRoute(timeline, { anchorSystem: PD });
const structure = { ...d };
delete structure.loop;
const route = { id: 1, structure: JSON.stringify(structure), trackFrom: new Date(0), active: true };
const loops = extractLoops(timeline, RouteTracker.def(route), { from: 0 }).loops;
const firstT = timeline[0].t;
const lastT = timeline[timeline.length - 1].t;

const enBase = (id, startMs, endMs) => ({ id, startAt: new Date(startMs), endAt: new Date(endMs), netGain: 0, activeSec: 0, tags: '[]' });

test('H3 : seules les boucles entières dans la période relue, et absentes des journaux, sont à effacer', () => {
  assert.ok(loops.length >= 2, 'le fixture a des boucles');
  const existing = [
    enBase(1, firstT + 1000, firstT + 2000), // dans la période, introuvable : découpage revu
    enBase(2, lastT + 3600e3, lastT + 7200e3), // après la fin des journaux relus (autre dossier, vieille sauvegarde)
    enBase(3, firstT - 7200e3, firstT - 3600e3), // avant
    enBase(4, lastT - 1000, lastT + 600e3), // commencée dans la période, finie après
    { ...enBase(5, 0, 0), startAt: new Date(loops[0].startAt), endAt: new Date(loops[0].endAt) }, // retrouvée
  ];
  assert.deepEqual(staleLoops(existing, loops, { firstT, lastT, incomplete: false }).map((l) => l.id), [1]);
  assert.deepEqual(staleLoops(existing, loops, { firstT, lastT, incomplete: true }), [], 'un journal sauté : rien');
  assert.deepEqual(staleLoops(existing, [], { firstT: Infinity, lastT: -Infinity, incomplete: false }), [], 'aucun journal');
});

/** Base factice : boucles en mémoire, opérations notées. */
function fausseBase(initial = []) {
  const log = [];
  let rows = initial.map((l) => ({ ...l }));
  let nextId = 100;
  const prisma = {
    log,
    loop: {
      findMany: async () => rows.map((l) => ({ ...l, durationSec: 600, pause: false })),
      create: async ({ data }) => {
        log.push('create');
        const row = { id: nextId++, ...data };
        rows.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        log.push('update');
        rows = rows.map((r) => (r.id === where.id ? { ...r, ...data } : r));
      },
      deleteMany: async ({ where }) => {
        const ids = where.id?.in ?? [];
        log.push(`deleteMany:${ids.join(',')}`);
        rows = rows.filter((r) => !ids.includes(r.id));
        return { count: ids.length };
      },
    },
    trade: { deleteMany: async () => ({}) },
    $transaction: async (ops) => Promise.all(ops),
    route: { findMany: async () => [] },
  };
  return { prisma, rows: () => rows };
}

function tracker(prisma, skipped = new Map()) {
  const journal = { addInterest() {}, on() {}, skipped, stateData: {} };
  const t = new RouteTracker({ prisma, journal, game: { snapshot: () => ({}) }, broadcast: () => {} });
  t.timeline = timeline;
  return t;
}

test('H3 : synchronisation avec un journal sauté : aucune boucle effacée ; journaux complets : seulement l’introuvable', async () => {
  const perdue = enBase(1, firstT + 1000, firstT + 2000);
  const apres = enBase(2, lastT + 3600e3, lastT + 7200e3);
  {
    const { prisma, rows } = fausseBase([perdue, apres]);
    await tracker(prisma, new Map([['Journal.2026-10-27T120000.01.log', 'EBUSY']])).syncRoute(route);
    assert.ok(!prisma.log.some((x) => x.startsWith('deleteMany')), 'rien d’effacé');
    assert.ok(rows().some((r) => r.id === 1) && rows().some((r) => r.id === 2));
  }
  {
    const { prisma, rows } = fausseBase([perdue, apres]);
    await tracker(prisma).syncRoute(route);
    assert.ok(prisma.log.includes('deleteMany:1'));
    assert.ok(rows().some((r) => r.id === 2), 'la boucle d’après les journaux relus reste');
  }
});

test('B34 : une synchronisation demandée par l’API attend celle du suivi en cours (jamais deux à la fois)', async () => {
  const { prisma } = fausseBase();
  const t = tracker(prisma);
  const ordre = [];
  let finir;
  const enCours = t.enqueue(() => new Promise((r) => { ordre.push('suivi:début'); finir = () => { ordre.push('suivi:fin'); r(); }; }));
  const api = t.enqueue(async () => ordre.push('api'));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(ordre, ['suivi:début']);
  finir();
  await Promise.all([enCours, api]);
  assert.deepEqual(ordre, ['suivi:début', 'suivi:fin', 'api']);
  // Un échec ne bloque pas la file
  await assert.rejects(t.enqueue(async () => { throw new Error('échec'); }));
  assert.equal(await t.enqueue(async () => 'suite'), 'suite');
});

test('B36 : une route à la structure abîmée n’arrête plus la synchronisation des suivantes', async (t) => {
  const err = t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});
  const { prisma } = fausseBase();
  const abimee = { ...route, id: 7, structure: '{"stops":[' };
  prisma.route.findMany = async () => [abimee, route];
  const tr = tracker(prisma);
  const vues = [];
  const sync = tr.syncRoute.bind(tr);
  tr.syncRoute = async (r) => { vues.push(r.id); return sync(r); };
  await tr.syncAll();
  assert.deepEqual(vues, [7, 1]);
  assert.ok(prisma.log.includes('create'), 'la route saine a ses boucles');
  assert.match(String(err.mock.calls[0].arguments[0]), /route 7/);
});

test('B36 : une route aux listes abîmées reste dans la liste, avec des listes vides', (t) => {
  t.mock.method(console, 'warn', () => {});
  const r = publicRoute({ id: 9, name: 'Route Test', stations: '[', systems: '["Système Test"]', commodities: 'null' });
  assert.deepEqual([r.stations, r.systems, r.commodities], [[], ['Système Test'], []]);
});

test('B36 : structure lisible mais incomplète (« {} », sans étapes) : page refusée en clair (422), pas de plantage', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const ctx = { prisma: {}, tracker: {}, game: { snapshot: () => ({}) }, getSettings: async () => ({}) };
  const sansEtapes = { ...structure };
  delete sansEtapes.legs;
  for (const s of ['{}', '[]', 'null', JSON.stringify(sansEtapes), JSON.stringify({ ...structure, stations: 'x' })]) {
    await assert.rejects(buildRouteView({ id: 11, structure: s }, ctx), (err) => err.status === 422 && /Re-détecter la boucle/.test(err.publicMessage), s.slice(0, 40));
  }
  assert.equal(isRouteStructure(structure), true, 'une structure détectée est acceptée');
});

test('B36 : questions sur une route abîmée : aucune question, et une réponse refusée en clair (422)', (t) => {
  const warns = t.mock.method(console, 'warn', () => {});
  const abimee = { id: 12, name: 'Route Test', structure: '{"stops":' };
  const dock = { t: firstT, kind: 'dock', system: PD, station: 'Station Test', marketId: 99 };
  const achat = { t: firstT, kind: 'buy', system: PD, station: 'Station Test', marketId: 99, commodity: 'gold', name: 'Or', count: 500, total: 1, price: 1 };
  assert.equal(stationQuestion(abimee, dock), null);
  assert.equal(commodityQuestion(abimee, achat, 500), null);
  assert.equal(stationQuestion({ ...abimee, id: 13, structure: '{}' }, dock), null, 'sans escales : pas de question non plus');
  const q = { type: 'station', routeId: 12, legIndex: 0, system: PD, station: 'Station Test', marketId: 99, oldStation: 'Port Draught' };
  assert.throws(() => applyAnswer(abimee, q, true), (err) => err.status === 422 && /abîmée/.test(err.publicMessage));
  assert.throws(() => applyAnswer(abimee, q, false), (err) => err.status === 422);
  assert.equal(warns.mock.calls.length, 2, 'signalé une fois par route et par lancement, pas à chaque amarrage');
});

test('B35 : relevé de marché archivé deux fois en même temps : le second est ignoré sans erreur', async () => {
  const marche = { MarketID: 3700000001, StationName: 'Station Test', StarSystem: 'Système Test', timestamp: '2026-11-08T12:00:00Z', Items: [{ Name: '$gold_name;', Stock: 10, Demand: 0, BuyPrice: 9000, SellPrice: 8800 }] };
  let crees = 0;
  const prisma = {
    marketSnapshot: {
      findFirst: async () => null, // les deux appels lisent « rien » avant l'écriture de l'autre
      createMany: async () => {
        crees += 1;
        if (crees > 1) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      },
      groupBy: async () => [],
    },
  };
  const tr = tracker(prisma);
  const r = await Promise.all([tr.archiveMarket(marche), tr.archiveMarket(marche)]);
  assert.deepEqual(r.sort(), [false, true]);
});

test('B35 : purge : relevés de plus de 30 jours effacés, sauf le dernier de chaque station', async () => {
  const now = Date.UTC(2026, 10, 15);
  const jour = 24 * 3600e3;
  const suppressions = [];
  const prisma = {
    marketSnapshot: {
      groupBy: async ({ having }) => {
        assert.ok(having.at._min.lt instanceof Date);
        return [
          { marketId: 1, _min: { at: new Date(now - 90 * jour) }, _max: { at: new Date(now - 2 * jour) } }, // récente aussi
          { marketId: 2, _min: { at: new Date(now - 90 * jour) }, _max: { at: new Date(now - 60 * jour) } }, // plus visitée
        ];
      },
      deleteMany: async ({ where }) => {
        suppressions.push([where.marketId, (now - where.at.lt.getTime()) / jour]);
        return { count: 5 };
      },
    },
  };
  const tr = tracker(prisma);
  assert.equal(await tr.purgeMarkets(now), 10);
  assert.deepEqual(suppressions, [[1, 30], [2, 60]], 'station 2 : son dernier relevé (il y a 60 j) reste');
  // Au plus une fois par jour
  assert.ok(tr.purgeMarketsSoon(now));
  await tr.purging;
  assert.equal(tr.purgeMarketsSoon(now + 3600e3), null);
});

test('B34 : « Reprendre » : désactivation des autres routes et activation dans une même transaction', async () => {
  const handlers = new Map();
  const router = {};
  for (const m of ['get', 'post', 'put', 'patch', 'delete']) router[m] = (p, h) => handlers.set(`${m.toUpperCase()} ${p}`, h);
  const transactions = [];
  const r0 = { id: 3, name: 'Route Test', stations: '[]', systems: '[]', commodities: '[]', active: false };
  const prisma = {
    route: {
      findUnique: async () => r0,
      updateMany: (q) => ({ op: 'updateMany', q }),
      update: (q) => ({ op: 'update', q }),
    },
    $transaction: async (ops) => {
      transactions.push(ops.map((o) => o.op));
      return [{ count: 1 }, { ...r0, active: true }];
    },
  };
  const synchros = [];
  const tr = { timeline, syncRouteQueued: async (r) => synchros.push(r.id), enqueue: (fn) => fn(), notify: () => {} };
  setupApi(router, { prisma, tracker: tr });
  const res = await new Promise((resolve, reject) => {
    const out = { status() { return this; }, json: resolve };
    handlers.get('POST /routes/:id/resume')({ params: { id: '3' }, body: {} }, out, reject);
  });
  assert.deepEqual(transactions, [['updateMany', 'update']]);
  assert.equal(res.active, true);
  assert.deepEqual(synchros, [3], 'synchronisation par la file');
});
