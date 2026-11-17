// Tests des packs d'avatars : pack par défaut, packs du joueur (dossiers temporaires), refus et remplacements.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOODS } from './categories.js';
import { DEFAULT_PACK, MAX_IMAGE_BYTES, dimensions, imageFor, listPacks, packInfo, readPack, sniff, validPackId } from './packs.js';

const BUILTIN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'avatars', DEFAULT_PACK);

// Débuts d'images valides de w × h px (le contenu n'est jamais décodé : seuls l'en-tête et, pour un GIF, la
// position et la taille de chaque image sont lus)
function png(w = 512, h = 512) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  b[24] = 8; // 8 bits
  b[25] = 6; // RVBA
  return b;
}
/** frames : [largeur, hauteur, gauche, haut] de chaque image de l'animation. */
function gif(w = 512, h = 512, frames = [[w, h]]) {
  const screen = Buffer.alloc(7); // sans palette globale
  screen.writeUInt16LE(w, 0);
  screen.writeUInt16LE(h, 2);
  const parts = [Buffer.from('GIF89a', 'latin1'), screen, Buffer.from([0x21, 0xf9, 4, 0, 10, 0, 0, 0])]; // délai d'animation
  for (const [fw, fh, left = 0, top = 0] of frames) {
    const d = Buffer.alloc(10);
    d[0] = 0x2c;
    d.writeUInt16LE(left, 1);
    d.writeUInt16LE(top, 3);
    d.writeUInt16LE(fw, 5);
    d.writeUInt16LE(fh, 7);
    parts.push(d, Buffer.from([2, 2, 0x4c, 0x01, 0])); // code LZW de 2 bits, un sous-bloc de 2 octets, fin
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}
function webp(kind = 'VP8 ', w = 512, h = 512) {
  const b = Buffer.alloc(40);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(32, 4);
  b.write(`WEBP${kind}`, 8, 'latin1');
  b.writeUInt32LE(20, 16);
  if (kind === 'VP8 ') {
    b.set([0x9d, 0x01, 0x2a], 23);
    b.writeUInt16LE(w, 26);
    b.writeUInt16LE(h, 28);
  } else if (kind === 'VP8L') {
    b[20] = 0x2f;
    b.writeUInt32LE(((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14), 21);
  } else {
    b.writeUIntLE(w - 1, 24, 3);
    b.writeUIntLE(h - 1, 27, 3);
  }
  return b;
}
const PNG = png();
const GIF = gif();
const WEBP = webp();
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compagnon-packs-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function makePack(root, name, files) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), typeof content === 'string' || Buffer.isBuffer(content) ? content : JSON.stringify(content));
  return dir;
}

test('format reconnu au contenu : PNG (et APNG), GIF, WebP ; rien d’autre', () => {
  assert.equal(sniff(PNG), 'png');
  assert.equal(sniff(GIF), 'gif');
  assert.equal(sniff(Buffer.concat([Buffer.from('GIF87a', 'latin1'), Buffer.alloc(10)])), 'gif');
  assert.equal(sniff(WEBP), 'webp');
  assert.equal(sniff(SVG), null);
  assert.equal(sniff(Buffer.from('court')), null);
});

test('noms de pack : lettres, chiffres, - et _ ; jamais une propriété d’Object', () => {
  assert.ok(validPackId('mon-pack_2'));
  for (const bad of ['', '../x', 'a/b', 'a.b', '-x', 'constructor', '__proto__', 'toString', 'x'.repeat(41), 42, null]) {
    assert.equal(validPackId(bad), false, String(bad));
  }
});

test('pack par défaut : 8 humeurs et le clignement, en SVG, même cadrage', () => {
  const pack = readPack(BUILTIN, DEFAULT_PACK, { builtin: true });
  assert.deepEqual(pack.errors, []);
  assert.ok(pack.ok);
  assert.deepEqual(pack.missing, []);
  for (const m of [...MOODS, 'clignement']) {
    const img = pack.images.get(m);
    assert.equal(img.type, 'image/svg+xml', m);
    const svg = fs.readFileSync(img.file, 'utf8');
    assert.match(svg, /viewBox="0 0 512 512"/, m);
    assert.doesNotMatch(svg, /<script|on\w+=|href=/i, `${m} : ni script, ni lien`);
  }
  assert.equal(pack.name, 'Copilote');
});

test('pack du joueur sans pack.json : images trouvées sous le nom de l’humeur ; humeur manquante → neutre', (t) => {
  const root = tempDir(t);
  makePack(root, 'mon-pack', { 'neutre.png': PNG, 'ravi.gif': GIF, 'Triste.WEBP': WEBP, 'clignement.png': PNG, 'notes.txt': 'x' });
  const packs = listPacks({ dir: root, builtinDir: BUILTIN });
  assert.deepEqual([...packs.keys()], [DEFAULT_PACK, 'mon-pack']);
  const pack = packs.get('mon-pack');
  assert.ok(pack.ok);
  assert.deepEqual(pack.errors, []);
  assert.deepEqual(pack.missing.sort(), ['content', 'endormi', 'inquiet', 'malicieux', 'surpris']);
  assert.equal(imageFor(pack, 'ravi').type, 'image/gif');
  assert.equal(imageFor(pack, 'triste').type, 'image/webp');
  assert.equal(imageFor(pack, 'surpris'), pack.images.get('neutre'));
  const info = packInfo(pack, '/api/modules/compagnon/avatars');
  assert.match(info.moods.surpris, /^\/api\/modules\/compagnon\/avatars\/mon-pack\/surpris\?v=\d+$/);
  assert.match(info.blink, /\/clignement\?v=/);
  assert.equal(info.name, 'mon-pack');
});

test('pack.json : nom, auteur, fichiers déclarés, phrases validées', (t) => {
  const root = tempDir(t);
  makePack(root, 'nova', {
    'pack.json': {
      nom: 'Nova la pilote', auteur: 'l’auteur',
      humeurs: { neutre: 'nova-calme.png', ravi: 'nova-yeah.gif', surpris: 'absent.png', fache: 'x.png', triste: '../../secret.png' },
      phrases: { vente: [{ texte: 'Ka-ching ! {profit}', humeur: 'ravi' }, { texte: '{inconnue}' }] },
      remplacerPhrases: true,
    },
    'nova-calme.png': PNG,
    'nova-yeah.gif': GIF,
  });
  const pack = readPack(path.join(root, 'nova'), 'nova');
  assert.equal(pack.name, 'Nova la pilote');
  assert.equal(pack.author, 'l’auteur');
  assert.ok(pack.images.has('neutre') && pack.images.has('ravi'));
  assert.ok(pack.missing.includes('surpris'));
  assert.ok(pack.errors.some((e) => e.includes('absent.png')));
  assert.ok(pack.errors.some((e) => e.includes('fache')));
  assert.ok(pack.errors.some((e) => e.startsWith('triste')), 'chemin vers un autre dossier refusé');
  assert.ok(pack.errors.some((e) => e.includes('{inconnue}')));
  assert.equal(pack.phraseCount, 1);
  assert.equal(pack.replacePhrases, true);
});

test('refus : SVG d’un joueur, faux PNG, mauvaise extension, image trop lourde', (t) => {
  const root = tempDir(t);
  makePack(root, 'piege', {
    'neutre.svg': SVG,
    'pack.json': { humeurs: { content: 'content.svg', ravi: 'ravi.png', triste: 'triste.png', surpris: 'surpris.png' } },
    'content.svg': SVG,
    'ravi.png': SVG,
    'triste.png': GIF,
    'surpris.png': Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]),
  });
  const pack = readPack(path.join(root, 'piege'), 'piege');
  assert.equal(pack.ok, false, 'aucune image utilisable');
  assert.equal(pack.images.size, 0);
  const all = pack.errors.join('\n');
  assert.match(all, /neutre\.svg : SVG refusé/);
  assert.match(all, /content\.svg : SVG refusé/);
  assert.match(all, /ravi\.png : ce n'est pas une image/);
  assert.match(all, /triste\.png : c'est en réalité une image GIF/);
  assert.match(all, /surpris\.png : 4,0 Mo, 4 Mo au plus/);
});

test('dimensions lues dans l’en-tête : PNG, GIF (chaque image de l’animation), WebP', () => {
  assert.deepEqual(dimensions(png(512, 300), 'png'), { width: 512, height: 300 });
  assert.deepEqual(dimensions(gif(100, 80), 'gif'), { width: 100, height: 80 });
  assert.deepEqual(dimensions(gif(10, 10, [[10, 10], [3000, 20, 5, 0]]), 'gif'), { width: 3005, height: 20 }, 'image plus grande que l’écran logique');
  assert.deepEqual(dimensions(webp('VP8 ', 640, 480), 'webp'), { width: 640, height: 480 });
  assert.deepEqual(dimensions(webp('VP8L', 1000, 2048), 'webp'), { width: 1000, height: 2048 });
  assert.deepEqual(dimensions(webp('VP8X', 4096, 512), 'webp'), { width: 4096, height: 512 });
  assert.equal(dimensions(Buffer.concat([png().subarray(0, 12), Buffer.alloc(20)]), 'png'), null, 'pas de bloc IHDR');
  assert.equal(dimensions(Buffer.concat([webp().subarray(0, 12), Buffer.from('ALPH'), Buffer.alloc(20)]), 'webp'), null);
});

test('refus : image de plus de 2 048 px de côté (un PNG uni de 4 Mo peut en faire 25 000), en-tête abîmé', (t) => {
  const root = tempDir(t);
  makePack(root, 'geant', {
    'neutre.png': png(2048, 2048),
    'ravi.png': png(25_000, 25_000),
    'triste.gif': gif(16, 16, [[16, 16], [16, 4000]]),
    'surpris.webp': webp('VP8X', 3000, 100),
    'content.png': Buffer.concat([png().subarray(0, 8), Buffer.alloc(24)]),
  });
  const pack = readPack(path.join(root, 'geant'), 'geant');
  assert.deepEqual([...pack.images.keys()], ['neutre'], '2 048 px : accepté');
  const all = pack.errors.join('\n');
  assert.match(all, /ravi\.png : 25 000 × 25 000 px, 2 048 px de côté au plus/);
  assert.match(all, /triste\.gif : 16 × 4 000 px/);
  assert.match(all, /surpris\.webp : 3 000 × 100 px/);
  assert.match(all, /content\.png : dimensions illisibles/);
});

test('dossiers ignorés : nom invalide, « defaut » réservé, fichier au lieu d’un dossier ; pack.json illisible signalé', (t) => {
  const root = tempDir(t);
  makePack(root, 'constructor', { 'neutre.png': PNG });
  makePack(root, 'defaut', { 'neutre.png': PNG });
  makePack(root, 'avec espace', { 'neutre.png': PNG });
  fs.writeFileSync(path.join(root, 'fichier.png'), PNG);
  makePack(root, 'casse', { 'pack.json': '{ pas du json', 'neutre.png': PNG });
  const packs = listPacks({ dir: root, builtinDir: BUILTIN });
  assert.deepEqual([...packs.keys()], [DEFAULT_PACK, 'casse']);
  assert.ok(packs.get(DEFAULT_PACK).builtin);
  const casse = packs.get('casse');
  assert.ok(casse.ok, 'les images restent utilisables');
  assert.match(casse.errors[0], /pack\.json illisible/);
});

test('dossier des packs absent : créé, et seul le pack par défaut est listé', (t) => {
  const root = path.join(tempDir(t), 'compagnon', 'avatars');
  const packs = listPacks({ dir: root, builtinDir: BUILTIN });
  assert.deepEqual([...packs.keys()], [DEFAULT_PACK]);
  assert.ok(fs.statSync(root).isDirectory());
});
