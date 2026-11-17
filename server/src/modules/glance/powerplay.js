// Powerplay du système où se trouve le commandant, relevé dans le journal à chaque arrivée
// (FSDJump, Location, CarrierJump), et points de contrôle correspondants.
//
// Le jeu donne la progression en fraction du palier en cours. Paliers mesurés sur les journaux de référence
// le 1er novembre 2026 (une seule mesure par palier, à recouper avec le relevé en jeu) :
//   prise : 120 000 points · Exploité → Consolidé : 350 000 · Consolidé → Forteresse : 650 000.

import { ACQUISITION_POINTS, TIER_FORTIFIED_POINTS, TIER_STRONGHOLD_POINTS, erosionOf } from '../../regles/powerplay.js';

// Paliers : dépôt des règles (server/src/regles/powerplay.js)
export { ACQUISITION_POINTS };
const TIERS = {
  Exploited: { points: TIER_FORTIFIED_POINTS, next: 'Consolidé' },
  Fortified: { points: TIER_STRONGHOLD_POINTS, next: 'Forteresse' },
};
const LABELS = { Unoccupied: 'Non occupé', Exploited: 'Exploité', Fortified: 'Consolidé', Stronghold: 'Forteresse' };

/** Résumé Powerplay d'un événement d'arrivée dans un système. */
export function systemPowerplay(ev) {
  const state = ev.PowerplayState || null;
  const progress = ev.PowerplayStateControlProgress ?? null;
  const tier = TIERS[state];
  const points = tier && progress != null ? Math.round(progress * tier.points) : null;
  return {
    name: ev.StarSystem,
    at: ev.timestamp,
    state,
    label: state ? LABELS[state] || state : null,
    power: ev.ControllingPower || null,
    progress,
    // Points acquis dans le palier, et à faire pour passer au suivant
    points,
    tier: tier ? tier.points : null,
    // Érosion au prochain passage si la jauge en reste là (vérifiée en Exploité ; palier atteint : changement de niveau)
    erosion: points != null && points < tier.points ? erosionOf(points, tier.points) : null,
    erosionVerifiee: state === 'Exploited',
    next: tier ? tier.next : null,
    reinforcement: ev.PowerplayStateReinforcement ?? null,
    undermining: ev.PowerplayStateUndermining ?? null,
    conflict: (ev.PowerplayConflictProgress || [])
      .map((c) => ({ power: c.Power, progress: c.ConflictProgress, points: Math.round((c.ConflictProgress || 0) * ACQUISITION_POINTS), tier: ACQUISITION_POINTS }))
      .sort((a, b) => b.progress - a.progress),
  };
}

/** Points suivis dans un relevé : ceux du palier, ou en conflit ceux de la puissance du joueur. */
function trackedPoints(reading, myPower) {
  if (reading.points != null) return reading.points;
  return reading.conflict?.find((c) => c.power === myPower)?.points ?? null;
}

/**
 * Évolution depuis le relevé précédent du même système : écart de points et date de ce relevé.
 * Null si l'état a changé entre les deux (les points ne se comparent plus) ou sans relevé précédent.
 */
export function systemChange(system, myPower) {
  const prev = system.previous;
  if (!prev || prev.label !== system.label) return null;
  const now = trackedPoints(system, myPower);
  const before = trackedPoints(prev, myPower);
  if (now == null || before == null) return null;
  return { points: now - before, since: prev.at };
}
