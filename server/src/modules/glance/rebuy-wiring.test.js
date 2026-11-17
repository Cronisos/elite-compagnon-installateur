// Branchement du rachat dans le module Coup d'œil (index.js) : résumé, rappels, perte relevée avant l'effacement,
// fenêtre ouverte au décollage. Journal, état du jeu, base et overlay sont simulés : rien n'est lu ni écrit sur le disque.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import glance, { referenceShipNames } from './index.js';

// Noms de types de vaisseaux simulés : les données de référence ne sont pas lues
function setup({ balance, cargo = [], docked, shipTypeName = () => null }) {
  const journal = new EventEmitter();
  const interest = new Set();
  journal.addInterest = (names) => names.forEach((n) => interest.add(n));
  const game = new EventEmitter();
  game.snapshot = () => ({ commander: 'Testeur', balance, balanceAt: null, cargo, cargoCount: cargo.reduce((n, c) => n + c.count, 0), docked });
  const prisma = { glanceValue: { findMany: async () => [] }, glanceGoal: { findMany: async () => [] } };
  const routes = new Map();
  const router = new Proxy({}, { get: (_, method) => (path, fn) => routes.set(`${method} ${path}`, fn) });
  const windows = [];
  const overlay = { setExtra: (page, on) => windows.push([page, on]) };
  const summary = () => new Promise((resolve, reject) => {
    routes.get('get /summary')({}, { json: resolve }, reject);
  });
  return { journal, interest, game, prisma, router, overlay, windows, summary, ready: glance.register({ router, prisma, journal, game, broadcast: () => {}, overlay }, { shipTypeName }) };
}

const history = [
  { event: 'LoadGame', timestamp: '2026-11-07T21:15:18Z', Ship_Localised: 'Type-11 Prospector', ShipID: 43, GameMode: 'Group', Group: 'EDFR', Credits: 1_000_000 },
  { event: 'Loadout', timestamp: '2026-11-07T21:15:27Z', Ship: 'lakonminer', ShipID: 43, HullValue: 64_687_569, ModulesValue: 26_311_397, Rebuy: 4_498_040 },
  { event: 'Bounty', timestamp: '2026-11-07T21:20:00Z', TotalReward: 500_000 },
  { event: 'Died', timestamp: '2026-11-07T21:30:00Z' },
  { event: 'Resurrect', timestamp: '2026-11-07T21:30:40Z', Option: 'rebuy', Cost: 4_498_040, Bankrupt: false },
];

test('résumé : rachat non couvert, mode de groupe, perte relevée avant que les primes ne soient effacées', async () => {
  const s = setup({ balance: 1_000_000 });
  await s.ready;
  s.journal.emit('ready', { history });
  const sum = await s.summary();
  assert.equal(sum.rebuy.covered, false);
  assert.equal(sum.rebuy.missing, 3_498_040);
  assert.equal(sum.rebuy.mode.group, 'EDFR');
  assert.match(sum.rebuy.resurrect.loss, /Perdu : 500/);
  assert.equal(sum.toCash.bounties, 0); // effacées par la destruction, comme avant
  assert.equal(sum.reminders[0].level, 'danger');
  assert.match(sum.reminders[0].text, /^Rachat NON COUVERT/);
});

test('décollage en direct sans rachat couvert : la fenêtre Coup d’œil s’ouvre, puis se ferme à quai', async () => {
  const s = setup({ balance: 1_000_000 });
  await s.ready;
  s.journal.emit('ready', { history: history.slice(0, 2) });
  s.journal.emit('event', { event: 'Undocked', timestamp: new Date().toISOString(), StationName: 'Flinders City', Taxi: false, Multicrew: false });
  assert.deepEqual(s.windows, [['glance', true]]);
  assert.match((await s.summary()).reminders[0].text, /^Tu as décollé sans pouvoir payer ton rachat/);
  s.journal.emit('event', { event: 'Docked', timestamp: new Date().toISOString(), StationName: 'Flinders City' });
  assert.deepEqual(s.windows, [['glance', true], ['glance', false]]);
});

test('décollage avec rachat couvert : aucune fenêtre ouverte', async () => {
  const s = setup({ balance: 823_047_781 });
  await s.ready;
  s.journal.emit('ready', { history: history.slice(0, 2) });
  s.journal.emit('event', { event: 'Undocked', timestamp: new Date().toISOString(), Taxi: false, Multicrew: false });
  s.journal.emit('event', { event: 'Docked', timestamp: new Date().toISOString() });
  assert.deepEqual(s.windows, []);
  assert.equal((await s.summary()).rebuy.covered, true);
});

test('limpets en soute : chiffrés au prix de BuyDrones (5 nov. 2026), conseil selon l’état à quai du jeu', async () => {
  const s = setup({ balance: 1_000_000, cargo: [{ name: 'drones', label: 'Drone', count: 30 }], docked: true });
  await s.ready;
  assert.ok(s.interest.has('BuyDrones') && s.interest.has('SellDrones'));
  const buy = { timestamp: '2026-11-05T15:23:03Z', event: 'BuyDrones', Type: 'Drones', Count: 332, BuyPrice: 101, TotalCost: 33_532 };
  s.journal.emit('ready', { history: [...history.slice(0, 2), buy] });
  const sum = await s.summary();
  assert.equal(sum.rebuy.atStake.cargo, 30 * 101);
  assert.deepEqual(sum.rebuy.atStake.unpriced, []);
  assert.equal(sum.rebuy.docked, true);
  assert.match(sum.reminders[0].text, /Ne décolle pas avec/);
});

test('partie lancée dans le SRV (7 nov. 2026) : la case Rachat nomme le Type-11 Prospector, pas « Lakonminer »', async () => {
  const s = setup({ balance: 1_000_000, shipTypeName: (t) => (t === 'lakonminer' ? 'Type-11 Prospector' : null) });
  await s.ready;
  s.journal.emit('ready', {
    history: [
      { event: 'LoadGame', timestamp: '2026-11-07T08:15:50Z', Ship: 'MEV_Rhino', Ship_Localised: 'VRS Rhino', ShipID: 44, GameMode: 'Solo', Credits: 710_436_236 },
      { event: 'Loadout', timestamp: '2026-11-07T08:25:53Z', Ship: 'lakonminer', ShipID: 43, ShipName: '', ShipIdent: 'TS-03', Rebuy: 4_498_040 },
    ],
  });
  assert.equal((await s.summary()).rebuy.ship.label, 'Type-11 Prospector');
});

test('noms des types de vaisseaux d\'après les données de référence : lues une fois, attendues tant qu\'absentes', () => {
  // Forme de core/reference/refdata.js : shipKey, journalShip (FDevIDs shipyard.csv), shipName
  const journalShip = new Map([['lakonminer', { key: 'type_11_prospector', name: 'Type-11 Prospector' }], ['nokey', { key: null, name: 'Sans Clé' }]]);
  const ref = {
    journalShip,
    shipKey: (t) => journalShip.get(t.toLowerCase())?.key || null,
    shipName: (key, t) => (key === 'type_11_prospector' ? 'Type-11 Prospector' : journalShip.get(t.toLowerCase())?.name || t),
  };
  let loads = 0;
  let available = false;
  const names = referenceShipNames(() => (loads++, available ? ref : null));
  assert.equal(names('lakonminer'), null); // données pas encore téléchargées
  available = true;
  assert.equal(names('lakonminer'), 'Type-11 Prospector');
  assert.equal(names('LakonMiner'), 'Type-11 Prospector');
  assert.equal(names('nokey'), 'Sans Clé');
  assert.equal(names('nouveau_vaisseau'), null); // inconnu des données : le nom interne reste
  assert.equal(names(null), null);
  assert.equal(loads, 2);
  // Données abîmées : pas d'erreur, pas de nom
  assert.equal(referenceShipNames(() => { throw new Error('JSON invalide'); })('lakonminer'), null);
});
