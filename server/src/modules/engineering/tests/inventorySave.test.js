// Inventaire enregistré : jamais remplacé par un inventaire sans le relevé « Materials » du jeu (dossier des journaux
// vide ou déplacé : l'inventaire en mémoire est vide, et il effaçait celui de la base).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EngineeringService } from '../services/service.js';
import { Inventory } from '../services/inventory.js';

function service() {
  const svc = Object.create(EngineeringService.prototype);
  svc.ref = { materials: new Map([['iron', { name: 'Iron', type: 'Raw', grade: 1 }]]), materialLabel: (key, label) => label || key };
  svc.inventory = new Inventory();
  const calls = [];
  svc.prisma = {
    $transaction: async (ops) => calls.push(ops),
    materialInventory: { deleteMany: () => 'effacer', createMany: (x) => ({ creer: x }) },
  };
  return { svc, calls };
}

test('inventaire : rien n’est enregistré sans le relevé Materials du jeu', async () => {
  const { svc, calls } = service();
  await svc.saveInventory();
  svc.inventory.apply({ event: 'MaterialCollected', timestamp: '2026-11-07T10:00:00Z', Category: 'Raw', Name: 'iron', Count: 3 });
  await svc.saveInventory();
  assert.equal(calls.length, 0, 'inventaire vide ou partiel : la base garde le sien');
});

test('inventaire : enregistré une fois le relevé Materials lu', async () => {
  const { svc, calls } = service();
  svc.inventory.apply({ event: 'Materials', timestamp: '2026-11-07T10:00:00Z', Raw: [{ Name: 'iron', Count: 12 }], Manufactured: [], Encoded: [] });
  await svc.saveInventory();
  assert.equal(calls.length, 1);
  const [effacer, creer] = calls[0];
  assert.equal(effacer, 'effacer');
  assert.deepEqual(creer.creer.data.map((r) => [r.name, r.count]), [['iron', 12]]);
});
