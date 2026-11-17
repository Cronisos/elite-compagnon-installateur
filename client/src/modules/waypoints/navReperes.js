// Navigation de la fenêtre « Repères » en jeu (ListOverlay.jsx) : systèmes → planètes → EEP → repères, à la souris
// (l’auteur, 12 nov. 2026 : « je me suis rapproché de la planète 4 et je n'avais aucun moyen, à part la fenêtre principale »).
// La fenêtre suit d'elle-même où tu es (le niveau « auto ») ; un clic choisit un autre niveau, jusqu'à ce que tu changes
// de planète ou d'EEP ciblé, ou que tu cliques « Suivre ». Les repères taris ou pas rentables sont cachés, sauf demande.

import { tabOf } from './tabs.js';
import { shortPlace } from './places.js';

const meme = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
const parNom = (a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true });

/** Repères montrés : les actifs, plus les taris et pas rentables si on les demande. */
export const visibles = (liste, avecTaris, now = new Date()) => liste.filter((w) => avecTaris || tabOf(w, now) === 'main');

/** Combien de repères sont cachés (taris, pas rentables) dans cette liste. */
export const caches = (liste, now = new Date()) => liste.filter((w) => tabOf(w, now) !== 'main').length;

/** Systèmes où il y a des repères : [{ system, systemAddress, n }], celui où tu es en premier. */
export function systemes(liste, ici = null) {
  const m = new Map();
  for (const w of liste) {
    if (!w.system) continue;
    const k = w.system.toLowerCase();
    if (!m.has(k)) m.set(k, { system: w.system, systemAddress: w.systemAddress ?? null, n: 0 });
    m.get(k).n += 1;
  }
  return [...m.values()].sort((a, b) => (meme(b.system, ici) - meme(a.system, ici)) || parNom(a.system, b.system));
}

/** Planètes d'un système où il y a des repères : [{ body, nom, n, eeps }], dans l'ordre des noms (« 2 » avant « 10 »). */
export function planetes(liste, system) {
  const m = new Map();
  for (const w of liste) {
    if (!meme(w.system, system) || !(w.body || w.station)) continue;
    const body = w.body || w.station;
    if (!m.has(body)) m.set(body, { body, nom: shortPlace(body, w.system), n: 0, eeps: new Set() });
    const p = m.get(body);
    p.n += 1;
    if (w.siteNumber != null) p.eeps.add(w.siteNumber);
  }
  return [...m.values()].map((p) => ({ ...p, eeps: p.eeps.size })).sort((a, b) => parNom(a.nom, b.nom));
}

/** EEP d'une planète où il y a des repères : [{ site (null : sans EEP), n, taris }], par numéro, « sans EEP » à la fin. */
export function eeps(liste, body, now = new Date()) {
  const m = new Map();
  for (const w of liste) {
    if ((w.body || w.station) !== body) continue;
    const site = w.siteNumber ?? null;
    if (!m.has(site)) m.set(site, { site, n: 0, taris: 0 });
    const e = m.get(site);
    e.n += 1;
    if (tabOf(w, now) !== 'main') e.taris += 1;
  }
  return [...m.values()].sort((a, b) => (a.site == null) - (b.site == null) || a.site - b.site);
}

/** Repères d'un EEP (site null : ceux sans EEP) sur une planète. */
export const reperesDe = (liste, body, site) => liste.filter((w) => (w.body || w.station) === body && (w.siteNumber ?? null) === site);

/**
 * Niveau suivi de lui-même : l'EEP ciblé en jeu s'il a des repères, sinon la planète près de laquelle tu es si elle
 * en a, sinon ton système ; sans position, la liste des systèmes. { system, body?, site? } ; site null : « sans EEP ».
 */
export function vueAuto(here, liste, cible = null) {
  if (!here?.system) return {};
  const { system, body } = here;
  if (body && liste.some((w) => (w.body || w.station) === body)) {
    if (cible?.body === body && cible.site != null && liste.some((w) => w.body === body && w.siteNumber === cible.site)) return { system, body, site: cible.site };
    return { system, body };
  }
  return { system };
}

/** Clé de ce qui fait repartir la fenêtre sur le niveau suivi : changer de système, de planète ou d'EEP ciblé. */
export const cleContexte = (here, cible) => [here?.system || '', here?.body || '', cible?.body === here?.body ? cible?.site ?? '' : ''].join('|');
