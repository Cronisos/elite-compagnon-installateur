// Libellés de l'onglet « Mérites par heure » : états du système, périodes, statuts, échantillon.

const MODES = new Map([
  ['reinforcement', 'Renforcement'],
  ['undermining', 'Sape'],
  ['acquisition', 'Prise'],
  ['outside', 'Prise par une autre puissance'],
  ['none', 'Sans puissance'],
  ['unknown', 'État inconnu'],
]);
const STATES = new Map([
  ['Exploited', 'Exploité'],
  ['Fortified', 'Consolidé'],
  ['Stronghold', 'Forteresse'],
  ['Unoccupied', 'Inoccupé'],
  ['HomeSystem', 'Capitale'],
]);
export const STATUS_PILLS = new Map([['mesurée', 'pill-good'], ['publiée', 'pill-info'], ['à vérifier', 'pill-warn']]);
/** Activités propres à cet onglet (en plus de celles de l'Historique) : gains sans travail, donc sans temps. */
export const RATE_ACTIVITIES = new Map([['scan', { label: 'Scan de vaisseaux', color: '#8f96a3' }]]);

/** « Renforcement · Forteresse », « Prise · Inoccupé », « Sans puissance »… */
export function stateLabel(mode, state) {
  const m = MODES.get(mode) ?? mode;
  if (mode === 'reinforcement' || mode === 'undermining' || mode === 'acquisition') return state ? `${m} · ${STATES.get(state) ?? state}` : m;
  return m;
}

/** « 2025-12-02 » → « 2 décembre 2025 » */
export function ruleDate(date) {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(/^1 /, '1er ');
}

export function periodLabel(kind, last) {
  if (kind === 'week') return 'Semaine Powerplay en cours';
  if (kind === 'month') return '30 derniers jours';
  if (kind === 'all') return "Tout l'historique";
  return last ? `Depuis le dernier changement de règles (${ruleDate(last.date)})` : 'Depuis le dernier changement de règles';
}

const plural = (n, one, many) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`;

/** « 12 travaux · 14 gains · dont 3 à 0 mérite » */
export function sampleText(row) {
  const parts = [plural(row.units, 'travail', 'travaux'), plural(row.gains, 'gain', 'gains')];
  if (row.zero) parts.push(`dont ${row.zero.toLocaleString('fr-FR')} à 0 mérite`);
  if (!row.units && row.gains) parts.push('sans temps : aucun travail juste avant');
  return parts.join(' · ');
}
