// Écriture atomique (core/atomic.js) : jamais de fichier coupé, même processus tué en pleine écriture ; renommage
// réessayé puis refusé sans écrire en place ; fichier illisible mis de côté. Et aucune écriture de fichier du serveur
// ne passe à côté (même modèle que le test du réseau, net.test.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isPlainObject, readJsonFile, setAside, writeFileAtomicSync, writeJsonAtomicSync } from './atomic.js';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'elite-atomic-'));
const sansTemp = (dir) => fs.readdirSync(dir).filter((n) => n.endsWith('.tmp'));

test('écriture : le fichier final reçoit tout, aucun fichier temporaire ne reste, droits demandés passés', () => {
  const dir = tmpDir();
  try {
    const f = path.join(dir, 'sous', 'etat.json');
    writeJsonAtomicSync(f, { a: 1 });
    writeJsonAtomicSync(f, { a: 2, b: 'é' });
    assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { a: 2, b: 'é' });
    writeFileAtomicSync(path.join(dir, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]), { mode: 0o600 });
    assert.deepEqual([...fs.readFileSync(path.join(dir, 'image.png'))], [0x89, 0x50, 0x4e, 0x47]);
    assert.deepEqual(sansTemp(path.join(dir, 'sous')), []);
    assert.deepEqual(sansTemp(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** fs réel, sauf renameSync qui échoue `n` fois avec `code` ; note chaque ouverture. */
function fsQuiRefuse(n, code) {
  const opened = [];
  let refus = 0;
  return {
    opened,
    impl: {
      ...fs,
      openSync: (p, ...rest) => {
        opened.push(p);
        return fs.openSync(p, ...rest);
      },
      renameSync: (a, b) => {
        if (refus < n) {
          refus += 1;
          throw Object.assign(new Error(`${code}: simulé`), { code });
        }
        return fs.renameSync(a, b);
      },
    },
  };
}

test('renommage refusé un instant (antivirus) : réessayé, puis réussi', () => {
  const dir = tmpDir();
  try {
    const f = path.join(dir, 'etat.json');
    fs.writeFileSync(f, '{"ancien":true}');
    const { impl } = fsQuiRefuse(2, 'EBUSY');
    writeJsonAtomicSync(f, { nouveau: true }, { fsImpl: impl });
    assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { nouveau: true });
    assert.deepEqual(sansTemp(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('renommage toujours refusé : erreur, ancienne version intacte, JAMAIS d’écriture en place, temporaire retiré', () => {
  const dir = tmpDir();
  try {
    const f = path.join(dir, 'escadron-jeton.json');
    fs.writeFileSync(f, '{"token":"ancien"}');
    for (const code of ['EPERM', 'EBUSY', 'EACCES', 'ENOSPC']) {
      const { impl, opened } = fsQuiRefuse(1000, code);
      assert.throws(() => writeJsonAtomicSync(f, { token: 'nouveau' }, { fsImpl: impl }), (err) => err.code === code);
      assert.equal(fs.readFileSync(f, 'utf8'), '{"token":"ancien"}', code);
      assert.ok(opened.every((p) => p !== f), `${code} : le fichier final n'est jamais ouvert pour écrire`);
      assert.deepEqual(sansTemp(dir), [], code);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('processus tué en pleine écriture : le fichier reste toujours lisible (ancienne ou nouvelle version)', async () => {
  const dir = tmpDir();
  try {
    const f = path.join(dir, 'sweep.json');
    writeJsonAtomicSync(f, { n: 0, trail: [] });
    const script = path.join(dir, 'ecrivain.mjs');
    fs.writeFileSync(script, [
      `import { writeJsonAtomicSync } from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL('./atomic.js', import.meta.url))).href)};`,
      `const trail = Array.from({ length: 1500 }, (_, i) => ({ x: i, y: i * 2, t: '2026-11-08T12:00:00.000Z' }));`,
      'process.send?.("pret");',
      `for (let n = 1; ; n++) writeJsonAtomicSync(${JSON.stringify(f)}, { n, trail });`,
    ].join('\n'));
    const abimes = [];
    for (let i = 0; i < 12; i++) {
      const child = spawn(process.execPath, [script], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      await new Promise((r) => child.once('message', r));
      await new Promise((r) => setTimeout(r, 5 + Math.floor(Math.random() * 40)));
      child.kill(); // TerminateProcess sous Windows : comme la relance de dev.js ou la fenêtre du serveur fermée
      await new Promise((r) => child.once('exit', r));
      try {
        const v = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (!Number.isInteger(v.n) || v.trail.length !== (v.n === 0 ? 0 : 1500)) abimes.push(`essai ${i} : contenu incomplet`);
      } catch (err) {
        abimes.push(`essai ${i} : ${err.message}`);
      }
    }
    assert.deepEqual(abimes, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('lecture : absent → valeur par défaut ; illisible ou de mauvaise forme → mis de côté avec un avertissement', () => {
  const dir = tmpDir();
  try {
    const f = path.join(dir, 'sessions.json');
    const warns = [];
    const warn = (m) => warns.push(m);
    assert.deepEqual(readJsonFile(f, { fallback: {}, warn }), {});
    assert.deepEqual(warns, [], 'absent : rien à signaler');
    fs.writeFileSync(f, '{"rescue":{"reset":"2026-11-0'); // coupé en pleine écriture
    assert.deepEqual(readJsonFile(f, { fallback: {}, accept: isPlainObject, warn, now: Date.UTC(2026, 10, 8, 12) }), {});
    assert.ok(!fs.existsSync(f), 'le fichier coupé ne reste pas là pour être écrasé');
    const aside = fs.readdirSync(dir).filter((n) => n.startsWith('sessions.json.illisible-'));
    assert.equal(aside.length, 1);
    assert.equal(fs.readFileSync(path.join(dir, aside[0]), 'utf8'), '{"rescue":{"reset":"2026-11-0', 'gardé tel quel');
    assert.match(warns[0], /illisible, mis de côté/);
    fs.writeFileSync(f, '[1,2]');
    assert.deepEqual(readJsonFile(f, { fallback: {}, accept: isPlainObject, warn, now: Date.UTC(2026, 10, 8, 13) }), {}, 'tableau au lieu d’objet');
    fs.writeFileSync(f, '﻿{"a":1}');
    assert.deepEqual(readJsonFile(f, { fallback: {}, accept: isPlainObject, warn }), { a: 1 }, 'BOM accepté');
    assert.equal(setAside(path.join(dir, 'absent.json'), { warn }), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- Aucune écriture de fichier qui contourne core/atomic.js ---
const SRC = fileURLToPath(new URL('../', import.meta.url));
function sources(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== 'fixtures') sources(p, out);
    } else if (e.name.endsWith('.js') && !e.name.endsWith('.test.js') && !p.includes('__golden__')) out.push(p);
  }
  return out;
}
// Seules exceptions, chacune avec sa raison
const PERMIS = new Map([
  ['core/atomic.js', 'la fonction elle-même'],
  ['core/ocr.js', 'images temporaires de l’OCR dans le dossier temporaire de Windows, effacées ensuite'],
  ['core/reference/download.js', 'téléchargement dans un dossier temporaire, qui remplace l’ancien d’un coup (replaceDir)'],
  ['core/sauvegardes.js', 'copie complète dans un dossier temporaire voisin, renommé d’un coup à la fin : une sauvegarde coupée en route ne ressemble jamais à une bonne'],
  ['modules/hudcolours/store.js', 'fichier du jeu : sa propre écriture atomique avec fsync, sauvegardes créées en « wx »'],
  ['modules/fsdcool/index.js', 'fsd-status.log : relevé en ajout (appendFile), une ligne par changement, jamais relu par l’app'],
  ['core/vigie.js', 'vigie.jsonl : journal des observations en ajout (appendFile), une ligne par mesure, jamais relu pour décider ; l’état, lui, passe par writeJsonAtomicSync'],
  ['core/crashGuard.js', 'console d’erreurs (descripteur 2, writeSync), jamais un fichier : dernier message avant l’arrêt'],
]);

test('fichiers : aucun module ni le cœur n’écrit un fichier sans core/atomic.js', () => {
  const found = [];
  for (const file of sources(SRC)) {
    const rel = path.relative(SRC, file).replace(/\\/g, '/');
    if (PERMIS.has(rel)) continue;
    const text = fs.readFileSync(file, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    const checks = [
      [/\bwriteFileSync\s*\(/, 'writeFileSync'],
      [/(?<![\w.])(?:fs|fsp|promises|fh)\s*\.\s*writeFile\s*\(/, 'writeFile'],
      [/\bappendFile(Sync)?\s*\(/, 'appendFile'],
      [/\bcreateWriteStream\s*\(/, 'createWriteStream'],
      [/\bcopyFile(Sync)?\s*\(/, 'copyFile'],
      [/\bwriteSync\s*\(/, 'writeSync'],
    ];
    for (const [re, what] of checks) if (re.test(text)) found.push(`${rel} : ${what}`);
  }
  assert.deepEqual(found, [], 'écrire par writeJsonAtomicSync ou writeFileAtomicSync (core/atomic.js)');
  // Les exceptions existent encore (sinon la liste vieillit en silence)
  for (const rel of PERMIS.keys()) assert.ok(fs.existsSync(path.join(SRC, rel)), `${rel} : exception d'un fichier disparu`);
});
