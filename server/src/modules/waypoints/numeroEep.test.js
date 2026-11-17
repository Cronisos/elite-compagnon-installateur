// Numéro de l'EEP où l'on est (numeroEep.js) : EEP balayé, puis repère numéroté proche, puis cible récente.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numeroEepIci, repereIci } from './numeroEep.js';

const R = 2957164.25;
const deg = (m) => (m / R) * (180 / Math.PI);
const ici = { latitude: 0, longitude: 0, body: 'P 4', planetRadius: R };
const maintenant = 10_000_000;

test('numéro d’EEP : l’EEP balayé d’abord, puis un repère numéroté à moins de 3 km, puis une cible récente', () => {
  const reperes = [{ latitude: deg(2000), longitude: 0, siteNumber: 5 }, { latitude: deg(500), longitude: 0, siteNumber: 6 }, { latitude: deg(100), longitude: 0, siteNumber: null }];
  const site = { body: 'P 4', number: 9, at: maintenant - 60_000 };
  assert.deepEqual(numeroEepIci({ here: ici, eep: { numero: 3 }, reperes, site, maintenant }), { numero: 3, source: 'eep' });
  assert.deepEqual(numeroEepIci({ here: ici, eep: { numero: null }, reperes, site, maintenant }), { numero: 6, source: 'repere' });
  assert.deepEqual(numeroEepIci({ here: ici, reperes: [{ latitude: deg(5000), longitude: 0, siteNumber: 2 }], site, maintenant }), { numero: 9, source: 'cible' });
});

test('numéro d’EEP : rien plutôt qu’un faux (cible ancienne, autre planète, position inconnue)', () => {
  assert.equal(numeroEepIci({ here: ici, site: { body: 'P 4', number: 9, at: maintenant - 3_600_000 }, maintenant }), null);
  assert.equal(numeroEepIci({ here: ici, site: { body: 'Autre', number: 9, at: maintenant }, maintenant }), null);
  assert.equal(numeroEepIci({ here: { body: 'P 4' }, eep: { numero: 3 } }), null);
});

test('repère au même endroit : le plus proche à moins de 150 m, sur la même planète', () => {
  const reperes = [
    { id: 1, body: 'P 4', latitude: deg(120), longitude: 0 },
    { id: 2, body: 'P 4', latitude: deg(40), longitude: 0 },
    { id: 3, body: 'Autre', latitude: 0, longitude: 0 },
    { id: 4, body: 'P 4', latitude: deg(400), longitude: 0 },
  ];
  const r = repereIci(ici, reperes);
  assert.equal(r.w.id, 2);
  assert.ok(Math.abs(r.d - 40) < 1);
  assert.equal(repereIci(ici, [reperes[3]]), null);
  assert.equal(repereIci({ body: 'P 4' }, reperes), null);
});
