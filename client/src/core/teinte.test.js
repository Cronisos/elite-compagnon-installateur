// Teinte de l'app (teinte.js) : variables CSS posées sur la page, rien si la teinte est illisible.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appliquerTeinte, variablesTeinte } from './teinte.js';

test('teinte : variables CSS, refus de ce qui n’est pas une couleur', () => {
  const c = { acc: [126, 179, 255], acc2: [120, 170, 250], clair: [200, 220, 255] };
  assert.deepEqual(variablesTeinte(c), { '--acc-rgb': '126, 179, 255', '--acc2-rgb': '120, 170, 250', '--accent-clair': 'rgb(200, 220, 255)' });
  assert.equal(variablesTeinte({ ...c, acc: [300, 0, 0] }), null);
  assert.equal(variablesTeinte({ ...c, acc: ['1); background: url(x)', 0, 0] }), null, 'jamais de texte dans le CSS');
  assert.equal(variablesTeinte(null), null);
  const pose = {};
  const el = { style: { setProperty: (k, v) => { pose[k] = v; } } };
  assert.equal(appliquerTeinte(c, el), true);
  assert.equal(pose['--acc-rgb'], '126, 179, 255');
  assert.equal(appliquerTeinte(null, el), false);
});
