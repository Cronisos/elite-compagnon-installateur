// Magasin JSON : écriture atomique, fichier illisible mis de côté, fichier verrouillé jamais écrasé, version plus
// récente ni lue ni écrite, aucune écriture spontanée.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JsonStore } from '../services/jsonStore.js';
import { validatePinsFile, emptyPins } from '../services/pins.js';
import { tempDir } from './helpers/itinerary.js';

const quiet = () => {};
const store = (file, extra = {}) => new JsonStore(file, { label: 'des épingles', validate: validatePinsFile, empty: emptyPins, warn: quiet, ...extra });
const PIN = { version: 1, pins: { 300120: { choice: 'pinned', grp: 'sg', blueprint: 'ShieldGenerator_Thermic', at: '2026-11-08T10:00:00.000Z' } } };

test('magasin : absent, puis écriture atomique (aucun .tmp restant), relu tel quel ; rien écrit à la construction', () => {
  const dir = tempDir();
  try {
    const f = path.join(dir, 'engineering-pins.json');
    const s = store(f);
    assert.equal(s.state, 'absent');
    assert.deepEqual(s.value, emptyPins());
    assert.equal(fs.existsSync(f), false, 'aucune écriture à la construction');
    s.write(PIN);
    assert.deepEqual(fs.readdirSync(dir), ['engineering-pins.json']);
    assert.deepEqual(store(f).value, PIN);
    assert.equal(store(f).state, 'lu');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('magasin : JSON abîmé, clé inconnue, version 0, __proto__ → mis de côté (renommé, jamais écrasé), valeur vide', () => {
  for (const content of ['{abîmé', JSON.stringify({ version: 1, pins: {}, extra: 1 }), JSON.stringify({ version: 0, pins: {} }), '{"version":1,"pins":{"__proto__":{"choice":"none","at":"2026-11-08T10:00:00Z"}}}', JSON.stringify({ version: 1, pins: { 12: { choice: 'none', at: 'x' } } })]) {
    const dir = tempDir();
    try {
      const f = path.join(dir, 'engineering-pins.json');
      fs.writeFileSync(f, content);
      const s = store(f);
      assert.equal(s.state, 'mis de côté', content);
      assert.equal(s.warning.kind, 'mis de côté');
      assert.match(s.warning.aside, /^engineering-pins\.json\.illisible-/);
      assert.equal(fs.existsSync(f), false);
      assert.equal(fs.readFileSync(path.join(dir, s.warning.aside), 'utf8'), content, 'gardé tel quel');
      // Une écriture demandée ensuite repart de zéro, l'avertissement reste
      s.write(PIN);
      assert.equal(s.notice().kind, 'mis de côté');
      assert.equal(s.notice().file, 'des épingles');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('magasin : erreur de lecture (fichier verrouillé) → « non lu », écriture refusée (503), fichier inchangé octet pour octet', () => {
  const dir = tempDir();
  try {
    const f = path.join(dir, 'engineering-pins.json');
    const before = Buffer.from(JSON.stringify(PIN));
    fs.writeFileSync(f, before);
    let locked = true;
    const fsImpl = { ...fs, readFileSync: (...a) => { if (locked && a[0] === f) { const e = new Error('occupé'); e.code = 'EBUSY'; throw e; } return fs.readFileSync(...a); } };
    const s = store(f, { fsImpl });
    assert.equal(s.state, 'non lu');
    assert.deepEqual(s.warning, { kind: 'non lu', code: 'EBUSY' });
    assert.throws(() => s.write({ version: 1, pins: {} }), (err) => err.status === 503 && /n'a pas pu être relu \(EBUSY\) : rien n'est enregistré, pour ne pas l'écraser/.test(err.publicMessage));
    assert.ok(fs.readFileSync(f).equals(before), 'inchangé');
    // Le verrou levé : la lecture suivante réussit
    locked = false;
    assert.deepEqual(s.read(), PIN);
    assert.equal(s.state, 'lu');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('magasin : version plus récente → ni lue ni écrite', () => {
  const dir = tempDir();
  try {
    const f = path.join(dir, 'engineering-pins.json');
    const content = JSON.stringify({ version: 2, pins: { 300120: { choice: 'x' } }, futur: true });
    fs.writeFileSync(f, content);
    const s = store(f);
    assert.equal(s.state, 'plus récent');
    assert.deepEqual(s.value, emptyPins());
    assert.throws(() => s.write(PIN), (err) => err.status === 503 && /version plus récente/.test(err.publicMessage));
    assert.equal(fs.readFileSync(f, 'utf8'), content);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('magasin : fichier trop gros mis de côté', () => {
  const dir = tempDir();
  try {
    const f = path.join(dir, 'engineering-pins.json');
    fs.writeFileSync(f, JSON.stringify({ version: 1, pins: {}, pad: 'x'.repeat(300) }));
    assert.equal(store(f, { maxBytes: 100 }).state, 'mis de côté');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
