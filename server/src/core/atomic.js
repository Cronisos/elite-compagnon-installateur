// Écriture atomique des fichiers de l'app (server/data) : la SEULE façon d'y écrire un fichier (un test le vérifie,
// atomic.test.js). Le serveur peut être tué n'importe quand : relance de dev.js, fenêtre « EliteApp serveur » fermée,
// plantage, coupure de courant. Une écriture en place (writeFileSync sur le fichier final) vide d'abord le fichier puis
// l'écrit : coupée au milieu, elle laissait un fichier vide ou à moitié écrit, relu ensuite comme « rien » et écrasé.
//
// Ici : fichier temporaire unique dans le même dossier, écriture, fsync (le contenu est sur le disque avant le
// renommage), puis renommage par-dessus l'ancien. Une coupure laisse l'ancienne version entière, ou la nouvelle,
// jamais un mélange. Sous Windows, un antivirus ou un outil de sauvegarde peut tenir le fichier ouvert un instant
// (EPERM, EBUSY, EACCES) : on réessaie, puis on échoue SANS écrire en place. Le fichier temporaire ne reste jamais.
//
// À la lecture, un fichier illisible (coupé par une ancienne version, abîmé) est mis de côté sous
// « <nom>.illisible-<date> » avec un avertissement, au lieu d'être écrasé en silence à la prochaine écriture. Un fichier
// verrouillé à la lecture (EBUSY, EACCES, EPERM) est relu quelques fois ; toujours illisible, l'appelant repart de sa
// valeur par défaut, et la prochaine écriture garde d'abord une copie de l'ancien sous « <nom>.non-relu-<date> » : avant, il était
// traité comme absent et écrasé (remises à zéro de tous les modes, accord du joueur pour l'escadron…).

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RETRIES = 5;
const RETRY_MS = 60;
let counter = 0;

/** Attente synchrone (renommage réessayé) : rare, et jamais plus de RETRIES × RETRY_MS. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Fichiers que readJsonFile n'a pas pu lire (verrouillés, droits) : l'appelant est reparti de sa valeur par défaut, et
// les réécrire tels quels effacerait ce qu'ils gardent (les remises à zéro de tous les modes, l'accord du joueur…).
const unread = new Set();

/** Fichier non relu (readJsonFile) : à mettre de côté avant de l'écrire. */
export const isUnread = (file) => unread.has(path.resolve(file));

/**
 * Avant d'écrire un fichier que la dernière lecture n'a pas pu lire : l'ancien est copié sous
 * « <nom>.non-relu-<date> » (rien n'est perdu). Une copie, pas un renommage : l'original reste à son nom jusqu'au
 * renommage atomique final. Une écriture qui échoue ensuite (fichier temporaire ou renommage refusés) le laisse donc
 * en place, et le lancement suivant le relit. Copie impossible (toujours verrouillé) : erreur, et rien n'est écrit.
 */
function keepUnread(file, fsImpl) {
  const key = path.resolve(file);
  if (!unread.has(key)) return;
  const aside = `${file}.non-relu-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  try {
    fsImpl.copyFileSync(file, aside, fs.constants.COPYFILE_EXCL);
    console.warn(`${path.basename(file)} : non relu au démarrage, une copie de l'ancien fichier est gardée sous ${path.basename(aside)}.`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw new Error(`${path.basename(file)} : non relu, et toujours impossible à mettre de côté (${err.code || err.message}) : pas écrasé.`);
    }
  }
  unread.delete(key);
}

/** Nom du fichier temporaire, à côté du fichier final (même disque : le renommage est atomique). */
export function tempNameFor(file) {
  counter = (counter + 1) % 1e9;
  return `${file}.${process.pid}.${counter}.${randomBytes(4).toString('hex')}.tmp`;
}

/**
 * Écrit `data` (texte ou Buffer) dans `file` de façon atomique.
 * @param {object} [o]
 * @param {number} [o.mode] droits du fichier (0o600 pour le jeton d'escadron)
 * @param {object} [o.fsImpl] fonctions de fichier (tests : renommage qui échoue)
 */
export function writeFileAtomicSync(file, data, { mode, fsImpl = fs } = {}) {
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  keepUnread(file, fsImpl);
  const tmp = tempNameFor(file);
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  try {
    const fd = fsImpl.openSync(tmp, 'wx', mode);
    try {
      let done = 0;
      while (done < buf.length) done += fsImpl.writeSync(fd, buf, done, buf.length - done);
      fsImpl.fsyncSync(fd);
    } finally {
      fsImpl.closeSync(fd);
    }
    for (let attempt = 0; ; attempt++) {
      try {
        fsImpl.renameSync(tmp, file);
        return;
      } catch (err) {
        if (!RETRY_CODES.has(err.code) || attempt >= RETRIES) throw err;
        sleepSync(RETRY_MS);
      }
    }
  } catch (err) {
    try {
      fsImpl.rmSync(tmp, { force: true });
    } catch {
      // déjà parti
    }
    throw err;
  }
}

/** Écrit une valeur en JSON, de façon atomique. */
export function writeJsonAtomicSync(file, value, options) {
  writeFileAtomicSync(file, JSON.stringify(value), options);
}

/**
 * Lit un fichier JSON de l'app. Absent : `fallback`. Illisible ou refusé par `accept` : mis de côté
 * (« .illisible-<date> », avertissement), puis `fallback`. Une erreur de lecture (fichier verrouillé) ne déplace rien :
 * réessayée, puis `fallback`, et le fichier est marqué « non relu » (gardé à part avant la prochaine écriture).
 * @param {string} file
 * @param {object} [o]
 * @param {*} [o.fallback] valeur rendue si le fichier manque ou est illisible
 * @param {(value) => boolean} [o.accept] forme attendue (par défaut : tout JSON)
 * @param {string} [o.label] nom du fichier dans l'avertissement
 */
export function readJsonFile(file, { fallback = null, accept = () => true, label = path.basename(file), warn = console.warn, now = Date.now() } = {}) {
  let text;
  for (let attempt = 0; ; attempt++) {
    try {
      text = fs.readFileSync(file, 'utf8');
      break;
    } catch (err) {
      // Verrouillé un instant (antivirus, sauvegarde) : on réessaie, comme pour l'écriture
      if (RETRY_CODES.has(err.code) && attempt < RETRIES) {
        sleepSync(RETRY_MS);
        continue;
      }
      if (err.code === 'ENOENT') {
        unread.delete(path.resolve(file));
        return fallback;
      }
      // Non lu (verrouillé, droits) : le fichier garde peut-être des données. L'appelant repart de `fallback` ; la
      // prochaine écriture de ce fichier le met d'abord de côté (writeFileAtomicSync), au lieu de l'écraser.
      unread.add(path.resolve(file));
      warn(`${label} : non lu (${err.message}) ; il ne sera pas écrasé (mis de côté avant la prochaine écriture).`);
      return fallback;
    }
  }
  unread.delete(path.resolve(file));
  let value;
  let ok = false;
  try {
    value = JSON.parse(text.replace(/^﻿/, ''));
    ok = accept(value);
  } catch {
    ok = false;
  }
  if (ok) return value;
  setAside(file, { label, warn, now });
  return fallback;
}

/** Met un fichier illisible de côté (« <nom>.illisible-<date> ») pour qu'il ne soit pas écrasé. Rend son nouveau nom. */
export function setAside(file, { label = path.basename(file), warn = console.warn, now = Date.now() } = {}) {
  const aside = `${file}.illisible-${new Date(now).toISOString().replace(/[:.]/g, '-')}`;
  try {
    fs.renameSync(file, aside);
    warn(`${label} : fichier illisible, mis de côté sous ${path.basename(aside)} (repart de zéro).`);
    return aside;
  } catch (err) {
    warn(`${label} : fichier illisible, non mis de côté (${err.message}).`);
    return null;
  }
}

// Fichier temporaire de writeFileAtomicSync (<nom>.<pid>.<n>.<aléa>.tmp) ou des versions d'avant (<nom>.<pid>.tmp)
const TEMP_RE = /\.\d+(?:\.\d+\.[a-z0-9]+)?\.tmp$/;

/**
 * Efface les fichiers temporaires laissés par une écriture coupée (serveur tué entre l'ouverture et le renommage), dans
 * un dossier (sans descendre), s'ils ont plus de `olderThanMs`. Rend leur nombre.
 */
export function removeStaleTemps(dir, { olderThanMs = 60_000, now = Date.now() } = {}) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    if (!TEMP_RE.test(name)) continue;
    const file = path.join(dir, name);
    try {
      const st = fs.statSync(file);
      if (!st.isFile() || now - st.mtimeMs < olderThanMs) continue;
      fs.rmSync(file, { force: true });
      removed += 1;
    } catch {
      // déjà parti, ou verrouillé : au prochain démarrage
    }
  }
  return removed;
}

/** Objet JSON ordinaire (ni tableau, ni null). */
export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
