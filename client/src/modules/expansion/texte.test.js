// Petits textes du module : élision devant le nom d'une puissance (B88).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dePuissance } from './texte.js';

test('élision devant une puissance : d’ devant une voyelle, pas devant le y', () => {
  assert.equal(dePuissance('Aisling Duval'), 'd’Aisling Duval');
  assert.equal(dePuissance('Arissa Lavigny-Duval'), 'd’Arissa Lavigny-Duval');
  assert.equal(dePuissance('Archon Delaine'), 'd’Archon Delaine');
  assert.equal(dePuissance('Edmund Mahon'), 'd’Edmund Mahon');
  assert.equal(dePuissance('Yuri Grom'), 'de Yuri Grom');
  assert.equal(dePuissance('Felicia Winters'), 'de Felicia Winters');
  assert.equal(dePuissance(''), 'de ta puissance');
  assert.equal(dePuissance(null), 'de ta puissance');
});
