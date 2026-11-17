// Passerelle réseau unique du serveur. TOUT appel sortant passe par netFetch : Ardent Insight, Spansh, GitHub (données
// de référence), Worker du Squadron Tracker. Aucun module n'appelle fetch lui-même (un test le vérifie) ; les tests des
// modules injectent toujours leur propre faux fetch à la place de celui-ci, comme avant.
//
// Règles, toutes vérifiées ici avant le moindre octet envoyé :
//   - liste blanche explicite des hôtes (NETWORK_HOSTS, plus l'hôte public qu'un réglage du joueur y ajoute :
//     setUserHost), en https sur le port 443, sans identifiant dans l'adresse ;
//     un hôte hors liste est refusé avec une erreur claire, même au bout d'une redirection ;
//   - délai maximal (MAX_TIMEOUT_MS) en plus de celui de l'appelant, corps compris ;
//   - taille de réponse bornée (DEFAULT_MAX_BYTES, après décompression) : au-delà, la lecture s'arrête et rien n'est rendu ;
//   - redirections suivies à la main (MAX_REDIRECTS), chacune vérifiée ; l'en-tête Authorization ne passe jamais à un
//     autre hôte ; redirect: 'manual' (Escadron : le jeton ne suit jamais) et 'error' sont respectés ;
//   - ELITE_NO_NETWORK (toute valeur sauf vide, 0 ou false) refuse tout, pour les contrôles.
//
// localFetch sert au seul appel du serveur à lui-même (API d'un autre module, jamais son code) : http sur 127.0.0.1
// ou localhost uniquement, sans redirection, mêmes bornes. Ce n'est pas du réseau : ELITE_NO_NETWORK ne le coupe pas.
//
// Chaque tentative (adresse telle qu'elle partirait, refusée ou non) est annoncée sur le canal de diagnostic
// NET_CHANNEL, sans rien changer à la requête : le banc de contrôle (sonde) et les tests voient ainsi ce que le serveur
// AURAIT demandé, même réseau coupé. Sans abonné, rien n'est fait.

import diagnostics from 'node:diagnostics_channel';

export const NET_CHANNEL = 'elite-compagnon:net';
const channel = diagnostics.channel(NET_CHANNEL);

/** Annonce une tentative : adresse normalisée (celle que fetch recevrait), et le code du refus s'il y en a un. */
function announce(input, err = null) {
  if (!channel.hasSubscribers) return;
  let href;
  try {
    href = new URL(input instanceof URL ? input.href : String(input)).href;
  } catch {
    href = String(input);
  }
  channel.publish({ url: href.slice(0, 2000), refused: err?.code ?? null });
}

/** Hôtes joignables, et pourquoi. Ajouter un hôte = l'ajouter ici, avec sa raison, et le dire dans le README. */
export const NETWORK_HOSTS = new Map([
  ['api.ardent-insight.com', 'Ardent Insight : marchés, stations et minerais (Calculateur, Repères, Colonisation)'],
  ['spansh.co.uk', 'Spansh : corps et systèmes (Systèmes importants, prospection des Repères, Où agir cette semaine)'],
  ['api.github.com', 'GitHub : liste des fichiers des données de référence, à un commit figé'],
  ['raw.githubusercontent.com', 'GitHub : fichiers des données de référence, à un commit figé, empreintes vérifiées'],
  ['api.cloudflare.com', "Cloudflare : monter le serveur de l'escadron (Escadron, côté chef, seulement quand il colle sa clé)"],
  ['discord.com', "Discord : publier la carte de l'escadron dans son salon (Escadron, côté chef, mode « app du chef »)"],
]);

/**
 * Hôtes réglés par le joueur, un par réglage (Escadron : le Worker de son escadron, s'il n'est pas celui de l'app).
 * Mêmes règles que les autres (https, port 443, sans identifiant), et seulement un nom public : jamais une adresse IP,
 * localhost ni un nom du réseau de la maison (« .local », « .lan »…). Gardés en mémoire : le module les redonne au
 * démarrage, d'après son propre réglage.
 */
const USER_HOSTS = new Map(); // réglage → hôte
const LOCAL_SUFFIXES = ['localhost', 'local', 'lan', 'home', 'internal', 'intranet', 'corp', 'arpa', 'test', 'invalid', 'example'];

/** Pourquoi cet hôte ne peut pas être réglé par le joueur, ou null s'il le peut. */
export function userHostError(host) {
  const h = String(host ?? '').toLowerCase();
  // Des labels de lettres, chiffres et tirets, le dernier commençant par une lettre : ni IPv4 ni IPv6 ([…])
  if (h.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(h)) {
    return `« ${h.slice(0, 80)} » n'est pas un nom de serveur public (ex. mon-escadron.workers.dev).`;
  }
  const dernier = h.split('.').at(-1);
  if (LOCAL_SUFFIXES.includes(dernier)) return `« ${h} » est un nom local : seul un serveur public est permis.`;
  return null;
}

/** Hôte réglé par le joueur pour `owner` (null : retiré). Refus : NetworkError. */
export function setUserHost(owner, host) {
  if (host == null) return void USER_HOSTS.delete(owner);
  const err = userHostError(host);
  if (err) throw new NetworkError('NET_USER_HOST', err);
  USER_HOSTS.set(owner, String(host).toLowerCase());
}

/** Hôtes réglés par le joueur, et par quel réglage. */
export const userHosts = () => new Map(USER_HOSTS);

const allowed = (host) => NETWORK_HOSTS.has(host) || [...USER_HOSTS.values()].includes(host);

/** Délai maximal d'une requête, corps compris, quel que soit celui demandé par l'appelant. */
export const MAX_TIMEOUT_MS = 60_000;
/** Taille maximale d'une réponse (après décompression) : la plus grosse attendue, un système complet de Spansh, fait quelques Mo. */
export const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
/** Redirections suivies au plus. */
export const MAX_REDIRECTS = 3;

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const NULL_BODY = new Set([101, 103, 204, 205, 304]);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Erreur de la passerelle : code stable pour les tests, message en français lisible tel quel. */
export class NetworkError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'NetworkError';
    this.code = code;
    this.status = 503;
    this.publicMessage = message;
  }
}

/** ELITE_NO_NETWORK réglé : tout appel sortant est refusé. */
export function networkDisabled(env = process.env) {
  const v = String(env?.ELITE_NO_NETWORK ?? '').trim().toLowerCase();
  return v !== '' && v !== '0' && v !== 'false';
}

function parse(input) {
  try {
    return new URL(input instanceof URL ? input.href : String(input));
  } catch {
    throw new NetworkError('NET_BAD_URL', `Adresse réseau illisible : « ${String(input).slice(0, 200)} ».`);
  }
}

/**
 * Vérifie une adresse sortante et la renvoie (URL). Refus : NetworkError avec un message qui dit pourquoi.
 * Les tests de la passerelle passent leur propre env ; le serveur, process.env.
 */
export function checkUrl(input, env = process.env) {
  const url = parse(input);
  const host = url.hostname.toLowerCase();
  if (networkDisabled(env)) {
    throw new NetworkError('NET_OFF', `Réseau coupé (ELITE_NO_NETWORK) : requête vers ${host || 'une adresse vide'} refusée.`);
  }
  if (url.protocol !== 'https:') {
    throw new NetworkError('NET_NOT_HTTPS', `Requête refusée : ${host || url.protocol} n'est pas en https.`);
  }
  if (url.username || url.password) {
    throw new NetworkError('NET_CREDENTIALS', `Requête refusée : l'adresse vers ${host} contient un identifiant.`);
  }
  if (url.port && url.port !== '443') {
    throw new NetworkError('NET_PORT', `Requête refusée : port ${url.port} vers ${host} (seul 443 est permis).`);
  }
  if (!allowed(host)) {
    throw new NetworkError('NET_HOST', `Requête refusée : l'hôte « ${host} » n'est pas dans la liste blanche (server/src/core/net.js).`);
  }
  return url;
}

// Un hôte hors liste est une erreur de programmation : dite une fois dans la console du serveur, même si le module
// qui appelait se tait (repli sur ses données locales). Le réseau coupé exprès (ELITE_NO_NETWORK) ne l'est pas.
const warned = new Set();
function warnOnce(err) {
  if (!(err instanceof NetworkError) || err.code === 'NET_OFF' || warned.has(err.message) || warned.size >= 100) return;
  warned.add(err.message);
  console.warn(`Réseau : ${err.message}`);
}

/** Signal qui s'arrête au premier des deux : celui de l'appelant ou le délai maximal. */
function deadline(callerSignal, timeoutMs) {
  const own = AbortSignal.timeout(Math.max(1, Math.min(Number(timeoutMs) || MAX_TIMEOUT_MS, MAX_TIMEOUT_MS)));
  return callerSignal ? AbortSignal.any([callerSignal, own]) : own;
}

const limitOf = (maxBytes) => Math.max(0, Math.min(Number(maxBytes) || DEFAULT_MAX_BYTES, DEFAULT_MAX_BYTES));

function tooBig(host, limit) {
  const mo = Math.round((limit / (1024 * 1024)) * 10) / 10;
  return new NetworkError('NET_TOO_BIG', `Réponse trop grosse de ${host} : plus de ${mo} Mo, lecture arrêtée.`);
}

/** Lit tout le corps, sans jamais dépasser limit octets, et rend une réponse ordinaire (json(), text()…). */
async function bounded(res, url, limit) {
  const host = url.hostname;
  const declared = Number(res.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    await res.body?.cancel?.().catch?.(() => {});
    throw tooBig(host, limit);
  }
  let buf = null;
  if (res.body && !NULL_BODY.has(res.status)) {
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => {});
        throw tooBig(host, limit);
      }
      chunks.push(value);
    }
    buf = Buffer.concat(chunks, total);
  }
  const headers = new Headers(res.headers);
  headers.delete('content-encoding'); // corps déjà décompressé
  headers.delete('content-length');
  const out = new Response(buf, { status: res.status, statusText: res.statusText, headers });
  Object.defineProperty(out, 'url', { value: url.href });
  return out;
}

/**
 * fetch vers Internet, par la liste blanche. Mêmes arguments et même réponse que fetch : les modules l'utilisent
 * comme fetch par défaut. Troisième argument (tests, appels qui veulent moins) : { fetchImpl, env, maxBytes, timeoutMs }.
 */
export async function netFetch(input, options = {}, { fetchImpl = globalThis.fetch, env = process.env, maxBytes, timeoutMs } = {}) {
  let url;
  try {
    url = checkUrl(input, env);
  } catch (err) {
    announce(input, err);
    warnOnce(err);
    throw err;
  }
  announce(url);
  const limit = limitOf(maxBytes);
  const signal = deadline(options.signal, timeoutMs);
  const mode = options.redirect ?? 'follow';
  let method = String(options.method || 'GET').toUpperCase();
  let body = options.body;
  const headers = new Headers(options.headers);
  for (let hop = 0; ; hop += 1) {
    const res = await fetchImpl(url.href, { ...options, method, body, headers, signal, redirect: 'manual' });
    if (!REDIRECTS.has(res.status) || mode === 'manual') return bounded(res, url, limit);
    await res.body?.cancel?.().catch?.(() => {});
    if (mode === 'error') throw new NetworkError('NET_REDIRECT', `Redirection refusée depuis ${url.hostname}.`);
    const location = res.headers.get('location');
    if (!location) throw new NetworkError('NET_REDIRECT', `Redirection sans adresse depuis ${url.hostname}.`);
    if (hop >= MAX_REDIRECTS) throw new NetworkError('NET_REDIRECTS', `Trop de redirections depuis ${url.hostname} (plus de ${MAX_REDIRECTS}).`);
    let next;
    try {
      next = checkUrl(new URL(location, url), env);
    } catch (err) {
      let target = location;
      try { target = new URL(location, url); } catch { /* adresse illisible : annoncée telle quelle */ }
      announce(target, err);
      warnOnce(err);
      throw err;
    }
    announce(next);
    if (next.hostname !== url.hostname) {
      headers.delete('authorization');
      headers.delete('cookie');
    }
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
      method = 'GET';
      body = undefined;
      headers.delete('content-type');
    }
    url = next;
  }
}

/** Vérifie une adresse du serveur lui-même (http://127.0.0.1:<port>/…). */
export function checkLocalUrl(input) {
  const url = parse(input);
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname.toLowerCase()) || url.username || url.password) {
    throw new NetworkError('NET_NOT_LOCAL', `Requête locale refusée : « ${url.host} » n'est pas ce PC (127.0.0.1 ou localhost en http).`);
  }
  return url;
}

/** fetch vers le serveur lui-même : loopback seulement, sans redirection, mêmes bornes de délai et de taille. */
export async function localFetch(input, options = {}, { fetchImpl = globalThis.fetch, maxBytes, timeoutMs } = {}) {
  const url = checkLocalUrl(input);
  const res = await fetchImpl(url.href, { ...options, signal: deadline(options.signal, timeoutMs), redirect: 'error' });
  return bounded(res, url, limitOf(maxBytes));
}
