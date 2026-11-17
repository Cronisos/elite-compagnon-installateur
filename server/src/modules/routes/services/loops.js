// Découpage de la chronologie en boucles pour une route donnée, et bilan de chaque boucle.
//
// Règles (validées sur les vrais journaux) :
// - Une boucle va d'un achat de la marchandise de départ jusqu'à l'achat suivant
//   de la même marchandise, dans le système de départ.
// - Gain net = ventes − achats − carburant − réparations − salaires − munitions − rachat.
// - Durée active : temps réellement joué. Un blanc de plus de 4 min sans aucune action
//   du joueur (saut, supercroisière, amarrage, achat…), ou le retour au menu, est une
//   pause : il n'est pas compté.
// - Une boucle dont la durée active dépasse 2× la médiane (autre activité au milieu)
//   est exclue des moyennes.

import { dockSessions, aggregate } from './timeline.js';

export const PAUSE_FACTOR = 2;
export const PAUSE_GAP_SEC = 240;

/** Temps joué entre deux instants : les blancs de plus de 4 min et le menu ne comptent pas. */
export function activeBetween(slice, a, b) {
  const r = activeUntilLast(slice, a, b);
  const g = (b - r.lastT) / 1000;
  return Math.round(r.active + (!r.menu && g <= PAUSE_GAP_SEC ? g : 0));
}

/** Temps joué de a jusqu'à la dernière action avant b (pour la boucle en cours). */
export function activeUntilLast(slice, a, b = Infinity) {
  let active = 0;
  let prev = a;
  let menu = false;
  for (const e of slice) {
    if (e.t <= a) continue;
    if (e.t > b) break;
    const g = (e.t - prev) / 1000;
    if (!menu && g <= PAUSE_GAP_SEC) active += g;
    prev = e.t;
    menu = !!e.menu;
  }
  return { active, lastT: prev, menu };
}

/**
 * @param {object[]} timeline chronologie (buildTimeline)
 * @param {object} route { startSystem, startStation, startCommodity, stops: [{ system, station }] }
 * @param {object} [opts] { from: timestamp ms } boucles commençant à partir de cette date
 * @returns {{ loops: object[], current: object|null }}
 */
export function extractLoops(timeline, route, opts = {}) {
  const from = opts.from ?? -Infinity;
  const C = route.startCommodity;

  // Points de départ : à chaque passage à quai dans le système de départ où l'on achète.
  // - t : achat de la marchandise de départ (repère de la boucle) ; si elle n'est plus achetée
  //   (changement de marchandise principale), premier achat du passage.
  // - idx : premier achat du passage, pour que tous les achats faits au départ (appoints
  //   achetés avant la marchandise principale) comptent dans la boucle qui les transporte.
  const anchors = [];
  for (const s of dockSessions(timeline)) {
    if (s.system !== route.startSystem) continue;
    let first = null;
    let main = null;
    for (let i = s.startIdx; i <= s.endIdx; i++) {
      const e = timeline[i];
      if (e.kind !== 'buy' || e.commodity === 'drones') continue; // les limpets ne lancent pas une boucle
      if (first == null) first = i;
      if (e.commodity === C) {
        main = i;
        break;
      }
    }
    if (first != null) anchors.push({ idx: first, t: timeline[main ?? first].t, station: s.station });
  }

  const stopSystems = [...new Set(route.stops.map((s) => s.system))];
  const loops = [];
  let k = 0;
  while (k < anchors.length - 1) {
    const a = anchors[k];
    if (a.t < from) {
      k++;
      continue;
    }
    // Une boucle doit passer par toutes les escales (sauf si le vaisseau a été détruit) : un
    // passage au départ sans être allé aux escales (changement de station dans le même système…)
    // prolonge la boucle au lieu d'en perdre les achats.
    let j = k + 1;
    for (; j < anchors.length; j++) {
      const slice = timeline.slice(a.idx, anchors[j].idx);
      const visited = new Set(slice.filter((e) => e.kind === 'dock').map((e) => e.system));
      if (slice.some((e) => e.kind === 'died') || stopSystems.every((sys) => visited.has(sys))) break;
    }
    if (j >= anchors.length) break; // boucle encore en cours
    loops.push(summarizeLoop(timeline.slice(a.idx, anchors[j].idx), route, a.t, anchors[j].t));
    k = j;
  }
  markPauses(loops);

  // Boucle en cours : depuis le dernier départ
  let current = null;
  const last = anchors[k];
  if (last && last.t >= from) {
    const slice = timeline.slice(last.idx);
    current = { ...summarizeLoop(slice, route, last.t, null), progress: loopProgress(slice, route) };
  }
  return { loops, current };
}

/** Bilan d'une boucle (ou de la boucle en cours si endT est null). */
export function summarizeLoop(slice, route, startT, endT) {
  const sum = (kind, field = 'cost') =>
    slice.filter((e) => e.kind === kind).reduce((acc, e) => acc + (e[field] || 0), 0);

  const buys = slice.filter((e) => e.kind === 'buy');
  const sells = slice.filter((e) => e.kind === 'sell');
  const sales = sells.reduce((acc, e) => acc + e.total, 0);
  const purchases = buys.reduce((acc, e) => acc + e.total, 0);
  const fuel = sum('fuel');
  const repairs = sum('repair');
  const ammo = sum('ammo');
  const wages = sum('wage');
  const rebuy = sum('rebuy');
  const merits = sum('merits', 'merits');
  const destroyed = slice.some((e) => e.kind === 'died');

  // Cargaison de départ : tonnage de la marchandise de départ chargé au premier passage
  const firstUndock = slice.findIndex((e) => e.kind === 'undock' || e.kind === 'jump');
  const startBuys = (firstUndock < 0 ? slice : slice.slice(0, firstUndock)).filter((e) => e.kind === 'buy');
  const cargo = startBuys.filter((e) => e.commodity === route.startCommodity).reduce((a, e) => a + e.count, 0);

  // Étiquettes
  const tags = [];
  if (destroyed) tags.push({ type: 'destroyed', label: 'Vaisseau détruit' });
  if (slice.some((e) => e.kind === 'shields' && !e.up)) tags.push({ type: 'shields', label: 'Sans bouclier' });
  const stationsByStopSystem = new Map(route.stops.map((s) => [s.system, s.station]));
  const changed = new Set();
  for (const e of slice) {
    if (e.kind !== 'dock' || e.fromLocation) continue;
    const expected = e.system === route.startSystem ? route.startStation : stationsByStopSystem.get(e.system);
    if (expected && e.station && e.station !== expected) changed.add(e.station);
  }
  for (const st of changed) tags.push({ type: 'station', label: `Station : ${st}` });

  const durationSec = endT != null ? Math.round((endT - startT) / 1000) : null;
  const activeSec = endT != null ? activeBetween(slice, startT, endT) : null;
  if (durationSec != null && durationSec - activeSec >= 60) {
    tags.push({ type: 'pause', label: `Pause de ${Math.round((durationSec - activeSec) / 60)} min (non comptée)` });
  }

  return {
    startAt: new Date(startT).toISOString(),
    endAt: endT != null ? new Date(endT).toISOString() : null,
    durationSec,
    activeSec,
    netGain: sales - purchases - fuel - repairs - ammo - wages - rebuy,
    sales,
    purchases,
    fuel,
    repairs,
    wages,
    ammo,
    rebuy,
    merits,
    cargo,
    cargoDetail: aggregate(startBuys).map(({ commodity, name, count }) => ({ commodity, name, count })),
    legTimes: endT != null ? legTimes(slice, route, startT, endT) : [],
    tags,
    destroyed,
    pause: false,
    trades: [...buys, ...sells]
      .sort((x, y) => x.t - y.t)
      .map((e) => ({
        at: new Date(e.t).toISOString(),
        station: e.station || '?',
        system: e.system || '?',
        marketId: e.marketId ?? 0,
        commodity: e.commodity,
        name: e.name,
        count: e.count,
        price: e.price,
        total: e.total,
        side: e.kind,
      })),
  };
}

/**
 * Durée de chaque étape : du départ au premier amarrage à l'escale 1, puis à
 * l'escale 2…, et enfin jusqu'au rachat de la marchandise de départ.
 */
function legTimes(slice, route, startT, endT) {
  const checkpoints = [startT];
  let from = 0;
  for (const stop of route.stops) {
    const i = slice.findIndex((e, idx) => idx >= from && e.kind === 'dock' && e.system === stop.system);
    if (i < 0) return route.stops.map(() => null).concat(null);
    checkpoints.push(slice[i].t);
    from = i + 1;
  }
  checkpoints.push(endT);
  const out = [];
  for (let k = 0; k < checkpoints.length - 1; k++) out.push(activeBetween(slice, checkpoints[k], checkpoints[k + 1]));
  return out;
}

/** Où en est la boucle en cours : nombre d'escales atteintes, début de l'étape actuelle. */
function loopProgress(slice, route) {
  let reached = 0;
  let legStart = slice[0]?.t ?? null;
  let from = 0;
  for (const stop of route.stops) {
    const i = slice.findIndex((e, idx) => idx >= from && e.kind === 'dock' && e.system === stop.system);
    if (i < 0) break;
    reached++;
    legStart = slice[i].t;
    from = i + 1;
  }
  const lastDock = [...slice].reverse().find((e) => e.kind === 'dock' || e.kind === 'undock');
  // Temps joué jusqu'à la dernière action : le navigateur ajoute le temps écoulé depuis,
  // tant qu'il reste sous le seuil de pause
  const startT = slice[0]?.t ?? null;
  const loopActive = startT != null ? activeUntilLast(slice, startT) : null;
  const legActive = legStart != null ? activeUntilLast(slice, legStart) : null;
  return {
    activeSec: loopActive ? Math.round(loopActive.active) : null,
    legActiveSec: legActive ? Math.round(legActive.active) : null,
    lastActivityAt: loopActive ? new Date(loopActive.lastT).toISOString() : null,
    inMenu: !!loopActive?.menu,
    stopsReached: reached,
    legIndex: reached, // étape en cours (0 = vers la première escale)
    legStartAt: legStart != null ? new Date(legStart).toISOString() : null,
    docked: lastDock?.kind === 'dock',
    lastStation: lastDock?.kind === 'dock' ? lastDock.station : null,
    destroyed: slice.some((e) => e.kind === 'died'),
  };
}

export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Durée prise en compte : temps joué si connu, sinon durée brute. */
export const loopSec = (l) => (l.activeSec > 0 ? l.activeSec : l.durationSec);

/** Exclut des moyennes les boucles dont le temps joué dépasse 2× la médiane. */
export function markPauses(loops) {
  const med = median(loops.map(loopSec));
  for (const l of loops) l.pause = med != null && loopSec(l) > PAUSE_FACTOR * med;
  return med;
}
