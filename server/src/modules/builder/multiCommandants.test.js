// Plusieurs commandants sur le même PC (audit du 15 nov. 2026, M7) : « Testeur » (F0000001) et « Testeur 2 » (F0000002)
// ont chacun un vaisseau n° 1. Mes vaisseaux, leurs noms et leurs builds liés : ceux du commandant chargé ; avant, un seul
// Loadout par ShipID (le dernier vu). Journal et base simulés ; nécessite les données de référence (sinon ignoré).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { REF_DIR } from '../../core/reference/download.js';
import { COMMANDER } from '../../core/commander.js';
import builder from './index.js';

const present = fs.existsSync(`${REF_DIR}/edsy/eddb.js`) && fs.existsSync(`${REF_DIR}/meta.json`);
const withEdsy = present ? test : test.skip;
const panther = JSON.parse(fs.readFileSync(new URL('./fixtures/panther-loadout.json', import.meta.url), 'utf8'));

const UN = { FID: 'F0000001', Commander: 'Testeur' };
const DEUX = { FID: 'F0000002', Commander: 'Testeur 2' };
const loadGame = (who) => ({ event: 'LoadGame', timestamp: '2026-11-09T10:00:00Z', ...who, Ship: 'PantherMkII', ShipID: 1 });
const loadout = (ident) => ({ ...panther, ShipID: 1, ShipName: '', ShipIdent: ident });

function setup(history) {
  const journal = new EventEmitter();
  journal.addInterest = () => {};
  const game = new EventEmitter();
  game.snapshot = () => ({ system: null });
  const rows = [];
  const nicknames = [{ id: 1, commanderId: 'F0000001', shipId: 1, nickname: 'Grande Test' }];
  const match = (where = {}) => (r) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' ? Object.hasOwn(v, 'not') && r[k] !== v.not : (r[k] ?? null) === v));
  const prisma = {
    build: {
      findMany: async ({ where } = {}) => rows.filter(match(where)),
      findUnique: async ({ where }) => rows.find((r) => r.id === where.id) || null,
      create: async ({ data }) => {
        const r = { id: rows.length + 1, createdAt: new Date(), updatedAt: new Date(), notes: '', ...data };
        rows.push(r);
        return r;
      },
      update: async ({ where, data }) => Object.assign(rows.find((r) => r.id === where.id), data),
      updateMany: async ({ where, data }) => {
        const list = rows.filter(match(where));
        for (const r of list) Object.assign(r, data);
        return { count: list.length };
      },
    },
    shipNickname: { findMany: async () => nicknames.map((n) => ({ ...n })) },
  };
  const routes = new Map();
  const router = new Proxy({}, { get: (_, method) => (p, fn) => routes.set(`${method} ${p}`, fn) });
  builder.register({ router, prisma, journal, game });
  journal.emit('ready', { history });
  const call = (method, p, req = {}) => new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json: resolve };
    routes.get(`${method} ${p}`)({ params: {}, body: {}, query: {}, ...req }, res, reject);
  });
  return { call, rows, journal };
}

withEdsy('Mes vaisseaux : le n° 1 du commandant chargé, son nom à lui ; retour au compte principal : le sien', async () => {
  const b = setup([loadGame(UN), loadout('UN-01'), loadGame(DEUX), loadout('DE-02')]);
  let fleet = await b.call('get', '/fleet');
  assert.equal(fleet.length, 1);
  assert.equal(fleet[0].ident, 'DE-02', 'avant : un seul Loadout par ShipID, le dernier vu');
  assert.equal(fleet[0].nickname, null, 'le nom de l’Anaconda du compte principal ne passe pas au second compte');
  assert.equal((await b.call('get', '/fleet/:gameShipId/fiche', { params: { gameShipId: '1' } })).ident, 'DE-02');
  b.journal.emit('event', loadGame(UN));
  fleet = await b.call('get', '/fleet');
  assert.deepEqual([fleet[0].ident, fleet[0].nickname], ['UN-01', 'Grande Test']);
});

withEdsy('builds liés : au vaisseau de CE commandant ; modifier celui de l’autre compte ne le lui prend pas', async () => {
  const b = setup([loadGame(UN), loadout('UN-01'), loadGame(DEUX), loadout('DE-02')]);
  const start = await b.call('post', '/start', { body: { gameShipId: 1 } });
  const mien = await b.call('post', '/builds', { body: { ...start.build, name: 'Build du second compte', gameShipId: 1 } });
  assert.equal(b.rows[0].commanderId, 'F0000002');
  assert.equal(Object.hasOwn(mien, 'commanderId'), false, 'le FID reste dans le serveur');
  // Build du compte principal pour son n° 1, et un build d'avant les commandants
  b.rows.push({ ...b.rows[0], id: 2, name: 'Build du compte principal', commanderId: 'F0000001' });
  b.rows.push({ ...b.rows[0], id: 3, name: 'Build d’avant', commanderId: null });
  const vue = await b.call('get', '/fleet/:gameShipId/builds', { params: { gameShipId: '1' } });
  assert.deepEqual(vue.lies.map((x) => x.name), ['Build du second compte'], 'deux commandants : l’ancien n’est à personne tant qu’il n’est pas rattaché');
  assert.deepEqual(vue.modele.map((x) => x.name).sort(), ['Build d’avant', 'Build du compte principal'].sort());
  // Liste des builds : « mine » dit à l'interface si le vaisseau visé est à toi (le même numéro chez l'autre ne l'est pas)
  const liste = Object.fromEntries((await b.call('get', '/builds')).map((x) => [x.name, x.mine]));
  assert.deepEqual(liste, { 'Build du second compte': true, 'Build du compte principal': false, 'Build d’avant': false });
  // Le build du compte principal, modifié pendant que le second compte joue : il vise toujours l'Anaconda… du premier
  await b.call('put', '/builds/:id', { params: { id: '2' }, body: { ...start.build, name: 'Build du compte principal', gameShipId: 1 } });
  assert.equal(b.rows[1].commanderId, 'F0000001');
});

withEdsy('builds d’avant les commandants : rattachés au plus vu des journaux à la relecture', async () => {
  const b = setup([]);
  b.rows.push({ id: 1, name: 'Ancien', shipId: 1, shipType: 'x', gameShipId: 1, commanderId: null, slots: '{}', notes: '' }, { id: 2, name: 'Sans vaisseau', shipId: 1, shipType: 'x', gameShipId: null, commanderId: null, slots: '{}', notes: '' });
  const ev = (o, who) => Object.assign(o, { [COMMANDER]: who.FID });
  b.journal.emit('ready', { history: [ev(loadGame(UN), UN), ev(loadGame(UN), UN), ev(loadGame(DEUX), DEUX)] });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(b.rows.map((r) => r.commanderId), ['F0000001', null]);
});
