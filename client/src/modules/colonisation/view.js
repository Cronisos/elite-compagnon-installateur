// Mise en forme du module Colonisation, commune à la page et aux fenêtres de l'overlay (sans React : testée seule).

import { ago, duration, int, pct } from '../../core/format.js';

export const KIND_LABELS = { ship: 'Vaisseau de colonisation', orbital: 'Chantier orbital', planetary: 'Chantier planétaire' };
export const REASONS = { docked: 'À quai', pinned: 'Épinglé', escadron: 'Projet de l’escadron', recent: 'Dernier en cours' };

/** Lecture du dépôt venue d'un membre de l'escadron, en clair : « relevé par CMDR il y a 5 min ». */
export function releveText(releve) {
  if (!releve) return null;
  return `relevé par ${releve.by || 'un membre de l’escadron'} ${ago(releve.at)}`;
}

/**
 * Nom affiché d'un chantier d'après son nom de station brut (relevé de l'escadron) : même lecture que le serveur
 * (server/src/modules/colonisation/events.js, parseStationName).
 */
export function stationLabel(station) {
  const s = typeof station === 'string' ? station.trim() : '';
  let m = /^\$EXT_(?:PANEL|PNL)_ColonisationShip(?::#index=(\d+))?;\s*(.*)$/i.exec(s);
  if (m) {
    const name = m[2].trim() || (m[1] ? `n° ${m[1]}` : '');
    return name ? `${KIND_LABELS.ship} · ${name}` : KIND_LABELS.ship;
  }
  m = /^(Orbital|Planetary) Construction Site:\s*(.*)$/i.exec(s);
  if (m) {
    const kind = KIND_LABELS[m[1].toLowerCase() === 'orbital' ? 'orbital' : 'planetary'];
    return m[2].trim() ? `${kind} · ${m[2].trim()}` : kind;
  }
  return s || null;
}
export const LOOP_SOURCES = { saisie: 'saisie', mesurée: 'mesurée sur tes livraisons' };
export const VERDICTS = {
  ok: { label: 'dans les temps', tone: 'good' },
  serré: { label: 'serré', tone: 'warn' },
  'en retard': { label: 'en retard', tone: 'bad' },
  dépassée: { label: 'échéance dépassée', tone: 'bad' },
  terminé: { label: 'terminé', tone: 'good' },
};

export const tonnes = (n) => (n == null ? '—' : `${int(n)} t`);

/** Statut d'un chantier : { label, tone } pour une pastille. */
export function statusOf(site) {
  if (site.complete) return { label: 'Terminé', tone: 'good' };
  if (site.failed) return { label: 'Échoué', tone: 'bad' };
  if (!site.known && !site.plan?.known && !site.resources?.length) return { label: 'Besoins inconnus', tone: 'muted' };
  if (site.provisional) return { label: 'En cours · estimé', tone: 'warn' };
  return { label: 'En cours', tone: 'info' };
}

/** Marchandises à acheter, de la plus grosse quantité à la plus petite. */
export function toBuyList(items = [], n = Infinity) {
  return items.filter((i) => i.toBuy > 0).sort((a, b) => b.toBuy - a.toBuy).slice(0, n);
}

/** Échéance saisie, en clair : « dans 6,5 j · serré ». */
export function deadlineText(d) {
  if (!d) return null;
  const v = d.verdict ? VERDICTS[d.verdict]?.label || d.verdict : 'durée de boucle inconnue';
  if (d.verdict === 'dépassée' || d.verdict === 'terminé') return v;
  return `dans ${String(d.daysLeft).replace('.', ',')} j · ${v}`;
}

/** Temps de jeu restant, en clair : « 10 h 00 de jeu, 3,3 soirées de 3 h ». */
export function etaText(eta) {
  if (!eta) return null;
  const evenings = eta.evenings != null ? `, ${String(eta.evenings).replace('.', ',')} soirée${eta.evenings > 1 ? 's' : ''} de ${eta.hoursPerEvening} h` : '';
  return `${duration(eta.playMinutes * 60)} de jeu${evenings}`;
}

/**
 * Cases du HUD pour le chantier actif ({ reason, site } de l'API), ou des cases vides sans chantier.
 * Avancement, reste, à acheter (reste − soute), trajets avec la soute du vaisseau actuel.
 */
export function hudCells(active) {
  const site = active?.site;
  const plan = site?.plan;
  if (!site) {
    return [
      { label: 'Avancement', value: '—', color: '#ffd24a', sub: '' },
      { label: 'Reste', value: '—', color: '#6fd3ff', sub: '' },
      { label: 'À acheter', value: '—', color: 'var(--accent)', sub: '' },
      { label: 'Trajets', value: '—', color: '#5fd38d', sub: '' },
    ];
  }
  return [
    { label: 'Avancement', value: pct(site.progress), color: site.complete ? '#5fd38d' : '#ffd24a', sub: site.complete ? 'terminé' : site.provisional ? 'estimé (tes livraisons)' : site.releve ? `relevé par ${site.releve.by || 'l’escadron'}` : site.updatedAt ? 'lu au dépôt' : 'pas encore lu' },
    { label: 'Reste', value: plan.known ? tonnes(plan.totals.remaining) : '?', color: '#6fd3ff', sub: plan.known ? `sur ${int(plan.totals.required)} t` : 'ouvre le contact du chantier' },
    { label: 'À acheter', value: plan.known ? tonnes(plan.totals.toBuy) : '?', color: 'var(--accent)', sub: !plan.known ? 'besoins inconnus' : plan.totals.onCarrier ? `${int(plan.totals.inHold || 0)} t soute · ${int(plan.totals.onCarrier)} t porteur` : plan.totals.inHold ? `${int(plan.totals.inHold)} t en soute` : 'rien en soute' },
    { label: 'Trajets', value: plan.trips == null ? '?' : int(plan.trips), color: '#5fd38d', sub: plan.capacity ? `soute ${int(plan.capacity)} t` : 'soute inconnue' },
  ];
}

/** Ligne du bas du HUD : les marchandises à acheter en premier (le HUD met déjà le nom du chantier devant). */
export function hudLine(active, n = 3) {
  const site = active?.site;
  if (!site) return 'aucun chantier suivi : amarre-toi à un dépôt de construction';
  if (site.complete) return 'chantier terminé';
  if (!site.plan.known) return 'besoins pas encore lus';
  const list = toBuyList(site.plan.items, n);
  if (!list.length) return site.plan.totals.remaining > 0 ? 'tout est en soute : va livrer' : 'plus rien à livrer';
  return list.map((i) => `${i.name} ${int(i.toBuy)} t`).join(' · ');
}

/** ISO → valeur d'un champ datetime-local (heure de ce PC). */
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
