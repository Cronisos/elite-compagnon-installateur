// Mise à jour de la base au lancement (predev de npm run dev, et l'app de bureau à chaque démarrage), par les
// migrations versionnées de prisma/migrations (une par version de l'app qui change le schéma, appliquées dans l'ordre :
// prisma migrate deploy), SANS la télémétrie de Prisma. Lancée telle quelle, la CLI Prisma envoie à chaque commande, par un processus détaché, un GET à
// checkpoint.prisma.io avec un identifiant persistant du PC, les hachés du projet, la commande, l'OS et la version de
// Node : hors de la passerelle réseau de l'app (core/net.js) et malgré ELITE_NO_NETWORK. CHECKPOINT_DISABLE la coupe
// (vérifié : aucune requête). Les arguments en plus passent à la CLI (node dbPush.mjs --help).
//
// Sur la base de l'app (elite.db du dossier des données, core/paths.js) :
//   - schéma et migrations inchangés (même empreinte : fichiers du schéma, migrations, configuration, version de
//     Prisma), base présente et client déjà généré : rien n'est lancé (aucun processus de la CLI, aucune écriture dans
//     node_modules : un dossier sous OneDrive ou en lecture seule ne casse plus le lancement) ;
//   - sinon : elite.db (et ses journaux -wal, -journal) est d'abord copiée en elite.db.avant-schema-<date> (les 3
//     dernières copies gardées), puis les migrations pas encore appliquées le sont ; si l'une échoue, la base d'avant
//     est remise en place et un message dit quoi faire. Une migration peut transformer des données (renommer une
//     colonne, en remplir une nouvelle) : db push, lui, refusait tout changement qui en aurait perdu ;
//   - base d'avant les migrations (créée par db push, sans table _prisma_migrations) : calée exactement sur la
//     première migration (rien à faire pour une base de la version d'avant), marquée appliquée, puis les suivantes ;
//   - generate seulement si le client généré ne correspond pas au schéma.
// Avec --config (banc de contrôle, base temporaire) ou --toujours : migrate deploy à chaque fois.
//
// Pour le développeur, après un changement du schéma : node dbPush.mjs --nouvelle-migration <nom> écrit la migration
// suivante (le SQL qui mène des migrations existantes au schéma), à relire et compléter si des données doivent suivre.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DATABASE_FILE, dataDir } from './src/core/paths.js';

/** Environnement de la CLI Prisma : télémétrie et message de mise à jour coupés. */
export const PRISMA_ENV = Object.freeze({ CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1' });

const ICI = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export function prismaCli() {
  return require.resolve('prisma/build/index.js');
}

/** Version de la CLI Prisma installée, ou « ? ». */
export function versionPrisma() {
  try {
    return JSON.parse(fs.readFileSync(path.join(path.dirname(prismaCli()), '..', 'package.json'), 'utf8')).version || '?';
  } catch {
    return '?';
  }
}

export const MIGRATIONS = path.join(ICI, 'prisma', 'migrations');

/** Migrations, dans l'ordre : dossiers « 0001_initial », « 0002_… » qui contiennent un migration.sql. */
export function migrations(dossier = MIGRATIONS) {
  if (!fs.existsSync(dossier)) return [];
  return fs.readdirSync(dossier, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}_[a-z0-9_]+$/.test(e.name) && fs.existsSync(path.join(dossier, e.name, 'migration.sql')))
    .map((e) => e.name)
    .sort();
}

/** Nom de la migration suivante : numéro + 1, puis le nom en minuscules, sans accent ni espace. */
export function nomMigrationSuivante(existantes, nom) {
  const propre = String(nom ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  if (!propre) throw new Error('Nom de migration manquant : node dbPush.mjs --nouvelle-migration <nom>');
  const dernier = existantes.length ? Number(existantes.at(-1).slice(0, 4)) : 0;
  return `${String(dernier + 1).padStart(4, '0')}_${propre}`;
}

/** Un fichier SQL contient-il une instruction (pas seulement des commentaires) ? */
export const sqlNonVide = (sql) => /^\s*[A-Za-z]/m.test(String(sql ?? '').replace(/^\s*--.*$/gm, ''));

/** Empreinte du schéma : ses fichiers .prisma, les migrations, la configuration de la CLI, et la version de Prisma. */
export function empreinteSchema({ dossier = path.join(ICI, 'prisma', 'schema'), config = path.join(ICI, 'prisma.config.mjs'), version = versionPrisma(), dossierMigrations = MIGRATIONS } = {}) {
  const h = createHash('sha256').update(`prisma ${version}\n`);
  for (const n of fs.readdirSync(dossier).filter((f) => f.endsWith('.prisma')).sort()) {
    h.update(`${n}\0`);
    h.update(fs.readFileSync(path.join(dossier, n)));
    h.update('\0');
  }
  for (const m of migrations(dossierMigrations)) {
    h.update(`migration ${m}\0`);
    h.update(fs.readFileSync(path.join(dossierMigrations, m, 'migration.sql')));
    h.update('\0');
  }
  if (config && fs.existsSync(config)) h.update(fs.readFileSync(config));
  return h.digest('hex');
}

/** Fichier où est notée l'empreinte du schéma appliqué à cette base (à côté d'elite.db). */
export const marqueurBase = (db) => `${db}.schema`;

const lire = (f) => {
  try {
    return fs.readFileSync(f, 'utf8').trim();
  } catch {
    return '';
  }
};

/** La base existe et porte déjà ce schéma ? */
export function baseAJour(db, empreinte) {
  return fs.existsSync(db) && lire(marqueurBase(db)) === empreinte;
}

/** Dossier du client Prisma généré (node_modules/.prisma/client), ou null. */
export function dossierClient() {
  try {
    return path.join(path.dirname(require.resolve('@prisma/client/package.json')), '..', '..', '.prisma', 'client');
  } catch {
    return null;
  }
}

const MARQUEUR_CLIENT = '.empreinte-elite';

/** Le client généré correspond à ce schéma ? */
export function clientAJour(dossier, empreinte) {
  return Boolean(dossier) && fs.existsSync(path.join(dossier, 'index.js')) && lire(path.join(dossier, MARQUEUR_CLIENT)) === empreinte;
}

const JOURNAUX_SQLITE = ['-wal', '-journal'];
const PREFIXE_COPIE = '.avant-schema-';
const COPIES_GARDEES = 3;

/**
 * Copie elite.db (et ses journaux) avant un changement de schéma : rend le chemin de la copie. Seules les
 * `garder` dernières copies restent.
 */
export function sauvegarderBase(db, { now = new Date(), garder = COPIES_GARDEES } = {}) {
  const tag = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const copie = `${db}${PREFIXE_COPIE}${tag}`;
  fs.copyFileSync(db, copie);
  for (const s of JOURNAUX_SQLITE) if (fs.existsSync(db + s)) fs.copyFileSync(db + s, copie + s);
  // Les plus anciennes copies partent (nom daté : l'ordre alphabétique est l'ordre des dates)
  const dossier = path.dirname(db);
  const base = `${path.basename(db)}${PREFIXE_COPIE}`;
  const copies = fs.readdirSync(dossier).filter((n) => n.startsWith(base) && !JOURNAUX_SQLITE.some((s) => n.endsWith(s))).sort();
  for (const vieille of copies.slice(0, Math.max(0, copies.length - garder))) {
    for (const s of ['', ...JOURNAUX_SQLITE]) fs.rmSync(path.join(dossier, vieille + s), { force: true });
  }
  return copie;
}

/** Remet la base telle qu'elle était dans la copie (journaux compris : jamais un -wal d'une autre version). */
export function restaurerBase(db, copie) {
  fs.copyFileSync(copie, db);
  for (const s of JOURNAUX_SQLITE) {
    if (fs.existsSync(copie + s)) fs.copyFileSync(copie + s, db + s);
    else fs.rmSync(db + s, { force: true });
  }
}

/** Lance la CLI Prisma ; rend son code de sortie. */
function cli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [prismaCli(), ...args], { stdio: 'inherit', env: { ...process.env, ...PRISMA_ENV } });
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    child.on('error', (err) => {
      console.error(`prisma ${args[0]} : ${err.message}`);
      resolve(1);
    });
  });
}

/** La base a-t-elle la table des migrations de Prisma ? (lecture seule ; false si la base n'existe pas) */
export async function aTableMigrations(db) {
  if (!fs.existsSync(db)) return false;
  const { default: Database } = await import('better-sqlite3');
  const base = new Database(db, { readonly: true, fileMustExist: true });
  try {
    return Boolean(base.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'").get());
  } finally {
    base.close();
  }
}

/**
 * Base d'avant les migrations (créée par db push) : calée sur la PREMIÈRE migration seulement, puis marquée appliquée.
 * Les suivantes passent ensuite par migrate deploy, comme pour tout le monde. Rend le code de la CLI (0 : réussi).
 */
async function reprendreBaseAncienne() {
  const [premiere] = migrations();
  if (!premiere) return 0;
  const tmp = fs.mkdtempSync(path.join(path.dirname(MIGRATIONS), '.reprise-'));
  try {
    // Un dossier de migrations réduit à la première : ce qui sépare la base de la première version versionnée
    fs.copyFileSync(path.join(MIGRATIONS, 'migration_lock.toml'), path.join(tmp, 'migration_lock.toml'));
    fs.mkdirSync(path.join(tmp, premiere));
    fs.copyFileSync(path.join(MIGRATIONS, premiere, 'migration.sql'), path.join(tmp, premiere, 'migration.sql'));
    const ecart = path.join(tmp, 'ecart.sql');
    let c = await cli(['migrate', 'diff', '--from-config-datasource', '--to-migrations', tmp, '--script', '-o', ecart]);
    if (c !== 0) return c;
    if (sqlNonVide(fs.existsSync(ecart) ? fs.readFileSync(ecart, 'utf8') : '')) {
      console.log("Base d'avant les migrations : mise au niveau de la première.");
      c = await cli(['db', 'execute', '--file', ecart]);
      if (c !== 0) return c;
    }
    console.log(`Base d'avant les migrations : ${premiere} marquée appliquée.`);
    return cli(['migrate', 'resolve', '--applied', premiere]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Écrit la migration suivante d'après le schéma (développeur) ; rend 0, ou 1 si rien n'a changé ou en cas d'erreur. */
async function nouvelleMigration(nom) {
  const nomComplet = nomMigrationSuivante(migrations(), nom);
  // Le SQL est écrit hors du dossier des migrations : Prisma prendrait un dossier encore vide pour une migration abîmée
  const tmp = fs.mkdtempSync(path.join(path.dirname(MIGRATIONS), '.nouvelle-'));
  const brouillon = path.join(tmp, 'migration.sql');
  try {
    const c = await cli(['migrate', 'diff', '--from-migrations', MIGRATIONS, '--to-schema', path.join(ICI, 'prisma', 'schema'), '--script', '-o', brouillon]);
    if (c !== 0 || !sqlNonVide(fs.existsSync(brouillon) ? fs.readFileSync(brouillon, 'utf8') : '')) {
      console.log(c !== 0 ? 'Migration non écrite (erreur de la CLI ci-dessus).' : 'Le schéma correspond déjà aux migrations : rien à écrire.');
      return 1;
    }
    fs.mkdirSync(path.join(MIGRATIONS, nomComplet));
    fs.copyFileSync(brouillon, path.join(MIGRATIONS, nomComplet, 'migration.sql'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`Migration écrite : prisma/migrations/${nomComplet}/migration.sql. Relis-la ; si des données doivent suivre (colonne renommée, remplie), complète le SQL.`);
  return 0;
}

async function principal(argv) {
  const n = argv.indexOf('--nouvelle-migration');
  if (n >= 0) return nouvelleMigration(argv[n + 1]);
  // Fabrication de l'installateur (scripts/release.mjs) : client généré et noté, sans toucher à aucune base
  if (argv.includes('--seulement-generate')) {
    const g = await cli(['generate']);
    if (g !== 0) return g;
    const client = dossierClient();
    if (client) fs.writeFileSync(path.join(client, MARQUEUR_CLIENT), `${empreinteSchema()}\n`);
    return 0;
  }
  const sansGenerate = argv.includes('--sans-generate');
  const toujours = argv.includes('--toujours');
  const pousser = argv.filter((a) => a !== '--sans-generate' && a !== '--toujours');
  // Base choisie ailleurs (banc : --config, base temporaire neuve) ou demande expresse : migrations, puis generate
  if (toujours || pousser.some((a) => a === '--config' || a.startsWith('--config='))) {
    const c = await cli(['migrate', 'deploy', ...pousser]);
    if (c !== 0 || sansGenerate) return c;
    return cli(['generate']);
  }
  const db = path.join(dataDir(), DATABASE_FILE);
  const empreinte = empreinteSchema();
  const client = dossierClient();
  const baseOk = baseAJour(db, empreinte);
  const clientOk = sansGenerate || clientAJour(client, empreinte);
  if (baseOk && clientOk) {
    console.log('Base à jour (schéma inchangé) : rien à faire.');
    return 0;
  }
  if (!baseOk) {
    const copie = fs.existsSync(db) ? sauvegarderBase(db) : null;
    if (copie) console.log(`Schéma changé : base copiée avant la mise à jour (${path.basename(copie)}).`);
    let c = 0;
    if (fs.existsSync(db) && !(await aTableMigrations(db))) c = await reprendreBaseAncienne();
    if (c === 0) c = await cli(['migrate', 'deploy', ...pousser]);
    if (c !== 0) {
      let remise = false;
      if (copie) {
        try {
          restaurerBase(db, copie);
          remise = true;
        } catch (err) {
          console.error(`Base d'avant non remise en place : ${err.message}`);
        }
      }
      console.error(remise
        ? `La mise à jour de la base a échoué : ta base d'avant est remise telle quelle (copie gardée : ${path.basename(copie)}). Rien n'est perdu. Envoie bureau.log à celui qui t'a donné l'app.`
        : `La mise à jour de la base a échoué${copie ? ` (copie de ta base d'avant : ${copie})` : ''}. Envoie bureau.log à celui qui t'a donné l'app.`);
      return c;
    }
    fs.writeFileSync(marqueurBase(db), `${empreinte}\n`);
  }
  if (!sansGenerate && !clientAJour(client, empreinte)) {
    const g = await cli(['generate']);
    if (g !== 0) return g;
    try {
      if (client) fs.writeFileSync(path.join(client, MARQUEUR_CLIENT), `${empreinte}\n`);
    } catch {
      // pas noté : generate sera relancé la prochaine fois, rien de cassé
    }
  }
  return 0;
}

if (process.argv[1] && pathToFileURL(fs.realpathSync.native(process.argv[1])).href === import.meta.url) {
  principal(process.argv.slice(2)).then((c) => process.exit(c), (err) => {
    console.error(`Mise à jour de la base : ${err?.message || err}`);
    process.exit(1);
  });
}
