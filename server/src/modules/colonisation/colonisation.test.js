// Tests des routes du module Colonisation : petit serveur Express en mémoire, journal et état du jeu simulés,
// archive dans un dossier temporaire du système. Événements : exemples documentés (fixtures/examples.js).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import colonisation, { parseMarketId, parseUserUpdate } from './index.js';
import { contributionAt, depotAt, dockedAt, DOCKED_SHIP } from './fixtures/examples.js';

const SHIP = DOCKED_SHIP.MarketID;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-colonisation-routes-'));
const dataFile = path.join(dir, 'colonisation.json');
const journal = Object.assign(new EventEmitter(), { interest: new Set(), addInterest(n) { n.forEach((x) => this.interest.add(x)); }, stateData: {} });
const game = Object.assign(new EventEmitter(), {
  snap: { docked: true, marketId: SHIP, cargo: [{ name: 'steel', label: 'Steel', count: 720 }], loadout: { ship: 'type9', cargoCapacity: 720 } },
  snapshot() { return JSON.parse(JSON.stringify(this.snap)); },
});
const sent = [];
let server;
let base;
let mod;
let ardentCalls = 0;

before(async () => {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  mod = await colonisation.register({
    router, journal, game, broadcast: (type, data) => sent.push({ type, data }), getSettings: async () => ({ hoursPerEvening: 3 }), dataFile, saveDelayMs: 10,
    fetchImpl: async () => {
      ardentCalls++;
      return { status: 200, ok: true, json: async () => [] };
    },
  });
  app.use('/api/modules/colonisation', router);
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.publicMessage || 'Erreur interne du serveur.' }));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api/modules/colonisation`;
  journal.emit('ready', { history: [
    dockedAt(SHIP, '2026-11-01T20:00:00Z'),
    depotAt(SHIP, '2026-11-01T20:00:05Z'),
    contributionAt(SHIP, '2026-11-01T20:01:00Z', { steel: 500 }),
    depotAt(SHIP, '2026-11-01T20:01:00Z', { steel: 1220 }),
    { event: 'Scan', timestamp: '2026-11-01T20:02:00Z', BodyName: 'ignoré' },
  ] });
});

after(() => {
  server.closeAllConnections();
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const get = async (p) => {
  const res = await fetch(`${base}${p}`);
  return { status: res.status, body: await res.json() };
};
const send = async (method, p, body) => {
  const res = await fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

test('intérêt déclaré au journal : événements de colonisation et de contexte', () => {
  for (const e of ['ColonisationConstructionDepot', 'ColonisationContribution', 'ColonisationSystemClaim', 'Docked', 'Location']) assert.ok(journal.interest.has(e), e);
});

test('GET /sites, /sites/:id, /here, /active : chantier, liste de courses avec la soute et la capacité', async () => {
  const list = await get('/sites');
  assert.equal(list.status, 200);
  assert.equal(list.body.sites.length, 1);
  const s = list.body.sites[0];
  assert.equal(s.label, 'Vaisseau de colonisation · Judson Depot');
  assert.equal(s.remaining, 21803 - 1220);
  assert.equal(s.toBuy, 21803 - 1220 - 720);
  assert.equal(s.trips, Math.ceil((21803 - 1220) / 720));
  assert.equal(s.docked, true);
  assert.equal(list.body.ship.pad, 'L');
  const one = await get(`/sites/${SHIP}`);
  const steel = one.body.plan.items.find((i) => i.symbol === 'steel');
  assert.equal(steel.inHold, 720);
  assert.equal(steel.toBuy, 6680 - 1220 - 720);
  assert.equal(one.body.plan.items[0].symbol, 'titanium'); // le plus gros reste en tête
  assert.equal(one.body.mine.total, 500);
  const here = await get('/here');
  assert.equal(here.body.docked, true);
  assert.equal(here.body.site.marketId, SHIP);
  const active = await get('/active');
  assert.equal(active.body.reason, 'docked');
  game.snap = { ...game.snap, docked: false, marketId: null };
  assert.equal((await get('/here')).body.site, null);
  assert.equal((await get('/active')).body.reason, 'recent');
});

test('validation : MarketID numérique, clés piégées, valeurs bornées', async () => {
  for (const bad of ['abc', 'constructor', '__proto__', '-5', '1e9', '0', '12345678901234567']) {
    assert.equal((await get(`/sites/${bad}`)).status, 400, bad);
  }
  assert.equal((await get('/sites/123')).status, 404);
  assert.equal((await send('PUT', '/sites/123', { name: 'x' })).status, 404);
  assert.equal((await send('PUT', `/sites/${SHIP}`, { name: 'x'.repeat(61) })).status, 400);
  assert.equal((await send('PUT', `/sites/${SHIP}`, { deadline: 'demain' })).status, 400);
  assert.equal((await send('PUT', `/sites/${SHIP}`, { deadline: '1990-01-01' })).status, 400);
  assert.equal((await send('PUT', `/sites/${SHIP}`, { loopMinutes: 0 })).status, 400);
  assert.equal((await send('PUT', `/sites/${SHIP}`, { loopMinutes: 99999 })).status, 400);
  assert.equal((await send('PUT', `/sites/${SHIP}`, { pinned: 'oui' })).status, 400);
  assert.equal((await send('PUT', `/sites/${SHIP}`, [1, 2])).status, 400);
  // Clés piégées : ignorées, aucune pollution d'Object
  const r = await send('PUT', `/sites/${SHIP}`, '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"name":"  Port de Judson  "}');
  assert.equal(r.status, 200);
  assert.equal(r.body.label, 'Port de Judson');
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.hasOwn(r.body.user, 'constructor'), false);
  assert.throws(() => parseMarketId('constructor'), /MarketID numérique/);
  assert.deepEqual(parseUserUpdate({ name: '', notes: null }), { name: null, notes: null });
  assert.deepEqual(parseUserUpdate({ loopMinutes: '12,5' }), { loopMinutes: 12.5 });
  // Durée contrôlée après l'arrondi au dixième : 0,04 n'est pas enregistré à 0 ; moins d'une minute refusé
  for (const bad of [0.04, 0.5, '0,9', -1, 1440.1, '  ', 'vite', true]) assert.throws(() => parseUserUpdate({ loopMinutes: bad }), /de 1 à 1 440 minutes/, String(bad));
  assert.deepEqual(parseUserUpdate({ loopMinutes: 0.96 }), { loopMinutes: 1 });
  assert.deepEqual(parseUserUpdate({ loopMinutes: 1440 }), { loopMinutes: 1440 });
  assert.equal((await send('PUT', `/sites/${SHIP}`, { loopMinutes: 0.04 })).status, 400);
});

test('PUT : échéance, boucle et épinglage pris en compte dans le plan ; archive écrite sur disque', async () => {
  const r = await send('PUT', `/sites/${SHIP}`, { deadline: '2099-01-01T00:00:00Z', loopMinutes: 20, notes: 'pour l’escadron', pinned: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.plan.loop.source, 'saisie');
  assert.equal(r.body.plan.deadline.source, 'saisie');
  assert.equal(r.body.plan.deadline.verdict, 'ok');
  assert.equal(r.body.user.pinned, true);
  mod.flush();
  const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  assert.equal(saved.sites[0].user.notes, 'pour l’escadron');
  assert.ok(!fs.readdirSync(dir).some((f) => f.endsWith('.tmp')));
});

test('événement en direct : chantier mis à jour et envoyé en temps réel', async () => {
  const before = sent.length;
  journal.emit('event', contributionAt(SHIP, '2026-11-02T20:00:00Z', { titanium: 700 }));
  journal.emit('event', { event: 'Music', timestamp: '2026-11-02T20:00:01Z' });
  await new Promise((r) => setTimeout(r, 400));
  const update = sent.slice(before).find((m) => m.type === 'colonisation:update');
  assert.ok(update);
  assert.equal(update.data.sites[0].mine, 1200);
});

test('état du jeu : seuls la soute, le vaisseau et l’amarrage renvoient la liste de courses', async () => {
  const wait = () => new Promise((r) => setTimeout(r, 400));
  game.emit('change'); // se cale sur l'état actuel (modifié plus haut sans prévenir)
  await wait();
  const before = sent.length;
  game.emit('change'); // carburant, solde, destination… : rien qui touche la liste de courses
  await wait();
  assert.equal(sent.length, before);
  game.snap = { ...game.snap, cargo: [{ name: 'titanium', label: 'Titanium', count: 100 }] };
  game.emit('change');
  await wait();
  const updates = sent.slice(before).filter((m) => m.type === 'colonisation:update');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].data.sites[0].toBuy, updates[0].data.sites[0].remaining - 100);
});

test('deux chantiers : la soute n’est déduite que pour le chantier actif', async () => {
  const OTHER = 4230000001;
  journal.emit('event', depotAt(OTHER, '2026-11-03T10:00:00Z'));
  await new Promise((r) => setTimeout(r, 50));
  // Pas à quai, SHIP épinglé (plus haut) : c'est lui le chantier actif ; 100 t de titane en soute
  const { body } = await get('/sites');
  assert.equal(body.active.site.marketId, SHIP);
  const ship = body.sites.find((x) => x.marketId === SHIP);
  const other = body.sites.find((x) => x.marketId === OTHER);
  assert.equal(ship.holdCounted, true);
  assert.equal(ship.toBuy, ship.remaining - 100);
  assert.equal(other.holdCounted, false);
  assert.equal(other.toBuy, other.remaining); // la soute n'est pas comptée deux fois
  const detail = (await get(`/sites/${OTHER}`)).body;
  assert.equal(detail.plan.holdCounted, false);
  assert.equal(detail.plan.items.find((i) => i.symbol === 'titanium').inHold, 0);
  assert.equal((await send('DELETE', `/sites/${OTHER}`)).status, 200);
});

test('sources : paramètres bornés, réseau simulé', async () => {
  const r = await get(`/sites/${SHIP}/sources?maxDistance=9999&maxDaysAgo=-3`);
  assert.equal(r.status, 200);
  assert.equal(r.body.maxDistance, 500);
  assert.equal(r.body.maxDaysAgo, 1);
  assert.equal(r.body.system, 'Bleae Thua ED-D c12-5');
  assert.ok(ardentCalls > 0);
});

test('diagnostic : seulement les événements Colonisation* bruts', async () => {
  const d = await get('/diagnostics');
  assert.equal(d.status, 200);
  assert.ok(d.body.raw.length >= 3);
  assert.ok(d.body.raw.every((ev) => /^Colonisation|^CompleteConstruction$/.test(ev.event)));
  assert.ok(Array.isArray(d.body.rules));
});

test('DELETE : chantier oublié, puis 404', async () => {
  const r = await send('DELETE', `/sites/${SHIP}`);
  assert.deepEqual(r.body, { forgotten: SHIP });
  assert.equal((await get(`/sites/${SHIP}`)).status, 404);
  assert.equal((await send('DELETE', `/sites/${SHIP}`)).status, 404);
  assert.equal((await get('/sites')).body.sites.length, 0);
});
