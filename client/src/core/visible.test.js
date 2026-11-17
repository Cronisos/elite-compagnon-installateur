import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intervalleVisible, pageVisible } from './visible.js';

/** Document simulé : visibilityState qu'on change à la main, et son événement. */
function faux(etat = 'visible') {
  const cible = new EventTarget();
  cible.visibilityState = etat;
  cible.cacher = () => {
    cible.visibilityState = 'hidden';
    cible.dispatchEvent(new Event('visibilitychange'));
  };
  cible.montrer = () => {
    cible.visibilityState = 'visible';
    cible.dispatchEvent(new Event('visibilitychange'));
  };
  return cible;
}

test('page visible : la minuterie tourne', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const doc = faux();
  let n = 0;
  const stop = intervalleVisible(() => n++, 1000, doc);
  t.mock.timers.tick(3000);
  assert.equal(n, 3);
  stop();
  t.mock.timers.tick(3000);
  assert.equal(n, 3, 'arrêtée');
});

test('page cachée : plus rien ; au retour, un appel tout de suite puis la minuterie reprend', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const doc = faux();
  let n = 0;
  const stop = intervalleVisible(() => n++, 1000, doc);
  t.mock.timers.tick(1000);
  doc.cacher();
  t.mock.timers.tick(30_000);
  assert.equal(n, 1, 'rien pendant que la fenêtre est cachée');
  doc.montrer();
  assert.equal(n, 2, 'remise à jour dès le retour');
  t.mock.timers.tick(1000);
  assert.equal(n, 3);
  stop();
});

test('page déjà cachée au départ : rien avant qu’elle se montre', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const doc = faux('hidden');
  let n = 0;
  const stop = intervalleVisible(() => n++, 1000, doc);
  t.mock.timers.tick(5000);
  assert.equal(n, 0);
  doc.montrer();
  assert.equal(n, 1);
  stop();
});

test('sans document (tests, worker) : considérée visible', () => {
  assert.equal(pageVisible(null), true);
  assert.equal(pageVisible({ visibilityState: 'hidden' }), false);
});
