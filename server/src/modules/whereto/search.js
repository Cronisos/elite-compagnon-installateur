// Recherche « Où agir » : les systèmes valides pour une tâche Powerplay, à portée d'un système de référence.
// Les données viennent de Spansh (relevés des joueurs, d'âge variable) ; les passages du joueur, lus dans le journal,
// les complètent (systèmes d'appui) et les confirment ou les démentent quand ils sont plus récents.

import { ACQUISITION_POINTS, MAX_REACH_LY, bestAnchor, checkReading, dist, hasPos, matchingStations, needsStation, weekStart } from './rules.js';

export const RESULT_LIMIT = 150;

const ANCHOR_STATES = ['Fortified', 'Stronghold'];
const time = (iso) => (iso ? Date.parse(iso) || 0 : 0);

/**
 * Systèmes d'appui de la puissance : Spansh, complété et corrigé par les passages plus récents du journal.
 * Un appui vu seulement en jeu (absent de la réponse Spansh) ne compte que si le passage date de la semaine
 * Powerplay en cours : les états changent au passage de semaine, et l'absence chez Spansh peut venir d'un
 * déclassement que Spansh connaît. Un passage plus récent que Spansh qui dit « plus un appui » le retire, quel que
 * soit son âge.
 */
export function mergeAnchors(spanshAnchors, readings, power, now = Date.now()) {
  const tick = weekStart(now);
  const anchors = new Map();
  for (const a of spanshAnchors) anchors.set(a.name, { name: a.name, state: a.state, x: a.x, y: a.y, z: a.z, at: a.updatedAt, source: 'spansh' });
  for (const r of readings.values()) {
    const known = anchors.get(r.name);
    if (known && time(known.at) >= time(r.at)) continue; // Spansh plus récent : on le garde
    const isAnchor = r.controllingPower === power && ANCHOR_STATES.includes(r.state) && hasPos(r);
    if (isAnchor && (known || time(r.at) >= tick)) anchors.set(r.name, { name: r.name, state: r.state, x: r.x, y: r.y, z: r.z, at: r.at, source: 'journal' });
    else if (known && !isAnchor) anchors.delete(r.name); // ton passage plus récent dit qu'il ne l'est plus
  }
  return [...anchors.values()];
}

function sorter(sort, relation, power) {
  const mine = (s) => s.conflict.find((c) => c.power === power)?.progress ?? 0;
  if (sort === 'fresh') return (a, b) => time(b.updatedAt) - time(a.updatedAt) || a.distance - b.distance;
  if (sort === 'progress') {
    if (relation === 'acquisition') return (a, b) => mine(b) - mine(a) || a.distance - b.distance;
    // Tenu : le plus menacé d'abord (sape de la semaine moins renforcement)
    return (a, b) => ((b.undermining || 0) - (b.reinforcement || 0)) - ((a.undermining || 0) - (a.reinforcement || 0)) || a.distance - b.distance;
  }
  return (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity);
}

/**
 * Cherche les systèmes valides.
 * @param {object} p
 * @param {import('./spansh.js').SpanshClient} p.spansh
 * @param {object} p.task      activité ou tâche nettoyée (rules.js)
 * @param {string|null} p.power puissance du joueur
 * @param {string} p.reference système de référence (nom public)
 * @param {number} p.radius    rayon de recherche (al)
 * @param {Map} p.readings     système → dernier relevé du journal
 */
export async function findSystems({ spansh, task, power, reference, radius, readings = new Map(), sort = 'distance', now = Date.now() }) {
  const t0 = Date.now();
  const before = { ...spansh.stats };
  const tick = weekStart(now);
  const queries = [];
  if (task.relation === 'acquisition') {
    queries.push(spansh.search(reference, radius, { power_state: ['Unoccupied'] }));
    queries.push(spansh.search(reference, radius + MAX_REACH_LY, { controlling_power: [power], power_state: ANCHOR_STATES }));
  } else if (task.relation === 'own') {
    queries.push(spansh.search(reference, radius, { controlling_power: [power], power_state: task.states }));
  } else if (task.relation === 'enemy') {
    queries.push(spansh.search(reference, radius, { power_state: task.states, ...(task.enemy ? { controlling_power: [task.enemy] } : {}) }));
  } else {
    queries.push(spansh.search(reference, radius, { power_state: task.states }));
  }
  const [main, anchorsRes] = await Promise.all(queries);
  let anchors = anchorsRes ? mergeAnchors(anchorsRes.systems, readings, power, now) : [];
  // Seuls les appuis à moins de rayon + portée de la référence peuvent servir (les passages du journal couvrent
  // toute la galaxie) : les autres ne comptent ni dans le calcul ni dans le pied de tableau.
  const refPos = [main.reference, anchorsRes?.reference].find(hasPos) || null;
  if (refPos) anchors = anchors.filter((a) => dist(a, refPos) <= radius + MAX_REACH_LY + 1e-9);
  const used = new Set(); // appuis qui servent à au moins un résultat

  const results = [];
  for (const s of main.systems) {
    if (task.relation === 'enemy' && (!s.controllingPower || s.controllingPower === power)) continue;
    if (!task.states.includes(s.state)) continue;

    let reach = null;
    if (task.relation === 'acquisition') {
      const anchor = bestAnchor(s, anchors);
      if (anchor) used.add(anchor.name);
      const listed = s.powers.includes(power) || s.conflict.some((c) => c.power === power);
      if (!anchor && !listed) continue;
      reach = { anchor, listed };
    }

    const stations = matchingStations(s.stations, task);
    if (needsStation(task) && !stations.length) continue;
    if (task.conflictZone && !s.warZones) continue;

    const reading = readings.get(s.name) || null;
    const check = reading ? checkReading(reading, task, power) : null;
    const newer = reading ? time(reading.at) > time(s.updatedAt) : false;
    const mine = s.conflict.find((c) => c.power === power) || null;
    results.push({
      name: s.name,
      id64: s.id64,
      distance: s.distance,
      state: s.state,
      controllingPower: s.controllingPower,
      powers: s.powers,
      controlProgress: s.controlProgress,
      reinforcement: s.reinforcement,
      undermining: s.undermining,
      progress: mine ? mine.progress : null,
      points: mine ? Math.round(mine.progress * ACQUISITION_POINTS) : null,
      rivals: s.conflict.filter((c) => c.power !== power).sort((a, b) => b.progress - a.progress),
      warZones: s.warZones,
      reach,
      stations: stations.map((st) => ({ name: st.name, type: st.type, arrival: st.arrival, largePad: st.largePad, powerContact: st.powerContact, marketId: st.marketId })),
      updatedAt: s.updatedAt,
      thisWeek: time(s.updatedAt) >= tick, // relevé fait depuis le dernier passage de semaine
      seen: reading
        ? {
          at: reading.at, state: reading.state, controllingPower: reading.controllingPower, valid: check.valid, reasons: check.reasons, newer,
          progress: reading.conflict?.find((c) => c.power === power)?.progress ?? null,
          controlProgress: reading.controlProgress ?? null,
        }
        : null,
    });
  }
  // Démenti par un passage plus récent que la donnée Spansh : en fin de liste
  const refuted = (r) => (r.seen?.newer && r.seen.valid === false ? 1 : 0);
  const cmp = sorter(sort, task.relation, power);
  results.sort((a, b) => refuted(a) - refuted(b) || cmp(a, b));
  // Sans position de référence (réponse Spansh incomplète), seuls les appuis qui servent sont comptés
  const counted = refPos ? anchors : anchors.filter((a) => used.has(a.name));

  return {
    reference: main.reference?.name || reference,
    radius,
    power,
    task,
    weekStart: new Date(tick).toISOString(),
    results: results.slice(0, RESULT_LIMIT),
    meta: {
      found: results.length,
      shown: Math.min(results.length, RESULT_LIMIT),
      scanned: main.systems.length,
      truncated: main.truncated || !!anchorsRes?.truncated,
      anchors: counted.length,
      journalAnchors: counted.filter((a) => a.source === 'journal').length,
      requests: spansh.stats.requests - before.requests,
      cached: [main, anchorsRes].some((r) => r?.cached),
      fetchedAt: main.fetchedAt,
      ms: Date.now() - t0,
    },
  };
}
