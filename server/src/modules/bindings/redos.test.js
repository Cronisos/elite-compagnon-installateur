// Garde des commandes face à un profil de commandes piégé (partagé sur Discord, copié dans Options\Bindings) : la
// lecture reste en temps linéaire. Avant, « <Root » répété sans « > », ou une valeur « &amp;amp;… » démesurée,
// prenaient des secondes à des minutes (temps quadratique), au démarrage puis à chaque relecture, et figeaient tout
// le serveur. Fichiers construits en mémoire ou dans un dossier temporaire ; rien d'autre n'est lu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { devicesInBinds, presetNameOf } from './parse.js';
import { BindingsGuard, MAX_READ } from './guard.js';
import { decodeEntities } from '../../core/text.js';

const MO = 1024 * 1024;
const chrono = (fn) => {
  const t = performance.now();
  const r = fn();
  return { r, ms: performance.now() - t };
};
// Large marge pour un PC chargé : l'ancien code mettait plus de 10 s sur 1 Mo, le nouveau quelques millisecondes
const LIMITE_MS = 250;

test('nom du profil : 1 Mo de « <Root » sans « > », lu en temps linéaire', () => {
  const xml = '<Root'.repeat(MO / 5);
  const { r, ms } = chrono(() => presetNameOf(xml, 'Partage.4.2.binds'));
  assert.equal(r, 'Partage', 'nom tiré du fichier');
  assert.ok(ms < LIMITE_MS, `${ms.toFixed(0)} ms`);
});

test('nom du profil : « <Root » cachés dans un commentaire avant la vraie racine (XML valide)', () => {
  const xml = `<?xml version="1.0"?>\n<!-- ${'<Root '.repeat(MO / 6)} -->\n<Root PresetName="Partage X52" MajorVersion="4" MinorVersion="2">\n</Root>`;
  const { r, ms } = chrono(() => presetNameOf(xml, 'Partage.4.2.binds'));
  assert.equal(r, 'Partage X52');
  assert.ok(ms < LIMITE_MS, `${ms.toFixed(0)} ms`);
});

test('nom du profil : valeur « &amp;amp;… » de 1 Mo ignorée ; nom ordinaire toujours lu', () => {
  const piege = `<Root PresetName="${`&${'amp;'.repeat(MO / 4)}`}x" MajorVersion="4">`;
  const { r, ms } = chrono(() => presetNameOf(piege, 'Partage.4.2.binds'));
  assert.equal(r, 'Partage');
  assert.ok(ms < LIMITE_MS, `${ms.toFixed(0)} ms`);
  assert.equal(presetNameOf('<Root PresetName="Mon profil &amp; X52" MajorVersion="4">', 'x.4.2.binds'), 'Mon profil & X52');
  assert.equal(presetNameOf('<RootX PresetName="Faux"><Root PresetName="Vrai">', 'x.4.2.binds'), 'Vrai');
});

test('manettes : 1 Mo de Device="&amp;…" lu en temps linéaire, valeur démesurée ignorée', () => {
  const xml = `<Primary Device="${`&${'amp;'.repeat(MO / 4)}`}" Key="x"/><Primary Device="SaitekX52" Key="Joy_1"/>`;
  const { r, ms } = chrono(() => devicesInBinds(xml));
  assert.deepEqual(r, [{ id: 'SaitekX52', count: 1 }]);
  assert.ok(ms < LIMITE_MS, `${ms.toFixed(0)} ms`);
});

test('entités : 1 Mo de « &amp;amp;… » décodé en temps linéaire, même résultat', () => {
  const s = `&${'amp;'.repeat(MO / 4)}nbsp;`;
  const { r, ms } = chrono(() => decodeEntities(s));
  assert.equal(r, ' ');
  assert.ok(ms < LIMITE_MS * 2, `${ms.toFixed(0)} ms`);
  // Entité révélée par le décodage d'une autre : toujours décodée, et le résultat ne change plus
  assert.equal(decodeEntities('&am&#112;;'), '&');
  assert.equal(decodeEntities('&amp&#59;'), '&');
  assert.equal(decodeEntities(decodeEntities('&am&#112;;#38;')), decodeEntities('&am&#112;;#38;'));
});

test('entités : un « & » suivi de 1 Mo de « ; » (ou de « x; ») lu en temps linéaire, texte inchangé', () => {
  // Avant la borne de recherche du « & » (10 unités) : chaque « ; » relisait tout le texte écrit, 40 000 « ; » prenaient
  // plus d'une seconde, 1 Mo une dizaine de minutes
  for (const s of [`&${';'.repeat(MO)}`, `&${'x;'.repeat(MO / 2)}`, `${'&'.repeat(MO / 2)}${';'.repeat(MO / 2)}`]) {
    const { r, ms } = chrono(() => decodeEntities(s));
    assert.equal(r, s);
    assert.ok(ms < LIMITE_MS * 2, `${ms.toFixed(0)} ms`);
  }
  assert.equal(decodeEntities('&#1114111;'), String.fromCodePoint(0x10ffff), 'entité la plus longue (10 caractères) toujours décodée');
  assert.equal(decodeEntities('&#00001114111;'), '&#00001114111;', 'au-delà de 10 caractères : laissée telle quelle, comme avant');
});

test('garde : un .binds de plus de 512 Ko n’est pas lu ; un profil piégé de 500 Ko ne bloque pas la relecture', () => {
  assert.equal(MAX_READ, 512 * 1024);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-binds-redos-'));
  try {
    const bindings = path.join(dir, 'Bindings');
    fs.mkdirSync(bindings);
    fs.writeFileSync(path.join(bindings, 'Partage.4.2.binds'), `<?xml version="1.0"?>\n<!-- ${'<Root '.repeat(40_000)} -->\n<Root PresetName="${`&${'amp;'.repeat(25_000)}`}" MajorVersion="4" MinorVersion="2">\n<Primary Device="${`&${'amp;'.repeat(25_000)}`}" Key="x"/>\n</Root>`);
    fs.writeFileSync(path.join(bindings, 'Enorme.4.2.binds'), Buffer.alloc(MAX_READ + 1, 0x41));
    const guard = new BindingsGuard({ dir: bindings, dataFile: path.join(dir, 'bindings.json'), now: () => Date.UTC(2026, 10, 8, 12) });
    const { ms } = chrono(() => {
      guard.setHistory([]);
      guard.refresh?.();
    });
    assert.ok(ms < 2000, `${ms.toFixed(0)} ms (l'ancien code : plusieurs secondes à plusieurs minutes)`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
