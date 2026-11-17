// Branchement du module Signaux (index.js) : à l'arrivée, le nouveau système est diffusé avant l'ordre à l'overlay, pour
// que la fenêtre rangée (cachée puis réaffichée, overlay/main.js) ne montre jamais un instant le système d'avant.
// Journal, diffusion et overlay simulés : rien n'est lu ni écrit sur le disque.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import signals, { RAFALE_MS } from './index.js';

function setup() {
  const journal = new EventEmitter();
  journal.addInterest = () => {};
  const suite = []; // diffusions et ordres à l'overlay, dans l'ordre où ils partent
  const broadcast = (type, data) => suite.push({ type, data });
  const overlay = { setExtra: (page, on) => suite.push({ type: 'overlay', page, on }), mode: () => 'rescue' };
  const router = { get: () => {} };
  signals.register({ router, journal, broadcast, overlay });
  return { journal, suite };
}

const ADDR = 1;
const arrivee = (name, address, timestamp) => ({ event: 'FSDJump', timestamp, StarSystem: name, SystemAddress: address });

test('arrivée : le nouveau système est diffusé tout de suite, avant l’ordre à l’overlay', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { journal, suite } = setup();
  journal.emit('ready', { history: [arrivee('Système Test', ADDR, '2026-11-04T20:00:00Z')] });
  t.mock.timers.tick(RAFALE_MS);
  suite.length = 0;
  journal.emit('event', { event: 'StartJump', timestamp: '2026-11-04T20:10:00Z', JumpType: 'Hyperspace' });
  journal.emit('event', arrivee('Système Test B', 2, '2026-11-04T20:10:30Z'));
  // Aucune minuterie avancée : tout est déjà parti
  assert.deepEqual(suite.map((s) => s.type), ['signals:update', 'overlay', 'signals:update', 'overlay']);
  assert.equal(suite[2].data.system.name, 'Système Test B');
  assert.deepEqual(suite[3], { type: 'overlay', page: 'signals', on: true });
  // L'ordre à l'overlay, lui, part encore LAUNCH_DELAY_MS plus tard (core/overlay.js) : la page a ses données avant.
  // (core/overlay.js n'est pas importé ici : il lirait le overlay.json du joueur.)
});

test('rafale de signaux (scan FSS) : toujours une seule diffusion, après la rafale', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { journal, suite } = setup();
  journal.emit('event', arrivee('Système Test', ADDR, '2026-11-04T20:00:00Z'));
  suite.length = 0;
  for (let i = 0; i < 5; i++) {
    journal.emit('event', {
      event: 'FSSSignalDiscovered', timestamp: '2026-11-04T20:00:05Z', SystemAddress: ADDR,
      SignalName_Localised: `Zone ${i}`, SignalType: 'Combat',
    });
  }
  assert.equal(suite.length, 0);
  t.mock.timers.tick(RAFALE_MS);
  assert.equal(suite.length, 1);
  assert.equal(suite[0].data.count, 5);
});
