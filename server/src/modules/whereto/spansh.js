// Recherche de systèmes Powerplay sur Spansh (POST /api/systems/search, sans clé), testée le 7 nov. 2026 :
//   filtres power_state, controlling_power, power et distance, autour de reference_system ;
//   réponse : count, results[] avec power[], controlling_power, power_state, power_state_control_progress,
//   power_state_reinforcement, power_state_undermining, power_conflict_progress[{ power, progress }], stations[],
//   minor_faction_presences[].active_states, updated_at et x, y, z.
//   Un système de référence inconnu répond 400 « Invalid request ».
//   reference_system tient compte des majuscules (testé le 8 nov. 2026 : « Synuefe OU-E c28-2 » répond, mais
//   « synuefe ou-e c28-2 » et « SYNUEFE OU-E C28-2 » donnent 400). Le nom exact se retrouve par l'autocomplétion
//   publique GET /api/systems/field_values/system_names?q=<nom> (réponse { values: [noms], min_max: [{ name }] },
//   sans tenir compte des majuscules), appelée seulement après un tel refus.
// Seuls des noms publics partent : le système de référence, une puissance, des états. Aucune donnée du joueur.
// Les réponses sont gardées en mémoire quelques minutes, réduites à ce qui sert.

import { netFetch } from '../../core/net.js'; // passerelle réseau unique (liste blanche, délai, taille)
import { CONFLICT_ZONE_STATES } from './rules.js';

export const API = 'https://spansh.co.uk/api/systems/search';
export const NAMES_API = 'https://spansh.co.uk/api/systems/field_values/system_names';
export const PAGE_SIZE = 500; // accepté par Spansh (135 résultats d'un coup, 1,1 Mo, le 7 nov. 2026)
export const MAX_PAGES = 4; // au-delà de 2 000 systèmes, la recherche est trop large
export const CACHE_MS = 10 * 60 * 1000;
const CACHE_MAX = 40;
const TIMEOUT_MS = 30_000;
const PAUSE_MS = 350;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => (Number.isFinite(v) ? v : null);

/** Erreur montrée telle quelle au joueur. */
export class SpanshError extends Error {
  constructor(message, status = 502, code = null) {
    super(message);
    this.status = status;
    this.publicMessage = message;
    this.code = code;
  }
}

/**
 * Le nom écrit comme l'un des noms connus (même nom à la casse près), sinon tel quel. Sert à retrouver la casse
 * exacte d'un nom tapé à la main dans les systèmes déjà vus en jeu, sans rien envoyer.
 */
export function exactCase(name, known) {
  const key = name.toLowerCase();
  for (const k of known) if (typeof k === 'string' && k.toLowerCase() === key) return k;
  return name;
}

function slimStation(s) {
  return {
    name: String(s?.name || ''),
    type: typeof s?.type === 'string' ? s.type : null,
    arrival: num(s?.distance_to_arrival),
    largePad: s?.has_large_pad === true || (s?.large_pads || 0) > 0,
    mediumPad: (s?.medium_pads || 0) > 0,
    powerContact: Array.isArray(s?.services) && s.services.includes('Powerplay'),
    marketId: num(s?.market_id),
  };
}

/** Système Spansh réduit à ce qui sert à « Où agir ». */
export function slimSystem(r) {
  const wars = (r?.minor_faction_presences || []).filter((f) => (f?.active_states || []).some((s) => CONFLICT_ZONE_STATES.includes(s)));
  return {
    name: String(r?.name || ''),
    id64: r?.id64 != null ? String(r.id64) : null,
    x: num(r?.x),
    y: num(r?.y),
    z: num(r?.z),
    distance: num(r?.distance),
    state: typeof r?.power_state === 'string' ? r.power_state : null,
    controllingPower: typeof r?.controlling_power === 'string' ? r.controlling_power : null,
    powers: Array.isArray(r?.power) ? r.power.filter((p) => typeof p === 'string') : [],
    controlProgress: num(r?.power_state_control_progress),
    reinforcement: num(r?.power_state_reinforcement),
    undermining: num(r?.power_state_undermining),
    conflict: (Array.isArray(r?.power_conflict_progress) ? r.power_conflict_progress : [])
      .filter((c) => typeof c?.power === 'string' && Number.isFinite(c.progress))
      .map((c) => ({ power: c.power, progress: c.progress })),
    warZones: wars.length,
    population: num(r?.population),
    updatedAt: typeof r?.updated_at === 'string' ? r.updated_at : null,
    stations: (Array.isArray(r?.stations) ? r.stations : []).map(slimStation),
  };
}

export class SpanshClient {
  constructor({ fetchImpl = netFetch, wait = PAUSE_MS, now = Date.now } = {}) {
    this.fetch = fetchImpl;
    this.wait = wait;
    this.now = now;
    this.cache = new Map(); // clé → { at, promise }
    this.names = new Map(); // nom en minuscules → promesse du nom exact chez Spansh
    this.stats = { requests: 0, cached: 0 };
  }

  /** Nom exact (casse comprise) d'un système, d'après l'autocomplétion de Spansh. Null s'il est introuvable. */
  exactName(name) {
    const key = name.toLowerCase();
    if (!this.names.has(key)) {
      const promise = this.lookupName(name).catch(() => null);
      this.names.set(key, promise);
      // un échec ne reste pas en mémoire ; la liste reste courte
      promise.then((found) => { if (!found && this.names.get(key) === promise) this.names.delete(key); });
      while (this.names.size > CACHE_MAX) this.names.delete(this.names.keys().next().value);
    }
    return this.names.get(key);
  }

  async lookupName(name) {
    this.stats.requests++;
    const res = await this.fetch(`${NAMES_API}?q=${encodeURIComponent(name)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const key = name.toLowerCase();
    const names = [...(Array.isArray(data?.values) ? data.values : []), ...(Array.isArray(data?.min_max) ? data.min_max.map((v) => v?.name) : [])];
    return names.find((n) => typeof n === 'string' && n.toLowerCase() === key) || null;
  }

  async page(body) {
    let res;
    try {
      this.stats.requests++;
      res = await this.fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new SpanshError('Spansh ne répond pas (plus de 30 s). Réessaie dans un instant.', 504);
      throw new SpanshError("Spansh est injoignable : vérifie ta connexion à Internet.", 502);
    }
    if (res.status === 400) {
      throw new SpanshError(
        `Spansh ne trouve pas le système « ${body.reference_system} » : vérifie son orthographe exacte, majuscules comprises (ou Spansh refuse la recherche).`,
        404,
        'unknown-reference',
      );
    }
    if (res.status === 429) throw new SpanshError('Spansh limite les recherches pour le moment : réessaie dans une minute.', 503);
    if (!res.ok) throw new SpanshError(`Spansh a répondu ${res.status}. Réessaie plus tard.`, 502);
    try {
      return await res.json();
    } catch {
      throw new SpanshError('Réponse de Spansh illisible.', 502);
    }
  }

  /**
   * Tous les systèmes qui répondent aux filtres à `maxDistance` al au plus de `reference`, du plus proche au plus loin.
   * filters : { power_state?: string[], controlling_power?: string[], power?: string[] }
   * Retourne { systems, count, truncated, fetchedAt, cached }.
   * Spansh tient compte des majuscules : après un refus (400), le nom exact est cherché par l'autocomplétion, puis
   * la recherche repart avec lui. Les noms exacts trouvés sont retenus pour les recherches suivantes.
   */
  async search(reference, maxDistance, filters = {}) {
    const sent = (await this.names.get(reference.toLowerCase())) || reference;
    try {
      return await this.cachedSearch(sent, maxDistance, filters);
    } catch (err) {
      if (err?.code !== 'unknown-reference') throw err;
      const exact = await this.exactName(reference);
      if (!exact || exact === sent) throw err;
      return this.cachedSearch(exact, maxDistance, filters);
    }
  }

  async cachedSearch(reference, maxDistance, filters) {
    const key = JSON.stringify([reference, maxDistance, filters]); // casse comprise : c'est ce qui part chez Spansh
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < CACHE_MS) {
      this.stats.cached++;
      const value = await hit.promise;
      return { ...value, cached: true };
    }
    const promise = this.fetchAll(reference, maxDistance, filters);
    this.cache.set(key, { at: this.now(), promise });
    while (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value);
    try {
      return { ...(await promise), cached: false };
    } catch (err) {
      this.cache.delete(key); // une erreur ne reste pas en cache
      throw err;
    }
  }

  async fetchAll(reference, maxDistance, filters) {
    const f = { distance: { min: '0', max: String(maxDistance) } };
    for (const [k, v] of Object.entries(filters)) if (Array.isArray(v) && v.length) f[k] = { value: v };
    const body = (page) => ({ filters: f, sort: [{ distance: { direction: 'asc' } }], size: PAGE_SIZE, page, reference_system: reference });
    const first = await this.page(body(0));
    const systems = (first.results || []).map(slimSystem);
    const count = Number(first.count) || systems.length;
    let page = 1;
    while (systems.length < count && page < MAX_PAGES) {
      await pause(this.wait);
      const next = await this.page(body(page++));
      if (!next.results?.length) break;
      systems.push(...next.results.map(slimSystem));
    }
    return {
      systems,
      count,
      truncated: systems.length < count,
      reference: first.reference ? { name: first.reference.name, x: num(first.reference.x), y: num(first.reference.y), z: num(first.reference.z) } : null,
      fetchedAt: new Date(this.now()).toISOString(),
    };
  }
}
