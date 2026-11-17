// Packs d'avatars du compagnon.
//
// - Pack par défaut « defaut » : livré avec le module (avatars/defaut), dessins SVG originaux.
// - Packs du joueur : server/data/compagnon/avatars/<pack>/, avec un pack.json facultatif et une image par humeur.
//
// Règles d'un pack du joueur :
//   - nom du dossier : lettres, chiffres, - et _ (40 caractères au plus) ;
//   - images PNG, WebP ou GIF (GIF et APNG animés acceptés tels quels), 4 Mo et 2 048 px de côté au plus chacune,
//     reconnues à leur contenu et pas seulement à leur extension. Jamais de SVG : un SVG peut contenir du script.
//     Les dimensions sont lues dans l'en-tête : un PNG uni de 4 Mo peut faire 25 000 × 25 000 px (2,5 Go décodé) ;
//   - pack.json : { "nom", "auteur", "humeurs": { "neutre": "neutre.png", … }, "phrases": { … }, "remplacerPhrases" } ;
//     sans pack.json, ou sans « humeurs », les images sont cherchées sous le nom de l'humeur (neutre.png, ravi.gif…) ;
//   - humeur manquante : l'image neutre la remplace ; image « clignement » facultative (yeux fermés) ;
//   - ni lien symbolique ni sous-dossier : seuls les fichiers du dossier lui-même sont lus.

import fs from 'node:fs';
import path from 'node:path';
import { BLINK, MOODS } from './categories.js';
import { cleanPhrases, cleanText } from './phrases.js';

export const DEFAULT_PACK = 'defaut';
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_SIDE = 2048; // px, largeur comme hauteur
export const MAX_PACK_JSON_BYTES = 256 * 1024;
export const MAX_PACKS = 50;
export const IMAGE_TYPES = { png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
export const SLOTS = [...MOODS, BLINK]; // humeurs + clignement

const SLOT_SET = new Set(SLOTS);
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}$/;

/** Nom de dossier de pack valide (jamais une propriété d'Object comme « constructor »). */
export const validPackId = (id) => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(id) && !(id in Object.prototype);

/** Format réel d'une image d'après ses premiers octets : png (APNG compris), gif, webp, ou null. */
export function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG' && buf[4] === 0x0d && buf[5] === 0x0a) return 'png';
  const head = buf.toString('latin1', 0, 6);
  if (head === 'GIF87a' || head === 'GIF89a') return 'gif';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/**
 * Largeur et hauteur d'une image d'après son en-tête, sans la décoder ; null si l'en-tête est illisible.
 * PNG (et APNG) : bloc IHDR. WebP : VP8X (étendu, animé), VP8L (sans perte) ou VP8 (avec perte).
 * GIF : écran logique, agrandi par chaque image de l'animation qui en dépasse (le fichier entier est parcouru).
 */
export function dimensions(buf, type) {
  if (type === 'png') {
    if (buf.length < 24 || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (type === 'webp') {
    const chunk = buf.toString('latin1', 12, 16);
    if (chunk === 'VP8X' && buf.length >= 30) return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === 'VP8L' && buf.length >= 25 && buf[20] === 0x2f) {
      const bits = buf.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
    }
    if (chunk === 'VP8 ' && buf.length >= 30 && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    return null;
  }
  if (type === 'gif') return gifSize(buf);
  return null;
}

function gifSize(buf) {
  if (buf.length < 13) return null;
  let width = buf.readUInt16LE(6);
  let height = buf.readUInt16LE(8);
  let p = 13;
  if (buf[10] & 0x80) p += 3 * (2 << (buf[10] & 7)); // palette globale
  const skipBlocks = () => {
    while (p < buf.length) {
      const n = buf[p];
      p += 1 + n;
      if (n === 0) return true;
    }
    return false;
  };
  while (p < buf.length) {
    const b = buf[p];
    if (b === 0x21) {
      // Extension (animation, commentaire…) : étiquette puis sous-blocs
      p += 2;
      if (!skipBlocks()) break;
    } else if (b === 0x2c) {
      // Image : position et taille, palette locale, données compressées
      if (p + 10 > buf.length) break;
      width = Math.max(width, buf.readUInt16LE(p + 1) + buf.readUInt16LE(p + 5));
      height = Math.max(height, buf.readUInt16LE(p + 3) + buf.readUInt16LE(p + 7));
      const packed = buf[p + 9];
      p += 10;
      if (packed & 0x80) p += 3 * (2 << (packed & 7));
      p += 1; // taille minimale du code LZW
      if (!skipBlocks()) break;
    } else break; // fin (0x3b) ou octet inattendu
  }
  return { width, height };
}

const HEAD_BYTES = 32;

/** Début du fichier, ou le fichier entier pour un GIF (dimensions de chaque image ; 4 Mo au plus, déjà vérifié). */
function readHead(file, whole = false) {
  if (whole) return fs.readFileSync(file);
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

const px = (n) => new Intl.NumberFormat('fr-FR').format(n).replace(/\s/g, ' ');

/** Fichiers ordinaires du dossier (sans lien ni sous-dossier), par nom en minuscules. */
function listFiles(dir) {
  const files = new Map();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && FILE_NAME.test(entry.name) && !entry.name.includes('..')) files.set(entry.name.toLowerCase(), entry.name);
  }
  return files;
}

/**
 * Image d'un pack, vérifiée : fichier ordinaire, taille, format reconnu à son contenu.
 * @returns {{ file, type, size, mtime } | { error }}
 */
export function checkImage(dir, name, { allowSvg = false } = {}) {
  const ext = path.extname(name).slice(1).toLowerCase();
  if (ext === 'svg' && !allowSvg) return { error: `${name} : SVG refusé (seuls PNG, WebP et GIF sont acceptés).` };
  if (!['png', 'webp', 'gif', ...(allowSvg ? ['svg'] : [])].includes(ext)) return { error: `${name} : format non accepté (PNG, WebP ou GIF).` };
  const file = path.join(dir, name);
  let st;
  try {
    st = fs.lstatSync(file);
  } catch {
    return { error: `${name} : fichier introuvable.` };
  }
  if (!st.isFile()) return { error: `${name} : ce n'est pas un fichier.` };
  if (st.size > MAX_IMAGE_BYTES) return { error: `${name} : ${(st.size / 1048576).toFixed(1).replace('.', ',')} Mo, 4 Mo au plus.` };
  if (ext !== 'svg') {
    const head = readHead(file, ext === 'gif');
    const type = sniff(head);
    if (!type) return { error: `${name} : ce n'est pas une image PNG, WebP ou GIF valide.` };
    if (type !== ext) return { error: `${name} : c'est en réalité une image ${type.toUpperCase()}, renomme-la en .${type}.` };
    const size = dimensions(head, type);
    if (!size || !size.width || !size.height) return { error: `${name} : dimensions illisibles, l'image semble abîmée.` };
    if (size.width > MAX_SIDE || size.height > MAX_SIDE) {
      return { error: `${name} : ${px(size.width)} × ${px(size.height)} px, ${px(MAX_SIDE)} px de côté au plus (512 × 512 conseillé).` };
    }
  }
  return { file, type: IMAGE_TYPES[ext], size: st.size, mtime: Math.round(st.mtimeMs) };
}

function readPackJson(dir, errors) {
  const file = path.join(dir, 'pack.json');
  let st;
  try {
    st = fs.lstatSync(file);
  } catch {
    return null; // facultatif
  }
  if (!st.isFile()) {
    errors.push('pack.json : ce n’est pas un fichier.');
    return null;
  }
  if (st.size > MAX_PACK_JSON_BYTES) {
    errors.push('pack.json : fichier trop gros (256 Ko au plus).');
    return null;
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\ufeff/, ''));
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
    errors.push('pack.json : un objet { "nom": …, "humeurs": … } est attendu.');
  } catch (err) {
    errors.push(`pack.json illisible : ${err.message.slice(0, 120)}`);
  }
  return null;
}

/**
 * Lecture d'un pack.
 * @param dir dossier du pack
 * @param id nom du pack (son dossier)
 * @param builtin pack livré avec l'app (SVG autorisés)
 * @returns {{ id, name, author, builtin, ok, images: Map, missing: string[], errors: string[], phrases, phraseCount, replacePhrases }}
 */
export function readPack(dir, id, { builtin = false } = {}) {
  const errors = [];
  const pack = { id, name: id, author: null, builtin, ok: false, images: new Map(), missing: [], errors, phrases: {}, phraseCount: 0, replacePhrases: false };
  let files;
  try {
    const st = fs.lstatSync(dir);
    if (!st.isDirectory()) throw new Error('pas un dossier');
    files = listFiles(dir);
  } catch {
    errors.push('Dossier illisible.');
    return pack;
  }
  const meta = readPackJson(dir, errors) || {};
  const own = (k) => (Object.hasOwn(meta, k) ? meta[k] : undefined);
  pack.name = cleanText(own('nom'), 40) || id;
  pack.author = cleanText(own('auteur'), 60);
  pack.replacePhrases = own('remplacerPhrases') === true;

  const declared = own('humeurs');
  const mapping = new Map();
  if (declared != null) {
    if (typeof declared !== 'object' || Array.isArray(declared)) errors.push('« humeurs » doit être un objet { "neutre": "neutre.png", … }.');
    else {
      for (const key of Object.keys(declared)) {
        if (!SLOT_SET.has(key)) errors.push(`Humeur inconnue : « ${String(key).slice(0, 30)} » (humeurs : ${SLOTS.join(', ')}).`);
        else if (typeof declared[key] !== 'string' || !FILE_NAME.test(declared[key]) || declared[key].includes('..')) errors.push(`${key} : nom de fichier invalide (pas de dossier, pas de « .. »).`);
        else mapping.set(key, declared[key]);
      }
    }
  }
  const exts = builtin ? ['svg', 'png', 'webp', 'gif'] : ['png', 'webp', 'gif'];
  for (const slot of SLOTS) {
    let name = mapping.get(slot);
    if (!name) {
      // Sans déclaration : fichier au nom de l'humeur
      const ext = exts.find((e) => files.has(`${slot}.${e}`));
      if (ext) name = files.get(`${slot}.${ext}`);
      else if (!builtin && files.has(`${slot}.svg`)) {
        errors.push(`${slot}.svg : SVG refusé (seuls PNG, WebP et GIF sont acceptés).`);
      }
    }
    if (!name) {
      if (slot !== BLINK) pack.missing.push(slot);
      continue;
    }
    const real = files.get(name.toLowerCase());
    if (!real) {
      errors.push(`${slot} : fichier « ${name} » introuvable dans le dossier.`);
      if (slot !== BLINK) pack.missing.push(slot);
      continue;
    }
    const img = checkImage(dir, real, { allowSvg: builtin });
    if (img.error) {
      errors.push(`${slot} : ${img.error}`);
      if (slot !== BLINK) pack.missing.push(slot);
      continue;
    }
    pack.images.set(slot, img);
  }
  pack.ok = MOODS.some((m) => pack.images.has(m));
  if (!pack.ok) errors.push('Aucune image d’humeur utilisable : il faut au moins neutre.png (ou .webp, .gif).');
  else if (!pack.images.has('neutre')) errors.push('Pas d’image « neutre » : une autre humeur la remplace.');

  const cleaned = cleanPhrases(own('phrases'));
  pack.phrases = cleaned.phrases;
  pack.phraseCount = cleaned.count;
  errors.push(...cleaned.errors.slice(0, 20));
  return pack;
}

/** Image à montrer pour une humeur : la sienne, sinon la neutre, sinon la première trouvée. */
export function imageFor(pack, slot) {
  if (pack.images.has(slot)) return pack.images.get(slot);
  if (slot === BLINK) return null;
  return pack.images.get('neutre') || pack.images.get(MOODS.find((m) => pack.images.has(m))) || null;
}

/**
 * Tous les packs : le pack par défaut, puis ceux du joueur (dossier créé s'il manque).
 * @returns {Map<string, object>} id → pack
 */
export function listPacks({ dir, builtinDir }) {
  const packs = new Map();
  packs.set(DEFAULT_PACK, readPack(builtinDir, DEFAULT_PACK, { builtin: true }));
  try {
    fs.mkdirSync(dir, { recursive: true });
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && validPackId(e.name) && e.name.toLowerCase() !== DEFAULT_PACK)
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_PACKS);
    for (const e of entries) packs.set(e.name, readPack(path.join(dir, e.name), e.name));
  } catch {
    // dossier des packs illisible : seul le pack par défaut
  }
  return packs;
}

/** Description d'un pack pour l'interface : adresses des images (une par humeur, neutre à défaut). */
export function packInfo(pack, base) {
  const url = (slot) => {
    const img = imageFor(pack, slot);
    return img ? `${base}/${encodeURIComponent(pack.id)}/${slot}?v=${img.mtime}` : null;
  };
  return {
    id: pack.id,
    name: pack.name,
    author: pack.author,
    builtin: pack.builtin,
    ok: pack.ok,
    moods: Object.fromEntries(MOODS.map((m) => [m, url(m)])),
    blink: pack.images.has(BLINK) ? url(BLINK) : null,
    own: MOODS.filter((m) => pack.images.has(m)),
    missing: pack.missing,
    errors: pack.errors,
    phraseCount: pack.phraseCount,
    replacePhrases: pack.replacePhrases,
  };
}
