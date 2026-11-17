// Calculs d'affichage de l'onglet « Où agir cette semaine » (sans React, testés à part).

import { discordName } from '../../core/discord.js';

export const STATE_LABELS = { Unoccupied: 'Inoccupé', Exploited: 'Exploité', Fortified: 'Consolidé', Stronghold: 'Forteresse' };
export const RELATION_LABELS = {
  acquisition: 'Prise (système Inoccupé à portée)',
  own: 'Tenu par ta puissance',
  enemy: 'Tenu par une autre puissance',
  any: 'Peu importe',
};
const DAY_MS = 24 * 3600 * 1000;
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });

/** Fraction de jauge en % : deux décimales sous 1 % (une prise commence souvent à 0,02 %). */
export function pctText(fraction) {
  if (!Number.isFinite(fraction)) return '—';
  const v = fraction * 100;
  return `${(Math.abs(v) < 1 ? nf2 : nf1).format(v)} %`;
}

export const stateLabel = (s) => STATE_LABELS[s] || s || 'sans état';

/**
 * Fraîcheur d'un relevé : « good » s'il date de la semaine Powerplay en cours, « warn » s'il a moins de 7 jours
 * mais précède le passage de semaine (les états ont pu changer), « bad » au-delà ou s'il manque.
 */
export function ageTone(iso, weekStartIso, now = Date.now()) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return 'bad';
  if (weekStartIso && t >= Date.parse(weekStartIso)) return 'good';
  return now - t < 7 * DAY_MS ? 'warn' : 'bad';
}

/**
 * Arrivée qui mérite le bandeau : un système de la dernière liste, ou un système valide pour la tâche. Un saut de
 * transit (hors de la liste, pas valide ou à confirmer) n'a droit qu'à une ligne discrète.
 */
export const isUsefulArrival = (a) => !!a && (a.inResults === true || a.valid === true);

/** Pourquoi un système est prenable : son appui, et si Spansh liste la puissance. */
export function reachText(reach) {
  if (!reach) return '';
  const parts = [];
  if (reach.anchor) {
    const seenOn = reach.anchor.at ? ` le ${new Date(reach.anchor.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : '';
    const from = reach.anchor.source === 'journal' ? ` (vu en jeu${seenOn})` : '';
    parts.push(`à ${nf1.format(reach.anchor.distance)} al de ${reach.anchor.name}, ${stateLabel(reach.anchor.state)}${from}`);
  } else parts.push('aucun appui connu à portée');
  if (!reach.listed) parts.push('Spansh ne liste pas encore ta puissance ici');
  else if (!reach.anchor) parts.push('Spansh liste ta puissance : appui absent des données');
  return parts.join(' · ');
}

/** Avancement à afficher selon le type de tâche. */
export function progressText(row, relation) {
  if (relation === 'acquisition') {
    if (row.progress == null) return '—';
    const rivals = row.rivals?.length ? ` · ${row.rivals.map((r) => `${r.power} ${pctText(r.progress)}`).join(', ')}` : '';
    return `${pctText(row.progress)}${row.points != null ? ` (${row.points.toLocaleString('fr-FR')} pts)` : ''}${rivals}`;
  }
  const parts = [];
  if (row.controlProgress != null) parts.push(`jauge ${nf3.format(row.controlProgress)}`);
  if (row.reinforcement != null) parts.push(`renfort ${row.reinforcement.toLocaleString('fr-FR')}`);
  if (row.undermining != null) parts.push(`sape ${row.undermining.toLocaleString('fr-FR')}`);
  return parts.join(' · ') || '—';
}

/**
 * Tâche envoyée au serveur : une tâche enregistrée telle quelle, ou une activité de base avec les exigences du
 * formulaire (types de station, plateforme L, contact Powerplay, zone de conflit, puissance visée).
 */
export function taskToSend(choice, { activities = [], tasks = [], extras = {} } = {}) {
  if (choice?.startsWith('task:')) {
    const t = tasks.find((x) => x.id === choice.slice(5));
    return t || null;
  }
  const a = activities.find((x) => x.id === choice);
  if (!a) return null;
  return {
    ...a,
    stationGroups: extras.stationGroups || [],
    largePad: !!extras.largePad,
    powerContact: !!extras.powerContact,
    conflictZone: !!extras.conflictZone,
    enemy: a.relation === 'enemy' ? extras.enemy || null : null,
  };
}

/**
 * Texte à coller dans Discord : la tâche et les premiers systèmes, avec l'âge de chaque donnée. Les noms viennent de
 * Spansh (relevés d'EDDN, que n'importe qui peut envoyer) : chacun passe par discordName (core/discord.js).
 */
export function shareText(result, rows, ago) {
  const lines = [`**${discordName(result.task?.name)}** autour de ${discordName(result.reference)} (${discordName(result.power) || 'puissance ?'})`];
  for (const r of rows) {
    lines.push(`- ${discordName(r.name)} · ${nf1.format(r.distance)} al · ${discordName(stateLabel(r.state))} · relevé ${ago(r.updatedAt)}`);
  }
  lines.push('Données Spansh (relevés des joueurs) : à confirmer en jeu à l\'arrivée.');
  return lines.join('\n');
}
