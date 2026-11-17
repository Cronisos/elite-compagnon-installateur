// Tests des textes de la case « Rachat » (rebuyText.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GREEN, RED, modeColor, modeText, rebuyStatus } from './rebuyText.js';

test('rachat couvert : nombre de rachats d’avance (Type-11 du 7 nov. 2026 : 182)', () => {
  const s = rebuyStatus({ covered: true, rebuy: 4_498_040, times: 182 });
  assert.deepEqual([s.text, s.color, s.sub], ['Couvert ✓', GREEN, '182 rachats d\'avance']);
  assert.equal(rebuyStatus({ covered: true, rebuy: 4_498_040, times: 1 }).sub, '1 rachat d\'avance');
});

test('rachat à 0 cr : « rachat gratuit », jamais « — rachat d’avance »', () => {
  const s = rebuyStatus({ covered: true, rebuy: 0, times: null });
  assert.equal(s.sub, 'rachat gratuit');
  assert.doesNotMatch(rebuyStatus({ covered: true, rebuy: 5, times: null }).sub, /—/);
});

test('rachat non couvert : ce qui manque', () => {
  const s = rebuyStatus({ covered: false, rebuy: 4_498_040, missing: 3_498_040 });
  assert.deepEqual([s.text, s.color], ['NON COUVERT', RED]);
  assert.match(s.sub, /^il manque 3,5 M cr$/);
});

test('mode de jeu : libellé avec le nom du groupe, couleur par clé connue seulement', () => {
  assert.equal(modeText({ mode: 'Group', label: 'Groupe privé', group: 'EDFR' }), 'Groupe privé « EDFR »');
  assert.equal(modeText(null), null);
  assert.equal(modeColor({ mode: 'Open' }), '#ff9a3c');
  // Clé venue du journal : un nom hérité d'Object ne donne pas une fonction comme couleur
  for (const mode of ['constructor', 'toString', '__proto__', 'Nouveau']) assert.equal(modeColor({ mode }), '#dfe4ea');
  assert.equal(modeColor(null), '#dfe4ea');
});
