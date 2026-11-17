// Ce qui part chez les autres (installateur, copie de l'app pour l'escadron) ne contient rien qui soit à toi : ni tes
// données (base, repères, réglages, mémoire d'Alicia), ni un secret (jeton d'escadron, webhook Discord, fichier .env).
// Les données vivent dans %APPDATA%\Elite Compagnon\donnees, jamais dans le dossier de l'app ; l'app installée ne
// copie pas server/data (desktop/donnees.js). Ici : les fichiers que l'app distribuée emporterait (ceux suivis par git,
// et les nouveaux non ignorés), vérifiés par leur nom puis par leur contenu.
//
// Utilisé par l'étape 62-distribution de npm run controle, et par l'installateur (chantier 9) avant de construire.
// node scripts/distribution.mjs : le même contrôle, seul.
//
// Ton vrai jeton d'escadron est lu (lecture seule) pour être cherché dans les fichiers : gardé en mémoire, jamais
// écrit ni affiché.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Le dossier des données de l'app de bureau est décidé à un seul endroit (repli sous %LOCALAPPDATA% compris)
const { dossierDonnees } = createRequire(import.meta.url)('../desktop/donnees.js');

/** Noms de fichiers qui ne partent jamais : [motif du chemin (avec /), raison]. */
export const NOMS_PERSONNELS = [
  [/^server\/data\/(?!\.gitkeep$)/, 'données du joueur (server/data, celles de npm run dev)'],
  [/\.(?:db|sqlite3?)(?:-journal|-wal|-shm)?$/i, 'base de données'],
  [/\.db\.[^/]+$/i, 'copie de base de données'],
  [/(?:^|\/)escadron-jeton\.json$/i, 'jeton d’escadron'],
  [/(?:^|\/)escadron-chef\.json$/i, 'clés du chef d’escadron (serveur, membres, webhook)'],
  [/(?:^|\/)\.env(?:\.[^/]*)?$/i, 'fichier de secrets (.env)'],
  // Fichier de données nommé « secret(s) » ; pas du code (anonymat/secrets.mjs lit les journaux, il n'en contient pas)
  [/(?:^|\/)secrets?(?:[._-][^/]*)?\.(?:env|json|txt|ya?ml|ini|cfg|key)$|(?:^|\/)secrets?$/i, 'fichier de secrets'],
  [/(?:^|\/)route\.local\.json$/i, 'route privée de l’escadron'],
  // Fichiers du dossier des données copiés ailleurs ; pas les attendus du banc ni les fixtures (valeurs fictives)
  [/^(?!scripts\/controle\/|.*\/(?:fixtures|__golden__)\/)(?:.*\/)?(?:ia|ia-historique|minerais-appris|bureau|escadron)\.json$/i, 'réglage, état ou mémoire du joueur'],
];

/** Secrets reconnus à leur forme dans un texte : [motif, raison]. */
export const SECRETS_TEXTE = [
  [/https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]{20,}/i, 'webhook Discord'],
  [/\bEGC1\.[A-Za-z0-9_-]{20,}/, 'code de gestion d’escadron'],
  [/\bESC1\.[A-Za-z0-9_-]{20,}/, 'code d’escadron'],
  [/\bghp_[A-Za-z0-9]{36}\b/, 'clé GitHub'],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}\b/, 'clé GitHub'],
];

/** Fichiers dont le nom dit qu'ils sont à toi : [{ fichier, raison }]. */
export function nomsPersonnels(fichiers) {
  const trouves = [];
  for (const f of fichiers) {
    const rel = f.replace(/\\/g, '/');
    const regle = NOMS_PERSONNELS.find(([re]) => re.test(rel));
    if (regle) trouves.push({ fichier: rel, raison: regle[1] });
  }
  return trouves;
}

/** Raisons pour lesquelles ce texte ne peut pas partir (secret reconnu, ou l'un de tes `jetons`), sans les valeurs. */
export function secretsDans(texte, jetons = []) {
  const raisons = SECRETS_TEXTE.filter(([re]) => re.test(texte)).map(([, r]) => r);
  if (jetons.some((j) => j && j.length >= 20 && texte.includes(j))) raisons.push('ton jeton d’escadron');
  return raisons;
}

/** Fichiers que l'app distribuée emporterait : suivis par git, et nouveaux non ignorés. */
export function fichiersDistribues(racine = RACINE) {
  const r = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: racine, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ls-files a échoué : ${(r.stderr || '').trim().slice(0, 200)}`);
  return [...new Set(r.stdout.split('\0').filter(Boolean))].filter((f) => fs.existsSync(path.join(racine, f)));
}

/** server/data/* est-il toujours ignoré par git ? (un fichier de données y serait sinon proposé au prochain commit) */
export function donneesIgnorees(racine = RACINE) {
  // Un chemin par appel : git refuse --quiet avec plusieurs
  return ['server/data/elite.db', 'server/data/escadron-jeton.json']
    .every((f) => spawnSync('git', ['check-ignore', '-q', f], { cwd: racine }).status === 0);
}

/** Tes jetons d'escadron enregistrés (dossier des données de l'app de bureau, et server/data) : en mémoire seulement. */
export function lireJetons(racine = RACINE, env = process.env) {
  const dossiers = [path.join(racine, 'server', 'data')];
  try {
    dossiers.push(dossierDonnees(env)); // %APPDATA%\Elite Compagnon\donnees, ou sous %LOCALAPPDATA% (réseau)
  } catch {
    // pas de dossier de Windows utilisable : pas d'app de bureau ici
  }
  if (env.ELITE_DATA_DIR) dossiers.push(env.ELITE_DATA_DIR);
  const jetons = [];
  for (const d of dossiers) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(d, 'escadron-jeton.json'), 'utf8'))?.token;
      if (typeof j === 'string') jetons.push(j);
    } catch {
      // pas de jeton ici
    }
  }
  return jetons;
}

const BINAIRE = /\.(?:png|jpe?g|gif|webp|ico|ttf|woff2?|pdf|zip|exe|dll|node|wasm|mp3|wav|ogg|onnx|bin)$/i;

/**
 * Tous les fichiers d'un dossier qui n'est pas sous git (le paquet fabriqué par scripts/paquet.mjs), chemins relatifs
 * à barres obliques, dossiers .git et node_modules compris s'il y en a : rien n'échappe au contrôle.
 */
export function fichiersDuDossier(racine) {
  return fs.readdirSync(racine, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() || e.isSymbolicLink())
    .map((e) => path.relative(racine, path.join(e.parentPath, e.name)).replace(/\\/g, '/'))
    .sort();
}

/**
 * Le contrôle complet : { fichiers, problemes: [« chemin : raison »] }. Sur un dossier qui n'est pas sous git (paquet),
 * passer `fichiers` (fichiersDuDossier) et `git: false`.
 */
export function verifierDistribution(racine = RACINE, { jetons = lireJetons(racine), fichiers: liste = null, git = true } = {}) {
  const fichiers = liste ?? fichiersDistribues(racine);
  const problemes = nomsPersonnels(fichiers).map((t) => `${t.fichier} : ${t.raison}`);
  for (const f of fichiers) {
    if (BINAIRE.test(f)) continue;
    const plein = path.join(racine, f);
    let texte;
    try {
      if (fs.statSync(plein).size > 8 * 1024 * 1024) continue;
      texte = fs.readFileSync(plein, 'utf8');
    } catch {
      continue;
    }
    for (const raison of secretsDans(texte, jetons)) problemes.push(`${f.replace(/\\/g, '/')} : ${raison}`);
  }
  if (git && !donneesIgnorees(racine)) problemes.push('.gitignore : server/data/* n’est plus ignoré (tes données partiraient avec le prochain commit)');
  return { fichiers: fichiers.length, problemes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { fichiers, problemes } = verifierDistribution();
  if (problemes.length) {
    console.error(`${problemes.length} problème(s) : rien de tout ça ne doit partir chez les autres.`);
    for (const p of problemes.slice(0, 60)) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`${fichiers} fichiers distribuables, aucune donnée ni aucun secret du joueur.`);
}
