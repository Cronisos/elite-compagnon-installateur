// Tests de l'enregistrement du suivi des ventes (fichier JSON du module), dans un dossier temporaire du système.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_SETTINGS, loadSaleState, saveSaleState, seedFrom } from './saleStore.js';

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'elite-ventes-')), 'data', 'expansion-sales.json');

test('enregistrement : relu tel quel, sans fichier temporaire laissé derrière', () => {
  const file = tempFile();
  saveSaleState(file, { lots: [{ type: 'iridium', count: 3, kind: 'mined', system: 'A' }], cases: [], settings: { autoWindow: false } });
  const back = loadSaleState(file);
  assert.equal(back.lots[0].count, 3);
  assert.equal(back.settings.autoWindow, false);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['expansion-sales.json']);
  fs.rmSync(path.dirname(path.dirname(file)), { recursive: true, force: true });
});

test('fichier absent, illisible ou d\'une autre version : réglages par défaut', () => {
  const file = tempFile();
  assert.deepEqual(loadSaleState(file), { settings: DEFAULT_SETTINGS });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ pas du json');
  assert.deepEqual(loadSaleState(file).settings, DEFAULT_SETTINGS);
  fs.writeFileSync(file, JSON.stringify({ version: 99, lots: [1] }));
  assert.equal(loadSaleState(file).lots, undefined);
  fs.writeFileSync(file, JSON.stringify({ version: 1, settings: { autoWindow: 'oui' } }));
  assert.equal(loadSaleState(file).settings.autoWindow, true);
  fs.rmSync(path.dirname(path.dirname(file)), { recursive: true, force: true });
});

test('relance : les journaux refont tout, le fichier garde seulement ce qu\'ils ne disent plus', () => {
  const saved = {
    savedAt: '2026-11-07T10:00:00Z',
    power: 'Aisling Duval',
    lots: [{ type: 'iridium', count: 3 }],
    carrier: [{ type: 'gold', count: 2 }],
    rares: ['soontillrelics'],
    cases: [{ t: '2026-10-20T10:00:00Z', type: 'a' }, { t: '2026-11-01T10:00:00Z', type: 'b' }],
  };
  const withJournals = seedFrom(saved, '2026-10-24T08:00:00Z');
  assert.deepEqual(withJournals.cases.map((c) => c.type), ['a']); // la vente du 1er nov. sera relue dans les journaux
  assert.deepEqual(withJournals.lots, []);
  assert.deepEqual(withJournals.rares, ['soontillrelics']);
  // Journaux supprimés depuis l'enregistrement : la soute enregistrée sert de départ
  const noJournal = seedFrom(saved, null);
  assert.equal(noJournal.lots.length, 1);
  assert.equal(noJournal.carrier.length, 1);
  assert.equal(noJournal.cases.length, 2);
});
