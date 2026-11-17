// Tests des calculs de couleur de la page Couleurs du HUD.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoSecondaryHue, BLEU_INVERSE, buildMatrix, closeTints, deltaE, feMatrix, hex, hsvToRgb, IDENTITY, ORANGE, ORANGE_HUE, PALETTE, parseHex,
  PRESETS, presetMatrix, rgbToHsv, sameMatrix, shown, snippet, toLinear, toSrgb, validMatrix,
} from './colour.js';

const near = (a, b, eps = 0.01) => a.every((x, i) => Math.abs(x - b[i]) <= eps);
const BLEU = { red: [0.2, 0.2, 1], green: [0.1, 0.6, 0.1], blue: [1, 0.6, 0] }; // sauvegarde .bleu.bak du joueur

test('sens de la matrice : le préréglage bleu du joueur rend l’orange bleu et le bleu orange', () => {
  const [r, g, b] = shown(BLEU, ORANGE);
  assert.ok(b === 1 && r < 0.3 && g < 0.6);
  assert.deepEqual(shown(BLEU, [0, 0, 1]), [1, 0.6, 0]);
  assert.deepEqual(shown(IDENTITY, ORANGE), ORANGE);
});

test('feColorMatrix : la transposée des lignes du jeu (ligne i = couleur affichée i)', () => {
  assert.equal(feMatrix(BLEU), '0.2 0.1 1 0 0  0.2 0.6 0.6 0 0  1 0.1 0 0 0  0 0 0 1 0');
  assert.equal(feMatrix(IDENTITY), '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0');
});

test('teinte d’origine à 100 % : matrice d’origine', () => {
  assert.deepEqual(buildMatrix({ hue: ORANGE_HUE, sat: 1, val: 1 }), IDENTITY);
  assert.equal(autoSecondaryHue(ORANGE_HUE), 240);
});

test('matrice construite : l’orange devient la couleur choisie, sans nombre négatif, blanc presque gardé', () => {
  for (const hue of [0, 45, 90, 125, 188, 212, 275, 322]) {
    for (const [sat, val] of [[1, 1], [0.8, 1], [0.6, 0.7], [0, 1]]) {
      const m = buildMatrix({ hue, sat, val });
      assert.ok(validMatrix(m));
      assert.ok(Object.values(m).flat().every((x) => x >= 0), `${hue} ${sat} ${val}`);
      assert.ok(near(shown(m, ORANGE), hsvToRgb(hue, sat, val)), `orange → teinte ${hue}`);
      // Blanc : gardé jusqu'à 80 % de saturation ; au-delà, il peut se teinter (pas de nombre négatif)
      if (val === 1) assert.ok(shown(m, [1, 1, 1]).every((c) => c >= (sat <= 0.8 ? 0.89 : 0.45)), `blanc gardé ${hue} ${sat}`);
    }
  }
});

test('bleu des boucliers : teinte secondaire automatique ou choisie', () => {
  const auto = buildMatrix({ hue: 212, sat: 0.8, val: 1 });
  assert.ok(near(shown(auto, [0, 0, 1]), hsvToRgb(autoSecondaryHue(212), 1, 1)));
  const kept = buildMatrix({ hue: 125, sat: 0.8, val: 1, secondary: 240 });
  assert.deepEqual(shown(kept, [0, 0, 1]), [0, 0, 1]);
});

test('préréglages : tous valides, orange d’origine = matrice d’origine, bleu bien bleu', () => {
  for (const p of PRESETS) assert.ok(validMatrix(presetMatrix(p)), p.id);
  assert.ok(sameMatrix(presetMatrix(PRESETS.find((p) => p.id === 'orange')), IDENTITY));
  const [r, g, b] = shown(presetMatrix(PRESETS.find((p) => p.id === 'bleu')), ORANGE);
  assert.ok(b > r && b > g);
});

test('teintes qui se ressemblent : rouge des alertes trop proche d’un HUD rouge, rien à signaler à l’origine', () => {
  assert.equal(deltaE([1, 1, 1], [1, 1, 1]), 0);
  assert.ok(Math.abs(deltaE([1, 1, 1], [0, 0, 0]) - 100) < 0.01); // du noir au blanc : L* de 0 à 100
  assert.deepEqual(closeTints(IDENTITY), []);
  assert.deepEqual(closeTints(BLEU), []);
  const red = closeTints(presetMatrix(PRESETS.find((p) => p.id === 'rouge')));
  assert.deepEqual(red.map((c) => `${c.a}-${c.b}`), ['orange-red']);
  assert.match(red[0].text, /cibles hostiles/);
  // Tout en gris : plus rien ne se distingue
  const grey = { red: [0.33, 0.33, 0.33], green: [0.33, 0.33, 0.33], blue: [0.33, 0.33, 0.33] };
  assert.equal(closeTints(grey).length, 4);
});

test('calcul en lumière linéaire (comme l’éditeur arkku) : même sens, teintes différentes', () => {
  // Sauvegarde .bleu.bak sur l'orange du HUD : bleu soutenu en sRGB, bleu pâle en linéaire (feColorMatrix linearRGB)
  assert.equal(hex(shown(BLEU, ORANGE)), '#3f7cff');
  assert.equal(hex(shown(BLEU, ORANGE, 'linear')), '#8199ff');
  assert.equal(hex(shown(BLEU_INVERSE, ORANGE, 'linear')), '#8199ff');
  for (const c of [0, 0.02, 0.2, 0.478, 0.9, 1]) assert.ok(Math.abs(toSrgb(toLinear(c)) - c) < 1e-9);
  assert.ok(near(shown(IDENTITY, PALETTE[3].rgb, 'linear'), PALETTE[3].rgb, 1e-9)); // matrice d'origine : rien ne change
  assert.deepEqual(shown(BLEU, [0, 0, 1], 'linear').map((x) => Number(x.toFixed(3))), [1, Number(toSrgb(0.6).toFixed(3)), 0]);
});

test('matrice construite en linéaire : l’orange devient la couleur choisie dans ce calcul', () => {
  assert.deepEqual(buildMatrix({ hue: ORANGE_HUE, sat: 1, val: 1 }, 'linear'), IDENTITY);
  for (const hue of [0, 90, 212, 275]) {
    for (const [sat, val] of [[1, 1], [0.8, 1], [0.6, 0.7], [0, 1]]) {
      const m = buildMatrix({ hue, sat, val }, 'linear');
      assert.ok(validMatrix(m) && Object.values(m).flat().every((x) => x >= 0), `${hue} ${sat} ${val}`);
      assert.ok(near(shown(m, ORANGE, 'linear'), hsvToRgb(hue, sat, val)), `linéaire : orange → teinte ${hue}`);
      // En lumière linéaire, la même saturation pèse plus : blanc gardé jusqu'à 60 % environ
      if (val === 1 && sat <= 0.6) assert.ok(shown(m, [1, 1, 1], 'linear').every((c) => c >= 0.89), `blanc gardé ${hue} ${sat}`);
    }
  }
  // Même couleur voulue, matrices différentes selon le calcul
  const p = { hue: 212, sat: 0.8, val: 1 };
  assert.ok(!sameMatrix(buildMatrix(p), buildMatrix(p, 'linear')));
  for (const pr of PRESETS) assert.ok(validMatrix(presetMatrix(pr, 'linear')), pr.id);
  assert.deepEqual(closeTints(IDENTITY, 'linear'), []);
});

test('conversions et bloc XML', () => {
  assert.equal(hex(ORANGE), '#ff7a00');
  assert.ok(near(parseHex('#FF7A00'), ORANGE, 0.003));
  assert.equal(parseHex('rouge'), null);
  const hsv = rgbToHsv(hsvToRgb(275, 0.7, 0.9));
  assert.ok(Math.abs(hsv.hue - 275) < 1e-9 && Math.abs(hsv.sat - 0.7) < 1e-9 && Math.abs(hsv.val - 0.9) < 1e-9);
  assert.match(snippet(BLEU), /<MatrixRed>0\.2, 0\.2, 1<\/MatrixRed>\n {4}<MatrixGreen>0\.1, 0\.6, 0\.1<\/MatrixGreen>/);
  assert.ok(!validMatrix({ ...BLEU, red: [4, 0, 0] }));
  assert.ok(!validMatrix({ ...BLEU, red: [NaN, 0, 0] }));
});
