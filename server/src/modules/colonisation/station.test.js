// « À acheter ici » : le marché de la station (Market.json) comparé à la liste de courses du chantier actif, et la
// fenêtre en jeu ouverte par le module (en direct, en mode Colonisation, à quai), fermée au départ ou par ✕.
// Journal, état du jeu et overlay simulés ; aucun réseau.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import colonisation, { STATION_PAGE } from './index.js';
import { buyHere, readMarket } from './station.js';
import { depotAt, dockedAt, DOCKED_SHIP } from './fixtures/examples.js';

const SHIP = DOCKED_SHIP.MarketID;
const STATION = 128000001;
const MARKET = {
  timestamp: '2026-11-19T20:00:00Z', event: 'Market', MarketID: STATION, StationName: 'Jameson Memorial', StarSystem: 'Shinrarta Dezhra',
  Items: [
    { id: 1, Name: '$steel_name;', Name_Localised: 'Acier', Category: '$MARKET_category_metals;', BuyPrice: 300, SellPrice: 280, Stock: 2000, Demand: 0 },
    { id: 2, Name: '$titanium_name;', Name_Localised: 'Titane', BuyPrice: 1200, SellPrice: 1100, Stock: 100, Demand: 0 },
    { id: 3, Name: '$water_name;', Name_Localised: 'Eau', BuyPrice: 0, SellPrice: 400, Stock: 0, Demand: 500 }, // demandée, pas vendue
    { id: 4, Name: '$gold_name;', Name_Localised: 'Or', BuyPrice: 9000, SellPrice: 8800, Stock: 50, Demand: 0 }, // pas utile au chantier
  ],
};

test('marché lu : seulement ce qui s’achète (stock et prix d’achat)', () => {
  const m = readMarket(MARKET);
  assert.equal(m.marketId, STATION);
  assert.equal(m.station, 'Jameson Memorial');
  assert.deepEqual([...m.items.keys()], ['steel', 'titanium', 'gold']);
  assert.deepEqual(m.items.get('steel'), { name: 'Acier', stock: 2000, price: 300 });
  assert.equal(readMarket(null), null);
  assert.equal(readMarket({ MarketID: 'x' }), null);
});

test('à prendre ici : le moins entre ce qu’il faut, le stock et la place libre en soute', () => {
  const m = readMarket(MARKET);
  const plan = [
    { symbol: 'steel', name: 'Acier', toBuy: 900 },
    { symbol: 'titanium', name: 'Titane', toBuy: 400 },
    { symbol: 'water', name: 'Eau', toBuy: 50 }, // pas vendue ici
    { symbol: 'copper', name: 'Cuivre', toBuy: 0 },
  ];
  const r = buyHere(plan, m, { capacity: 720, cargoCount: 20 });
  assert.equal(r.free, 700);
  assert.deepEqual(r.items.map((i) => [i.symbol, i.take, i.enough]), [['steel', 700, true], ['titanium', 0, false]]);
  assert.deepEqual(r.total, { tonnes: 700, cost: 210_000 });
  // Soute inconnue : sans limite de place
  const libre = buyHere(plan, m, {});
  assert.equal(libre.free, null);
  assert.deepEqual(libre.items.map((i) => i.take), [900, 100]);
  assert.deepEqual(buyHere(plan, null, {}).items, []);
});

// --- La fenêtre en jeu, ouverte par le module ---

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-colonisation-station-'));
const journal = Object.assign(new EventEmitter(), { addInterest() {}, stateData: {} });
const game = Object.assign(new EventEmitter(), {
  snap: { docked: true, marketId: STATION, cargo: [], cargoCount: 0, loadout: { ship: 'type9', cargoCapacity: 720 } },
  snapshot() { return JSON.parse(JSON.stringify(this.snap)); },
});
const extras = [];
const overlay = {
  current: 'colonisation',
  listeners: [],
  mode() { return this.current; },
  onMode(l) { this.listeners.push(l); },
  setExtra(page, on) { extras.push([page, on]); },
};
const sent = [];
let server;
let base;

before(async () => {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  await colonisation.register({
    router, journal, game, overlay, broadcast: (type, data) => sent.push({ type, data }), getSettings: async () => ({}),
    dataFile: path.join(dir, 'colonisation.json'), saveDelayMs: 10, fetchImpl: async () => ({ status: 200, ok: true, json: async () => [] }),
  });
  app.use('/api/modules/colonisation', router);
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.publicMessage || 'Erreur interne du serveur.' }));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api/modules/colonisation`;
  // Un chantier suivi (le vaisseau de colonisation), dont il reste de l'acier et du titane à livrer ; puis à quai ailleurs
  journal.emit('ready', { history: [dockedAt(SHIP, '2026-11-19T19:00:00Z'), depotAt(SHIP, '2026-11-19T19:00:05Z'), { ...dockedAt(SHIP, '2026-11-19T19:30:00Z'), event: 'Undocked' }] });
});

after(() => {
  server.closeAllConnections();
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const get = async (p) => (await fetch(`${base}${p}`)).json();
const ouvertures = () => extras.filter(([p]) => p === STATION_PAGE);

test('fenêtre : jamais pour un marché relu au démarrage, ni hors du mode Colonisation', async () => {
  journal.emit('market', MARKET, { initial: true });
  assert.deepEqual(ouvertures(), []);
  overlay.current = 'combat';
  journal.emit('market', MARKET, { initial: false });
  assert.deepEqual(ouvertures(), []);
  overlay.current = 'colonisation';
  // Ouverte à la main (Disposer les fenêtres) : elle montre déjà ce qu'il faut acheter ici
  const v = await get('/station');
  assert.equal(v.station, 'Jameson Memorial');
  assert.ok(v.site.label.includes('Judson Depot'));
  assert.ok(v.items.some((i) => i.symbol === 'steel' && i.take > 0));
  assert.ok(!v.items.some((i) => i.symbol === 'gold'));
});

test('fenêtre : ouverte au marché lu en direct, suit les achats, fermée au départ ; ✕ la ferme jusqu’à la station suivante', async () => {
  journal.emit('market', MARKET, { initial: false });
  assert.deepEqual(ouvertures().at(-1), [STATION_PAGE, true]);
  // Achat d'acier : la soute se remplit, ce qu'il reste à prendre baisse
  const avant = (await get('/station')).items.find((i) => i.symbol === 'steel').take;
  game.snap = { ...game.snap, cargo: [{ name: 'steel', count: 500 }], cargoCount: 500 };
  game.emit('change');
  const apres = (await get('/station')).items.find((i) => i.symbol === 'steel').take;
  assert.ok(apres < avant);
  assert.ok(sent.some((m) => m.type === 'colonisation:station'));
  // Départ : fermée
  game.snap = { ...game.snap, docked: false, marketId: null };
  game.emit('change');
  assert.deepEqual(ouvertures().at(-1), [STATION_PAGE, false]);
  // De retour à quai, marché relu : rouverte ; ✕ : fermée, et pas rouverte au marché suivant de la même station
  game.snap = { ...game.snap, docked: true, marketId: STATION };
  game.emit('change');
  journal.emit('market', MARKET, { initial: false });
  assert.deepEqual(ouvertures().at(-1), [STATION_PAGE, true]);
  await fetch(`${base}/station/close`, { method: 'POST' });
  assert.deepEqual(ouvertures().at(-1), [STATION_PAGE, false]);
  const n = ouvertures().length;
  journal.emit('market', MARKET, { initial: false });
  assert.equal(ouvertures().length, n);
  // Sortie du mode : rien ne se rouvre
  overlay.current = null;
  overlay.listeners.forEach((l) => l(null));
  assert.equal(ouvertures().length, n);
});
