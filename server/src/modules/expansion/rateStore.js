// Données gardées par « Mérites par heure active », en fichiers JSON du module dans server/data, écrits d'un bloc
// (fichier temporaire puis renommage : jamais de fichier à moitié écrit) :
//   - les modificateurs et changements de règles saisis à la main, avec leur source et leur date ;
//   - les minutes où tu as joué d'après Status.json : core/activity.js ne garde que 3 jours, et sans elles le temps
//     actif des journaux plus anciens serait recalculé plus court à chaque redémarrage.

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readJsonFile, writeJsonAtomicSync } from '../../core/atomic.js';

export const STATUSES = ['mesurée', 'publiée', 'à vérifier'];
/** modifier : un modificateur de mérites ; rules : un changement de règles (les rendements repartent de sa date). */
export const KINDS = ['modifier', 'rules'];
export const MAX_MODIFIERS = 200;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MINUTE_MS = 60_000;
export const MARKS_KEEP_MS = 366 * 24 * 3600 * 1000; // un an de minutes jouées, quelques centaines de Ko au plus

/** Écrit tout le fichier d'un coup : le fichier temporaire remplace l'ancien une fois complet. */
export function writeJsonAtomic(file, data) {
  writeJsonAtomicSync(file, data); // core/atomic.js
}

function readJson(file, fallback) {
  // Pas encore de fichier : on repart de zéro ; illisible : mis de côté d'abord (core/atomic.js), jamais écrasé sans copie
  return readJsonFile(file, { fallback, label: `Projet extension (${path.basename(file)})` });
}

const text = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '').trim().slice(0, max);

/** « 2025-12-02 » : une vraie date, entre 2014 (sortie du jeu) et 2100. */
export function validDate(v) {
  const m = DATE.exec(typeof v === 'string' ? v : '');
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() >= 2014 && d.getUTCFullYear() <= 2100 && d.toISOString().slice(0, 10) === v;
}

/**
 * Modificateur saisi, nettoyé : { value } ou { error } (message en français).
 * Libellé et date obligatoires ; le statut est « à vérifier » s'il n'est pas donné.
 */
export function cleanModifier(body) {
  const b = body && typeof body === 'object' ? body : {};
  const kind = b.kind == null || b.kind === '' ? 'modifier' : b.kind;
  if (!KINDS.includes(kind)) return { error: 'Type inconnu : modificateur ou changement de règles.' };
  const status = b.status == null || b.status === '' ? 'à vérifier' : b.status;
  if (!STATUSES.includes(status)) return { error: 'Statut inconnu : mesurée, publiée ou à vérifier.' };
  const label = text(b.label, 200);
  if (!label) return { error: 'Décris le modificateur.' };
  const date = text(b.date, 10);
  if (!validDate(date)) return { error: 'Date invalide : AAAA-MM-JJ.' };
  return {
    value: {
      kind,
      label,
      date,
      status,
      effect: text(b.effect, 40),
      scope: text(b.scope, 80),
      system: kind === 'modifier' ? text(b.system, 120) : '',
      source: text(b.source, 300),
      note: text(b.note, 500),
    },
  };
}

/** Modificateurs saisis, par identifiant (donné par le serveur). */
export class ModifierStore {
  constructor(file) {
    this.file = file;
    this.items = new Map();
    const saved = readJson(file, []);
    for (const m of Array.isArray(saved) ? saved : []) {
      const c = cleanModifier(m);
      if (c.value && typeof m.id === 'string' && m.id) this.items.set(m.id, { id: m.id, ...c.value, createdAt: text(m.createdAt, 40) });
    }
  }

  list() {
    return [...this.items.values()];
  }

  /** @returns { value } (le modificateur enregistré) ou { error } */
  add(body) {
    if (this.items.size >= MAX_MODIFIERS) return { error: `${MAX_MODIFIERS} modificateurs au plus : supprimes-en d'abord.` };
    const c = cleanModifier(body);
    if (c.error) return c;
    const item = { id: randomUUID(), ...c.value, createdAt: new Date().toISOString() };
    const next = new Map(this.items).set(item.id, item);
    writeJsonAtomic(this.file, [...next.values()]); // en cas d'échec, rien ne change en mémoire non plus
    this.items = next;
    return { value: item };
  }

  /** @returns false si l'identifiant est inconnu */
  remove(id) {
    const key = String(id);
    if (!this.items.has(key)) return false;
    const next = new Map(this.items);
    next.delete(key);
    writeJsonAtomic(this.file, [...next.values()]);
    this.items = next;
    return true;
  }
}

/** Minutes où une action a été vue dans Status.json, gardées un an (rejouées comme des actions au démarrage). */
export class ActionMarks {
  constructor(file, { now = Date.now(), keepMs = MARKS_KEEP_MS } = {}) {
    this.file = file;
    this.keepMs = keepMs;
    this.dirty = false;
    const saved = readJson(file, []);
    const oldest = Math.floor((now - keepMs) / MINUTE_MS);
    this.minutes = new Set((Array.isArray(saved) ? saved : []).filter((m) => Number.isInteger(m) && m >= oldest));
  }

  add(t) {
    if (!Number.isFinite(t)) return;
    const m = Math.floor(t / MINUTE_MS);
    if (this.minutes.has(m)) return;
    this.minutes.add(m);
    this.dirty = true;
  }

  merge(times = []) {
    for (const t of times) this.add(t);
  }

  /** Instants (ms, début de chaque minute), du plus ancien au plus récent. */
  times() {
    return [...this.minutes].sort((a, b) => a - b).map((m) => m * MINUTE_MS);
  }

  /** Écrit le fichier s'il y a du nouveau ; une erreur d'écriture est signalée et retentée plus tard. */
  flush(now = Date.now()) {
    if (!this.dirty) return;
    const oldest = Math.floor((now - this.keepMs) / MINUTE_MS);
    for (const m of this.minutes) if (m < oldest) this.minutes.delete(m);
    try {
      writeJsonAtomic(this.file, [...this.minutes].sort((a, b) => a - b));
      this.dirty = false;
    } catch (err) {
      console.error(`Mérites par heure : minutes jouées non enregistrées (${err.message})`);
    }
  }
}
