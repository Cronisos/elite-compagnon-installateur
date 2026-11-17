// Lecture des fichiers de commandes du jeu (texte déjà lu) : rapport d'erreurs, profils choisis au démarrage,
// manettes utilisées par un profil. Fonctions pures, sans accès disque.

import {
  BINDS_FILE, BUILTIN_DEVICES, LOG_LINES, MISSING_DEVICES_SEPARATOR, START_PRESET_CATEGORIES,
} from './rules.js';
// Noms tirés des fichiers du jeu (profil, manettes, commandes) : cleanText (core/text.js) décode les entités, dont
// celles des attributs XML du .binds (« Joueur&apos;s X52 » → « Joueur's X52 »). Les lignes du rapport restent brutes.
import { cleanText } from '../../core/text.js';

/** Texte d'un fichier du jeu : UTF-16 (avec BOM) ou UTF-8, BOM retiré. */
export function decodeText(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  const text = buf.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const unique = (list) => [...new Set(list)];

/**
 * Rapport BindingLoadingErrors.log, ligne par ligne.
 * @returns {{ lines: string[], entries: { line: string, kind: string }[], presetFiles: string[], missingDevices: string[],
 *   duplicates: string[], other: string[] }}
 *   kind : 'missing-devices', 'preset-errors', 'duplicate' ou 'other' ; other : lignes que l'app ne connaît pas
 *   (à prendre au sérieux).
 */
export function parseErrorLog(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const entries = [];
  const presetFiles = [];
  const missingDevices = [];
  const duplicates = [];
  const other = [];
  for (const line of lines) {
    let m;
    let kind = 'other';
    if ((m = LOG_LINES.missingDevices.exec(line))) {
      kind = 'missing-devices';
      missingDevices.push(...m[1].split(MISSING_DEVICES_SEPARATOR).map(cleanText).filter(Boolean));
    } else if ((m = LOG_LINES.presetErrors.exec(line))) {
      kind = 'preset-errors';
      presetFiles.push(cleanText(m[1]));
    } else if ((m = LOG_LINES.duplicate.exec(line))) {
      kind = 'duplicate';
      duplicates.push(cleanText(m[1]));
    } else other.push(line);
    entries.push({ line, kind });
  }
  return {
    lines,
    entries,
    presetFiles: unique(presetFiles),
    missingDevices: unique(missingDevices),
    duplicates: unique(duplicates),
    other,
  };
}

/**
 * StartPreset*.start : un nom de profil par ligne, une ligne par catégorie de commandes.
 * @returns {{ label: string, preset: string }[]}
 */
export function parseStartPreset(text) {
  const names = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // Une seule ligne (avant Odyssey) : le même profil pour tout
  if (names.length === 1) return [{ label: 'Toutes les commandes', preset: names[0] }];
  return names.map((preset, i) => ({ label: START_PRESET_CATEGORIES[i] || `Catégorie ${i + 1}`, preset }));
}

/**
 * Manettes utilisées par un profil .binds (XML) : nombre d'attributs Device= par manette, clavier, souris et
 * « {NoDevice} » exclus. Plus utilisée d'abord.
 * @returns {{ id: string, count: number }[]}
 */
export function devicesInBinds(xml) {
  const counts = new Map(); // identifiant de manette → nombre de commandes (Map : identifiant venu du fichier)
  // Valeur bornée (un identifiant de manette fait une vingtaine de caractères) : une valeur démesurée, piégée, est
  // ignorée au lieu d'être décodée
  for (const m of String(xml || '').matchAll(/\bDevice="([^"]{0,100})"/g)) {
    const id = cleanText(m[1]);
    if (!id || BUILTIN_DEVICES.has(id)) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

/**
 * Nom du profil d'un .binds : attribut PresetName de la racine, sinon tiré du nom du fichier.
 * En temps linéaire : chaque balise « <Root » est cherchée puis fermée par indexOf, et PresetName n'est cherché que dans
 * elle, avec une valeur bornée. L'ancienne expression (<Root\b[^>]*…) revenait en arrière jusqu'au bout du texte pour
 * chaque « <Root » sans « > » : un profil partagé piégé de 1 Mo bloquait tout le serveur pendant des minutes.
 */
export function presetNameOf(xml, file) {
  const text = String(xml || '');
  for (let i = text.indexOf('<Root'); i >= 0; i = text.indexOf('<Root', i + 1)) {
    if (/[\w-]/.test(text[i + 5] || '')) continue; // <RootX : une autre balise
    const end = text.indexOf('>', i);
    if (end < 0) break; // plus aucune balise fermée après : rien à trouver plus loin
    const m = /\bPresetName="([^"]{0,200})"/.exec(text.slice(i, end));
    if (m) {
      const name = cleanText(m[1]);
      if (name) return name;
    }
    i = end; // les « <Root » d'une même balise ne sont pas relus
  }
  const f = BINDS_FILE.exec(file || '');
  return f ? f[1] : null;
}

/** Version d'un fichier .binds (« Custom.4.2.binds » → [4, 2]), pour garder la plus récente d'un profil. */
export function bindsVersion(file) {
  const m = BINDS_FILE.exec(file || '');
  return m ? [Number(m[2]), Number(m[3])] : [0, 0];
}

/** « A », « A et B », « A, B et C ». */
export function frenchList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} et ${items.at(-1)}`;
}
