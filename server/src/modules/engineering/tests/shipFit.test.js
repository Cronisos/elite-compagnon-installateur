// Escale à plusieurs vaisseaux (R13, R16, R16b) : un module rentre-t-il sur l'autre vaisseau, et lequel amener.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fits, chooseVehicle } from '../services/shipFit.js';
import { ref, refWithTestShips, FSD, T6 } from './helpers/itinerary.js';

const withRef = ref ? test : test.skip;

withRef('compatibilité : FSD 5A dans un Python (FSD 5) oui, dans test_b (FSD 4) non ; compartiment réservé ; masse ; blindage', () => {
  const r = refWithTestShips();
  assert.deepEqual(fits(ref, 'python', FSD), { ok: true, slot: 'std-fsd', why: null });
  assert.deepEqual(fits(r, 'test_b', FSD), { ok: false, slot: null, why: 'trop petit' });
  assert.deepEqual(fits(r, 'test_a', T6), { ok: false, slot: null, why: 'trop petit' });
  assert.equal(fits(r, 'test_b', T6).ok, true);
  // Emplacement déjà pris par une tâche de ce vaisseau
  assert.equal(fits(ref, 'python', FSD, { taken: new Set(['std-fsd']) }).ok, false);
  // Compartiment militaire : renfort de coque oui, générateur de bouclier non (« réservé »)
  const military = ref.shipSlots('federal_corvette')?.find((s) => s.restriction === 'Military');
  if (military) {
    const others = new Set(ref.shipSlots('federal_corvette').filter((s) => s.group === 'internal' && s.key !== military.key).map((s) => s.key));
    assert.equal(fits(ref, 'federal_corvette', 'int_hullreinforcement_size5_class2', { taken: others }).slot, military.key);
    assert.equal(fits(ref, 'federal_corvette', 'int_shieldgenerator_size5_class5', { taken: others }).why, 'réservé');
  }
  // Masse (R16b) : des propulseurs dont la masse maximale est sous la masse de coque
  const heavy = Object.create(r);
  heavy.ships = Object.assign(Object.create(null), r.ships, { test_b: { ...r.ships.test_b, properties: { ...r.ships.test_b.properties, hullMass: 99999 } } });
  assert.deepEqual(fits(heavy, 'test_b', T6), { ok: false, slot: null, why: 'masse' });
  assert.equal(fits(ref, 'python', 'krait_mkii_armour_grade1').why, 'blindage');
  assert.equal(fits(ref, 'python', 'module_inconnu').why, 'inconnu');
});

withRef('vaisseau à amener : tout rentre → le plus de tâches ici ; sinon seconde visite, avec la raison ; déterministe', () => {
  const r = refWithTestShips();
  const stop = (a, b) => ({
    bring: [
      { planId: 1, shipId: 1, shipType: a, items: [{ slot: 'std-fsd', item: FSD, size: 5, steps: 1 }] },
      { planId: 2, shipId: 2, shipType: b, items: [{ slot: 'std-t', item: T6, size: 6, steps: 5 }] },
    ],
  });
  const ok = chooseVehicle(ref, stop('krait_mkii', 'python'));
  assert.deepEqual(ok, { vehicle: { planId: 2, shipId: 2, shipType: 'python' }, transfers: [{ planId: 1, slot: 'std-fsd', item: FSD, to: 'std-fsd' }], revisits: [] });
  const no = chooseVehicle(r, stop('test_a', 'test_b'));
  assert.deepEqual(no, { vehicle: { planId: 2, shipId: 2, shipType: 'test_b' }, transfers: [], revisits: [{ planId: 1, shipType: 'test_a', slots: ['std-fsd'], why: 'trop petit' }] });
  assert.deepEqual(chooseVehicle(r, stop('test_a', 'test_b')), no);
  // Le vaisseau piloté départage
  const even = { bring: [{ planId: 1, shipId: 1, shipType: 'python', items: [{ slot: 'std-fsd', item: FSD, size: 5, steps: 1 }] }, { planId: 2, shipId: 2, shipType: 'krait_mkii', items: [{ slot: 'std-t', item: T6, size: 6, steps: 1 }] }] };
  assert.equal(chooseVehicle(ref, even, 1).vehicle.planId, 1);
  assert.equal(chooseVehicle(ref, even, 2).vehicle.planId, 2);
  // Un seul vaisseau : rien à transférer
  assert.deepEqual(chooseVehicle(ref, { bring: [stop('python', 'python').bring[0]] }).transfers, []);
});
