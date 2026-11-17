// Tests des images de vaisseaux : la clé reçue dans l'adresse devient un nom de fichier,
// elle est donc vérifiée (même règle qu'à l'écriture) avant tout accès au disque.
// Le service est créé sans son constructeur (ni journal, ni téléchargement) et fs est simulé :
// aucun fichier n'est lu ni écrit dans server/data.

import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EngineeringService, IMAGES_DIR, checkShipKey, isShipKey } from '../services/service.js';
import { IMAGE_HEADERS } from '../index.js';

afterEach(() => mock.restoreAll());

function service(ref = null) {
  const svc = Object.create(EngineeringService.prototype);
  svc.ref = ref;
  return svc;
}

/** Espionne les accès disque du service (aucun n'atteint le vrai disque). */
function spyDisk(exists = () => false) {
  // Écriture atomique (core/atomic.js) : ouverture d'un fichier temporaire, écriture, fsync, renommage
  const written = [];
  return {
    exists: mock.method(fs, 'existsSync', exists),
    write: mock.method(fs, 'writeFileSync', () => {}),
    open: mock.method(fs, 'openSync', (p) => {
      written.push({ path: p, chunks: [] });
      return 4242;
    }),
    writeSync: mock.method(fs, 'writeSync', (fd, buf, off = 0, len = buf.length - off) => {
      written.at(-1).chunks.push(Buffer.from(buf.subarray(off, off + len)));
      return len;
    }),
    fsync: mock.method(fs, 'fsyncSync', () => {}),
    close: mock.method(fs, 'closeSync', () => {}),
    rm: mock.method(fs, 'rmSync', () => {}),
    mkdir: mock.method(fs, 'mkdirSync', () => {}),
    written,
  };
}

const BAD_KEYS = ['../../dev', '..\\..\\dev', 'anaconda/../../db', '..', 'Anaconda', 'ana conda', 'anaconda.png', 'anaconda\n', '', 'a'.repeat(65), 'é', null, undefined, 42, ['anaconda']];
const isBadRequest = (err) => err.status === 400 && err.publicMessage === 'Vaisseau invalide.';

test('clé de vaisseau : format coriolis seulement (minuscules, chiffres, _)', () => {
  for (const key of ['anaconda', 'federal_corvette', 'krait_mkii', 'type_10_defender']) {
    assert.equal(isShipKey(key), true, key);
    assert.equal(checkShipKey(key), key);
  }
  for (const key of BAD_KEYS) {
    assert.equal(isShipKey(key), false, String(key));
    assert.throws(() => checkShipKey(key), isBadRequest);
  }
});

test('image du joueur : clé invalide refusée (400) avant tout accès au disque', () => {
  const disk = spyDisk();
  const svc = service({ imageFile: () => '/ne/doit/pas/servir.svg' });
  for (const key of BAD_KEYS) {
    assert.throws(() => svc.customImage(key), isBadRequest, String(key));
    assert.throws(() => svc.imagePath(key), isBadRequest, String(key)); // route GET : 400
    assert.equal(svc.hasImage(key), false); // listes de la flotte : pas d'erreur, juste pas d'image
    assert.throws(() => svc.saveCustomImage(key, 'data:image/png;base64,iVBORw0KGgo='), isBadRequest);
  }
  for (const spy of Object.values(disk)) if (spy.mock) assert.equal(spy.mock.callCount(), 0);
  assert.deepEqual(disk.written, []);
});

test('image du joueur : clé valide cherchée seulement dans data/images', () => {
  const disk = spyDisk();
  const svc = service(null);
  assert.equal(svc.customImage('federal_corvette'), null);
  assert.equal(svc.customImage('constructor'), null); // nom de fichier ordinaire, toujours dans le dossier
  const seen = disk.exists.mock.calls.map((c) => c.arguments[0]);
  assert.equal(seen.length, 6);
  for (const p of seen) assert.equal(path.dirname(p), path.resolve(IMAGES_DIR));
  assert.deepEqual(seen.slice(0, 3).map((p) => path.basename(p)), ['federal_corvette.png', 'federal_corvette.jpg', 'federal_corvette.webp']);
});

test('image : celle du joueur d\'abord, sinon le dessin téléchargé', () => {
  const own = path.join(IMAGES_DIR, 'anaconda.jpg');
  spyDisk((p) => p === own);
  const svc = service({ imageFile: (k) => (k === 'python' ? '/ref/images/python.svg' : null) });
  assert.equal(svc.imagePath('anaconda'), own);
  assert.equal(svc.imagePath('python'), '/ref/images/python.svg');
  assert.equal(svc.imagePath('mamba'), null); // la route répond 404
  assert.equal(svc.hasImage('anaconda'), true);
  assert.equal(svc.hasImage('mamba'), false);
});

test('envoi d\'une image : clé valide mais contenu qui n\'est pas une image → 400, rien d\'écrit', () => {
  const disk = spyDisk();
  const svc = service();
  for (const dataUrl of ['', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/svg+xml;base64,PHN2Zz4=', null]) {
    assert.throws(() => svc.saveCustomImage('anaconda', dataUrl), (err) => err.status === 400);
  }
  assert.equal(disk.write.mock.callCount(), 0);
  assert.equal(disk.rm.mock.callCount(), 0);
});

test('images servies : sandbox et nosniff', () => {
  assert.deepEqual(IMAGE_HEADERS, { 'Content-Security-Policy': 'sandbox', 'X-Content-Type-Options': 'nosniff' });
});

// Petits fichiers d'essai : un vrai PNG d'un pixel, et des contenus qui n'en sont pas
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const asData = (type, b64) => `data:image/${type};base64,${b64}`;

test('envoi d\'une image : contenu reconnu (texte, SVG, JPEG annoncé PNG, base64 faux, PNG géant) → 400, rien d\'écrit', () => {
  const disk = spyDisk();
  const rename = mock.method(fs, 'renameSync', () => {});
  const svc = service({ ships: { anaconda: {} }, imageFile: () => null });
  const huge = Buffer.from(PNG_1PX, 'base64');
  huge.writeUInt32BE(30000, 16);
  huge.writeUInt32BE(30000, 20);
  for (const [dataUrl, raison] of [
    [asData('png', Buffer.from('pas une image').toString('base64')), /ce n’est pas une image/],
    [asData('png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script></script></svg>').toString('base64')), /ce n’est pas une image/],
    [asData('png', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0]).toString('base64')), /en réalité une image JPEG/],
    [asData('jpeg', PNG_1PX), /en réalité une image PNG/],
    [asData('png', '!!!!'), /base64 illisible/],
    [asData('png', `${PNG_1PX.slice(0, -2)}`), /base64 illisible/],
    [asData('png', huge.toString('base64')), /30000 × 30000 px/],
    [asData('svg+xml', PNG_1PX), /format « svg\+xml » refusé/],
  ]) {
    assert.throws(() => svc.saveCustomImage('anaconda', dataUrl), (err) => err.status === 400 && raison.test(err.publicMessage), dataUrl.slice(0, 40));
  }
  assert.equal(disk.write.mock.callCount(), 0);
  assert.equal(disk.rm.mock.callCount(), 0);
  assert.equal(rename.mock.callCount(), 0);
});

test('envoi d\'une image : seulement pour un vaisseau des données de référence (« nul », « com1 », « __proto__ » refusés)', () => {
  const disk = spyDisk();
  const rename = mock.method(fs, 'renameSync', () => {});
  const svc = service({ ships: { anaconda: {} }, imageFile: () => null });
  for (const key of ['nul', 'con', 'com1', 'lpt1', 'aux', 'prn', '__proto__', 'constructor', 'tostring', 'inconnu']) {
    assert.throws(() => svc.saveCustomImage(key, asData('png', PNG_1PX)), (err) => err.status === 400 && /Vaisseau inconnu/.test(err.publicMessage), key);
    assert.equal(svc.customImage(key), null, `${key} : aucun fichier cherché`);
  }
  assert.equal(disk.exists.mock.callCount(), 0);
  assert.equal(disk.write.mock.callCount(), 0);
  assert.equal(disk.open.mock.callCount(), 0);
  assert.equal(rename.mock.callCount(), 0);
  // Un vrai PNG pour un vrai vaisseau : écrit à côté (core/atomic.js : temporaire, fsync), puis renommé ; les autres
  // formats retirés ensuite
  svc.saveCustomImage('anaconda', asData('png', PNG_1PX));
  assert.equal(disk.write.mock.callCount(), 0, 'jamais d’écriture en place');
  assert.equal(disk.written.length, 1);
  const { path: tmp, chunks } = disk.written[0];
  assert.equal(path.dirname(tmp), path.resolve(IMAGES_DIR));
  assert.notEqual(tmp, path.join(IMAGES_DIR, 'anaconda.png'));
  assert.ok(Buffer.concat(chunks).equals(Buffer.from(PNG_1PX, 'base64')));
  assert.equal(disk.fsync.mock.callCount(), 1, 'sur le disque avant le renommage');
  assert.deepEqual(rename.mock.calls[0].arguments, [tmp, path.join(IMAGES_DIR, 'anaconda.png')]);
  assert.deepEqual(disk.rm.mock.calls.map((c) => path.basename(c.arguments[0])), ['anaconda.jpg', 'anaconda.webp']);
});
