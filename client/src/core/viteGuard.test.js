// Garde de l'interface (client/viteGuard.js) et réglages de sécurité de client/vite.config.js : route de l'éditeur
// coupée, requêtes d'un autre site refusées (cadre, image, script), pages non encadrables, fichiers servis par /@fs/
// limités au client et aux paquets, écoute sur 127.0.0.1 seulement.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE_A_REVALIDER, CACHE_IMMUABLE, SECURITY_HEADERS, allowedFsDirs, cacheControl, cacheMiddleware, fsEchappe, fsGuardMiddleware, fsUrlPath, guardMiddleware, guardPlugin, isTopLevelNavigation, normalizedPath, realAllowedDirs, reponseImmuable, uiRefusal, DEMO_FRAME_HEADERS, isDemoHud } from '../../viteGuard.js';
import config from '../../vite.config.js';

const CLIENT = fileURLToPath(new URL('../../', import.meta.url));
const RACINE = path.resolve(CLIENT, '..');
const HOTE = '127.0.0.1:5173';
const req = (url, headers = {}) => ({ url, headers: { host: HOTE, ...headers } });
const IMAGE_AILLEURS = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image', origin: 'https://evil.example' };

test("/__open-in-editor : toujours 404, quelle que soit l'écriture de l'adresse ou l'origine", () => {
  for (const url of ['/__open-in-editor?file=C:/Windows/win.ini', '/__OPEN-IN-EDITOR?file=x', '/%5F_open-in-editor?file=x', '//__open-in-editor?file=x', '/__open-in-editor/', '/__open-in-editor', '\\__open-in-editor?file=x']) {
    assert.equal(uiRefusal(req(url))?.status, 404, url);
    assert.equal(uiRefusal(req(url, IMAGE_AILLEURS))?.status, 404, `${url} (autre site)`);
  }
  assert.equal(uiRefusal(req('/__open-in-editor-pas-vraiment')), null, 'un autre nom ne la désigne pas');
});

test('un autre site ou un autre port de ce PC : cadre, image, script et fetch refusés, lien suivi accepté', () => {
  for (const site of ['cross-site', 'same-site', 'CROSS-SITE']) {
    for (const [mode, dest] of [['navigate', 'iframe'], ['navigate', 'frame'], ['no-cors', 'image'], ['cors', 'script'], ['cors', 'empty'], ['nested-navigate', 'iframe']]) {
      assert.equal(uiRefusal(req('/escadron', { 'sec-fetch-site': site, 'sec-fetch-mode': mode, 'sec-fetch-dest': dest }))?.status, 403, `${site} ${mode} ${dest}`);
    }
    assert.equal(uiRefusal(req('/escadron', { 'sec-fetch-site': site, 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' })), null, `${site} : lien suivi`);
  }
  assert.ok(isTopLevelNavigation(req('/', { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' })));
  assert.ok(!isTopLevelNavigation(req('/', { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' })));
});

test("Origin étranger ou « null » refusé ; la même origine, sans en-tête ou par l'interface, passe", () => {
  for (const origin of ['https://evil.example', 'null', 'http://localhost:5174', 'http://127.0.0.1:5173.evil.example', 'file://']) {
    assert.equal(uiRefusal(req('/src/main.jsx', { origin }))?.status, 403, origin);
  }
  assert.equal(uiRefusal(req('/src/main.jsx', { origin: 'http://127.0.0.1:5173', 'sec-fetch-site': 'same-origin', 'sec-fetch-dest': 'script' })), null);
  assert.equal(uiRefusal({ url: '/src/main.jsx', headers: { host: 'localhost:5173', origin: 'http://localhost:5173' } }), null);
  assert.equal(uiRefusal(req('/', { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' })), null, 'adresse tapée');
  assert.equal(uiRefusal(req('/')), null, 'curl, overlay, sans en-tête');
});

test("/api passe à la garde du serveur (localGuard), qui a ses propres refus", () => {
  assert.equal(uiRefusal(req('/api/state', IMAGE_AILLEURS)), null);
  assert.equal(uiRefusal(req('/api', IMAGE_AILLEURS)), null);
  assert.equal(uiRefusal(req('/apixyz', IMAGE_AILLEURS))?.status, 403, '/apixyz n’est pas /api');
});

test('chemin normalisé : décodé, minuscules, barres réduites, sans requête', () => {
  assert.equal(normalizedPath('/A%2Fb//C?x=1#y'), '/a/b/c');
  assert.equal(normalizedPath('/%E0%A4%A'), '/%e0%a4%a');
});

test('middleware : en-têtes anti-cadre sur chaque réponse, refus en texte français, suite sinon', () => {
  const reponse = () => {
    const h = {};
    return { h, statusCode: 200, setHeader: (k, v) => (h[k.toLowerCase()] = v), end(b) { this.corps = b; } };
  };
  let suite = 0;
  const ok = reponse();
  guardMiddleware(req('/'), ok, () => (suite += 1));
  assert.equal(suite, 1);
  assert.equal(ok.h['x-frame-options'], 'DENY');
  assert.equal(ok.h['content-security-policy'], "frame-ancestors 'none'");
  const non = reponse();
  guardMiddleware(req('/', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' }), non, () => (suite += 1));
  assert.equal(suite, 1, 'refusée : la suite n’est pas appelée');
  assert.equal(non.statusCode, 403);
  assert.match(non.corps, /autre site/);
});

test('plugin : la garde est branchée avant les middlewares de Vite ; /@fs/ gardé en plus sur le serveur de développement', () => {
  const p = guardPlugin();
  // Serveur de développement : la garde commune, puis la garde /@fs/ (vrai chemin) ; preview : la garde commune seule
  const brDev = [];
  const rDev = p.configureServer({ middlewares: { use: (fn) => brDev.push(fn) }, config: { server: { fs: { allow: [path.resolve(CLIENT)] } } } });
  assert.equal(rDev, undefined, 'configureServer : branchée tout de suite, pas après les middlewares internes');
  assert.equal(brDev.length, 2);
  assert.equal(brDev[0], guardMiddleware, 'la garde commune en premier');
  assert.equal(typeof brDev[1], 'function', 'puis la garde /@fs/');
  const brPrev = [];
  const rPrev = p.configurePreviewServer({ middlewares: { use: (fn) => brPrev.push(fn) } });
  assert.equal(rPrev, undefined);
  assert.deepEqual(brPrev, [guardMiddleware, cacheMiddleware], 'preview : pas de route /@fs/, la garde commune puis le cache des fichiers compilés');
});

test('cache de l’interface compilée : fichiers à empreinte gardés un an, page toujours redemandée, /api laissé au serveur', () => {
  assert.equal(cacheControl('/assets/index-3f9a2b.js'), CACHE_IMMUABLE);
  assert.equal(cacheControl('/assets/index-3f9a2b.css?v=1'), CACHE_IMMUABLE);
  assert.equal(CACHE_IMMUABLE, 'public, max-age=31536000, immutable');
  for (const url of ['/', '/index.html', '/hud/combat', '/builder/build/3', '/favicon.svg']) assert.equal(cacheControl(url), CACHE_A_REVALIDER, url);
  assert.equal(cacheControl('/api/state'), null);
  assert.equal(cacheControl('/API/state'), null);
});

test('cacheMiddleware : pose Cache-Control, retire la compression (tout est sur ce PC), ne touche pas /api', () => {
  const poses = {};
  const res = { setHeader: (k, v) => { poses[k] = v; } };
  const r = { url: '/assets/index-1.js', headers: { host: HOTE, 'accept-encoding': 'gzip, br' } };
  let suite = 0;
  cacheMiddleware(r, res, () => suite++);
  assert.equal(suite, 1);
  assert.equal(poses['Cache-Control'], CACHE_IMMUABLE);
  assert.equal(r.headers['accept-encoding'], undefined);

  const api = { url: '/api/state', headers: { host: HOTE, 'accept-encoding': 'gzip' } };
  const posesApi = {};
  cacheMiddleware(api, { setHeader: (k, v) => { posesApi[k] = v; } }, () => suite++);
  assert.equal(suite, 2);
  assert.deepEqual(posesApi, {});
  assert.equal(api.headers['accept-encoding'], 'gzip');
});

/** Réponse factice qui garde ses en-têtes et ce que writeHead a reçu. */
function fausseReponse() {
  return {
    statusCode: 200,
    entetes: {},
    ecrit: null,
    setHeader(k, v) { this.entetes[k.toLowerCase()] = v; },
    getHeader(k) { return this.entetes[k.toLowerCase()]; },
    writeHead(status, ...reste) { this.ecrit = { status, reste }; return this; },
    end() { if (!this.ecrit) this.writeHead(this.statusCode); },
  };
}

test('cacheMiddleware : un an de cache seulement pour un fichier compilé trouvé, jamais pour une 404 ni une page', () => {
  assert.equal(reponseImmuable(200, 'text/javascript'), true);
  assert.equal(reponseImmuable(304, undefined), true);
  assert.equal(reponseImmuable(404, 'text/plain'), false);
  assert.equal(reponseImmuable(200, 'text/html;charset=utf-8'), false);

  // Fichier trouvé : Vite (sirv) recopie notre Cache-Control dans les en-têtes passés à writeHead
  const trouve = fausseReponse();
  cacheMiddleware({ url: '/assets/index-1.js', headers: {} }, trouve, () => {});
  trouve.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': trouve.getHeader('cache-control') });
  assert.equal(trouve.ecrit.reste[0]['Cache-Control'], CACHE_IMMUABLE);
  assert.equal(trouve.getHeader('cache-control'), CACHE_IMMUABLE);

  // Fichier disparu (ancienne compilation) : 404 par res.end(), sans writeHead explicite
  const absent = fausseReponse();
  cacheMiddleware({ url: '/assets/PlanPage-ancien.js', headers: {} }, absent, () => {});
  absent.statusCode = 404;
  absent.end();
  assert.equal(absent.ecrit.status, 404);
  assert.equal(absent.getHeader('cache-control'), CACHE_A_REVALIDER);

  // Page de repli servie sous /assets/ : pas d'un an non plus, même en-tête passé en minuscules
  const repli = fausseReponse();
  cacheMiddleware({ url: '/assets/inconnu', headers: {} }, repli, () => {});
  const h = { 'content-type': 'text/html;charset=utf-8', 'cache-control': CACHE_IMMUABLE };
  repli.writeHead(200, h);
  assert.equal(h['cache-control'], undefined);
  assert.equal(h['Cache-Control'], CACHE_A_REVALIDER);
});

test('fsUrlPath : chemin de /@fs/ décodé (decodeURI), barres avant, requête retirée ; sinon null', () => {
  assert.equal(fsUrlPath('/@fs/C:/Users/x/fichier.js'), 'C:/Users/x/fichier.js');
  assert.equal(fsUrlPath('/@fs/C:/a%20b/c.js?import'), 'C:/a b/c.js');
  assert.equal(fsUrlPath('/@fs/C:/nm/%2e%2e/server/x'), 'C:/nm/../server/x');
  assert.equal(fsUrlPath('/@fs/C:\\nm\\pkg/x'), 'C:/nm/pkg/x');
  assert.equal(fsUrlPath('/@fs//srv/share/x?raw#y'), '/srv/share/x'); // barres de tête réduites, comme Vite
  assert.equal(fsUrlPath('/src/main.jsx'), null);
  assert.equal(fsUrlPath('/escadron'), null);
  assert.equal(fsUrlPath('/@fs'), null);
});

test('fsEchappe + realAllowedDirs : le vrai chemin (jonction suivie) décide, pas l’écriture de l’adresse', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-fsguard-'));
  try {
    const permis = path.join(base, 'client');
    const secret = path.join(base, 'secret');
    fs.mkdirSync(path.join(permis, 'src'), { recursive: true });
    fs.mkdirSync(secret, { recursive: true });
    fs.writeFileSync(path.join(permis, 'src', 'ok.js'), 'export default 1;');
    fs.writeFileSync(path.join(secret, 'jeton.json'), '{"token":"FAUX"}');
    // Jonction DANS le dossier permis, pointant hors de lui (comme node_modules/elite-companion-server → server/)
    const lien = path.join(permis, 'lien');
    fs.symlinkSync(secret, lien, 'junction');
    const reels = realAllowedDirs([permis]);
    assert.equal(reels.length, 1);
    assert.ok(!fsEchappe(path.join(permis, 'src', 'ok.js'), reels), 'un fichier du dossier permis passe');
    assert.ok(fsEchappe(path.join(lien, 'jeton.json'), reels), 'par la jonction, le vrai chemin sort : refusé');
    assert.ok(fsEchappe(path.join(permis, 'src', '..', '..', 'secret', 'jeton.json'), reels), '« .. » retombe hors du dossier : refusé');
    assert.ok(fsEchappe(path.join(base, 'ailleurs', 'x'), reels), 'un dossier voisin (inexistant) : refusé');
    // UNC / espace de noms : refusé sans résoudre le chemin (pas de connexion SMB déclenchée par la garde)
    for (const unc of ['\\\\hote\\partage\\x', '//hote/partage/x', '\\\\.\\C:\\x', '\\\\?\\C:\\x']) {
      assert.ok(fsEchappe(unc, reels), `chemin UNC refusé : ${unc}`);
    }
  } finally {
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 5 });
  }
});

test('fsGuardMiddleware : 403 pour un /@fs/ qui échappe, passe sinon et hors /@fs/', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-fsmw-'));
  try {
    const permis = path.join(base, 'client');
    const secret = path.join(base, 'secret');
    fs.mkdirSync(permis, { recursive: true });
    fs.mkdirSync(secret, { recursive: true });
    fs.writeFileSync(path.join(permis, 'ok.js'), '1');
    fs.writeFileSync(path.join(secret, 'jeton.json'), '{"token":"FAUX"}');
    fs.symlinkSync(secret, path.join(permis, 'lien'), 'junction');
    const mw = fsGuardMiddleware(realAllowedDirs([permis]));
    const rep = () => { const h = {}; return { h, statusCode: 200, setHeader: (k, v) => (h[k.toLowerCase()] = v), end(b) { this.corps = b; } }; };
    const req = (url) => ({ url, headers: { host: '127.0.0.1:5173' } });
    const viaFs = (p) => `/@fs/${p.replace(/\\/g, '/')}`;

    let suites = 0;
    const refuse = rep();
    mw(req(viaFs(path.join(permis, 'lien', 'jeton.json'))), refuse, () => (suites += 1));
    assert.equal(suites, 0, 'un fichier hors des dossiers permis : la suite n’est pas appelée');
    assert.equal(refuse.statusCode, 403);
    assert.equal(refuse.h['x-content-type-options'], 'nosniff');
    assert.match(refuse.corps, /hors du client/);

    mw(req(viaFs(path.join(permis, 'ok.js'))), rep(), () => (suites += 1));
    mw(req('/src/main.jsx'), rep(), () => (suites += 1)); // pas une requête /@fs/
    assert.equal(suites, 2, 'le fichier permis et la route hors /@fs/ passent');
  } finally {
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 5 });
  }
});

test('vite.config.js : garde en premier, 127.0.0.1, port strict, sans CORS, en-têtes anti-cadre, /@fs/ limité', () => {
  assert.equal(config.plugins[0]?.name, 'elite-garde', 'la garde passe avant tous les autres plugins');
  assert.equal(config.server.host, '127.0.0.1');
  assert.equal(config.server.port, 5173);
  assert.equal(config.server.strictPort, true);
  assert.equal(config.server.cors, false);
  assert.deepEqual(config.server.headers, SECURITY_HEADERS);
  assert.deepEqual(config.preview.headers, SECURITY_HEADERS);
  assert.equal(config.preview.host, '127.0.0.1');
  assert.equal(config.server.fs.strict, true);
  const allow = config.server.fs.allow.map((d) => path.resolve(d).toLowerCase());
  assert.ok(allow.includes(path.resolve(CLIENT).toLowerCase()), 'le client');
  for (const interdit of [RACINE, path.join(RACINE, 'server'), path.join(RACINE, 'server', 'data'), path.join(RACINE, '.git'), path.join(RACINE, 'scripts')]) {
    const i = path.resolve(interdit).toLowerCase();
    assert.ok(!allow.some((d) => i === d || i.startsWith(`${d}${path.sep}`)), `${interdit} n'est pas servi par /@fs/`);
  }
  assert.deepEqual(Object.keys(config.server.proxy), ['/api']);
});

test('dossiers permis : chemins réels, sans doublon ; les node_modules seulement s’ils existent', () => {
  const dirs = allowedFsDirs(CLIENT);
  assert.equal(new Set(dirs).size, dirs.length);
  assert.ok(dirs.every((d) => !d.includes('\\')));
  // La déclaration des modes (server/src/core/modes.js), et elle seule du serveur : servie par /@fs/ ; un autre fichier
  // du serveur, non
  const reels = realAllowedDirs(dirs);
  const modes = path.resolve(CLIENT, '..', 'server', 'src', 'core', 'modes.js');
  assert.equal(fsEchappe(modes, reels), false, 'modes.js servi : sans lui, l’interface reste noire');
  assert.equal(fsEchappe(path.resolve(CLIENT, '..', 'server', 'src', 'core', 'shipRoles.js'), reels), true);
  assert.equal(fsEchappe(path.resolve(CLIENT, '..', 'server', 'src', 'index.js'), reels), true);
  const absent = path.join(os.tmpdir(), `elite-absent-${process.pid}`, 'client');
  assert.deepEqual(allowedFsDirs(absent), [absent.replace(/\\/g, '/')]);
});

test('seule la démonstration d’une fenêtre en jeu peut être encadrée, et seulement par l’app elle-même', () => {
  for (const oui of ['/hud/waypoints?demo=1', '/hud/waypoints-sweep?demo', '/HUD/glance?x=1&demo=1']) assert.equal(isDemoHud(oui), true, oui);
  for (const non of ['/hud/waypoints', '/hud/waypoints?demonstration=1', '/?demo=1', '/escadron?demo=1', '/hud/a/b?demo=1', '/hud/?demo=1', '/hud/..%2Fescadron?demo=1', '/api/state?demo=1', '/hud/waypoints#?demo=1']) {
    assert.equal(isDemoHud(non), false, non);
  }
  assert.deepEqual(DEMO_FRAME_HEADERS, { 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "frame-ancestors 'self'" });
  const reponse = () => {
    const h = {};
    return { h, statusCode: 200, setHeader: (k, v) => (h[k.toLowerCase()] = v), end(b) { this.corps = b; } };
  };
  const demo = reponse();
  guardMiddleware(req('/hud/waypoints?demo=1'), demo, () => {});
  assert.equal(demo.h['x-frame-options'], 'SAMEORIGIN');
  assert.equal(demo.h['content-security-policy'], "frame-ancestors 'self'");
  const vraie = reponse();
  guardMiddleware(req('/hud/waypoints'), vraie, () => {});
  assert.equal(vraie.h['x-frame-options'], 'DENY', 'la vraie fenêtre, elle, ne s’encadre jamais');
  // Encadrée depuis un autre site : toujours refusée (règle 2), démonstration ou non
  const ailleurs = reponse();
  let suite = 0;
  guardMiddleware(req('/hud/waypoints?demo=1', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' }), ailleurs, () => (suite += 1));
  assert.equal(suite, 0);
  assert.equal(ailleurs.statusCode, 403);
});
