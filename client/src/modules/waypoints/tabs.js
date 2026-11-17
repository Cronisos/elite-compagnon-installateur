// Onglet où ranger un repère. « Pas rentable » prime : une veine tarie qui revient resterait une mauvaise zone.

/** Veine vidée il y a moins de 2 mois. */
export const isDepleted = (w, now = new Date()) => w.depletedUntil != null && new Date(w.depletedUntil) > now;

/** @returns 'main', 'depleted' ou 'unprofitable' */
export function tabOf(w, now = new Date()) {
  if (w.unprofitable) return 'unprofitable';
  return isDepleted(w, now) ? 'depleted' : 'main';
}
