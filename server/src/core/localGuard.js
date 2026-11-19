// Garde de l'API locale : seuls l'interface de l'app (Vite, port 5173, et les fenêtres de l'overlay qu'il sert)
// et les appels faits sur ce PC (curl, PowerShell, modules entre eux) peuvent s'en servir. Un site web ouvert
// dans le navigateur ne doit ni lire ni modifier les données du joueur.
//
// Vérifications faites sur chaque requête /api, dans cet ordre :
//  1. Host : localhost:3001 ou 127.0.0.1:3001 seulement. Bloque le « DNS rebinding » (un site qui fait
//     pointer son propre nom vers 127.0.0.1 pour contourner la règle de même origine du navigateur).
//     Le proxy de Vite (changeOrigin) remplace Host par 127.0.0.1:3001 : c'est la valeur reçue ici pour
//     l'interface ; Vite refuse lui-même, avant son proxy, un Host étranger sur le port 5173.
//  2. Origin : s'il est présent, il doit être celui de l'interface (http://localhost:5173 ou
//     http://127.0.0.1:5173). Pas d'Origin : curl, PowerShell, appel serveur à serveur, page de l'app
//     en GET : accepté.
//  3. Sec-Fetch-Site « cross-site » (un autre site web) ou « same-site » (la page d'un autre programme de ce PC,
//     servie sur http://127.0.0.1:<autre port> ou http://localhost:<autre port> : pour le navigateur, c'est le même
//     « site » quel que soit le port) : requête lancée par une page qui n'est pas l'interface (image, lien, script),
//     même sans Origin : refusée. L'interface (proxy de Vite) envoie « same-origin » ; une adresse tapée ou un lien
//     ouvert depuis une autre application envoient « none » : accepté pour lire, car les recherches en ligne réservées
//     au clic du joueur (Mes repères : Spansh, Ardent) sont des écritures, POST avec l'en-tête du point 4.
//     curl et les modules n'envoient pas cet en-tête. client/viteGuard.js refuse de même same-site pour les pages.
//  4. Écriture (toute méthode sauf GET, HEAD et OPTIONS) : en-tête maison « X-Elite-Compagnon: 1 » exigé.
//     Un site tiers ne peut pas l'ajouter sans une vérification préalable (CORS) que ce serveur n'accepte
//     jamais : c'est la protection contre les requêtes forgées (CSRF). Le flux temps réel /api/stream est
//     un GET : EventSource n'a pas besoin de l'en-tête.

import express from 'express';

export const GUARD_HEADER = 'X-Elite-Compagnon';
export const GUARD_VALUE = '1';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Port par défaut du serveur (celui de l'app du joueur, attendu par le proxy de Vite). */
export const DEFAULT_PORT = 3001;
/** Port par défaut de l'interface (Vite, strictPort ; l'overlay ouvre ses fenêtres dessus). */
export const DEFAULT_UI_PORT = 5173;

// Valeur vide : défaut. Autre chose qu'un entier de 1024 à 65535 : refus au démarrage, avec un message clair.
function portFrom(env, name, fallback) {
  const raw = String(env[name] ?? '').trim();
  if (!raw) return fallback;
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port < 1024 || port > 65535) throw new Error(`${name} refusé : « ${raw.slice(0, 20)} » n'est pas un port de 1024 à 65535.`);
  return port;
}

/** Port d'écoute : 3001, ou ELITE_PORT (banc de contrôle : un port libre, jamais celui de l'app qui tourne). */
export function serverPort(env = process.env) {
  return portFrom(env, 'ELITE_PORT', DEFAULT_PORT);
}

/**
 * Port de l'interface dont l'origine est acceptée : 5173, ou ELITE_UI_PORT (banc de contrôle : l'interface compilée,
 * servie sur un port libre et ouverte dans un navigateur sans fenêtre). Une seule interface à la fois : avec
 * ELITE_UI_PORT, l'origine du port 5173 est refusée comme les autres.
 */
export function uiPort(env = process.env) {
  return portFrom(env, 'ELITE_UI_PORT', DEFAULT_UI_PORT);
}

export const allowedHosts = (port) => [`localhost:${port}`, `127.0.0.1:${port}`];
export const allowedOrigins = (uiPort) => [`http://localhost:${uiPort}`, `http://127.0.0.1:${uiPort}`];

// Valeur reçue, raccourcie pour le message d'erreur
const shown = (v) => String(v).slice(0, 80);

/**
 * Raison du refus d'une requête, ou null si elle est acceptée.
 * `headers` : en-têtes Node (noms en minuscules).
 */
export function refusal({ method, headers }, { hosts, origins }) {
  const host = String(headers.host || '').toLowerCase();
  if (!hosts.includes(host)) {
    return `Requête refusée : l'API d'Enova ne répond qu'à ${hosts.join(' et ')} (adresse reçue : « ${shown(headers.host || 'aucune')} »).`;
  }
  const origin = headers.origin;
  if (origin !== undefined && !origins.includes(String(origin).toLowerCase())) {
    return `Requête refusée : un site web (origine « ${shown(origin)} ») ne peut pas utiliser l'API locale d'Enova.`;
  }
  const site = String(headers['sec-fetch-site'] || '').trim().toLowerCase();
  if (site === 'cross-site') {
    return "Requête refusée : elle vient d'un autre site web, qui ne peut pas utiliser l'API locale d'Enova.";
  }
  if (site === 'same-site') {
    return "Requête refusée : elle vient de la page d'un autre programme de ce PC (autre port), qui ne peut pas utiliser l'API locale d'Enova.";
  }
  if (!SAFE_METHODS.has(String(method).toUpperCase())) {
    const value = headers[GUARD_HEADER.toLowerCase()];
    if (String(value ?? '').trim() !== GUARD_VALUE) {
      return `Requête refusée : en-tête « ${GUARD_HEADER}: ${GUARD_VALUE} » manquant. Ajoute-le à tes propres appels d'écriture (curl, PowerShell) : voir le README.`;
    }
  }
  return null;
}

/** Middleware Express : 403 avec un message en français si la requête ne vient pas de l'app ou de ce PC. */
export function localGuard({ port = 3001, uiPort = 5173 } = {}) {
  const rules = { hosts: allowedHosts(port), origins: allowedOrigins(uiPort) };
  return function localGuardMiddleware(req, res, next) {
    const why = refusal(req, rules);
    if (!why) return next();
    res.status(403).json({ error: why });
  };
}

// --- Taille maximale des corps JSON ---
// 1 Mo suffit à toutes les routes ; seules celles qui reçoivent une image (en base64) ont droit à 12 Mo.
// Les chemins sont ceux des modules (sans modifier leur code) : à tenir à jour si une route d'image s'ajoute.
export const DEFAULT_JSON_LIMIT = '1mb';
const LIMITS = [
  // Image personnalisée d'un vaisseau (Mon ingénierie) : data URL PNG, JPEG ou WebP
  { re: /^\/api\/modules\/engineering\/ships\/[^/]+\/image\/?$/i, limit: '12mb' },
  // Capture du cadre de l'overlay (Mes repères) : image et versions contrastées pour l'OCR
  { re: /^\/api\/modules\/waypoints\/captures\/?$/i, limit: '12mb' },
  // Page Inara enregistrée (Constructeur de builds) : HTML d'environ 200 ko, marge pour qu'elle grossisse
  { re: /^\/api\/modules\/builder\/inara\/import\/?$/i, limit: '4mb' },
];

/** Limite de taille du corps JSON pour un chemin complet (« /api/... », sans la requête). */
export function jsonLimitFor(path) {
  return LIMITS.find((l) => l.re.test(path))?.limit || DEFAULT_JSON_LIMIT;
}

/** Limite en octets (« 12mb » → 12 582 912, comme la compte Express). */
export const limitBytes = (limit) => Number(/^(\d+)mb$/.exec(limit)?.[1] ?? NaN) * 1024 * 1024;

/** Au-delà de ce multiple de la limite, un corps annoncé n'est même pas lu (voir jsonBody). */
export const ABSURD_FACTOR = 4;

/** Content-Encoding accepté pour un corps de requête. */
const ENCODINGS = new Set(['identity', 'gzip', 'deflate']);

/**
 * Lecture des corps JSON, avec la limite propre à chaque chemin.
 *
 * Un corps un peu trop gros est lu jusqu'au bout puis refusé (413) : Express attend la fin de l'envoi avant de répondre,
 * pour que le client reçoive bien la réponse. Mais un corps non compressé ANNONCÉ (Content-Length) à plus de
 * ABSURD_FACTOR fois la limite est refusé tout de suite, sans être lu, et la connexion fermée après la réponse : sinon
 * un envoi qui annonce 100 Go sans les envoyer garderait la requête ouverte, et un vrai envoi de 100 Go serait lu en
 * entier pour rien.
 */
export function jsonBody() {
  const parsers = new Map();
  const parser = (limit) => {
    if (!parsers.has(limit)) parsers.set(limit, express.json({ limit }));
    return parsers.get(limit);
  };
  return (req, res, next) => {
    const limit = jsonLimitFor(req.path);
    const declared = Number(req.headers['content-length']);
    const encoding = String(req.headers['content-encoding'] || 'identity').trim().toLowerCase();
    // Encodages acceptés : aucun, gzip, deflate. Express 5 (body-parser 2) décompresse aussi br (Brotli) : refusé ici
    // comme avant (415), pour qu'aucun nouveau décompresseur n'entre sans décision (constat du banc, 9 nov. 2026)
    if (!ENCODINGS.has(encoding)) {
      return next(Object.assign(new Error(`unsupported content encoding "${encoding}"`), { type: 'encoding.unsupported', status: 415, statusCode: 415 }));
    }
    if (encoding === 'identity' && Number.isFinite(declared) && declared > ABSURD_FACTOR * limitBytes(limit) && req.is('application/json')) {
      res.set('Connection', 'close');
      const err = Object.assign(new Error('request entity too large'), { type: 'entity.too.large', status: 413, statusCode: 413, expected: declared, limit: limitBytes(limit) });
      return next(err);
    }
    return parser(limit)(req, res, next);
  };
}

// Erreurs de lecture du corps (body-parser, raw-body), par leur type : chacune a sa raison, jamais « Erreur interne »
const BODY_ERRORS = new Map([
  ['entity.too.large', 'Requête trop volumineuse.'], // 413
  ['entity.parse.failed', 'Corps de la requête illisible (JSON invalide).'], // 400
  ['encoding.unsupported', 'Encodage du corps non pris en charge (Content-Encoding : gzip, deflate ou aucun).'], // 415
  ['charset.unsupported', 'Jeu de caractères non pris en charge : le corps doit être en UTF-8.'], // 415
  ['request.aborted', 'Requête interrompue avant la fin du corps.'], // 400
  ['request.size.invalid', 'Taille du corps différente de celle annoncée (Content-Length).'], // 400
]);

/** Message lisible pour les erreurs de lecture du corps (trop gros, JSON invalide, encodage…), sinon null. */
export function bodyErrorMessage(err) {
  return (typeof err?.type === 'string' && BODY_ERRORS.get(err.type)) || null;
}

const EXTERNAL = new Set([502, 503, 504]); // service extérieur indisponible (core/net.js)

/**
 * Réponse d'erreur de l'API : { status, message, level }. level 'warn' : refus attendu, une ligne dans la sortie ;
 * 'error' : erreur imprévue, la pile est écrite. Jamais « Erreur interne du serveur. » pour un refus (4xx) : une
 * adresse mal encodée (« % » seul, UTF-8 tronqué) a sa raison, un autre refus sans message aussi.
 */
export function errorReply(err) {
  const raw = Number(err?.status ?? err?.statusCode);
  const status = Number.isInteger(raw) && raw >= 400 && raw <= 599 ? raw : 500;
  const body = bodyErrorMessage(err);
  if (body) return { status, message: body, level: 'warn' };
  const own = typeof err?.publicMessage === 'string' && err.publicMessage ? err.publicMessage : null;
  if (own && (status < 500 || EXTERNAL.has(status))) return { status, message: own, level: 'warn' };
  if (status < 500) {
    if (err instanceof URIError) return { status: 400, message: 'Adresse mal encodée (caractère « % » invalide).', level: 'warn' };
    return { status, message: `Requête refusée (erreur ${status}).`, level: 'warn' };
  }
  return { status, message: own || 'Erreur interne du serveur.', level: 'error' };
}
