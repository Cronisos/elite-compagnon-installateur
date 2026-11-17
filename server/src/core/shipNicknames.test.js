// Noms donnés aux vaisseaux, par (commandant, ShipID) (audit du 15 nov. 2026, M7) : base simulée en mémoire, avec la
// contrainte de la migration 0002 (un nom par commandant et par ShipID). « Testeur » (F0000001) et « Testeur 2 »
// (F0000002) ont chacun un vaisseau n° 1.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShipNicknames } from './shipNicknames.js';

const UN = 'F0000001';
const DEUX = 'F0000002';

/** Table ShipNickname simulée : where sur id, commanderId (null compris), shipId (ou { in }). */
function base(rows = []) {
  let id = 0;
  const table = rows.map((r) => ({ id: ++id, commanderId: null, updatedAt: new Date(), ...r }));
  const match = (where = {}) => (r) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && Array.isArray(v.in) ? v.in.includes(r[k]) : r[k] === v));
  const unique = (r) => {
    if (r.commanderId !== null && table.some((x) => x !== r && x.commanderId === r.commanderId && x.shipId === r.shipId)) throw new Error('UNIQUE constraint failed: ShipNickname.commanderId, ShipNickname.shipId');
  };
  return {
    table,
    shipNickname: {
      findMany: async () => table.map((r) => ({ ...r })),
      findFirst: async ({ where }) => {
        const r = table.find(match(where));
        return r ? { ...r } : null;
      },
      create: async ({ data }) => {
        const r = { id: ++id, updatedAt: new Date(), ...data };
        unique(r);
        table.push(r);
        return { ...r };
      },
      update: async ({ where, data }) => {
        const r = table.find(match(where));
        Object.assign(r, data);
        unique(r);
        return { ...r };
      },
      updateMany: async ({ where, data }) => {
        const list = table.filter(match(where));
        for (const r of list) {
          Object.assign(r, data);
          unique(r);
        }
        return { count: list.length };
      },
      deleteMany: async ({ where }) => {
        const before = table.length;
        for (let i = table.length - 1; i >= 0; i--) if (match(where)(table[i])) table.splice(i, 1);
        return { count: before - table.length };
      },
    },
  };
}

test('deux commandants, même ShipID : chacun son nom ; le nom de l’Anaconda ne s’affiche jamais sur la Cobra', async () => {
  const db = base();
  let single = false;
  const n = await new ShipNicknames({ prisma: db, single: () => single }).load();
  assert.equal(await n.set(UN, 1, '  Grande Test  '), 'Grande Test');
  assert.equal(n.get(1, UN), 'Grande Test');
  assert.equal(n.get(1, DEUX), null, 'avant : le nom de l’Anaconda sur la Cobra');
  await n.set(DEUX, 1, 'Petite Test');
  assert.deepEqual(n.view(UN), { 1: 'Grande Test' });
  assert.deepEqual(n.view(DEUX), { 1: 'Petite Test' });
  assert.equal(db.table.length, 2);
  // Effacer le nom de la Cobra ne touche pas celui de l'Anaconda
  assert.equal(await n.set(DEUX, 1, ''), '');
  assert.deepEqual(n.view(DEUX), {});
  assert.equal(n.get(1, UN), 'Grande Test');
  await assert.rejects(n.set('../x', 1, 'x'), /Commandant invalide/);
  single = true; // sans effet : chacun a ses lignes
  assert.equal(n.get(1, DEUX), null);
});

test('noms d’avant les commandants : valent pour le seul commandant connu, pour personne quand il y en a deux, puis rattachés au plus vu', async () => {
  const db = base([{ shipId: 1, nickname: 'Grande Test' }, { shipId: 7, nickname: 'Septième Test' }]);
  let single = true;
  const n = await new ShipNicknames({ prisma: db, single: () => single }).load();
  assert.equal(n.get(1, UN), 'Grande Test', 'un seul commandant : le nom d’avant est le sien');
  assert.equal(n.get(1, null), 'Grande Test', 'commandant inconnu');
  single = false;
  assert.equal(n.get(1, DEUX), null, 'deux commandants, pas encore rattaché : à personne');
  assert.deepEqual(n.view(DEUX), {});
  // Le compte principal a déjà renommé son n° 7 : son nom passe avant celui d'avant
  await n.set(UN, 7, 'Septième à moi');
  assert.equal(await n.adopt(UN), 1);
  assert.deepEqual(db.table.map((r) => [r.commanderId, r.shipId, r.nickname]).sort(), [[UN, 1, 'Grande Test'], [UN, 7, 'Septième à moi']]);
  assert.deepEqual(n.view(UN), { 1: 'Grande Test', 7: 'Septième à moi' });
  assert.deepEqual(n.view(DEUX), {});
  assert.equal(await n.adopt(DEUX), 0, 'plus rien à rattacher');
  assert.equal(await n.adopt(null), 0, 'commandant inconnu : rien');
});

test('seul commandant, nom d’avant renommé ou effacé : la ligne d’avant devient la sienne (jamais deux noms pour un vaisseau)', async () => {
  const db = base([{ shipId: 1, nickname: 'Ancien Test' }, { shipId: 2, nickname: 'Deuxième Test' }]);
  const n = await new ShipNicknames({ prisma: db, single: () => true }).load();
  await n.set(UN, 1, 'Nouveau Test');
  assert.deepEqual(db.table.filter((r) => r.shipId === 1).map((r) => [r.commanderId, r.nickname]), [[UN, 'Nouveau Test']]);
  await n.set(UN, 2, '');
  assert.equal(db.table.some((r) => r.shipId === 2), false, 'effacé pour de bon : le nom d’avant ne revient pas');
});
