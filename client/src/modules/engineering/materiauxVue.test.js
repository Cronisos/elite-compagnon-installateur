// Matériaux rangés comme dans les échangeurs (materiauxVue.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, basculerGrade, classeGrade, filtrerGrades, grouperMateriaux, libelleCategorie, rangEchangeur } from './materiauxVue.js';

const m = (key, type, category, grade, english = key) => ({ key, label: key, english, type, category, grade });

test("sous-catégories dans l'ordre de l'échangeur, grade 1 → 5, hors échangeur à part", () => {
  const items = [
    m('heatvanes', 'Manufactured', 'Heat', 4),
    m('chemicalprocessors', 'Manufactured', 'Chemical', 2),
    m('chemicalstorageunits', 'Manufactured', 'Chemical', 1),
    m('guardian_powercell', 'Manufactured', 'None', 1, 'Guardian Power Cell'),
    m('tg_carapace', 'Manufactured', 'None', 2, 'Thargoid Carapace'),
    m('weaponparts', 'Manufactured', 'None', 4, 'Weapon Parts'),
    m('iron', 'Raw', '4', 1),
  ];
  const g = grouperMateriaux(items, 'Manufactured');
  assert.deepEqual(g.map((x) => x.titre), ['Chimique', 'Chaleur', 'Gardiens (hors échangeur)', 'Thargoïdes (hors échangeur)', 'Autres (hors échangeur)']);
  assert.deepEqual(g[0].items.map((x) => x.grade), [1, 2]);
  assert.deepEqual(grouperMateriaux(items, 'Raw').map((x) => x.titre), ['Catégorie 4']);
  assert.deepEqual(grouperMateriaux(null, 'Raw'), []);
});

test('libellés, classes de grade et tri', () => {
  assert.equal(CATEGORIES.Manufactured.length, 10);
  assert.equal(CATEGORIES.Encoded.length, 6);
  assert.equal(libelleCategorie(m('x', 'Encoded', 'Wake Scans', 3)), 'Données · Scans de sillage');
  assert.equal(libelleCategorie(m('x', 'Raw', '7', 3)), 'Matières premières · Catégorie 7');
  assert.equal(libelleCategorie({}), '—');
  assert.equal(classeGrade(5), 'g5');
  assert.equal(classeGrade(null), '');
  const tri = [m('b', 'Encoded', 'Emission Data', 1), m('a', 'Raw', '2', 3), m('c', 'Raw', '1', 4)].sort((x, y) => rangEchangeur(x) - rangEchangeur(y));
  assert.deepEqual(tri.map((x) => x.key), ['c', 'a', 'b']);
});

test('filtre par grades : vide = tout, sinon les grades choisis ; bascule sans modifier l’ancien', () => {
  const items = [m('a', 'Raw', '1', 1), m('b', 'Raw', '1', 3), m('c', 'Raw', '1', 5)];
  assert.equal(filtrerGrades(items, new Set()).length, 3);
  assert.equal(filtrerGrades(items, null).length, 3);
  assert.deepEqual(filtrerGrades(items, new Set([3, 5])).map((x) => x.key), ['b', 'c']);
  const avant = new Set([3]);
  assert.deepEqual([...basculerGrade(avant, 5)], [3, 5]);
  assert.deepEqual([...basculerGrade(avant, 3)], []);
  assert.deepEqual([...avant], [3]);
});
