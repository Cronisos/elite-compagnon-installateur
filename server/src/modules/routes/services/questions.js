// Questions posées au joueur quand il s'écarte de la route active, pour que la route suive
// ses changements sans devoir la recréer :
// - amarrage à une autre station dans un système de la route (« nouvelle station ? ») ;
// - gros achat d'une autre marchandise que la marchandise principale de l'étape
//   (« nouvelle marchandise principale ? »).
// Réponse « oui » : la route est mise à jour. « Non, ponctuel » : on ne redemande plus.

import { BULK_RATIO } from './buyCheck.js';
import { parseJsonColumn } from '../../../core/jsonColumn.js';

/** Structure de la route, ou null si elle est abîmée en base (signalé une fois dans la console, pas à chaque amarrage). */
function readStructure(route) {
  return parseJsonColumn(route.structure, null, {
    label: `Route ${route.id} (structure)`,
    accept: (v) => v !== null && typeof v === 'object' && Array.isArray(v.stops),
  });
}

/** Stations de la route dans l'ordre : départ (étape 0) puis escales. */
function order(s) {
  return [
    { station: s.startStation, system: s.startSystem, marketId: s.startMarketId },
    ...s.stops.map((x) => ({ station: x.station, system: x.system, marketId: x.marketId })),
  ];
}

const ignoredKey = (q) => (q.type === 'station' ? `station:${q.marketId}` : `commodity:${q.legIndex}:${q.commodity}`);

/**
 * @param {object} route route en base (structure JSON)
 * @param {object} dock entrée 'dock' de la chronologie
 * @returns {object|null} question, ou null si rien à demander
 */
export function stationQuestion(route, dock) {
  if (!dock || dock.kind !== 'dock' || dock.fromLocation || !dock.station) return null;
  const s = readStructure(route);
  if (!s) return null;
  const legIndex = order(s).findIndex((x) => x.system === dock.system);
  if (legIndex < 0) return null;
  const expected = order(s)[legIndex];
  if (expected.station === dock.station) return null;
  const q = {
    type: 'station',
    routeId: route.id,
    legIndex,
    system: dock.system,
    oldStation: expected.station,
    station: dock.station,
    marketId: dock.marketId,
    title: 'Changement de station ?',
    text: `Tu es à ${dock.station} au lieu de ${expected.station} (${dock.system}). C'est ta nouvelle station sur cette route ?`,
    yes: `Oui, ${dock.station} remplace ${expected.station}`,
    no: 'Non, ponctuel',
  };
  return (s.ignored || []).includes(ignoredKey(q)) ? null : q;
}

/**
 * @param {object} route route en base
 * @param {object} buy entrée 'buy' de la chronologie
 * @param {number|null} cargoCapacity soute du vaisseau
 */
export function commodityQuestion(route, buy, cargoCapacity) {
  if (!buy || buy.kind !== 'buy' || buy.commodity === 'drones') return null;
  const bulk = cargoCapacity ? buy.count >= BULK_RATIO * cargoCapacity : buy.count >= 100;
  if (!bulk) return null;
  const s = readStructure(route);
  if (!s) return null;
  const legIndex = order(s).findIndex((x) => x.system === buy.system);
  if (legIndex < 0) return null;
  const current = s.legCommodities?.[legIndex] || (legIndex === 0 ? { commodity: s.startCommodity, name: s.startCommodityName } : null);
  if (!current || current.commodity === buy.commodity) return null;
  const q = {
    type: 'commodity',
    routeId: route.id,
    legIndex,
    system: buy.system,
    station: buy.station,
    commodity: buy.commodity,
    name: buy.name,
    oldCommodity: current.commodity,
    oldName: current.name,
    title: 'Nouvelle marchandise principale ?',
    text: `Tu viens de charger ${buy.count.toLocaleString('fr-FR')} t de ${buy.name.toLocaleLowerCase('fr-FR')} à ${buy.station}, au lieu de ${String(current.name).toLocaleLowerCase('fr-FR')}. Elle devient ta marchandise principale au départ de ${buy.station} ?`,
    yes: `Oui, ${buy.name.toLocaleLowerCase('fr-FR')} désormais`,
    no: 'Non, ponctuel',
  };
  return (s.ignored || []).includes(ignoredKey(q)) ? null : q;
}

/** Données de mise à jour de la route (Prisma) pour une réponse « oui » ou « non ». */
export function applyAnswer(route, q, yes) {
  const s = readStructure(route);
  if (!s) {
    const err = new Error(`Route ${route.id} : structure illisible en base, réponse non appliquée.`);
    err.status = 422;
    err.publicMessage = 'Cette route est abîmée dans la base : ta réponse n’a rien changé. Ouvre la route et clique sur « Re-détecter la boucle ».';
    throw err;
  }
  if (!yes) {
    s.ignored = [...new Set([...(s.ignored || []), ignoredKey(q)])];
    return { structure: JSON.stringify(s) };
  }

  const data = {};
  if (q.type === 'station') {
    if (q.legIndex === 0) {
      s.startStation = q.station;
      s.startMarketId = q.marketId;
      data.startStation = q.station;
      data.startMarketId = q.marketId ?? 0;
    } else {
      Object.assign(s.stops[q.legIndex - 1], { station: q.station, marketId: q.marketId });
    }
    for (const leg of s.legs || []) {
      for (const end of [leg.from, leg.to]) if (end?.system === q.system) end.station = q.station;
    }
    const swap = (x) => (x.system === q.system ? { ...x, station: q.station, marketId: q.marketId } : x);
    s.stations = (s.stations || []).map(swap);
    data.stations = JSON.stringify(s.stations);
    // Nom automatique (« A ⇄ B ») : il suit la nouvelle station
    if (route.name.includes(q.oldStation)) data.name = route.name.split(q.oldStation).join(q.station);
  } else {
    s.legCommodities = s.legCommodities || [];
    s.legCommodities[q.legIndex] = { commodity: q.commodity, name: q.name };
    if (q.legIndex === 0) {
      s.startCommodity = q.commodity;
      s.startCommodityName = q.name;
      data.startCommodity = q.commodity;
    }
    if (!(s.commodities || []).some((c) => c.commodity === q.commodity)) {
      s.commodities = [...(s.commodities || []), { commodity: q.commodity, name: q.name }];
      data.commodities = JSON.stringify(s.commodities);
    }
  }
  data.structure = JSON.stringify(s);
  return data;
}
