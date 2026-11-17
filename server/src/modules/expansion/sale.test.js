// Tests du branchement du suivi des ventes : relecture de l'historique, fenêtre en jeu à quai, API et réglage.
// Journal, routeur et overlay factices ; fichier du module dans un dossier temporaire du système. Aucun réseau.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inventoryOf, registerSale, SALE_PAGE } from './sale.js';

const ev = (timestamp, event, extra = {}) => ({ timestamp, event, ...extra });

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-vente-'));
  const journal = Object.assign(new EventEmitter(), { stateData: {}, interest: new Set(), addInterest(n) { for (const x of n) this.interest.add(x); } });
  const routes = {};
  const router = Object.fromEntries(['get', 'put', 'post', 'delete'].map((m) => [m, (p, h) => { routes[`${m.toUpperCase()} ${p}`] = h; }]));
  const sent = [];
  const windows = [];
  registerSale({
    router,
    journal,
    broadcast: (type, data) => sent.push([type, data]),
    overlay: { setExtra: (page, on) => windows.push([page, on]) },
    file: path.join(dir, 'expansion-sales.json'),
  });
  const call = (key, { query = {}, body } = {}) => {
    let out = null;
    routes[key]({ query, body }, { json: (d) => { out = d; } });
    return out;
  };
  return { dir, journal, call, sent, windows, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const HISTORY = [
  ev('2026-11-06T17:00:00Z', 'Powerplay', { Power: 'Aisling Duval', Merits: 1000 }),
  ev('2026-11-06T17:00:01Z', 'FSDJump', { StarSystem: 'Synuefe GA-I b57-6', PowerplayState: 'Unoccupied', Powers: ['Aisling Duval'] }),
  ...Array.from({ length: 5 }, () => ev('2026-11-06T17:05:00Z', 'MiningRefined', { Type: '$iridium_name;' })),
  ev('2026-11-06T17:10:00Z', 'Docked', { StarSystem: 'Synuefe GA-I b57-6', StationName: 'Rorschach Terminal', StationType: 'Outpost', MarketID: 5 }),
];

const tick = (ms = 300) => new Promise((r) => setTimeout(r, ms)); // publication groupée (250 ms)

test('lancement : historique relu, prévision diffusée ; fenêtre en jeu ouverte à quai dès que le jeu écrit', async () => {
  const s = setup();
  assert.ok(s.journal.interest.has('MarketSell') && s.journal.interest.has('MiningRefined'));
  s.journal.stateData.cargo = { Vessel: 'Ship', Count: 5, Inventory: [{ Name: 'iridium', Count: 5 }] };
  s.journal.emit('ready', { history: [...HISTORY, ev('2026-11-06T17:10:01Z', 'Music', {})] });
  const f = s.call('GET /sale');
  assert.equal(f.docked, true);
  assert.equal(f.lines[0].verdict, 'zero');
  // Le dernier « à quai » du journal ne suffit pas : le jeu a pu planter, la fenêtre s'ouvrirait sur le bureau
  assert.deepEqual(s.windows.at(-1), [SALE_PAGE, false]);
  assert.equal(s.sent.at(-1)[0], 'expansion:sale');
  assert.ok(fs.existsSync(path.join(s.dir, 'expansion-sales.json')));
  s.journal.emit('event', ev('2026-11-06T17:10:05Z', 'Music', { MusicTrack: 'Starport' }));
  await tick();
  assert.deepEqual(s.windows.at(-1), [SALE_PAGE, true]);
  s.done();
});

test('marchandises Powerplay et objets de sauvetage : pas de prévision, la fenêtre en jeu reste fermée', async () => {
  const s = setup();
  s.journal.stateData.cargo = {
    Vessel: 'Ship', Count: 20,
    Inventory: [{ Name: 'aislingmediaresources', Count: 15 }, { Name: 'usscargoblackbox', Name_Localised: 'Boîte noire', Count: 5 }],
  };
  s.journal.emit('ready', {
    history: [
      ev('2026-10-26T15:00:00Z', 'Powerplay', { Power: 'Aisling Duval', Merits: 100 }),
      ev('2026-10-26T15:00:01Z', 'Location', { StarSystem: 'Home', ControllingPower: 'Aisling Duval', PowerplayState: 'Stronghold', Powers: ['Aisling Duval'], Docked: true, StationName: 'S', StationType: 'Coriolis', MarketID: 1 }),
      // 26 oct. 2026 15:15:58 : 15 contrats sous scellés collectés à quai
      ev('2026-10-26T15:15:58Z', 'PowerplayCollect', { Power: 'Aisling Duval', Type: 'aislingmediaresources', Type_Localised: "Contrats sous scellés d'Aisling", Count: 15 }),
      ev('2026-10-26T15:20:00Z', 'Undocked', {}),
      ev('2026-10-26T15:30:00Z', 'CollectCargo', { Type: 'usscargoblackbox', Type_Localised: 'Boîte noire' }),
      ev('2026-10-26T15:50:00Z', 'Docked', { StarSystem: 'Home', StationName: 'T', StationType: 'Outpost', MarketID: 2 }),
    ],
  });
  s.journal.emit('event', ev('2026-10-26T15:50:05Z', 'Music', {}));
  await tick();
  const f = s.call('GET /sale');
  assert.deepEqual(f.lines.map((l) => l.type), ['usscargoblackbox']); // marchandise Powerplay écartée comme les drones
  assert.equal(f.lines[0].relevant, false); // ramassé, et pas de Market.json d'ici : rien à conseiller
  assert.deepEqual(s.windows.at(-1), [SALE_PAGE, false]);
  s.done();
});

test('soute recalée en direct : Cargo.json qui suit la ligne Cargo du journal (sortie que l\'app ne suit pas)', async () => {
  const s = setup();
  s.journal.stateData.cargo = { timestamp: '2026-11-06T17:10:00Z', Vessel: 'Ship', Count: 5, Inventory: [{ Name: 'iridium', Count: 5 }] };
  s.journal.emit('ready', { history: HISTORY });
  // Mission de minage rendue : 3 t quittent la soute, MissionCompleted n'est pas suivi par la soute
  s.journal.emit('event', ev('2026-11-06T17:20:00Z', 'MissionCompleted', { Commodity: '$Iridium_Name;', Count: 3 }));
  s.journal.emit('event', ev('2026-11-06T17:20:01Z', 'Cargo', { Vessel: 'Ship', Count: 2 }));
  s.journal.stateData.cargo = { timestamp: '2026-11-06T17:20:01Z', event: 'Cargo', Vessel: 'Ship', Count: 2, Inventory: [{ Name: 'iridium', Count: 2 }] };
  s.journal.emit('cargo', s.journal.stateData.cargo, { initial: false });
  await tick();
  const [l] = s.call('GET /sale').lines;
  assert.equal(l.count, 2);
  assert.deepEqual(l.lots.map((x) => [x.kind, x.count]), [['mined', 2]]);
  s.done();
});

test('marchandise tout juste achetée à cette escale : la fenêtre en jeu reste fermée', () => {
  const s = setup();
  s.journal.stateData.cargo = { Vessel: 'Ship', Count: 100, Inventory: [{ Name: 'indium', Count: 100 }] };
  s.journal.emit('ready', {
    history: [
      ev('2026-11-06T17:00:00Z', 'Powerplay', { Power: 'Aisling Duval', Merits: 1000 }),
      ev('2026-11-06T17:00:01Z', 'Location', { StarSystem: 'Cemiess', ControllingPower: 'A. Lavigny-Duval', PowerplayState: 'Stronghold', Docked: true, StationName: 'Sh', StationType: 'Coriolis', MarketID: 8 }),
      ev('2026-11-06T17:01:00Z', 'MarketBuy', { MarketID: 8, Type: 'indium', Count: 100, BuyPrice: 2300 }),
    ],
  });
  assert.equal(s.call('GET /sale').lines[0].fresh, true);
  assert.deepEqual(s.windows.at(-1), [SALE_PAGE, false]);
  s.done();
});

test('réglage : fenêtre automatique coupée, enregistrée ; valeur invalide refusée', async () => {
  const s = setup();
  s.journal.stateData.cargo = { Vessel: 'Ship', Count: 5, Inventory: [{ Name: 'iridium', Count: 5 }] };
  s.journal.emit('ready', { history: HISTORY });
  s.journal.emit('event', ev('2026-11-06T17:10:05Z', 'Music', {}));
  await tick();
  assert.deepEqual(s.windows.at(-1), [SALE_PAGE, true]);
  assert.deepEqual(s.call('PUT /sale/settings', { body: { autoWindow: false } }), { autoWindow: false });
  assert.deepEqual(s.windows.at(-1), [SALE_PAGE, false]);
  assert.throws(() => s.call('PUT /sale/settings', { body: { autoWindow: 'non' } }), /Réglage invalide/);
  const saved = JSON.parse(fs.readFileSync(path.join(s.dir, 'expansion-sales.json'), 'utf8'));
  assert.equal(saved.settings.autoWindow, false);
  s.done();
});

test('ventes mesurées : liste, seulement les 0, texte', () => {
  const s = setup();
  s.journal.emit('ready', {
    history: [
      ...HISTORY,
      ev('2026-11-06T17:11:00Z', 'MarketSell', { MarketID: 5, Type: 'iridium', Count: 5, SellPrice: 250000, TotalSale: 1250000 }),
    ],
  });
  const all = s.call('GET /sales', { query: {} });
  assert.equal(all.total, 1);
  assert.equal(all.cases[0].cause, 'acq-mined-unsupported');
  assert.ok(all.rules.some((r) => r.id === 'BULK_DEMAND_FACTOR' && r.status === 'publiée'));
  assert.equal(s.call('GET /sales', { query: { zero: '1' } }).total, 1);
  assert.match(s.call('GET /sales/text', { query: { zero: '1' } }).text, /\*\*0 mérite\*\*/);
  s.done();
});

test('soute : Cargo.json du vaisseau, cargaison de mission exclue, lignes regroupées ; sinon l\'état du jeu', () => {
  assert.deepEqual(inventoryOf({ Vessel: 'Ship', Inventory: [{ Name: 'gold', Count: 2 }, { Name: 'gold', Count: 3, Stolen: 1 }, { Name: 'tea', Count: 9, MissionID: 1 }] }), [{ type: 'gold', label: null, count: 5 }]);
  assert.deepEqual(inventoryOf(null, [{ name: 'iridium', label: 'Iridium', count: 4 }]), [{ type: 'iridium', label: 'Iridium', count: 4 }]);
  // Sans Cargo.json : la soute de l'état du jeu, cargaison de mission (missionId) écartée comme dans Cargo.json
  assert.deepEqual(inventoryOf(null, [{ name: 'iridium', label: 'Iridium', count: 4 }, { name: 'tea', label: 'Thé', count: 9, missionId: 1 }]), [{ type: 'iridium', label: 'Iridium', count: 4 }]);
});
