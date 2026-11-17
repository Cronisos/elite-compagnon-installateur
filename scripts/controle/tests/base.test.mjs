// Contrôle de la base réelle : copie cohérente (l'original seulement lu, jamais ouvert par SQLite), comptes comparés.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compterTables } from '../banc/base.mjs';
import { baseControlee, baseReelle, comparerComptes, copierBaseCoherente } from '../base/controler.mjs';

const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
const empreinte = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

test('base : copie cohérente dans un autre dossier, original inchangé, lignes comptées sur la copie', async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-controle-'));
  try {
    const source = path.join(dossier, 'source', 'elite.db');
    fs.mkdirSync(path.dirname(source));
    const db = new DatabaseSync(source);
    db.exec('CREATE TABLE "Route" (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO "Route" (name) VALUES (\'a\'), (\'b\'); CREATE TABLE "Vide" (id INTEGER);');
    db.close();
    const avant = empreinte(source);
    const { copie, essais, compagnons } = await copierBaseCoherente(source, path.join(dossier, 'copie'));
    assert.equal(essais, 1);
    assert.deepEqual(compagnons, []);
    assert.notEqual(path.dirname(copie), path.dirname(source));
    assert.deepEqual(compterTables(copie), { Route: 2, Vide: 0 });
    assert.equal(empreinte(source), avant, 'original jamais modifié');
    assert.deepEqual(fs.readdirSync(path.dirname(source)), ['elite.db'], 'aucun fichier ajouté à côté de l’original');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});

test('base : comptes comparés (lignes changées, table disparue, table nouvelle à part)', () => {
  assert.deepEqual(comparerComptes({ A: 1, B: 2 }, { A: 1, B: 2 }), { ecarts: [], nouvelles: [] });
  assert.deepEqual(comparerComptes({ A: 1, B: 2 }, { A: 0, C: 0 }), { ecarts: ['table A : 1 → 0 ligne(s)', 'table B disparue (2 ligne(s))'], nouvelles: ['C'] });
});

test('base : celle de l’app de bureau d’abord, sinon celle de npm run dev (server/data), ou CONTROLE_BASE_REELLE', () => {
  // Sans app de bureau (pas d'APPDATA, ou pas de base dedans) : server/data de l'app principale
  assert.equal(path.basename(baseReelle({})), 'elite.db');
  assert.equal(path.basename(path.dirname(baseReelle({}))), 'data');
  assert.equal(path.basename(path.dirname(path.dirname(baseReelle({})))), 'server');
  const appData = path.join(os.tmpdir(), 'Testeur', 'AppData', 'Roaming');
  const bureau = path.join(appData, 'Elite Compagnon', 'donnees', 'elite.db');
  assert.equal(path.basename(path.dirname(baseReelle({ APPDATA: appData }, { existe: () => false }))), 'data');
  // App de bureau installée : SA base, celle qui sert vraiment
  assert.equal(baseReelle({ APPDATA: appData }, { existe: (f) => f === bureau }), bureau);
  const autre = path.join(os.tmpdir(), 'autre', 'elite.db');
  assert.equal(baseReelle({ CONTROLE_BASE_REELLE: autre, APPDATA: appData }, { existe: () => true }), autre);
});

test('base : le rapport dit quelle base et de quand', () => {
  const quand = new Date(2026, 10, 15, 14, 2);
  assert.equal(baseControlee('C:\\Base\\elite.db', { stat: () => ({ mtime: quand }) }), 'C:\\Base\\elite.db, modifiée le 15/11/2026 à 14:02');
  assert.equal(baseControlee('C:\\Base\\absente.db', { stat: () => undefined }), 'C:\\Base\\absente.db');
});
