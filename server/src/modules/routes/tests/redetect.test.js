// « Re-détecter la boucle » (audit du 9 nov. 2026, tour 2) : si la détection propose une autre boucle du même système
// (autre station de départ, autre marchandise), rien n'est changé ni effacé sans confirmation ; même boucle : mise à
// jour directe, boucles gardées. Routeur et base factices, chronologie tirée du fixture des routes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLines } from '../../../core/journalFiles.js';
import { buildTimeline } from '../services/timeline.js';
import { detectRoute } from '../services/detector.js';
import { setupApi } from '../api.js';

const fixture = fileURLToPath(new URL('./fixtures/port-draught-cemiess.log', import.meta.url));
const timeline = buildTimeline(parseLines(fs.readFileSync(fixture, 'utf8')));
const PD = 'ICZ KC-U b3-4';
const d = detectRoute(timeline, { anchorSystem: PD });

function monter(route) {
  const handlers = new Map();
  const router = {};
  for (const m of ['get', 'post', 'put', 'patch', 'delete']) router[m] = (p, h) => handlers.set(`${m.toUpperCase()} ${p}`, h);
  const calls = { updates: [], deleted: 0 };
  const prisma = {
    route: {
      findUnique: async () => route,
      update: async ({ data }) => {
        calls.updates.push(data);
        return { ...route, ...data };
      },
    },
    loop: { count: async () => 7, deleteMany: async () => { calls.deleted += 1; } },
  };
  const tracker = { timeline, syncRoute: async () => {}, syncRouteQueued: async () => {}, enqueue: (fn) => fn(), notify: () => {} };
  setupApi(router, { prisma, tracker });
  const appeler = (body) => new Promise((resolve) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json: (v) => resolve({ statut: res.statusCode, corps: v }) };
    handlers.get('POST /routes/:id/redetect')({ params: { id: String(route.id) }, body }, res, (err) => resolve({ statut: err.status, erreur: err.publicMessage }));
  });
  return { appeler, calls };
}

const base = () => ({ id: 1, startSystem: PD, startStation: d.startStation, startMarketId: d.startMarketId ?? 0, startCommodity: d.startCommodity, structure: '{}', stations: '[]', systems: '[]', commodities: '[]', active: true, target: null });

test('même boucle : mise à jour directe, boucles gardées', async () => {
  const { appeler, calls } = monter(base());
  const r = await appeler({});
  assert.equal(r.statut, 200);
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.deleted, 0);
});

test('autre marchandise : 409 qui dit la différence et les boucles perdues, rien changé ; confirmé : remplacée', async () => {
  const { appeler, calls } = monter({ ...base(), startCommodity: 'autre-marchandise' });
  const r = await appeler({});
  assert.equal(r.statut, 409);
  assert.match(r.erreur, /^La détection propose une autre boucle : marchandise « .+ » au lieu de « autre-marchandise »\. Les 7 boucle\(s\)/);
  assert.deepEqual([calls.updates.length, calls.deleted], [0, 0], 'rien changé, rien effacé');
  const ok = await appeler({ confirm: true });
  assert.equal(ok.statut, 200);
  assert.deepEqual([calls.updates.length, calls.deleted], [1, 1]);
});

test('autre station de départ : 409 sans confirmation', async () => {
  if (!d.startMarketId) return; // fixture sans MarketID : rien à comparer
  const { appeler, calls } = monter({ ...base(), startStation: 'Autre station', startMarketId: 3700000001 });
  const r = await appeler({});
  assert.equal(r.statut, 409);
  assert.match(r.erreur, /départ de « .+ » au lieu de « Autre station »/);
  assert.equal(calls.updates.length, 0);
});
