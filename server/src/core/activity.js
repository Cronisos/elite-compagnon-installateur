// Activité du joueur vue de Status.json : un déplacement de plus de 50 m (vaisseau près d'une planète, SRV, à pied)
// ou un changement d'écran en jeu (carte, menus, station) veut dire que tu joues. Les chronos des sessions s'en
// servent pour se mettre en pause d'eux-mêmes quand rien ne bouge. Instants gardés sur disque (3 jours) pour
// recalculer les pauses après un redémarrage de l'app.

import { readJsonFile, writeJsonAtomicSync } from './atomic.js';
import { dataPath } from './paths.js';

export const IDLE_MS = 10 * 60 * 1000; // plus de 10 min sans rien faire : pause, comptée depuis la dernière action
const FILE = dataPath('activity.json');
const KEEP_MS = 3 * 24 * 3600 * 1000;
const MOVE_M = 50;
const EVERY_MS = 30 * 1000; // une action notée au plus toutes les 30 s : assez fin pour des pauses de 10 min

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const rad = (d) => (d * Math.PI) / 180;
function distance(a, b, r) {
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Est-ce que ce Status.json montre une action par rapport au précédent ? (`moved` : dernière position comptée) */
export function isAction(prev, st, moved) {
  const here = { latitude: num(st?.Latitude), longitude: num(st?.Longitude) };
  const far = here.latitude != null && here.longitude != null && num(st.PlanetRadius)
    && (!moved || distance(moved, here, st.PlanetRadius) >= MOVE_M);
  if (far) return { action: true, moved: here };
  return { action: Boolean(prev && st && prev.GuiFocus !== st.GuiFocus), moved };
}

class Activity {
  listeners = new Set();
  times = [];
  constructor(journal) {
    // Rien de noté encore, ou fichier illisible (mis de côté) : liste vide
    this.times = readJsonFile(FILE, { fallback: [], accept: Array.isArray, label: 'Activité' }).filter((t) => Number.isFinite(t) && Date.now() - t < KEEP_MS);
    let prev = journal.stateData?.status || null;
    let moved = null;
    let timer = null;
    journal.on('status', (st) => {
      const r = isAction(prev, st, moved);
      prev = st;
      moved = r.moved;
      if (!r.action) return;
      const t = Date.now();
      for (const fn of this.listeners) fn(t);
      if (this.times.length && t - this.times.at(-1) < EVERY_MS) return;
      this.times.push(t);
      timer ??= setTimeout(() => {
        timer = null;
        this.times = this.times.filter((x) => Date.now() - x < KEEP_MS);
        try {
          writeJsonAtomicSync(FILE, this.times); // jamais un fichier coupé (core/atomic.js)
        } catch (err) {
          console.error(`Activité : non enregistrée (${err.message})`);
        }
      }, 30000);
    });
  }

  /** fn(t) à chaque action vue dans Status.json. */
  onAction(fn) {
    this.listeners.add(fn);
  }
}

let shared = null;
/** Suivi d'activité partagé entre les modules (un seul par journal). */
export function activity(journal) {
  shared ??= new Activity(journal);
  return shared;
}
