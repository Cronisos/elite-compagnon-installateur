import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeOres, oresFromLines } from './captureOres.js';

const lines = (...texts) => texts.map((text) => ({ text }));

test('capture : minerais du panneau de cible, sans le titre, la distance ni la planète', () => {
  const read = lines('@SIGNAL . EMPLACEMENT...', 'S. 84', 'OR', 'HÉLIUM', 'IRIDIUM', 'TITANE', 'SYNUEFE ou-E cae-2 4');
  assert.deepEqual(oresFromLines(read, { known: ['Or', 'Iridium', 'Titane'], system: 'Synuefe OU-E c28-2' }),
    ['Or', 'Hélium', 'Iridium', 'Titane']);
});

test('capture : une lettre mal lue est ramenée au minerai connu, sans doublon', () => {
  assert.deepEqual(oresFromLines(lines('IRIDIUN', 'Iridium', 'PLATlNE'), { known: ['Iridium', 'Platine'] }), ['Iridium', 'Platine']);
});

test('capture : les minerais déjà notés restent, les nouveaux s\'ajoutent', () => {
  assert.deepEqual(mergeOres([{ ore: 'Iridium' }], ['iridium', 'Or']), [{ ore: 'Iridium' }, { ore: 'Or' }]);
});
