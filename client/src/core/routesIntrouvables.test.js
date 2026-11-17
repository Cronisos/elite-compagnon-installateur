// Chaque module qui a des sous-pages répond « Page introuvable » à une adresse inconnue (route path="*"), au lieu
// d'afficher une page vide.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../modules');

function jsx(dossier) {
  const out = [];
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) out.push(...jsx(p));
    else if (e.name.endsWith('.jsx')) out.push(p);
  }
  return out;
}

test('sous-pages des modules : une route « * » dans chaque <Routes>', () => {
  const sans = [];
  for (const f of jsx(MODULES)) {
    const src = fs.readFileSync(f, 'utf8');
    const blocs = src.split('<Routes>').slice(1).map((b) => b.split('</Routes>')[0]);
    if (blocs.some((b) => !/path="\*"/.test(b))) sans.push(path.relative(MODULES, f));
  }
  assert.deepEqual(sans, []);
});
