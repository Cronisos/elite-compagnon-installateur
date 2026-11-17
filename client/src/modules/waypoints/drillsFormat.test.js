// Tests de l'affichage des foreuses du Rhino.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ago, drillState, fitMap, READY_COLOR, scaleBar, sinceText, UNKNOWN_COLOR, WAIT_COLOR } from './drillsFormat.js';

const NOW = Date.parse('2026-11-07T10:30:00Z');
const drill = (minAgo, cycleMin, extra = {}) => ({
  lastAt: new Date(NOW - minAgo * 60000).toISOString(),
  cycleMs: cycleMin == null ? null : cycleMin * 60000,
  lastKind: 'vidange',
  ...extra,
});

test('durées : moins d’une minute, minutes, heures', () => {
  assert.equal(ago(20000), '< 1 min');
  assert.equal(ago(7 * 60000 + 59000), '7 min');
  assert.equal(ago(65 * 60000), '1 h 05');
  assert.equal(ago(null), '—');
});

test('prête d’après le cycle mesuré ; sans cycle, on ne dit rien', () => {
  const ready = drillState(drill(6, 5.3), NOW);
  assert.equal(ready.ready, true);
  assert.equal(ready.label, 'prête');
  assert.equal(ready.color, READY_COLOR);
  const wait = drillState(drill(2, 5.3), NOW);
  assert.equal(wait.ready, false);
  assert.equal(wait.label, 'prête dans 3 min');
  assert.equal(wait.color, WAIT_COLOR);
  const unknown = drillState(drill(30, null), NOW);
  assert.equal(unknown.ready, null);
  assert.equal(unknown.label, '');
  assert.equal(unknown.color, UNKNOWN_COLOR);
  assert.equal(sinceText(drill(12, 5), NOW), 'vidée il y a 12 min');
  assert.equal(sinceText(drill(2, null, { lastKind: 'pose' }), NOW), 'posée il y a 2 min');
});

test('petite carte : tout tient dans le disque, sans zoom excessif sur une seule foreuse', () => {
  const one = fitMap([{ x: 50, y: 50 }]);
  assert.equal(one.cx, 50);
  assert.ok(Math.abs(one.k - 88 / 200) < 1e-9, 'au moins 400 m de large');
  const many = fitMap([{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 1000, y: 1500 }, null]);
  assert.equal(many.cx, 1000);
  assert.equal(many.cy, 750);
  for (const p of [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 1000, y: 1500 }]) {
    assert.ok(Math.hypot(p.x - many.cx, p.y - many.cy) * many.k <= 100);
  }
  assert.equal(scaleBar(400), 100);
  assert.equal(scaleBar(5000), 1000);
  assert.equal(scaleBar(10), 50);
});
