// Essai de l'overlay dans le vrai Electron (étape 26-overlay) : sert une page de sonde comme interface du banc, lance
// Electron sur entree.cjs (le vrai overlay/main.js, rien d'affiché ni de pris sur le PC du joueur), puis juge ce que la
// page a pu faire et ce que main.js a répondu.
//
// La page de sonde fait ce que ferait une page piégée : demander micro, caméra, notifications et presse-papiers, lister
// les périphériques, appeler un autre port de ce PC (fetch, image, WebSocket), ouvrir un cadre qui navigue ailleurs puis
// vers mailto:, partir vers une autre page, et demander d'elle-même au pont une photo de l'écran, une copie, le clavier
// (mode déplacement) et toute la hauteur de l'écran. Puis elle se recharge, comme le demande Vite après une mise à jour.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const ENTREE = path.join(ICI, 'entree.cjs');
const DELAI_MS = 60_000;
const GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Exécutable d'Electron installé pour l'overlay (node_modules, en lecture seule). */
export function executableElectron(racine) {
  const exe = createRequire(path.join(racine, 'overlay', 'package.json'))('electron');
  if (typeof exe !== 'string' || !fs.existsSync(exe)) throw new Error('Electron introuvable : lance npm install dans l’app principale.');
  return exe;
}

// #root marqué comme une page React montée : sinon la garde de main.js (React pas monté au bout de 5 s : rechargée,
// 6 fois au plus) rechargeait la sonde et les pages vides en plus du rechargement voulu par la sonde.
const RACINE_MONTEE = '<div id="root"></div><script>document.getElementById("root").__reactContainer$banc = true;</script>';

/** Page de sonde de la fenêtre Combat (les autres fenêtres reçoivent une page vide). */
export function pageSonde(ailleurs) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Sonde du banc</title></head><body>${RACINE_MONTEE}<script>
(async () => {
  const dire = (o) => console.info('BANC:' + JSON.stringify(o));
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  if (sessionStorage.getItem('banc-recharge')) return dire({ etape: 'rechargee' });
  const r = { etape: 'essais' };
  const pont = window.eliteOverlay;
  r.pont = Object.keys(pont || {}).sort();
  r.permissions = {};
  for (const name of ['camera', 'microphone', 'notifications', 'geolocation', 'clipboard-read']) {
    try { r.permissions[name] = (await navigator.permissions.query({ name })).state; } catch (e) { r.permissions[name] = 'erreur ' + e.name; }
  }
  r.notification = { etat: Notification.permission, demande: await Notification.requestPermission().catch((e) => 'erreur ' + e.name) };
  try {
    const d = await navigator.mediaDevices.enumerateDevices();
    r.peripheriques = { nombre: d.length, avecNom: d.filter((x) => x.label).length };
  } catch (e) { r.peripheriques = { nombre: 0, avecNom: 0, erreur: e.name }; }
  try { await navigator.clipboard.readText(); r.lecturePressePapiers = 'lu'; } catch (e) { r.lecturePressePapiers = 'refus ' + e.name; }
  const essai = async (fn) => { try { await fn(); return 'passé'; } catch { return 'bloqué'; } };
  const image = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res('passé'); i.onerror = () => res('bloqué'); i.src = src; });
  r.fetchAilleurs = await essai(() => fetch(${JSON.stringify(ailleurs)} + '/fuite-fetch', { mode: 'no-cors' }));
  r.fetchIci = await essai(async () => { const x = await fetch('/api/banc'); if (!x.ok) throw new Error(String(x.status)); });
  r.imageAilleurs = await image(${JSON.stringify(ailleurs)} + '/fuite-image.gif');
  r.imageIci = await image('/banc.gif');
  r.imageData = await image('data:image/gif;base64,${GIF}');
  r.wsAilleurs = await new Promise((res) => {
    setTimeout(() => res('délai'), 3000);
    try { const w = new WebSocket(${JSON.stringify(ailleurs.replace(/^http/, 'ws'))} + '/fuite-ws'); w.onopen = () => { w.close(); res('passé'); }; w.onerror = () => res('bloqué'); } catch { res('bloqué'); }
  });
  const cadre = document.createElement('iframe');
  cadre.src = '/fuite-cadre';
  document.body.appendChild(cadre);
  await pause(800);
  cadre.src = 'mailto:controle@example.invalid';
  await pause(800);
  r.modeDeplacement = [];
  pont?.onEditMode((on) => r.modeDeplacement.push(on));
  r.capture = await pont?.capture();
  pont?.fitHeight(900);
  pont?.copy('copie de la sonde');
  pont?.toggleEdit();
  console.error('marque-erreur-du-banc');
  await pause(500);
  dire(r);
  location.assign('/fuite-navigation');
  await pause(1000);
  dire({ etape: 'apres-navigation', chemin: location.pathname });
  sessionStorage.setItem('banc-recharge', '1');
  location.reload();
})().catch((e) => console.info('BANC:' + JSON.stringify({ etape: 'exception', message: String((e && e.stack) || e) })));
</script></body></html>`;
}

const PAGE_VIDE = `<!doctype html><html><head><meta charset="utf-8"><title>Fenêtre du banc</title></head><body>${RACINE_MONTEE}</body></html>`;

/** Serveur local du banc : rend { port, url, requetes, fermer() } ; `repondre(req, res)` sert chaque requête. */
function serveur(repondre) {
  const requetes = [];
  const s = http.createServer((req, res) => {
    requetes.push({ methode: req.method, chemin: req.url });
    repondre(req, res);
  });
  s.on('upgrade', (req, socket) => {
    requetes.push({ methode: 'UPGRADE', chemin: req.url });
    socket.destroy();
  });
  return new Promise((resolve, reject) => {
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      resolve({ port, url: `http://127.0.0.1:${port}`, requetes, fermer: () => new Promise((r) => { s.closeAllConnections?.(); s.close(() => r()); }) });
    });
  });
}

/**
 * Lance l'essai sur le dossier `overlay` (celui du dépôt par défaut). Rend { rapport (ce qu'a noté entree.cjs),
 * interface (requêtes reçues par l'interface du banc), ailleurs (requêtes reçues par l'autre port : aucune attendue),
 * sortie (lignes d'Electron) }.
 */
export async function essayerOverlay({ racine, overlay = path.join(racine, 'overlay'), exe = executableElectron(racine), sortie = () => {} }) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-controle-electron-'));
  const ailleurs = await serveur((_req, res) => res.end('fuite'));
  let iface = null;
  const lignes = [];
  // Canal des ordres (overlay/canal.js) : le vrai client de l'overlay se branche ici (ELITE_PORT, jamais le port de
  // l'app du joueur) ; entree.cjs fait écrire ses ordres d'essai dans ce flux (/banc/ordre), comme le serveur de l'app.
  const canal = new Set();
  try {
    iface = await serveur((req, res) => {
      const url = new URL(req.url, 'http://x');
      const chemin = url.pathname;
      if (chemin === '/api/overlay/stream') {
        if (req.headers['x-elite-compagnon'] !== '1') return res.writeHead(403).end();
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
        res.write(': canal du banc\n\n');
        canal.add(res);
        res.on('close', () => canal.delete(res));
        return undefined;
      }
      if (chemin === '/banc/canal') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ branches: canal.size }));
      if (chemin === '/banc/ordre') {
        let args = null;
        try {
          args = JSON.parse(url.searchParams.get('args') || 'null');
        } catch {
          // illisible : rien d'écrit
        }
        let remis = 0;
        if (Array.isArray(args)) {
          for (const r of canal) {
            r.write(`data: ${JSON.stringify({ args })}\n\n`);
            remis += 1;
          }
        }
        return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ remis }));
      }
      if (chemin === '/hud/combat') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(pageSonde(ailleurs.url));
      if (chemin.startsWith('/hud/')) return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE_VIDE);
      if (chemin === '/api/banc' || chemin === '/api/state') return res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
      if (chemin === '/banc.gif') return res.writeHead(200, { 'content-type': 'image/gif' }).end(Buffer.from(GIF, 'base64'));
      if (chemin === '/fuite-navigation') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><script>console.info(\'BANC:{"etape":"navigation-passee"}\')</script>');
      return res.writeHead(404).end();
    });
    // Petite app Electron temporaire : son nom et ses dossiers, jamais ceux de l'overlay du joueur
    const app = path.join(dossier, 'app');
    fs.mkdirSync(app);
    fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'elite-controle-overlay', private: true, main: 'index.cjs' }));
    fs.writeFileSync(path.join(app, 'index.cjs'), `require(${JSON.stringify(ENTREE)});\n`);
    const rapport = path.join(dossier, 'rapport.json');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    for (const k of Object.keys(env)) if (/^(ELITE_|NODE_OPTIONS$|NODE_TEST_CONTEXT$)/.test(k)) delete env[k];
    // Le « serveur de l'app » de l'overlay du banc est ce serveur-ci (canal, vue du jeu…) : jamais l'app du joueur (3001)
    env.ELITE_PORT = String(iface.port);
    // overlay/main.js range ses données dans %APPDATA%Elite Compagnonoverlay, et y pose son verrou d'instance : sans
    // un APPDATA à part, l'overlay du banc tombait sur celui du joueur et lui transmettait ses ordres d'essai
    env.APPDATA = path.join(dossier, 'appdata');
    fs.mkdirSync(env.APPDATA, { recursive: true });
    const args = [app, `--banc-origine=${iface.url}`, `--banc-rapport=${rapport}`, `--banc-donnees=${path.join(dossier, 'donnees')}`, `--banc-overlay=${overlay}`];
    const proc = spawn(exe, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const flux of [proc.stdout, proc.stderr]) {
      flux.setEncoding('utf8');
      flux.on('data', (d) => {
        for (const l of String(d).split(/\r?\n/)) {
          if (!l.trim()) continue;
          lignes.push(l);
          sortie(l);
        }
      });
    }
    const code = await new Promise((resolve) => {
      const minuterie = setTimeout(() => {
        proc.kill();
        resolve('délai');
      }, DELAI_MS);
      proc.on('error', (err) => {
        clearTimeout(minuterie);
        resolve(`erreur ${err.message}`);
      });
      proc.on('exit', (c, signal) => {
        clearTimeout(minuterie);
        resolve(c ?? signal);
      });
    });
    if (!fs.existsSync(rapport)) throw new Error(`Electron s'est arrêté sans rapport (code ${code}).\n${lignes.slice(-30).join('\n')}`);
    return { rapport: JSON.parse(fs.readFileSync(rapport, 'utf8')), interface: iface.requetes, ailleurs: ailleurs.requetes, sortie: lignes, code };
  } finally {
    await iface?.fermer();
    await ailleurs.fermer();
    fs.rmSync(dossier, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}

/**
 * Constats de l'essai : [{ nom, attendu, ecart }] (ecart : null si conforme). Fonction pure, testée à part
 * (tests/electron.test.mjs) sur un rapport conforme et sur celui de l'overlay d'avant les gardes.
 */
export function juger({ rapport, interface: recues, ailleurs }) {
  const c = [];
  const constat = (nom, attendu, ecart) => c.push({ nom, attendu, ecart: ecart || null });
  const page = rapport.pages.find((p) => p.etape === 'essais' && /\/hud\/combat$/.test(p.url)) || null;
  const chemins = recues.map((r) => new URL(r.chemin, 'http://x').pathname);
  constat('Essai mené jusqu’au bout', 'page de sonde jouée, rapport complet, aucune erreur', [
    !page && 'la page de sonde n’a rien rapporté',
    rapport.fin !== 'fin de l’essai' && `fin : ${rapport.fin}`,
    ...rapport.erreurs,
    ...rapport.pages.filter((p) => p.etape === 'exception').map((p) => `exception de la page : ${p.message}`),
  ].filter(Boolean).join(' ; '));
  if (!page) return c;

  const g = rapport.gestionnaires;
  constat('Permissions : gestionnaires posés', 'demandes, vérifications, périphériques et requêtes', ['demande', 'verification', 'peripheriques', 'requetes'].filter((k) => !g[k]).map((k) => `pas de gestionnaire « ${k} »`).join(', '));
  const accordees = rapport.demandes.filter((d) => d.accordee).map((d) => d.permission);
  constat('Permissions : toute demande refusée par main.js', 'aucune accordée (notifications au moins demandée)', [
    accordees.length && `accordées : ${[...new Set(accordees)].join(', ')}`,
    rapport.sansGestionnaire.length && `sans gestionnaire, Electron aurait accordé : ${[...new Set(rapport.sansGestionnaire)].join(', ')}`,
    !rapport.demandes.length && !rapport.sansGestionnaire.length && 'aucune demande vue (la sonde n’a rien demandé ?)',
  ].filter(Boolean).join(' ; '));
  const etats = Object.entries(page.permissions).filter(([, s]) => s === 'granted').map(([n]) => n);
  constat('Permissions vues par la page', 'micro, caméra, notifications, position, presse-papiers : jamais « granted »', etats.length ? `accordées : ${etats.join(', ')}` : null);
  constat('Notifications', 'refusées (état et demande)', page.notification.etat === 'denied' && page.notification.demande === 'denied' ? null : `état ${page.notification.etat}, demande ${page.notification.demande}`);
  constat('Périphériques (micro, caméra)', 'aucun nom visible', page.peripheriques.avecNom ? `${page.peripheriques.avecNom} sur ${page.peripheriques.nombre} avec leur nom` : null);
  constat('Lecture du presse-papiers', 'refusée', page.lecturePressePapiers === 'lu' ? 'lu par la page' : null);
  constat('Requêtes vers un autre port de ce PC', 'fetch, image et WebSocket bloqués, rien reçu de l’autre côté', [
    page.fetchAilleurs !== 'bloqué' && `fetch ${page.fetchAilleurs}`,
    page.imageAilleurs !== 'bloqué' && `image ${page.imageAilleurs}`,
    page.wsAilleurs !== 'bloqué' && `WebSocket ${page.wsAilleurs}`,
    ailleurs.length && `reçu : ${ailleurs.map((r) => `${r.methode} ${r.chemin}`).join(', ')}`,
  ].filter(Boolean).join(' ; '));
  constat('Requêtes vers l’interface', 'fetch et image passent (la garde ne casse pas les pages)', [page.fetchIci !== 'passé' && `fetch ${page.fetchIci}`, page.imageIci !== 'passé' && `image ${page.imageIci}`, page.imageData !== 'passé' && `image data: ${page.imageData}`].filter(Boolean).join(' ; '));
  const externes = rapport.demandes.filter((d) => d.permission === 'openExternal' && d.accordee);
  constat('Cadre inclus (iframe)', 'ne navigue jamais : ni autre page, ni application externe (mailto:)', [
    chemins.includes('/fuite-cadre') && 'le cadre a chargé /fuite-cadre',
    externes.length && `ouverture externe accordée : ${externes.map((d) => d.url).join(', ')}`,
  ].filter(Boolean).join(' ; '));
  const apres = rapport.pages.find((p) => p.etape === 'apres-navigation');
  constat('Cadre principal : autre page', 'navigation refusée, la page reste', [
    chemins.includes('/fuite-navigation') && 'la page est partie vers /fuite-navigation',
    rapport.pages.some((p) => p.etape === 'navigation-passee') && 'page étrangère chargée',
    apres?.chemin !== '/hud/combat' && `chemin après : ${apres?.chemin ?? 'aucun rapport'}`,
  ].filter(Boolean).join(' ; '));
  const chargements = chemins.filter((p) => p === '/hud/combat').length;
  constat('Cadre principal : rechargement (Vite)', 'permis : page servie deux fois, rechargée', chargements === 2 && rapport.pages.some((p) => p.etape === 'rechargee') ? null : `page servie ${chargements} fois${rapport.pages.some((p) => p.etape === 'rechargee') ? '' : ', jamais rechargée'}`);
  constat('Pont : photo de l’écran demandée par la page', 'refusée, aucune photo prise', page.capture !== null || rapport.captures ? `réponse ${JSON.stringify(page.capture)?.slice(0, 60)}, ${rapport.captures} photo(s)` : null);
  constat('Pont : copie demandée par une autre fenêtre que le Coup d’œil', 'refusée, presse-papiers intact', rapport.copies.length ? `copié : ${rapport.copies.join(' | ').slice(0, 80)}` : null);
  constat('Pont : mode déplacement (clavier) demandé par la page seule', 'refusé, jamais le focus', page.modeDeplacement.includes(true) || rapport.focus ? `mode ${JSON.stringify(page.modeDeplacement)}, focus ${rapport.focus}` : null);
  constat('Pont : hauteur demandée par Combat', 'ignorée (hauteur de départ)', rapport.hauteurs.apres === rapport.hauteurs.depart ? null : `hauteur ${rapport.hauteurs.depart} → ${rapport.hauteurs.apres}`);
  constat('Console des pages', 'erreur de la page écrite par main.js', rapport.journal.some((l) => l.includes('[combat] marque-erreur-du-banc')) ? null : 'erreur de la page absente du terminal');
  constat('Fermée puis rouverte aussitôt', 'une seule fenêtre, fermée par l’ordre suivant', rapport.course.avant === 1 && rapport.course.apresCourse === 1 && rapport.course.apresFermeture === 0 ? null : `avant : ${rapport.course.avant}, après la course : ${rapport.course.apresCourse}, après l’ordre de fermeture : ${rapport.course.apresFermeture}${rapport.course.apresFermeture ? ' (orpheline)' : ''}`);
  constat('Ordres qui se croisent', 'le plus ancien arrivé en dernier est ignoré, le suivant appliqué', rapport.ordres.apresPerime === 1 && rapport.ordres.apresRecent === 0 ? null : `après l’ordre périmé : ${rapport.ordres.apresPerime} fenêtre(s), après le récent : ${rapport.ordres.apresRecent}`);
  constat('Ordre --if-running', 'appliqué par l’overlay qui tourne (fenêtre ouverte, puis fermée)', rapport.ordres.siLance === 1 && rapport.ordres.siLanceFerme === 0 ? null : `ouverte : ${rapport.ordres.siLance}, puis : ${rapport.ordres.siLanceFerme}`);
  const k = rapport.canal || {};
  constat('Canal du serveur (overlay/canal.js)', 'branché, ordres reçus par lui ; Signaux rangée (cachée, pas détruite) puis réaffichée : la même fenêtre', [
    !k.branche && 'jamais branché sur le serveur du banc',
    k.branche && !k.ouverte && 'ordre du canal non appliqué (Signaux pas ouverte)',
    k.ouverte && !k.rangee && 'Signaux détruite au lieu d’être rangée',
    k.rangee && !k.memeFenetre && 'Signaux recréée au lieu d’être réaffichée',
    k.memeFenetre && !k.reaffichee && 'Signaux jamais réaffichée',
  ].filter(Boolean).join(' ; '));
  return c;
}
