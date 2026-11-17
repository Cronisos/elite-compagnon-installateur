// Fabrique de PNG pour les tests de l'OCR (images synthétiques, sans bibliothèque).

import zlib from 'node:zlib';

const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  return out; // CRC laissé à zéro : le décodeur ne le vérifie pas
}

/** Filtre PNG d'une ligne (0 aucun, 1 Sub, 2 Up, 3 Average, 4 Paeth). */
function filterRow(type, row, prev, bpp) {
  const out = Buffer.alloc(row.length);
  for (let i = 0; i < row.length; i++) {
    const a = i >= bpp ? row[i - bpp] : 0;
    const b = prev ? prev[i] : 0;
    const c = i >= bpp && prev ? prev[i - bpp] : 0;
    let pred = 0;
    if (type === 1) pred = a;
    else if (type === 2) pred = b;
    else if (type === 3) pred = (a + b) >> 1;
    else if (type === 4) {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    out[i] = (row[i] - pred) & 255;
  }
  return out;
}

/**
 * PNG 8 bits non entrelacé.
 * @param pixels octets bruts (width × height × canaux), color : 0 gris, 2 RVB, 4 gris + alpha, 6 RVBA
 * @param filters type de filtre par ligne (tableau parcouru en boucle)
 */
export function encodePng(width, height, pixels, { color = 2, filters = [0], interlace = 0 } = {}) {
  const bpp = CHANNELS[color];
  const stride = width * bpp;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.from(pixels.subarray(y * stride, (y + 1) * stride));
    const prev = y ? Buffer.from(pixels.subarray((y - 1) * stride, y * stride)) : null;
    const type = filters[y % filters.length];
    rows.push(Buffer.from([type]), filterRow(type, row, prev, bpp));
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = color;
  header[12] = interlace;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Image de « texte » synthétique en niveaux de gris : fond sombre, traits clairs en forme de lettres, alignés sur
 * des lignes de pente `slope` (y = y0 + slope·x), comme le panneau du jeu vu de biais.
 * @param regions [{ x0, x1, slope, lines }] : zones de lignes, chacune avec sa pente
 */
export function syntheticText(width, height, regions) {
  const gray = new Uint8Array(width * height).fill(25);
  const dot = (x, y) => {
    if (x >= 0 && x < width && y >= 0 && y < height) gray[y * width + x] = 230;
  };
  for (const { x0, x1, slope, lines } of regions) {
    lines.forEach((top) => {
      // une « lettre » tous les 14 px : deux jambes et une barre, 12 px de haut, traits de 2 px
      for (let x = x0; x + 10 < x1; x += 14) {
        const y = Math.round(top + slope * (x - x0));
        for (let j = 0; j < 12; j++) for (let t = 0; t < 2; t++) {
          dot(x + t, y + j);
          dot(x + 8 + t, y + j);
        }
        for (let i = 0; i < 10; i++) for (let t = 0; t < 2; t++) dot(x + i, y + Math.round(slope * i) + t);
      }
    });
  }
  return gray;
}
