// « Mon apport à l'escadron » : écart entre deux événements Statistics (partie Squadron), pour chaque classement.
//
// Le jeu écrit Statistics à chaque connexion. Ses classements d'escadron sont des cumuls depuis l'arrivée dans
// l'escadron (rules.js STATS_CUMULATIVE) : l'écart entre deux relevés donne ce que tu as apporté entre les deux.
// Pour le Powerplay, l'app le recoupe avec les mérites du journal sur le même intervalle.

import { RULES } from './rules.js';
import { cleanText } from '../../core/text.js';

/** Nom affiché venu du jeu (escadron, rang) : nettoyé comme les autres textes du jeu (core/text.js). */
const shown = (v) => (isText(v) ? cleanText(v) || null : null);

export const STATS_EVENTS = ['Statistics', 'SquadronStartup', 'JoinedSquadron', 'SquadronCreated', 'LeftSquadron', 'KickedFromSquadron', 'DisbandedSquadron', 'Powerplay', 'PowerplayMerits', 'LoadGame'];

const LEADERBOARD_RE = /^Squadron_Leaderboard_(.+)_highestcontribution$/;
const BANK_RE = /^Squadron_Bank_(.+)$/;

// Classements connus : nom français, unité, et ce qu'on sait de leur sens (statut de rules.js)
const rulesStatus = (name) => RULES[name].status;
export const LEADERBOARDS = new Map([
  ['powerplay', { label: 'Powerplay', unit: 'mérites', status: rulesStatus('STATS_POWERPLAY_IS_MERITS'), note: 'écart = mérites réellement crédités (TotalMerits)' }],
  ['mining', { label: 'Minage', unit: 'cr', status: rulesStatus('STATS_MINING_IS_PROFITS'), note: 'écart = bénéfices de minage (Mining_Profits)' }],
  ['bounty', { label: 'Primes', unit: 'cr', status: rulesStatus('STATS_BOUNTY_IS_CREDITS'), note: 'proche des primes encaissées' }],
  ['combat', { label: 'Combat', unit: null, status: 'à vérifier', note: 'unité inconnue' }],
  ['exploration', { label: 'Exploration', unit: 'cr', status: 'à vérifier', note: 'ne suit pas toujours les ventes de cartographie' }],
  ['trade', { label: 'Commerce', unit: 'cr', status: 'à vérifier', note: 'bien plus bas que les bénéfices du marché' }],
  ['trade_illicit', { label: 'Contrebande', unit: 'cr', status: 'à vérifier', note: '' }],
  ['aegis', { label: 'Aegis (Thargoïdes)', unit: null, status: 'à vérifier', note: 'unité inconnue' }],
  ['bgs', { label: 'BGS (influence)', unit: null, status: 'à vérifier', note: 'unité inconnue' }],
  ['colonisation_contribution', { label: 'Colonisation', unit: null, status: 'à vérifier', note: 'unité inconnue' }],
  ['cqc', { label: 'CQC', unit: null, status: 'à vérifier', note: 'unité inconnue' }],
  ['operationscore', { label: 'Opérations', unit: null, status: 'à vérifier', note: 'unité inconnue' }],
]);

// Banque d'escadron : dépôts et retraits (affichés seulement s'ils bougent)
const BANK_LABELS = new Map([
  ['Credits_Deposited', ['Crédits déposés', 'cr']],
  ['Credits_Withdrawn', ['Crédits retirés', 'cr']],
  ['Commodities_Deposited_Num', ['Marchandises déposées', 't']],
  ['Commodities_Deposited_Value', ['Marchandises déposées (valeur)', 'cr']],
  ['Commodities_Withdrawn_Num', ['Marchandises retirées', 't']],
  ['Commodities_Withdrawn_Value', ['Marchandises retirées (valeur)', 'cr']],
  ['PersonalAssets_Deposited_Num', ['Biens personnels déposés', null]],
  ['PersonalAssets_Deposited_Value', ['Biens personnels déposés (valeur)', 'cr']],
  ['PersonalAssets_Withdrawn_Num', ['Biens personnels retirés', null]],
  ['PersonalAssets_Withdrawn_Value', ['Biens personnels retirés (valeur)', 'cr']],
  ['Ships_Deposited_Num', ['Vaisseaux déposés', null]],
  ['Ships_Deposited_Value', ['Vaisseaux déposés (valeur)', 'cr']],
]);

/** Description d'une clé de la partie Squadron : classement, banque, ou clé inconnue (nouveauté du jeu). */
export function describeKey(key) {
  const board = LEADERBOARD_RE.exec(key);
  if (board) {
    const id = board[1];
    const known = LEADERBOARDS.get(id);
    return known ? { group: 'classement', id, ...known } : { group: 'classement', id, label: id, unit: null, status: 'inconnue', note: 'classement inconnu de l\'app' };
  }
  if (key === 'Squadron_Leaderboard_podiums') return { group: 'classement', id: 'podiums', label: 'Podiums', unit: null, status: 'à vérifier', note: '' };
  const bank = BANK_RE.exec(key);
  if (bank) {
    const known = BANK_LABELS.get(bank[1]);
    return { group: 'banque', id: bank[1], label: known?.[0] ?? bank[1], unit: known?.[1] ?? null, status: known ? 'à vérifier' : 'inconnue', note: '' };
  }
  return { group: 'autre', id: key, label: key, unit: null, status: 'inconnue', note: '' };
}

/** Valeurs numériques de la partie Squadron d'un Statistics (clés venues du jeu : rangées dans une Map). */
export function readSquadron(squadron) {
  const values = new Map();
  if (!squadron || typeof squadron !== 'object' || Array.isArray(squadron)) return values;
  for (const [k, v] of Object.entries(squadron)) if (typeof v === 'number' && Number.isFinite(v)) values.set(k, v);
  return values;
}

const sameValues = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

const isText = (v) => typeof v === 'string' && v.length > 0;

export class SquadronStats {
  constructor() {
    this.snapshots = []; // { at, t, values: Map }
    this.squadron = null; // { name, rank, at }
    this.joinedAt = null;
    this.leftAt = null;
    this.gains = []; // { t, real, listed } : mérites du journal (réels d'après TotalMerits, et écrits)
    this.total = null;
  }

  apply(ev) {
    const t = Date.parse(ev?.timestamp);
    switch (ev?.event) {
      case 'Statistics': {
        if (!Number.isFinite(t) || !ev.Squadron) return false;
        const values = readSquadron(ev.Squadron);
        if (!values.size) return false;
        this.snapshots.push({ at: ev.timestamp, t, values });
        return true;
      }
      case 'SquadronStartup':
        this.squadron = { name: shown(ev.SquadronName), rank: shown(ev.CurrentRankName), at: ev.timestamp };
        return true;
      case 'JoinedSquadron':
      case 'SquadronCreated':
        this.joinedAt = ev.timestamp;
        this.squadron = { name: shown(ev.SquadronName), rank: null, at: ev.timestamp };
        return true;
      case 'LeftSquadron':
      case 'KickedFromSquadron':
      case 'DisbandedSquadron':
        this.leftAt = ev.timestamp;
        this.squadron = null;
        return true;
      case 'LoadGame':
        this.total = null;
        return false;
      case 'Powerplay':
        if (Number.isInteger(ev.Merits)) this.total = ev.Merits;
        return false;
      case 'PowerplayMerits': {
        const listed = Number.isInteger(ev.MeritsGained) ? ev.MeritsGained : 0;
        const total = Number.isInteger(ev.TotalMerits) ? ev.TotalMerits : null;
        // Gain réel : écart de TotalMerits (les lignes en double du jeu n'y ajoutent rien), sinon le gain écrit
        const known = total !== null && this.total !== null;
        const real = known ? total - this.total : listed;
        // Ligne en double (total inchangé) : à distinguer des gains annulés par la ligne suivante (rules.js)
        const doubled = known && total === this.total ? listed : 0;
        if (total !== null) this.total = total;
        if (Number.isFinite(t)) this.gains.push({ t, real, listed, doubled });
        return false;
      }
      default:
        return false;
    }
  }

  /**
   * Un relevé par série de relevés identiques : le dernier de la série, le plus proche de ce qui a suivi
   * (deux connexions à quelques minutes d'écart donnent les mêmes valeurs).
   */
  distinct() {
    const out = [];
    for (const s of this.snapshots) {
      if (out.length && sameValues(out.at(-1).values, s.values)) out[out.length - 1] = s;
      else out.push(s);
    }
    return out;
  }

  /**
   * Premier relevé de la semaine Powerplay du dernier relevé. Le jeu écrit Statistics à la connexion : ce relevé
   * donne l'état à la fin de la semaine précédente, sa dernière séance comprise (le dernier relevé d'avant le
   * passage la manquerait). Seule erreur possible : une séance à cheval sur le passage. Les mérites qu'elle a gagnés
   * après le passage sont déjà dans ce relevé et manquent à la semaine : `spill` les compte d'après le journal.
   */
  weekStartSnapshot(weekStartOf) {
    const last = this.snapshots.at(-1);
    if (!last) return null;
    const week = weekStartOf(last.t);
    const snap = this.snapshots.find((s) => s.t >= week) ?? last;
    const spill = this.gains.filter((g) => g.t >= week && g.t < snap.t);
    return {
      snap,
      week: new Date(week).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      spill: spill.length ? { merits: spill.reduce((s, g) => s + g.real, 0), lines: spill.length } : null,
    };
  }

  /** Relevés de départ proposés : dernière séance, semaine Powerplay, depuis l'arrivée. */
  presets(weekStartOf) {
    const list = this.distinct();
    if (!this.snapshots.length) return {};
    const { snap: weekSnap } = this.weekStartSnapshot(weekStartOf);
    const joined = Date.parse(this.joinedAt);
    const first = Number.isFinite(joined) ? this.snapshots.find((s) => s.t >= joined) : this.snapshots[0];
    // Chaque choix renvoie au relevé de la liste (dernier de sa série) : mêmes valeurs, intervalle plus serré
    const inList = (snap) => list.find((d) => d.t >= snap.t).at;
    return {
      last: list.at(-2)?.at ?? null, // la série d'avant : la dernière séance qui a fait bouger un classement
      week: inList(weekSnap),
      all: inList(first ?? this.snapshots[0]),
    };
  }

  /** Écarts entre deux relevés (heures ISO) ; par défaut, la dernière séance qui a fait bouger un classement. */
  compare(fromAt, toAt, weekStartOf) {
    const presets = this.presets(weekStartOf);
    let to = this.find(toAt) ?? this.snapshots.at(-1) ?? null;
    let from = this.find(fromAt ?? presets.last) ?? null;
    if (from && to && from.t > to.t) [from, to] = [to, from];
    const rows = [];
    if (to) {
      for (const [key, value] of to.values) {
        const info = describeKey(key);
        const before = from ? from.values.get(key) ?? null : null;
        const delta = before !== null ? value - before : null;
        if (info.group !== 'classement' && !value && !delta) continue; // banque vide : rien à montrer
        rows.push({ key, ...info, from: before, to: value, delta });
      }
    }
    const order = [...LEADERBOARDS.keys()];
    const rank = (r) => (r.group === 'classement' ? 0 : r.group === 'banque' ? 1 : 2) * 100 + (order.includes(r.id) ? order.indexOf(r.id) : 50);
    rows.sort((a, b) => rank(a) - rank(b));
    // Recoupement Powerplay : mérites du journal entre les deux relevés
    const powerplay = rows.find((r) => r.id === 'powerplay' && r.group === 'classement');
    if (powerplay && from && to) {
      const inRange = this.gains.filter((g) => g.t >= from.t && g.t < to.t);
      powerplay.journal = {
        real: inRange.reduce((s, g) => s + g.real, 0),
        listed: inRange.reduce((s, g) => s + g.listed, 0),
        doubled: inRange.reduce((s, g) => s + g.doubled, 0),
        lines: inRange.length,
      };
    }
    const weekStart = this.weekStartSnapshot(weekStartOf);
    return {
      squadron: this.squadron,
      joinedAt: this.joinedAt,
      from: from?.at ?? null,
      to: to?.at ?? null,
      presets,
      // Passage de semaine Powerplay et séance à cheval dessus (voir weekStartSnapshot)
      week: weekStart ? { start: weekStart.week, spill: weekStart.spill } : null,
      snapshots: this.distinct().map((s) => s.at),
      count: this.snapshots.length,
      rows,
    };
  }

  /** Relevé exact à cette heure, sinon le dernier relevé avant elle. */
  find(at) {
    const t = Date.parse(at);
    if (!Number.isFinite(t)) return null;
    return this.snapshots.filter((s) => s.t <= t).at(-1) ?? null;
  }
}
