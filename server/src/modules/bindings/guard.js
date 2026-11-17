// Garde des commandes : lit, en lecture seule, le dossier des profils de commandes du jeu, date le rapport
// d'erreurs par rapport au lancement du jeu, et décide s'il faut prévenir (bandeau de l'app, fenêtre de l'overlay).
//
// Aucun fichier du dossier du jeu n'est jamais écrit : seuls readdir, stat et la lecture y sont utilisés.
// Les alertes fermées sont gardées dans le fichier JSON du module (server/data), écrit de façon atomique.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isPlainObject, readJsonFile, writeFileAtomicSync } from '../../core/atomic.js';
import {
  BACKUP_FILE, BINDS_FILE, ERROR_LOG, GAME_SILENT_MS, LAUNCH_PART, LAUNCH_TOLERANCE_MS, START_PRESET_FILE,
} from './rules.js';
import {
  bindsVersion, decodeText, devicesInBinds, frenchList, parseErrorLog, parseStartPreset, presetNameOf,
} from './parse.js';

export const LAUNCH_EVENTS = ['Fileheader', 'LoadGame', 'Shutdown'];
export const PAGE = 'bindings'; // page /hud/bindings de l'overlay
export const MAX_READ = 512 * 1024; // un .binds fait environ 65 Ko : au-delà (fichier piégé ou abîmé), il n'est pas lu
const MAX_DISMISSED = 20; // alertes fermées gardées, par endroit
const WHERE = ['overlay', 'banner'];

/** Lancements du jeu d'après le journal : Fileheader (partie 1), LoadGame, Shutdown. Garde les deux derniers. */
export class LaunchTracker {
  constructor() {
    this.launches = []; // { at, loadedAt, shutdownAt } en ms
  }

  apply(ev) {
    const t = Date.parse(ev?.timestamp);
    if (!Number.isFinite(t)) return false;
    const cur = this.current();
    switch (ev.event) {
      case 'Fileheader':
        // Partie 2, 3… : le même lancement continue dans un nouveau fichier
        if ((Number(ev.part) || LAUNCH_PART) !== LAUNCH_PART) return false;
        this.push({ at: t, loadedAt: null, shutdownAt: null });
        return true;
      case 'LoadGame':
        if (!cur || cur.shutdownAt != null) this.push({ at: t, loadedAt: t, shutdownAt: null }); // journal sans Fileheader
        else cur.loadedAt = t;
        return true;
      case 'Shutdown':
        if (!cur || cur.shutdownAt != null) return false;
        cur.shutdownAt = t;
        return true;
      default:
        return false;
    }
  }

  push(launch) {
    this.launches.push(launch);
    if (this.launches.length > 2) this.launches.shift();
  }

  current() {
    return this.launches.at(-1) || null;
  }

  previous() {
    return this.launches.at(-2) || null;
  }
}

/**
 * À quel lancement appartient un rapport écrit à mtimeMs ?
 * 'current' : le lancement en cours (ou le dernier, si le jeu est fermé) ; 'previous' : un lancement plus ancien ;
 * 'unknown' : aucun lancement dans les journaux.
 */
export function concernsLaunch(mtimeMs, tracker) {
  const cur = tracker.current();
  if (!cur) return 'unknown';
  const prev = tracker.previous();
  const prevEnd = prev ? (prev.shutdownAt ?? prev.loadedAt ?? prev.at) : -Infinity;
  const from = Math.max(cur.at - LAUNCH_TOLERANCE_MS, prevEnd + 1);
  return mtimeMs >= from ? 'current' : 'previous';
}

const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);

/** Date de dernière écriture la plus récente parmi ces fichiers (ms), ou null si aucun n'existe. */
export function lastWriteMs(files) {
  let last = null;
  for (const file of files) {
    if (!file) continue;
    try {
      const t = fs.statSync(file).mtimeMs;
      if (last == null || t > last) last = t;
    } catch {
      // fichier absent : ignoré
    }
  }
  return last;
}

/** Nature de l'alerte d'après le rapport. */
function kindOf(log) {
  if (log.missingDevices.length) return 'missing-devices';
  if (log.other.length) return 'errors';
  if (log.duplicates.length) return 'duplicates';
  return 'errors'; // en-tête seul : le jeu dit qu'il y a des erreurs sans les détailler
}

const LEVEL = { 'missing-devices': 'alert', errors: 'warning', duplicates: 'info' };

/** Textes de l'alerte, en français. running : le jeu tourne (sinon : il a été fermé depuis). */
export function alertTexts(kind, log, running) {
  const preset = log.presetFiles[0] || 'ton profil de commandes';
  if (kind === 'missing-devices') {
    const many = log.missingDevices.length > 1;
    const what = `${many ? 'manettes' : 'manette'} ${frenchList(log.missingDevices)} ${many ? 'absentes' : 'absente'}`;
    const plug = many ? 'rebranche-les' : 'rebranche-la';
    return {
      title: 'Profil de commandes ignoré',
      message: running === false
        ? `Au dernier lancement du jeu, profil de commandes ignoré : ${what}. ${plug[0].toUpperCase()}${plug.slice(1)} avant de relancer le jeu, et ne réassigne rien.`
        : `Profil de commandes ignoré : ${what}. Ne réassigne rien : ${plug} et relance le jeu.`,
    };
  }
  if (kind === 'duplicates') {
    return {
      title: 'Commandes en double',
      message: `Le jeu signale des commandes en double (${frenchList(log.duplicates)}) : il garde la première. Sans gravité.`,
    };
  }
  return {
    title: 'Erreurs dans le profil de commandes',
    message: `Le jeu a signalé des erreurs en chargeant ${preset}. Vérifie tes commandes avant de décoller, et ne réassigne rien avant d'avoir lu le détail.`,
  };
}

/** Écriture atomique : fichier temporaire à côté, puis renommage. */
function writeJsonAtomic(file, data) {
  writeFileAtomicSync(file, JSON.stringify(data, null, 2)); // core/atomic.js
}

export class BindingsGuard {
  /**
   * @param dir        dossier des profils de commandes du jeu (lecture seule)
   * @param displayDir le même, tel qu'on l'affiche (%LOCALAPPDATA%\…)
   * @param dataFile   fichier JSON du module (alertes fermées)
   * @param overlay    { setExtra(page, on) } : fenêtre par-dessus le jeu
   * @param broadcast  (type, data) : temps réel vers l'interface
   * @param lastSignOfLife () => ms | null : dernier signe de vie du jeu (journal actif, Status.json écrits)
   */
  constructor({ dir, displayDir = dir, dataFile, overlay = null, broadcast = () => {}, now = Date.now, lastSignOfLife = () => null }) {
    this.dir = dir;
    this.displayDir = displayDir;
    this.dataFile = dataFile;
    this.overlay = overlay;
    this.broadcast = broadcast;
    this.now = now;
    this.lastSignOfLife = lastSignOfLife;
    this.tracker = new LaunchTracker();
    this.dismissed = this.loadDismissed();
    this.stamp = null; // empreinte du dossier au dernier passage (noms, dates, tailles)
    this.lastKey = null; // dernier état envoyé à l'interface
    this.status = null;
  }

  loadDismissed() {
    const out = { overlay: [], banner: [] };
    // Pas encore de fichier : rien de fermé ; illisible : mis de côté (core/atomic.js), rien de fermé
    const saved = readJsonFile(this.dataFile, { fallback: null, accept: isPlainObject, label: 'Garde des commandes' })?.dismissed;
    for (const where of WHERE) {
      if (Array.isArray(saved?.[where])) out[where] = saved[where].filter((id) => typeof id === 'string').slice(-MAX_DISMISSED);
    }
    return out;
  }

  saveDismissed() {
    try {
      writeJsonAtomic(this.dataFile, { dismissed: this.dismissed });
    } catch (err) {
      console.error(`Garde des commandes : alertes fermées non enregistrées (${err.message})`);
    }
  }

  /** Historique du journal au démarrage (ou après un changement de dossier des journaux). */
  setHistory(events) {
    this.tracker = new LaunchTracker();
    for (const ev of events) this.tracker.apply(ev);
    return this.refresh();
  }

  /** Événement du journal en direct : relit le dossier au lancement, au chargement et à la fermeture du jeu. */
  event(ev) {
    return this.tracker.apply(ev) ? this.refresh() : null;
  }

  /** Sondage régulier : relit seulement si un fichier du dossier a changé, ou si le jeu s'est tu (ou a repris). */
  poll() {
    if (this.dirStamp() !== this.stamp || this.gameState().running !== this.status?.game?.running) this.refresh();
  }

  /**
   * Le jeu tourne-t-il ? Un lancement sans Shutdown ne suffit pas : un sur cinq finit sans (jeu planté, fermé
   * autrement). Il faut aussi un signe de vie depuis moins de GAME_SILENT_MS : un événement du lancement (Fileheader,
   * LoadGame), le journal actif ou Status.json écrits.
   * ended : 'shutdown' (fermé proprement), 'silence' (plus de nouvelles depuis endedAt), null (lancé, ou aucun lancement).
   */
  gameState() {
    const cur = this.tracker.current();
    if (!cur) return { launchedAt: null, running: null, endedAt: null, ended: null };
    const launchedAt = iso(cur.at);
    if (cur.shutdownAt != null) return { launchedAt, running: false, endedAt: iso(cur.shutdownAt), ended: 'shutdown' };
    let life = Math.max(cur.at, cur.loadedAt ?? -Infinity);
    const sign = this.lastSignOfLife();
    if (Number.isFinite(sign) && sign > life) life = sign;
    if (this.now() - life <= GAME_SILENT_MS) return { launchedAt, running: true, endedAt: null, ended: null };
    return { launchedAt, running: false, endedAt: iso(life), ended: 'silence' };
  }

  /** Empreinte des fichiers du dossier (noms, dates, tailles) : sans en lire le contenu. */
  dirStamp() {
    let names;
    try {
      names = fs.readdirSync(this.dir).sort();
    } catch {
      return 'absent';
    }
    return names.map((name) => {
      try {
        const st = fs.statSync(path.join(this.dir, name));
        return `${name}:${st.mtimeMs}:${st.size}`;
      } catch {
        return name;
      }
    }).join('|');
  }

  /** Contenu d'un fichier du dossier (Buffer), ou null s'il est absent, illisible ou trop gros. */
  readFile(name) {
    try {
      const file = path.join(this.dir, name);
      if (fs.statSync(file).size > MAX_READ) return null;
      return fs.readFileSync(file);
    } catch {
      return null;
    }
  }

  statFile(name) {
    try {
      return fs.statSync(path.join(this.dir, name));
    } catch {
      return null;
    }
  }

  /** Relit tout le dossier, recalcule l'état, ouvre ou ferme la fenêtre de l'overlay et prévient l'interface. */
  refresh() {
    this.stamp = this.dirStamp();
    const status = this.compute();
    this.status = status;
    this.overlay?.setExtra(PAGE, status.overlay);
    const { checkedAt, ...rest } = status;
    const key = JSON.stringify(rest);
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.broadcast('bindings:update', status);
    }
    return status;
  }

  compute() {
    const game = this.gameState();
    const base = {
      dir: this.dir, displayDir: this.displayDir, dirFound: false, game,
      log: null, level: 'ok', alert: null, banner: false, overlay: false,
      startPresets: null, profiles: [], backups: [], checkedAt: iso(this.now()),
    };
    let names;
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return base;
    }
    base.dirFound = true;

    // Profils personnels (.binds) et manettes qu'ils utilisent
    const profiles = [];
    const bindsData = new Map(); // nom du fichier → Buffer
    for (const name of names.filter((n) => BINDS_FILE.test(n))) {
      const buf = this.readFile(name);
      const st = this.statFile(name);
      if (!buf || !st) continue;
      bindsData.set(name, buf);
      const xml = decodeText(buf);
      profiles.push({
        file: name,
        preset: presetNameOf(xml, name),
        version: bindsVersion(name).join('.'),
        modifiedAt: iso(st.mtimeMs),
        devices: devicesInBinds(xml),
      });
    }

    // Profils choisis au démarrage : le fichier StartPreset le plus récent (StartPreset.4.start avant StartPreset.start)
    const startFile = names.filter((n) => START_PRESET_FILE.test(n))
      .sort((a, b) => Number(START_PRESET_FILE.exec(b)[1] || 0) - Number(START_PRESET_FILE.exec(a)[1] || 0))[0];
    if (startFile) {
      const buf = this.readFile(startFile);
      if (buf) {
        const categories = parseStartPreset(decodeText(buf)).map((c) => {
          // Profil personnel le plus récent de ce nom, sinon un profil fourni avec le jeu
          const own = profiles.filter((p) => p.preset === c.preset)
            .sort((a, b) => b.version.localeCompare(a.version, 'en', { numeric: true }))[0];
          return { ...c, file: own?.file || null, builtin: !own };
        });
        base.startPresets = { file: startFile, categories };
      }
    }

    // Sauvegardes du jeu (.backup), comparées au profil qu'elles sauvegardent
    base.backups = names.filter((n) => BACKUP_FILE.test(n)).map((name) => {
      const st = this.statFile(name);
      const profile = BACKUP_FILE.exec(name)[1];
      const own = bindsData.get(profile) ?? null;
      const buf = own ? this.readFile(name) : null;
      return {
        file: name,
        profile,
        modifiedAt: iso(st?.mtimeMs),
        size: st?.size ?? null,
        profileExists: Boolean(own),
        sameAsProfile: own && buf ? own.equals(buf) : null,
      };
    }).sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)));

    // Rapport d'erreurs du jeu, daté par rapport au lancement
    const logName = names.find((n) => n.toLowerCase() === ERROR_LOG.toLowerCase());
    const logStat = logName && this.statFile(logName);
    const logBuf = logName && this.readFile(logName);
    if (logStat && logBuf) {
      const text = decodeText(logBuf);
      const parsed = parseErrorLog(text);
      const concerns = concernsLaunch(logStat.mtimeMs, this.tracker);
      base.log = { file: logName, modifiedAt: iso(logStat.mtimeMs), concerns, ...parsed };
      // Manettes absentes : seulement d'après un rapport qui concerne ce lancement (ou dont on ne sait rien)
      const missing = new Set(concerns === 'previous' ? [] : parsed.missingDevices);
      for (const p of profiles) for (const d of p.devices) d.missing = missing.has(d.id);

      if (parsed.lines.length && concerns !== 'previous') {
        const kind = kindOf(parsed);
        const id = crypto.createHash('sha1').update(`${logStat.mtimeMs}:${text}`).digest('hex').slice(0, 12);
        // Sauvegarde à indiquer : celle du profil cité par le rapport, sinon la plus récente
        const backup = base.backups.find((b) => parsed.presetFiles.includes(b.profile)) || base.backups[0] || null;
        base.level = LEVEL[kind];
        base.alert = {
          id,
          kind,
          ...alertTexts(kind, parsed, game.running),
          backup: backup?.file || null,
          backupsHint: backup
            ? `Sauvegarde du jeu : ${backup.file}, dans ${this.displayDir}.`
            : `Aucune sauvegarde .backup dans ${this.displayDir}.`,
        };
        const serious = base.level !== 'info';
        base.banner = serious && !this.dismissed.banner.includes(id);
        base.overlay = serious && concerns === 'current' && game.running === true && !this.dismissed.overlay.includes(id);
      }
    }
    for (const p of profiles) for (const d of p.devices) d.missing ??= false;
    base.profiles = profiles;
    return base;
  }

  /**
   * Ferme l'alerte en cours dans la fenêtre de l'overlay ou dans le bandeau de l'app.
   * @param id identifiant de l'alerte vue par l'interface : si elle a changé entre-temps, rien n'est fermé
   * @returns l'état, ou null si where est inconnu
   */
  dismiss(where, id) {
    if (!WHERE.includes(where)) return null;
    const alert = this.status?.alert;
    if (alert && (id == null || id === alert.id) && !this.dismissed[where].includes(alert.id)) {
      this.dismissed[where] = [...this.dismissed[where], alert.id].slice(-MAX_DISMISSED);
      this.saveDismissed();
    }
    return this.refresh();
  }
}
