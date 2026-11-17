// Tests du module Matériaux : comptes par catégorie et par grade, session.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MaterialState } from './state.js';

const GRADES = { shieldcyclerecordings: 1, iron: 1, polonium: 4, conductiveceramics: 3 };
const collected = (Name, Category, Count, Name_Localised = Name) => ({ event: 'MaterialCollected', timestamp: 't', Name, Name_Localised, Category, Count });

test('par catégorie, par grade, et le plus haut grade en premier', () => {
  const s = new MaterialState((k) => GRADES[k] ?? null);
  for (const ev of [
    { event: 'LoadGame', timestamp: 't0' },
    collected('shieldcyclerecordings', 'Encoded', 3, 'Enregistrements de cycles de bouclier déformés'),
    collected('iron', 'Raw', 4),
    collected('polonium', 'Raw', 1),
    collected('iron', 'Raw', 2),
    collected('unknownstuff', 'Manufactured', 1),
  ]) s.apply(ev);
  const m = s.summary();
  assert.equal(m.total, 11);
  assert.deepEqual(m.byCategory, { Raw: 7, Manufactured: 1, Encoded: 3 });
  assert.deepEqual(m.byGrade, [9, 0, 0, 1, 0]);
  assert.equal(m.materials[0].label, 'polonium');
  assert.equal(m.materials.find((x) => x.label === 'iron').count, 6);
  assert.equal(m.recent[0].label, 'unknownstuff');
});

test('un nouveau lancement du jeu ouvre une nouvelle session', () => {
  const s = new MaterialState();
  s.apply(collected('iron', 'Raw', 4));
  s.apply({ event: 'LoadGame', timestamp: 't1' });
  assert.equal(s.summary().total, 0);
  assert.equal(s.summary().startedAt, 't1');
});
