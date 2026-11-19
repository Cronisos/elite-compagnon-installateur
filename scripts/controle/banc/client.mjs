// Interface du banc de contrôle : le vrai client de la worktree, compilé dans un dossier temporaire (vite build), puis
// servi par vite preview avec LE MÊME proxy /api que client/vite.config.js, dirigé vers un serveur isolé.
//
//   const client = await preparerClient();          // compilation + liste des modules clients (pages, fenêtres HUD)
//   const ui = await servirClient({ client, api: srv.url, port });   // vite preview sur 127.0.0.1:<port>
//   … ui.url …
//   await ui.arreter();
//   client.effacer();
//
// Chaque commande Vite tourne dans un processus enfant, arrêté (de force s'il le faut) même en cas d'échec. Le cache
// de Vite va dans le dossier temporaire : rien n'est écrit dans client/ ni dans node_modules (dans une worktree, ce
// peut être un lien vers le dossier de l'app du joueur).

import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CLIENT, RACINE } from './chemins.mjs';
import { PORTS_INTERDITS } from './serveur.mjs';
import { trouverVite } from '../vite/version.mjs';

const ICI = fileURLToPath(import.meta.url);
const VITE = trouverVite(RACINE)?.entree ?? path.join(CLIENT, 'node_modules', 'vite'); // absent : l'import échoue avec ce chemin
const CONFIG = path.join(CLIENT, 'vite.config.js');
/** Cible du proxy /api dans client/vite.config.js (le serveur de l'app) : le banc la remplace par le serveur isolé. */
export const CIBLE_APP = 'http://127.0.0.1:3001';
const PREPARER_MS = 5 * 60_000;
const SERVIR_MS = 60_000;
const ARRET_MS = 10_000;

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Proxy du banc : celui de la config Vite, entrée par entrée, avec la cible de l'app remplacée par `api`.
 * Une entrée qui viserait une autre adresse est refusée : le banc ne saurait pas l'isoler.
 */
export function proxyDuBanc(proxy, api) {
  if (!proxy || typeof proxy !== 'object' || !Object.hasOwn(proxy, '/api')) {
    throw new Error('client/vite.config.js : plus de proxy /api (server.proxy). Le banc ne sait plus relier l’interface au serveur isolé.');
  }
  const sortie = {};
  for (const [cle, valeur] of Object.entries(proxy)) {
    const options = typeof valeur === 'string' ? { target: valeur } : { ...valeur };
    const cible = String(options.target ?? '').replace(/\/+$/, '');
    if (cible !== CIBLE_APP) {
      throw new Error(`client/vite.config.js : le proxy « ${cle} » vise ${options.target ?? 'une cible non écrite'}, pas ${CIBLE_APP} : le banc ne sait pas l'isoler.`);
    }
    sortie[cle] = { ...options, target: api };
  }
  return sortie;
}

/** Ce que l'étape garde de chaque module client (sans ses composants). */
export function decrireModules(modules) {
  return modules.map((m) => ({
    id: m.id,
    titre: m.title,
    chemin: m.Component ? m.path : null,
    hud: Boolean(m.Hud),
    pagesHud: Object.keys(m.hudPages || {}),
    // Fenêtres ouvertes par le serveur du module, jamais avec le mode (« À acheter ici ») : contrôlées comme les autres
    pagesExtras: Object.keys(m.hudExtras || {}),
    nav: m.nav !== false,
    mode: m.mode?.label || null,
    modeId: typeof m.mode?.id === 'string' ? m.mode.id : null, // déclaration commune (core/modes.js), vérifiée par concordanceModes
    permanent: Boolean(m.Overlay),
  }));
}

/** Lance une commande dans un processus enfant ; `message` reçoit ses messages, la promesse rend le premier « pret ». */
function enfant(commande, arguments_, { delaiMs, sortie }) {
  const lignes = [];
  const proc = fork(ICI, ['--enfant'], {
    cwd: CLIENT,
    env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ELITE_|CONTROLE_|NODE_OPTIONS$|NODE_TEST_CONTEXT$)/.test(k))),
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  });
  for (const flux of [proc.stdout, proc.stderr]) {
    flux.setEncoding('utf8');
    let reste = '';
    flux.on('data', (d) => {
      const morceaux = (reste + d).split(/\r?\n/);
      reste = morceaux.pop();
      for (const l of morceaux) {
        lignes.push(l);
        if (lignes.length > 2000) lignes.shift();
        sortie?.(l);
      }
    });
  }
  const fin = new Promise((resolve) => proc.once('exit', (code, signal) => resolve({ code, signal })));
  const pret = new Promise((resolve, reject) => {
    const minuterie = setTimeout(() => {
      proc.kill();
      reject(new Error(`Interface du banc (${commande}) : pas prête après ${Math.round(delaiMs / 1000)} s.\n${lignes.slice(-30).join('\n')}`));
    }, delaiMs);
    proc.on('message', (m) => {
      if (m?.type === 'pret') {
        clearTimeout(minuterie);
        resolve(m);
      } else if (m?.type === 'erreur') {
        clearTimeout(minuterie);
        reject(new Error(`Interface du banc (${commande}) : ${m.message}${lignes.length ? `\n${lignes.slice(-30).join('\n')}` : ''}`));
      }
    });
    fin.then(({ code, signal }) => {
      clearTimeout(minuterie);
      reject(new Error(`Interface du banc (${commande}) : arrêtée (code ${code ?? signal}).\n${lignes.slice(-30).join('\n')}`));
    });
  });
  proc.send({ commande, ...arguments_ });
  const arreter = async () => {
    if (proc.exitCode !== null || proc.signalCode !== null) return;
    try { proc.send({ type: 'arret' }); } catch { /* canal fermé */ }
    if (!(await Promise.race([fin, attendre(ARRET_MS).then(() => null)]))) {
      proc.kill();
      await Promise.race([fin, attendre(ARRET_MS)]);
    }
  };
  return { pret, arreter, lignes: () => lignes.slice() };
}

function effacer(dossier) {
  try {
    fs.rmSync(dossier, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Compile l'interface dans un dossier temporaire et lit la liste des modules clients (client/src/modules/index.js,
 * chargé par Vite comme le fait la page). Rend { dossier, dist, modules, effacer() }.
 */
export async function preparerClient({ sortie } = {}) {
  if (!fs.existsSync(VITE)) throw new Error(`Vite introuvable (${VITE}) : lance « npm install » à la racine.`);
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-controle-vite-'));
  const e = enfant('preparer', { dossier }, { delaiMs: PREPARER_MS, sortie });
  try {
    const r = await e.pret;
    await e.arreter();
    if (!fs.existsSync(path.join(dossier, 'dist', 'index.html'))) throw new Error('Interface du banc : index.html absent de la compilation.');
    return { dossier, dist: path.join(dossier, 'dist'), modules: r.modules, effacer: () => effacer(dossier) };
  } catch (err) {
    await e.arreter();
    effacer(dossier);
    throw err;
  }
}

/**
 * Sert l'interface compilée sur 127.0.0.1:<port> (vite preview, port strict), proxy /api → `api` (le serveur isolé).
 * Rend { url, port, securite: { cors, corsPreview, hotes } (réglages résolus par Vite), arreter(), lignes() }.
 */
export async function servirClient({ client, api, port, sortie }) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || PORTS_INTERDITS.has(port)) throw new Error(`Port d'interface refusé : ${port}.`);
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(String(api))) throw new Error(`Serveur isolé attendu sur http://127.0.0.1:<port>, pas « ${api} ».`);
  const e = enfant('servir', { dossier: client.dossier, api, port }, { delaiMs: SERVIR_MS, sortie });
  try {
    const r = await e.pret;
    return { url: `http://127.0.0.1:${r.port}`, port: r.port, securite: r.securite, arreter: e.arreter, lignes: e.lignes };
  } catch (err) {
    await e.arreter();
    throw err;
  }
}

/**
 * Sert l'interface par le SERVEUR DE DÉVELOPPEMENT de Vite (celui de « npm run dev » et de « Lancer EliteApp.cmd »), avec
 * la config de client/vite.config.js importée telle quelle (jamais recompilée dans node_modules), sur 127.0.0.1:<port>,
 * proxy /api → `api`. Pour les attaques : vite preview n'a pas ses routes internes (/__open-in-editor, /@fs/…).
 * `editeur` : programme inerte que Vite lancerait à la place d'un éditeur (LAUNCH_EDITOR) si la garde le laissait faire.
 * Rend { url, port, arreter(), lignes() }.
 */
export async function servirDev({ dossier, api, port, editeur, sortie }) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || PORTS_INTERDITS.has(port)) throw new Error(`Port d'interface refusé : ${port}.`);
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(String(api))) throw new Error(`Serveur isolé attendu sur http://127.0.0.1:<port>, pas « ${api} ».`);
  const e = enfant('dev', { dossier, api, port, editeur }, { delaiMs: SERVIR_MS, sortie });
  try {
    const r = await e.pret;
    return { url: `http://127.0.0.1:${r.port}`, port: r.port, arreter: e.arreter, lignes: e.lignes };
  } catch (err) {
    await e.arreter();
    throw err;
  }
}

// --- Processus enfant : les commandes Vite ---

async function commandePreparer({ dossier }) {
  const vite = await import(pathToFileURL(VITE).href);
  const commun = { root: CLIENT, configFile: CONFIG, cacheDir: path.join(dossier, 'cache'), logLevel: 'warn', clearScreen: false };
  await vite.build({ ...commun, build: { outDir: path.join(dossier, 'dist'), emptyOutDir: true } });
  // Liste des modules : le fichier même que charge l'interface, transformé par Vite (JSX) sans serveur réseau
  const ssr = await vite.createServer({
    ...commun,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { modules } = await ssr.ssrLoadModule('/src/modules/index.js');
    if (!Array.isArray(modules) || !modules.length) throw new Error('client/src/modules/index.js : liste des modules vide ou illisible.');
    return { modules: decrireModules(modules) };
  } finally {
    await ssr.close();
  }
}

async function commandeServir({ dossier, api, port }) {
  const vite = await import(pathToFileURL(VITE).href);
  const commun = { root: CLIENT, configFile: CONFIG, cacheDir: path.join(dossier, 'cache'), logLevel: 'warn', clearScreen: false };
  const config = await vite.resolveConfig({ ...commun, logLevel: 'error' }, 'serve');
  const proxy = proxyDuBanc(config.server.proxy, api);
  const serveur = await vite.preview({
    ...commun,
    build: { outDir: path.join(dossier, 'dist') },
    preview: { host: '127.0.0.1', port, strictPort: true, open: false, proxy },
  });
  const adresse = serveur.httpServer.address();
  if (!adresse || adresse.port !== port) throw new Error(`vite preview écoute sur ${JSON.stringify(adresse)}, pas sur le port ${port}.`);
  // Réglages de sécurité tels que Vite les résout, pour « npm run dev » (server) comme pour preview : false = coupé
  const decrire = (v) => (typeof v === 'boolean' || v == null ? v ?? null : String(v.origin ?? v));
  const securite = { cors: decrire(config.server.cors), corsPreview: decrire(config.preview.cors), hotes: decrire(config.server.allowedHosts) };
  return { port, securite, fermer: () => serveur.close() };
}

async function commandeDev({ dossier, api, port, editeur }) {
  if (editeur) process.env.LAUNCH_EDITOR = editeur; // jamais un vrai éditeur, ni la détection par PowerShell
  const vite = await import(pathToFileURL(VITE).href);
  const { default: brute } = await import(pathToFileURL(CONFIG).href);
  const config = typeof brute === 'function' ? await brute({ command: 'serve', mode: 'development' }) : brute;
  const proxy = proxyDuBanc(config.server?.proxy, api);
  const serveur = await vite.createServer({
    ...config,
    configFile: false,
    root: CLIENT,
    cacheDir: path.join(dossier, 'cache-dev'),
    logLevel: 'warn',
    clearScreen: false,
    server: { ...config.server, port, strictPort: true, open: false, proxy, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await serveur.listen();
  const adresse = serveur.httpServer.address();
  if (!adresse || adresse.port !== port || adresse.address !== '127.0.0.1') throw new Error(`Serveur de développement sur ${JSON.stringify(adresse)}, pas sur 127.0.0.1:${port}.`);
  return { port, fermer: () => serveur.close() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === ICI && process.argv.includes('--enfant') && process.send) {
  let fermer = null;
  let fini = false;
  const stop = async (code = 0) => {
    if (fini) return;
    fini = true;
    try { await fermer?.(); } catch { /* déjà fermé */ }
    process.exit(code);
  };
  process.on('disconnect', () => stop(0)); // le banc a disparu : on ne reste pas derrière lui
  process.on('message', async (m) => {
    if (m?.type === 'arret') return stop(0);
    if (!m?.commande || fermer) return;
    try {
      if (m.commande === 'preparer') {
        const r = await commandePreparer(m);
        process.send({ type: 'pret', ...r });
      } else if (m.commande === 'servir') {
        const r = await commandeServir(m);
        fermer = r.fermer;
        process.send({ type: 'pret', port: r.port, securite: r.securite });
      } else if (m.commande === 'dev') {
        const r = await commandeDev(m);
        fermer = r.fermer;
        process.send({ type: 'pret', port: r.port });
      } else {
        throw new Error(`commande inconnue : ${m.commande}`);
      }
    } catch (err) {
      try { process.send({ type: 'erreur', message: err?.message || String(err) }); } catch { /* canal fermé */ }
      setTimeout(() => stop(1), 100);
    }
  });
}
