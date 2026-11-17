// Préparation des captures pour le lecteur de texte intégré (ocr.js), sans bibliothèque d'image :
// PNG → niveaux de gris → pente des lignes de texte → image redressée, agrandie, texte sombre sur fond clair.
// Le panneau de cible du jeu est vu de biais : les verticales restent droites mais les lignes descendent vers la
// droite (cisaillement). Tesseract lit mal ces lignes penchées et serrées (« CU, » « VRE », « TA »…) : on les
// remet à l'horizontale avant de lire, en essayant les quelques pentes présentes dans l'image.

import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }; // gris, RVB, palette, gris + alpha, RVBA
export const MAX_PIXELS = 12e6; // au-delà (plus grand qu'un écran 4K entier), l'image est refusée

/** Largeur et hauteur d'un PNG d'après son en-tête, ou null si ce n'est pas un PNG. */
export function pngSize(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24 || !buf.subarray(0, 8).equals(SIGNATURE)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Prédicteur « Paeth » des lignes filtrées du PNG. */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Décode un PNG (8 ou 16 bits, non entrelacé) en niveaux de gris : pour chaque pixel, sa composante la plus
 * forte (le texte du HUD est coloré, orange par défaut : c'est sa composante forte qui le détache du fond).
 * @returns { width, height, gray: Uint8Array } ou null si le format n'est pas pris en charge
 */
export function decodePng(buf) {
  const size = pngSize(buf);
  if (!size) return null;
  let pos = 8;
  let header = null;
  let palette = null;
  const parts = [];
  while (pos + 8 <= buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;
    if (type === 'IHDR') header = { depth: data[8], color: data[9], interlace: data[12] };
    else if (type === 'PLTE') palette = data;
    else if (type === 'IDAT') parts.push(data);
    else if (type === 'IEND') break;
  }
  const { width, height } = size;
  if (!header || header.interlace !== 0 || ![8, 16].includes(header.depth) || !CHANNELS[header.color]) return null;
  if (header.color === 3 && (header.depth !== 8 || !palette)) return null;
  if (!width || !height || width * height > MAX_PIXELS) return null;
  const sample = header.depth / 8;
  const bpp = CHANNELS[header.color] * sample; // octets par pixel
  const stride = width * bpp;
  let raw;
  try {
    // Taille attendue connue : pas plus (une « bombe » compressée s'arrête là)
    raw = zlib.inflateSync(Buffer.concat(parts), { maxOutputLength: (stride + 1) * height });
  } catch {
    return null;
  }
  if (raw.length < (stride + 1) * height) return null;
  // Défiltrage ligne par ligne (Sub, Up, Average, Paeth)
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const out = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[out + x - bpp] : 0;
      const b = y > 0 ? px[out - stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[out - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      px[out + x] = v & 255;
    }
  }
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * bpp;
    if (header.color === 3) {
      const p = px[o] * 3;
      gray[i] = Math.max(palette[p] ?? 0, palette[p + 1] ?? 0, palette[p + 2] ?? 0);
    } else if (header.color === 0 || header.color === 4) gray[i] = px[o];
    else gray[i] = Math.max(px[o], px[o + sample], px[o + 2 * sample]); // 16 bits : octet de poids fort
  }
  return { width, height, gray };
}

/** Fond sombre (texte clair) : vrai pour les captures du jeu, faux pour une version déjà inversée. */
const darkBackground = (gray) => gray.reduce((n, v) => n + v, 0) / gray.length < 128;

/**
 * Pixels des traits fins du texte : nettement plus clairs que leur voisinage (plus sombres si le fond est clair).
 * Les grandes surfaces claires (cockpit, ciel) et les dégradés ne comptent pas.
 * @returns [x0, y0, x1, y1, …]
 */
export function strokePoints({ width: w, height: h, gray }, { radius = 6, contrast = 40 } = {}) {
  const sign = darkBackground(gray) ? 1 : -1;
  const W = w + 1;
  const sum = new Float64Array(W * (h + 1)); // image intégrale : moyenne d'un carré en 4 lectures
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + row;
    }
  }
  const points = [];
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w, x + radius + 1);
      const mean = (sum[y1 * W + x1] - sum[y0 * W + x1] - sum[y1 * W + x0] + sum[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
      if (sign * (gray[y * w + x] - mean) > contrast) points.push(x, y);
    }
  }
  return points;
}

/**
 * Netteté des lignes de texte pour chaque pente k (y' = y − k·x) de −max à +max : somme des carrés du profil
 * horizontal. Des lignes bien redressées tombent chacune sur peu de rangées, d'où un score élevé.
 */
export function shearProfile(points, width, height, { max = 0.4, step = 0.01 } = {}) {
  const offset = Math.ceil(max * width) + 1;
  const rows = new Float64Array(height + 2 * offset + 2);
  const steps = Math.round(max / step);
  const profile = [];
  for (let i = -steps; i <= steps; i++) {
    const k = i * step;
    rows.fill(0);
    for (let j = 0; j < points.length; j += 2) rows[Math.round(points[j + 1] - k * points[j]) + offset]++;
    let score = 0;
    for (const r of rows) score += r * r;
    profile.push({ k: Math.round(k * 1000) / 1000, score });
  }
  return profile;
}

/** Sommets du profil, du plus net au moins net, écartés d'au moins `gap`, avec leur gain sur la pente nulle. */
export function profilePeaks(profile, { count = 2, gap = 0.06 } = {}) {
  const flat = profile.find((p) => p.k === 0)?.score || 1;
  const local = profile.filter((p, i) => (i === 0 || p.score >= profile[i - 1].score)
    && (i === profile.length - 1 || p.score >= profile[i + 1].score));
  local.sort((a, b) => b.score - a.score);
  const peaks = [];
  for (const p of local) {
    if (peaks.every((o) => Math.abs(o.k - p.k) >= gap)) peaks.push({ k: p.k, gain: p.score / flat });
    if (peaks.length >= count) break;
  }
  return peaks;
}

/**
 * Pentes à essayer (3 au plus) : la plus nette de l'image, celle de chaque bande verticale d'une image large
 * (le panneau du jeu à droite, une liste droite à gauche…), puis la deuxième de l'image.
 * Une pente non nulle n'est gardée que si elle rend les lignes nettement plus nettes (gain ≥ 1,1).
 */
export function shearCandidates(img, points, { count = 3, minGain = 1.1 } = {}) {
  const { width: w, height: h } = img;
  const list = [];
  const add = (p) => {
    if (!p || (p.k !== 0 && p.gain < minGain) || list.some((c) => Math.abs(c - p.k) < 0.04)) return;
    list.push(p.k);
  };
  const [first, second] = profilePeaks(shearProfile(points, w, h), { count: 2 });
  add(first);
  if (w > 1.6 * h) {
    const strips = Math.min(4, Math.round(w / h));
    for (let i = 0; i < strips; i++) {
      const xa = Math.floor((i * w) / strips);
      const xb = Math.floor(((i + 1) * w) / strips);
      const sub = [];
      for (let j = 0; j < points.length; j += 2) if (points[j] >= xa && points[j] < xb) sub.push(points[j] - xa, points[j + 1]);
      if (sub.length >= 400) add(profilePeaks(shearProfile(sub, xb - xa, h), { count: 1 })[0]);
    }
  }
  add(second);
  if (!list.length) list.push(0);
  return list.slice(0, count);
}

/** Agrandissement : ×2, sans dépasser 2 600 px de côté (au-delà, la lecture ralentit sans rien gagner). */
export const ocrScale = ({ width, height }) => Math.round(Math.min(2, Math.max(1, 2600 / Math.max(width, height))) * 100) / 100;

/**
 * Image prête à lire : redressée de la pente k, agrandie (interpolation bilinéaire), texte sombre sur fond clair,
 * au format PGM (niveaux de gris, que Tesseract lit directement).
 * @returns { image: Buffer, view: { scale, k, top } } ; `view` sert à ramener les positions lues dans l'image d'origine
 */
export function renderForOcr(img, { k = 0, scale = ocrScale(img) } = {}) {
  const { width, height, gray } = img;
  const invert = darkBackground(gray);
  const extra = Math.abs(k) * width; // hauteur gagnée en redressant
  const top = k > 0 ? extra : 0;
  const W = Math.round(width * scale);
  const H = Math.round((height + extra) * scale);
  const out = Buffer.alloc(W * H, 255); // hors de l'image : fond blanc
  // Ce qui ne dépend que de la colonne est calculé une fois : colonne d'origine, poids, décalage du redressement
  const cx0 = new Int32Array(W);
  const cx1 = new Int32Array(W);
  const cdx = new Float32Array(W);
  const shift = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const sx = Math.min(width - 1, Math.max(0, (x + 0.5) / scale - 0.5));
    cx0[x] = Math.floor(sx);
    cx1[x] = Math.min(width - 1, cx0[x] + 1);
    cdx[x] = sx - cx0[x];
    shift[x] = k * sx - top;
  }
  for (let y = 0; y < H; y++) {
    const base = (y + 0.5) / scale - 0.5;
    for (let x = 0; x < W; x++) {
      let sy = base + shift[x]; // rangée redressée → rangée d'origine
      if (sy < -0.5 || sy > height - 0.5) continue; // hors de l'image
      sy = sy < 0 ? 0 : sy > height - 1 ? height - 1 : sy; // demi-pixel du bord
      const y0 = sy | 0;
      const r0 = y0 * width;
      const r1 = (y0 + 1 < height ? y0 + 1 : y0) * width;
      const dx = cdx[x];
      const dy = sy - y0;
      const a = gray[r0 + cx0[x]] + (gray[r0 + cx1[x]] - gray[r0 + cx0[x]]) * dx;
      const b = gray[r1 + cx0[x]] + (gray[r1 + cx1[x]] - gray[r1 + cx0[x]]) * dx;
      const v = a + (b - a) * dy;
      out[y * W + x] = invert ? 255.5 - v : v + 0.5; // arrondi (Buffer tronque)
    }
  }
  return { image: Buffer.concat([Buffer.from(`P5\n${W} ${H}\n255\n`, 'latin1'), out]), view: { scale, k, top } };
}

const alnum = (s) => s.replace(/[^\p{L}\p{N}]/gu, '').length;

/**
 * Lignes lues par Tesseract (data.blocks), ramenées dans l'image d'origine. Les mots peu sûrs sont écartés
 * (confiance < 60, < 85 pour les mots de 3 signes ou moins, où Tesseract invente le plus), ainsi que la
 * ponctuation seule (« | », « = », « — »).
 * @returns [{ text, x, y, w, h, k, quality }] ; quality : signes lus pondérés par la confiance
 */
export function linesFromBlocks(blocks, view, { minConfidence = 60, minShortConfidence = 85 } = {}) {
  const { scale, k, top } = view;
  const lines = [];
  for (const block of blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        const words = (line.words || []).filter((wd) => {
          const n = alnum(wd.text || '');
          return n > 0 && wd.confidence >= (n <= 3 ? minShortConfidence : minConfidence);
        });
        if (!words.length) continue;
        const x0 = Math.min(...words.map((wd) => wd.bbox.x0)) / scale;
        const x1 = Math.max(...words.map((wd) => wd.bbox.x1)) / scale;
        const y0 = Math.min(...words.map((wd) => wd.bbox.y0)) / scale;
        const y1 = Math.max(...words.map((wd) => wd.bbox.y1)) / scale;
        lines.push({
          text: words.map((wd) => wd.text.trim()).join(' '),
          x: Math.round(x0),
          y: Math.round(y0 + k * x0 - top), // coin haut gauche, dans l'image d'origine
          w: Math.round(x1 - x0),
          h: Math.round(y1 - y0),
          k,
          quality: words.reduce((n, wd) => n + alnum(wd.text) * (wd.confidence / 100), 0),
        });
      }
    }
  }
  return lines;
}

/** Part de la plus petite des deux lignes (bandes penchées de pente k) que recouvre l'autre. */
function overlap(a, b) {
  const xa = Math.max(a.x, b.x);
  const xb = Math.min(a.x + a.w, b.x + b.w);
  if (xb <= xa) return 0;
  let common = 0;
  const n = 8;
  for (let i = 0; i < n; i++) {
    const x = xa + ((i + 0.5) * (xb - xa)) / n;
    const ay = a.y + a.k * (x - a.x);
    const by = b.y + b.k * (x - b.x);
    common += Math.max(0, Math.min(ay + a.h, by + b.h) - Math.max(ay, by));
  }
  common *= (xb - xa) / n;
  return common / Math.max(1, Math.min(a.w * a.h, b.w * b.h));
}

/**
 * Réunit les lectures faites à plusieurs pentes : la meilleure ligne de chaque endroit de l'image l'emporte
 * (« CUIVRE » lu redressé chasse « CU, » et « VRE » lus de travers), les endroits lus d'une seule façon restent.
 * @returns lignes [{ text, x, y, w, h }] de haut en bas
 */
export function mergeReadings(readings) {
  const all = readings.flat().sort((a, b) => b.quality - a.quality);
  const kept = [];
  for (const line of all) if (kept.every((o) => overlap(line, o) < 0.3)) kept.push(line);
  return kept
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(({ text, x, y, w, h }) => ({ text, x, y, w, h }));
}
