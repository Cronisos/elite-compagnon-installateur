// Assemble tout ce qu'affiche la page d'une route : boucles, calculs, encadré
// « En ce moment », alertes, marchandises d'appoint, portée chargée.

import { computeStats, ladenRange, stockTrend } from './calc.js';
import { loopFromDb } from './tracker.js';
import { PAUSE_GAP_SEC } from './loops.js';
import { parseJsonColumn } from '../../../core/jsonColumn.js';

const fmtInt = (n) => Math.round(n).toLocaleString('fr-FR');
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const lower = (s) => String(s || '').toLocaleLowerCase('fr-FR');
/** « de la bauxite » / « d'indium » : élision devant une voyelle. */
const ofName = (s) => (/^[aeiouyhéèêâ]/i.test(s) ? `d'${lower(s)}` : `de ${lower(s)}`);

/** Structure dont la page a besoin : un objet avec ses escales, ses étapes et ses stations (des listes). */
export const isRouteStructure = (v) => v !== null && typeof v === 'object' && Array.isArray(v.stops) && Array.isArray(v.legs) && Array.isArray(v.stations);

export async function buildRouteView(route, { prisma, tracker, game, getSettings }) {
  const settings = await getSettings();
  // Lisible mais incomplète (« {} », sans étapes…) : même refus clair (422), au lieu d'un plantage plus loin (500)
  const structure = parseJsonColumn(route.structure, null, { label: `Route ${route.id} (structure)`, accept: isRouteStructure });
  if (!structure) {
    const err = new Error('Structure de route illisible en base.');
    err.status = 422;
    err.publicMessage = 'Cette route est abîmée dans la base : clique sur « Re-détecter la boucle » ci-dessous, ou supprime-la dans Mes routes.';
    throw err;
  }
  const overrides = parseJsonColumn(route.overrides || '{}', {}, { label: `Route ${route.id} (valeurs saisies)` });
  const state = game.snapshot();
  const rows = await prisma.loop.findMany({
    where: { routeId: route.id },
    include: { trades: true },
    orderBy: { startAt: 'asc' },
  });
  const loops = rows.map(loopFromDb);

  const stats = computeStats({
    loops,
    structure,
    goal: route.goal,
    balance: state.balance,
    cargoCapacity: state.loadout?.cargoCapacity ?? null,
    hoursPerEvening: settings.hoursPerEvening,
    overrides,
  });

  const live = buildLive(route, structure, tracker, state, stats);
  const range = Number(overrides.ladenRange) > 0
    ? Number(overrides.ladenRange)
    : ladenRange(state.loadout, stats.cargo, null);
  const laden = {
    range: range ? Math.round(range * 100) / 100 : null,
    manual: Number(overrides.ladenRange) > 0,
    longestJump: structure.longestJump,
    margin: range ? Math.round((range - structure.longestJump) * 100) / 100 : null,
  };
  const market = await buildMarket(prisma, structure, loops);
  const alerts = buildAlerts({ loops, stats, live, market, laden, state, structure });

  return {
    route: publicRoute(route),
    structure,
    overrides,
    hoursPerEvening: settings.hoursPerEvening,
    stats,
    live,
    laden,
    market,
    alerts,
    game: { balance: state.balance, legalState: state.legalState, ship: state.ship, system: state.system, commander: state.commander },
    // Le journal des boucles, du plus récent au plus ancien (sans le détail des échanges)
    loops: loops
      .map(({ trades, ...l }) => ({ ...l, tradesCount: trades.length }))
      .reverse(),
  };
}

export function publicRoute(r) {
  return {
    id: r.id,
    name: r.name,
    startSystem: r.startSystem,
    startStation: r.startStation,
    startCommodity: r.startCommodity,
    // Une route abîmée en base reste dans la liste (on peut l'ouvrir, la re-détecter, la supprimer)
    stations: parseJsonColumn(r.stations, [], { label: `Route ${r.id} (stations)`, accept: Array.isArray }),
    systems: parseJsonColumn(r.systems, [], { label: `Route ${r.id} (systèmes)`, accept: Array.isArray }),
    commodities: parseJsonColumn(r.commodities, [], { label: `Route ${r.id} (marchandises)`, accept: Array.isArray }),
    goal: r.goal,
    active: r.active,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt,
    trackFrom: r.trackFrom,
  };
}

/** Encadré « En ce moment » : étape actuelle, prochaine destination, chronomètres. */
function buildLive(route, structure, tracker, state, stats) {
  const { current } = tracker.extract(route);
  const waiting = (extra) => ({
    state: 'waiting',
    text: `En attente du départ : achète ${ofName(structure.startCommodityName).replace(/^de /, 'de la ')} à ${structure.startStation}.`,
    ...extra,
  });
  if (!current) return waiting({});

  const p = current.progress;
  const avgLoopSec = stats.avgMinutes ? stats.avgMinutes * 60 : null;
  // Aucune action depuis plus de 2 h : c'est une session précédente, pas une boucle en cours
  const idle = (Date.now() - Date.parse(p.lastActivityAt || current.startAt)) / 1000;
  if (idle > 2 * 3600) {
    return waiting({ lastDeparture: current.startAt });
  }

  const stops = structure.stops;
  const next = p.legIndex < stops.length
    ? { station: stops[p.legIndex].station, system: stops[p.legIndex].system }
    : { station: structure.startStation, system: structure.startSystem };

  const top = [...(state.cargo || [])].sort((a, b) => b.count - a.count)[0];
  const cargoText = state.cargoCount > 0 && top
    ? `${fmtInt(state.cargoCount)} t chargées (dont ${fmtInt(top.count)} t ${ofName(top.label)})`
    : 'Soute vide';
  const cargoShort = state.cargoCount > 0 && top && top.count === state.cargoCount
    ? `${fmtInt(top.count)} t ${ofName(top.label)} chargées`
    : cargoText;

  let text;
  if (p.destroyed) text = 'Vaisseau détruit pendant cette boucle — cargaison perdue.';
  else if (p.docked && p.lastStation) text = `À quai à ${p.lastStation} · ${cargoShort}`;
  else text = `${cargoShort}, en route vers ${next.station} (${next.system})`;

  return {
    state: 'running',
    text,
    startAt: current.startAt,
    legIndex: p.legIndex,
    legCount: structure.legs.length,
    legStartAt: p.legStartAt,
    // Chronos en temps joué : valeurs arrêtées à la dernière action du joueur ; le navigateur
    // ajoute le temps écoulé depuis tant qu'il reste sous le seuil de pause
    activeSec: p.activeSec,
    legActiveSec: p.legActiveSec,
    lastActivityAt: p.lastActivityAt,
    inMenu: p.inMenu,
    pauseGapSec: PAUSE_GAP_SEC,
    next,
    avgLoopSec,
    avgLegSec: stats.legAverages[p.legIndex] ?? null,
    destroyed: p.destroyed,
    netSoFar: current.netGain,
    meritsSoFar: current.merits,
  };
}

/** Station réellement utilisée dans chaque système (d'après la dernière boucle). */
function stationsInUse(structure, loops) {
  const bySystem = new Map(structure.stations.map((s) => [s.system, { marketId: s.marketId, station: s.station }]));
  // Ex. : Meech Dock ou Shoemaker City, toutes deux dans Cemiess
  for (const t of loops[loops.length - 1]?.trades || []) {
    if (bySystem.has(t.system)) bySystem.set(t.system, { marketId: t.marketId, station: t.station });
  }
  return bySystem;
}

/** Stock des marchandises principales et marchandises d'appoint, d'après Market.json archivé. */
async function buildMarket(prisma, structure, loops) {
  const inUse = stationsInUse(structure, loops);
  const legs = structure.legs.map((leg, k) => {
    const from = inUse.get(leg.from.system) || {};
    const to = inUse.get(leg.to.system) || {};
    return { k, from: { ...leg.from, ...from }, to: { ...leg.to, ...to }, commodity: structure.legCommodities[k] };
  });

  const since = new Date(Date.now() - 24 * 3600e3);
  const out = [];
  for (const leg of legs) {
    const entry = { leg: leg.k, from: leg.from, to: leg.to, commodity: leg.commodity, stock: null, topups: [] };
    if (leg.commodity && leg.from.marketId) {
      const pts = await prisma.marketSnapshot.findMany({
        where: { marketId: leg.from.marketId, commodity: leg.commodity.commodity, at: { gte: since } },
        orderBy: { at: 'asc' },
      });
      entry.stock = stockTrend(pts);
    }
    // Marchandises d'appoint : achat ici, vente à la station suivante (derniers relevés)
    if (leg.from.marketId && leg.to.marketId) {
      const [buyAt, sellAt] = await Promise.all([latestSnapshot(prisma, leg.from.marketId), latestSnapshot(prisma, leg.to.marketId)]);
      if (buyAt.length && sellAt.length) {
        const sellMap = new Map(sellAt.map((i) => [i.commodity, i]));
        entry.topups = buyAt
          .filter((i) => i.stock > 0 && i.buyPrice > 0 && i.commodity !== leg.commodity?.commodity)
          .map((i) => ({ i, s: sellMap.get(i.commodity) }))
          .filter(({ s }) => s && s.demand > 1 && s.sellPrice > 0) // demande ≤ 1 : invendable en pratique
          .map(({ i, s }) => ({
            commodity: i.commodity,
            name: i.name,
            buyPrice: i.buyPrice,
            sellPrice: s.sellPrice,
            margin: s.sellPrice - i.buyPrice,
            stock: i.stock,
            demand: s.demand,
          }))
          .filter((x) => x.margin > 0)
          .sort((a, b) => b.margin - a.margin)
          .slice(0, 6);
        entry.snapshotAt = { buy: buyAt[0].at, sell: sellAt[0].at };
      }
    }
    out.push(entry);
  }
  return out;
}

async function latestSnapshot(prisma, marketId) {
  const last = await prisma.marketSnapshot.findFirst({ where: { marketId }, orderBy: { at: 'desc' }, select: { at: true } });
  if (!last) return [];
  return prisma.marketSnapshot.findMany({ where: { marketId, at: last.at } });
}

/** Alertes (à traiter) et notes de vigilance (à garder à l'œil). */
function buildAlerts({ loops, stats, live, market, laden, state, structure }) {
  const alerts = [];
  const notes = [];

  // Destruction du vaisseau
  if (live.destroyed) {
    alerts.push({ level: 'danger', text: 'Vaisseau détruit pendant la boucle en cours : cargaison perdue.' });
  }
  const lastLoops = loops.slice(-3);
  for (const l of lastLoops) {
    if (!l.destroyed) continue;
    alerts.push({
      level: 'danger',
      text: `Vaisseau détruit pendant la boucle de ${fmtTime(l.startAt)} : ${fmtInt(l.netGain)} cr sur la boucle, rachat ${fmtInt(l.rebuy)} cr.`,
    });
  }

  // Stocks des marchandises principales
  for (const m of market) {
    const s = m.stock;
    if (!s || !m.commodity) continue;
    const label = `${ofName(m.commodity.name)} à ${m.from.station}`;
    if (s.ratePerHour != null && s.ratePerHour < 0) {
      const hoursLeft = s.stock / -s.ratePerHour;
      const text = `Stock ${label} :${fmtInt(s.stock)} t, en baisse d'environ ${fmtInt(-s.ratePerHour)} t/h — épuisement estimé vers ${fmtTime(s.emptyAt)}${hoursLeft > 20 ? ' (dans plus de 20 h)' : ''}.`;
      if (hoursLeft < 6 || s.stock < stats.cargo * 5) alerts.push({ level: 'warning', text });
      else notes.push(text);
    } else if (s.stock != null) {
      notes.push(`Stock ${label} : ${fmtInt(s.stock)} t${s.ratePerHour == null ? ' (pas encore assez de relevés pour mesurer la tendance)' : ', stable'}.`);
    }
  }

  // Prix de vente en chute / prix fixes
  for (const t of stats.trends) {
    const series = t.series;
    if (series.length >= 4) {
      const ref = series[Math.max(0, series.length - 6)];
      const last = series[series.length - 1];
      const drop = (ref - last) / ref;
      const n = series.length - 1 - Math.max(0, series.length - 6);
      if (drop > 0.02) {
        alerts.push({
          level: 'warning',
          text: `Prix de vente ${ofName(t.name)} en chute : ${fmtInt(ref)} → ${fmtInt(last)} cr/t (−${(drop * 100).toFixed(1).replace('.', ',')} %) sur ${n} boucles.`,
        });
      }
    }
    if (t.fixedFor >= 5) {
      notes.push(`Prix de vente ${ofName(t.name)} fixe à ${fmtInt(t.lastSell)} cr/t depuis ${t.fixedFor} boucles : il peut décrocher d'un coup.`);
    }
    if (t.measured && t.erosion > 0) {
      notes.push(`Érosion mesurée ${ofName(t.name)} : −${String(t.erosion).replace('.', ',')} cr/t par boucle.`);
    }
  }

  // Le calcul par les prix ne colle pas aux boucles réelles : structure de route à revoir
  if (stats.check && !stats.check.ok) {
    alerts.push({
      level: 'danger',
      text: `Le gain calculé avec les prix (${fmtInt(stats.check.projected)} cr par boucle) ne correspond pas à tes boucles réelles (${fmtInt(stats.check.measured)} cr en moyenne). Les marchandises de la route sont probablement mal détectées : clique sur « Re-détecter la boucle ».`,
    });
  }

  // Objectif atteignable ?
  if (stats.projection && !stats.projection.reachable) {
    alerts.push({
      level: 'warning',
      text: `Avec l'érosion actuelle, l'objectif n'est pas atteignable sur cette route : la boucle n° ${stats.projection.loops + 1} ne serait plus rentable.`,
    });
  }

  // Portée chargée
  if (laden.range && laden.longestJump > laden.range) {
    alerts.push({ level: 'danger', text: `Le plus long saut (${laden.longestJump} al) dépasse la portée chargée (${laden.range.toFixed(2)} al).` });
  } else if (laden.margin != null && laden.margin < 1) {
    alerts.push({ level: 'warning', text: `Marge de portée faible : ${laden.margin.toFixed(2)} al sur le plus long saut.` });
  }

  // Statut légal
  if (state.legalState === 'Hostile') {
    alerts.push({ level: 'warning', text: `Statut légal « Hostile » dans ${state.system || 'le système actuel'}.` });
  }

  return { alerts, notes };
}
