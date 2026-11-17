// Plans d'ingénierie (audit du 15 nov. 2026, B33) : un double clic ne crée plus deux plans pour le même vaisseau, et
// les modules d'un plan sont remplacés en une seule transaction (un échec au milieu ne laisse plus un plan vide).
// Base factice : rien n'est écrit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EngineeringService } from '../services/service.js';

function service() {
  const svc = Object.create(EngineeringService.prototype);
  svc.shipLocks = new Map();
  svc.ref = {
    ships: { anaconda: {} },
    shipKey: (t) => String(t).toLowerCase(),
    shipName: () => 'Anaconda',
    blueprintKey: (b) => b || null,
  };
  svc.fleet = { ships: new Map([[42, { shipId: 42, type: 'Anaconda', name: 'Vaisseau Test' }]]) };
  svc.shipSlots = () => [{ key: 'std-fsd', current: { module: 'int_hyperdrive_size6_class5', grade: 0 } }];
  const plans = [];
  const transactions = [];
  svc.prisma = {
    engineeringPlan: {
      findFirst: async ({ where }) => {
        await new Promise((r) => setImmediate(r)); // laisse l'autre clic avancer
        return plans.find((p) => p.shipId === where.shipId) ?? null;
      },
      create: async ({ data }) => {
        await new Promise((r) => setImmediate(r));
        const plan = { id: plans.length + 1, ...data };
        plans.push(plan);
        return plan;
      },
      findUnique: async ({ where }) => ({ ...plans.find((p) => p.id === where.id), modules: [] }),
      update: (q) => ({ op: 'update', q }),
    },
    planModule: {
      deleteMany: (q) => ({ op: 'deleteMany', q }),
      createMany: (q) => ({ op: 'createMany', q }),
    },
    $transaction: async (ops) => {
      transactions.push(ops.map((o) => o.op));
      return ops.map((o) => (o.op === 'update' ? { id: o.q.where.id, ...o.q.data } : { count: 1 }));
    },
  };
  return { svc, plans, transactions };
}

test('B33 : deux clics « Créer le plan » sur le même vaisseau : un seul plan', async () => {
  const { svc, plans } = service();
  const [a, b] = await Promise.all([svc.createPlan({ shipId: 42 }), svc.createPlan({ shipId: 42 })]);
  assert.equal(plans.length, 1, 'avant : deux plans');
  assert.equal(a.id, b.id);
  assert.equal(svc.shipLocks.size, 0, 'verrou libéré');
});

test('B33 : un échec ne bloque pas les créations suivantes du même vaisseau', async () => {
  const { svc, plans } = service();
  const create = svc.prisma.engineeringPlan.create;
  svc.prisma.engineeringPlan.create = async () => { throw new Error('base indisponible'); };
  await assert.rejects(svc.createPlan({ shipId: 42 }), /base indisponible/);
  svc.prisma.engineeringPlan.create = create;
  await svc.createPlan({ shipId: 42 });
  assert.equal(plans.length, 1);
});

test('B33 : « Revenir à la config actuelle » remplace les modules en une seule transaction', async () => {
  const { svc, plans, transactions } = service();
  await svc.createPlan({ shipId: 42 });
  await svc.resetPlan(plans[0].id);
  assert.deepEqual(transactions, [['deleteMany', 'createMany']]);
});
