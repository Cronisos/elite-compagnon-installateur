// Tests de l'empreinte : la synchronisation OneDrive ne doit pas passer pour une modification.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprint } from './fingerprint.js';

test("une date modifiée ne change pas l'empreinte, un contenu modifié si", (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'empreinte-'));
  t.after(() => rmSync(dir, { recursive: true }));
  const file = join(dir, 'a.js');
  writeFileSync(file, 'un');
  const before = fingerprint(dir);

  utimesSync(file, new Date(), new Date());
  assert.equal(fingerprint(dir), before);

  writeFileSync(file, 'deux');
  assert.notEqual(fingerprint(dir), before);
});
