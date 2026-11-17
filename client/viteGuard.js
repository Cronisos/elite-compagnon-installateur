// Garde de l'interface (Vite) : ce que server/src/core/localGuard.js est à l'API, pour les pages, les modules et les
// routes internes de Vite. Vaut pour le serveur de développement (npm run dev, « Lancer EliteApp.cmd ») comme pour
// vite preview (banc de contrôle). Branchée par client/vite.config.js (plugin « elite-garde »).
//
// Le serveur de développement de Vite ne vérifie que l'en-tête Host. Sans cette garde, n'importe quel site ouvert dans
// le navigateur pouvait, sans un clic :
//   - faire lancer un éditeur par cmd.exe sur un fichier de son choix (<img src=".../__open-in-editor?file=...">),
//     après un PowerShell synchrone qui fige toute l'interface et l'overlay une demi-seconde par requête ;
//   - encadrer une page de l'app sous un faux bouton (clickjacking) : le clic part avec l'origine de l'app.
//
// Règles, dans l'ordre (les requêtes /api passent : la garde du serveur s'en charge, avec ses propres refus) :
//   1. /__open-in-editor : 404, toujours (l'app n'ouvre jamais d'éditeur, même pour une requête de l'interface).
//   2. Sec-Fetch-Site cross-site ou same-site (autre site, ou autre port de ce PC) : 403, sauf une navigation de
//      premier niveau (un lien suivi, Sec-Fetch-Mode navigate et Sec-Fetch-Dest document). Un cadre (iframe), une
//      image, un script ou une requête fetch d'ailleurs sont refusés.
//   3. Origin présent et différent de l'interface elle-même (même Host) : 403. « null » (fichier local, cadre isolé)
//      aussi.
// Et sur chaque réponse : X-Frame-Options DENY et Content-Security-Policy frame-ancestors 'none' (aucune page de
// l'app ne s'affiche dans un cadre, même de la même origine).
//
// Une seule exception, étroite : la démonstration d'une fenêtre en jeu, « /hud/<page>?demo=… », que la page
// « Fenêtres en jeu » montre dans un cadre pour son tutoriel. Elle reçoit SAMEORIGIN et frame-ancestors 'self' : seule
// une page de l'app elle-même peut l'encadrer (la règle 2 refuse déjà tout cadre venu d'ailleurs). Une fenêtre en
// démonstration ne lit aucune donnée du joueur et n'écrit rien (client/src/core/demo.js) : l'encadrer sous un faux
// bouton ne donnerait rien à cliquer.
//
// En plus, sur le seul serveur de développement (fsGuardMiddleware, branché par le plugin) : /@fs/ ne sert un fichier
// que si son VRAI chemin (realpath, liens et jonctions suivis) reste dans les dossiers réels autorisés (le client, les
// paquets). La liste fs.allow de Vite ne compare que des chaînes : dans une worktree, node_modules contient des
// jonctions d'espace de travail (elite-companion-server/-overlay/-client → server/, overlay/, client/), si bien que
// /@fs/<node_modules>/elite-companion-server/data/escadron-jeton.json servait le jeton en clair. Les noms courts 8.3
// (ELITE-~1), les flux NTFS (::$INDEX_ALLOCATION), « .. » et « %2e%2e » contournent de même un refus par motif. En
// résolvant le vrai chemin, toutes ces écritures retombent sur le même fichier, refusé s'il sort des dossiers permis.

import fs from 'node:fs';
import path from 'node:path';

/** En-têtes posés sur chaque réponse de l'interface. */
export const SECURITY_HEADERS = Object.freeze({
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
});

/** En-têtes de la seule page encadrable : la démonstration d'une fenêtre en jeu, dans une page de l'app elle-même. */
export const DEMO_FRAME_HEADERS = Object.freeze({
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "frame-ancestors 'self'",
});

/** « /hud/<page>?demo=… » : la démonstration d'une fenêtre en jeu, et rien d'autre (ni « /hud/x/y », ni sans « demo »). */
export function isDemoHud(url) {
  const brut = String(url ?? '').split('#')[0]; // un fragment n'est pas une demande
  const q = brut.indexOf('?');
  if (q < 0) return false;
  const recherche = brut.slice(q + 1);
  if (!new URLSearchParams(recherche).has('demo')) return false;
  return /^\/hud\/[a-z0-9-]{1,40}$/.test(normalizedPath(brut));
}

const EDITOR_ROUTE = '/__open-in-editor';

/** Chemin de l'adresse, décodé, en minuscules, barres répétées réduites (connect compare sans la casse). */
export function normalizedPath(url) {
  let p = String(url ?? '/');
  const q = p.search(/[?#]/);
  if (q >= 0) p = p.slice(0, q);
  try {
    p = decodeURIComponent(p);
  } catch {
    // encodage cassé : comparé tel quel
  }
  return p.replace(/\\/g, '/').replace(/\/{2,}/g, '/').toLowerCase();
}

const header = (req, name) => {
  const v = req.headers?.[name];
  return Array.isArray(v) ? v.join(',') : v == null ? '' : String(v);
};

/** Navigation de premier niveau (lien suivi, adresse tapée) : la page s'ouvre, rien d'autre. */
export function isTopLevelNavigation(req) {
  return header(req, 'sec-fetch-mode').toLowerCase() === 'navigate' && header(req, 'sec-fetch-dest').toLowerCase() === 'document';
}

/**
 * Refus d'une requête faite à l'interface, ou null si elle passe.
 * @returns {{ status: number, message: string } | null}
 */
export function uiRefusal(req) {
  const p = normalizedPath(req.url);
  if (p === EDITOR_ROUTE || p.startsWith(`${EDITOR_ROUTE}/`) || p.startsWith(`${EDITOR_ROUTE}.`)) {
    return { status: 404, message: "Route coupée : l'interface n'ouvre jamais d'éditeur." };
  }
  if (p === '/api' || p.startsWith('/api/')) return null; // garde de l'API (server/src/core/localGuard.js)
  const site = header(req, 'sec-fetch-site').trim().toLowerCase();
  if ((site === 'cross-site' || site === 'same-site') && !isTopLevelNavigation(req)) {
    return { status: 403, message: "Requête refusée : elle vient d'un autre site web ou d'un autre programme de ce PC (cadre, image ou script)." };
  }
  const origin = header(req, 'origin').trim();
  if (origin) {
    const host = header(req, 'host').trim().toLowerCase();
    if (!host || origin.toLowerCase() !== `http://${host}`) {
      return { status: 403, message: "Requête refusée : elle vient d'un site web, pas de l'interface de l'app." };
    }
  }
  return null;
}

/** Middleware connect de la garde : en-têtes de sécurité, puis refus éventuel (texte en français). */
export function guardMiddleware(req, res, next) {
  const demo = isDemoHud(req.url);
  for (const [name, value] of Object.entries(demo ? DEMO_FRAME_HEADERS : SECURITY_HEADERS)) res.setHeader(name, value);
  if (demo) {
    // Vite repose ensuite ses en-têtes fixes (server.headers : DENY) sur la page : pour la démonstration, ceux-ci restent
    const poser = res.setHeader.bind(res);
    const garde = new Set(Object.keys(DEMO_FRAME_HEADERS).map((n) => n.toLowerCase()));
    res.setHeader = (name, value) => (garde.has(String(name).toLowerCase()) ? res : poser(name, value));
  }
  const refusal = uiRefusal(req);
  if (!refusal) return next();
  res.statusCode = refusal.status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(refusal.message);
}

const FS_PREFIX = '/@fs/';

/**
 * Chemin de fichier absolu visé par une adresse /@fs/…, décodé (decodeURI, comme Vite), en barres avant ; null si ce
 * n'est pas une requête /@fs/. La requête et le fragment sont retirés ; les barres de tête répétées sont réduites (Vite
 * fait de même avant de servir).
 */
export function fsUrlPath(url) {
  let p = String(url ?? '');
  const q = p.search(/[?#]/);
  if (q >= 0) p = p.slice(0, q);
  p = p.replace(/^\/{2,}/, '/');
  if (!p.startsWith(FS_PREFIX)) return null;
  let reste = p.slice(FS_PREFIX.length);
  try {
    reste = decodeURI(reste);
  } catch {
    // encodage cassé : tel quel (de toute façon refusé s'il sort des dossiers permis)
  }
  return reste.replace(/\\/g, '/');
}

/** Vrai chemin d'un fichier (realpath), en remontant au premier parent existant ; le reste, inexistant, est concaténé. */
function cheminReel(p) {
  let courant = path.resolve(p);
  const reste = [];
  for (let i = 0; i < 4096; i += 1) {
    try {
      const reel = (fs.realpathSync.native || fs.realpathSync)(courant);
      return path.join(reel, ...reste).replace(/\\/g, '/');
    } catch {
      const parent = path.dirname(courant);
      if (parent === courant) return path.resolve(p).replace(/\\/g, '/');
      reste.unshift(path.basename(courant));
      courant = parent;
    }
  }
  return path.resolve(p).replace(/\\/g, '/');
}

/** Dossiers réels autorisés (realpath, barres avant, minuscules) à partir de la liste fs.allow résolue par Vite. */
export function realAllowedDirs(allow) {
  const out = [];
  for (const d of allow || []) {
    const reel = realDir(d);
    if (reel) out.push(reel.replace(/\\/g, '/').toLowerCase().replace(/\/$/, ''));
  }
  return [...new Set(out)];
}

/** Vrai chemin hors de tout dossier réel autorisé ? (le fichier échappe à /@fs/). */
export function fsEchappe(cheminFichier, dossiersReels) {
  // Chemin UNC ou d'espace de noms (\\hôte\partage, \\.\, \\?\) : refusé sans toucher au disque. Les dossiers permis
  // sont tous sur une lettre de lecteur : un tel chemin échappe forcément. Et ne pas le résoudre évite que la garde
  // elle-même ouvre une connexion SMB (empreinte NTLM) en voulant le vérifier.
  const absolu = path.resolve(cheminFichier);
  if (/^[\\/]{2}/.test(absolu)) return true;
  const r = cheminReel(cheminFichier).toLowerCase();
  if (/^[\\/]{2}/.test(r)) return true;
  return !dossiersReels.some((d) => r === d || r.startsWith(`${d}/`));
}

/**
 * Garde /@fs/ du serveur de développement : refuse (403) tout fichier dont le vrai chemin sort des dossiers réels
 * autorisés, avant que Vite ne le lise (donc avant tout accès disque sur un chemin UNC). `dossiersReels` : realAllowedDirs.
 */
export function fsGuardMiddleware(dossiersReels) {
  return function gardeFs(req, res, next) {
    const fichier = fsUrlPath(req.url);
    if (fichier === null || !fsEchappe(fichier, dossiersReels)) return next();
    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end("Fichier refusé : il est hors du client et des paquets servis par l'interface.");
  };
}

/** Cache des fichiers compilés : un an, sans revalidation (leur nom porte l'empreinte de leur contenu). */
export const CACHE_IMMUABLE = 'public, max-age=31536000, immutable';
/** Cache de la page et des autres fichiers : toujours redemandés (une nouvelle compilation se voit tout de suite). */
export const CACHE_A_REVALIDER = 'no-cache';

/**
 * En-tête Cache-Control d'une réponse de l'interface compilée (vite preview, app de bureau), ou null pour laisser
 * faire (/api : le serveur décide). /assets/ : fichiers nommés par leur empreinte (index-3f9a….js), qui ne changent
 * jamais sous le même nom. Tout le reste (index.html, pages de l'app, favicon) : no-cache.
 */
export function cacheControl(url) {
  const p = normalizedPath(url);
  if (p === '/api' || p.startsWith('/api/')) return null;
  return p.startsWith('/assets/') ? CACHE_IMMUABLE : CACHE_A_REVALIDER;
}

/**
 * Middleware de l'interface compilée (vite preview seulement) : Cache-Control selon cacheControl(), que le service des
 * fichiers de Vite garde (il ne remplace pas un en-tête déjà posé). Et pas de compression : tout se passe sur ce PC
 * (127.0.0.1), compresser chaque fichier coûte du processeur sans rien gagner ; on retire donc Accept-Encoding de la
 * demande avant le middleware de compression de Vite.
 */
export function cacheMiddleware(req, res, next) {
  const cc = cacheControl(req.url);
  if (cc) {
    res.setHeader('Cache-Control', cc);
    if (req.headers) delete req.headers['accept-encoding'];
    if (cc === CACHE_IMMUABLE) immuableSiTrouve(res);
  }
  next();
}

/**
 * Réponse qui peut rester un an en cache : un fichier compilé trouvé (200, 206, ou 304 qui confirme le cache), jamais
 * une page HTML. Une 404 sur /assets/X-empreinte.js (fenêtre restée sur une ancienne compilation, qui demande une page
 * chargée à la demande disparue depuis) ou un index.html de repli ne doivent pas rester un an dans le cache d'Electron,
 * qui est gardé sur le disque : en revenant à cette compilation, le fichier reviendrait sous le même nom, mais la 404
 * resterait servie par le cache.
 */
export function reponseImmuable(status, contentType) {
  return [200, 206, 304].includes(Number(status)) && !/text\/html/i.test(String(contentType ?? ''));
}

/**
 * Le statut n'est connu qu'au moment d'écrire l'en-tête : writeHead (appelé aussi par res.end() sans writeHead) remet
 * no-cache si la réponse n'est pas un fichier trouvé. Le service des fichiers de Vite passe ses en-têtes à writeHead
 * (où il a recopié notre Cache-Control) : on les corrige là aussi.
 */
function immuableSiTrouve(res) {
  const ecrire = res.writeHead;
  if (typeof ecrire !== 'function') return;
  res.writeHead = function writeHeadCache(status, ...reste) {
    const entetes = reste.find((x) => x && typeof x === 'object' && !Array.isArray(x));
    const cleType = entetes && Object.keys(entetes).find((k) => k.toLowerCase() === 'content-type');
    const type = cleType ? entetes[cleType] : res.getHeader?.('content-type');
    if (!reponseImmuable(status ?? res.statusCode, type)) {
      res.setHeader('Cache-Control', CACHE_A_REVALIDER);
      if (entetes) {
        for (const k of Object.keys(entetes)) if (k.toLowerCase() === 'cache-control') delete entetes[k];
        entetes['Cache-Control'] = CACHE_A_REVALIDER;
      }
    }
    return ecrire.call(this, status, ...reste);
  };
}

/**
 * Plugin Vite : la garde passe AVANT les middlewares de Vite (ajoutée dans le corps du hook, pas dans la fonction
 * rendue), donc avant /__open-in-editor, /@fs/ et le proxy. Sur le serveur de développement, la garde /@fs/ (vrai
 * chemin) suit : vite preview n'a pas cette route. Sur vite preview, le cache des fichiers compilés suit
 * (cacheMiddleware) : le serveur de développement garde le sien.
 */
export function guardPlugin() {
  return {
    name: 'elite-garde',
    configureServer(server) {
      server.middlewares.use(guardMiddleware);
      server.middlewares.use(fsGuardMiddleware(realAllowedDirs(server.config.server.fs.allow)));
    },
    configurePreviewServer(server) {
      server.middlewares.use(guardMiddleware);
      server.middlewares.use(cacheMiddleware);
    },
  };
}

/** Chemin réel d'un dossier (node_modules d'une worktree : jonction vers celui de l'app), ou null s'il n'existe pas. */
function realDir(dir) {
  try {
    return fs.realpathSync(dir);
  } catch {
    return null;
  }
}

/**
 * Dossiers que le serveur de développement peut servir par /@fs/ : le client et les paquets (node_modules de la
 * racine, par son chemin réel : Vite suit les liens). Jamais le reste du dépôt : server/data (jeton d'escadron, base,
 * captures), .git, scripts… Par défaut, Vite permettait toute la racine des espaces de travail.
 * Une seule exception, un FICHIER et non un dossier : server/src/core/modes.js, la déclaration des modes de jeu (données
 * pures, sans import), que l'interface reprend telle quelle (client/src/core/modes.js). Sans elle, le serveur de
 * développement refusait ce fichier (403) et toute l'interface restait noire (constat du 9 nov. 2026, à la fusion des
 * rôles des vaisseaux et de l'audit : le banc sert l'interface compilée, sans /@fs/, et ne le voyait pas).
 */
export const SHARED_FILES = ['server/src/core/modes.js'];
export function allowedFsDirs(clientDir) {
  const dirs = [path.resolve(clientDir), realDir(path.resolve(clientDir, '..', 'node_modules')), realDir(path.resolve(clientDir, 'node_modules')),
    ...SHARED_FILES.map((f) => realDir(path.resolve(clientDir, '..', f)))];
  return [...new Set(dirs.filter(Boolean).map((d) => d.replace(/\\/g, '/')))];
}
