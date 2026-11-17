// Sites externes, côté interface (sites.js) : registre et adresse courte.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SITES, adresseCourte } from './sites.js';

test('registre : mêmes identifiants que celui de l’app de bureau, adresses en https', () => {
  const bureau = fs.readFileSync(new URL('../../../../desktop/sites.js', import.meta.url), 'utf8');
  for (const s of SITES) {
    assert.match(s.id, /^[a-z0-9-]+$/);
    assert.ok(bureau.includes(`${s.id}: Object.freeze({`), `${s.id} absent de desktop/sites.js`);
    assert.ok(s.accueil.startsWith('https://'), s.accueil);
  }
});

test('adresse courte', () => {
  assert.equal(adresseCourte('https://inara.cz/'), 'inara.cz');
  assert.equal(adresseCourte('https://inara.cz/elite/cmdr/123/?x=1#a'), 'inara.cz/elite/cmdr/123');
  assert.equal(adresseCourte(undefined), '');
});
