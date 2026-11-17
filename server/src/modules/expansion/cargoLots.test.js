// Tests de la provenance de la soute : lots du plus ancien au plus récent, porteur, recalage sur l'inventaire du jeu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CargoLots, normType } from './cargoLots.js';

const ev = (timestamp, event, extra = {}) => ({ timestamp, event, ...extra });
const jump = (t, StarSystem, extra = {}) => ev(t, 'FSDJump', { StarSystem, ...extra });

function lots(events, seed) {
  const c = new CargoLots(seed);
  for (const e of events) c.apply(e);
  return c;
}

test('nom de marchandise : symbole du journal ramené à la forme de Market.json et des ventes', () => {
  assert.equal(normType('$iridium_name;'), 'iridium');
  assert.equal(normType('Painite'), 'painite');
  assert.equal(normType('$LowTemperatureDiamond_Name;'), 'lowtemperaturediamond');
});

test('minage : une tonne par MiningRefined, regroupées par système, avec l\'état Powerplay du moment', () => {
  const c = lots([
    jump('2026-11-06T10:00:00Z', 'A', { ControllingPower: 'Aisling Duval', PowerplayState: 'Fortified', Powers: ['Aisling Duval'], StarPos: [0, 0, 0] }),
    ev('2026-11-06T10:01:00Z', 'MiningRefined', { Type: '$iridium_name;', Type_Localised: 'Iridium' }),
    ev('2026-11-06T10:01:05Z', 'MiningRefined', { Type: '$iridium_name;' }),
    jump('2026-11-06T11:00:00Z', 'B', { PowerplayState: 'Unoccupied', Powers: ['Aisling Duval'] }),
    ev('2026-11-06T11:01:00Z', 'MiningRefined', { Type: '$iridium_name;' }),
  ]);
  assert.deepEqual(c.lots.map((l) => [l.system, l.count, l.place.state]), [['A', 2, 'Fortified'], ['B', 1, 'Unoccupied']]);
  assert.equal(c.label('iridium'), 'Iridium');
});

test('minage de plusieurs minerais en alternance : un lot par minerai et par système, pas un par tonne', () => {
  const c = lots([
    jump('2026-11-06T10:00:00Z', 'A'),
    ...Array.from({ length: 50 }, (_, i) => ev('2026-11-06T10:01:00Z', 'MiningRefined', { Type: i % 2 ? '$platinum_name;' : '$iridium_name;' })),
  ]);
  assert.deepEqual(c.lots.map((l) => [l.type, l.count]), [['iridium', 25], ['platinum', 25]]);
});

test('vente : les lots les plus anciens partent d\'abord, ce qui manque est de provenance inconnue', () => {
  const c = lots([
    jump('2026-11-06T10:00:00Z', 'A'),
    ev('2026-11-06T10:01:00Z', 'MiningRefined', { Type: '$gold_name;' }),
    jump('2026-11-06T11:00:00Z', 'B'),
    ev('2026-11-06T11:01:00Z', 'MiningRefined', { Type: '$gold_name;' }),
    ev('2026-11-06T11:01:01Z', 'MiningRefined', { Type: '$gold_name;' }),
  ]);
  assert.deepEqual(c.peek('gold', 2).map((l) => [l.system, l.count]), [['A', 1], ['B', 1]]);
  assert.equal(c.totals().get('gold'), 3); // peek ne retire rien
  const { sold } = c.apply(ev('2026-11-06T12:00:00Z', 'MarketSell', { Type: 'gold', Count: 4 }));
  assert.deepEqual(sold.map((l) => [l.kind, l.system, l.count]), [['mined', 'A', 1], ['mined', 'B', 2], ['unknown', null, 1]]);
  assert.equal(c.lots.length, 0);
});

test('achat : prix gardé, marchandise rare reconnue d\'après Market.json', () => {
  const c = new CargoLots();
  c.learnMarket({ Items: [{ Name: '$soontillrelics_name;', Name_Localised: 'Reliques de Soontill', Rare: true }] });
  c.apply(jump('2026-11-06T10:00:00Z', 'Ngurii'));
  c.apply(ev('2026-11-06T10:01:00Z', 'MarketBuy', { Type: 'soontillrelics', Count: 400, BuyPrice: 17000 }));
  c.apply(ev('2026-11-06T10:02:00Z', 'MarketBuy', { Type: 'indium', Count: 10, BuyPrice: 2300 }));
  assert.deepEqual(c.lots.map((l) => [l.type, l.kind, l.buyPrice]), [['soontillrelics', 'rare', 17000], ['indium', 'bought', 2300]]);
  assert.equal(c.label('soontillrelics'), 'Reliques de Soontill');
});

test('porteur : un lot transféré garde sa provenance et le note ; depuis le SRV, rien ne change', () => {
  const c = lots([
    jump('2026-11-06T10:00:00Z', 'Beta Muscae', { ControllingPower: 'Aisling Duval', PowerplayState: 'Stronghold' }),
    ev('2026-11-06T10:01:00Z', 'MiningRefined', { Type: '$rhodplumsite_name;' }),
    ev('2026-11-06T10:01:01Z', 'MiningRefined', { Type: '$rhodplumsite_name;' }),
    ev('2026-11-06T10:02:00Z', 'CargoTransfer', { Transfers: [{ Type: 'rhodplumsite', Count: 2, Direction: 'toship' }] }), // SRV → vaisseau
    ev('2026-11-06T10:05:00Z', 'Docked', { StarSystem: 'Beta Muscae', StationName: 'X9X-9XX', StationType: 'FleetCarrier', MarketID: 7 }),
    ev('2026-11-06T10:06:00Z', 'CargoTransfer', { Transfers: [{ Type: 'rhodplumsite', Count: 2, Direction: 'tocarrier' }] }),
  ]);
  assert.equal(c.lots.length, 0);
  assert.deepEqual(c.carrier.map((l) => [l.system, l.count, l.viaCarrier]), [['Beta Muscae', 2, true]]);
  c.apply(ev('2026-11-06T10:07:00Z', 'CargoTransfer', { Transfers: [{ Type: 'rhodplumsite', Count: 1, Direction: 'toship' }] }));
  assert.deepEqual(c.lots.map((l) => [l.system, l.count, l.viaCarrier]), [['Beta Muscae', 1, true]]);
  assert.equal(c.carrier[0].count, 1);
});

test('inventaire du jeu : surplus retiré (les plus anciens), manque ajouté en inconnu, mission et drones ignorés', () => {
  const c = lots([
    jump('2026-11-06T10:00:00Z', 'A'),
    ev('2026-11-06T10:01:00Z', 'MiningRefined', { Type: '$iridium_name;' }),
    ev('2026-11-06T10:01:01Z', 'MiningRefined', { Type: '$iridium_name;' }),
    ev('2026-11-06T10:01:02Z', 'MiningRefined', { Type: '$iridium_name;' }),
    ev('2026-11-06T10:02:00Z', 'Cargo', {
      Vessel: 'Ship',
      Count: 9,
      Inventory: [
        { Name: 'iridium', Count: 2 }, { Name: 'gold', Count: 3 }, { Name: 'drones', Count: 2 },
        { Name: 'gold', Count: 2, MissionID: 123 },
      ],
    }),
  ]);
  assert.deepEqual([...c.totals()], [['iridium', 2], ['gold', 3]]);
  assert.equal(c.lots.find((l) => l.type === 'gold').kind, 'unknown');
});

test('soute vide (Cargo Count 0) ou destruction : plus de lots ; le porteur reste', () => {
  const base = [jump('2026-11-06T10:00:00Z', 'A'), ev('2026-11-06T10:01:00Z', 'MiningRefined', { Type: '$iridium_name;' })];
  assert.equal(lots([...base, ev('2026-11-06T10:02:00Z', 'Cargo', { Vessel: 'Ship', Count: 0 })]).lots.length, 0);
  // SRV encore chargé : la soute du vaisseau vide ne dit rien du SRV
  const srv = lots([...base, ev('2026-11-06T10:01:30Z', 'Cargo', { Vessel: 'SRV', Count: 1 }), ev('2026-11-06T10:02:00Z', 'Cargo', { Vessel: 'Ship', Count: 0 })]);
  assert.equal(srv.lots.length, 1);
  const died = lots([...base, ev('2026-11-06T10:03:00Z', 'Died', {})], { carrier: [{ type: 'gold', count: 5, kind: 'mined', system: 'B' }] });
  assert.equal(died.lots.length, 0);
  assert.equal(died.carrier.length, 1);
});

test('position : à quai, puissance engagée, et état enregistré relu sans clé piégée', () => {
  const c = lots([
    ev('2026-11-06T10:00:00Z', 'Powerplay', { Power: 'Aisling Duval', Merits: 5 }),
    ev('2026-11-06T10:00:01Z', 'Location', { StarSystem: 'A', Docked: true, StationName: 'S', StationType: 'Coriolis', MarketID: 9 }),
  ]);
  assert.equal(c.power, 'Aisling Duval');
  assert.deepEqual([c.docked, c.station, c.marketId], [true, 'S', 9]);
  c.apply(ev('2026-11-06T10:05:00Z', 'Undocked', {}));
  assert.equal(c.docked, false);
  const again = new CargoLots(JSON.parse(JSON.stringify(c.snapshot())));
  assert.equal(again.placeOf('A').system, 'A');
  assert.equal(again.placeOf('__proto__').unknown, true);
  assert.equal(new CargoLots({ lots: [{ type: 'x', count: -3 }, null, { type: 'y', count: 2, kind: 'pirate' }] }).lots[0].kind, 'unknown');
});

// Séquence réelle d'une mort dans le SRV (16 Librae, 29 oct. 2026 12:54) : Died, SRVDestroyed, Resurrect « rejoin »,
// Location, puis le Cargo détaillé du vaisseau, inchangé. Ici avec 200 t d'iridium déjà passées au vaisseau.
const OUE = { StarSystem: 'Synuefe OU-E c28-2', ControllingPower: 'Aisling Duval', PowerplayState: 'Exploited', Powers: ['Aisling Duval'] };
const srvMining = (extra = []) => [
  ev('2026-11-07T08:00:01Z', 'Location', { ...OUE, Docked: false, InSRV: true }),
  ...Array.from({ length: 200 }, () => ev('2026-11-07T08:10:00Z', 'MiningRefined', { Type: '$iridium_name;' })),
  ev('2026-11-07T08:20:00Z', 'Cargo', { Vessel: 'SRV', Count: 200 }),
  ev('2026-11-07T08:21:00Z', 'CargoTransfer', { Transfers: [{ Type: 'iridium', Count: 200, Direction: 'toship' }] }),
  ev('2026-11-07T08:21:02Z', 'Cargo', { Vessel: 'SRV', Count: 0 }),
  ...extra,
];
const afterDeath = (count, inventory) => [
  ev('2026-11-07T08:30:10Z', 'SRVDestroyed', {}),
  ev('2026-11-07T08:30:30Z', 'Resurrect', { Option: 'rejoin', Cost: 0 }),
  ev('2026-11-07T08:30:33Z', 'Location', { ...OUE, Docked: false }),
  ev('2026-11-07T08:30:36Z', 'Cargo', { Vessel: 'Ship', Count: count, Inventory: inventory }),
];

test('mort dans le SRV : le vaisseau garde sa soute et sa provenance ; seul ce que portait le SRV est perdu', () => {
  const c = lots([...srvMining(), ev('2026-11-07T08:30:00Z', 'Died', {}), ...afterDeath(200, [{ Name: 'iridium', Count: 200 }])]);
  assert.deepEqual(c.lots.map((l) => [l.kind, l.system, l.count]), [['mined', 'Synuefe OU-E c28-2', 200]]);

  // 5 t de plus raffinées en SRV, pas encore transférées : elles partent avec le SRV, les 200 t restent
  const more = lots([
    ...srvMining([
      ev('2026-11-07T08:25:00Z', 'LaunchSRV', { PlayerControlled: true }),
      ...Array.from({ length: 5 }, () => ev('2026-11-07T08:26:00Z', 'MiningRefined', { Type: '$iridium_name;' })),
      ev('2026-11-07T08:26:01Z', 'Cargo', { Vessel: 'SRV', Count: 5 }),
    ]),
    ev('2026-11-07T08:30:00Z', 'Died', {}),
  ]);
  assert.equal(more.totals().get('iridium'), 200);
  assert.deepEqual([more.srvCount, more.srvHeld.size], [0, 0]);
  more.apply(afterDeath(200, [{ Name: 'iridium', Count: 200 }]).at(-1));
  assert.deepEqual(more.lots.map((l) => [l.kind, l.count]), [['mined', 200]]);
});

test('SRV ramené au vaisseau : sa cargaison passe dans la soute ; la soute du SRV connue permet le recalage', () => {
  const c = lots([
    ev('2026-11-07T08:00:01Z', 'Location', { ...OUE, Docked: false }),
    ev('2026-11-07T08:01:00Z', 'Cargo', { Vessel: 'Ship', Count: 30, Inventory: [{ Name: 'drones', Count: 30 }] }),
    ev('2026-11-07T08:02:00Z', 'LaunchSRV', { PlayerControlled: true }),
    ...Array.from({ length: 4 }, () => ev('2026-11-07T08:10:00Z', 'MiningRefined', { Type: '$magnesite_name;' })),
    ev('2026-11-07T08:10:01Z', 'Cargo', { Vessel: 'SRV', Count: 4 }), // sans détail, comme dans le journal
  ]);
  assert.equal(c.srvHeld.get('magnesite'), 4);
  // Le détail du vaisseau (sans la magnésite, encore dans le SRV) ne retire rien : le SRV porte les 4 t
  c.apply(ev('2026-11-07T08:11:00Z', 'Cargo', { Vessel: 'Ship', Count: 30, Inventory: [{ Name: 'drones', Count: 30 }] }));
  assert.equal(c.totals().get('magnesite'), 4);
  c.apply(ev('2026-11-07T08:20:00Z', 'DockSRV', {}));
  assert.deepEqual([c.vehicle, c.srvHeld.size, c.srvCount], ['ship', 0, 0]);
  // 29 oct. 2026 14:10:51 : soute du vaisseau de 30 à 37 t après DockSRV ; le recalage voit les 4 t dans le vaisseau
  c.apply(ev('2026-11-07T08:20:04Z', 'Cargo', { Vessel: 'Ship', Count: 34, Inventory: [{ Name: 'drones', Count: 30 }, { Name: 'magnesite', Count: 4 }] }));
  assert.deepEqual(c.lots.map((l) => [l.type, l.kind, l.count]), [['magnesite', 'mined', 4]]);
  c.apply(ev('2026-11-07T08:30:00Z', 'Died', {})); // dans le vaisseau, cette fois : tout est perdu
  assert.equal(c.lots.length, 0);
});

test('mort à pied : rien n\'est retiré avant le Cargo détaillé écrit après Resurrect', () => {
  const c = lots([
    ev('2026-11-07T08:00:01Z', 'Location', { ...OUE, Docked: false }),
    ev('2026-11-07T08:01:00Z', 'MiningRefined', { Type: '$gold_name;' }),
    ev('2026-11-07T08:05:00Z', 'Disembark', { SRV: false, Taxi: false, OnPlanet: true }),
    ev('2026-11-07T08:10:00Z', 'Died', {}),
  ]);
  assert.equal(c.totals().get('gold'), 1);
  c.apply(ev('2026-11-07T08:11:00Z', 'Cargo', { Vessel: 'Ship', Count: 0, Inventory: [] }));
  assert.equal(c.lots.length, 0);
});

test('marchandises Powerplay et objets de sauvetage : appris, jamais suivis comme des marchandises, retirés à la remise', () => {
  const c = lots([
    jump('2026-11-07T13:00:00Z', 'A'),
    ev('2026-11-07T13:01:00Z', 'CollectCargo', { Type: 'usscargoblackbox', Type_Localised: 'Boîte noire' }),
    ev('2026-11-07T13:01:05Z', 'CollectCargo', { Type: 'usscargoblackbox' }),
    ev('2026-11-07T13:02:00Z', 'PowerplayCollect', { Power: 'Aisling Duval', Type: 'aislingmediaresources', Type_Localised: "Contrats sous scellés d'Aisling", Count: 15 }),
  ]);
  assert.equal(c.totals().get('usscargoblackbox'), 2);
  // 7 nov. 2026 13:50:13 : boîtes noires rendues au contact Recherche et sauvetage
  c.apply(ev('2026-11-07T13:50:13Z', 'SearchAndRescue', { MarketID: 1, Name: 'usscargoblackbox', Name_Localised: 'Boîte noire', Count: 2, Reward: 190000 }));
  assert.equal(c.totals().get('usscargoblackbox'), undefined);
  assert.ok(c.notForSale('usscargoblackbox') && c.notForSale('aislingmediaresources') && c.notForSale('drones'));
  assert.equal(c.notForSale('iridium'), false);
  c.apply(ev('2026-11-07T14:00:00Z', 'Cargo', { Vessel: 'Ship', Count: 15, Inventory: [{ Name: 'aislingmediaresources', Count: 15 }] }));
  assert.equal(c.lots.length, 0); // pas de lot « inconnu » pour une marchandise Powerplay
  assert.deepEqual(new CargoLots(JSON.parse(JSON.stringify(c.snapshot()))).noMarket, c.noMarket);
});
