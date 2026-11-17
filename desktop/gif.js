// Encodeur GIF animé, sans dépendance : pour copier le rapport de la semaine (vaisseau animé compris) et le coller dans
// Discord, qui n'anime que les fichiers GIF.
//
// - Une palette commune à toutes les images (coupe médiane sur un histogramme 6 bits par canal) : les couleurs ne
//   sautent pas d'une image à l'autre.
// - La première image est entière ; les suivantes ne gardent que le rectangle qui a changé (le vaisseau et ses
//   flammes), posé sur la précédente : le fichier reste petit. Une image identique allonge la durée de la précédente.
// - Boucle infinie (extension NETSCAPE2.0).

const BITS = 6; // bits par canal de l'histogramme (262 144 cases) : 5 bits faisaient des paliers dans les nébuleuses
const CASES = 1 << (3 * BITS);
const MASQUE = (1 << BITS) - 1;
const caseDe = (r, g, b) => ((r >> (8 - BITS)) << (2 * BITS)) | ((g >> (8 - BITS)) << BITS) | (b >> (8 - BITS));

/** Composantes (r, g, b) du pixel i d'une image RGBA ou BGRA. */
function lecteur(ordre) {
  return ordre === 'bgra'
    ? (px, i) => [px[i + 2], px[i + 1], px[i]]
    : (px, i) => [px[i], px[i + 1], px[i + 2]];
}

/**
 * Palette d'au plus `max` couleurs pour toutes les images (coupe médiane pondérée).
 * @returns {number[][]} couleurs [r, g, b]
 */
function palette(images, { ordre = 'rgba', max = 256, pas = 1 } = {}) {
  const lire = lecteur(ordre);
  const compte = new Uint32Array(CASES);
  const somme = new Float64Array(CASES * 3);
  for (const px of images) {
    for (let i = 0; i < px.length; i += 4 * pas) {
      const [r, g, b] = lire(px, i);
      const c = caseDe(r, g, b);
      compte[c]++;
      somme[c * 3] += r;
      somme[c * 3 + 1] += g;
      somme[c * 3 + 2] += b;
    }
  }
  const cases = [];
  for (let c = 0; c < CASES; c++) if (compte[c]) cases.push(c);
  const comp = (c, k) => (c >> ((2 - k) * BITS)) & MASQUE; // k : 0 rouge, 1 vert, 2 bleu
  const boite = (liste) => {
    const lo = [MASQUE, MASQUE, MASQUE];
    const hi = [0, 0, 0];
    let poids = 0;
    for (const c of liste) {
      for (let k = 0; k < 3; k++) {
        const v = comp(c, k);
        if (v < lo[k]) lo[k] = v;
        if (v > hi[k]) hi[k] = v;
      }
      poids += compte[c];
    }
    return { liste, lo, hi, poids };
  };
  const boites = cases.length ? [boite(cases)] : [];
  while (boites.length < max) {
    // La boîte à couper : la plus étendue, pondérée par son nombre de pixels
    let meilleure = -1;
    let score = 0;
    boites.forEach((b, i) => {
      if (b.liste.length < 2) return;
      const s = Math.max(b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]) * Math.sqrt(b.poids);
      if (s > score) {
        score = s;
        meilleure = i;
      }
    });
    if (meilleure < 0) break;
    const b = boites[meilleure];
    const etendue = [0, 1, 2].map((k) => b.hi[k] - b.lo[k]);
    const k = etendue.indexOf(Math.max(...etendue));
    const triee = [...b.liste].sort((x, y) => comp(x, k) - comp(y, k));
    let cumul = 0;
    let coupe = 1;
    for (let i = 0; i < triee.length - 1; i++) {
      cumul += compte[triee[i]];
      coupe = i + 1;
      if (cumul >= b.poids / 2) break;
    }
    boites.splice(meilleure, 1, boite(triee.slice(0, coupe)), boite(triee.slice(coupe)));
  }
  return boites.map((b) => {
    let n = 0;
    const s = [0, 0, 0];
    for (const c of b.liste) {
      n += compte[c];
      for (let k = 0; k < 3; k++) s[k] += somme[c * 3 + k];
    }
    return s.map((v) => Math.round(v / n));
  });
}

/** Indice de la couleur la plus proche, mis en cache par case de l'histogramme. */
function indexeur(couleurs) {
  const cache = new Int16Array(CASES).fill(-1);
  return (r, g, b) => {
    const c = caseDe(r, g, b);
    if (cache[c] >= 0) return cache[c];
    let best = 0;
    let dist = Infinity;
    for (let i = 0; i < couleurs.length; i++) {
      const [pr, pg, pb] = couleurs[i];
      const d = 2 * (r - pr) ** 2 + 4 * (g - pg) ** 2 + 3 * (b - pb) ** 2;
      if (d < dist) {
        dist = d;
        best = i;
      }
    }
    cache[c] = best;
    return best;
  };
}

/** Compression LZW du GIF : indices de couleur → octets, en sous-blocs de 255 au plus. */
function lzw(indices, tailleMin) {
  const clear = 1 << tailleMin;
  const fin = clear + 1;
  const octets = [];
  let acc = 0;
  let nbits = 0;
  let taille = tailleMin + 1;
  const ecrire = (code) => {
    acc |= code << nbits;
    nbits += taille;
    while (nbits >= 8) {
      octets.push(acc & 255);
      acc >>>= 8;
      nbits -= 8;
    }
  };
  let table = new Map();
  let suivant = fin + 1;
  ecrire(clear);
  let prefixe = indices.length ? indices[0] : 0;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const cle = prefixe * 4096 + k;
    const code = table.get(cle);
    if (code !== undefined) {
      prefixe = code;
      continue;
    }
    ecrire(prefixe);
    if (suivant < 4096) {
      table.set(cle, suivant++);
      if (suivant > 1 << taille && taille < 12) taille++;
    } else {
      ecrire(clear);
      table = new Map();
      suivant = fin + 1;
      taille = tailleMin + 1;
    }
    prefixe = k;
  }
  if (indices.length) ecrire(prefixe);
  ecrire(fin);
  if (nbits > 0) octets.push(acc & 255);
  const blocs = [];
  for (let i = 0; i < octets.length; i += 255) {
    const bloc = octets.slice(i, i + 255);
    blocs.push(bloc.length, ...bloc);
  }
  blocs.push(0);
  return blocs;
}

const u16 = (n) => [n & 255, (n >> 8) & 255];

/**
 * GIF animé en boucle.
 * @param o.largeur, o.hauteur  taille en pixels
 * @param o.images              pixels de chaque image (largeur × hauteur × 4 octets)
 * @param o.delai               durée de chaque image, en centièmes de seconde
 * @param o.ordre               'rgba' ou 'bgra' (NativeImage.toBitmap() sous Windows)
 * @returns {Buffer}
 */
function encoderGif({ largeur, hauteur, images, delai = 5, ordre = 'rgba' }) {
  if (!(largeur > 0 && hauteur > 0 && largeur <= 65535 && hauteur <= 65535)) throw new Error('Taille d’image impossible.');
  if (!images?.length) throw new Error('Aucune image.');
  for (const px of images) if (px.length !== largeur * hauteur * 4) throw new Error('Image de la mauvaise taille.');
  const total = largeur * hauteur;
  const couleurs = palette(images, { ordre, pas: total > 400_000 ? 2 : 1 });
  while (couleurs.length < 256) couleurs.push([0, 0, 0]);
  const indice = indexeur(couleurs);
  const lire = lecteur(ordre);
  const indexees = images.map((px) => {
    const out = new Uint8Array(total);
    for (let p = 0, i = 0; p < total; p++, i += 4) {
      const [r, g, b] = lire(px, i);
      out[p] = indice(r, g, b);
    }
    return out;
  });

  // Images à écrire : la première entière, puis le rectangle changé ; une image identique allonge la précédente
  const morceaux = [{ x: 0, y: 0, l: largeur, h: hauteur, idx: indexees[0], delai }];
  for (let f = 1; f < indexees.length; f++) {
    const a = indexees[f - 1];
    const b = indexees[f];
    let x0 = largeur;
    let y0 = hauteur;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < hauteur; y++) {
      const ligne = y * largeur;
      for (let x = 0; x < largeur; x++) {
        if (a[ligne + x] !== b[ligne + x]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) {
      morceaux[morceaux.length - 1].delai += delai;
      continue;
    }
    const l = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const idx = new Uint8Array(l * h);
    for (let y = 0; y < h; y++) idx.set(b.subarray((y0 + y) * largeur + x0, (y0 + y) * largeur + x0 + l), y * l);
    morceaux.push({ x: x0, y: y0, l, h, idx, delai });
  }

  const parties = [];
  parties.push(Buffer.from('GIF89a', 'ascii'));
  parties.push(Buffer.from([...u16(largeur), ...u16(hauteur), 0xf7, 0, 0])); // palette globale de 256 couleurs
  parties.push(Buffer.from(couleurs.flat()));
  parties.push(Buffer.from([0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0', 'ascii'), 3, 1, 0, 0, 0])); // boucle infinie
  for (const m of morceaux) {
    // Contrôle : laisser l'image en place (disposition 1), sans transparence, durée en centièmes
    parties.push(Buffer.from([0x21, 0xf9, 4, 0x04, ...u16(Math.min(65535, m.delai)), 0, 0]));
    parties.push(Buffer.from([0x2c, ...u16(m.x), ...u16(m.y), ...u16(m.l), ...u16(m.h), 0]));
    parties.push(Buffer.from([8, ...lzw(m.idx, 8)]));
  }
  parties.push(Buffer.from([0x3b]));
  return Buffer.concat(parties);
}

module.exports = { encoderGif, palette, lzw };
