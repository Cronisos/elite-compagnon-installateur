// Liste de courses d'un chantier et estimation de fin : calculs purs, sans état ni accès au jeu.
//
//   reste       = demandé − livré (par tous les CMDR, d'après la dernière lecture du dépôt)
//   à acheter   = reste − ce qui est déjà en soute (Cargo.json)
//   trajets     = reste ÷ capacité de soute du vaisseau actuel (Loadout CargoCapacity), arrondi au-dessus
//   fin estimée = trajets × durée d'une boucle (saisie, sinon mesurée sur tes livraisons)
//
// L'échéance est toujours saisie par le joueur : aucun événement du journal ne la donne, et le module n'invente
// pas de délai (les « 4 semaines » d'un chantier ne sont pas codées).

import { symbolOf } from './events.js';

// Deux livraisons à moins de 10 min l'une de l'autre, sans amarrage connu : même passage au dépôt.
export const VISIT_GAP_MS = 10 * 60_000;
// Plus de 3 h entre deux passages : une pause (ou une autre soirée), pas une boucle.
export const BREAK_MS = 3 * 3600_000;
// Il faut au moins 2 boucles mesurées pour donner une durée.
export const MIN_LOOPS = 2;

const finite = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * Tonnes en soute par symbole (Cargo.json, état du jeu) : Map. Plusieurs lignes s'additionnent, sauf la cargaison
 * d'une mission (ligne avec MissionID) : elle est réservée à la mission, pas au chantier. Les marchandises volées
 * comptent (livrables ou non au dépôt : à confirmer en jeu).
 */
export function holdBySymbol(cargo = []) {
  const hold = new Map();
  for (const c of Array.isArray(cargo) ? cargo : []) {
    if (c?.missionId != null) continue;
    const symbol = symbolOf(c?.name);
    const count = finite(c?.count) && c.count > 0 ? Math.floor(c.count) : 0;
    if (symbol && count) hold.set(symbol, (hold.get(symbol) || 0) + count);
  }
  return hold;
}

/**
 * Lignes de la liste de courses : celles qui restent à livrer d'abord (le plus gros reste en tête), puis les
 * marchandises complètes. inHold : ce qui est en soute, utile ou non ; toBuy : reste − soute, jamais négatif.
 */
export function shoppingList(resources = [], cargo = []) {
  const hold = holdBySymbol(cargo);
  return resources.map((r) => {
    const remaining = finite(r.remaining) ? r.remaining : finite(r.required) && finite(r.provided) ? Math.max(0, r.required - r.provided) : null;
    const inHold = hold.get(r.symbol) || 0;
    return {
      symbol: r.symbol,
      name: r.name,
      required: r.required ?? null,
      provided: r.provided ?? null,
      remaining,
      inHold,
      toBuy: remaining == null ? null : Math.max(0, remaining - inHold),
      done: remaining === 0,
    };
  }).sort((a, b) => (a.done - b.done) || (b.remaining ?? 0) - (a.remaining ?? 0) || String(a.name).localeCompare(String(b.name), 'fr'));
}

/** Trajets pour livrer `tonnes` avec une soute de `capacity` t : arrondi au-dessus ; inconnu sans soute. */
export function tripsFor(tonnes, capacity) {
  if (!finite(tonnes)) return null;
  if (tonnes <= 0) return 0;
  if (!finite(capacity) || capacity <= 0) return null;
  return Math.ceil(tonnes / capacity);
}

/**
 * Passages au dépôt où tu as livré : [{ at, total }], du plus ancien au plus récent. Les livraisons d'un même
 * amarrage (visit) comptent pour un passage ; sans amarrage connu, celles à moins de 10 min d'écart aussi.
 */
export function deliveryVisits(contributions = []) {
  const visits = [];
  const sorted = [...contributions].filter((c) => Number.isFinite(Date.parse(c.at))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const c of sorted) {
    const t = Date.parse(c.at);
    const last = visits[visits.length - 1];
    const same = last && (c.visit ? c.visit === last.visit : t - last.lastT < VISIT_GAP_MS);
    if (same) {
      last.total += c.total || 0;
      last.lastT = t;
    } else {
      visits.push({ at: c.at, t, lastT: t, visit: c.visit || null, total: c.total || 0 });
    }
  }
  return visits.map(({ at, total }) => ({ at, total }));
}

/**
 * Durée d'une boucle mesurée sur tes livraisons : médiane des écarts entre deux passages successifs, pauses de
 * plus de 3 h exclues. { minutes, loops } ou null avec moins de 2 boucles mesurées.
 */
export function measureLoop(contributions = []) {
  const visits = deliveryVisits(contributions);
  const gaps = [];
  for (let i = 1; i < visits.length; i++) {
    const gap = Date.parse(visits[i].at) - Date.parse(visits[i - 1].at);
    if (gap > 0 && gap <= BREAK_MS) gaps.push(gap);
  }
  if (gaps.length < MIN_LOOPS) return null;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
  return { minutes: Math.round((median / 60_000) * 10) / 10, loops: gaps.length };
}

/**
 * Échéance saisie comparée à la fin estimée.
 * verdict : 'terminé' | 'dépassée' | 'en retard' (même sans t'arrêter de jouer) | 'serré' (plus de soirées que de
 * jours) | 'ok' | null (durée de boucle inconnue).
 */
export function deadlineVerdict({ deadline, complete, playMinutes, evenings, now }) {
  const end = Date.parse(deadline);
  if (!Number.isFinite(end)) return null;
  const daysLeft = (end - now) / 86_400_000;
  const base = { at: deadline, source: 'saisie', daysLeft: Math.round(daysLeft * 10) / 10 };
  if (complete) return { ...base, verdict: 'terminé' };
  if (end <= now) return { ...base, verdict: 'dépassée' };
  if (!finite(playMinutes)) return { ...base, verdict: null };
  const marginMinutes = Math.round((end - now) / 60_000 - playMinutes);
  if (marginMinutes < 0) return { ...base, verdict: 'en retard', marginMinutes };
  if (finite(evenings) && evenings > daysLeft) return { ...base, verdict: 'serré', marginMinutes };
  return { ...base, verdict: 'ok', marginMinutes };
}

/**
 * Plan complet d'un chantier.
 * @param site      chantier (resources, complete, contributions, user)
 * @param cargo     soute actuelle [{ name, label, count }]
 * @param capacity  capacité de soute du vaisseau actuel (t), ou null
 * @param hoursPerEvening heures de jeu par soirée (Paramètres), pour compter les soirées
 */
export function planSite(site, { cargo = [], capacity = null, hoursPerEvening = null, now = Date.now() } = {}) {
  // Chantier terminé : plus rien à livrer ni à acheter, même si la dernière lecture du dépôt est antérieure à la
  // fin (fin déduite de l'amarrage) ; demandé et livré restent ceux de cette lecture
  const listed = shoppingList(site.resources || [], cargo);
  const items = site.complete ? listed.map((i) => ({ ...i, remaining: 0, toBuy: 0, done: true })) : listed;
  const known = items.length > 0;
  const total = (k) => (known ? items.reduce((a, i) => a + (finite(i[k]) ? i[k] : 0), 0) : null);
  const remaining = site.complete ? 0 : total('remaining');
  const totals = {
    required: total('required'),
    provided: total('provided'),
    remaining,
    // En soute, seulement ce qui sert au chantier (pas plus que le reste)
    inHold: known ? items.reduce((a, i) => a + Math.min(i.inHold, i.remaining ?? 0), 0) : null,
    toBuy: site.complete ? 0 : total('toBuy'),
  };
  const cap = finite(capacity) && capacity > 0 ? capacity : null;
  const trips = site.complete ? 0 : tripsFor(remaining, cap);
  const tripsToBuy = site.complete ? 0 : tripsFor(totals.toBuy, cap);

  const measured = measureLoop(site.contributions || []);
  const typed = finite(site.user?.loopMinutes) && site.user.loopMinutes > 0 ? site.user.loopMinutes : null;
  const loop = typed != null
    ? { minutes: typed, source: 'saisie', measured }
    : measured ? { minutes: measured.minutes, source: 'mesurée', measured } : { minutes: null, source: null, measured: null };

  const playMinutes = trips != null && loop.minutes != null ? Math.round(trips * loop.minutes) : null;
  const evenings = playMinutes != null && finite(hoursPerEvening) && hoursPerEvening > 0 ? Math.round((playMinutes / 60 / hoursPerEvening) * 10) / 10 : null;
  // Rien à livrer (terminé, ou tout livré) : pas de fin estimée, la page donne la date de fin s'il y en a une
  const eta = playMinutes == null || trips === 0 ? null : {
    playMinutes,
    evenings,
    hoursPerEvening: evenings == null ? null : hoursPerEvening,
    // En jouant sans t'arrêter à partir de maintenant
    finishAt: new Date(now + playMinutes * 60_000).toISOString(),
  };
  return {
    known,
    items,
    totals,
    capacity: cap,
    trips,
    tripsToBuy,
    loop,
    eta,
    deadline: site.user?.deadline ? deadlineVerdict({ deadline: site.user.deadline, complete: site.complete, playMinutes, evenings, now }) : null,
  };
}
