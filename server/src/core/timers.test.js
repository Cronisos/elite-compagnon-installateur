// Minuteries du cœur : une seule définition (core/timers.js), partagée par les propositions de mode (modeGuess.js) et
// l'avis de bascule (roleSwitch.js), au lieu de deux copies identiques.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { REAL_TIMERS } from './timers.js';

test('minuteries réelles : elles se déclenchent, s’annulent, et ne retiennent pas le serveur à l’arrêt', async () => {
  const fired = await new Promise((resolve) => {
    const t = REAL_TIMERS.set(() => resolve(true), 5);
    assert.equal(t.hasRef(), false, 'unref : le serveur peut s’arrêter sans attendre');
  });
  assert.equal(fired, true);
  let late = false;
  const t = REAL_TIMERS.set(() => (late = true), 5);
  REAL_TIMERS.clear(t);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(late, false);
  assert.ok(Object.isFrozen(REAL_TIMERS));
});

test('une seule définition : ni modeGuess.js ni roleSwitch.js n’en gardent une copie', () => {
  for (const f of ['modeGuess.js', 'roleSwitch.js']) {
    const src = fs.readFileSync(fileURLToPath(new URL(`./${f}`, import.meta.url)), 'utf8');
    assert.match(src, /import \{ REAL_TIMERS \} from '\.\/timers\.js';/, f);
    assert.doesNotMatch(src, /REAL_TIMERS = /, f);
  }
});
