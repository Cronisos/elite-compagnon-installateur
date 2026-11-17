// Chargement des données de référence : la méta lue est celle du dossier chargé, et l'état « versions figées »
// (verifyReference) l'accompagne, pour /status et l'onglet Données. Copie des données de référence de la worktree
// (server/data/reference) dans un dossier temporaire ; sauté si elles ne sont pas là.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REF_DIR } from './download.js';
import { loadReference } from './refdata.js';

const present = fs.existsSync(path.join(REF_DIR, 'meta.json'));

test('loadReference(dossier) : méta de CE dossier, et écart aux versions figées signalé', { skip: !present && 'données de référence absentes' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-refdata-'));
  try {
    fs.cpSync(REF_DIR, dir, { recursive: true });
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ ...meta, version: 'copie-test' }));
    const ref = loadReference(dir);
    assert.equal(ref.meta.version, 'copie-test', 'avant : la méta de REF_DIR, pas celle du dossier demandé');
    assert.equal(typeof ref.integrity.pinned, 'boolean');
    assert.ok(Array.isArray(ref.integrity.problems));
    // Une table modifiée sur place : signalée au chargement suivant
    fs.appendFileSync(path.join(dir, 'fdevids', 'material.csv'), '\n');
    const apres = loadReference(dir);
    assert.equal(apres.integrity.pinned, false);
    assert.match(apres.integrity.problems.join('\n'), /fdevids\/material\.csv : empreinte/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
