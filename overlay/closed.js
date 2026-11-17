// Alt+Maj+Q : avant de quitter, l'overlay dit au serveur de l'app qu'il est quitté par le joueur (POST /api/overlay/closed,
// avec l'en-tête X-Elite-Compagnon des écritures, sur ce PC seulement). Sans cet avis, le serveur croyait ses fenêtres
// encore ouvertes : Annuler une bascule les rouvrait, et un rôle sans fenêtre (Commerce) se croyait gêné par elles
// (server/src/core/roleSwitch.js). Serveur absent ou bloqué : l'overlay quitte quand même, au plus tard après le délai.
//
// L'overlay est lancé détaché : il survit à l'arrêt du serveur. Alt+Maj+Q pressé pendant que le serveur est arrêté :
// l'avis n'arrive pas. La fermeture est alors gardée (pendingFile, dans le dossier propre à l'overlay) avec son heure,
// et transmise à son lancement suivant, avant d'ouvrir quoi que ce soit (sendPending) : sinon le serveur, qui croyait
// les fenêtres ouvertes, les redemandait le lendemain et elles revenaient seules par-dessus le jeu. Le serveur répond ce
// qu'il faut ouvrir maintenant (open) : rien si rien n'a été voulu depuis la fermeture, sinon ce qui a été voulu depuis.

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { writeJsonAtomicSync } = require('./atomic.js');

const DEFAULT_PORT = 3001;
const PENDING_VERSION = 1;
const MAX_REPLY = 64 * 1024; // réponse du serveur : un état de l'overlay, quelques centaines d'octets

/** Port du serveur de l'app : ELITE_PORT (même règle que server/src/core/localGuard.js), sinon 3001. */
function serverPort(env = process.env) {
  const raw = String(env.ELITE_PORT ?? '').trim();
  const port = Number(raw);
  return /^\d+$/.test(raw) && port >= 1024 && port <= 65535 ? port : DEFAULT_PORT;
}

/**
 * POST /api/overlay/closed avec `body`, puis cb({ ok, reply }) une seule fois : ok si le serveur a répondu 2xx (reply :
 * sa réponse JSON, ou null), sinon ok false (erreur, délai dépassé, refus).
 */
function postClosed(body, o, cb) {
  postJson('/api/overlay/closed', body, o, cb);
}

/** POST d'un corps JSON sur l'API locale du serveur (en-tête X-Elite-Compagnon), puis cb({ ok, reply }) une seule fois. */
function postJson(chemin, body, { port, timeoutMs }, cb) {
  let finished = false;
  let req = null;
  const finish = (result) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    cb(result);
  };
  const timer = setTimeout(() => {
    req?.destroy();
    finish({ ok: false, reply: null });
  }, timeoutMs);
  const text = JSON.stringify(body);
  req = http.request({
    host: '127.0.0.1',
    port,
    path: chemin,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text), 'X-Elite-Compagnon': '1' },
  }, (res) => {
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    let received = '';
    res.setEncoding('utf8');
    res.on('data', (d) => {
      if (received.length < MAX_REPLY) received += d;
    });
    res.on('end', () => {
      let reply = null;
      try {
        reply = ok ? JSON.parse(received) : null;
      } catch {
        reply = null;
      }
      finish({ ok, reply });
    });
    res.on('error', () => finish({ ok: false, reply: null }));
  });
  req.on('error', () => finish({ ok: false, reply: null }));
  req.end(text);
}

function clearPending(file) {
  if (!file) return;
  try {
    fs.rmSync(file, { force: true });
  } catch {
    // tenu par un autre programme : relu au lancement suivant ; une fermeture dépassée ne change rien côté serveur
  }
}

/** Fermeture gardée, pas encore transmise : { at } (heure ISO), ou null si absente ou illisible (effacée alors). */
function readPending(file) {
  if (!file) return null;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') clearPending(file); // illisible : rien à en tirer
    return null;
  }
  const at = data && typeof data === 'object' && data.version === PENDING_VERSION && typeof data.at === 'string' && data.at.length <= 40 ? data.at : null;
  if (!at || !Number.isFinite(Date.parse(at))) {
    clearPending(file);
    return null;
  }
  return { at };
}

/** Garde la fermeture (heure `at`) pour la transmettre plus tard ; écrite d'un coup (atomic.js : temporaire puis renommage). */
function keepPending(file, at) {
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeJsonAtomicSync(file, { version: PENDING_VERSION, at: at.toISOString() });
  } catch {
    // rien de plus à faire : l'overlay quitte quand même
  }
}

/**
 * Alt+Maj+Q : prévient le serveur, puis appelle done() une seule fois : réponse reçue, erreur, ou délai dépassé.
 * Sans accord du serveur (arrêté, bloqué, refus) : la fermeture est gardée dans pendingFile, avec son heure. Reçue :
 * une fermeture plus ancienne gardée là n'a plus lieu d'être (celle-ci la remplace), elle est effacée.
 * @param {() => void} done
 * @param {{ port?: number, timeoutMs?: number, pendingFile?: string|null }} [o]
 */
function notifyClosed(done, { port = serverPort(), timeoutMs = 1500, pendingFile = null } = {}) {
  const at = new Date();
  postClosed({}, { port, timeoutMs }, ({ ok }) => {
    if (ok) clearPending(pendingFile);
    else keepPending(pendingFile, at);
    done();
  });
}

/**
 * Au lancement de l'overlay : une fermeture gardée (Alt+Maj+Q pressé serveur arrêté) est transmise d'abord, avec son
 * heure. cb(résultat), une seule fois :
 * - null : rien à transmettre : ouvrir ce qui est demandé ;
 * - { open } : transmise ; open = fenêtres à ouvrir maintenant, selon le serveur (vide : rien) ;
 * - undefined : ouvrir ce qui est demandé ; pas transmise (serveur injoignable : elle reste gardée pour la suite), ou
 *   transmise sans liste en retour.
 * @param {string|null} file
 * @param {(r: null | { open: string[] } | undefined) => void} cb
 * @param {{ port?: number, timeoutMs?: number }} [o]
 */
function sendPending(file, cb, { port = serverPort(), timeoutMs = 1500 } = {}) {
  const pending = readPending(file);
  if (!pending) {
    cb(null);
    return;
  }
  postClosed({ at: pending.at }, { port, timeoutMs }, ({ ok, reply }) => {
    if (!ok) {
      cb(undefined);
      return;
    }
    clearPending(file);
    // Sans liste (serveur d'une version qui ne la donne pas) : ses fenêtres à lui, sinon ce qui est demandé
    const open = [reply?.open, reply?.pages].find((l) => Array.isArray(l));
    cb(open ? { open: open.filter((p) => typeof p === 'string') } : undefined);
  });
}

/**
 * Ce que l'overlay ouvre à son lancement, une fois la fermeture gardée transmise (sendPending) : la liste du serveur
 * pour un lancement par le serveur (--only), sinon ce qui est demandé (lancé à la main : --page, npm run overlay).
 * @param {{ only?: string[], add?: string[] }} first arguments du lancement (main.js parseArgs)
 * @param {null | { open: string[] } | undefined} result résultat de sendPending
 */
function startArgs(first, result) {
  return result && Array.isArray(result.open) && first.only ? { only: [...result.open] } : first;
}

/** GET d'un JSON sur l'API locale du serveur (en-tête X-Elite-Compagnon) : la réponse, ou null (erreur, refus, délai). */
function getJson(chemin, { port = serverPort(), timeoutMs = 3000 } = {}) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: chemin, headers: { 'X-Elite-Compagnon': '1' }, timeout: timeoutMs }, (res) => {
      let recu = '';
      res.setEncoding('utf8');
      res.on('data', (d) => {
        if (recu.length < MAX_REPLY) recu += d;
      });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return resolve(null);
        try {
          return resolve(JSON.parse(recu));
        } catch {
          return resolve(null);
        }
      });
      res.on('error', () => resolve(null));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

/** POST d'un JSON sur l'API locale : promesse de { ok, reply }. */
function envoyerJson(chemin, body, { port = serverPort(), timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => postJson(chemin, body, { port, timeoutMs }, resolve));
}

/**
 * Alt+Maj+K pendant que tout est caché (◆ de l'app de bureau) : le serveur prévient l'app de bureau, qui retire son ◆
 * et rouvre ce qu'il avait caché. Sans réponse : rien de plus (l'overlay s'est déjà réaffiché lui-même).
 */
function demanderDemasque({ port = serverPort(), timeoutMs = 1500 } = {}) {
  postJson('/api/overlay/demasque', {}, { port, timeoutMs }, () => {});
}

module.exports = { demanderDemasque, envoyerJson, getJson, notifyClosed, sendPending, readPending, serverPort, startArgs };
