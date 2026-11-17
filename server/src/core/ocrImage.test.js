import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodePng, linesFromBlocks, mergeReadings, pngSize, renderForOcr, shearCandidates, strokePoints,
} from './ocrImage.js';
import { encodePng, syntheticText } from './fixtures/ocr/png.js';

/** Pixels RVB pseudo-aléatoires mais reproductibles. */
function rgb(width, height) {
  const px = Buffer.alloc(width * height * 3);
  for (let i = 0; i < px.length; i++) px[i] = (i * 37 + (i >> 3) * 11) & 255;
  return px;
}

test('PNG : chaque filtre de ligne est défait, le gris est la composante la plus forte', () => {
  const px = rgb(7, 5);
  for (const filters of [[0], [1], [2], [3], [4], [0, 1, 2, 3, 4]]) {
    const img = decodePng(encodePng(7, 5, px, { filters }));
    assert.equal(img.width, 7);
    assert.equal(img.height, 5);
    for (let i = 0; i < 35; i++) assert.equal(img.gray[i], Math.max(px[i * 3], px[i * 3 + 1], px[i * 3 + 2]), `filtres ${filters}, pixel ${i}`);
  }
  // RVBA et gris : l'alpha est ignoré
  const rgba = Buffer.from([10, 200, 30, 0, 255, 0, 0, 128]);
  assert.deepEqual([...decodePng(encodePng(2, 1, rgba, { color: 6 })).gray], [200, 255]);
  assert.deepEqual([...decodePng(encodePng(3, 1, Buffer.from([1, 2, 3]), { color: 0 })).gray], [1, 2, 3]);
});

test('PNG : ce qui n\'est pas pris en charge donne null, sans exception', () => {
  assert.equal(decodePng(Buffer.from('pas une image')), null);
  assert.equal(decodePng(null), null);
  assert.equal(decodePng(encodePng(4, 4, rgb(4, 4), { interlace: 1 })), null); // entrelacé
  const png = encodePng(4, 4, rgb(4, 4));
  assert.equal(decodePng(png.subarray(0, png.length - 30)), null); // tronqué
  assert.deepEqual(pngSize(png), { width: 4, height: 4 });
  assert.equal(pngSize(Buffer.alloc(30)), null);
});

test('pente : les lignes penchées du panneau sont retrouvées (y = y0 + 0,2·x)', () => {
  const width = 300;
  const height = 200;
  const img = { width, height, gray: syntheticText(width, height, [{ x0: 10, x1: 290, slope: 0.2, lines: [20, 45, 70, 95, 120] }]) };
  const [k] = shearCandidates(img, strokePoints(img));
  assert.ok(Math.abs(k - 0.2) <= 0.02, `pente trouvée : ${k}`);
});

test('pente : une image large garde la pente de chaque zone (liste droite à gauche, panneau penché à droite)', () => {
  const width = 900;
  const height = 240;
  const gray = syntheticText(width, height, [
    { x0: 10, x1: 420, slope: 0, lines: [20, 60, 100, 140, 180] },
    { x0: 560, x1: 880, slope: 0.18, lines: [30, 55, 80, 105, 130] },
  ]);
  const img = { width, height, gray };
  const ks = shearCandidates(img, strokePoints(img));
  assert.ok(ks.length <= 3);
  assert.ok(ks.some((k) => Math.abs(k) <= 0.02), `pentes : ${ks}`);
  assert.ok(ks.some((k) => Math.abs(k - 0.18) <= 0.02), `pentes : ${ks}`);
});

test('pente : sans texte, l\'image est lue telle quelle', () => {
  const img = { width: 50, height: 40, gray: new Uint8Array(2000).fill(30) };
  assert.deepEqual(shearCandidates(img, strokePoints(img)), [0]);
});

test('rendu : agrandi, redressé, texte sombre sur fond clair, en PGM', () => {
  const gray = new Uint8Array(4 * 4).fill(20);
  for (const i of [5, 6, 9, 10]) gray[i] = 240; // un carré clair de 2 × 2 au milieu
  const flat = renderForOcr({ width: 4, height: 4, gray }, { k: 0, scale: 2 });
  const head = 'P5\n8 8\n255\n';
  assert.equal(flat.image.toString('latin1', 0, head.length), head);
  const px = flat.image.subarray(head.length);
  assert.equal(px.length, 64);
  assert.equal(px[0], 235); // fond sombre → clair, bords compris
  assert.equal(px[3 * 8 + 3], 15); // le carré clair devient sombre
  assert.deepEqual(flat.view, { scale: 2, k: 0, top: 0 });
  // redressement : la hauteur gagne |k|·largeur, le haut est décalé pour k > 0
  const tilted = renderForOcr({ width: 10, height: 10, gray: new Uint8Array(100).fill(20) }, { k: 0.3, scale: 1 });
  assert.equal(tilted.image.toString('latin1', 0, 11), 'P5\n10 13\n25');
  assert.deepEqual(tilted.view, { scale: 1, k: 0.3, top: 3 });
  // déjà clair (version inversée de l'overlay) : pas d'inversion
  const light = renderForOcr({ width: 2, height: 2, gray: new Uint8Array(4).fill(220) }, { scale: 1 });
  assert.equal(light.image[light.image.length - 1], 220);
});

const word = (text, confidence, x0, y0, x1, y1) => ({ text, confidence, bbox: { x0, y0, x1, y1 } });
const blocks = (...lines) => [{ paragraphs: [{ lines: lines.map((words) => ({ words })) }] }];

test('lignes lues : mots peu sûrs, mots courts douteux et ponctuation seule écartés', () => {
  const read = linesFromBlocks(blocks(
    [word('CUIVRE', 88, 10, 10, 70, 30)],
    [word('QUE', 63, 10, 40, 40, 60)], // court et douteux
    [word('OR', 95, 10, 70, 30, 90)], // court mais sûr
    [word('LITHIUM', 40, 10, 100, 80, 120)], // peu sûr
    [word('|', 93, 5, 5, 6, 90), word('=', 90, 100, 10, 110, 20)],
    [word('SYNUEFE', 91, 10, 130, 90, 150), word('ou-E', 30, 95, 130, 130, 150)],
  ), { scale: 1, k: 0, top: 0 });
  assert.deepEqual(read.map((l) => l.text), ['CUIVRE', 'OR', 'SYNUEFE']);
  assert.deepEqual(read[2], { text: 'SYNUEFE', x: 10, y: 130, w: 80, h: 20, k: 0, quality: 7 * 0.91 });
});

test('lignes lues : positions ramenées dans l\'image d\'origine (agrandissement et redressement défaits)', () => {
  const [line] = linesFromBlocks(blocks([word('IRIDIUM', 90, 40, 100, 240, 140)]), { scale: 2, k: 0.25, top: 50 });
  // x = 40/2 = 20 ; y redressé = 100/2 = 50 → y d'origine = 50 + 0,25·20 − 50 = 5
  assert.deepEqual({ x: line.x, y: line.y, w: line.w, h: line.h }, { x: 20, y: 5, w: 100, h: 20 });
});

test('fusion : la meilleure lecture de chaque endroit l\'emporte, le reste s\'ajoute, de haut en bas', () => {
  const line = (text, x, y, w, h, k, quality) => ({ text, x, y, w, h, k, quality });
  const straight = [line('CU,', 100, 50, 30, 20, 0, 2.2), line('VRE', 135, 55, 30, 20, 0, 2.7), line('RE (25)', 0, 10, 60, 20, 0, 5.5)];
  const tilted = [line('CUIVRE', 100, 50, 70, 20, 0.2, 5.4), line('LITHIUM', 100, 74, 80, 20, 0.2, 6.6)];
  assert.deepEqual(mergeReadings([straight, tilted]), [
    { text: 'RE (25)', x: 0, y: 10, w: 60, h: 20 },
    { text: 'CUIVRE', x: 100, y: 50, w: 70, h: 20 },
    { text: 'LITHIUM', x: 100, y: 74, w: 80, h: 20 },
  ]);
  assert.deepEqual(mergeReadings([]), []);
});
