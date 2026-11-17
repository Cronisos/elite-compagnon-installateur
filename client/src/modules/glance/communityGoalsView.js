// Mise en forme des objectifs communautaires (OC) du Coup d'œil, sans React (testée avec node --test).
// Les données viennent de GET /api/modules/glance/summary (champ communityGoals, calcul serveur communityGoals.js).
// Le temps restant et l'alerte « contribution nulle » se recalculent ici à chaque minute, avec le seuil du serveur.

import { compact, int } from '../../core/format.js';

/** Heures restantes à l'instant now ; null sans échéance connue. */
export function hoursLeft(goal, now = Date.now()) {
  const end = goal?.expiry ? Date.parse(goal.expiry) : NaN;
  return Number.isFinite(end) ? (end - now) / 3600e3 : null;
}

/** « fin dans 2 j 5 h », « fin dans 17 h 05 », « fin dans 40 min », « terminé · résultats en attente ». */
export function endText(goal, now = Date.now()) {
  const h = hoursLeft(goal, now);
  if (goal.status === 'pending' || (h != null && h <= 0)) return 'terminé · résultats en attente';
  if (h == null) return 'fin inconnue';
  const minutes = Math.floor(h * 60);
  if (minutes < 60) return `fin dans ${Math.max(1, minutes)} min`;
  if (minutes < 24 * 60) return `fin dans ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
  const d = Math.floor(minutes / 1440);
  const r = Math.floor((minutes % 1440) / 60);
  return `fin dans ${d} j${r ? ` ${r} h` : ''}`;
}

/** Contribution nulle et fin dans moins de alertHours heures (seuil donné par le serveur). */
export function zeroAlert(goal, alertHours, now = Date.now()) {
  if (goal.status !== 'active' || !goal.noContribution || alertHours == null) return false;
  const h = hoursLeft(goal, now);
  return h != null && h > 0 && h <= alertHours;
}

/**
 * OC en cours à afficher à l'instant now : la fin d'un OC sans contribution peut passer entre deux résumés du serveur
 * (aucun événement du journal) ; rien à en attendre, il disparaît comme côté serveur.
 */
export function shownGoals(cg, now = Date.now()) {
  return (cg?.active || []).filter((g) => {
    if (!g.noContribution) return true;
    const h = hoursLeft(g, now);
    return g.status === 'active' && (h == null || h > 0);
  });
}

export const contributionText = (goal) =>
  goal.contribution == null ? 'contribution inconnue' : `ta contribution ${int(goal.contribution)}`;

/** Ta tranche : « top 75 % », « dans les 10 premiers », « aucune tranche » sans contribution. */
export function bandText(goal) {
  if (goal.inTopRank) return goal.topRankSize ? `dans les ${int(goal.topRankSize)} premiers` : 'dans les premiers';
  if (goal.band == null) return goal.contribution == null ? 'tranche inconnue' : 'aucune tranche';
  return `top ${int(goal.band)} %`;
}

/** Palier atteint : « palier 3/6 », « aucun palier (sur 5) ». */
export function tierText(goal) {
  if (goal.tier != null) return goal.topTier != null ? `palier ${goal.tier}/${goal.topTier}` : `palier ${goal.tier}`;
  if (goal.tierName) return goal.tierName;
  return goal.topTier != null ? `aucun palier (sur ${goal.topTier})` : 'aucun palier';
}

export const placeText = (goal) => [goal.station, goal.system && (goal.station ? `(${goal.system})` : goal.system)].filter(Boolean).join(' ');

/**
 * Récompenses à réclamer, regroupées par station, pour la case « À encaisser » de la fenêtre en jeu :
 * { label, short, value } comme les autres catégories. Montant inconnu : « ? » (ou « ≥ » la part connue).
 */
export function communityGoalCash(cg) {
  const byPlace = new Map();
  for (const g of cg?.toClaim || []) {
    const key = `${g.station}\u0000${g.system}`;
    const x = byPlace.get(key) || { station: g.station, system: g.system, count: 0, value: 0, unknown: false };
    x.count++;
    if (g.reward > 0) x.value += g.reward;
    else x.unknown = true;
    byPlace.set(key, x);
  }
  return [...byPlace.values()].map((x) => {
    const what = x.count > 1 ? `${x.count} OC` : 'OC';
    return {
      label: `${what} · ${x.station || x.system || 'station inconnue'}${x.station && x.system ? ` (${x.system})` : ''}`,
      short: `${what} · ${x.station || x.system || '?'}`,
      value: x.unknown ? (x.value ? `≥ ${compact(x.value)}` : '?') : compact(x.value),
    };
  });
}

/** Total connu des récompenses à réclamer (crédits), pour le total « À encaisser ». */
export const communityGoalRewardTotal = (cg) => (cg?.toClaim || []).reduce((a, g) => a + (g.reward > 0 ? g.reward : 0), 0);
