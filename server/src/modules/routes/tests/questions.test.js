// Tests des questions posées quand on s'écarte de la route, et du découpage des boucles
// quand la station ou la marchandise change (cas réel du 28 oct. : Titius Station → Shoemaker City,
// indium → tantale).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stationQuestion, commodityQuestion, applyAnswer } from '../services/questions.js';
import { extractLoops } from '../services/loops.js';

const PD = 'ICZ KC-U b3-4';
const structure = {
  startSystem: 'Cemiess',
  startStation: 'Titius Station',
  startMarketId: 1,
  startCommodity: 'indium',
  startCommodityName: 'Indium',
  stops: [{ system: PD, station: 'Port Draught', marketId: 3 }],
  legs: [
    { from: { system: 'Cemiess', station: 'Titius Station' }, to: { system: PD, station: 'Port Draught' } },
    { from: { system: PD, station: 'Port Draught' }, to: { system: 'Cemiess', station: 'Titius Station' } },
  ],
  legCommodities: [{ commodity: 'indium', name: 'Indium' }, { commodity: 'bauxite', name: 'Bauxite' }],
  stations: [{ system: 'Cemiess', station: 'Titius Station', marketId: 1 }, { system: PD, station: 'Port Draught', marketId: 3 }],
  commodities: [{ commodity: 'indium', name: 'Indium' }, { commodity: 'bauxite', name: 'Bauxite' }],
};
const route = { id: 5, name: 'Titius Station ⇄ Port Draught', structure: JSON.stringify(structure) };

const at = (m) => Date.UTC(2026, 9, 28, 16, 0) + m * 60000;
const where = { Cemiess: { 1: 'Titius Station', 2: 'Shoemaker City' }, [PD]: { 3: 'Port Draught' } };
const dock = (m, system, id) => ({ t: at(m), kind: 'dock', system, station: where[system][id], marketId: id });
const buy = (m, system, id, commodity, count, total) => ({ t: at(m), kind: 'buy', system, station: where[system][id], marketId: id, commodity, name: commodity, count, total, price: total / count });
const sell = (m, system, id, commodity, count, total) => ({ t: at(m), kind: 'sell', system, station: where[system][id], marketId: id, commodity, name: commodity, count, total, price: total / count });
const und = (m, system) => ({ t: at(m), kind: 'undock', system });

test("amarrage à une autre station du même système : question, puis la route suit", () => {
  const q = stationQuestion(route, dock(0, 'Cemiess', 2));
  assert.equal(q.type, 'station');
  assert.equal(q.oldStation, 'Titius Station');
  assert.equal(q.station, 'Shoemaker City');
  const data = applyAnswer(route, q, true);
  const s = JSON.parse(data.structure);
  assert.equal(s.startStation, 'Shoemaker City');
  assert.equal(data.startStation, 'Shoemaker City');
  assert.equal(data.name, 'Shoemaker City ⇄ Port Draught');
  assert.equal(s.legs[1].to.station, 'Shoemaker City');
  // Plus de question une fois la route à jour
  assert.equal(stationQuestion({ ...route, ...data }, dock(0, 'Cemiess', 2)), null);
});

test('« Non, ponctuel » : la question ne revient plus', () => {
  const q = stationQuestion(route, dock(0, 'Cemiess', 2));
  const r2 = { ...route, ...applyAnswer(route, q, false) };
  assert.equal(stationQuestion(r2, dock(30, 'Cemiess', 2)), null);
  assert.equal(JSON.parse(r2.structure).startStation, 'Titius Station');
});

test('station attendue ou système hors route : pas de question', () => {
  assert.equal(stationQuestion(route, dock(0, 'Cemiess', 1)), null);
  assert.equal(stationQuestion(route, { ...dock(0, 'Cemiess', 2), system: 'Sol' }), null);
});

test('gros achat d\'une autre marchandise au départ : question ; un appoint : non', () => {
  assert.equal(commodityQuestion(route, buy(0, 'Cemiess', 2, 'gallium', 8, 20352), 1232), null);
  const q = commodityQuestion(route, buy(0, 'Cemiess', 2, 'tantalum', 1173, 1526073), 1232);
  assert.equal(q.type, 'commodity');
  assert.equal(q.oldCommodity, 'indium');
  const data = applyAnswer(route, q, true);
  assert.equal(data.startCommodity, 'tantalum');
  const s = JSON.parse(data.structure);
  assert.equal(s.legCommodities[0].commodity, 'tantalum');
  assert.ok(s.commodities.some((c) => c.commodity === 'tantalum'));
});

test('boucles : appoints achetés avant la marchandise principale comptés dans la bonne boucle', () => {
  const tl = [
    dock(0, 'Cemiess', 1), buy(1, 'Cemiess', 1, 'gallium', 6, 15000), buy(2, 'Cemiess', 1, 'indium', 1000, 2360000), und(3, 'Cemiess'),
    dock(10, PD, 3), sell(11, PD, 3, 'gallium', 6, 160000), sell(12, PD, 3, 'indium', 1000, 24000000), buy(13, PD, 3, 'bauxite', 1000, 706000), und(14, PD),
    dock(20, 'Cemiess', 1), sell(21, 'Cemiess', 1, 'bauxite', 1000, 41000000), buy(22, 'Cemiess', 1, 'gallium', 6, 15000), buy(23, 'Cemiess', 1, 'indium', 1000, 2360000),
  ];
  const { loops } = extractLoops(tl, structure);
  assert.equal(loops.length, 1);
  assert.equal(loops[0].purchases, 15000 + 2360000 + 706000);
  assert.equal(loops[0].netGain, 160000 + 24000000 + 41000000 - 15000 - 2360000 - 706000);
});

test('boucles : changement de station et de marchandise dans le même système, sans perte', () => {
  const tl = [
    dock(0, 'Cemiess', 1), buy(1, 'Cemiess', 1, 'indium', 1000, 2360000), und(2, 'Cemiess'),
    dock(10, PD, 3), sell(11, PD, 3, 'indium', 1000, 24000000), buy(12, PD, 3, 'bauxite', 1000, 706000), und(13, PD),
    // Retour à Titius : vente, petit achat… puis on change de station sans être reparti
    dock(20, 'Cemiess', 1), sell(21, 'Cemiess', 1, 'bauxite', 1000, 41000000), buy(22, 'Cemiess', 1, 'indium', 13, 30680), und(23, 'Cemiess'),
    dock(28, 'Cemiess', 2), buy(29, 'Cemiess', 2, 'tantalum', 1129, 1466571), und(30, 'Cemiess'),
    dock(40, PD, 3), sell(41, PD, 3, 'indium', 13, 330000), sell(42, PD, 3, 'tantalum', 1129, 17212734), buy(43, PD, 3, 'bauxite', 1000, 706000), und(44, PD),
    // Plus du tout d'indium : la boucle se ferme quand même
    dock(50, 'Cemiess', 2), sell(51, 'Cemiess', 2, 'bauxite', 1000, 41000000), buy(52, 'Cemiess', 2, 'tantalum', 1173, 1526073),
  ];
  const { loops, current } = extractLoops(tl, structure);
  assert.equal(loops.length, 2);
  // La 2e boucle va du retour à Titius jusqu'au dernier achat, Shoemaker City compris
  assert.equal(loops[1].purchases, 30680 + 1466571 + 706000);
  assert.equal(loops[1].sales, 330000 + 17212734 + 41000000);
  assert.ok(current);
  assert.equal(current.startAt, new Date(at(52)).toISOString());
});
