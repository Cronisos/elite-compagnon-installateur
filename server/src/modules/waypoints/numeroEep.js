// Numéro de l'EEP où l'on est, pour un repère posé là. Le jeu ne le donne que si l'EEP est ciblé dans le HUD, ou à la
// « destination la plus proche » quand le vaisseau se pose ou décolle (rare : le Rhino se déploie souvent en vol). On le
// déduit donc d'abord de la position : l'EEP balayé qui te contient (eeps.js), puis un de tes repères numérotés tout
// proche (même EEP), et seulement ensuite l'EEP ciblé il y a peu (une cible ancienne peut être celle d'un autre EEP).
// Fonction pure, testée par numeroEep.test.js.

import { project } from './sweep.js';

export const PROCHE_M = 3000; // un repère numéroté à moins de 3 km : même EEP (les EEP sont bien plus espacés)
export const CIBLE_FRAICHE_MS = 20 * 60_000; // une cible de plus de 20 min peut être celle d'un autre EEP

/**
 * @param o.here position (latitude, longitude, body, planetRadius)
 * @param o.eep EEP balayé qui contient la position (ou null)
 * @param o.reperes repères de la planète ({ latitude, longitude, siteNumber })
 * @param o.site dernier EEP ciblé ou donné par le jeu ({ body, number, at } ; at en ms)
 * @returns { numero, source: 'eep' | 'repere' | 'cible' } ou null
 */
export function numeroEepIci({ here, eep = null, reperes = [], site = null, maintenant = Date.now() }) {
  if (!here?.body || !Number.isFinite(here.latitude) || !Number.isFinite(here.longitude)) return null;
  if (Number.isInteger(eep?.numero)) return { numero: eep.numero, source: 'eep' };
  let proche = null;
  for (const w of reperes) {
    if (!Number.isInteger(w.siteNumber) || !Number.isFinite(w.latitude) || !Number.isFinite(w.longitude)) continue;
    const d = project(here, w, here.planetRadius || w.planetRadius).d;
    if (d <= PROCHE_M && (!proche || d < proche.d)) proche = { d, numero: w.siteNumber };
  }
  if (proche) return { numero: proche.numero, source: 'repere' };
  if (site?.body === here.body && Number.isInteger(site.number) && maintenant - (site.at ?? 0) <= CIBLE_FRAICHE_MS) {
    return { numero: site.number, source: 'cible' };
  }
  return null;
}

export const DOUBLON_M = 150; // un repère déjà posé à moins de 150 m : c'est le même endroit, on le reprend

/** Repère déjà posé au même endroit (moins de DOUBLON_M), le plus proche, avec sa distance ; ou null. */
export function repereIci(here, reperes = [], max = DOUBLON_M) {
  if (!here?.body || !Number.isFinite(here.latitude) || !Number.isFinite(here.longitude)) return null;
  let best = null;
  for (const w of reperes) {
    if (w.body !== here.body || !Number.isFinite(w.latitude) || !Number.isFinite(w.longitude)) continue;
    const d = project(here, w, here.planetRadius || w.planetRadius).d;
    if (d <= max && (!best || d < best.d)) best = { w, d };
  }
  return best;
}
