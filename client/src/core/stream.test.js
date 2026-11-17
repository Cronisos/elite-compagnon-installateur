// Tests de la connexion temps réel : elle doit survivre à un redémarrage du serveur.

import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeSource {
  static CLOSED = 2;
  static all = [];
  readyState = 1;
  handlers = {};
  constructor() {
    FakeSource.all.push(this);
  }
  addEventListener(type, fn) {
    this.handlers[type] = fn;
  }
  close() {
    this.readyState = FakeSource.CLOSED;
  }
}
globalThis.EventSource = FakeSource;

/** Avance le minuteur simulé seconde par seconde : une minuterie posée par une autre part de son heure à elle. */
function avancer(t, ms) {
  for (let fait = 0; fait < ms; fait += 1000) t.mock.timers.tick(Math.min(1000, ms - fait));
}

test('après une erreur HTTP, la connexion est rouverte et les abonnements repris', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { subscribeForTest } = await import('./stream.js');
  const received = [];
  subscribeForTest('routes:update', (d) => received.push(d));

  const first = FakeSource.all[0];
  first.handlers['routes:update']({ data: '{"n":1}' });
  assert.deepEqual(received, [{ n: 1 }]);

  first.readyState = FakeSource.CLOSED; // le navigateur abandonne
  first.onerror();
  t.mock.timers.tick(2000);

  const second = FakeSource.all[1];
  assert.ok(second, 'une nouvelle connexion doit être ouverte');
  second.handlers['routes:update']({ data: '{"n":2}' });
  assert.deepEqual(received, [{ n: 1 }, { n: 2 }]);
});

test('sur une coupure simple, on laisse le navigateur se reconnecter', async () => {
  const count = FakeSource.all.length;
  const last = FakeSource.all.at(-1);
  last.readyState = 0; // reconnexion en cours
  last.onerror();
  assert.equal(FakeSource.all.length, count);
});

test('une connexion muette est rouverte, les abonnements repris ; un ping la garde', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  // Une source à elle, toute sous le minuteur simulé : les minuteries des tests précédents (simulées ailleurs) ne s'en
  // mêlent pas
  const { createStreamSource } = await import('./streamSource.js');
  const sources = [];
  class Source extends FakeSource {
    constructor() {
      super();
      sources.push(this);
    }
  }
  const received = [];
  const s = createStreamSource({ EventSourceImpl: Source, onMessage: (type, data) => received.push(JSON.parse(data)), onStatus: () => {} });
  s.want('routes:update');

  const alive = sources[0];
  avancer(t, 25000);
  alive.handlers.ping({ data: 'null' });
  avancer(t, 25000);
  assert.equal(sources.length, 1); // le ping a repoussé l'échéance

  avancer(t, 5000); // 30 s sans rien
  avancer(t, 2000);
  assert.equal(alive.readyState, FakeSource.CLOSED);
  const next = sources.at(-1);
  assert.notEqual(next, alive);
  next.handlers['routes:update']({ data: '{"n":3}' });
  assert.deepEqual(received, [{ n: 3 }]);
  s.close();
});

test('connexion muette 15 s (serveur arrêté derrière le proxy) : dite perdue sans attendre la réouverture ; un message la dit revenue', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { createStreamSource, STALE_MS, SILENCE_MS } = await import('./streamSource.js');
  assert.equal(STALE_MS, 15000);
  assert.ok(STALE_MS < SILENCE_MS);
  const statuts = [];
  const sources = [];
  class Source extends FakeSource {
    constructor() {
      super();
      sources.push(this);
    }
  }
  const s = createStreamSource({ EventSourceImpl: Source, onMessage: () => {}, onStatus: (v) => statuts.push(v) });
  s.want('state');
  sources[0].onopen();
  assert.deepEqual(statuts, [true]);
  t.mock.timers.tick(10000);
  sources[0].handlers.ping({ data: 'null' }); // ping à 10 s : rien ne change
  t.mock.timers.tick(14999);
  assert.deepEqual(statuts, [true]);
  t.mock.timers.tick(1); // 15 s sans rien
  assert.deepEqual(statuts, [true, false]);
  sources[0].handlers.ping({ data: 'null' }); // le serveur répond de nouveau
  assert.deepEqual(statuts, [true, false, true]);
  t.mock.timers.tick(15000);
  t.mock.timers.tick(15000); // 30 s sans rien : réouverture, une seule fois perdue
  assert.deepEqual(statuts, [true, false, true, false, false]);
  t.mock.timers.tick(2000);
  assert.equal(sources.length, 2);
  assert.deepEqual(statuts, [true, false, true, false, false], 'pas « ouverte » avant son onopen');
  s.close();
});
