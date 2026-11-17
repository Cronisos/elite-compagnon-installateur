// Mérites Powerplay gagnés, rangés par système, par semaine Powerplay et par activité, et vérifiés sur les
// relevés du jeu.
//
// Le journal ne dit pas d'où vient un gain : on regarde ce qui le précède. Une vente, une livraison ou une
// mission donne ses mérites en quelques secondes (13 s pour 785 t d'iridium, journal du 30 oct. 2026) ; un kill
// jusqu'à 15 s après (journaux de référence, 3-5 nov. 2026).
// Le gain compte pour le système où l'on est à ce moment-là : celui de la station de vente ou du combat.
// Une semaine Powerplay va du jeudi 7 h UTC (passage de semaine) au jeudi suivant.
//
// Chaque arrivée dans un système (FSDJump, Location, CarrierJump) donne son état Powerplay. Mesuré sur les journaux
// de l’auteur :
//   - prise (système inoccupé) : 4 mérites = 1 point, 120 000 points = 1,0 de ConflictProgress
//     (Synuefe GA-I b57-6, 30 oct. 2026 : 2 322 mérites → +0,004833, soit 580 points) ;
//   - renforcement (système tenu) : 4 mérites = 1 point de PowerplayStateReinforcement aussi, remis à zéro au
//     passage de semaine (Synuefe OU-E c28-2, 6 nov. : 60 779 mérites de vente, relevé +19 468 avec les autres joueurs ;
//     en 1 pour 1 il aurait fallu +60 779).
// Le relevé additionne tous les joueurs de la puissance : il ne dit jamais quelle part est la tienne.
// Le jeu met à jour ces relevés avec du retard : un gain peut n'apparaître qu'au relevé suivant.

import { MeritCounter } from '../../core/merits.js';
import { ACQUISITION_POINTS, MERITS_PER_POINT_TABLE, TIER_FORTIFIED_POINTS, TIER_STRONGHOLD_POINTS, TIER_STRONGHOLD_GAUGE_POINTS, erosionOf, weekStart, pointsOf } from '../../regles/powerplay.js';

export const MERIT_EVENTS = [
  'Location', 'FSDJump', 'CarrierJump', 'Powerplay', 'PowerplayMerits', 'MiningRefined',
  'MarketSell', 'PowerplayDeliver', 'MissionCompleted', 'SearchAndRescue', 'RedeemVoucher',
  'SellExplorationData', 'MultiSellExplorationData', 'SellOrganicData',
  'Bounty', 'FactionKillBond', 'CapShipBond', 'PVPKill', 'ShipTargeted', 'UnderAttack',
];

export const ACTIVITIES = ['mining', 'trade', 'combat', 'rescue', 'exploration', 'exobiology', 'delivery', 'missions', 'other'];
/** Mérites par point en prise : 6 pour l'exploration et l'exobiologie, 4 pour le reste (dépôt des règles). */
export const MERITS_PER_POINT = Object.fromEntries(Object.entries(MERITS_PER_POINT_TABLE).filter(([k]) => k !== 'defaut'));
export const POINTS_PER_CAPTURE = ACQUISITION_POINTS; // 1,0 de progression de prise (dépôt des règles)
export const COUNTED_RATIO = 0.9; // en dessous, le jeu a relevé moins de points que tes mérites n'en valent
const MIN_CHECK_POINTS = 100; // trop peu de points pour juger : l'arrondi du jeu suffit à fausser le rapport

const SOURCE_MS = 30_000; // une vente ou une livraison crédite ses mérites dans les 30 s
const KILL_MS = 15_000;
const COMBAT_MS = 60_000; // ciblage ou attaque subie : le gain peut venir un peu plus tard
const KILLS = new Set(['Bounty', 'FactionKillBond', 'CapShipBond', 'PVPKill']);
const ARRIVALS = new Set(['Location', 'FSDJump', 'CarrierJump']);
/**
 * Bons de combat : primes, obligations de guerre, bons de colonie. Un bon codex ou trade n'est pas du combat (même
 * filtre que « Mérites par heure », rates.js).
 */
export const COMBAT_VOUCHERS = new Set(['bounty', 'combatbond', 'settlement']);
const voucherActivity = (ev) => (COMBAT_VOUCHERS.has(String(ev.Type || '').toLowerCase()) ? 'combat' : 'other');
const MAX_EN_ATTENTE = 20; // arrivées gardées avant le premier événement Powerplay
const SOURCES = {
  PowerplayDeliver: 'delivery',
  MissionCompleted: 'missions',
  SearchAndRescue: 'rescue',
  SellExplorationData: 'exploration',
  MultiSellExplorationData: 'exploration',
  SellOrganicData: 'exobiology',
};
// Minerais de minage : ceux raffinés dans le journal s'y ajoutent
const ORES = [
  'platinum', 'painite', 'osmium', 'palladium', 'gold', 'silver', 'rhodplumsite', 'serendibite', 'monazite',
  'musgravite', 'benitoite', 'grandidierite', 'alexandrite', 'opal', 'bromellite', 'lowtemperaturediamond',
  'tritium', 'iridium', 'uraninite', 'lepidolite', 'bauxite', 'cobalt', 'coltan', 'gallite', 'indite',
  'jadeite', 'methaneclathrate', 'methanolmonohydratecrystals', 'moissanite', 'pyrophyllite', 'rutile',
  'taaffeite', 'uranium', 'bertrandite', 'lithiumhydroxide', 'praseodymium', 'samarium', 'thorium',
  'hydrogenperoxide', 'liquidoxygen', 'water', 'beryllium', 'bismuth', 'gallium', 'hafnium178', 'indium',
  'lanthanum', 'lithium', 'tantalum', 'thallium', 'titanium', 'aluminium', 'copper', 'tellurium',
];

const oreKey = (type) => String(type || '').toLowerCase().replace(/^\$/, '').replace(/_name;$/, '');
const at = (ev) => Date.parse(ev.timestamp);

// Noms de systèmes comparés sans tenir compte de la casse : une étape tapée « synuefe ga-i b57-6 » est le système
// « Synuefe GA-I b57-6 » du journal.
const lower = (s) => String(s ?? '').toLowerCase();
const sameName = (a, b) => a === b || lower(a) === lower(b);

/** Relevés d'un système (readings de MeritLog), quelle que soit la casse du nom ; [] si aucun. */
export function readingsOf(readings, name) {
  const exact = readings.get(name);
  if (exact) return exact;
  const k = lower(name);
  for (const [n, list] of readings) if (lower(n) === k) return list;
  return [];
}

/** Le nom est-il dans l'ensemble (paliers déclarés…), quelle que soit la casse ? */
export function hasName(set, name) {
  if (set.has(name)) return true;
  const k = lower(name);
  for (const n of set) if (lower(n) === k) return true;
  return false;
}

const WEEK_MS = 7 * 24 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
// Semaine Powerplay : dépôt des règles (jour et heure du passage)
export { weekStart };

// Points de contrôle d'un gain : dépôt des règles
export { pointsOf };

/** État Powerplay d'un système à l'arrivée, pour la puissance du joueur. */
export function readingOf(ev, power) {
  const conflict = (ev.PowerplayConflictProgress || []).find((p) => !power || p.Power === power);
  if (ev.ControllingPower && (!power || ev.ControllingPower === power) && ev.PowerplayStateReinforcement != null) {
    return {
      t: at(ev), mode: 'reinforcement', state: ev.PowerplayState,
      progress: ev.PowerplayStateControlProgress ?? null, points: ev.PowerplayStateReinforcement,
      undermining: ev.PowerplayStateUndermining ?? 0,
    };
  }
  if (conflict) {
    return { t: at(ev), mode: 'acquisition', state: ev.PowerplayState, progress: conflict.ConflictProgress, points: Math.round(conflict.ConflictProgress * POINTS_PER_CAPTURE) };
  }
  return null;
}

export class MeritLog {
  constructor() {
    this.counter = new MeritCounter();
    this.system = null;
    this.power = null;
    this.ores = new Set(ORES);
    this.source = null; // { activity, t } : dernière vente, livraison ou mission
    this.lastKill = null;
    this.lastCombat = null;
    this.entries = []; // { t, system, merits, activity, mode }
    this.readings = new Map(); // système → relevés du jeu, du plus ancien au plus récent
    this.names = new Map(); // nom en minuscules → orthographe du journal
    this.positions = new Map(); // nom en minuscules → StarPos [x, y, z] (AL)
    // Arrivées vues avant de connaître ta puissance (Location avant Powerplay dans le premier journal) : sans elle, le
    // relevé d'une autre puissance passerait pour le tien. Lues dès que la puissance est connue.
    this.enAttente = [];
    // En attendant, et pour toujours si tu n'as pas de puissance : relevés provisoires, pris pour la puissance qui
    // tient le système (comme avant). Retirés quand ta puissance est connue, puis remplacés par les arrivées relues.
    this.provisoires = new Set();
  }

  /** Orthographe du journal d'un système déjà visité (le joueur peut taper « synuefe ga-i b57-6 »), sinon le nom tel quel. */
  canon(name) {
    return this.names.get(lower(name)) ?? name;
  }

  /** Distance (AL, au centième) entre deux systèmes visités, d'après leurs positions au journal ; null si l'un est inconnu. */
  distance(a, b) {
    const p = this.positions.get(lower(a));
    const q = this.positions.get(lower(b));
    if (!p || !q) return null;
    return Math.round(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 100) / 100;
  }

  /** Relevé du jeu à l'arrivée dans un système, pour ta puissance (ou provisoire tant qu'elle n'est pas connue). */
  noteReading(ev) {
    const reading = readingOf(ev, this.power);
    if (!reading) return;
    if (!this.power) this.provisoires.add(reading);
    const list = this.readings.get(ev.StarSystem) || [];
    list.push(reading);
    this.readings.set(ev.StarSystem, list);
  }

  /** Puissance connue (Powerplay, PowerplayMerits) : les arrivées mises de côté sont relues pour elle. */
  setPower(power) {
    if (!power) return;
    this.power = power;
    if (this.provisoires.size) {
      for (const [system, list] of this.readings) {
        const kept = list.filter((r) => !this.provisoires.has(r));
        if (kept.length) this.readings.set(system, kept);
        else this.readings.delete(system);
      }
      this.provisoires.clear();
    }
    const attente = this.enAttente;
    this.enAttente = [];
    for (const ev of attente) this.noteReading(ev);
  }

  activityAt(t) {
    const source = this.source && t - this.source.t <= SOURCE_MS ? this.source : null;
    const kill = this.lastKill != null && t - this.lastKill <= KILL_MS ? this.lastKill : null;
    // Une vente et un kill rapprochés : le plus récent l'emporte
    if (source && (kill == null || source.t >= kill)) return source.activity;
    if (kill != null) return 'combat';
    if (this.lastCombat != null && t - this.lastCombat <= COMBAT_MS) return 'combat';
    return 'other';
  }

  apply(ev) {
    const t = at(ev);
    if (ARRIVALS.has(ev.event)) {
      if (!ev.StarSystem) return;
      this.system = ev.StarSystem;
      this.names.set(lower(ev.StarSystem), ev.StarSystem);
      const pos = ev.StarPos;
      if (Array.isArray(pos) && pos.length === 3 && pos.every(Number.isFinite)) this.positions.set(lower(ev.StarSystem), pos);
      if (!this.power) {
        this.enAttente.push(ev);
        if (this.enAttente.length > MAX_EN_ATTENTE) this.enAttente.shift();
      }
      this.noteReading(ev);
      return;
    }
    switch (ev.event) {
      case 'Powerplay':
        this.counter.setTotal(ev.Merits);
        this.setPower(ev.Power);
        break;
      case 'RedeemVoucher':
        this.source = { activity: voucherActivity(ev), t };
        break;
      case 'MiningRefined':
        this.ores.add(oreKey(ev.Type));
        break;
      case 'MarketSell':
        this.source = { activity: this.ores.has(oreKey(ev.Type)) ? 'mining' : 'trade', t };
        break;
      case 'ShipTargeted':
        if (ev.TargetLocked) this.lastCombat = t;
        break;
      case 'UnderAttack':
        this.lastCombat = t;
        break;
      case 'PowerplayMerits': {
        this.setPower(ev.Power);
        const diff = this.counter.gain(ev);
        const gained = ev.MeritsGained ?? diff;
        // Doublon retiré par le jeu (le total repart plus bas) : on le reprend là où il avait été compté
        const last = this.entries.at(-1);
        const correction = diff - gained;
        if (correction < 0 && last) this.entries.push({ ...last, t, merits: correction });
        const merits = correction < 0 && last ? gained : diff;
        const mode = this.readings.get(this.system)?.at(-1)?.mode ?? null;
        if (merits) this.entries.push({ t, system: this.system, merits, activity: this.activityAt(t), mode });
        break;
      }
      default:
        if (KILLS.has(ev.event)) this.lastKill = this.lastCombat = t;
        else if (SOURCES[ev.event]) this.source = { activity: SOURCES[ev.event], t };
    }
  }
}

const emptyBy = () => Object.fromEntries(ACTIVITIES.map((a) => [a, 0]));
const round = (x) => Math.round(x * 100) / 100;
const points = (list) => list.reduce((sum, e) => sum + pointsOf(e.merits, e.activity), 0);

/** Activités rangées de la plus rapportée à la moins rapportée. */
function ranking(by) {
  return Object.entries(by).filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1])
    .map(([activity, merits]) => ({ activity, merits }));
}

/**
 * Ce que le jeu a relevé dans un système pendant la semaine, comparé aux points de tes gains.
 * Renforcement : remis à zéro au passage de semaine, le dernier relevé est le total de la semaine.
 * Prise : progression cumulée, on compte depuis le relevé qui précède ton premier gain de la semaine.
 */
export function gameCheck(readings = [], gains, start, end) {
  const inWeek = readings.filter((r) => r.t >= start && r.t < end);
  const last = inWeek.at(-1);
  if (!last) return null;
  let base = null;
  let from = start;
  if (last.mode === 'acquisition') {
    const first = gains[0]?.t ?? last.t;
    base = [...readings].reverse().find((r) => r.t <= first && r.mode === 'acquisition') ?? inWeek[0];
    from = base.t;
  }
  const game = last.points - (base?.points ?? 0);
  const counted = gains.filter((e) => e.t > from && e.t <= last.t);
  const mine = points(counted);
  const pending = gains.filter((e) => e.t > last.t);
  return {
    at: last.t,
    mode: last.mode,
    state: last.state,
    progress: last.progress,
    game: Math.round(game),
    mine: round(mine),
    share: game > 0 ? round(mine / game) : null,
    pendingMerits: pending.reduce((sum, e) => sum + e.merits, 0),
    pendingPoints: round(points(pending)),
    counted: mine < MIN_CHECK_POINTS ? null : game >= mine * COUNTED_RATIO,
  };
}

/**
 * Rapport d'une semaine pour une liste de systèmes (ou tous si systems est vide).
 * @param week un instant de la semaine voulue ; par défaut, celle de now
 */
export function weekReport(entries, { systems = [], week, now = Date.now(), readings = new Map(), roles = new Map(), declared = new Set() } = {}) {
  const wanted = new Set(systems.map(lower));
  const keep = (e) => !wanted.size || wanted.has(lower(e.system));
  const roleOf = new Map([...roles].map(([n, r]) => [lower(n), r]));
  const mine = entries.filter(keep);
  const current = weekStart(now);
  const start = week != null ? weekStart(week) : current;
  const end = start + WEEK_MS;
  const inWeek = mine.filter((e) => e.t >= start && e.t < end);

  const days = Array.from({ length: 7 }, (_, i) => ({ start: start + i * DAY_MS, merits: 0, by: emptyBy() }));
  const bySystem = new Map();
  const by = emptyBy();
  for (const e of inWeek) {
    const day = days[Math.floor((e.t - start) / DAY_MS)];
    day.merits += e.merits;
    day.by[e.activity] += e.merits;
    by[e.activity] += e.merits;
    const s = bySystem.get(e.system) || { system: e.system, merits: 0, by: emptyBy(), gains: [] };
    s.merits += e.merits;
    s.by[e.activity] += e.merits;
    s.gains.push(e);
    bySystem.set(e.system, s);
  }
  const weeks = [...new Set(mine.map((e) => weekStart(e.t)))];
  if (!weeks.includes(current)) weeks.push(current);
  return {
    start,
    end,
    current: start === current,
    weeks: weeks.sort((a, b) => a - b),
    merits: inWeek.reduce((sum, e) => sum + e.merits, 0),
    points: round(points(inWeek)),
    gains: inWeek.length,
    topDays: days.filter((d) => d.merits > 0).sort((a, b) => b.merits - a.merits).slice(0, 3)
      .map((d) => ({ start: d.start, merits: d.merits })),
    ranking: ranking(by),
    days: days.map((d) => ({ start: d.start, merits: d.merits, ranking: ranking(d.by) })),
    systems: [...bySystem.values()].sort((a, b) => b.merits - a.merits).map((s) => ({
      system: s.system,
      merits: s.merits,
      points: round(points(s.gains)),
      mode: s.gains.at(-1).mode,
      ranking: ranking(s.by),
      check: gameCheck(readingsOf(readings, s.system), s.gains, start, end),
      info: systemInfo(s.system, { entries, readings, role: roleOf.get(lower(s.system)), end, declared: hasName(declared, s.system) }),
    })),
    total: mine.reduce((sum, e) => sum + e.merits, 0),
  };
}

// Paliers (dépôt des règles, server/src/regles/powerplay.js) : la jauge d'un niveau va de 0 à 1,0, et 1,0 vaut ce
// nombre de points. Le passage de niveau se fait au passage de semaine.
const BAND = { Unoccupied: ACQUISITION_POINTS, Exploited: TIER_FORTIFIED_POINTS, Fortified: TIER_STRONGHOLD_POINTS, Stronghold: TIER_STRONGHOLD_GAUGE_POINTS };
/** Points de 1,0 de jauge à chaque niveau (exposés par GET /rules) : prise, vers Consolidé, vers Forteresse, Forteresse. */
export const BAND_POINTS = Object.freeze({ ...BAND });
const NEXT = { Unoccupied: 'Exploited', Exploited: 'Fortified', Fortified: 'Stronghold', Stronghold: null };
const ROLE_GOAL = { fortified: 'Fortified', stronghold: 'Stronghold', target: 'Exploited' };
const ORDERED = ['Unoccupied', 'Exploited', 'Fortified', 'Stronghold'];

/**
 * Où en est un système d'après son dernier relevé avant la fin de la semaine : niveau, jauge, points qu'il manque
 * pour le palier suivant et pour l'objectif de la route, et ce que tu y as gagné en tout.
 * `declared` : le joueur a déclaré le palier atteint cette semaine (paliers.js) ; la jauge est alors pleine, il ne
 * manque plus rien pour le palier suivant, et le vrai relevé reste dans `reading`.
 * `end` : fin de la semaine voulue (début + 7 jours). Un dernier relevé d'avant le début de cette semaine est
 * périmé (`reading.stale`) : le passage de jeudi a remis le renforcement à zéro, appliqué l'érosion et peut-être
 * changé le niveau. On n'en tire alors ni renforcement, ni érosion, ni points manquants : il faut repasser dans le
 * système (la jauge et le niveau restent ceux d'avant le passage, présentés comme tels).
 */
export function systemInfo(name, { entries = [], readings = new Map(), role, end = Infinity, declared = false } = {}) {
  const gains = entries.filter((e) => sameName(e.system, name));
  const mine = { merits: gains.reduce((sum, e) => sum + e.merits, 0), points: round(points(gains)) };
  const r = readingsOf(readings, name).filter((x) => x.t < end).at(-1);
  if (!r) return { system: name, reading: null, mine };
  const stale = Number.isFinite(end) && r.t < end - WEEK_MS;
  const state = r.mode === 'acquisition' ? 'Unoccupied' : r.state;
  const band = BAND[state] ?? null;
  const progress = r.progress ?? 0;
  const next = NEXT[state] ?? null;
  const atteint = Boolean(declared && next && band && r.mode === 'reinforcement'); // déclaré : seulement vers un palier
  let missingNext = next && band ? (atteint ? 0 : Math.max(0, Math.round((1 - progress) * band))) : null;
  const goal = ROLE_GOAL[role] ?? null;
  let missingGoal = null;
  if (goal) {
    const from = ORDERED.indexOf(state);
    const to = ORDERED.indexOf(goal);
    // Le surplus d'un palier est perdu au passage : chaque niveau suivant repart de zéro
    missingGoal = to <= from ? 0 : missingNext + ORDERED.slice(from + 1, to).reduce((sum, s) => sum + BAND[s], 0);
  }
  if (stale && !atteint) {
    missingNext = null; // à relever : érosion faite, niveau peut-être changé
    if (missingGoal) missingGoal = null;
  }
  // Relevé périmé : les gains d'entre le relevé et le passage ont déjà compté (puis été érodés ou perdus au
  // passage) ; seuls ceux de la semaine voulue restent à relever.
  const since = stale ? Math.max(r.t, end - WEEK_MS) : r.t;
  const pending = gains.filter((e) => e.t > since && e.t < end);
  const bandPoints = band ? (atteint ? band : Math.round(progress * band)) : null;
  return {
    system: name,
    reading: { at: r.t, mode: r.mode, state, progress, week: stale ? null : r.points, undermining: stale ? 0 : r.undermining ?? 0, stale },
    band,
    bandPoints,
    next,
    missingNext,
    goal,
    missingGoal,
    declared: atteint,
    pendingPoints: round(points(pending)),
    erosion: atteint || stale ? null : erosionPrevue(state, bandPoints, band, round(points(pending))),
    mine,
  };
}

/**
 * Érosion prévue au prochain passage si la jauge en reste là (dernier relevé + tes points pas encore relevés) :
 * { points, base, verifiee } ; null en prise (rien à éroder) ou si le palier sera atteint (changement de niveau, effet
 * de l'érosion inconnu). La règle n'est vérifiée qu'en Exploité.
 */
function erosionPrevue(state, bandPoints, band, pendingPoints) {
  if (state === 'Unoccupied' || bandPoints == null || !band) return null;
  const base = Math.round(bandPoints + (pendingPoints || 0));
  if (state !== 'Stronghold' && base >= band) return null;
  return { points: erosionOf(base, band), base, verifiee: state === 'Exploited' };
}

const LEVEL = { Exploited: 1, Fortified: 2, Stronghold: 3 };
const GOAL = { fortified: 2, stronghold: 3, target: 1 };

/**
 * Avancée de la route d'après le dernier relevé de chaque système : un système est validé quand il a atteint son
 * objectif (Consolidé, Forteresse, ou simplement tenu pour l'arrivée). Le système en cours est le premier qui ne l'est
 * pas ; frac est sa progression vers l'objectif, quand le relevé la donne. Un système déclaré atteint cette semaine
 * (`declared`, paliers.js) compte comme validé : on passe à l'étape suivante en attendant le passage.
 * `end` : fin de la semaine voulue (début + 7 jours) ; seuls les relevés d'avant comptent (historique d'une semaine
 * passée). Un relevé d'avant le début de cette semaine dont la jauge était pleine : le palier est passé (ou le
 * système pris) au passage de jeudi, l'étape avance d'un niveau.
 */
export function routeProgress(steps, readings = new Map(), declared = new Set(), { end = Infinity } = {}) {
  const begin = Number.isFinite(end) ? end - WEEK_MS : -Infinity;
  const last = (name) => readingsOf(readings, name).filter((r) => r.t < end).at(-1) ?? null;
  const seen = (r) => (r.mode === 'reinforcement' ? LEVEL[r.state] || 0 : 0); // niveau écrit dans le relevé
  const level = (r) => (r.t < begin && (r.progress ?? 0) >= 1 ? Math.min(3, seen(r) + 1) : seen(r));
  const done = (s) => {
    if (s.role === 'held-stronghold' || s.role === 'held-fortified' || hasName(declared, s.name)) return true;
    const r = last(s.name);
    return Boolean(r) && level(r) > 0 && level(r) >= (GOAL[s.role] || 1);
  };
  const index = steps.findIndex((s) => !done(s));
  if (index < 0) return { index: steps.length, frac: 1 };
  const r = last(steps[index].name);
  // Exploité vers Consolidé, ou Consolidé vers Forteresse : la jauge du relevé ; prise : 1,0 = pris. Palier passé au
  // passage depuis ce relevé : la nouvelle jauge est inconnue.
  const toward = r && level(r) === seen(r) && ((r.mode === 'acquisition') || seen(r) + 1 === (GOAL[steps[index].role] || 1));
  return { index, frac: toward ? Math.max(0, Math.min(1, r.progress ?? 0)) : 0 };
}

/**
 * Le système `name` est-il celui où travailler pour un projet, c'est-à-dire l'étape en cours de sa route ? Si oui,
 * ce qu'il faut pour le Coup d'œil : palier suivant avant le passage de semaine (moins tes points pas encore
 * relevés), rythme par jour, objectif de la route, tes mérites de la semaine ici, et l'étape d'après.
 * @param projects [{ id, name, steps: [{ name, role }] }]
 * @param declared paliers déclarés atteints cette semaine (paliers.js) : comme dans l'onglet Historique, un système
 *   déclaré est validé et l'étape en cours passe à la suivante
 */
export function workSystem(projects, name, { entries = [], readings = new Map(), now = Date.now(), declared = new Set() } = {}) {
  const end = weekStart(now) + WEEK_MS;
  for (const p of projects) {
    const progress = routeProgress(p.steps, readings, declared, { end });
    const step = p.steps[progress.index];
    if (!step || !sameName(step.name, name)) continue;
    const report = weekReport(entries, { systems: [step.name], now, readings });
    const info = systemInfo(step.name, { entries, readings, role: step.role, end: report.end, declared: hasName(declared, step.name) });
    // Ce qui reste vraiment : le relevé ne compte pas encore tes derniers mérites
    const left = info.missingNext != null ? Math.max(0, Math.round(info.missingNext - (info.pendingPoints || 0))) : null;
    const days = (report.end - now) / DAY_MS;
    return {
      project: { id: p.id, name: p.name },
      index: progress.index,
      count: p.steps.length,
      next: p.steps[progress.index + 1]?.name ?? null,
      role: step.role,
      info,
      left,
      perDay: left > 0 && days > 0 ? Math.ceil(left / Math.max(days, 1 / 24)) : null,
      week: { merits: report.merits, points: report.points, end: report.end },
    };
  }
  return null;
}
