// API des routes d'extension (express + fetch, base en mémoire, paliers en mémoire, journaux écrits à la main) :
// création et modification d'une route (C1), sauts illisibles (B49), casse des noms (B43), Coup d'œil et paliers
// déclarés (M11), historique d'une semaine passée (B52). Rien d'un joueur, rien d'écrit sur le disque.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { localGuard, jsonBody, bodyErrorMessage } from '../../core/localGuard.js';
import { registerProjects } from './projects.js';
import { MeritLog } from './merits.js';
import { Paliers } from './paliers.js';

const NOW = Date.parse('2026-11-14T12:00:00Z'); // samedi : semaine du jeudi 12 nov. à 7 h
const LAST_WEEK = Date.parse('2026-11-06T12:00:00Z');

function memoryPrisma() {
  let rows = [];
  let next = 1;
  const copy = (r) => (r ? { ...r } : null);
  return {
    expansionProject: {
      findMany: async () => [...rows].sort((a, b) => b.createdAt - a.createdAt).map(copy),
      findUnique: async ({ where }) => copy(rows.find((r) => r.id === where.id)),
      create: async ({ data }) => {
        const r = { id: next, description: '', ...data, createdAt: new Date(NOW + next), updatedAt: new Date(NOW) };
        next += 1;
        rows.push(r);
        return copy(r);
      },
      updateMany: async ({ where, data }) => {
        const r = rows.find((x) => x.id === where.id);
        if (!r) return { count: 0 };
        Object.assign(r, data);
        return { count: 1 };
      },
      deleteMany: async ({ where }) => {
        const before = rows.length;
        rows = rows.filter((r) => r.id !== where.id);
        return { count: before - rows.length };
      },
    },
  };
}

const held = (state, progress) => ({ ControllingPower: 'Aisling Duval', PowerplayState: state, PowerplayStateControlProgress: progress, PowerplayStateReinforcement: 100, PowerplayStateUndermining: 0 });
const arrival = (t, system, pos, extra = {}) => ({ timestamp: new Date(t).toISOString(), event: 'FSDJump', StarSystem: system, StarPos: pos, ...extra });

const log = new MeritLog();
for (const ev of [
  arrival(LAST_WEEK, 'Système Test A', [0, 0, 0], held('Exploited', 0.4)),
  arrival(NOW - 7200000, 'Système Test Départ', [0, 0, -12]),
  arrival(NOW - 3600000, 'Système Test A', [0, 0, 0], held('Fortified', 0.1)),
  arrival(NOW - 1800000, 'Système Test B', [3, 4, 12], held('Exploited', 0.97)),
  arrival(NOW - 900000, 'Système Test C', [3, 4, 30], { PowerplayState: 'Unoccupied', PowerplayConflictProgress: [{ Power: 'Aisling Duval', ConflictProgress: 0.3 }] }),
]) log.apply(ev);

const sent = [];
const paliers = new Paliers(null);
let server;
let base;
let guard = (req, res, next) => next();
let journalReady = true;

before(async () => {
  const app = express();
  app.use('/api', (req, res, next) => guard(req, res, next));
  app.use(jsonBody());
  const router = express.Router();
  registerProjects({ router, prisma: memoryPrisma(), broadcast: (type) => sent.push(type), merits: () => log, paliers, now: () => NOW, journalReady: () => journalReady });
  app.use('/api/modules/expansion', router);
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.publicMessage || bodyErrorMessage(err) || 'Erreur interne du serveur.' });
  });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  guard = localGuard({ port: server.address().port });
  base = `http://127.0.0.1:${server.address().port}/api/modules/expansion`;
});
after(() => {
  server?.closeAllConnections();
  server?.close();
});

const send = async (method, p, body, { header = true } = {}) => {
  const r = await fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'application/json', ...(header ? { 'X-Elite-Compagnon': '1' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const ROUTE = {
  name: 'Route Test',
  steps: [
    { name: 'système test départ', role: 'held-stronghold' },
    { name: 'Système Test A', role: 'fortified', jump: '' }, // calculé : 12 AL d'après les positions du journal
    { name: 'système test b', role: 'fortified', jump: '13' },
  ],
};

test('création et modification d’une route : même identifiant, revérifiée, diffusée (C1, B43, B49)', async () => {
  assert.equal((await send('POST', '/projects', ROUTE, { header: false })).status, 403, 'écriture sans l’en-tête de l’app');
  const created = await send('POST', '/projects', ROUTE);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const p = created.body;
  assert.deepEqual(p.steps.map((s) => [s.name, s.jump]), [['Système Test Départ', 0], ['Système Test A', 12], ['Système Test B', 13]], 'orthographe du journal, saut calculé');
  assert.equal(p.distance, 25);

  sent.length = 0;
  const edit = { name: 'Route Test renommée', description: 'Vers C', steps: [...ROUTE.steps, { name: 'Système Test C', role: 'target', jump: '18,0' }] };
  const put = await send('PUT', `/projects/${p.id}`, edit);
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.equal(put.body.id, p.id);
  assert.equal(put.body.name, 'Route Test renommée');
  assert.equal(put.body.steps.length, 4);
  assert.equal(put.body.steps[3].jump, 18);
  assert.deepEqual(sent, ['expansion:update', 'expansion:merits']);

  // Refus : rien n'est changé
  const far = await send('PUT', `/projects/${p.id}`, { ...edit, steps: [...ROUTE.steps, { name: 'Système Test C', role: 'target', jump: '21' }] });
  assert.equal(far.status, 400);
  assert.match(far.body.error, /hors de portée.*21 AL depuis Système Test B, portée 20 AL/);
  const bad = await send('PUT', `/projects/${p.id}`, { ...edit, steps: [...ROUTE.steps, { name: 'Système Test C', role: 'target', jump: '-40' }] });
  assert.match(bad.body.error, /saut illisible « -40 »/);
  const [still] = (await send('GET', '/projects')).body;
  assert.equal(still.steps.length, 4);
  assert.equal(still.name, 'Route Test renommée');

  assert.equal((await send('PUT', '/projects/999', edit)).status, 404);
  assert.equal((await send('PUT', '/projects/abc', edit)).status, 404);
  assert.equal((await send('PUT', `/projects/${p.id}`, edit, { header: false })).status, 403);
});

test('journaux pas encore lus : un saut laissé vide attend (503), un saut tapé passe', async () => {
  journalReady = false;
  try {
    const wait = await send('POST', '/projects', ROUTE);
    assert.equal(wait.status, 503);
    assert.match(wait.body.error, /Lecture de tes journaux en cours.*Réessaie dans un instant/);
    const typed = await send('POST', '/projects', { ...ROUTE, name: 'Route Test tapée', steps: ROUTE.steps.map((s, i) => (i ? { ...s, jump: '12' } : s)) });
    assert.equal(typed.status, 201, JSON.stringify(typed.body));
    assert.equal((await send('DELETE', `/projects/${typed.body.id}`)).status, 204);
  } finally {
    journalReady = true;
  }
});

test('sauts d’après les journaux, pour l’éditeur, et règles de portée', async () => {
  const q = new URLSearchParams([['systems', 'système test départ'], ['systems', 'Système Test A'], ['systems', 'Inconnu']]);
  const { body } = await send('GET', `/jumps?${q}`);
  assert.deepEqual(body.steps, [
    { name: 'Système Test Départ', known: true, jump: null },
    { name: 'Système Test A', known: true, jump: 12 },
    { name: 'Inconnu', known: false, jump: null },
  ]);
  const rules = (await send('GET', '/rules')).body;
  assert.deepEqual(rules.reach, { 'held-stronghold': 30, 'held-fortified': 20, stronghold: 30, fortified: 20 });
  assert.equal(rules.maxSteps, 60);
  assert.deepEqual(rules.bands, { Unoccupied: 120000, Exploited: 350000, Fortified: 650000, Stronghold: 1000000 });
});

test('palier déclaré (casse libre) : le Coup d’œil passe à l’étape suivante (M11) ; semaine passée (B52)', async () => {
  // A est Consolidé : B (0,97) est l'étape en cours
  assert.equal((await send('GET', '/here?system=Système Test B')).body.index, 2);
  const declared = await send('PUT', '/palier', { system: 'SYSTÈME TEST B', atteint: true });
  assert.equal(declared.status, 200, JSON.stringify(declared.body));
  assert.deepEqual(declared.body, { system: 'Système Test B', atteint: true });
  assert.equal((await send('GET', '/here?system=Système Test B')).body, null);
  assert.equal((await send('GET', '/here?system=système test c')).body.index, 3);

  const [p] = (await send('GET', '/projects')).body;
  const now = (await send('GET', `/merits?project=${p.id}`)).body;
  assert.equal(now.progress.index, 3);
  assert.equal(now.steps[2].declared, true);
  // Semaine du 6 nov. : A était encore Exploité à 0,4, et aucun palier déclaré cette semaine-là
  const past = (await send('GET', `/merits?project=${p.id}&week=${LAST_WEEK}`)).body;
  assert.equal(past.current, false);
  assert.deepEqual(past.progress, { index: 1, frac: 0.4 });
  assert.equal(past.steps[1].reading.state, 'Exploited');
  assert.equal(past.steps[2].reading, null, 'B relevé après cette semaine');
  assert.equal(past.steps[2].declared, false);
  assert.equal((await send('PUT', '/palier', { system: 'Ailleurs', atteint: true })).status, 404);
});
