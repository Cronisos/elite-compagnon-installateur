// Base SQLite neuve pour le serveur isolé : le schéma du projet (server/prisma/schema) appliqué par ses migrations
// versionnées (server/prisma/migrations), exactement comme au lancement de l'app (server/dbPush.mjs), mais sur un fichier
// temporaire. Le schéma est copié tel quel, et un
// prisma.config.mjs posé à côté donne l'adresse de la base (Prisma 7 : plus d'adresse dans le schéma) : jamais
// server/data/elite.db.
//
// Une base est créée une fois par lancement du banc (baseModele), puis copiée pour chaque serveur (copierBase).
// appliquerSchema fait la même chose sur une base existante (copie d'une vraie base : étape « base de données »), et
// compterTables relit une base en lecture seule.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SERVEUR } from './chemins.mjs';

const SCHEMA = path.join(SERVEUR, 'prisma', 'schema');
const MIGRATIONS = path.join(SERVEUR, 'prisma', 'migrations');
const DBPUSH = path.join(SERVEUR, 'dbPush.mjs');
const URL_LIGNE = /^\s*url\s*=/m;

/** Adresse Prisma (SQLite) d'un fichier : file:C:/…/elite.db. */
export const adresseBase = (fichier) => `file:${path.resolve(fichier).replace(/\\/g, '/')}`;

/**
 * Copie le schéma du projet dans `dossier`/schema, et écrit à côté `dossier`/prisma.config.mjs : ce schéma, et la base
 * `fichier` (jamais server/data/elite.db). Rend le chemin de cette configuration (prisma … --config).
 */
export function copierSchema(fichier, dossier) {
  fs.mkdirSync(dossier, { recursive: true });
  const schema = path.join(dossier, 'schema');
  fs.rmSync(schema, { recursive: true, force: true });
  fs.cpSync(SCHEMA, schema, { recursive: true });
  const principal = path.join(schema, 'schema.prisma');
  if (URL_LIGNE.test(fs.readFileSync(principal, 'utf8'))) throw new Error(`Schéma Prisma inattendu : une adresse de base y est revenue (${principal}) ; Prisma 7 la prend dans prisma.config.mjs.`);
  const config = path.join(dossier, 'prisma.config.mjs');
  // Objet simple (sans defineConfig) : ce dossier temporaire n'a pas de node_modules d'où importer prisma/config
  const migrations = MIGRATIONS.replace(/\\/g, '/');
  fs.writeFileSync(config, `export default ${JSON.stringify({ schema: schema.replace(/\\/g, '/'), migrations: { path: migrations }, datasource: { url: adresseBase(fichier) } }, null, 2)};\n`);
  return config;
}

/**
 * Met `fichier` (un elite.db, créé s'il manque) au schéma du projet par la mise à jour de l'app elle-même
 * (server/dbPush.mjs, sans générer le client) : migrations versionnées, et reprise d'une base d'avant les migrations
 * (copie d'une vraie base : étape « base de données »). Une migration qui échoue remet la base d'avant et c'est une
 * erreur. Réseau coupé pour Prisma (CHECKPOINT_DISABLE). `dossier` : non utilisé (gardé pour les appelants).
 * @returns {string} la sortie de la mise à jour
 */
export function appliquerSchema(fichier, dossier) { // eslint-disable-line no-unused-vars
  if (path.basename(fichier) !== 'elite.db') throw new Error(`Base attendue sous le nom elite.db (dossier des données), pas « ${fichier} ».`);
  const r = spawnSync(process.execPath, [DBPUSH, '--sans-generate'], {
    cwd: SERVEUR,
    encoding: 'utf8',
    env: { ...process.env, ELITE_DATA_DIR: path.dirname(path.resolve(fichier)), CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1', NO_COLOR: '1', DATABASE_URL: '' },
    timeout: 180_000,
  });
  const sortie = `${r.stdout || ''}${r.stderr || ''}`.trim();
  if (r.status !== 0 || !fs.existsSync(fichier)) {
    throw new Error(`schéma non appliqué (server/dbPush.mjs, code ${r.status ?? r.signal}) :\n${sortie.slice(-2000)}`);
  }
  return sortie;
}

/** Crée dans `dossier` une base vide au schéma du projet ; renvoie le chemin du fichier. */
export function baseModele(dossier) {
  const fichier = path.join(dossier, 'elite.db');
  fs.mkdirSync(dossier, { recursive: true });
  fs.rmSync(fichier, { force: true });
  try {
    appliquerSchema(fichier, dossier);
  } catch (err) {
    throw new Error(`Base de test non créée : ${err.message}`);
  }
  return fichier;
}

/** Copie la base modèle à l'endroit attendu par ELITE_DATA_DIR (dossier des données/elite.db). */
export function copierBase(modele, dossierDonnees) {
  fs.mkdirSync(dossierDonnees, { recursive: true });
  const cible = path.join(dossierDonnees, 'elite.db');
  fs.copyFileSync(modele, cible);
  return cible;
}

/** node:sqlite, chargé seulement quand on s'en sert. */
const sqlite = () => process.getBuiltinModule('node:sqlite');

/** Nombre de lignes de chaque table d'une base SQLite, ouverte en lecture seule : { table: n }, tables par ordre de nom. */
export function compterTables(fichier) {
  const db = new (sqlite().DatabaseSync)(fichier, { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
    return Object.fromEntries(tables.map((t) => [t, Number(db.prepare(`SELECT COUNT(*) AS n FROM "${String(t).replace(/"/g, '""')}"`).get().n)]));
  } finally {
    db.close();
  }
}

/**
 * Vérifie une base (PRAGMA quick_check) ; rend 'ok' ou le premier problème. Ouverte en écriture : à ne faire que sur une
 * COPIE (un journal de transaction copié avec elle y est alors rejoué, comme SQLite le ferait).
 */
export function verifierBase(fichier) {
  const db = new (sqlite().DatabaseSync)(fichier);
  try {
    const lignes = db.prepare('PRAGMA quick_check').all().map((r) => Object.values(r)[0]);
    return lignes.length === 1 && lignes[0] === 'ok' ? 'ok' : String(lignes[0] ?? 'aucune réponse');
  } finally {
    db.close();
  }
}
