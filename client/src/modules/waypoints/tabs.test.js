// Tests du rangement des repères par onglet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tabOf } from './tabs.js';

const now = new Date('2026-10-30T12:00:00Z');

test('repère normal, veine tarie, puis retour après la date', () => {
  assert.equal(tabOf({ depletedUntil: null }, now), 'main');
  assert.equal(tabOf({ depletedUntil: '2026-12-30T11:00:00Z' }, now), 'depleted');
  assert.equal(tabOf({ depletedUntil: '2026-10-29T11:00:00Z' }, now), 'main');
});

test('pas rentable : prime sur tari et ne revient pas tout seul', () => {
  assert.equal(tabOf({ unprofitable: true, depletedUntil: null }, now), 'unprofitable');
  assert.equal(tabOf({ unprofitable: true, depletedUntil: '2026-12-30T11:00:00Z' }, now), 'unprofitable');
});
