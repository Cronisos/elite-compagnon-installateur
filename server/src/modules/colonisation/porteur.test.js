// Cargaison de ton porteur dans la liste de courses : lue au module Porteur (API locale simulée), déduite de « à
// acheter » pour le chantier actif seulement, après la soute ; réglage « compter mon porteur » gardé sur le disque.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import colonisation from './index.js';
import { shoppingList } from './plan.js';
import { depotAt, dockedAt, DOCKED_SHIP } from './fixtures/examples.js';

const SHIP = DOCKED_SHIP.MarketID;

test('liste de courses : reste − soute − porteur, le porteur seulement pour ce que la soute ne couvre pas', () => {
  const resources = [{ symbol: 'steel', name: 'Acier', required: 1000, provided: 200 }, { symbol: 'water', name: 'Eau', required: 100, provided: 100 }];
  const [steel, water] = shoppingList(resources, [{ name: 'steel', count: 300 }], new Map([['steel', 900], ['water', 50]]));
  assert.deepEqual([steel.remaining, steel.inHold, steel.onCarrier, steel.toBuy], [800, 300, 500, 0]);
  assert.deepEqual([water.onCarrier, water.toBuy], [0, 0]);
  const sans = shoppingList(resources, [], new Map());
  assert.deepEqual([sans[0].onCarrier, sans[0].toBuy], [0, 800]);
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-colonisation-porteur-'));
const journal = Object.assign(new EventEmitter(), { addInterest() {}, stateData: {} });
const game = Object.assign(new EventEmitter(), {
  snap: { docked: true, marketId: SHIP, cargo: [], cargoCount: 0, loadout: { ship: 'type9', cargoCapacity: 720 } },
  snapshot() { return JSON.parse(JSON.stringify(this.snap)); },
});
const porteur = { id: 3700000001, mine: true, name: 'PORTEUR 1', callsign: 'TST-001', cargo: [{ symbol: 'steel', name: 'Acier', count: 2000 }], total: 2000, reported: { cargo: 2500, at: '2026-11-19T20:00:00Z' }, gap: 500 };
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
    localFetchImpl: async (url) => new Response(JSON.stringify(/carrier\/cargo$/.test(url) ? { carriers: [{ ...porteur, mine: false, id: 1 }, porteur] } : {}), { status: 200 }),
  });
  app.use('/api/modules/colonisation', router);
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.publicMessage || 'Erreur interne du serveur.' }));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api/modules/colonisation`;
  journal.emit('ready', { history: [dockedAt(SHIP, '2026-11-19T19:00:00Z'), depotAt(SHIP, '2026-11-19T19:00:05Z')] });
});

after(() => {
  server.closeAllConnections();
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const sites = async () => (await fetch(`${base}/sites`)).json();
const reglage = (carrier) => fetch(`${base}/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ carrier }) });

test('ton porteur compté dans « à acheter » du chantier actif, l’écart au total du jeu montré ; réglage coupé : plus rien', async () => {
  const avec = await sites();
  assert.deepEqual(avec.carrier, { counted: true, name: 'PORTEUR 1', callsign: 'TST-001', total: 2000, reported: porteur.reported, gap: 500, since: null });
  const steel = avec.active.site.plan.items.find((i) => i.symbol === 'steel');
  assert.equal(steel.onCarrier, Math.min(2000, steel.remaining));
  assert.equal(steel.toBuy, Math.max(0, steel.remaining - 2000));
  assert.equal(avec.active.site.plan.totals.onCarrier, steel.onCarrier);
  // Coupé : rien du porteur, et le réglage reste après un redémarrage (fichier à côté de l'archive)
  assert.equal((await reglage(false)).status, 200);
  const sans = await sites();
  assert.equal(sans.carrier.counted, false);
  const s2 = sans.active.site.plan.items.find((i) => i.symbol === 'steel');
  assert.deepEqual([s2.onCarrier, s2.toBuy], [0, s2.remaining]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'colonisation-reglages.json'), 'utf8')), { carrier: false });
  assert.equal((await reglage('oui')).status, 400);
  await reglage(true);
});
