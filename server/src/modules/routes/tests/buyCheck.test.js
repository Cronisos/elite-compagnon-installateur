// Tests de la vérification des achats (alerte « mauvais achat »).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBuy, nextStop } from '../services/buyCheck.js';

const dest = { station: 'Shoemaker City', system: 'Cemiess' };
const indiumMain = { commodity: 'indium', name: 'Indium', margin: 22275 };

test('cas réel du 28 oct. : bertrandite achetée 16 380 cr/t, revendue 2 138 cr/t → alerte rouge', () => {
  const r = evaluateBuy({
    buy: { commodity: 'bertrandite', name: 'Bertrandite', count: 1232, price: 16380 },
    dest,
    destItem: { sellPrice: 2138, demand: 1398333 },
    historySell: null,
    hereSell: 16100,
    main: null,
    cargoCapacity: 1232,
  });
  assert.equal(r.level, 'danger');
  assert.match(r.title, /à perte/);
  assert.match(r.text, /perte de 14\s242 cr\/t, soit 17\s546\s144 cr/); // (16 380 − 2 138) × 1 232
  assert.match(r.advice, /344\s960/); // revente immédiate : (16 380 − 16 100) × 1 232
});

test('marchandise que la station d’arrivée n’achète pas → alerte rouge', () => {
  const r = evaluateBuy({
    buy: { commodity: 'gold', name: 'Or', count: 20, price: 5025 },
    dest,
    destItem: { sellPrice: 0, demand: 0 },
    historySell: { price: 60000 },
    hereSell: null,
    main: indiumMain,
    cargoCapacity: 1232,
  });
  assert.equal(r.level, 'danger');
  assert.match(r.text, /aucune demande/);
});

test('demande ≤ 1 (or et argent à Port Draught) → alerte rouge', () => {
  const r = evaluateBuy({
    buy: { commodity: 'silver', name: 'Argent', count: 10, price: 4194 },
    dest,
    destItem: { sellPrice: 40000, demand: 1 },
    historySell: null,
    hereSell: null,
    main: null,
    cargoCapacity: 1232,
  });
  assert.equal(r.level, 'danger');
});

test('appoint rentable (béryllium, gallium) → vert', () => {
  for (const [commodity, name, price, sell, count] of [
    ['beryllium', 'Béryllium', 4049, 42854, 17],
    ['gallium', 'Gallium', 2544, 27161, 13],
  ]) {
    const r = evaluateBuy({
      buy: { commodity, name, count, price },
      dest: { station: 'Port Draught', system: 'ICZ KC-U b3-4' },
      destItem: { sellPrice: sell, demand: 5000 },
      historySell: null,
      hereSell: null,
      main: indiumMain,
      cargoCapacity: 1232,
    });
    assert.equal(r.level, 'ok', name);
  }
});

test('marchandise principale rentable → vert', () => {
  const r = evaluateBuy({
    buy: { commodity: 'indium', name: 'Indium', count: 1232, price: 2360 },
    dest: { station: 'Port Draught', system: 'ICZ KC-U b3-4' },
    destItem: { sellPrice: 24635, demand: 80000 },
    historySell: null,
    hereSell: 2300,
    main: indiumMain,
    cargoCapacity: 1232,
  });
  assert.equal(r.level, 'ok');
});

test('rentable mais deux fois moins que la principale : rouge en vrac, orange en appoint', () => {
  const base = {
    dest,
    destItem: { sellPrice: 9000, demand: 10000 },
    historySell: null,
    hereSell: 4900,
    main: indiumMain,
    cargoCapacity: 1232,
  };
  const bulk = evaluateBuy({ ...base, buy: { commodity: 'x', name: 'Cobalt', count: 1000, price: 5000 } });
  assert.equal(bulk.level, 'danger');
  assert.match(bulk.title, /au lieu de indium/);
  const small = evaluateBuy({ ...base, buy: { commodity: 'x', name: 'Cobalt', count: 20, price: 5000 } });
  assert.equal(small.level, 'warning');
});

test('aucun prix connu à destination → orange, à vérifier', () => {
  const r = evaluateBuy({
    buy: { commodity: 'x', name: 'Cobalt', count: 20, price: 5000 },
    dest,
    destItem: null,
    historySell: null,
    hereSell: null,
    main: null,
    cargoCapacity: 1232,
  });
  assert.equal(r.level, 'warning');
});

test('historique de vente utilisé quand le marché d’arrivée n’a jamais été ouvert', () => {
  const r = evaluateBuy({
    buy: { commodity: 'indium', name: 'Indium', count: 1232, price: 2360 },
    dest,
    destItem: null,
    historySell: { price: 24700 },
    hereSell: null,
    main: null,
    cargoCapacity: 1232,
  });
  assert.equal(r.level, 'ok');
});

test('prochaine station de la boucle', () => {
  const s = { startStation: 'Port Draught', startSystem: 'ICZ KC-U b3-4', stops: [{ station: 'Shoemaker City', system: 'Cemiess' }] };
  assert.deepEqual(nextStop(s, 'ICZ KC-U b3-4'), { station: 'Shoemaker City', system: 'Cemiess', legIndex: 0 });
  assert.deepEqual(nextStop(s, 'Cemiess'), { station: 'Port Draught', system: 'ICZ KC-U b3-4', legIndex: 1 });
  assert.equal(nextStop(s, 'Sol'), null);
});
