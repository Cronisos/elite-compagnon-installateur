// npm run installer : installe les paquets exactement comme le lockfile (« npm ci »), sans la télémétrie de Prisma.
//
// À l'installation, le script postinstall de @prisma/client lance « prisma generate » : tel quel, il envoie la
// télémétrie de Prisma (identifiant du PC, empreintes du projet, commande, système) à checkpoint.prisma.io. Ici, npm ci
// tourne avec CHECKPOINT_DISABLE=1, que tous ses scripts d'installation héritent. Le reste de l'installation télécharge
// ce qu'il faut pour tourner : les paquets (registre npm), les moteurs de Prisma, Electron.
//
// Refusé dans une worktree dont les node_modules sont un lien vers l'app principale : « npm ci » commence par vider
// node_modules, donc celui de l'app principale.
//
// Arguments en plus : passés à npm ci (npm run installer -- --foreground-scripts).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import emplacement from '../desktop/emplacement.js';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Environnement de npm ci et de ses scripts d'installation : télémétrie de Prisma et vérification de npm coupées. */
export const INSTALL_ENV = Object.freeze({ CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1', npm_config_update_notifier: 'false' });

/** Raison de refuser l'installation dans `racine`, ou null. */
export function refusInstallation(racine = RACINE) {
  for (const d of ['node_modules', 'client/node_modules', 'server/node_modules', 'overlay/node_modules']) {
    let st;
    try {
      st = fs.lstatSync(path.join(racine, d));
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) return `${d} est un lien vers un autre dossier (worktree) : npm ci viderait celui de l'app principale. Installe dans l'app principale.`;
  }
  return null;
}

/** Chemin de npm-cli.js : celui qui a lancé « npm run installer », sinon celui livré avec Node. */
export function npmCli(env = process.env) {
  if (env.npm_execpath && /npm-cli\.js$/i.test(env.npm_execpath)) return env.npm_execpath;
  return path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
}

if (process.argv[1] && pathToFileURL(fs.realpathSync.native(process.argv[1])).href === import.meta.url) {
  const raison = refusInstallation();
  if (raison) {
    console.error(`Installation refusée : ${raison}`);
    process.exit(1);
  }
  // Program Files ou OneDrive : l'app risque de ne pas pouvoir écrire dans son dossier (desktop/emplacement.js)
  const avert = emplacement.avertissementEmplacement(RACINE);
  if (avert) console.warn(`\nAttention : ${avert.long}\n`);
  const r = spawnSync(process.execPath, [npmCli(), 'ci', ...process.argv.slice(2)], { cwd: RACINE, stdio: 'inherit', env: { ...process.env, ...INSTALL_ENV } });
  if (r.error) console.error(`npm ci : ${r.error.message}`);
  if (r.status !== 0) process.exit(r.status ?? 1);
  // Electron 45 n'a plus de script d'installation : il téléchargerait son programme (plus de 100 Mo) au premier lancement
  // de l'overlay, en pleine partie. On le télécharge ici, à l'installation (install.js d'Electron : empreinte vérifiée).
  const electron = spawnSync(process.execPath, [path.join(RACINE, 'node_modules', 'electron', 'install.js')], { cwd: path.join(RACINE, 'node_modules', 'electron'), stdio: 'inherit', env: { ...process.env, ...INSTALL_ENV } });
  if (electron.status !== 0) {
    console.error('Electron : programme non téléchargé (overlay indisponible). Relance « npm run installer ».');
    process.exit(electron.status ?? 1);
  }
  // Prisma 7 : le client n'est plus généré à l'installation de @prisma/client ; on le génère ici (base inchangée)
  const g = spawnSync(process.execPath, [npmCli(), 'exec', '-w', 'server', '--', 'prisma', 'generate'], { cwd: RACINE, stdio: 'inherit', env: { ...process.env, ...INSTALL_ENV } });
  if (g.error) console.error(`prisma generate : ${g.error.message}`);
  process.exit(g.status ?? 1);
}
