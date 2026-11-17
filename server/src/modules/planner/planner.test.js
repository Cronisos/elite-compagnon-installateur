// Tests du calculateur de routes, sur des relevés au format Ardent Insight
// (prix réels du 28 oct. 2026 : Titius Station ⇄ Port Draught, tantale / bauxite).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMarkets, bestTrades, findRoutes, legSeconds, pickCommodities, stationAllowed } from './calc.js';
import { commodityId } from './index.js';
import { nomModele, shipPad } from '../../core/ship.js';
import { GameState } from '../../core/gameState.js';

const AT = '2026-10-28T16:00:00.000Z';
const CEM = { systemName: 'Cemiess', systemX: 66.0625, systemY: -105.34375, systemZ: 27.09375 };
const PD = { systemName: 'ICZ KC-U b3-4', systemX: 78.03125, systemY: -90.46875, systemZ: 48.5 };
const titius = { ...CEM, marketId: 1, stationName: 'Titius Station', stationType: 'Coriolis', distanceToArrival: 400, maxLandingPadSize: 3 };
const draught = { ...PD, marketId: 2, stationName: 'Port Draught', stationType: 'Dodec', distanceToArrival: 2, maxLandingPadSize: 3 };
const row = (st, commodityName, o) => ({ ...st, commodityName, buyPrice: 0, sellPrice: 0, stock: 0, demand: 0, updatedAt: AT, ...o });

const rows = [
  row(titius, 'tantalum', { buyPrice: 1300, stock: 500000 }),
  row(titius, 'indium', { buyPrice: 2360, stock: 38 }), // stock épuisé : 38 t seulement
  row(titius, 'bauxite', { sellPrice: 41661, demand: 1639025 }),
  row(draught, 'tantalum', { sellPrice: 15242, demand: 200000 }),
  row(draught, 'indium', { sellPrice: 24469, demand: 104898 }),
  row(draught, 'bauxite', { buyPrice: 706, stock: 2928700, sellPrice: 669, demand: 1 }), // demande 1 : pas d'import
];

test('quantité limitée par le stock : le tantale bat l\'indium quand il ne reste que 38 t', () => {
  const m = buildMarkets(rows, { pad: 'L' });
  const best = bestTrades(m, 1232).get('1|2');
  assert.equal(best.commodity, 'tantalum');
  assert.equal(best.units, 1232);
  assert.equal(best.profit, 1232 * (15242 - 1300));
});

test('demande de 1 : la station n\'importe pas, aucune vente possible', () => {
  const m = buildMarkets(rows, { pad: 'L' });
  assert.equal(m.get(2).sells.has('bauxite'), false);
});

test('boucle A ⇄ B : gain = aller + retour, comptée une seule fois', () => {
  const m = buildMarkets(rows, { pad: 'L' });
  const { loops, oneWay } = findRoutes(m, { cargo: 1232, range: 20.5 });
  assert.equal(loops.length, 1);
  assert.equal(oneWay.length, 2);
  const l = loops[0];
  assert.equal(l.profit, 1232 * (15242 - 1300) + 1232 * (41661 - 706));
  assert.equal(l.out.commodity, 'tantalum');
  assert.equal(l.back.commodity, 'bauxite');
  // ≈ 29,4 al pour 20,5 al de portée : 2 sauts par trajet
  assert.equal(l.jumps, 4);
});

test('filtres : plateforme, distance à l\'étoile, porte-vaisseaux, chantiers de colonisation', () => {
  assert.equal(stationAllowed({ ...titius, maxLandingPadSize: 2 }, { pad: 'L' }), false);
  assert.equal(stationAllowed({ ...titius, maxLandingPadSize: 2 }, { pad: 'M' }), true);
  assert.equal(stationAllowed({ ...titius, distanceToArrival: 9000 }, { pad: 'L', maxArrival: 5000 }), false);
  assert.equal(stationAllowed({ ...titius, stationType: 'FleetCarrier' }, { pad: 'S' }), false);
  assert.equal(stationAllowed({ ...titius, stationType: 'SpaceConstructionDepot' }, { pad: 'S' }), false);
  assert.equal(stationAllowed({ ...titius, stationType: 'OnFootSettlement' }, { pad: 'L' }), false);
  assert.equal(stationAllowed({ ...titius, stationType: 'OnFootSettlement' }, { pad: 'L', settlements: true }), true);
  assert.equal(stationAllowed({ ...titius, stationType: 'CraterOutpost' }, { pad: 'L', planetary: false }), false);
});

test('temps estimé : 0 saut dans le même système, plus long vers une station lointaine', () => {
  const m = buildMarkets([...rows, row({ ...CEM, marketId: 3, stationName: 'Loin', stationType: 'Orbis', distanceToArrival: 4000, maxLandingPadSize: 3 }, 'tantalum', { sellPrice: 15000, demand: 10 })], { pad: 'L' });
  const near = legSeconds(m.get(2), m.get(1), 20);
  const same = legSeconds(m.get(1), m.get(3), 20);
  assert.equal(same.jumps, 0);
  assert.equal(near.jumps, 2);
  assert.ok(same.seconds > legSeconds(m.get(3), m.get(1), 20).seconds);
});

test('marchandises interrogées : écart de prix suffisant, échangées en volume', () => {
  const report = [
    { commodityName: 'bauxite', minBuyPrice: 565, maxSellPrice: 45099, totalStock: 1e9, totalDemand: 1e9 },
    { commodityName: 'water', minBuyPrice: 100, maxSellPrice: 400, totalStock: 1e9, totalDemand: 1e9 },
    { commodityName: 'rare', minBuyPrice: 100, maxSellPrice: 90000, totalStock: 10, totalDemand: 1e9 },
  ];
  assert.deepEqual(pickCommodities(report), ['bauxite']);
});

test('noms de marchandises : journal et Ardent ramenés au même identifiant', () => {
  assert.equal(commodityId('$Indium_Name;'), 'indium');
  assert.equal(commodityId('advanced catalysers'), commodityId('$AdvancedCatalysers_Name;'));
});

test('plateforme du vaisseau', () => {
  assert.equal(shipPad('panthermkii'), 'L');
  assert.equal(shipPad('Python'), 'M');
  assert.equal(shipPad('cobramkiii'), 'S');
  assert.equal(shipPad(null), null);
  // Noms du journal : l'Imperial Clipper (« empire_trader ») est grand ; Type-6, Keelback et Alliance sont moyens
  assert.equal(shipPad('empire_trader'), 'L');
  for (const moyen of ['type6', 'independant_trader', 'typex', 'typex_2', 'typex_3', 'lakonminer']) assert.equal(shipPad(moyen), 'M', moyen);
});

test('nom du vaisseau : jamais le nom interne du journal quand le modèle est connu', () => {
  assert.equal(nomModele('PantherMkII'), 'Panther Clipper Mk II');
  assert.equal(nomModele('lakonminer'), 'Type-11 Prospector');
  assert.equal(nomModele('vaisseau_futur'), null);
  assert.equal(nomModele('constructor'), null);
  // Journal commencé en cours de session : un Loadout sans nom appris avant lui
  const g = new GameState();
  g.applyEvent({ event: 'Loadout', timestamp: '2026-11-16T10:00:00Z', Ship: 'panthermkii', ShipID: 7, Modules: [] });
  assert.equal(g.snapshot().ship, 'Panther Clipper Mk II');
  // Le nom appris du journal passe avant
  g.applyEvent({ event: 'ShipyardSwap', timestamp: '2026-11-16T10:01:00Z', ShipType: 'lakonminer', ShipType_Localised: 'Type-11 Prospecteur', ShipID: 8 });
  g.applyEvent({ event: 'Loadout', timestamp: '2026-11-16T10:02:00Z', Ship: 'lakonminer', ShipID: 8, Modules: [] });
  assert.equal(g.snapshot().ship, 'Type-11 Prospecteur');
  // Modèle inconnu : le nom du journal, faute de mieux
  g.applyEvent({ event: 'Loadout', timestamp: '2026-11-16T10:03:00Z', Ship: 'vaisseau_futur', ShipID: 9, Modules: [] });
  assert.equal(g.snapshot().ship, 'vaisseau_futur');
});
