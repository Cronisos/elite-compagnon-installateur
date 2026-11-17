// Encodeur GIF (gif.js) : relu par un petit décodeur, image par image.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { encoderGif, lzw, palette } = require('./gif.js');

/** Décodeur LZW du GIF (pour les tests). */
function delzw(octets, tailleMin) {
  const clear = 1 << tailleMin;
  const fin = clear + 1;
  let taille = tailleMin + 1;
  let table = [];
  const reset = () => {
    table = [];
    for (let i = 0; i < clear; i++) table[i] = [i];
    table[clear] = [];
    table[fin] = [];
    taille = tailleMin + 1;
  };
  reset();
  const out = [];
  let acc = 0;
  let nbits = 0;
  let pos = 0;
  let avant = null;
  for (;;) {
    while (nbits < taille && pos < octets.length) {
      acc |= octets[pos++] << nbits;
      nbits += 8;
    }
    if (nbits < taille) break;
    const code = acc & ((1 << taille) - 1);
    acc >>>= taille;
    nbits -= taille;
    if (code === clear) {
      reset();
      avant = null;
      continue;
    }
    if (code === fin) break;
    let entree;
    if (code < table.length) entree = table[code];
    else if (code === table.length && avant) entree = [...avant, avant[0]];
    else throw new Error(`code LZW impossible : ${code}`);
    out.push(...entree);
    if (avant) {
      table.push([...avant, entree[0]]);
      if (table.length === 1 << taille && taille < 12) taille++;
    }
    avant = entree;
  }
  return out;
}

/** Lit un GIF : palette, boucle, et chaque image composée (indices), avec sa durée. */
function lireGif(buf) {
  assert.equal(buf.subarray(0, 6).toString('ascii'), 'GIF89a');
  const l = buf.readUInt16LE(6);
  const h = buf.readUInt16LE(8);
  const flags = buf[10];
  let p = 13;
  const nCouleurs = 2 << (flags & 7);
  const couleurs = [];
  for (let i = 0; i < nCouleurs; i++) couleurs.push([buf[p + 3 * i], buf[p + 3 * i + 1], buf[p + 3 * i + 2]]);
  p += 3 * nCouleurs;
  const ecran = new Array(l * h).fill(0);
  const images = [];
  let boucle = false;
  let delai = 0;
  const blocs = () => {
    const d = [];
    while (buf[p] !== 0) {
      const n = buf[p++];
      d.push(...buf.subarray(p, p + n));
      p += n;
    }
    p++;
    return d;
  };
  for (;;) {
    const t = buf[p++];
    if (t === 0x3b) break;
    if (t === 0x21) {
      const label = buf[p++];
      const d = blocs();
      if (label === 0xff && Buffer.from(d.slice(0, 11)).toString('ascii') === 'NETSCAPE2.0') boucle = true;
      if (label === 0xf9) {
        assert.equal((d[0] >> 2) & 7, 1, 'disposition : laisser en place');
        delai = d[1] | (d[2] << 8);
      }
    } else if (t === 0x2c) {
      const x = buf.readUInt16LE(p);
      const y = buf.readUInt16LE(p + 2);
      const il = buf.readUInt16LE(p + 4);
      const ih = buf.readUInt16LE(p + 6);
      p += 9;
      const tailleMin = buf[p++];
      const idx = delzw(blocs(), tailleMin);
      assert.equal(idx.length, il * ih, 'nombre de pixels de l’image');
      for (let j = 0; j < ih; j++) for (let i = 0; i < il; i++) ecran[(y + j) * l + x + i] = idx[j * il + i];
      images.push({ indices: [...ecran], delai, rect: { x, y, l: il, h: ih } });
    } else throw new Error(`bloc inconnu ${t}`);
  }
  return { l, h, couleurs, images, boucle };
}

/** Image RGBA unie, avec un carré d'une autre couleur à (cx, cy). */
function image(l, h, fond, carre, cx, cy, cote = 3) {
  const px = Buffer.alloc(l * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const c = carre && x >= cx && x < cx + cote && y >= cy && y < cy + cote ? carre : fond;
      px.set([...c, 255], (y * l + x) * 4);
    }
  }
  return px;
}

test('gif : LZW relu à l’identique, longues suites et table pleine (remise à zéro) comprises', () => {
  const suites = [
    [],
    [5],
    Array.from({ length: 5000 }, (_, i) => i % 7),
    Array.from({ length: 60000 }, (_, i) => (i * 7919 + (i >> 5)) % 256), // assez varié pour remplir la table
  ];
  for (const s of suites) {
    const blocs = lzw(Uint8Array.from(s), 8);
    const octets = [];
    for (let p = 0; blocs[p] !== 0; p += blocs[p] + 1) {
      assert.ok(blocs[p] <= 255);
      octets.push(...blocs.slice(p + 1, p + 1 + blocs[p]));
    }
    assert.deepEqual(delzw(octets, 8), s);
  }
});

test('gif : palette commune, première image entière, puis le seul rectangle changé ; boucle infinie', () => {
  const l = 40;
  const h = 20;
  const fond = [10, 12, 30];
  const vaisseau = [255, 138, 31];
  const images = [image(l, h, fond, vaisseau, 2, 4), image(l, h, fond, vaisseau, 5, 4), image(l, h, fond, vaisseau, 5, 4), image(l, h, fond, vaisseau, 9, 6)];
  const gif = lireGif(encoderGif({ largeur: l, hauteur: h, images, delai: 5 }));
  assert.equal(gif.l, l);
  assert.equal(gif.h, h);
  assert.ok(gif.boucle);
  assert.equal(gif.couleurs.length, 256);
  // Image identique : fusionnée avec la précédente, qui dure deux fois plus
  assert.deepEqual(gif.images.map((i) => i.delai), [5, 10, 5]);
  assert.deepEqual(gif.images[0].rect, { x: 0, y: 0, l, h });
  assert.deepEqual(gif.images[1].rect, { x: 2, y: 4, l: 6, h: 3 }, 'seulement là où le carré a bougé');
  // Chaque image composée redonne les bonnes couleurs
  const attendues = [images[0], images[1], images[3]];
  gif.images.forEach((im, k) => {
    for (let p = 0; p < l * h; p++) {
      const c = gif.couleurs[im.indices[p]];
      assert.deepEqual(c, [...attendues[k].subarray(p * 4, p * 4 + 3)], `image ${k}, pixel ${p}`);
    }
  });
});

test('gif : BGRA (capture d’écran Windows) lu dans le bon ordre ; tailles refusées', () => {
  const rgba = image(4, 2, [200, 40, 10]);
  const bgra = Buffer.from(rgba);
  for (let i = 0; i < bgra.length; i += 4) [bgra[i], bgra[i + 2]] = [bgra[i + 2], bgra[i]];
  const gif = lireGif(encoderGif({ largeur: 4, hauteur: 2, images: [bgra], ordre: 'bgra' }));
  assert.deepEqual(gif.couleurs[gif.images[0].indices[0]], [200, 40, 10]);
  assert.throws(() => encoderGif({ largeur: 4, hauteur: 2, images: [Buffer.alloc(8)] }), /mauvaise taille/);
  assert.throws(() => encoderGif({ largeur: 0, hauteur: 2, images: [Buffer.alloc(0)] }), /Taille/);
  assert.throws(() => encoderGif({ largeur: 4, hauteur: 2, images: [] }), /Aucune image/);
});

test('gif : un dégradé garde toutes ses teintes au pas de l’histogramme (6 bits), sans couleur absente de l’image', () => {
  const l = 256;
  const px = Buffer.alloc(l * 4);
  for (let x = 0; x < l; x++) px.set([x, Math.round(x / 2), 255 - x, 255], x * 4);
  const couleurs = palette([px]);
  // 64 niveaux de rouge et de bleu, 32 de vert sur ce dégradé : 96 cases distinctes, toutes gardées
  assert.equal(couleurs.length, 96);
  for (const [r, g, b] of couleurs) assert.ok(Math.abs(g - r / 2) < 6 && Math.abs(b - (255 - r)) < 6, 'couleur sur le dégradé');
});
