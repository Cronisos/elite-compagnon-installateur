// Utilitaires de lecture des fichiers du journal Elite Dangerous.
// Les fichiers du jeu sont uniquement LUS, jamais modifiés.

import fs from 'node:fs';
import path from 'node:path';
import { cleanLocalisedFields } from './text.js';

// Dossier des journaux (par défaut, imposé par le banc de contrôle) : core/paths.js.

// Format actuel : Journal.2026-10-27T181355.01.log
const JOURNAL_RE = /^Journal\.(\d{4}-\d{2}-\d{2}T\d{6})\.(\d{2})\.log$/;
// Ancien format (avant 2022) : Journal.221027181355.01.log
const LEGACY_RE = /^Journal\.(\d{12})\.(\d{2})\.log$/;

/**
 * Clé de tri d'un nom de fichier journal (null si ce n'en est pas un) : AAAAMMJJhhmmss.NN. Le jeu écrit ce nom à
 * l'heure LOCALE du PC : elle ne sert qu'à départager deux journaux de même heure de début (voir listJournals).
 */
export function journalSortKey(fileName) {
  let m = JOURNAL_RE.exec(fileName);
  if (m) return `${m[1].replace(/[-T]/g, '')}.${m[2]}`;
  m = LEGACY_RE.exec(fileName);
  if (m) return `20${m[1]}.${m[2]}`;
  return null;
}

/**
 * Heure (ms) lue dans le nom, à l'heure locale de ce PC : approximative, et ambiguë la nuit du passage à l'heure
 * d'hiver (l'heure de 2 h à 3 h passe deux fois). Sert seulement tant que le journal n'a pas sa première ligne.
 */
export function journalNameTime(fileName) {
  const key = journalSortKey(fileName);
  if (!key) return null;
  const n = (a, b) => Number(key.slice(a, b));
  const t = new Date(n(0, 4), n(4, 6) - 1, n(6, 8), n(8, 10), n(10, 12), n(12, 14)).getTime();
  return Number.isFinite(t) ? t : null;
}

const HEAD_BYTES = 16 * 1024; // un Fileheader fait environ 200 octets

/**
 * Heure (ms, UTC) de la première ligne du journal : le Fileheader, écrit dès la création, porte un « timestamp » en UTC.
 * null si le fichier est illisible ou vide, ou si sa première ligne n'est pas encore terminée.
 */
export function journalStartTime(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(HEAD_BYTES);
    const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0);
    const end = buf.subarray(0, n).indexOf(0x0a);
    if (end < 0) return null;
    const ev = JSON.parse(buf.subarray(0, end).toString('utf8').replace(/^﻿/, '').trim());
    const t = typeof ev?.timestamp === 'string' ? Date.parse(ev.timestamp) : NaN;
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Liste les journaux du dossier, du plus ancien au plus récent (chemins complets), d'après l'heure UTC de leur
 * première ligne ; le nom ne fait que départager. Le jeu nomme ses journaux à l'heure LOCALE : la nuit du passage à
 * l'heure d'hiver, une séance lancée à 2 h 10 (heure d'hiver) portait un nom plus « ancien » que celle de 2 h 30 (heure
 * d'été), lancée avant elle. Triée par le nom, la nouvelle séance n'était jamais suivie, et l'historique était relu
 * dans le désordre. Un journal sans première ligne encore (créé à l'instant) est placé d'après son nom.
 * @param {string} dir
 * @param {object} [o]
 * @param {Map<string, number>} [o.starts] heures de début déjà lues (le service garde la sienne : la première ligne
 *   d'un journal ne change plus, elle n'est lue qu'une fois)
 * @param {Map<string, string>} [o.misses] journaux sans première ligne lisible (vides, première ligne abîmée) →
 *   « mtime:taille » : pas rouverts tant que ni l'un ni l'autre ne change. Avant, un journal vide était rouvert et
 *   analysé deux fois par seconde, sans fin (et l'antivirus sollicité à chaque fois).
 */
export function listJournals(dir, { starts = null, misses = null } = {}) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const list = [];
  for (const name of names) {
    const key = journalSortKey(name);
    if (!key) continue;
    const file = path.join(dir, name);
    let start = starts?.get(file) ?? null;
    if (start === null) {
      let stamp = null;
      if (misses) {
        try {
          const st = fs.statSync(file);
          stamp = `${st.mtimeMs}:${st.size}`;
        } catch {
          stamp = null;
        }
      }
      if (stamp === null || misses.get(file) !== stamp) {
        start = journalStartTime(file);
        if (start !== null) {
          starts?.set(file, start);
          misses?.delete(file);
        } else if (stamp !== null) {
          misses.set(file, stamp);
        }
      }
    }
    list.push({ file, key, time: start ?? journalNameTime(name) ?? 0 });
  }
  // Journaux disparus (dossier changé, fichiers déplacés) : oubliés
  for (const cache of [starts, misses]) {
    if (!cache || cache.size <= list.length + 100) continue;
    const present = new Set(list.map((x) => x.file));
    for (const f of [...cache.keys()]) if (!present.has(f)) cache.delete(f);
  }
  return list.sort((a, b) => a.time - b.time || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map((x) => x.file);
}

const EVENT_NAME_RE = /"event"\s*:\s*"([A-Za-z0-9_]+)"/;

/**
 * Découpe un texte en événements JSON. Si `interest` est fourni (Set de noms),
 * seules ces lignes sont analysées : on évite de parser des milliers de lignes inutiles.
 */
export function parseLines(text, interest) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    if (interest) {
      const m = EVENT_NAME_RE.exec(line);
      if (!m || !interest.has(m[1])) continue;
    }
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue; // ligne incomplète ou corrompue : ignorée
    }
    // Un événement est un objet : « null », un nombre, un texte ou un tableau seuls ne sont pas des lignes du jeu (ils
    // faisaient échouer la lecture de tout le lot, avant même les modules)
    if (ev === null || typeof ev !== 'object' || Array.isArray(ev)) continue;
    out.push(line.includes('Localised') ? cleanLocalisedFields(ev) : ev); // textes traduits propres : core/text.js
  }
  return out;
}

/** Lit un fichier JSON d'état (Status.json, Market.json…). Renvoie null si illisible. */
export function readJsonFile(file) {
  try {
    const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
    if (!text.trim()) return null;
    return cleanLocalisedFields(JSON.parse(text)); // textes traduits propres (Market.json…) : core/text.js
  } catch {
    return null; // fichier en cours d'écriture par le jeu : on réessaiera
  }
}
