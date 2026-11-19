// npm run release : fabrique « Installer Enova <version>.exe », l'installateur en libre service (aucun mot
// de passe, aucune donnée de qui que ce soit : chacun règle la sienne dans l'app).
//
//   1. paquet propre (scripts/paquet.mjs : seuls les fichiers distribués, contrôlés, paquet.json et son empreinte) ;
//   2. dépendances installées dans ce paquet (npm ci, comme npm run installer) et programme d'Electron téléchargé ;
//   3. interface compilée et client Prisma généré d'avance : l'app installée démarre sans rien compiler ;
//   4. Node.js livré avec l'app (runtime/node/node.exe : le Node qui fabrique, de la version qui a compilé
//      better-sqlite3) : rien à installer chez le joueur ;
//   5. le tout compressé (tar.exe de Windows), avec son empreinte SHA-256 dans l'en-tête : l'installateur refuse un
//      contenu coupé ou modifié (scripts/release/installeur.cjs) ;
//   6. exécutable unique (SEA de Node : node.exe + l'installateur + l'app compressée en ressources), et son empreinte
//      SHA-256 dans un .sha256 à côté, à publier avec lui.
//
// Sortie dans release/ (ignoré par git). Options : --sortie <dossier>, --garder (garde le dossier de fabrication), --help.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RACINE, fichiersDistribues, lireJetons, verifierDistribution } from './distribution.mjs';
import { fabriquer, fichiersDuPaquet, reverifier, versionPaquet } from './paquet.mjs';
import { INSTALL_ENV, npmCli } from './installer.mjs';

const require = createRequire(import.meta.url);
const { entetePour } = require('./release/installeur.cjs');

const POSTJECT = 'postject@1.0.0-alpha.6';
const RCEDIT = 'rcedit@5.0.2'; // pose l'icône et le nom d'Enova sur l'exécutable de l'installateur
const FUSIBLE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

export const AIDE = `npm run release : fabrique l'installateur d'Enova (un .exe en libre service, sans mot de passe).

Options :
  --sortie <dossier>  où ranger l'installateur (par défaut : release/ à la racine, ignoré par git)
  --garder            garde le dossier de fabrication (pour regarder ce qui part)
  --help              affiche cette aide`;

export function lireOptions(argv) {
  const o = { aide: false, sortie: null, garder: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.aide = true;
    else if (a === '--garder') o.garder = true;
    else if (a === '--sortie') {
      const d = argv[++i];
      if (!d || d.startsWith('--')) throw new Error('--sortie attend un dossier : --sortie <dossier>.');
      o.sortie = d;
    } else throw new Error(`option inconnue : ${a}. Options possibles : --sortie <dossier>, --garder, --help.`);
  }
  return o;
}

function lancer(cmd, args, opts) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', windowsHide: true, ...opts });
  if (r.error) throw new Error(`${path.basename(cmd)} : ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} ${args.slice(0, 2).join(' ')} : code ${r.status}`);
}

/**
 * Icône et nom d'Enova sur l'exécutable de l'installateur (une copie de node.exe, qui porterait sinon l'icône de Node).
 * À faire avant d'y ranger l'installateur (postject) : ordre vérifié le 19 nov. 2026. Un échec n'arrête rien :
 * l'installateur marche sans, avec l'icône de Node.
 */
function poserIcone(exe, { travail, env }) {
  try {
    const outils = path.join(travail, 'outils');
    fs.mkdirSync(outils, { recursive: true });
    lancer(process.execPath, [npmCli(), 'install', '--no-audit', '--no-fund', '--prefix', outils, RCEDIT], { cwd: travail, env });
    lancer(path.join(outils, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe'), [
      exe, '--set-icon', path.join(RACINE, 'EliteApp.ico'),
      '--set-version-string', 'ProductName', 'Enova', '--set-version-string', 'FileDescription', 'Installateur d’Enova',
    ], { cwd: travail });
  } catch (err) {
    console.warn(`Icône de l'installateur non posée (${err.message}) : il garde celle de Node.`);
  }
}

const sha256 = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');

async function principal(argv) {
  const o = lireOptions(argv);
  if (o.aide) return console.log(AIDE);
  const jetons = lireJetons(RACINE);
  const avant = verifierDistribution(RACINE, { jetons });
  if (avant.problemes.length) throw new Error(`release refusée : ${avant.problemes.length} problème(s) dans le dossier de travail :\n  ${avant.problemes.slice(0, 20).join('\n  ')}`);
  const infos = versionPaquet();
  const sortie = path.resolve(o.sortie || path.join(RACINE, 'release'));
  const travail = path.join(sortie, `fabrication-${infos.version}`);
  const app = path.join(travail, 'app');
  fs.rmSync(travail, { recursive: true, force: true });
  fs.mkdirSync(travail, { recursive: true });

  console.log(`1/6 Paquet propre (version ${infos.version})…`);
  const fichiers = fichiersDuPaquet(fichiersDistribues(RACINE));
  fabriquer({ fichiers, sortie: app, infos });
  const problemes = reverifier(app, { jetons });
  if (problemes.length) throw new Error(`paquet refusé : ${problemes.slice(0, 20).join(' ; ')}`);

  console.log('2/6 Dépendances (npm ci) et programme d’Electron…');
  const env = { ...process.env, ...INSTALL_ENV };
  delete env.ELECTRON_RUN_AS_NODE;
  lancer(process.execPath, [npmCli(), 'ci', '--no-audit', '--no-fund'], { cwd: app, env });
  lancer(process.execPath, [path.join(app, 'node_modules', 'electron', 'install.js')], { cwd: path.join(app, 'node_modules', 'electron'), env });

  console.log('3/6 Interface compilée, client Prisma généré…');
  lancer(process.execPath, ['--input-type=module', '-e', "import('./desktop/interface.mjs').then((m) => m.compilerInterface()).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); })"], { cwd: app, env });
  lancer(process.execPath, ['dbPush.mjs', '--seulement-generate'], { cwd: path.join(app, 'server'), env });

  console.log('4/6 Node.js livré avec l’app…');
  const runtime = path.join(app, 'runtime', 'node');
  fs.mkdirSync(runtime, { recursive: true });
  fs.copyFileSync(process.execPath, path.join(runtime, 'node.exe'));
  const licence = path.join(path.dirname(process.execPath), 'LICENSE');
  if (fs.existsSync(licence)) fs.copyFileSync(licence, path.join(runtime, 'LICENSE'));

  console.log('5/6 Compression et empreinte…');
  const archive = path.join(travail, 'app.tar.gz');
  lancer(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-czf', archive, '-C', travail, 'app']);
  const entete = entetePour(archive, { version: infos.version });
  fs.writeFileSync(path.join(travail, 'entete.json'), JSON.stringify(entete));

  console.log('6/6 Exécutable de l’installateur…');
  const config = path.join(travail, 'sea.json');
  const blob = path.join(travail, 'installeur.blob');
  fs.writeFileSync(config, JSON.stringify({
    main: path.join(RACINE, 'scripts', 'release', 'installeur.cjs'),
    output: blob,
    disableExperimentalSEAWarning: true,
    useCodeCache: false,
    useSnapshot: false,
    assets: { entete: path.join(travail, 'entete.json'), app: archive },
  }));
  lancer(process.execPath, ['--experimental-sea-config', config], { cwd: travail });
  const exe = path.join(sortie, `Installer Enova ${infos.version}.exe`);
  fs.copyFileSync(process.execPath, exe);
  poserIcone(exe, { travail, env });
  const npx = path.join(path.dirname(npmCli()), 'npx-cli.js');
  lancer(process.execPath, [npx, '--yes', POSTJECT, exe, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', FUSIBLE, '--overwrite'], { cwd: travail, env });
  const empreinte = sha256(exe);
  fs.writeFileSync(`${exe}.sha256`, `${empreinte}  ${path.basename(exe)}\n`);
  if (!o.garder) fs.rmSync(travail, { recursive: true, force: true });
  const mo = (fs.statSync(exe).size / 1024 / 1024).toFixed(0);
  console.log(`\nInstallateur prêt : ${exe} (${mo} Mo)\nEmpreinte SHA-256 : ${empreinte}\nEmpreinte du paquet (Paramètres → Mon compte) : voir paquet.json dans l’app installée.`);
}

if (process.argv[1] && pathToFileURL(fs.realpathSync.native(process.argv[1])).href === import.meta.url) {
  principal(process.argv.slice(2)).catch((err) => {
    console.error(`\nRelease impossible : ${err.message}`);
    process.exit(1);
  });
}
