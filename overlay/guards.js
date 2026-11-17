// Gardes de l'overlay, sans Electron (testées par guards.test.js et main.test.js, et dans le vrai Electron par l'étape
// 26-overlay de npm run controle) : adresse unique de l'interface, requêtes et navigations permises, geste de
// l'utilisateur pour les fonctions sensibles du pont, ordre des lancements, messages de la console des pages.
//
// Les fenêtres de l'overlay restent au premier plan pendant tout le jeu. Ce qu'elles chargent ne doit venir que de
// l'interface de l'app (Vite, 127.0.0.1:5173) : jamais d'une autre adresse, jamais d'un cadre qui irait ailleurs.

/**
 * Port de l'interface : ELITE_UI_PORT (l'app de bureau en choisit un libre si 5173 est pris, et le passe au serveur,
 * qui lance l'overlay), sinon 5173. Seulement un port : l'adresse reste 127.0.0.1, jamais un autre hôte.
 */
function uiPortFrom(env) {
  const v = String(env?.ELITE_UI_PORT ?? '').trim();
  const p = /^\d{4,5}$/.test(v) ? Number(v) : NaN;
  return p >= 1024 && p <= 65535 ? p : 5173;
}

/**
 * Interface de l'app : 127.0.0.1 et jamais « localhost ». Avec « localhost », Vite n'écoutait que sur [::1]:5173, et
 * un autre programme pouvait tenir 127.0.0.1:5173 : Chromium y tombait dès que Vite ne répondait pas.
 */
let uiOrigin = `http://127.0.0.1:${uiPortFrom(process.env)}`;

/**
 * Banc de contrôle seulement (scripts/controle/electron/entree.cjs) : l'interface du banc, sur un autre port de
 * 127.0.0.1, appelée dans le même processus avant le chargement de main.js. Rien ne change l'hôte : seul le port peut
 * venir d'ailleurs (ELITE_UI_PORT, ci-dessus), et l'adresse reste toujours 127.0.0.1.
 */
function setUiOriginForTest(origin) {
  const m = /^http:\/\/127\.0\.0\.1:(\d{4,5})$/.exec(String(origin));
  if (!m || Number(m[1]) < 1024 || Number(m[1]) > 65535) throw new Error(`Interface du banc attendue sur http://127.0.0.1:<port>, pas « ${origin} ».`);
  uiOrigin = origin;
}

const uiHost = () => uiOrigin.slice('http://'.length);

/** Adresse d'une fenêtre : /hud/<page>. */
const pageUrl = (page) => `${uiOrigin}/hud/${page}`;

/**
 * Requête permise à une fenêtre (webRequest) : l'interface seulement, en http (pages, modules, API par son proxy, flux
 * temps réel) ou ws (rechargement de Vite). Tout le reste est annulé : un autre site, un autre port, un fichier local.
 */
function allowedRequest(raw) {
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    return false;
  }
  return (u.protocol === 'http:' || u.protocol === 'ws:') && u.host === uiHost() && !u.username && !u.password;
}

/**
 * Adresse de la démonstration d'une fenêtre en jeu : « /hud/<page>?demo=… » de l'interface. C'est la seule page qu'un
 * cadre (iframe) de la fenêtre principale a le droit de charger : la page « Fenêtres en jeu » y montre les fenêtres
 * de l'overlay pour leur tutoriel. Une fenêtre en démonstration ne lit aucune donnée du joueur et n'écrit rien
 * (client/src/core/demo.js).
 */
function demoFrame(raw) {
  if (!allowedRequest(raw)) return false;
  const u = new URL(String(raw));
  return u.protocol === 'http:' && /^\/hud\/[a-z0-9-]{1,40}$/.test(u.pathname) && u.searchParams.has('demo');
}

/**
 * Navigation permise du cadre principal : seulement le rechargement de sa propre adresse (Vite recharge la page après
 * une mise à jour ou un redémarrage). Toute autre adresse, même de l'interface, est refusée.
 */
function allowedNavigation(target, own) {
  return typeof target === 'string' && target === own;
}

/** Même page : même origine et même chemin (la recherche et l'ancre, qu'une page change sans naviguer, ne comptent pas). */
function samePage(a, b) {
  try {
    const x = new URL(String(a));
    const y = new URL(String(b));
    return x.origin === y.origin && x.pathname === y.pathname;
  } catch {
    return false;
  }
}

/**
 * Message envoyé par la page de cette fenêtre, et pas par un cadre inclus (iframe) : le cadre qui l'envoie est le cadre
 * principal, à l'adresse de la fenêtre. Un cadre détaché ou inconnu (senderFrame absent) ne compte pas.
 */
function fromMainFrame(event, webContents, url) {
  const frame = event?.senderFrame;
  if (!frame || !webContents?.mainFrame || frame !== webContents.mainFrame) return false;
  return samePage(frame.url, url);
}

/** Point dans le rectangle, à `margin` pixels près (bord d'un bouton). */
function pointInside(point, bounds, margin = 8) {
  if (!point || !bounds || ![point.x, point.y, bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return false;
  return point.x >= bounds.x - margin && point.y >= bounds.y - margin && point.x < bounds.x + bounds.width + margin && point.y < bounds.y + bounds.height + margin;
}

/**
 * Geste de l'utilisateur pour une fonction sensible du pont (passer en mode déplacement, donc prendre le clavier ;
 * photographier l'écran ; écrire dans le presse-papiers) : la fenêtre est affichée, et le curseur est sur elle (le clic
 * sur son bouton), sauf en mode souris (Alt+Maj+K, la fenêtre peut avoir la main au clavier). Une page ne peut donc pas
 * le faire seule : ni cachée, ni pendant que la souris est ailleurs.
 */
function userGesture({ shown, mouseMode, cursor, bounds }) {
  return Boolean(shown) && (Boolean(mouseMode) || pointInside(cursor, bounds));
}

/**
 * Source « écran » de desktopCapturer pour l'écran du cadre de capture, ou null. Jamais un autre écran (Discord, le
 * navigateur…) : la source doit porter le numéro de cet écran. Numéro vide (certains pilotes) : acceptée seulement
 * s'il n'y a qu'un écran et qu'une source, donc aucune erreur possible.
 */
function screenSource(sources, displayId, displays) {
  const list = Array.isArray(sources) ? sources : [];
  const exact = list.find((s) => s && s.display_id && s.display_id === String(displayId));
  if (exact) return exact;
  return displays === 1 && list.length === 1 && !list[0]?.display_id ? list[0] : null;
}

/** Écart au-delà duquel un ordre plus ancien n'est plus un croisement mais une horloge changée : il s'applique. */
const ORDER_CROSSING_MS = 10_000;

/** Heure de l'ordre (--at=<ms>, mise par le serveur), ou null (lancement à la main : npm run overlay). */
function orderTime(argv) {
  const raw = argv.find((a) => typeof a === 'string' && a.startsWith('--at='))?.slice(5);
  return raw != null && /^\d{1,15}$/.test(raw) ? Number(raw) : null;
}

/**
 * Ordre périmé : parti avant le dernier appliqué, et arrivé après lui (deux lancements qui se croisent : le premier
 * parti démarre plus lentement). Il ne doit pas défaire le plus récent.
 */
function staleOrder(at, lastAt) {
  return at != null && lastAt != null && at < lastAt && lastAt - at < ORDER_CROSSING_MS;
}

/** L'ordre ne vaut que pour un overlay déjà lancé (--if-running : fermer une fenêtre, remettre en ordre). */
const ifRunning = (argv) => Array.isArray(argv) && argv.includes('--if-running');

/**
 * Que fait ce lancement ? 'transmettre' : un overlay tourne déjà (verrou pris), il reçoit l'ordre ; 'arreter' : rien à
 * faire, sans rien ouvrir (liste vide, ou ordre --if-running alors qu'aucun overlay ne tournait : le serveur fermait
 * une fenêtre de module, et relançait l'overlay avec les fenêtres du mode) ; 'demarrer' : l'overlay s'ouvre.
 * @param {{ locked: boolean, only?: string[], ifRunning?: boolean }} o locked : requestSingleInstanceLock() a réussi
 */
function startupAction({ locked, only, ifRunning: onlyIfRunning = false, rester = false }) {
  if (!locked) return 'transmettre';
  // Sans fenêtre à ouvrir : on ne démarre pas, sauf ordre de rester actif (app de bureau : les raccourcis, Alt+Maj+K…)
  if (Array.isArray(only) && !only.length && !rester) return 'arreter';
  if (onlyIfRunning) return 'arreter';
  return 'demarrer';
}

/**
 * Message de la console d'une page : { error, message }. Electron 33 passe (event, level, message) avec un niveau en
 * nombre (3 : erreur) ; depuis Electron 35, ces arguments sont dépréciés et l'événement porte level ('error'…) et
 * message. Les deux formes sont lues, pour la mise à jour d'Electron (étape M2).
 */
function consoleEntry(event, legacyLevel, legacyMessage) {
  const level = typeof event?.level === 'string' ? event.level : legacyLevel;
  const message = typeof event?.message === 'string' ? event.message : legacyMessage;
  return { error: level === 'error' || level === 3, message: String(message ?? '') };
}

/**
 * Surveillance de l'app : `check()` (promesse de vrai ou faux) toutes les `everyMs`. Sans réponse depuis `downMs`,
 * `onDown()` (les fenêtres se cachent : leurs valeurs seraient figées) ; de retour, `onUp()` ; sans réponse depuis
 * `goneMs`, `onGone()` (l'overlay s'arrête). Rend { stop(), tick() } (tick : un tour tout de suite, pour les tests).
 */
function watchApp({ check, onDown, onUp, onGone, everyMs = 10_000, downMs = 30_000, goneMs = 5 * 60_000, now = Date.now, setTimer = setInterval, clearTimer = clearInterval }) {
  let lastOk = now();
  let down = false;
  let gone = false;
  let busy = false;
  const tick = async () => {
    if (busy || gone) return;
    busy = true;
    let ok = false;
    try {
      ok = Boolean(await check());
    } catch {
      ok = false;
    }
    busy = false;
    const t = now();
    if (ok) {
      lastOk = t;
      if (down) {
        down = false;
        onUp?.();
      }
      return;
    }
    if (!down && t - lastOk >= downMs) {
      down = true;
      onDown?.();
    }
    if (t - lastOk >= goneMs) {
      gone = true;
      onGone?.();
    }
  };
  const timer = setTimer(tick, everyMs);
  timer?.unref?.();
  return { stop: () => clearTimer(timer), tick, isDown: () => down };
}

module.exports = {
  demoFrame,
  get UI_ORIGIN() {
    return uiOrigin;
  },
  get UI_HOST() {
    return uiHost();
  },
  setUiOriginForTest,
  uiPortFrom,
  pageUrl,
  allowedRequest,
  allowedNavigation,
  samePage,
  fromMainFrame,
  pointInside,
  userGesture,
  screenSource,
  ORDER_CROSSING_MS,
  orderTime,
  staleOrder,
  ifRunning,
  startupAction,
  consoleEntry,
  watchApp,
};
