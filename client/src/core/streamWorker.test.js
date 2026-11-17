// Connexion temps réel partagée (SharedWorker, streamWorker.js) : une seule source pour toutes les pages, chaque page ne
// reçoit que ce qu'elle a demandé, une page fermée est oubliée ; et côté page (stream.js), le repli sur une connexion
// propre quand le worker ne marche pas.

import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeSource {
  static CLOSED = 2;
  static all = [];
  readyState = 1;
  handlers = {};
  constructor(url) {
    this.url = url;
    FakeSource.all.push(this);
  }
  addEventListener(type, fn) {
    this.handlers[type] = fn;
  }
  close() {
    this.readyState = FakeSource.CLOSED;
  }
}

class FakePort {
  posted = [];
  onmessage = null;
  postMessage(m) {
    this.posted.push(structuredClone(m));
  }
  start() {}
  close() {
    this.closed = true;
  }
  send(data) {
    this.onmessage({ data });
  }
}

test('worker : une seule connexion, chaque page ne reçoit que ses types, une page fermée est oubliée', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); // minuteries simulées : rien ne reste en attente après le test
  globalThis.EventSource = FakeSource;
  globalThis.self = globalThis;
  await import('./streamWorker.js');
  assert.equal(FakeSource.all.length, 1, 'la connexion s’ouvre au chargement du worker');
  const source = FakeSource.all[0];
  assert.equal(source.url, '/api/stream');

  const a = new FakePort();
  const b = new FakePort();
  globalThis.onconnect({ ports: [a] });
  globalThis.onconnect({ ports: [b] });
  a.send({ types: ['routes:update'] });
  b.send({ types: ['combat:update', 'routes:update'] });
  assert.deepEqual(a.posted, [{ status: false }], 'la page apprend tout de suite l’état de la connexion');

  source.onopen();
  assert.deepEqual(a.posted.at(-1), { status: true });
  assert.deepEqual(b.posted.at(-1), { status: true });

  source.handlers['combat:update']({ data: '{"kills":1}' });
  assert.deepEqual(b.posted.at(-1), { type: 'combat:update', data: '{"kills":1}' });
  assert.ok(!a.posted.some((m) => m.type === 'combat:update'), 'pas demandé : pas reçu');

  a.send({ want: 'combat:update' });
  source.handlers['combat:update']({ data: '{"kills":2}' });
  assert.deepEqual(a.posted.at(-1), { type: 'combat:update', data: '{"kills":2}' });

  b.send({ bye: true });
  const avant = b.posted.length;
  source.handlers['routes:update']({ data: '{"n":1}' });
  assert.equal(b.posted.length, avant, 'page fermée : plus rien');
  assert.deepEqual(a.posted.at(-1), { type: 'routes:update', data: '{"n":1}' });
  assert.equal(FakeSource.all.length, 1, 'toujours une seule connexion');
});

test('page : messages du worker transmis ; s’il tombe en erreur, connexion propre avec tous les abonnements', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const workers = [];
  globalThis.addEventListener = () => {};
  globalThis.SharedWorker = class {
    constructor(url, options) {
      this.url = String(url);
      this.options = options;
      this.port = new FakePort();
      this.listeners = {};
      workers.push(this);
    }
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    }
  };
  const { subscribeForTest } = await import('./stream.js');
  const recu = [];
  subscribeForTest('routes:update', (d) => recu.push(d));
  assert.equal(workers.length, 1);
  const w = workers[0];
  assert.match(w.url, /streamWorker\.js$/);
  assert.equal(w.options.type, 'module');
  assert.deepEqual(w.port.posted, [{ types: [] }, { want: 'routes:update' }]);

  const sources = FakeSource.all.length;
  w.port.send({ status: true });
  w.port.send({ type: 'routes:update', data: '{"n":1}' });
  w.port.send({ type: 'routes:update', data: 'pas du JSON' });
  assert.deepEqual(recu, [{ n: 1 }]);
  assert.equal(FakeSource.all.length, sources, 'aucune connexion propre tant que le worker répond');

  // Script du worker en erreur : la page se connecte seule, avec ses abonnements
  w.listeners.error();
  assert.equal(w.port.closed, true);
  assert.deepEqual(w.port.posted.at(-1), { bye: true });
  const propre = FakeSource.all.at(-1);
  assert.equal(FakeSource.all.length, sources + 1);
  propre.handlers['routes:update']({ data: '{"n":2}' });
  w.port.send({ type: 'routes:update', data: '{"n":99}' }); // le worker abandonné ne compte plus
  assert.deepEqual(recu, [{ n: 1 }, { n: 2 }]);
});
