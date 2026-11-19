// Routes du module Colonisation avec le projet de l'escadron : la vue du module Escadron est simulée (son API locale),
// le journal et l'état du jeu aussi. Le HUD prend le premier chantier en cours du projet ; un chantier connu par
// l'escadron seul a sa page ; ?local=1 ne rend que ta propre lecture (celle que le module Escadron envoie).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import colonisation from './index.js';
import { depotAt, dockedAt, DOCKED_SHIP } from './fixtures/examples.js';

const SHIP = DOCKED_SHIP.MarketID;
const SYS = DOCKED_SHIP.StarSystem;
const AILLEURS = 777;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-colonisation-escadron-'));
const journal = Object.assign(new EventEmitter(), { addInterest() {}, stateData: {} });
const game = Object.assign(new EventEmitter(), {
  snap: { docked: false, marketId: null, cargo: [{ name: 'steel', count: 100 }], loadout: { ship: 'type9', cargoCapacity: 720 } },
  snapshot() { return JSON.parse(JSON.stringify(this.snap)); },
});
const later = new Date(Date.now() + 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
let squad = { actif: true, pret: true, chef: false, version: 1, projet: { systems: [SYS], sites: [{ marketId: AILLEURS, system: SYS, name: 'Port' }, { marketId: SHIP, system: SYS }] }, releves: [] };
let server;
let base;

before(async () => {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  await colonisation.register({
    router, journal, game, broadcast: () => {}, getSettings: async () => ({}), dataFile: path.join(dir, 'colonisation.json'), saveDelayMs: 10,
    fetchImpl: async () => ({ status: 200, ok: true, json: async () => [] }),
    selfUrl: 'http://127.0.0.1:9',
    localFetchImpl: async (url) => {
      assert.match(url, /\/api\/modules\/escadron\/colonisation$/);
      return new Response(JSON.stringify(squad), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  app.use('/api/modules/colonisation', router);
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.publicMessage || 'Erreur interne du serveur.' }));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api/modules/colonisation`;
  journal.emit('ready', { history: [dockedAt(SHIP, '2026-11-01T20:00:00Z'), depotAt(SHIP, '2026-11-01T20:00:05Z')] });
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

test('projet de l’escadron : l’ordre du chef, un chantier relevé par un autre membre, ta soute déduite au premier en cours', async () => {
  squad = {
    ...squad,
    releves: [{ marketId: AILLEURS, system: SYS, station: 'Planetary Construction Site: Port', at: later, progress: 0.1, complete: false, failed: false, resources: [{ symbol: 'steel', name: 'Acier', required: 1000, provided: 100 }], cmdr: 'Testeur 2' }],
  };
  const { body } = await get('/escadron');
  assert.equal(body.escadron.actif, true);
  assert.equal(body.escadron.releves, undefined); // les relevés bruts restent au module Escadron
  assert.deepEqual(body.projet.sites.map((s) => [s.priority, s.marketId, s.local]), [[1, AILLEURS, false], [2, SHIP, true]]);
  const premier = body.projet.sites[0];
  assert.equal(premier.label, 'Chantier planétaire · Port');
  assert.deepEqual(premier.releve, { by: 'Testeur 2', at: later });
  assert.equal(premier.plan.totals.remaining, 900);
  assert.equal(premier.plan.totals.toBuy, 800); // 100 t d'acier en soute, comptées pour le premier chantier en cours
  assert.equal(body.projet.sites[1].plan.holdCounted, false);
  // HUD : pas à quai, rien d'épinglé : le premier chantier en cours du projet
  const active = (await get('/active')).body;
  assert.equal(active.reason, 'escadron');
  assert.equal(active.site.marketId, AILLEURS);
  assert.equal(active.site.local, false);
  // Sa page existe, sans rien à oublier ni régler ; ?local=1 ne le connaît pas
  const page = await get(`/sites/${AILLEURS}`);
  assert.equal(page.status, 200);
  assert.equal(page.body.releve.by, 'Testeur 2');
  assert.equal((await get(`/sites/${AILLEURS}?local=1`)).status, 404);
});

test('ton relevé plus ancien que celui de l’escadron : la page montre le sien, ?local=1 le tien', async () => {
  squad = {
    ...squad,
    releves: [{ marketId: SHIP, system: SYS, at: later, progress: 0.9, complete: false, failed: false, resources: [{ symbol: 'steel', name: 'Acier', required: 10, provided: 9 }], cmdr: 'Testeur 2' }],
  };
  await get('/escadron'); // relit la vue du module Escadron
  const page = (await get(`/sites/${SHIP}`)).body;
  assert.equal(page.local, true);
  assert.equal(page.releve.by, 'Testeur 2');
  assert.equal(page.plan.totals.remaining, 1);
  const mien = (await get(`/sites/${SHIP}?local=1`)).body;
  assert.equal(mien.releve, null);
  assert.notEqual(mien.plan.totals.remaining, 1);
  // Projet coupé ici : plus rien de l'escadron, le chantier redevient le tien
  squad = { ...squad, actif: false };
  const seul = await get('/escadron');
  assert.equal(seul.body.projet, null);
  assert.equal((await get(`/sites/${SHIP}`)).body.releve, null);
  assert.notEqual((await get('/active')).body?.reason, 'escadron');
});
