// Recherche de planètes sur Spansh. L'API plafonne une recherche à 10 000 résultats : une tranche de
// distance qui atteint ce plafond est coupée en deux, jusqu'à tout récupérer.

import { netFetch } from '../../core/net.js'; // passerelle réseau unique (liste blanche, délai, taille)

const API = 'https://spansh.co.uk/api/bodies/search';
const PAGE_SIZE = 500;
const RESULT_CAP = 10000;
const PAUSE_MS = 350;
// Bornes dures (une réponse anormale de Spansh, changement d'API ou panne, faisait tourner la recherche sans fin) :
export const MAX_REQUESTS = 200; // requêtes par recherche
export const MIN_SLICE_LY = 0.5; // tranche de distance la plus fine ; en dessous, ses 10 000 premiers résultats suffisent
export const MAX_SEARCH_MS = 5 * 60_000; // durée totale d'une recherche

export const SUBTYPES = {
  'Metal-rich body': 'Riche en métaux',
  'High metal content world': 'Haute teneur en métaux',
  'Rocky body': 'Rocheuse',
  'Rocky Ice world': 'Roche et glace',
  'Icy body': 'Glacée',
};

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(params, min, max, page, fetchImpl) {
  const res = await fetchImpl(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filters: {
        subtype: { value: params.subtypes },
        is_landable: { value: true },
        gravity: { comparison: '<=>', value: [0, params.maxGravity] },
        distance: { min: String(min), max: String(max) },
      },
      sort: [{ distance: { direction: 'asc' } }],
      size: PAGE_SIZE,
      page,
      reference_coords: { x: 0, y: 0, z: 0 },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Spansh a répondu ${res.status}`);
  return res.json();
}

const slim = (b) => ({
  id: b.id,
  name: b.name,
  system: b.system_name,
  x: b.system_x,
  y: b.system_y,
  z: b.system_z,
  sol: b.distance,
  arrival: b.distance_to_arrival,
  gravity: b.gravity,
  temperature: b.surface_temperature,
  power: b.system_controlling_power || null,
  sites: (b.signals || []).filter((s) => s.name === 'Planetary Mining Location').reduce((n, s) => n + s.count, 0),
});

/** Réponse de Spansh illisible : la recherche s'arrête (502), au lieu de boucler. */
function unreadable(what) {
  const err = new Error(`Réponse de Spansh illisible (${what}) : recherche arrêtée.`);
  err.status = 502;
  err.publicMessage = err.message;
  return err;
}

/** Borne atteinte (requêtes ou durée) : la recherche s'arrête, et le joueur sait qu'il peut la resserrer. */
function tooLong(what) {
  const err = new Error(`recherche trop longue (${what}) : resserre la distance ou les critères.`);
  err.status = 502;
  err.publicMessage = err.message;
  return err;
}

/** Une page de résultats : count entier fini (≥ 0), results tableau. */
function checkPage(page) {
  if (!page || typeof page !== 'object') throw unreadable('pas un objet');
  if (!Number.isSafeInteger(page.count) || page.count < 0) throw unreadable('« count » absent ou pas un entier');
  if (!Array.isArray(page.results)) throw unreadable('« results » absent');
  return page;
}

/**
 * Toutes les planètes qui répondent aux critères, autour de Sol. Bornée : au plus MAX_REQUESTS requêtes, une tranche
 * pas plus fine que MIN_SLICE_LY (au plafond, on garde ses 10 000 premiers résultats et la recherche est dite
 * « tronquée »), au plus ceil(count / 500) pages par tranche, arrêt dès qu'une page n'apporte rien de nouveau, et
 * MAX_SEARCH_MS en tout. Le tableau rendu porte `truncated` (vrai si une borne a joué).
 */
export async function fetchBodies(params, onProgress = () => {}, fetchImpl = netFetch, wait = PAUSE_MS, { now = Date.now, maxRequests = MAX_REQUESTS, maxMs = MAX_SEARCH_MS } = {}) {
  const found = new Map();
  const ranges = [[0, params.maxDistance]];
  const started = now();
  let requests = 0;
  let truncated = false;
  const page = async (min, max, n) => {
    if (requests >= maxRequests) throw tooLong(`plus de ${maxRequests} requêtes à Spansh`);
    if (now() - started > maxMs) throw tooLong(`plus de ${Math.round(maxMs / 60_000)} min`);
    requests += 1;
    return checkPage(await fetchPage(params, min, max, n, fetchImpl));
  };
  while (ranges.length) {
    const [min, max] = ranges.shift();
    const first = await page(min, max, 0);
    if (first.count >= RESULT_CAP && max - min > MIN_SLICE_LY) {
      const mid = (min + max) / 2;
      ranges.unshift([min, mid], [mid, max]);
      await pause(wait); // la coupe aussi attend : jamais de rafale
      continue;
    }
    if (first.count >= RESULT_CAP) truncated = true;
    const pages = Math.ceil(Math.min(first.count, RESULT_CAP) / PAGE_SIZE);
    let results = first.results;
    for (let n = 0; n < pages && results.length; n++) {
      if (n) {
        await pause(wait);
        results = (await page(min, max, n)).results;
      }
      const before = found.size;
      for (const b of results) if (b && typeof b === 'object' && b.id != null) found.set(b.id, slim(b));
      onProgress(found.size);
      if (found.size === before) break; // la même page encore : rien de nouveau, on n'insiste pas
    }
    await pause(wait);
  }
  const out = [...found.values()];
  out.truncated = truncated;
  return out;
}
