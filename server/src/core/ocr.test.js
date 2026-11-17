import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  closeOcr, distinctVersions, OCR_ENGINE, readBest, readChars, readImages, TESSDATA_DIR, verifyLanguageData,
} from './ocr.js';
import { encodePng } from './fixtures/ocr/png.js';

const FIXTURES = fileURLToPath(new URL('./fixtures/ocr/', import.meta.url));
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name));
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

after(() => closeOcr()); // sans quoi le thread de lecture garderait le test ouvert

test('OCR : la meilleure lecture est celle qui lit le plus de caractères', () => {
  assert.equal(readChars({ lines: [{ text: 'OR' }, { text: 'IRIDIUM 38 %' }] }), 12);
  assert.equal(readChars({ lines: [] }), 0);
  assert.equal(readChars(null), 0);
});

test('OCR : le moteur intégré est celui par défaut (PowerShell seulement avec ELITE_OCR=windows)', () => {
  assert.equal(OCR_ENGINE, process.env.ELITE_OCR?.trim().toLowerCase() === 'windows' ? 'windows' : 'tesseract');
});

test('OCR : une seule version par image, la plus petite de mêmes proportions', () => {
  const png = (w, h) => encodePng(w, h, Buffer.alloc(w * h), { color: 0 });
  const raw = png(66, 42);
  const bigger = png(198, 126); // version agrandie ×3 de l'overlay
  const other = png(40, 40);
  const notPng = Buffer.from('autre format');
  assert.deepEqual(distinctVersions([bigger, raw]), [raw]);
  assert.deepEqual(distinctVersions([raw, bigger, other, notPng]), [raw, other, notPng]);
});

test('OCR : les données de langue sont vérifiées (empreinte SHA-256) avant usage', async () => {
  await verifyLanguageData(); // celles livrées avec l'app
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-ocr-test-'));
  try {
    const tampered = path.join(dir, 'fra.traineddata');
    const data = fs.readFileSync(path.join(TESSDATA_DIR, 'fra.traineddata'));
    data[1000] ^= 1; // un seul bit changé
    fs.writeFileSync(tampered, data);
    await assert.rejects(verifyLanguageData(tampered), /altérées.*SHA-256/);
    await assert.rejects(verifyLanguageData(path.join(dir, 'absent.traineddata')), /introuvables/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('OCR intégré : les minerais des vraies captures du panneau de cible sont lus, ligne par ligne', async () => {
  const [first, second] = await readImages([
    fixture('eep-or-helium-iridium-titane.png'),
    fixture('eep-cuivre-lithium-tantale-thorium-uranium.png'),
  ], { engine: 'tesseract' });
  const texts = (r) => r.lines.map((l) => fold(l.text));
  for (const ore of ['OR', 'HELIUM', 'IRIDIUM', 'TITANE']) assert.ok(texts(first).includes(ore), `${ore} dans ${texts(first)}`);
  const five = ['CUIVRE', 'LITHIUM', 'TANTALE', 'THORIUM', 'URANIUM'];
  // Dans l'ordre du panneau, sans le titre tronqué ni le nom du système en morceaux
  assert.deepEqual(texts(second).filter((t) => /^[A-Z]+$/.test(t)), five);
  // Positions dans l'image d'origine (420 × 260), pas dans la version agrandie et redressée :
  // le mot commence vers x = 121, son haut à gauche vers y = 75 (il descend ensuite vers la droite)
  const cuivre = second.lines.find((l) => fold(l.text) === 'CUIVRE');
  assert.ok(Math.abs(cuivre.x - 121) <= 10 && Math.abs(cuivre.y - 75) <= 10, JSON.stringify(cuivre));
  assert.deepEqual(Object.keys(cuivre), ['text', 'x', 'y', 'w', 'h']);
  assert.equal(first.language, 'fr-FR');
  // Rien n'est mis en cache sur le disque (tesseract.js écrirait sinon fra.traineddata dans le dossier courant)
  assert.equal(fs.existsSync(path.join(process.cwd(), 'fra.traineddata')), false);
});

test('OCR intégré : readBest lit l\'image et laisse de côté sa version agrandie', async () => {
  const enlarged = encodePng(1260, 780, Buffer.alloc(1260 * 780, 255), { color: 0 }); // ×3, comme celle de l'overlay
  const best = await readBest([enlarged, fixture('eep-cuivre-lithium-tantale-thorium-uranium.png')], { engine: 'tesseract' });
  assert.ok(readChars(best) >= 'CUIVRELITHIUMTANTALETHORIUMURANIUM'.length, JSON.stringify(best.lines));
});

test('OCR intégré : une image illisible ou trop grande est refusée, la lecture suivante fonctionne', async () => {
  await assert.rejects(readImages([Buffer.from('pas une image')], { engine: 'tesseract' }), /OCR impossible/);
  const huge = encodePng(1, 1, Buffer.alloc(1), { color: 0 });
  huge.writeUInt32BE(5000, 16); // en-tête : 5 000 × 5 000 px
  huge.writeUInt32BE(5000, 20);
  await assert.rejects(readImages([huge], { engine: 'tesseract' }), /trop grande/);
  const [ok] = await readImages([fixture('eep-cuivre-lithium-tantale-thorium-uranium.png')], { engine: 'tesseract' });
  assert.ok(ok.lines.some((l) => fold(l.text) === 'LITHIUM'));
});
