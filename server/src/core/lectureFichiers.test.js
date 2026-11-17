// Lecture des données de l'app (audit du 15 nov. 2026) :
//   - B30 : un fichier JSON verrouillé à la lecture n'est plus traité comme absent puis écrasé ;
//   - B39 : un BOM en tête des rôles ou des silences ne fait plus mettre le fichier de côté ;
//   - B36 : une colonne JSON abîmée en base vaut une valeur par défaut, signalée une fois.
// Dossiers temporaires seulement : server/data n'est pas touché.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isPlainObject, isUnread, readJsonFile, writeFileAtomicSync, writeJsonAtomicSync } from './atomic.js';
import { readJsonOrSetAside } from './jsonFile.js';
import { parseJsonColumn } from './jsonColumn.js';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'elite-lecture-'));
const verrou = (code) => Object.assign(new Error(`${code}: resource busy or locked`), { code });

/** readFileSync refusé pour `file` tant que `refus()` le dit. */
function verrouiller(t, file, refus, code = 'EBUSY') {
  const lire = fs.readFileSync;
  return t.mock.method(fs, 'readFileSync', function (f, ...rest) {
    if (String(f) === file && refus()) throw verrou(code);
    return lire.call(this, f, ...rest);
  });
}

test('lecture verrouillée un instant (antivirus) : réessayée, puis lue', (t) => {
  const dir = tmpDir();
  try {
    const f = path.join(dir, 'sessions.json');
    fs.writeFileSync(f, '{"rescue":{"reset":"2026-11-08T12:00:00Z"}}');
    let refus = 2;
    verrouiller(t, f, () => refus-- > 0);
    const warns = [];
    assert.deepEqual(readJsonFile(f, { fallback: {}, accept: isPlainObject, warn: (m) => warns.push(m) }), { rescue: { reset: '2026-11-08T12:00:00Z' } });
    assert.deepEqual(warns, []);
    assert.equal(isUnread(f), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B30 : toujours verrouillé : valeur par défaut, mais l’écriture suivante garde l’ancien à part au lieu de l’écraser', (t) => {
  const dir = tmpDir();
  try {
    const f = path.join(dir, 'sessions.json');
    const ancien = '{"rescue":{"reset":"2026-11-08T12:00:00Z"},"combat":{"reset":"2026-11-08T13:00:00Z"}}';
    fs.writeFileSync(f, ancien);
    const mock = verrouiller(t, f, () => true);
    const warns = [];
    assert.deepEqual(readJsonFile(f, { fallback: {}, accept: isPlainObject, warn: (m) => warns.push(m) }), {});
    assert.equal(isUnread(f), true);
    assert.match(warns[0], /non lu .* il ne sera pas écrasé/);
    assert.ok(fs.existsSync(f), 'rien n’est déplacé à la lecture');
    mock.mock.restore();
    t.mock.method(console, 'warn', () => {});
    // L'appelant, reparti de {}, enregistre sa seule entrée : l'ancien fichier est d'abord gardé à part
    writeJsonAtomicSync(f, { mining: { reset: null } });
    assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { mining: { reset: null } });
    const gardes = () => fs.readdirSync(dir).filter((n) => n.startsWith('sessions.json.non-relu-'));
    assert.equal(gardes().length, 1);
    assert.equal(fs.readFileSync(path.join(dir, gardes()[0]), 'utf8'), ancien, 'remises à zéro des autres modes gardées');
    assert.equal(isUnread(f), false);
    writeJsonAtomicSync(f, { mining: { reset: 'x' } });
    assert.equal(gardes().length, 1, 'écriture suivante normale');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B30 : non relu et impossible à mettre de côté : erreur, rien d’écrit par-dessus ; relu ensuite : normal', (t) => {
  const dir = tmpDir();
  try {
    const f = path.join(dir, 'escadron.json');
    fs.writeFileSync(f, '{"accord":true}');
    const mock = verrouiller(t, f, () => true, 'EACCES');
    readJsonFile(f, { fallback: null, warn: () => {} });
    mock.mock.restore();
    const copier = fs.copyFileSync;
    const fsImpl = { ...fs, copyFileSync: (a, b, m) => { if (a === f) throw verrou('EBUSY'); return copier(a, b, m); } };
    assert.throws(() => writeFileAtomicSync(f, '{}', { fsImpl }), /non relu, et toujours impossible à mettre de côté/);
    assert.equal(fs.readFileSync(f, 'utf8'), '{"accord":true}');
    assert.equal(isUnread(f), true, 'toujours protégé');
    assert.deepEqual(readJsonFile(f, { fallback: null }), { accord: true });
    assert.equal(isUnread(f), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B30 : non relu, copie gardée, puis l’écriture échoue : l’original reste à son nom, relu au lancement suivant', (t) => {
  const dir = tmpDir();
  try {
    const f = path.join(dir, 'waypoints.json');
    const ancien = '{"points":["Système Test"]}';
    fs.writeFileSync(f, ancien);
    const mock = verrouiller(t, f, () => true);
    readJsonFile(f, { fallback: {}, warn: () => {} });
    mock.mock.restore();
    t.mock.method(console, 'warn', () => {});
    // Copie de côté réussie, puis le renommage final refusé (antivirus) : avant, l'original avait déjà été renommé
    const renommer = fs.renameSync;
    const fsImpl = { ...fs, renameSync: (a, b) => { if (b === f) throw verrou('EPERM'); return renommer(a, b); } };
    assert.throws(() => writeJsonAtomicSync(f, { points: [] }, { fsImpl }), /EPERM/);
    assert.equal(fs.readFileSync(f, 'utf8'), ancien, 'l’original est toujours là, à son nom');
    const gardes = fs.readdirSync(dir).filter((n) => n.startsWith('waypoints.json.non-relu-'));
    assert.equal(gardes.length, 1);
    assert.equal(fs.readFileSync(path.join(dir, gardes[0]), 'utf8'), ancien);
    assert.deepEqual(fs.readdirSync(dir).filter((n) => n.endsWith('.tmp')), [], 'aucun fichier temporaire laissé');
    assert.deepEqual(readJsonFile(f, { fallback: {} }), { points: ['Système Test'] }, 'lancement suivant : réglages retrouvés');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B39 : rôles enregistrés avec un BOM (PowerShell 5.1) : lus, pas mis de côté', () => {
  const dir = tmpDir();
  try {
    const f = path.join(dir, 'ship-roles.json');
    fs.writeFileSync(f, '﻿{"42":"combat"}');
    const warns = [];
    assert.deepEqual(readJsonOrSetAside(f, { warn: (m) => warns.push(m) }), { data: { 42: 'combat' }, status: 'ok' });
    assert.deepEqual(warns, []);
    assert.deepEqual(fs.readdirSync(dir), ['ship-roles.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B36 : colonne JSON abîmée : valeur par défaut, signalée une seule fois ; colonne saine : lue', () => {
  const warns = [];
  const warn = (m) => warns.push(m);
  assert.deepEqual(parseJsonColumn('["a"]', [], { label: 'Test colonne saine', warn }), ['a']);
  assert.deepEqual(parseJsonColumn('["a', [], { label: 'Test colonne 1', warn }), []);
  assert.deepEqual(parseJsonColumn('["a', [], { label: 'Test colonne 1', warn }), []);
  assert.deepEqual(parseJsonColumn('{"a":1}', [], { label: 'Test colonne 2', accept: Array.isArray, warn }), [], 'mauvaise forme');
  assert.equal(parseJsonColumn(undefined, null, { label: 'Test colonne 3', warn }), null);
  assert.equal(warns.length, 3, 'une fois par colonne');
  assert.match(warns[0], /^Test colonne 1 : donnée illisible en base/);
});
