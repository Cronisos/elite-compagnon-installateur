// npm run paquet : fabrique la copie de l'app à donner à l'escadron, la SEULE façon de la donner. Jamais un zip du
// dossier de travail : il emporterait server/data (ta base, ton jeton d'escadron, les clés du chef…), .git (dont
// l'historique garde d'anciennes données), node_modules et les journaux *.log.
//
//   1. contrôle du dossier de travail (scripts/distribution.mjs) : rien ne part s'il y a un problème ;
//   2. copie, dans un dossier NEUF, des seuls fichiers distribués (fichiersDistribues : suivis par git et nouveaux
//      non ignorés), sans .git, server/data (sauf .gitkeep), node_modules, *.log (sauf les journaux d'exemple que
//      relisent les tests) ni ce qui ne sert qu'au développement ;
//   3. paquet.json : version, et empreinte SHA-256 de chaque fichier (desktop/version.js) ; l'app l'affiche dans
//      Paramètres → Mon compte, avec l'empreinte du paquet, à comparer à celle que tu publies ;
//   4. nouveau contrôle, sur le dossier fabriqué lui-même (pas sur git) : au moindre problème, il est effacé ;
//   5. zip (tar.exe de Windows) et son empreinte SHA-256 dans un fichier .sha256 à côté, à publier avec lui.
//
// Options : --sortie <dossier> (défaut : paquet/ à la racine, ignoré par git), --sans-zip, --remplacer (un paquet de
// même version déjà fabriqué est effacé d'abord), --help ; toute autre option est refusée. Aucun installateur ici : le membre dézippe, puis suit le README.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RACINE, fichiersDistribues, fichiersDuDossier, lireJetons, verifierDistribution } from './distribution.mjs';
import version from '../desktop/version.js';

/** Jamais dans le paquet, même suivis par git : [motif du chemin (à barres obliques), raison]. */
export const EXCLUS = [
  [/^\.git(?:\/|$)/, 'dépôt git (son historique)'],
  [/(?:^|\/)node_modules\//, 'paquets installés (npm run installer les remet)'],
  [/^server\/data\/(?!\.gitkeep$)/, 'données du joueur'],
  // Journaux : tous, sauf ceux que les tests et le banc de contrôle relisent (les mêmes exceptions que .gitignore),
  // sans quoi npm test ou npm run controle lancé depuis un paquet échouerait sur des fichiers manquants
  [/^(?!scripts\/controle\/(?:seances|options)\/|server\/src\/modules\/routes\/tests\/fixtures\/[^/]+$).*\.log$/i, 'journal'],
  [/^paquet\//, 'paquets déjà fabriqués'],
  [/^release\//, 'installateurs déjà fabriqués'],
  [/^\.claude\//, 'réglages de l’assistant'],
  [/^CLAUDE\.md/i, 'notes de développement'],
  // Pack d'images tel que téléchargé (PDF, PNG géants) : seuls ses SVG utiles sont dans server/src/core/reference
  [/^Vector Ships by Qohen Leth[^/]*\//, 'pack d’images d’origine (ses SVG utiles sont déjà copiés)'],
  [/(?:^|\/)dist\//, 'interface compilée (refaite au premier lancement)'],
];

/** Fichiers du dossier de travail qui partent dans le paquet. */
export function fichiersDuPaquet(fichiers) {
  return fichiers.map((f) => f.replace(/\\/g, '/')).filter((f) => !EXCLUS.some(([re]) => re.test(f))).sort();
}

/** Ce qui ne doit jamais être dans un paquet fabriqué (en plus des règles de distribution.mjs). */
export function problemesPaquet(fichiers) {
  return fichiers.filter((f) => EXCLUS.some(([re]) => re.test(f)) && f !== version.FICHIER).map((f) => `${f} : ${EXCLUS.find(([re]) => re.test(f))[1]}`);
}

/** Version du paquet : date du jour et commit (« 2026.11.15-75560f5 »), « -modifie » si des fichiers ne sont pas commités. */
export function versionPaquet({ racine = RACINE, now = new Date(), git = (args) => spawnSync('git', args, { cwd: racine, encoding: 'utf8' }) } = {}) {
  const jour = now.toISOString().slice(0, 10).replace(/-/g, '.');
  const commit = git(['rev-parse', '--short', 'HEAD']).stdout?.trim() || 'sans-commit';
  const modifie = Boolean(git(['status', '--porcelain', '--untracked-files=normal']).stdout?.trim());
  return { version: `${jour}-${commit}${modifie ? '-modifie' : ''}`, commit, modifie };
}

/** Copie les fichiers dans un dossier neuf, puis écrit paquet.json. Rend le contenu de paquet.json. */
export function fabriquer({ racine = RACINE, fichiers, sortie, infos }) {
  if (fs.existsSync(sortie)) throw new Error(`${sortie} existe déjà : un paquet se fabrique dans un dossier neuf (--remplacer pour l'effacer d'abord).`);
  for (const f of fichiers) {
    const vers = path.join(sortie, f);
    fs.mkdirSync(path.dirname(vers), { recursive: true });
    fs.copyFileSync(path.join(racine, f), vers, fs.constants.COPYFILE_EXCL);
  }
  const m = version.manifeste(sortie, fichiers);
  const paquet = { nom: 'Elite Compagnon', auteur: 'Cronisos Lysiris', version: infos.version, commit: infos.commit, modifie: infos.modifie, fabrique: new Date().toISOString(), empreinte: version.empreinteManifeste(m), fichiers: m };
  fs.writeFileSync(path.join(sortie, version.FICHIER), `${JSON.stringify(paquet, null, 1)}\n`);
  return paquet;
}

/** Revérifie le dossier fabriqué lui-même : règles de distribution, et rien de ce qui est exclu. */
export function reverifier(sortie, { jetons = [] } = {}) {
  const fichiers = fichiersDuDossier(sortie);
  const { problemes } = verifierDistribution(sortie, { fichiers, git: false, jetons });
  return [...problemes, ...problemesPaquet(fichiers)];
}

const sha256Fichier = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');

export const AIDE = `npm run paquet : fabrique la copie de l'app à donner à l'escadron (dossier, zip et son empreinte).

Options :
  --sortie <dossier>  où ranger le paquet (par défaut : paquet/ à la racine, ignoré par git)
  --sans-zip          seulement le dossier, sans zip
  --remplacer         efface d'abord un paquet de même version déjà fabriqué
  --help              affiche cette aide, sans rien fabriquer`;

/**
 * Lit les options. Une option inconnue (faute de frappe) arrête tout avant de rien fabriquer : jamais un paquet rangé
 * ailleurs ou un zip non voulu. Rend { aide, sortie, sansZip, remplacer }.
 */
export function lireOptions(argv) {
  const o = { aide: false, sortie: null, sansZip: false, remplacer: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.aide = true;
    else if (a === '--sans-zip') o.sansZip = true;
    else if (a === '--remplacer') o.remplacer = true;
    else if (a === '--sortie') {
      const d = argv[++i];
      if (!d || d.startsWith('--')) throw new Error('--sortie attend un dossier : --sortie <dossier>.');
      o.sortie = d;
    } else throw new Error(`option inconnue : ${a}. Options possibles : --sortie <dossier>, --sans-zip, --remplacer, --help.`);
  }
  return o;
}

function principal(argv) {
  const o = lireOptions(argv);
  if (o.aide) {
    console.log(AIDE);
    return 0;
  }
  // 1. Le dossier de travail d'abord : s'il a un problème, le paquet en aurait sans doute un aussi
  const jetons = lireJetons(RACINE);
  const avant = verifierDistribution(RACINE, { jetons });
  if (avant.problemes.length) {
    console.error(`Paquet refusé : ${avant.problemes.length} problème(s) dans le dossier de travail.`);
    for (const p of avant.problemes.slice(0, 40)) console.error(`  ${p}`);
    return 1;
  }
  const infos = versionPaquet();
  const nom = `Elite Compagnon ${infos.version}`;
  const dossier = path.resolve(o.sortie || path.join(RACINE, 'paquet'));
  const sortie = path.join(dossier, nom);
  if (o.remplacer) {
    fs.rmSync(sortie, { recursive: true, force: true });
    fs.rmSync(`${sortie}.zip`, { force: true });
    fs.rmSync(`${sortie}.zip.sha256`, { force: true });
  }
  // 2. et 3. Copie des seuls fichiers distribués, paquet.json
  const fichiers = fichiersDuPaquet(fichiersDistribues(RACINE));
  const paquet = fabriquer({ fichiers, sortie, infos });
  // 4. Le dossier fabriqué, revérifié tel quel
  const problemes = reverifier(sortie, { jetons });
  if (problemes.length) {
    fs.rmSync(sortie, { recursive: true, force: true });
    console.error(`Paquet effacé : ${problemes.length} problème(s) dans le dossier fabriqué.`);
    for (const p of problemes.slice(0, 40)) console.error(`  ${p}`);
    return 1;
  }
  console.log(`Paquet ${infos.version} : ${fichiers.length} fichiers dans ${sortie}`);
  console.log(`Empreinte du paquet (affichée dans Paramètres → Mon compte) : ${version.courte(paquet.empreinte)}  (${paquet.empreinte})`);
  if (infos.modifie) console.warn('Attention : des fichiers ne sont pas commités, le paquet ne correspond à aucun commit.');
  // 5. Zip et son empreinte
  if (!o.sansZip) {
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    const zip = `${sortie}.zip`;
    const r = spawnSync(tar, ['-a', '-c', '-f', zip, '-C', dossier, nom], { stdio: 'inherit', windowsHide: true });
    if (r.status !== 0) {
      console.error(`Zip impossible (${r.error?.message || `code ${r.status}`}) : le dossier est prêt, zippe-le toi-même.`);
      return 1;
    }
    const e = sha256Fichier(zip);
    fs.writeFileSync(`${zip}.sha256`, `${e}  ${path.basename(zip)}\n`);
    console.log(`Zip : ${zip}`);
    console.log(`SHA-256 du zip (à publier avec lui, dans un message épinglé) : ${e}`);
  }
  console.log('Avant de partager un clone du dépôt lui-même (jamais nécessaire pour un membre) : npm run controle:historique.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exit(principal(process.argv.slice(2)));
  } catch (err) {
    console.error(`Paquet : ${err.message}`);
    process.exit(1);
  }
}
