// Interface de l'app de bureau, lancée par desktop/main.js avec le Node du PC : compile le client si son code a changé
// depuis la dernière compilation (client/dist), puis le sert sur http://127.0.0.1:5173 avec « vite preview », proxy /api
// vers le serveur (port 3001) compris, exactement comme npm run dev. Même adresse que le serveur de développement :
// les gardes du serveur (Origin acceptée) et de l'overlay (fenêtres ouvertes sur 127.0.0.1:5173) ne changent pas.
//
// Messages au lanceur (IPC) : { type: 'compilation' } quand la compilation commence, { type: 'pret', url } quand
// l'interface répond, { type: 'erreur', message } sinon (puis arrêt).

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { trouverVite } from '../scripts/controle/vite/version.mjs';
import processus from './processus.js';

const { messagePortPris, quiTientLePort } = processus;

const RACINE = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLIENT = path.join(RACINE, 'client');
const DIST = path.join(CLIENT, 'dist');
const EMPREINTE = path.join(DIST, '.empreinte-bureau');
/** Port de l'interface : ELITE_UI_PORT (choisi par l'app de bureau, ports.js), sinon 5173. */
export function uiPort(env = process.env) {
  const v = String(env.ELITE_UI_PORT ?? '').trim();
  const p = /^\d{4,5}$/.test(v) ? Number(v) : NaN;
  return p >= 1024 && p <= 65535 ? p : 5173;
}
export const UI_URL = `http://127.0.0.1:${uiPort()}`;

/** Ce qui fait l'interface compilée : le code du client, sa configuration, le fichier partagé du serveur, Vite. */
export function sourcesInterface(racine = RACINE) {
  const client = path.join(racine, 'client');
  return {
    dossiers: [path.join(client, 'src'), path.join(client, 'public')],
    fichiers: [path.join(client, 'index.html'), path.join(client, 'vite.config.js'), path.join(client, 'viteGuard.js'), path.join(client, 'package.json'),
      path.join(racine, 'server', 'src', 'core', 'modes.js')],
  };
}

/** Empreinte du contenu (jamais des dates : OneDrive et git les changent sans toucher au contenu). */
export function empreinte({ dossiers, fichiers }, extra = '') {
  const hash = createHash('sha1').update(extra);
  const tous = [...fichiers];
  for (const d of dossiers) {
    if (!fs.existsSync(d)) continue;
    for (const e of fs.readdirSync(d, { recursive: true, withFileTypes: true })) if (e.isFile()) tous.push(path.join(e.parentPath, e.name));
  }
  for (const f of tous.sort()) {
    hash.update(path.relative(RACINE, f).replace(/\\/g, '/'));
    hash.update(fs.existsSync(f) ? fs.readFileSync(f) : '∅');
  }
  return hash.digest('hex');
}

const dire = (msg) => process.send?.(msg);

/**
 * Compile l'interface si son code a changé depuis la dernière compilation (empreinte notée dans client/dist), et rend
 * le module Vite chargé. L'installateur (scripts/release.mjs) l'appelle à la fabrication : l'app installée démarre sans
 * compiler.
 */
export async function compilerInterface({ surCompilation = () => {} } = {}) {
  const vite = trouverVite(RACINE);
  if (!vite) throw new Error("Vite introuvable : lance « npm run installer » à la racine du projet.");
  const version = JSON.parse(fs.readFileSync(path.join(vite.dossier, 'package.json'), 'utf8')).version;
  const module = await import(pathToFileURL(vite.entree).href);
  const configFile = path.join(CLIENT, 'vite.config.js');
  const voulue = empreinte(sourcesInterface(), `vite ${version}`);
  const actuelle = fs.existsSync(EMPREINTE) ? fs.readFileSync(EMPREINTE, 'utf8').trim() : '';
  let compilee = false;
  if (voulue !== actuelle || !fs.existsSync(path.join(DIST, 'index.html'))) {
    surCompilation();
    console.log("Compilation de l'interface (son code a changé)…");
    await module.build({ root: CLIENT, configFile, logLevel: 'warn' });
    fs.writeFileSync(EMPREINTE, `${voulue}\n`);
    compilee = true;
  }
  return { module, configFile, compilee };
}

async function lancer() {
  // Lanceur disparu (app quittée ou tuée) pendant la compilation : on s'arrête, jamais d'interface orpheline sur 5173
  let serveur = null;
  const arreter = () => Promise.resolve(serveur?.close?.()).catch(() => {}).finally(() => process.exit(0));
  process.on('disconnect', arreter);
  process.on('message', (m) => m?.type === 'arret' && arreter());
  const { module: { preview }, configFile } = await compilerInterface({ surCompilation: () => dire({ type: 'compilation' }) });
  // Ce port seulement (strictPort) : l'app de bureau l'a vu libre ; pris entre-temps, on s'arrête avec un message clair
  serveur = await preview({ root: CLIENT, configFile, logLevel: 'warn', preview: { host: '127.0.0.1', port: uiPort(), strictPort: true, open: false } });
  dire({ type: 'pret', url: UI_URL });
  console.log(`Interface prête sur ${UI_URL}`);
}

if (process.argv[1] && pathToFileURL(fs.realpathSync.native(process.argv[1])).href === import.meta.url) {
  lancer().catch((err) => {
    // Port pris : le programme qui le tient est nommé (processus.js), avec quoi faire, en mots de joueur
    const message = /EADDRINUSE|already in use|is in use/i.test(String(err?.message))
      ? messagePortPris('interface', uiPort(), quiTientLePort(uiPort()))
      : `Interface : ${err?.message || err}`;
    console.error(message);
    dire({ type: 'erreur', message });
    setTimeout(() => process.exit(1), 100);
  });
}
