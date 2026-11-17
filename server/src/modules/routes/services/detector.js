// Détection d'une route commerciale à partir du journal.
//
// 1. On recense toutes les boucles complètes : deux passages dans le même système où la
//    même marchandise principale a été achetée, avec entre les deux au moins une vente
//    ailleurs, sans repasser par le système de départ.
// 2. On les regroupe par itinéraire (systèmes et marchandises principales). Le même
//    aller-retour pris depuis l'une ou l'autre station compte comme un seul itinéraire.
// 3. On garde l'itinéraire le plus répété parmi les boucles récentes : une erreur
//    ponctuelle (mauvaise marchandise achetée une fois) ne peut pas l'emporter.
// 4. Station de départ : celle imposée, sinon celle où la série de boucles a commencé.

import { dockSessions, primaryBuy, aggregate } from './timeline.js';

export const RECENT_CYCLES = 40;

/** Toutes les boucles complètes de la chronologie, dans l'ordre. */
export function listCycles(timeline) {
  const sessions = dockSessions(timeline);
  const candidates = sessions.map((s, idx) => ({ s, idx, p: primaryBuy(s) })).filter((c) => c.p);
  const cycles = [];
  for (let j = 1; j < candidates.length; j++) {
    const end = candidates[j];
    for (let i = j - 1; i >= 0; i--) {
      const start = candidates[i];
      if (start.s.system !== end.s.system || start.p.commodity !== end.p.commodity) continue;
      const between = sessions.slice(start.idx + 1, end.idx);
      const soldElsewhere = between.some((s) => s.system !== start.s.system && s.sells.length);
      // Repasser par le système de départ en cours de route (erreur d'achat, détour) : non représentatif
      const revisits = between.some((s) => s.system === start.s.system && (s.buys.length || s.sells.length));
      if (soldElsewhere && !revisits) {
        const steps = [
          `${start.s.system}|${start.p.commodity}`,
          ...between.filter((s) => s.buys.length || s.sells.length).map((s) => `${s.system}|${primaryBuy(s)?.commodity || '-'}`),
        ];
        cycles.push({ startIdx: start.idx, endIdx: end.idx, t: start.s.t, anchorSystem: start.s.system, key: canonical(steps) });
      }
      break; // seul le passage précédent de même marchandise compte
    }
  }
  return { sessions, cycles };
}

/** Clé d'itinéraire indépendante du point de départ (plus petite rotation). */
function canonical(steps) {
  let best = null;
  for (let r = 0; r < steps.length; r++) {
    const k = [...steps.slice(r), ...steps.slice(0, r)].join(' > ');
    if (best === null || k < best) best = k;
  }
  return best;
}

/**
 * @param {object[]} timeline chronologie (buildTimeline)
 * @param {object} [opts]
 * @param {string} [opts.anchorSystem] système de départ imposé
 * @returns {object|null} structure de la route, ou null si aucune boucle trouvée
 */
export function detectRoute(timeline, opts = {}) {
  const { sessions, cycles } = listCycles(timeline);
  if (!cycles.length) return null;

  // Itinéraire le plus répété parmi les boucles récentes (égalité : le plus récent)
  const recent = cycles.slice(-RECENT_CYCLES);
  const pool = opts.anchorSystem ? recent.filter((c) => c.anchorSystem === opts.anchorSystem) : recent;
  const source = pool.length ? pool : cycles.filter((c) => !opts.anchorSystem || c.anchorSystem === opts.anchorSystem);
  if (!source.length) return null;
  const counts = new Map();
  source.forEach((c, i) => {
    const e = counts.get(c.key) || { n: 0, last: -1 };
    counts.set(c.key, { n: e.n + 1, last: i });
  });
  const best = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last)[0][0];
  const group = recent.filter((c) => c.key === best);

  // Station de départ : imposée, sinon celle où la série a commencé
  const anchor = opts.anchorSystem || group[0].anchorSystem;
  const mine = group.filter((c) => c.anchorSystem === anchor);
  const chosen = (mine.length ? mine : source.filter((c) => c.key === best)).at(-1);
  const structure = buildStructure(timeline, sessions, chosen.startIdx, chosen.endIdx);
  structure.occurrences = group.filter((c) => c.anchorSystem === structure.startSystem).length;
  return structure;
}

/** Construit la description complète de la route entre deux passages de départ. */
function buildStructure(timeline, sessions, startIdx, endIdx) {
  const first = sessions[startIdx];
  const last = sessions[endIdx];
  const startBuy = primaryBuy(first);

  // Escales : passages entre le départ et le retour où il y a eu du commerce
  const trading = sessions.slice(startIdx + 1, endIdx).filter((s) => s.buys.length || s.sells.length);
  const stops = trading.map((s) => ({
      system: s.system,
      station: s.station,
      marketId: s.marketId,
      pad: s.pad,
      buys: aggregate(s.buys),
      sells: aggregate(s.sells),
    }));

  // Étapes (legs) : sauts entre chaque station
  const points = [
    { system: first.system, station: first.station, idx: first.endIdx },
    ...trading.map((s) => ({ system: s.system, station: s.station, idx: s.startIdx, endIdx: s.endIdx })),
    { system: last.system, station: last.station, idx: last.startIdx },
  ];
  const legs = [];
  for (let k = 0; k < points.length - 1; k++) {
    const from = points[k];
    const to = points[k + 1];
    const fromIdx = from.endIdx ?? from.idx;
    const jumps = timeline
      .slice(fromIdx + 1, to.idx)
      .filter((e) => e.kind === 'jump')
      .map((e) => ({ system: e.system, dist: round1(e.dist) }));
    legs.push({
      from: { system: from.system, station: from.station },
      to: { system: to.system, station: to.station },
      jumps,
      distance: round1(jumps.reduce((a, j) => a + j.dist, 0)),
    });
  }

  // Marchandise principale de chaque étape : achetée au début de l'étape
  const legCommodities = legs.map((leg, k) => {
    const src = k === 0 ? first : trading[k - 1];
    const p = src ? primaryBuy(src) : null;
    return p ? { commodity: p.commodity, name: p.name } : null;
  });

  const allJumps = legs.flatMap((l) => l.jumps);
  const stations = [
    { system: first.system, station: first.station, marketId: first.marketId, pad: first.pad ?? last.pad },
    ...stops.map((s) => ({ system: s.system, station: s.station, marketId: s.marketId, pad: s.pad })),
  ];
  const commodities = uniqueBy(
    [...aggregate(first.buys), ...stops.flatMap((s) => [...s.buys, ...s.sells]), ...aggregate(last.sells)]
      .map((c) => ({ commodity: c.commodity, name: c.name })),
    (c) => c.commodity
  );

  // Systèmes de départ possibles : ceux où une marchandise principale est achetée
  const anchors = uniqueBy(
    stations
      .map((st, k) => {
        const p = k === 0 ? startBuy : stops[k - 1].buys[0];
        return p ? { system: st.system, station: st.station, commodity: p.commodity, name: p.name } : null;
      })
      .filter(Boolean),
    (a) => a.system
  );

  return {
    startSystem: first.system,
    startStation: first.station,
    startMarketId: first.marketId,
    startCommodity: startBuy.commodity,
    startCommodityName: startBuy.name,
    start: { buys: aggregate(first.buys) },
    stops,
    arrival: { sells: aggregate(last.sells) },
    legs,
    legCommodities,
    jumpsPerLoop: allJumps.length,
    longestJump: allJumps.reduce((m, j) => Math.max(m, j.dist), 0),
    stations,
    systems: uniqueBy(stations.map((s) => s.system), (s) => s),
    commodities,
    anchors,
    loopStart: new Date(primaryBuyTime(first, startBuy.commodity)).toISOString(),
    loopEnd: new Date(primaryBuyTime(last, startBuy.commodity)).toISOString(),
    suggestedName: [first.station, ...uniqueBy(stops.map((s) => s.station), (x) => x)].join(' ⇄ '),
  };
}

function primaryBuyTime(session, commodity) {
  return session.buys.find((b) => b.commodity === commodity)?.t ?? session.t;
}

function uniqueBy(list, keyFn) {
  const seen = new Set();
  return list.filter((x) => {
    const k = keyFn(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function round1(x) {
  return Math.round((x || 0) * 10) / 10;
}
