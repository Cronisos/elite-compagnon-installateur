// Mise en forme de la page Escadron (sans React, pour les tests).

import { compact, dateTime, int } from '../../core/format.js';

/** Valeur d'un classement selon son unité (crédits, mérites, tonnes, ou nombre sans unité connue). */
export function valueText(value, unit) {
  if (value == null) return '—';
  if (unit === 'cr') return `${compact(value)} cr`;
  if (unit === 't') return `${int(value)} t`;
  return int(value);
}

/** Écart signé : « +47 251 », « 0 », « — » si inconnu. */
export function deltaText(delta, unit) {
  if (delta == null) return '—';
  const text = valueText(Math.abs(delta), unit);
  return delta > 0 ? `+${text}` : delta < 0 ? `−${text}` : text;
}

const STATUS_CLASS = new Map([
  ['mesurée', 'pill-good'],
  ['publiée', 'pill-info'],
  ['à vérifier', 'pill-warn'],
  ['inconnue', 'pill-muted'],
]);
export const statusClass = (status) => `pill ${STATUS_CLASS.get(status) ?? 'pill-muted'}`;

/** Recoupement Powerplay : ce que le jeu a crédité à l'escadron face aux mérites du journal. */
export function journalCheck(row) {
  const j = row?.journal;
  if (!j || row.delta == null) return null;
  // Écrits mais non crédités : lignes en double (total inchangé) et gains annulés par la ligne suivante
  const lost = j.listed - j.real;
  const doubled = Math.min(Math.max(j.doubled ?? 0, 0), Math.max(lost, 0));
  const cancelled = lost - doubled;
  let detail = '';
  if (lost > 0) {
    const why = doubled > 0 && cancelled > 0
      ? `${int(lost)} non crédités (${int(doubled)} en double, ${int(cancelled)} annulés par la ligne suivante)`
      : doubled > 0 ? `${int(doubled)} en double` : `${int(cancelled)} annulés par la ligne suivante`;
    detail = `, ${int(j.listed)} écrits dont ${why}`;
  }
  if (j.real === row.delta) return { ok: true, text: `= ton journal : ${int(j.real)} mérites crédités${detail}` };
  return { ok: false, text: `Ton journal : ${int(j.real)} mérites crédités${detail}. Écart avec l'escadron : ${deltaText(row.delta - j.real)}.` };
}

const plural = (n, one, many) => `${int(n)} ${n > 1 ? many : one}`;

const JOUR_MS = 86_400_000;
/**
 * Qui envoie ses mérites, pour le chef : le classement ne compte que ceux-là. `membres` : [{ cmdr, dernierEnvoi }]
 * (dernierEnvoi : date du dernier mérite reçu, null s'il n'y en a jamais eu, absent d'un serveur trop ancien).
 * Rend null si le serveur ne le dit pas, sinon { inscrits, actifs, endormis: [noms], jamais: [noms], texte }.
 */
export function bilanEnvois(membres, now = Date.now(), jours = 7) {
  const liste = Array.isArray(membres) ? membres : [];
  if (!liste.length || liste.some((m) => m.dernierEnvoi === undefined)) return null;
  const jamais = liste.filter((m) => !m.dernierEnvoi).map((m) => m.cmdr);
  const recent = (m) => m.dernierEnvoi && now - Date.parse(m.dernierEnvoi) <= jours * JOUR_MS;
  const actifs = liste.filter(recent).length;
  const endormis = liste.filter((m) => m.dernierEnvoi && !recent(m)).map((m) => m.cmdr);
  const texte = `${plural(liste.length, 'inscrit', 'inscrits')} · ${actifs} ${actifs > 1 ? 'ont envoyé' : 'a envoyé'} des mérites ces ${jours} derniers jours`
    + `${endormis.length ? ` · ${plural(endormis.length, 'plus ancien', 'plus anciens')}` : ''}${jamais.length ? ` · ${plural(jamais.length, 'n’a jamais rien envoyé', 'n’ont jamais rien envoyé')}` : ''}`;
  return { inscrits: liste.length, actifs, endormis, jamais, texte };
}

/** Résumé de l'état du capteur, avec sa couleur (classe CSS good, warn, bad ou muted). */
export function sensorSummary(s) {
  if (!s) return { tone: 'muted', text: 'Chargement…' };
  if (!s.enabled) return { tone: 'muted', text: "Envoi désactivé : rien ne part vers l'escadron." };
  if (!s.hasToken) return { tone: 'warn', text: "Envoi activé, mais aucun jeton : colle le jeton de membre que l'escadron t'a donné." };
  if (s.paused) return { tone: 'bad', text: s.status?.text || 'Jeton refusé.' };
  if (s.waitingRetry) return { tone: 'warn', text: `${s.status?.text || 'Nouvel essai bientôt.'} ${plural(s.queue, 'gain attend', 'gains attendent')}.` };
  if (!s.liveGalaxy && s.gameVersion) return { tone: 'warn', text: `Version du jeu ${s.gameVersion} : hors galaxie Live, rien ne part (comme avec EDMC).` };
  // Plusieurs commandants dans les journaux, aucun choisi ni confirmé : rien ne part avant le choix du joueur
  if (s.needsChoice) {
    const names = (s.commanders ?? []).map((name) => `CMDR ${name}`).join(', ');
    return { tone: 'warn', text: `Plusieurs commandants dans tes journaux (${names}) : choisis celui de ton jeton. Rien ne part avant ton choix, et les gains des autres ne partent jamais.` };
  }
  // Gains que ce jeton ne peut pas créditer (403, ou autre commandant) : ils attendent le bon jeton
  const blocked = s.blocked ?? 0;
  const who = (s.blockedCmdrs ?? []).map((name) => `CMDR ${name}`).join(', ') || 'un autre commandant';
  const waiting = blocked > 0 ? `${plural(blocked, 'gain attend', 'gains attendent')} le jeton de ${who}.` : '';
  if (s.queue > blocked) return { tone: 'warn', text: `Envoi en cours : ${plural(s.queue - blocked, 'gain', 'gains')} en file d'attente.${waiting ? ` ${waiting}` : ''}` };
  if (blocked > 0) {
    return { tone: 'bad', text: `Ce jeton n'est pas celui de ${who} : ${plural(blocked, 'gain attend', 'gains attendent')} dans la file. Colle le bon jeton, ou fais corriger le nom enregistré par l'escadron puis « Réessayer maintenant ».` };
  }
  if (s.lastOkAt) return { tone: 'good', text: `Tout est envoyé. Dernier gain confirmé : ${dateTime(s.lastConfirmedAt)}.` };
  return { tone: 'good', text: 'Envoi activé : tes prochains gains de mérites partiront tout seuls.' };
}

/**
 * Commandant dont les gains partent, et pourquoi : accepté par le serveur, choisi par le joueur, ou seul commandant
 * des journaux. null : aucun (choix à faire, ou aucun commandant vu).
 */
export function tokenCmdrText(s) {
  if (s?.tokenCmdr) return `CMDR ${s.tokenCmdr} (accepté par le serveur)`;
  if (s?.chosenCmdr) return `CMDR ${s.chosenCmdr} (ton choix)`;
  if (s?.sendingFor) return `CMDR ${s.sendingFor} (seul commandant de tes journaux)`;
  if (s?.needsChoice) return 'à choisir : rien ne part avant ton choix';
  return null;
}

/** « depuis le début de la semaine Powerplay (5 nov. 08:00) » */
export function sinceText(s) {
  if (!s?.since) return '';
  return `depuis le ${dateTime(s.since)}`;
}

/** Les trois périodes proposées pour « Mon apport ». */
export const PRESETS = [
  ['last', 'Dernière séance'],
  ['week', 'Semaine Powerplay'],
  ['all', "Depuis l'arrivée"],
];

/**
 * « Semaine Powerplay » part du premier relevé après le passage de semaine. Si une séance était en cours au passage,
 * ce qu'elle a apporté ensuite est déjà dans ce relevé : on le dit, avec les mérites que le journal en connaît.
 */
export function weekNote(data) {
  const w = data?.week;
  if (!w?.start || data.from !== data.presets?.week) return '';
  const base = `Semaine commencée le ${dateTime(w.start)}, comptée depuis le premier relevé qui suit.`;
  if (!w.spill) return base;
  return `${base} Une séance était en cours au passage : ses ${int(w.spill.merits)} mérites gagnés après sont dans ce relevé de départ et manquent ici (les autres classements aussi, sans chiffre).`;
}
