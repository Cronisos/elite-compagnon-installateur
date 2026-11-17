// Captures sur le disque (capturesStore.js) : le dossier et la liste restent d'accord, la limite de 30 vaut pour
// toutes les images, même celles qu'une écriture coupée avait laissées hors de la liste.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECOVERED_ERROR, isCaptureId, reconcile, recoveredCapture } from './capturesStore.js';

const entree = (id, extra = {}) => ({ id, at: new Date(Number(id)).toISOString(), lines: [{ text: 'Iridium' }], error: null, ...extra });

test('dossier et liste d’accord : rien ne change', () => {
  const list = [entree('1794006253586'), entree('1794006000000')];
  const r = reconcile(list, ['index.json', '1794006253586.png', '1794006000000.png'], 30);
  assert.equal(r.changed, false);
  assert.deepEqual(r.remove, []);
  assert.deepEqual(r.list, list);
});

test('image sans entrée (écriture coupée, liste perdue) : reprise dans la liste, sans texte lu', () => {
  const r = reconcile([entree('1794006253586')], ['index.json', '1794006253586.png', '1794006100000.png'], 30);
  assert.equal(r.changed, true);
  assert.deepEqual(r.list.map((c) => c.id), ['1794006253586', '1794006100000']);
  assert.deepEqual(r.list[1], recoveredCapture('1794006100000'));
  assert.equal(r.list[1].error, RECOVERED_ERROR);
  assert.equal(r.list[1].at, new Date(1794006100000).toISOString());
  // Liste illisible, mise de côté : toutes les images reviennent
  const perdue = reconcile([], ['1794006253586.png', '1794006100000.png'], 30);
  assert.deepEqual(perdue.list.map((c) => c.id), ['1794006253586', '1794006100000']);
});

test('entrée sans image, doublon ou id douteux : retirés de la liste', () => {
  const list = [entree('1794006253586'), entree('1794006253586'), entree('1794006000000'), { id: '../x' }, null, entree('179400625358')];
  const r = reconcile(list, ['1794006253586.png'], 30);
  assert.deepEqual(r.list.map((c) => c.id), ['1794006253586']);
  assert.equal(r.changed, true);
});

test('limite de 30 sur toutes les images : les plus anciennes sont effacées, orphelines comprises', () => {
  const ids = Array.from({ length: 35 }, (_, i) => String(1794006000000 + i * 1000));
  const list = ids.slice(5).reverse().map((id) => entree(id)); // 30 dans la liste
  const names = ids.map((id) => `${id}.png`); // et 5 images plus anciennes hors liste
  const r = reconcile(list, names, 30);
  assert.equal(r.list.length, 30);
  assert.deepEqual(r.remove.sort(), ids.slice(0, 5).map((id) => `${id}.png`).sort());
  assert.equal(r.changed, true);
});

test('restes d’écritures coupées (.tmp) : effacés ; autres fichiers jamais touchés', () => {
  const r = reconcile([], ['index.json', 'index.json.123.4.abcdef.tmp', '1794006253586.png.9.1.zz.tmp', 'notes.txt', 'CON.png', '1794006253586.PNG'], 30);
  assert.deepEqual(r.remove.sort(), ['1794006253586.png.9.1.zz.tmp', 'index.json.123.4.abcdef.tmp']);
  assert.deepEqual(r.list, [], 'ni « CON.png » ni une extension en majuscules ne deviennent une capture');
  assert.ok(isCaptureId('1794006253586'));
});
