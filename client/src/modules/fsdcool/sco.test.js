// Tests du « SCO prêt » dans la fenêtre du Refroidissement FSD : phase du compte à rebours, cases et ligne du bas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoPhase, scoCell, scoDurationCell, scoLine } from './sco.js';

const t0 = Date.parse('2026-11-05T21:52:07.741Z');
const iso = (ms) => new Date(ms).toISOString();
const sco = (over = {}) => ({
  active: null,
  supercruise: true,
  signalMs: 4_000,
  countdown: { endedAt: iso(t0), readyAt: iso(t0 + 9_000), durationMs: 9_000, source: 'default', generation: 'newGeneration', shipName: 'Type-11 Prospector', measured: 0 },
  ...over,
});

test('compte à rebours, puis « PRÊT » pendant le signal, puis plus rien', () => {
  const p = scoPhase(sco(), t0 + 2_500);
  assert.equal(p.phase, 'cooldown');
  assert.equal(p.leftS, 6.5);
  assert.deepEqual(scoCell(p), { label: 'Prêt dans', value: '0:07', big: true, still: true, color: '#ff9a3c', sub: '' });
  assert.equal(scoCell(scoPhase(sco(), t0 + 7_000)).color, '#5fd38d'); // moins de 3 s : vert
  const ready = scoPhase(sco(), t0 + 9_500);
  assert.equal(ready.phase, 'ready');
  assert.equal(scoCell(ready).value, 'PRÊT');
  assert.equal(scoLine(ready), 'SCO prêt');
  assert.equal(scoPhase(sco(), t0 + 13_000), null);
});

test('rien à montrer pendant le SCO, hors supercruise ou sans coupure', () => {
  assert.equal(scoPhase(sco({ active: { since: iso(t0) } }), t0 + 1_000), null);
  assert.equal(scoPhase(sco({ supercruise: false }), t0 + 1_000), null);
  assert.equal(scoPhase(sco({ countdown: null }), t0), null);
  assert.equal(scoPhase(null, t0), null);
});

test('durée et ligne du bas : origine de la valeur, vaisseau et génération', () => {
  const p = scoPhase(sco(), t0 + 1_000);
  assert.deepEqual(scoDurationCell(p), { label: 'Durée', value: '9 s', still: true, color: '#8a94a0', sub: "d'après SCO-Cooldown" });
  assert.equal(scoLine(p), 'Type-11 Prospector · nouvelle génération');
  const measured = scoPhase(sco({ countdown: { ...sco().countdown, durationMs: 12_000, readyAt: iso(t0 + 12_000), source: 'measured', generation: 'legacy', shipName: 'Imperial Cutter', measured: 4 } }), t0);
  assert.equal(scoDurationCell(measured).sub, 'mesurée · 4');
  assert.equal(scoLine(measured), 'Imperial Cutter · ancien vaisseau');
  const unknown = scoPhase(sco({ countdown: { ...sco().countdown, source: 'unknown', generation: 'unknown', shipName: null } }), t0);
  assert.equal(scoLine(unknown), 'vaisseau inconnu');
});
