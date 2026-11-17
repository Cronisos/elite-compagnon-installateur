// Épingle d'un ingénieur, côté interface : ce que tes journaux en montrent (déduite), ce que tu en dis (saisie), celle
// que l'itinéraire retient, et les avis (tes journaux contredisent ta saisie, nouvelle épingle vue). Fonctions pures,
// testées sans navigateur (pinView.test.js). La règle du choix est celle du serveur (pins.js, R9) : la plus récente
// des deux l'emporte ; « Aucun » ou « Je ne sais pas » plus récents que la déduction : rien à distance chez lui.

import { time } from '../../core/format.js';

const dayMonth = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '—');
const nameOf = (p) => (p ? `${p.label ?? p.blueprint} (${p.groupLabel ?? p.grp})` : null);

export const PIN_TITLE = 'Épingle · un seul plan épinglé par ingénieur';
export const PIN_HELP = 'Une épingle vaut pour tous les modules de ce type, toutes tailles. Pour un autre type (bouclier bi-tissé ou prismatique, autre arme), ce n’est pas vérifié : je ne la compte pas. Si elle ne monte pas jusqu’au grade voulu, je fais à distance ce qu’elle permet, et le reste à une escale.';
export const PIN_LOCKED = 'Pas encore débloqué : on n’épingle qu’à son atelier, une fois débloqué.';
export const CHOICES = Object.freeze({ pinned: 'J’ai épinglé :', none: 'Aucun', unknown: 'Je ne sais pas' });

/**
 * Épingle déduite de tes journaux : « Déduite de tes journaux : Efficace (Laser à faisceau), dernier constat le 05/11
 * (G3 à distance). Le jeu n'écrit pas les épingles : tu as pu en changer depuis. »
 */
export function deducedText(d) {
  if (!d) return null;
  const grade = d.grade != null ? ` (G${d.grade} à distance)` : '';
  return `Déduite de tes journaux : ${nameOf(d)}, dernier constat le ${dayMonth(d.at)}${grade}. Le jeu n’écrit pas les épingles : tu as pu en changer depuis.`;
}

/**
 * Épingle retenue pour l'itinéraire : « Retenue pour l'itinéraire : Efficace (Laser à faisceau) · à distance jusqu'au G5
 * (rang 5) · déduite le 05/11 » ; aucune : « Aucune épingle retenue : rien ne se fera à distance chez Broo Tarquin. » ;
 * une déduction écartée par ta saisie plus récente est dite (« déduction du 05/11 non utilisée : tu as dit « Aucun » »).
 * @param {object} ps PinState (GET /engineers/:id → pin)
 * @param {{ name: string, rank: number|null }} e
 */
export function retainedText(ps, { name, rank = null } = {}) {
  const lines = [];
  const p = ps?.effective;
  if (p) {
    const remote = p.remoteMax != null ? `à distance jusqu’au G${p.remoteMax}${rank != null ? ` (rang ${rank})` : ''}` : 'rien à distance tant qu’il n’est pas débloqué avec un rang connu';
    const src = p.source === 'saisie' ? `saisie le ${dayMonth(p.at)}` : `déduite le ${dayMonth(p.at)}`;
    lines.push(`Retenue pour l’itinéraire : ${nameOf(p)} · ${remote} · ${src}`);
  } else {
    lines.push(`Aucune épingle retenue : rien ne se fera à distance chez ${name}.`);
  }
  if (ps?.unused && ps.deduced) {
    const said = ps.saisie?.choice === 'none' ? 'tu as dit « Aucun »' : 'tu as dit ne pas savoir';
    lines.push(`(déduction du ${dayMonth(ps.deduced.at)} non utilisée : ${said})`);
  }
  return lines;
}

/**
 * Avis sur l'épingle : contradiction (tes journaux montrent un autre plan, plus récent que ta saisie) ou nouvelle
 * épingle vue (tu avais dit ne pas savoir). → { kind, text, buttons } ou null.
 */
export function noticeText(ps, { name } = {}) {
  const n = ps?.notice;
  if (!n) return null;
  const d = ps.deduced ?? n.deduced;
  const X = d?.label ?? d?.blueprint;
  if (n.kind === 'nouvelle') return { kind: 'nouvelle', tone: 'info', text: `Nouvelle épingle vue dans tes journaux : « ${X} » le ${dayMonth(d?.at)}.`, buttons: [] };
  const s = ps.saisie ?? n.saisie;
  const Y = s?.choice === 'pinned' ? s.label ?? s.blueprint : 'Aucun';
  return {
    kind: 'contradiction',
    tone: 'warn',
    text: `⚠ Tes journaux contredisent ta saisie : le ${dayMonth(d?.at)} à ${time(d?.at)}, une application à distance chez ${name} montre « ${X} » ; tu avais dit « ${Y} » le ${dayMonth(s?.at)}. Je retiens celle du jeu.`,
    buttons: ['C’est bien ça', 'J’ai changé depuis'],
  };
}

/** Plans proposés, groupés par type de module, pour la liste « J'ai épinglé » : « Efficace (jusqu'au G5) ». */
export function pinOptions(offers = []) {
  const groups = new Map();
  for (const o of offers) {
    if (!groups.has(o.grp)) groups.set(o.grp, { grp: o.grp, label: o.groupLabel ?? o.grp, options: [] });
    groups.get(o.grp).options.push({ value: `${o.grp}|${o.blueprint}`, text: `${o.label ?? o.blueprint} (jusqu’au G${o.maxGrade})` });
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

/** Choix de départ du formulaire : ta saisie, sinon l'épingle déduite (« J'ai épinglé » ce plan), sinon rien de coché. */
export function formInitial(ps) {
  const s = ps?.saisie;
  if (s?.choice === 'pinned') return { choice: 'pinned', value: `${s.grp}|${s.blueprint}` };
  if (s?.choice === 'none' || s?.choice === 'unknown') return { choice: s.choice, value: ps?.deduced ? `${ps.deduced.grp}|${ps.deduced.blueprint}` : '' };
  if (ps?.deduced) return { choice: 'pinned', value: `${ps.deduced.grp}|${ps.deduced.blueprint}` };
  return { choice: null, value: '' };
}

/** Corps de PUT /engineers/:id/pin d'après le formulaire ; « J'ai épinglé » sans plan choisi : null (rien à envoyer). */
export function pinBody(choice, value) {
  if (choice === 'none' || choice === 'unknown') return { choice };
  if (choice !== 'pinned' || !value || !value.includes('|')) return null;
  const [grp, blueprint] = value.split('|');
  return { choice: 'pinned', grp, blueprint };
}

/** Boutons de l'épingle déduite : « C'est bien ça » (saisie de ce plan) et « Effacer » (« Je ne sais pas »). */
export function deducedActions(ps) {
  if (!ps?.deduced) return [];
  return [
    { label: 'C’est bien ça', body: { choice: 'pinned', grp: ps.deduced.grp, blueprint: ps.deduced.blueprint } },
    { label: 'Effacer', body: { choice: 'unknown' } },
  ];
}

/** « Revenir à la déduction » : seulement quand une saisie et une déduction existent. */
export const canRevert = (ps) => !!(ps?.saisie && ps?.deduced);

/** Cellule « Épingle » du tableau des ingénieurs : « Efficace (Laser à faisceau) · déduite », « … · saisie », « — ». */
export function pinCell(ps) {
  const p = ps?.effective;
  if (!p) return '—';
  return `${nameOf(p)} · ${p.source === 'saisie' ? 'saisie' : 'déduite'}`;
}
