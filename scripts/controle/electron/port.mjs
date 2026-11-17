// Port de l'interface (étape 26-overlay) : le vrai client/vite.config.js, serveur de développement de Vite (celui de
// « npm run dev » et de « Lancer EliteApp.cmd »), lancé dans un processus enfant sur un port du banc.
//   1. Un autre programme tient déjà 127.0.0.1:<port> : Vite doit refuser de démarrer (strictPort). Avec « localhost »,
//      Vite démarrait à côté sur [::1] sans rien voir, et l'overlay tombait chez l'autre programme dès que Vite se taisait.
//   2. Port libre : Vite écoute sur 127.0.0.1 seulement, l'adresse que l'overlay et le lanceur appellent.
// Seul le port change (jamais 5173) : l'hôte vient de la config, c'est lui qui est contrôlé. Aucun proxy (rien n'est
// relayé vers le serveur de l'app), ni rechargement à chaud, ni surveillance des fichiers ; cache de Vite temporaire.

import { fork } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { trouverVite } from '../vite/version.mjs';

const ICI = fileURLToPath(import.meta.url);
const DELAI_MS = 60_000;

/** Un autre programme : écoute sur `hote`:`port` et répond « autre programme ». */
export function autreProgramme(hote, port = 0) {
  return new Promise((resolve, reject) => {
    const s = net.createServer((c) => c.end('HTTP/1.1 200 OK\r\ncontent-length: 14\r\n\r\nautre programme'));
    s.on('error', reject);
    s.listen(port, hote, () => resolve({ port: s.address().port, fermer: () => new Promise((r) => s.close(() => r())) }));
  });
}

/** Vite (vrai client/vite.config.js) sur `port`, dans un enfant : { ecoute: {address, port} } ou { erreur } . */
export function lancerVite({ racine, port, configuration = path.join(racine, 'client', 'vite.config.js') }) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-controle-port-'));
  return new Promise((resolve) => {
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ELITE_|CONTROLE_|NODE_OPTIONS$|NODE_TEST_CONTEXT$)/.test(k)));
    const proc = fork(ICI, ['--enfant'], { cwd: path.join(racine, 'client'), env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
    const lignes = [];
    for (const flux of [proc.stdout, proc.stderr]) flux.on('data', (d) => lignes.push(String(d)));
    let fini = false;
    const finir = (r) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuterie);
      if (proc.exitCode === null) proc.kill();
      fs.rmSync(dossier, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      resolve({ ...r, sortie: lignes.join('').slice(-2000) });
    };
    const minuterie = setTimeout(() => finir({ erreur: `pas de réponse de Vite après ${DELAI_MS / 1000} s` }), DELAI_MS);
    proc.on('message', (m) => finir(m));
    proc.on('exit', (code) => finir({ erreur: `processus arrêté (code ${code})` }));
    proc.send({ racine, port, cache: dossier, configuration });
  });
}

async function enfant({ racine, port, cache, configuration }) {
  const vite = await import(pathToFileURL(trouverVite(racine)?.entree ?? path.join(racine, 'client', 'node_modules', 'vite')).href);
  const { default: brute } = await import(pathToFileURL(configuration).href);
  const config = typeof brute === 'function' ? await brute({ command: 'serve', mode: 'development' }) : brute;
  const hote = config.server?.host ?? null;
  let serveur = null;
  try {
    serveur = await vite.createServer({
      ...config,
      configFile: false,
      root: path.join(racine, 'client'),
      cacheDir: cache,
      logLevel: 'silent',
      clearScreen: false,
      server: { ...config.server, port, open: false, proxy: undefined, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    await serveur.listen();
    const a = serveur.httpServer.address();
    return { ecoute: { address: a.address, port: a.port }, hote };
  } catch (err) {
    return { erreur: err.message, hote };
  } finally {
    await serveur?.close().catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === ICI && process.argv.includes('--enfant') && process.send) {
  process.once('message', async (m) => {
    let r;
    try {
      r = await enfant(m);
    } catch (err) {
      r = { erreur: `enfant : ${err.message}` };
    }
    process.send(r, () => process.exit(0)); // le message part avant la fin du processus
  });
}

/**
 * Les deux essais. `portLibre()` : un port libre de 127.0.0.1 (jamais 3001 ni 5173). Rend les constats
 * [{ nom, attendu, ecart }].
 */
export async function essayerPort({ racine, portLibre, configuration }) {
  const constats = [];
  const squat = await autreProgramme('127.0.0.1', await portLibre());
  try {
    const r = await lancerVite({ racine, port: squat.port, configuration });
    constats.push({
      nom: 'Port de l’interface déjà tenu sur 127.0.0.1 par un autre programme',
      attendu: 'Vite refuse de démarrer (port strict)',
      ecart: r.ecoute ? `Vite a démarré quand même, sur ${r.ecoute.address}:${r.ecoute.port} (hôte de la config : ${r.hote ?? 'aucun'})` : /already in use|EADDRINUSE/i.test(r.erreur) ? null : `autre échec : ${r.erreur}`,
    });
  } finally {
    await squat.fermer();
  }
  const port = await portLibre();
  const r = await lancerVite({ racine, port, configuration });
  constats.push({
    nom: 'Adresse d’écoute de l’interface',
    attendu: '127.0.0.1 seulement (celle de l’overlay et du lanceur)',
    ecart: r.ecoute?.address === '127.0.0.1' && r.ecoute.port === port ? null : `écoute : ${r.ecoute ? `${r.ecoute.address}:${r.ecoute.port}` : `aucune (${r.erreur})`}`,
  });
  return constats;
}
