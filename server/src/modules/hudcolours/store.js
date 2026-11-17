// Fichier d'options du joueur GraphicsConfigurationOverride.xml : lecture, écriture des couleurs,
// sauvegardes et restauration.
//
// C'est le SEUL fichier du jeu que l'app modifie, à la demande du joueur et après confirmation :
// - avant chaque écriture, copie horodatée à côté (GraphicsConfigurationOverride.xml.elite-compagnon-<date>.bak),
//   les 10 dernières sont gardées ; les sauvegardes faites à la main (.bleu.bak…) ne sont jamais effacées ;
// - écriture atomique : fichier temporaire dans le même dossier, puis renommage ;
// - seul le bloc GUIColour/Default change (xml.js), le reste du fichier est gardé tel quel ;
// - la page envoie la version du fichier qu'elle a affichée : si le fichier a changé entre-temps, rien n'est écrit ;
// - fichier mis en lecture seule par le joueur : refus, l'app ne retire jamais ce réglage elle-même.
// Le dossier n'est jamais créé : s'il manque, le jeu n'a pas encore été lancé sur ce PC.

import fs from 'node:fs/promises';
import path from 'node:path';
import { gameOptionsPath } from '../../core/paths.js';
import crypto from 'node:crypto';
import { checkMatrix, IDENTITY, readConfig, withMatrix, withoutMatrix } from './xml.js';

export const FILE_NAME = 'GraphicsConfigurationOverride.xml';
export const KEEP_BACKUPS = 10;
const MAX_BYTES = 1024 * 1024; // le fichier fait quelques centaines d'octets
const MAX_OTHER_BACKUPS = 20;
const OWN_BACKUP = /^GraphicsConfigurationOverride\.xml\.elite-compagnon-(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:-(\d+))?\.bak$/;
const ANY_BACKUP = /^GraphicsConfigurationOverride\.xml\..+\.bak$/i;
const TMP_NAME = 'GraphicsConfigurationOverride.xml.elite-compagnon.tmp';

/** Dossier des options graphiques du jeu (le même pour Steam, Epic et Frontier), ou ELITE_GAME_OPTIONS_DIR\Graphics (core/paths.js). */
export function defaultOptionsDir(env = process.env) {
  return gameOptionsPath('Graphics', env);
}

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}

const pad = (n) => String(n).padStart(2, '0');
/** Date locale lisible dans un nom de fichier : 2026-11-07_22-15-30. */
export function stamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/**
 * Clé d'une sauvegarde de l'app : date du nom et numéro d'ordre (le « -n » final, 1 s'il manque) ; null pour une autre
 * sauvegarde. Le numéro ne fait que monter (le plus grand existant plus un) : c'est lui qui donne l'ordre réel de
 * création, même si l'horloge a reculé (passage à l'heure d'hiver, heure corrigée, double démarrage avec Linux).
 */
function ownKey(name) {
  const m = OWN_BACKUP.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, n] = m;
  return { at: new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime(), n: Number(n || 1) };
}

const versionOf = (raw) => (raw.exists ? crypto.createHash('sha256').update(raw.buf).digest('hex').slice(0, 16) : 'absent');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Contenu lu : texte UTF-8 et analyse ; error si illisible (l'app refuse alors d'y retoucher). */
function describe(buf) {
  const text = buf.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buf)) return { text: null, error: "Le fichier n'est pas en UTF-8 : l'app n'y touche pas." };
  try {
    return { text, ...readConfig(text), error: null };
  } catch (err) {
    if (err.code !== 'XML') throw err;
    return { text, error: `Fichier illisible (${err.message}) : l'app n'y touche pas.` };
  }
}

export class HudColourFile {
  constructor({ dir, now = () => new Date() }) {
    this.dir = dir;
    this.file = path.join(dir, FILE_NAME);
    this.now = now;
    this.queue = Promise.resolve(); // une écriture à la fois
  }

  async dirExists() {
    try {
      return (await fs.stat(this.dir)).isDirectory();
    } catch {
      return false;
    }
  }

  async readFile(file) {
    let st;
    try {
      st = await fs.stat(file);
    } catch (err) {
      if (err.code === 'ENOENT') return { exists: false, buf: null, mtime: null };
      throw err;
    }
    if (!st.isFile()) throw httpError(409, `${path.basename(file)} n'est pas un fichier.`);
    if (st.size > MAX_BYTES) throw httpError(409, `${path.basename(file)} est trop gros (${st.size} octets) : ce n'est pas le fichier attendu.`);
    // Lecture seule (case « Lecture seule » des propriétés sous Windows) : aucun droit d'écriture dans le mode
    return { exists: true, buf: await fs.readFile(file), mtime: st.mtime.toISOString(), readOnly: (st.mode & 0o222) === 0 };
  }

  /** État complet pour la page : fichier, matrice appliquée, sauvegardes. */
  async state() {
    const dirExists = await this.dirExists();
    const raw = dirExists ? await this.readFile(this.file) : { exists: false, buf: null, mtime: null };
    const info = raw.exists ? describe(raw.buf) : { error: null, empty: true, hasBlock: false, matrix: structuredClone(IDENTITY), rows: null, otherSettings: false };
    return {
      dir: this.dir,
      path: this.file,
      dirExists,
      exists: raw.exists,
      version: versionOf(raw),
      size: raw.exists ? raw.buf.length : 0,
      modifiedAt: raw.mtime,
      empty: info.empty ?? false,
      hasBlock: info.hasBlock ?? false,
      matrix: info.matrix ?? null, // matrice appliquée par le jeu (celle d'origine sans bloc) ; null : fichier illisible
      rows: info.rows ?? null,
      otherSettings: info.otherSettings ?? false,
      readOnly: Boolean(raw.readOnly), // l'app ne retire jamais ce réglage elle-même
      error: info.error,
      backups: dirExists ? await this.backups() : [],
    };
  }

  /** Sauvegardes à côté du fichier : celles de l'app (10 au plus) et celles faites à la main. */
  async backups() {
    const names = (await fs.readdir(this.dir)).filter((n) => ANY_BACKUP.test(n));
    const list = [];
    for (const name of names) {
      let raw;
      try {
        raw = await this.readFile(path.join(this.dir, name));
      } catch {
        continue; // dossier ou fichier énorme portant ce nom : ignoré
      }
      if (!raw.exists) continue;
      const own = ownKey(name);
      const info = describe(raw.buf);
      list.push({
        name,
        own: Boolean(own),
        at: own ? new Date(own.at).toISOString() : raw.mtime,
        sort: own ? own.at : Date.parse(raw.mtime),
        n: own ? own.n : 0,
        size: raw.buf.length,
        hasBlock: info.hasBlock ?? false,
        matrix: info.hasBlock ? info.matrix : null,
        error: info.error || (info.rows && Object.values(info.rows).includes('invalid') ? 'Matrice illisible.' : null),
      });
    }
    list.sort((a, b) => b.sort - a.sort || b.n - a.n);
    // Les copies de l'app gardent leurs places parmi les autres, mais dans l'ordre réel de création (numéro d'ordre) :
    // après un recul de l'horloge, la plus récente reste en tête, même si l'heure de son nom est plus ancienne
    const places = list.map((b, i) => (b.own ? i : -1)).filter((i) => i >= 0);
    const byCreation = list.filter((b) => b.own).sort((a, b) => b.n - a.n || b.sort - a.sort);
    places.forEach((i, k) => { list[i] = byCreation[k]; });
    const others = list.filter((b) => !b.own).slice(0, MAX_OTHER_BACKUPS);
    return list.filter((b) => b.own || others.includes(b)).map(({ sort, n, ...b }) => b);
  }

  /** Une seule écriture à la fois, même si deux pages cliquent ensemble. */
  exclusive(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  /** Contrôles communs à toute écriture ; renvoie le fichier actuel. */
  async prepare({ version, confirm }) {
    if (confirm !== true) throw httpError(400, 'Confirmation requise avant de modifier le fichier du jeu.');
    if (typeof version !== 'string') throw httpError(400, 'Version du fichier manquante : recharge la page.');
    if (!(await this.dirExists())) throw httpError(409, `Dossier des options du jeu introuvable (${this.dir}) : lance le jeu une fois, puis recommence.`);
    const raw = await this.readFile(this.file);
    if (versionOf(raw) !== version) throw httpError(409, 'Le fichier a changé depuis l’affichage de la page : recharge-la, puis recommence.');
    if (raw.readOnly) throw httpError(409, 'Le fichier est en lecture seule : décoche « Lecture seule » dans ses propriétés, puis recommence.');
    return { raw, info: raw.exists ? describe(raw.buf) : { text: '', error: null } };
  }

  /** Applique une matrice : seul le bloc GUIColour/Default est créé ou remplacé. */
  apply(matrix, opts = {}) {
    const m = checkMatrix(matrix);
    if (typeof m === 'string') return Promise.reject(httpError(400, m));
    return this.exclusive(async () => {
      const { raw, info } = await this.prepare(opts);
      if (info.error) throw httpError(409, info.error);
      return this.commit(raw, withMatrix(info.text, m));
    });
  }

  /** Retour à l'orange d'origine : le bloc GUIColour/Default est retiré, le reste du fichier gardé. */
  reset(opts = {}) {
    return this.exclusive(async () => {
      const { raw, info } = await this.prepare(opts);
      if (!raw.exists) return { changed: false, backup: null };
      if (info.error) throw httpError(409, info.error);
      return this.commit(raw, withoutMatrix(info.text));
    });
  }

  /**
   * Restauration d'une sauvegarde. Fichier actuel lisible : seules ses couleurs sont reprises (les autres
   * réglages actuels restent). Fichier actuel illisible : la sauvegarde le remplace en entier.
   */
  restore(name, opts = {}) {
    return this.exclusive(async () => {
      if (typeof name !== 'string' || !ANY_BACKUP.test(name)) throw httpError(400, 'Sauvegarde inconnue.');
      const { raw, info } = await this.prepare(opts);
      // Le nom doit être celui d'un fichier du dossier : aucun chemin ne vient de la requête
      const names = await fs.readdir(this.dir);
      if (!names.includes(name)) throw httpError(404, 'Sauvegarde introuvable.');
      const saved = await this.readFile(path.join(this.dir, name));
      if (!saved.exists) throw httpError(404, 'Sauvegarde introuvable.');
      const backup = describe(saved.buf);
      if (backup.error) throw httpError(409, `Sauvegarde illisible : ${backup.error}`);
      if (Object.values(backup.rows).includes('invalid')) throw httpError(409, 'Sauvegarde illisible : sa matrice ne contient pas 3 nombres par ligne.');
      if (info.error || !raw.exists) {
        return { ...(await this.commit(raw, saved.buf)), mode: 'file' };
      }
      if (!backup.hasBlock) return { ...(await this.commit(raw, withoutMatrix(info.text))), mode: 'colours' };
      const m = checkMatrix(backup.matrix);
      if (typeof m === 'string') throw httpError(409, `Sauvegarde refusée : ${m}`);
      return { ...(await this.commit(raw, withMatrix(info.text, m))), mode: 'colours' };
    });
  }

  /** Sauvegarde, écriture atomique, vérification, puis ménage des anciennes sauvegardes. */
  async commit(raw, content) {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    if (raw.exists && buf.equals(raw.buf)) return { changed: false, backup: null };
    const backup = raw.exists ? await this.backup(raw.buf) : null;
    await this.atomicWrite(buf);
    const check = await this.readFile(this.file);
    if (!check.exists || !check.buf.equals(buf)) throw httpError(500, 'Le fichier relu ne correspond pas à ce qui a été écrit.');
    await this.prune(backup); // jamais la copie qui vient d'être faite
    return { changed: true, backup };
  }

  /** Sauvegardes de l'app, de la plus ancienne à la plus récente, dans l'ordre réel de création (numéro d'ordre). */
  async ownBackups() {
    return (await fs.readdir(this.dir))
      .map((name) => ({ name, key: ownKey(name) }))
      .filter((b) => b.key)
      .sort((a, b) => a.key.n - b.key.n || a.key.at - b.key.at);
  }

  /** Copie du fichier actuel ; pas de doublon si la dernière sauvegarde est déjà identique. */
  async backup(buf) {
    const own = await this.ownBackups();
    const last = own[own.length - 1];
    if (last) {
      const prev = await this.readFile(path.join(this.dir, last.name)).catch(() => null);
      if (prev?.exists && prev.buf.equals(buf)) return last.name;
    }
    const base = `${FILE_NAME}.elite-compagnon-${stamp(this.now())}`;
    const next = own.reduce((max, b) => Math.max(max, b.key.n), 0) + 1; // numéro d'ordre : toujours plus grand
    for (let n = next; n < next + 100; n++) {
      const name = n === 1 ? `${base}.bak` : `${base}-${n}.bak`;
      try {
        await fs.writeFile(path.join(this.dir, name), buf, { flag: 'wx' });
        return name;
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
    }
    throw httpError(500, 'Impossible de créer la sauvegarde.');
  }

  /**
   * Ménage : KEEP_BACKUPS copies au plus. Restent toujours `keep` (la copie toute neuve) et la
   * toute première, pour toujours : c'est ton fichier d'avant l'app (couleurs perso comprises) ; puis les plus récentes. Avant, elle
   * partait au 11e « Appliquer ».
   */
  async prune(keep = null) {
    const own = await this.ownBackups();
    const origin = own[0]?.name ?? null;
    const others = own.filter((b) => b.name !== keep && b.name !== origin);
    const room = KEEP_BACKUPS - (own.length - others.length);
    for (const b of others.slice(0, Math.max(0, others.length - room))) {
      await fs.unlink(path.join(this.dir, b.name)).catch(() => {});
    }
  }

  async atomicWrite(buf) {
    const tmp = path.join(this.dir, TMP_NAME);
    const fh = await fs.open(tmp, 'w');
    try {
      await fh.writeFile(buf);
      await fh.sync();
    } finally {
      await fh.close();
    }
    // Sous Windows, le renommage échoue tant qu'un autre programme garde le fichier ouvert : on réessaie
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(tmp, this.file);
        return;
      } catch (err) {
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(err.code) || attempt >= 5) {
          await fs.unlink(tmp).catch(() => {});
          if (['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw httpError(409, 'Le fichier du jeu est verrouillé par un autre programme : réessaie dans un instant.');
          throw err;
        }
        await sleep(150);
      }
    }
  }
}
