// Vaisseaux repris d'EDSY quand coriolis ne les connaît pas (vaisseauxEdsy.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ficheCoriolis, internesCoriolis, vaisseauxEdsy } from './vaisseauxEdsy.js';

// Fiches à la forme d'eddb.js, valeurs relevées dans les tables d'EDSY
const LYNX = {
  fdid: 129041442, fdname: 'MediumTransport01', id: 54, name: 'Lynx Highliner', class: 2, cost: 67992080, retail: 69289470,
  topspd: 285, bstspd: 350, shields: 200, armour: 350, mass: 260, hardness: 55, masslock: 16, crew: 2, fuelreserve: 0.75,
  slots: { hardpoint: [3, 2, 2, 2, 2], utility: [0, 0, 0, 0], component: [1, 5, 6, 5, 6, 5, 3, 5], military: [], internal: [6, 6, 6, 5, 5, 4, 4, 3, 2, 1] },
  reserved: { internal: [null, { ipc: 1 }, { ipc: 1 }, { ipc: 1 }] },
  module: {
    40131: { cost: 0, mass: 0, fdid: 129041444, fdname: 'MediumTransport01_Armour_Grade1' },
    40122: { cost: 27715790, mass: 26, fdid: 129041445, fdname: 'MediumTransport01_Armour_Grade2' },
  },
};
const ANACONDA2 = {
  fdid: 129046025, fdname: 'AnacondaMkII', id: 55, name: 'Anaconda Mk II', class: 3, mass: 940,
  slots: { hardpoint: [4, 3, 3, 3, 3, 1, 1], utility: [0, 0, 0, 0, 0, 0, 0, 0], component: [1, 8, 7, 8, 5, 8, 8, 6], military: [5, 5], internal: [8, 7, 7, 6, 5, 5, 5, 4, 4, 3, 2, 1] },
  reserved: { internal: [null, null, null, { cft: 1, icr: 1 }] },
};
// L'Anaconda, connue des deux sources : sa fiche coriolis sert d'étalon à la conversion
const ANACONDA = {
  fdid: 128049363, fdname: 'Anaconda', name: 'Anaconda', class: 3, mass: 400,
  slots: { hardpoint: [4, 3, 3, 3, 2, 2, 1, 1], utility: [0, 0, 0, 0, 0, 0, 0, 0], component: [1, 8, 7, 6, 5, 8, 8, 5], military: [5], internal: [7, 6, 6, 6, 5, 5, 5, 4, 4, 4, 2, 1] },
};
const vue = (v) => (typeof v === 'object' ? `${v.class}${v.name[0]}` : v);

test('internes : comme coriolis (militaires rangés par taille, réservés en objets, suite d’approche à la fin)', () => {
  assert.deepEqual(internesCoriolis(ANACONDA).map(vue), [7, 6, 6, 6, 5, 5, 5, '5M', 4, 4, 4, 2, 1, '1P'], 'identique à la fiche coriolis de l’Anaconda');
  assert.deepEqual(internesCoriolis(LYNX).map(vue), [6, '6P', '6P', '5P', 5, 4, 4, 3, 2, 1, '1P']);
  assert.deepEqual(internesCoriolis(ANACONDA2).map(vue), [8, 7, 7, '6C', 5, 5, 5, '5M', '5M', 4, 4, 3, 2, 1, '1P']);
  const cabine = internesCoriolis(LYNX)[1];
  assert.deepEqual(cabine, { class: 6, name: 'Passenger', eligible: { pce: 1, pci: 1, pcm: 1, pcq: 1 } });
  assert.deepEqual(internesCoriolis(ANACONDA2)[3].eligible, { cr: 1, crl: 1, ft: 1 });
  // Une réserve inconnue ne restreint rien (mieux qu'une restriction inventée)
  assert.deepEqual(internesCoriolis({ slots: { internal: [3], military: [] }, reserved: { internal: [{ zzz: 1 }] } }).map(vue), [3, '1P']);
});

test('fiche : emplacements standard sans le blindage, points d’emport puis utilitaires, masse et blindages', () => {
  const f = ficheCoriolis(LYNX);
  assert.equal(f.edID, 129041442);
  assert.equal(f.properties.name, 'Lynx Highliner');
  assert.equal(f.properties.hullMass, 260);
  assert.equal(f.properties.class, 2);
  assert.deepEqual(f.slots.standard, [5, 6, 5, 6, 5, 3, 5]);
  assert.deepEqual(f.slots.hardpoints, [3, 2, 2, 2, 2, 0, 0, 0, 0]);
  assert.equal(f.bulkheads.length, 5);
  assert.deepEqual([f.bulkheads[1].name, f.bulkheads[1].mass, f.bulkheads[1].edID], ['Reinforced Alloy', 26, 129041445]);
  assert.equal(f.bulkheads[4].mass, 0, 'blindage absent de la fiche : masse 0, pas d’erreur');
  assert.equal(f.source, 'edsy');
  for (const incomplete of [null, {}, { ...LYNX, name: '' }, { ...LYNX, mass: 'x' }, { ...LYNX, slots: { ...LYNX.slots, component: [1, 5] } }]) {
    assert.equal(ficheCoriolis(incomplete), null);
  }
});

test('seuls les vaisseaux inconnus de coriolis sont repris, sous le nom du journal en minuscules', () => {
  const connus = Object.assign(Object.create(null), {
    anaconda: { edID: 128049363, properties: { name: 'Anaconda' } },
    imperial_corsair: { edID: 1, properties: { name: 'Corsair' } },
  });
  const eddb = {
    ship: {
      1: ANACONDA, 54: LYNX, 55: ANACONDA2,
      60: { ...LYNX, fdid: 999, fdname: 'Corsair', name: 'Corsair' }, // autre identifiant, même nom : déjà connu
      61: { ...LYNX, fdid: 998, fdname: '../x', name: 'Piège' },
      62: { ...LYNX, fdid: 997, fdname: '__proto__', name: 'Piège 2' },
      63: { fdid: 996, fdname: 'Vide', name: 'Vide' },
    },
  };
  const ajoutes = vaisseauxEdsy(eddb, connus);
  assert.deepEqual(Object.keys(ajoutes).sort(), ['anacondamkii', 'mediumtransport01']);
  assert.equal(Object.getPrototypeOf(ajoutes), null);
  assert.deepEqual(Object.keys(vaisseauxEdsy(null, connus)), []);
  assert.deepEqual(Object.keys(vaisseauxEdsy({ ship: 'x' }, connus)), []);
});
