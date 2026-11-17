// Tests des captures du cadre de l'overlay : l'id reçu dans l'adresse devient un nom de fichier
// (data/captures/<id>.png), il doit donc avoir exactement le format que le serveur crée.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dataPath } from '../../core/paths.js';
import { captureId, isCaptureId } from './index.js';

const isBadRequest = (err) => err.status === 400 && err.publicMessage === 'Capture invalide.';

test('captures : ids créés par le serveur acceptés', () => {
  // Ids réels du 6 nov. 2026, et un id créé maintenant comme le fait POST /captures
  for (const id of ['1794006253586', '1793977796965', String(Date.now())]) {
    assert.equal(isCaptureId(id), true, id);
    assert.equal(captureId(id), id);
  }
});

test('captures : tout autre id refusé (400), en lecture comme en suppression', () => {
  const bad = [
    '../../dev', '..%2F..%2Fdev', '..\\..\\dev', '1794006253586/../../db', '1794006253586.png',
    '179400625358', '17940062535860', 'abcdefghijklm', '__proto__', 'constructor', '',
    ' 1794006253586', '1794006253586\n', '１７９４００６２５３５８６', '-179400625358', '1.794006253586',
    null, undefined, 1794006253586, ['1794006253586'],
  ];
  for (const id of bad) {
    assert.equal(isCaptureId(id), false, String(id));
    assert.throws(() => captureId(id), isBadRequest, String(id));
  }
});

// Les captures déjà enregistrées (lecture seule) restent toutes lisibles et effaçables
const INDEX = dataPath('captures', 'index.json');
test('captures : les ids déjà enregistrés ont tous ce format', { skip: !fs.existsSync(INDEX) && 'aucune capture enregistrée' }, () => {
  const captures = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  for (const c of captures) assert.equal(isCaptureId(c.id), true, c.id);
});
