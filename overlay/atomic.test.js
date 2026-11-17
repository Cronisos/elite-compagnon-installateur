// Écriture atomique de l'overlay (atomic.js, copie CommonJS de server/src/core/atomic.js) : la place des fenêtres est
// écrite d'un coup (fichier temporaire, fsync, renommage), et aucun fichier de l'overlay n'écrit autrement.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeFileAtomicSync, writeJsonAtomicSync } = require('./atomic.js');

test('overlay : aucune écriture de fichier sans atomic.js (jamais un fichier de position coupé)', () => {
  for (const name of fs.readdirSync(__dirname).filter((n) => n.endsWith('.js') && !n.endsWith('.test.js') && n !== 'atomic.js')) {
    const code = fs.readFileSync(path.join(__dirname, name), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    for (const re of [/\bwriteFileSync\s*\(/, /\.writeFile\s*\(/, /\bappendFile(Sync)?\s*\(/, /\bcreateWriteStream\s*\(/, /\bcopyFile(Sync)?\s*\(/, /\bwriteSync\s*\(/]) {
      assert.ok(!re.test(code), `${name} : ${re} (écrire par writeJsonAtomicSync, atomic.js)`);
    }
  }
  assert.match(fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8'), /writeJsonAtomicSync\(placeFile\(page\)/, 'les positions passent par atomic.js');
});

test('position enregistrée d’un coup : jamais de fichier coupé ni de temporaire oublié', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-overlay-pos-'));
  try {
    const f = path.join(dir, 'position-glance.json');
    writeJsonAtomicSync(f, { x: 1, y: 2 });
    writeJsonAtomicSync(f, { x: 3, y: 4, width: 480, height: 460 });
    assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { x: 3, y: 4, width: 480, height: 460 });
    assert.deepEqual(fs.readdirSync(dir), ['position-glance.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('renommage toujours refusé (antivirus) : erreur, ancienne position intacte, jamais d’écriture en place', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-overlay-pos-'));
  try {
    const f = path.join(dir, 'position-combat.json');
    fs.writeFileSync(f, '{"x":1,"y":2}');
    const opened = [];
    const fsImpl = {
      ...fs,
      openSync: (p, ...rest) => {
        opened.push(p);
        return fs.openSync(p, ...rest);
      },
      renameSync: () => {
        throw Object.assign(new Error('EBUSY: simulé'), { code: 'EBUSY' });
      },
    };
    assert.throws(() => writeFileAtomicSync(f, '{"x":9,"y":9}', { fsImpl }), (err) => err.code === 'EBUSY');
    assert.equal(fs.readFileSync(f, 'utf8'), '{"x":1,"y":2}');
    assert.ok(opened.every((p) => p !== f), 'le fichier final n’est jamais ouvert pour écrire');
    assert.deepEqual(fs.readdirSync(dir), ['position-combat.json'], 'aucun temporaire laissé');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
