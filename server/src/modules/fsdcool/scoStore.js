// Mesures du SCO gardées d'une session à l'autre (data/sco-cooldown.json) : écarts entre une coupure et la
// réactivation suivante, par vaisseau. Écriture atomique (fichier temporaire puis renommage).

import { isPlainObject, readJsonFile, writeJsonAtomicSync } from '../../core/atomic.js';
import { shipKey, validGap, SCO_KEEP } from './sco.js';

/** Map vaisseau → [{ at, ms }] ; vide si le fichier manque ou est illisible. Les entrées inattendues sont ignorées. */
export function loadSamples(file) {
  const out = new Map();
  // Aucune mesure encore, ou fichier illisible (mis de côté, core/atomic.js)
  const raw = readJsonFile(file, { fallback: null, accept: isPlainObject, label: 'Supercroisière (mesures)' });
  if (!raw) return out;
  const ships = raw?.samples;
  if (!ships || typeof ships !== 'object' || Array.isArray(ships)) return out;
  for (const name of Object.keys(ships)) {
    const key = shipKey(name);
    if (!key || key !== name || !Array.isArray(ships[name])) continue;
    const list = ships[name]
      .filter((s) => s && typeof s === 'object' && validGap(s.ms) && typeof s.at === 'string' && Number.isFinite(Date.parse(s.at)))
      .map((s) => ({ at: s.at, ms: Math.round(s.ms) }))
      .slice(-SCO_KEEP);
    if (list.length) out.set(key, list);
  }
  return out;
}

export function saveSamples(file, samples) {
  writeJsonAtomicSync(file, { version: 1, samples: Object.fromEntries(samples) }); // core/atomic.js
}
