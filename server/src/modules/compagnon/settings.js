// Réglages du compagnon : server/data/compagnon.json, écrit de façon atomique (fichier temporaire puis
// renommage : un arrêt brutal ne laisse jamais un fichier à moitié écrit).

import { isPlainObject, readJsonFile, writeFileAtomicSync } from '../../core/atomic.js';
import { CATEGORY_MAP } from './categories.js';
import { LEVELS } from './engine.js';
import { cleanText } from './phrases.js';
import { DEFAULT_PACK, validPackId } from './packs.js';

export const DEFAULTS = Object.freeze({
  enabled: true,
  name: 'Copilote',
  pack: DEFAULT_PACK,
  level: 'normal',
  categories: {}, // catégorie → false pour la faire taire (toutes actives par défaut)
  minProfit: 1_000_000, // bon bénéfice
  bigProfit: 20_000_000, // très grosse vente
  overlay: false, // fenêtre par-dessus le jeu
  inApp: true, // petit compagnon en bas à droite de l'application
  side: 'left', // avatar à gauche de la bulle, ou à droite
});

const MAX_PROFIT = 1e12;

function amount(v, fallback) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= MAX_PROFIT ? n : fallback;
}

/**
 * Réglages validés : chaque champ inconnu est ignoré, chaque valeur invalide garde la valeur de base.
 * @param input réglages reçus (corps de requête, fichier)
 * @param base réglages actuels
 */
export function cleanSettings(input, base = DEFAULTS) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const has = (k) => Object.hasOwn(src, k);
  const out = { ...DEFAULTS, ...base, categories: { ...(base.categories || {}) } };
  for (const k of ['enabled', 'overlay', 'inApp']) if (has(k) && typeof src[k] === 'boolean') out[k] = src[k];
  if (has('name')) out.name = cleanText(src.name, 30) || DEFAULTS.name;
  if (has('pack') && validPackId(src.pack)) out.pack = src.pack;
  if (has('level') && typeof src.level === 'string' && Object.hasOwn(LEVELS, src.level)) out.level = src.level;
  if (has('side') && (src.side === 'left' || src.side === 'right')) out.side = src.side;
  if (has('minProfit')) out.minProfit = amount(src.minProfit, out.minProfit);
  if (has('bigProfit')) out.bigProfit = amount(src.bigProfit, out.bigProfit);
  if (has('categories') && src.categories && typeof src.categories === 'object' && !Array.isArray(src.categories)) {
    for (const id of Object.keys(src.categories)) {
      if (!CATEGORY_MAP.has(id) || typeof src.categories[id] !== 'boolean') continue;
      if (src.categories[id]) delete out.categories[id];
      else out.categories[id] = false;
    }
  }
  return out;
}

export function loadSettings(file) {
  // Illisible : mis de côté (core/atomic.js), réglages par défaut
  const saved = readJsonFile(file, { fallback: {}, accept: isPlainObject, label: 'Compagnon (réglages)' });
  try {
    return cleanSettings(saved);
  } catch {
    return cleanSettings({});
  }
}

/** Écriture atomique d'un JSON. */
export function writeJsonAtomic(file, data) {
  writeFileAtomicSync(file, JSON.stringify(data, null, 2)); // core/atomic.js
}

export function saveSettings(file, settings) {
  writeJsonAtomic(file, settings);
}
