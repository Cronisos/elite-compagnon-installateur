// Durée d'affichage de la bulle du compagnon, selon la longueur de la phrase (le temps de la lire en jeu).

export const MIN_MS = 4_000;
export const MAX_MS = 12_000;
/** L'humeur de la phrase reste un moment après la bulle, puis revient à l'humeur de fond. */
export const MOOD_HOLD_MS = 5_000;

export function bubbleMs(text) {
  const n = String(text || '').length;
  return Math.min(MAX_MS, Math.max(MIN_MS, 2_500 + n * 60));
}

/** Temps qu'il reste à une phrase déjà dite (fenêtre ouverte juste après), 0 si elle est passée. */
export function remainingMs(line, now = Date.now()) {
  const at = Date.parse(line?.at);
  if (!line?.text || !Number.isFinite(at)) return 0;
  return Math.max(0, at + (line.ms || bubbleMs(line.text)) - now);
}

/** Adresses distinctes des images d'un pack (une humeur manquante reprend l'image neutre : chargée une fois). */
export function distinctImages(pack) {
  return [...new Set(Object.values(pack?.moods || {}).filter(Boolean))];
}
