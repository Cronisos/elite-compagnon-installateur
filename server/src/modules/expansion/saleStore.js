// Enregistrement du suivi des ventes dans un fichier JSON du module (server/data/expansion-sales.json) : provenance de
// la soute et du porteur, systèmes connus, ventes mesurées, réglages. Écriture atomique : fichier temporaire puis
// renommage, un fichier à moitié écrit ne remplace jamais le bon.
//
// Au lancement, tout est recalculé depuis les journaux du jeu. Le fichier garde ce que les journaux ne disent plus :
// les ventes et les lots d'avant le plus ancien journal encore présent (journaux supprimés), et les réglages.

import path from 'node:path';
import { isPlainObject, readJsonFile, writeJsonAtomicSync } from '../../core/atomic.js';

export const STORE_VERSION = 1;
export const DEFAULT_SETTINGS = { autoWindow: true }; // fenêtre en jeu ouverte d'elle-même à quai

/** Contenu enregistré, ou un état vide si le fichier manque ou est illisible. */
export function loadSaleState(file) {
  // Illisible, ou d'une autre version : mis de côté (core/atomic.js) avant de repartir de zéro, jamais écrasé sans copie
  const data = readJsonFile(file, { fallback: null, accept: (v) => isPlainObject(v) && v.version === STORE_VERSION, label: 'Vente (Projet extension)' });
  if (!data) return { settings: { ...DEFAULT_SETTINGS } };
  const settings = { ...DEFAULT_SETTINGS };
  if (isPlainObject(data.settings) && typeof data.settings.autoWindow === 'boolean') settings.autoWindow = data.settings.autoWindow;
  return { ...data, settings };
}

/** Écrit l'état en remplaçant le fichier d'un coup. */
export function saveSaleState(file, state) {
  writeJsonAtomicSync(file, { version: STORE_VERSION, savedAt: new Date().toISOString(), ...state }); // core/atomic.js
}

/**
 * Ce que le fichier apporte en plus des journaux : les ventes d'avant le premier événement relu, et les lots si aucun
 * journal ne couvre le moment de l'enregistrement.
 * @param saved contenu de loadSaleState
 * @param firstEventAt horodatage ISO du plus ancien événement relu, ou null s'il n'y en a aucun
 */
export function seedFrom(saved, firstEventAt) {
  const first = firstEventAt ? Date.parse(firstEventAt) : Infinity;
  const savedAt = saved.savedAt ? Date.parse(saved.savedAt) : -Infinity;
  const older = (Array.isArray(saved.cases) ? saved.cases : []).filter((c) => c && Date.parse(c.t) < first);
  const keepCargo = savedAt < first; // aucun journal relu ne couvre l'état enregistré
  return {
    power: keepCargo ? saved.power : null,
    system: keepCargo ? saved.system : null,
    systems: Array.isArray(saved.systems) ? saved.systems : [],
    lots: keepCargo ? saved.lots : [],
    carrier: keepCargo ? saved.carrier : [],
    rares: saved.rares,
    cases: older,
  };
}
