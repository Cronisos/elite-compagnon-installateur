// Dossiers de l'application : le SEUL endroit où ils sont décidés. Les modules et le cœur demandent ici où lire et
// écrire, au lieu de calculer un chemin à partir de leur propre fichier.
//
// Trois dossiers, chacun réglable par une variable d'environnement (banc de contrôle, future version Electron qui
// rangera les données dans %APPDATA%) ; sans variable, le comportement est celui d'avant, à l'octet près :
//   - données de l'app      ELITE_DATA_DIR          défaut : server/data (base elite.db comprise)
//   - journaux du jeu       ELITE_JOURNAL_DIR       défaut : le réglage du joueur (page Paramètres), sinon
//                                                   %USERPROFILE%\Saved Games\Frontier Developments\Elite Dangerous
//   - options du jeu        ELITE_GAME_OPTIONS_DIR  défaut : %LOCALAPPDATA%\Frontier Developments\Elite Dangerous\Options
//                                                   (Bindings et Graphics en dessous)
//   - sauvegardes du joueur ELITE_SAUVEGARDES_DIR   défaut : %USERPROFILE%\Documents\Elite Compagnon - sauvegardes
//
// Une variable vide compte comme absente. Une valeur doit être un chemin absolu de ce PC : un chemin relatif
// (qui dépendrait du dossier de lancement), réseau (\\serveur\partage) ou de périphérique (\\?\, \\.\) arrête le
// serveur au démarrage avec un message clair, plutôt que d'écrire ailleurs que prévu.

import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Dossier server/ du projet (le code, jamais les données du joueur quand ELITE_DATA_DIR est réglé). */
export const SERVER_DIR = fileURLToPath(new URL('../../', import.meta.url));
/** Dossier des données par défaut : server/data. */
export const DEFAULT_DATA_DIR = path.join(SERVER_DIR, 'data');
/** Nom de la base SQLite dans le dossier des données (schéma Prisma : file:../../data/elite.db, le même fichier). */
export const DATABASE_FILE = 'elite.db';
/** Sous-dossiers des options du jeu, sous %LOCALAPPDATA% (mesuré le 7 nov. 2026 : Options\Bindings et Options\Graphics). */
export const GAME_OPTIONS_SUBDIR = ['Frontier Developments', 'Elite Dangerous', 'Options'];
/** Dossier des journaux du jeu, sous le dossier de l'utilisateur. */
export const JOURNAL_SUBDIR = ['Saved Games', 'Frontier Developments', 'Elite Dangerous'];

/** Chemin réseau (\\serveur\partage, //serveur/partage) ou de périphérique Windows (\\?\, \\.\, \??\). */
export function isNetworkOrDevicePath(p) {
  const s = String(p).trim();
  return /^[\\/]{2}/.test(s) || /^[\\/]\?\?[\\/]/.test(s);
}

/** Valeur d'une variable de dossier : null si absente ou vide, sinon chemin absolu vérifié. */
export function envDir(env, name) {
  const raw = env?.[name];
  if (raw == null || String(raw).trim() === '') return null;
  const value = String(raw).trim();
  if (isNetworkOrDevicePath(value)) {
    throw new Error(`${name} refusé : « ${value} » est un chemin réseau ou de périphérique. Indique un dossier de ce PC.`);
  }
  if (!path.isAbsolute(value) || (process.platform === 'win32' && !/^[a-zA-Z]:[\\/]/.test(value))) {
    throw new Error(`${name} refusé : « ${value} » n'est pas un chemin absolu (par exemple C:\\Dossier).`);
  }
  return path.resolve(value);
}

// --- Données de l'application ---

/** Dossier des données de l'app (fichiers JSON des modules, captures, images, données de référence, base). */
export function dataDir(env = process.env) {
  return envDir(env, 'ELITE_DATA_DIR') ?? DEFAULT_DATA_DIR;
}

/** Chemin d'un fichier ou dossier sous le dossier des données : dataPath('colonisation.json'). */
export function dataPath(...parts) {
  return path.join(dataDir(), ...parts);
}

/** Données de référence téléchargées (coriolis-data, FDevIDs, EDSY, images). */
export function referenceDir(env = process.env) {
  return path.join(dataDir(env), 'reference');
}

/**
 * Adresse de la base (SQLite) : elite.db du dossier des données (server/data, ou ELITE_DATA_DIR), en file: absolue à
 * barres obliques. Depuis Prisma 7, le schéma ne porte plus d'adresse : le client (adaptateur better-sqlite3, index.js)
 * et la CLI (server/prisma.config.mjs : db push, generate) la prennent toutes deux ici, donc toujours la même base.
 */
export function databaseFileUrl(env = process.env) {
  return databaseUrl(path.join(dataDir(env), DATABASE_FILE));
}

/** Adresse Prisma (SQLite) d'un fichier de base. */
export function databaseUrl(file) {
  return `file:${path.resolve(file).replace(/\\/g, '/')}`;
}

// --- Journaux du jeu ---

/** Dossier des journaux imposé par ELITE_JOURNAL_DIR (banc de contrôle), ou null. */
export function journalDirOverride(env = process.env) {
  return envDir(env, 'ELITE_JOURNAL_DIR');
}

/** Clé de Windows des dossiers connus de l'utilisateur, et identifiant de « Parties enregistrées » (FOLDERID_SavedGames). */
export const SHELL_FOLDERS_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders';
export const SAVED_GAMES_ID = '{4C5C32FF-BB9D-43b0-B5B4-2D72E54EAAA4}';

/**
 * Valeur lue dans la sortie de « reg query <clé> /v <nom> » (« <nom>    REG_EXPAND_SZ    %USERPROFILE%\… »), avec
 * les %VARIABLES% remplacées par celles de `env` (une variable inconnue laisse la valeur inutilisable : null). Ou null.
 */
export function parseRegValue(output, name, env = process.env) {
  const line = String(output || '').split(/\r?\n/).find((l) => l.trim().toLowerCase().startsWith(name.toLowerCase()));
  const m = line && /\sREG_(?:EXPAND_)?SZ\s+(.+?)\s*$/.exec(line);
  if (!m) return null;
  let ok = true;
  const lower = Object.fromEntries(Object.entries(env || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const value = m[1].replace(/%([^%]+)%/g, (all, v) => {
    const got = lower[v.toLowerCase()];
    if (got == null || got === '') ok = false;
    return got ?? all;
  });
  return ok ? value : null;
}

/**
 * Ligne de commande de cmd.exe qui lit la valeur avec reg.exe, sortie en UTF-8. Dans un tube, reg.exe écrit dans la
 * page de codes OEM de la console (850 en France) : lue en UTF-8, « Données » deviendrait « Donn\uFFFDes ». « chcp
 * 65001 » passe d'abord en UTF-8 la console de ce cmd.exe : une console à lui, cachée, car il n'hérite d'aucune
 * entrée ni sortie (Node le lance alors avec CREATE_NO_WINDOW) ; celle du joueur, ou le terminal de npm run dev, ne
 * change pas. Clé et identifiant sont des constantes : rien d'extérieur n'entre dans cette ligne.
 */
export const REG_COMMAND = `/d /s /c "chcp 65001 >nul & reg query "${SHELL_FOLDERS_KEY}" /v ${SAVED_GAMES_ID}"`;

/**
 * Dossier « Parties enregistrées » de Windows (FOLDERID_SavedGames), lu dans le registre : il peut être déplacé
 * (Propriétés › Emplacement, vers D:\Jeux par exemple), et le jeu y écrit alors ses journaux. null hors de Windows,
 * si la valeur manque (dossier jamais déplacé), si elle est réseau ou relative, si elle a été mal décodée (caractère
 * U+FFFD : chcp sans effet, par exemple), ou si le registre ne répond pas. Le dossier proposé est enregistré dans les
 * réglages au premier lancement : mieux vaut alors le dossier de l'utilisateur qu'un chemin abîmé.
 */
export function savedGamesDir(env = process.env, { exec = execFileSync, platform = process.platform } = {}) {
  if (platform !== 'win32') return null;
  try {
    // stdin et stderr 'ignore', jamais 'inherit' : voir REG_COMMAND (console à part, cachée)
    const out = exec('cmd.exe', [REG_COMMAND], { encoding: 'utf8', timeout: 5000, windowsHide: true, windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const dir = parseRegValue(out, SAVED_GAMES_ID, env);
    if (!dir || dir.includes('\uFFFD') || isNetworkOrDevicePath(dir) || !/^[a-zA-Z]:[\\/]/.test(dir)) return null;
    return path.win32.resolve(dir);
  } catch {
    return null; // valeur absente (reg sort en erreur) : dossier à sa place d'origine
  }
}

/**
 * Dossier des journaux proposé au premier lancement (réglage enregistré ensuite dans la base) : ELITE_JOURNAL_DIR,
 * sinon sous « Parties enregistrées » tel que Windows le connaît (déplacé ou non), sinon sous le dossier de l'utilisateur.
 * @param {object} [o] tests : savedGames (lecture du registre remplacée)
 */
export function defaultJournalDir(env = process.env, { savedGames = savedGamesDir } = {}) {
  const own = journalDirOverride(env);
  if (own) return own;
  const moved = savedGames(env);
  if (moved) return path.join(moved, ...JOURNAL_SUBDIR.slice(1));
  return path.join(os.homedir(), ...JOURNAL_SUBDIR);
}

/** Dossier des journaux réellement lu : ELITE_JOURNAL_DIR s'il est réglé, sinon le réglage du joueur. */
export function journalDir(settingPath, env = process.env) {
  return journalDirOverride(env) ?? settingPath;
}

// --- Sauvegardes du joueur (Paramètres › Mon compte), hors du dossier de l'app ---

/** Nom du dossier des sauvegardes, dans Documents (desktop/donnees.js doit garder le même). */
export const NOM_DOSSIER_SAUVEGARDES = 'Elite Compagnon - sauvegardes';

/**
 * Dossier des sauvegardes : ELITE_SAUVEGARDES_DIR s'il est réglé (banc de contrôle : jamais les vrais Documents du PC),
 * sinon Documents du compte Windows (jamais le dossier de l'app).
 */
export function dossierSauvegardes(env = process.env, home = os.homedir()) {
  return envDir(env, 'ELITE_SAUVEGARDES_DIR') ?? path.join(env.USERPROFILE || home, 'Documents', NOM_DOSSIER_SAUVEGARDES);
}

// --- Programmes installés à part pour l'IA de bord (Whisper, sherpa-onnx), dans %LOCALAPPDATA%\Programs ---

/** Dossier des programmes de l'utilisateur (%LOCALAPPDATA%\Programs), où Windows range ce qui s'installe sans droits. */
export function programmesDir(env = process.env) {
  return path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs');
}

// --- Options du jeu (lecture seule, sauf GraphicsConfigurationOverride.xml par le module des couleurs) ---

/** Dossier Options du jeu. */
export function gameOptionsDir(env = process.env) {
  const own = envDir(env, 'ELITE_GAME_OPTIONS_DIR');
  if (own) return own;
  const local = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(local, ...GAME_OPTIONS_SUBDIR);
}

/** Le même, tel qu'on l'affiche au joueur (%LOCALAPPDATA%\… sans son nom d'utilisateur), avec un sous-dossier. */
export function gameOptionsDisplay(sub, env = process.env) {
  const own = envDir(env, 'ELITE_GAME_OPTIONS_DIR');
  const base = own ?? ['%LOCALAPPDATA%', ...GAME_OPTIONS_SUBDIR].join('\\');
  return sub ? `${base}\\${sub}` : base;
}

/** Sous-dossier des options du jeu : gameOptionsPath('Bindings'), gameOptionsPath('Graphics'). */
export function gameOptionsPath(sub, env = process.env) {
  return path.join(gameOptionsDir(env), sub);
}
