// Prospection d'un système pour le minage planétaire : les planètes à EEP, et pour chacune ce qu'on en a vu.
// Le jeu ne dit pas ce que contient un emplacement : ses minerais sont lus sur une capture ou notés à la main, et le
// joueur donne une note de 1 à 10 à l'EEP entier (un EEP a plusieurs gisements). À partir de 6, il est rentable.

import { netFetch } from '../../core/net.js'; // passerelle réseau unique (liste blanche, délai, taille)
import { AUTO_LABEL } from './lastSpot.js';

export const GOOD_RATING = 6;
const SITE_SIGNAL = '$PlanetaryMiningLocation_Name;';
const SPANSH_DUMP = 'https://spansh.co.uk/api/dump/';

/** Minerais d'un EEP : [{ ore }] propres, sans doublon. */
export function cleanDeposits(list) {
  const byOre = new Map();
  for (const d of Array.isArray(list) ? list : []) {
    const ore = String(d?.ore || '').trim().slice(0, 40);
    if (ore && !byOre.has(ore.toLowerCase())) byOre.set(ore.toLowerCase(), { ore });
  }
  return [...byOre.values()];
}

/** Note d'un EEP : entier de 1 à 10, sinon aucune. */
export function cleanRating(v) {
  const n = Number(v);
  return v != null && v !== '' && Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

/** Minerais d'une ligne MiningSite. */
export const depositsOf = (row) => {
  try {
    return cleanDeposits(JSON.parse(row.deposits || '[]'));
  } catch {
    return [];
  }
};

/**
 * État d'un emplacement : 'good' (note de 6 ou plus, ou repère de minage de 3 foreuses ou plus), 'low' (note de 1 à 5,
 * ou seulement des repères de 1 ou 2 foreuses, ou « pas rentable »), 'bad' (rien d'intéressant : seulement quand le
 * joueur l'a dit, jamais déduit), 'depleted' (repère vidé, de retour plus tard), 'seen' (minerais connus, par exemple
 * lus sur une capture, pas encore noté), 'unknown' (rien de noté).
 * Avant, un EEP avec seulement des repères de 1 ou 2 foreuses devenait « rien d'intéressant », sans moyen de l'enlever
 * (Synuefe OU-E c28-2 11 a, EEP 3 et 8 : diamants basse température et hélium 3, 13 nov. 2026).
 */
export function siteState({ bad, rating = null, deposits, waypoints = [] }, now = new Date()) {
  if (bad) return 'bad';
  // Repères de gisement : pas le repère « Fin du dernier minage », qui marque une position, pas un gisement
  const tous = waypoints.filter((w) => w.category === 'mining' && w.label !== AUTO_LABEL);
  const tari = (w) => w.depletedUntil && new Date(w.depletedUntil) > now;
  const wp = tous.filter((w) => !tari(w));
  // Tari seulement quand tous ses gisements le sont : un repère vidé ne tarit pas les autres (12 b, EEP 4, 14 nov. 2026)
  if (tous.some((w) => tari(w) && !w.unprofitable) && !wp.some((w) => !w.unprofitable)) return 'depleted';
  if (rating != null) return rating >= GOOD_RATING ? 'good' : 'low'; // la note du joueur prime
  if (wp.some((w) => !w.unprofitable && (w.drills == null || w.drills >= 3))) return 'good';
  if (wp.some((w) => !w.unprofitable)) return 'low'; // petit gisement : du minerai quand même
  if (deposits.length) return 'seen';
  if (wp.length) return 'low'; // « pas rentable » : dit du repère, pas de tout l'EEP
  return 'unknown';
}

/** Plus grand SystemAddress du jeu : entier non signé de 64 bits. */
const MAX_SYSTEM_ADDRESS = 18446744073709551615n;

/**
 * SystemAddress du jeu (entier de 64 bits, en chiffres, sans zéro devant), ou null. Il part tel quel dans l'adresse de
 * Spansh : « ../../api/… », « 1?jsonp=a# » ou « %2e%2e » demandaient n'importe quel chemin de spansh.co.uk.
 */
export function systemAddressOf(v) {
  let s = null;
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) s = String(v);
  else if (typeof v === 'bigint' && v >= 0n) s = v.toString();
  else if (typeof v === 'string') s = v;
  if (s === null || !/^(0|[1-9][0-9]{0,19})$/.test(s) || BigInt(s) > MAX_SYSTEM_ADDRESS) return null;
  return s;
}

// Bornes de ce qu'on garde d'une réponse de Spansh (relevés des joueurs par EDDN, sans contrôle) : un nombre d'EEP
// énorme faisait créer des millions de cases à la page de la planète (onglet saturé ou page blanche)
export const MAX_SITES = 100;
const MAX_NAME = 200;
const text = (v, max) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);
const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Planètes à EEP du système d'après Spansh (relevés des joueurs) : nom, type, distance, gravité, nombre d'EEP. */
export async function fetchSystemBodies(systemAddress, fetchImpl = netFetch) {
  const address = systemAddressOf(systemAddress);
  if (!address) throw new Error('SystemAddress invalide : rien n’est demandé à Spansh.');
  const res = await fetchImpl(`${SPANSH_DUMP}${encodeURIComponent(address)}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Spansh a répondu ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data?.system?.bodies) ? data.system.bodies : [];
  const out = [];
  for (const b of list) {
    const signals = b && typeof b === 'object' && b.signals && typeof b.signals.signals === 'object' && b.signals.signals ? b.signals.signals : null;
    if (!signals || !Object.hasOwn(signals, SITE_SIGNAL) || !signals[SITE_SIGNAL]) continue;
    const body = text(b.name, MAX_NAME);
    if (!body) continue;
    const n = signals[SITE_SIGNAL];
    out.push({
      body,
      subType: text(b.subType, 100),
      distance: finite(b.distanceToArrival),
      gravity: finite(b.gravity),
      sites: Number.isInteger(n) && n >= 0 && n <= MAX_SITES ? n : null,
    });
  }
  return out;
}

export const KNOWN_TTL_MS = 3600_000; // une réponse de Spansh sert une heure
export const KNOWN_RETRY_MS = 5 * 60_000; // Spansh injoignable : pas de nouvel essai automatique avant 5 min
export const KNOWN_MAX = 200; // systèmes gardés au plus, le moins récemment demandé part le premier
export const LOAD_GAP_MS = 30_000; // clic : 30 s au moins entre deux demandes du même système (boucle d'appels bornée)

/**
 * Refus d'une demande au clic trop rapprochée de la précédente (même système) : 429, avec le délai à attendre. Le
 * bouton de la page l'affiche tel quel.
 */
export function tooSoon(service, waitMs) {
  const s = Math.max(1, Math.ceil(waitMs / 1000));
  const message = `${service} vient d’être interrogé pour ce système : réessaie dans ${s} s.`;
  return Object.assign(new Error(message), { status: 429, publicMessage: message, retryAfter: s });
}

/**
 * Planètes à EEP connues de Spansh, par SystemAddress, gardées en mémoire. Rien ne part sans `online` : sans lui
 * (réglage des recherches automatiques coupé, et pas de clic), seule une réponse déjà reçue est rendue. Une adresse
 * qui n'est pas un vrai SystemAddress n'est ni demandée ni gardée. Une seule demande à la fois par système (un appel
 * de plus attend la même réponse), et au clic (`force`), 30 s au moins depuis la dernière tentative pour ce système :
 * sinon refus 429 (tooSoon), sans rien demander. Rend { bodies, loaded, at, error }.
 */
export class KnownBodies {
  constructor({ fetchBodies = fetchSystemBodies, now = Date.now, max = KNOWN_MAX, ttlMs = KNOWN_TTL_MS, retryMs = KNOWN_RETRY_MS, gapMs = LOAD_GAP_MS } = {}) {
    Object.assign(this, { fetchBodies, now, max, ttlMs, retryMs, gapMs });
    this.cache = new Map(); // adresse → { at, bodies, loaded, failedAt, error, triedAt }
    this.pending = new Map(); // adresse → demande en cours (promesse)
  }

  #keep(address, entry) {
    this.cache.delete(address); // remis en fin : le plus récent
    this.cache.set(address, entry);
    while (this.cache.size > this.max) this.cache.delete(this.cache.keys().next().value);
  }

  /**
   * @param {*} systemAddress
   * @param {object} [o]
   * @param {boolean} [o.online] Spansh peut être interrogé (réglage activé, ou clic)
   * @param {boolean} [o.force]  clic : interrogé même si la réponse gardée est encore fraîche, ou après un échec récent,
   *                              mais pas moins de `gapMs` après la tentative précédente (sinon erreur 429, tooSoon)
   */
  async get(systemAddress, { online = false, force = false } = {}) {
    const address = systemAddressOf(systemAddress);
    if (!address) return { bodies: [], loaded: false, at: null, error: null };
    const view = (e) => ({ bodies: e?.bodies || [], loaded: Boolean(e?.loaded), at: e?.at ? new Date(e.at).toISOString() : null, error: e?.error || null });
    const hit = this.cache.get(address);
    const now = this.now();
    const fresh = hit?.loaded && now - hit.at < this.ttlMs;
    const failedRecently = hit?.failedAt != null && now - hit.failedAt < this.retryMs;
    if (!online || (!force && (fresh || failedRecently))) return view(hit);
    // Déjà demandé à l'instant (double clic, plusieurs fenêtres) : la même réponse, sans seconde requête
    const pending = this.pending.get(address);
    if (pending) {
      await pending;
      return view(this.cache.get(address));
    }
    if (force && hit?.triedAt != null && now - hit.triedAt < this.gapMs) throw tooSoon('Spansh', this.gapMs - (now - hit.triedAt));
    const ask = this.#ask(address, hit, now);
    this.pending.set(address, ask);
    try {
      await ask;
    } finally {
      this.pending.delete(address);
    }
    return view(this.cache.get(address));
  }

  async #ask(address, hit, now) {
    try {
      const bodies = await this.fetchBodies(address);
      this.#keep(address, { at: now, bodies, loaded: true, failedAt: null, error: null, triedAt: now });
    } catch (err) {
      // Échec : l'ancienne réponse reste (si elle existe), et l'échec est noté pour ne pas réessayer à chaque appel
      this.#keep(address, { ...(hit || { at: null, bodies: [], loaded: false }), failedAt: now, error: String(err?.message || err).slice(0, 200), triedAt: now });
    }
  }
}

/** « Synuefe OU-E c28-2 10 a » → « 10 a » dans son système. */
export const shortBody = (body, system) =>
  system && body.toLowerCase().startsWith(`${system.toLowerCase()} `) ? body.slice(system.length + 1) : body;

// Type de planète : nom Spansh (subType) ou du journal (PlanetClass), en français
const PLANET_TYPES = {
  'metal-rich body': 'Riche en métaux',
  'metal rich body': 'Riche en métaux',
  'high metal content world': 'Haute teneur en métaux',
  'high metal content body': 'Haute teneur en métaux',
  'rocky body': 'Rocheuse',
  'rocky ice world': 'Roche et glace',
  'rocky ice body': 'Roche et glace',
  'icy body': 'Glacée',
};

/** « High metal content body » → « Haute teneur en métaux » ; type inconnu : tel quel. */
export const planetType = (raw) => (typeof raw === 'string' && raw ? (Object.hasOwn(PLANET_TYPES, raw.toLowerCase()) ? PLANET_TYPES[raw.toLowerCase()] : raw) : null);

const naturalSort = (a, b) => a.localeCompare(b, 'fr', { numeric: true });

/**
 * Vue d'un système : chaque planète à EEP avec son verdict, ses emplacements vus et ce qu'on peut y miner.
 * @param known planètes connues (Spansh) ; scanned : planète → nombre d'EEP vus au scan ; classes : planète → type scanné ; sites, bodies : lignes
 *   MiningSite et MiningBody du système ; waypoints : repères du système (vue avec depletedUntil)
 */
export function buildSurvey({ system, systemAddress, known = [], scanned = new Map(), classes = new Map(), sites = [], bodies = [], waypoints = [], here = null }, now = new Date()) {
  const lower = (s) => String(s || '').toLowerCase();
  const planets = new Map();
  const planet = (name) => {
    const key = lower(name);
    if (!planets.has(key)) planets.set(key, { body: name, subType: null, distance: null, gravity: null, count: null });
    return planets.get(key);
  };
  for (const k of known) Object.assign(planet(k.body), { subType: k.subType, distance: k.distance, gravity: k.gravity, count: k.sites });
  for (const [body, count] of scanned) {
    if (lower(body).startsWith(`${lower(system)} `) || lower(body) === lower(system)) planet(body).count = count;
  }
  for (const p of planets.values()) p.subType ??= classes.get(p.body) || null;
  for (const s of sites) planet(s.body);
  for (const b of bodies) planet(b.body);
  const mining = waypoints.filter((w) => w.category === 'mining' && w.body);
  for (const w of mining) planet(w.body);

  const list = [...planets.values()].map((p) => {
    const key = lower(p.body);
    const row = bodies.find((b) => lower(b.body) === key);
    const bodyWaypoints = mining.filter((w) => lower(w.body) === key);
    const numbers = new Set([
      ...sites.filter((s) => lower(s.body) === key).map((s) => s.number),
      ...bodyWaypoints.filter((w) => w.siteNumber != null).map((w) => w.siteNumber),
    ]);
    const siteList = [...numbers].sort((a, b) => a - b).map((number) => {
      const s = sites.find((x) => lower(x.body) === key && x.number === number);
      const deposits = s ? depositsOf(s) : [];
      const wps = bodyWaypoints.filter((w) => w.siteNumber === number);
      const state = siteState({ bad: s?.bad, rating: s?.rating ?? null, deposits, waypoints: wps }, now);
      // De retour quand le dernier gisement revient, et seulement si tout l'EEP est tari
      const retours = wps.map((w) => w.depletedUntil).filter((d) => d && new Date(d) > now).sort((a, b) => new Date(a) - new Date(b));
      return {
        number,
        bad: Boolean(s?.bad),
        rating: s?.rating ?? null,
        deposits,
        notes: s?.notes || '',
        waypoints: wps.map((w) => w.id),
        depletedUntil: state === 'depleted' ? retours[retours.length - 1] || null : null,
        state,
      };
    });
    const loose = bodyWaypoints.filter((w) => w.siteNumber == null); // repères de minage sans numéro d'EEP
    // Gisements sans numéro d'EEP : comme dans siteState, un repère tari ne rend pas la planète « bonne », et le repère
    // « Fin du dernier minage » marque une position, pas un gisement
    const tari = (w) => w.depletedUntil && new Date(w.depletedUntil) > now;
    const gisements = loose.filter((w) => w.label !== AUTO_LABEL);
    const libresVivants = gisements.filter((w) => !tari(w) && !w.unprofitable);
    const libresTaris = gisements.filter((w) => tari(w) && !w.unprofitable);
    const good = siteList.filter((s) => s.state === 'good');
    const seen = siteList.filter((s) => s.state !== 'unknown').length;
    let verdict = 'unknown';
    if (row?.out) verdict = 'out';
    else if (good.length || libresVivants.length) verdict = 'good';
    else if (siteList.some((s) => s.state === 'depleted') || libresTaris.length) verdict = 'depleted';
    else if (siteList.some((s) => s.state === 'low') || gisements.length) verdict = 'low'; // petits gisements
    else if (seen && !siteList.some((s) => s.state === 'seen')) verdict = 'bad'; // tout ce qu'on a vu est mauvais
    // Tarie : de retour quand le premier de ses gisements taris revient
    const retours = verdict === 'depleted'
      ? [...siteList.map((s) => s.depletedUntil), ...libresTaris.map((w) => w.depletedUntil)].filter(Boolean).sort((a, b) => new Date(a) - new Date(b))
      : [];

    // Ce qu'on peut venir chercher : minerais des EEP rentables, les mieux notés d'abord
    const byRating = (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.number - b.number;
    const ores = new Map();
    for (const s of siteList) {
      // Minerais de l'EEP : ceux notés ou lus, et le nom de ses repères (le minerai choisi en posant le repère)
      const noms = new Map();
      for (const d of s.deposits) noms.set(lower(d.ore), d.ore);
      for (const w of bodyWaypoints) {
        const nom = String(w.label || '').trim();
        if (w.siteNumber === s.number && nom && lower(nom) !== 'repère' && nom !== AUTO_LABEL && !noms.has(lower(nom))) noms.set(lower(nom), nom);
      }
      for (const [k, ore] of noms) {
        if (!ores.has(k)) ores.set(k, { ore, good: [], weak: [] });
        (s.state === 'good' ? ores.get(k).good : ores.get(k).weak).push({ number: s.number, rating: s.rating });
      }
    }
    for (const o of ores.values()) o.good.sort(byRating);
    const best = Math.max(0, ...siteList.map((s) => s.rating ?? 0)) || null;
    return {
      body: p.body,
      name: shortBody(p.body, system),
      subType: p.subType,
      type: planetType(p.subType ?? classes.get(p.body)),
      distance: p.distance,
      gravity: p.gravity,
      count: p.count,
      seen,
      good: good.length,
      best,
      verdict,
      depletedUntil: retours[0] ? new Date(retours[0]).toISOString() : null,
      out: Boolean(row?.out),
      notes: row?.notes || '',
      sites: siteList,
      looseWaypoints: loose.map((w) => w.id),
      ores: [...ores.values()].sort((a, b) => b.good.length - a.good.length || naturalSort(a.ore, b.ore)),
      here: here?.body != null && lower(here.body) === key,
    };
  });

  const rank = { good: 0, depleted: 1, low: 2, unknown: 3, bad: 4, out: 5 };
  list.sort((a, b) => rank[a.verdict] - rank[b.verdict] || (a.distance ?? 1e9) - (b.distance ?? 1e9) || naturalSort(a.body, b.body));
  return {
    system,
    systemAddress,
    planets: list,
    totals: {
      planets: list.length,
      good: list.filter((p) => p.verdict === 'good').length,
      depleted: list.filter((p) => p.verdict === 'depleted').length,
      low: list.filter((p) => p.verdict === 'low').length,
      out: list.filter((p) => p.verdict === 'out' || p.verdict === 'bad').length,
      unknown: list.filter((p) => p.verdict === 'unknown').length,
    },
  };
}
