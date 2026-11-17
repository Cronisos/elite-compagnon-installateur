// Rangs des ingénieurs lus dans le journal : état de chaque ingénieur (rang, progression) et mesures de chaque
// application (« Ce que tes journaux montrent »), comparées à la table des règles (rankRules.js).
//
// Ce que le journal donne (mesuré) :
//   - EngineerProgress complet (tableau Engineers) au chargement de la partie : Rank et RankProgress (% entier) ;
//   - EngineerProgress unitaire au déblocage et à chaque montée de rang : Rank seulement, sans RankProgress ;
//   - EngineerCraft à chaque application : grade (Level) et qualité obtenue (Quality), modification, module.
// La qualité d'avant vient de l'application précédente sur le même module, ou du dernier Loadout. Le lieu (atelier
// de l'ingénieur ou atelier à distance) vient de la station où l'on est amarré (MarketID du Docked ou du Location)
// comparée à la base de l'ingénieur (FDevIDs engineers.csv).
// Rien n'est écrit : tout est relu depuis le journal à chaque lancement, puis complété en direct.

import { rankRow, rankGain, rankReached, rollsFor, carryOver } from './rankRules.js';
import { dockOf } from './workshop.js';
import { CommanderTracker, shipKey } from '../../../core/commander.js';

/** Événements utiles en plus de ceux de la flotte : lieu de l'application. */
export const PLACE_EVENTS = ['Docked', 'Undocked', 'Location'];

const FULL = 0.99; // qualité vue comme complète (un passage au grade suivant mesuré à 99 %)
const TOL = 0.01;
const lower = (s) => String(s ?? '').toLowerCase();
const day = (iso) => (typeof iso === 'string' ? iso.slice(0, 10) : null);

// Valeurs que le jeu écrit (journaux de référence : 863 applications, Quality de 0,2 à 1, Level de 1 à 5, Engineer toujours
// un nom ; Rank de 1 à 5, RankProgress de 0 à 68). Une autre valeur (ligne retouchée, format que le jeu n'écrit pas)
// n'est pas une mesure : elle est mise à part (null, ou application illisible), jamais lue comme un écart.
const textOf = (v) => (typeof v === 'string' && v.trim() ? v : null);
const rankOf = (v) => (Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);
const gradeOf = rankOf; // grade d'une modification : 1 à 5
const percentOf = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null);
const qualityOf = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);

/**
 * Progression de rang d'une application lue (% du rang), dans le scénario donné : 0 à distance et pour un effet
 * expérimental (mesuré ; inconnu, compté 0) ; grade refait alors qu'il était déjà à 100 % : inconnu
 * (REROLL_FULL_GRADE), 0 au plus bas, le gain de la table au plus haut.
 */
const appGain = (rank, a, scenario) => {
  if (a.place === 'distance' || a.experimental) return 0;
  if (a.reroll && scenario === 'prudent') return 0;
  return rankGain(rank, a.grade, scenario);
};

/**
 * Relit les événements (ordre chronologique).
 *
 * Lieu d'une application (R8 de itineraryRules.js) : avec hostOf (données des ingénieurs lues), l'hôte est la base où
 * l'on est à quai (MarketID, ou nom de la station et système), et l'application est faite « à l'atelier » si cet hôte
 * est son auteur (Engineer / EngineerID : l'auteur de la modification en place), « à distance » sinon ; un effet
 * expérimental est toujours posé à l'atelier de l'hôte (« inconnu » hors d'une base reconnue). L'application reste
 * attribuée à son auteur pour les rangs. Sans hostOf (données des ingénieurs illisibles) : la règle d'avant, la station
 * comparée à l'atelier de l'auteur (workshopOf). Quand les MarketID concordent, les deux règles donnent le même lieu à
 * toute application sans effet.
 * @param {object[]} events événements de la flotte et du lieu
 * @param {{ workshopOf?: (name: string) => number|null, hostOf?: (dock) => ({ id, name, by }|null)|null,
 *   authorIdOf?: (ev) => number|null }} opts
 * @returns {{ engineers: Map, applications: object[], sequences: object[], unreadable: number, surveys: number }}
 *   unreadable : applications illisibles (nom d'ingénieur, grade ou qualité que le jeu n'écrit pas) : sans mesure ;
 *   surveys : relevés complets lus (EngineerProgress avec la liste des ingénieurs)
 */
export function buildRankLog(events, { workshopOf = () => null, hostOf = null, authorIdOf = null } = {}) {
  const engineers = new Map(); // nom → état
  const modules = new Map(); // vaisseau|emplacement → { item, bp, level, quality } (null : illisible)
  const applications = [];
  const sequences = [];
  let unreadable = 0;
  // Vaisseau actuel : (commandant, ShipID), un ShipID n'étant unique que pour un commandant (core/commander.js) : le
  // Loadout du n° 1 d'un second compte ne remplace pas les modules du n° 1 du compte principal
  let ship = null;
  const commanders = new CommanderTracker();
  let market = null;
  let dock = null; // dernier amarrage (dockOf), pour l'hôte des applications (R8)
  let surveys = 0;

  const engineer = (name) => {
    if (!engineers.has(name)) {
      engineers.set(name, { name, id: null, unlocked: false, progressLabel: null, rank: null, snapshot: null, since: [], rankUpsSince: 0, unreadableSince: 0, seq: null, lastShop: null, up: null });
    }
    return engineers.get(name);
  };
  const openSeq = (e, kind, at, progress = null) => {
    e.seq = { engineer: e.name, rank: e.rank, start: { kind, at, progress }, end: null, applications: [], unreadable: 0 };
  };
  const closeSeq = (e, end) => {
    if (e.seq && (e.seq.applications.length || e.seq.unreadable || end.kind === 'montée')) sequences.push({ ...e.seq, end });
    e.seq = null;
  };
  // Une base de progression (relevé, déblocage, montée) repart sans application ni application illisible
  const resetSince = (e) => {
    e.since = [];
    e.unreadableSince = 0;
  };

  for (const ev of events) {
    const who = commanders.see(ev);
    switch (ev.event) {
      case 'LoadGame':
        if (ev.ShipID != null) ship = shipKey(who, ev.ShipID);
        market = null;
        dock = null;
        break;
      case 'ShipyardSwap':
        ship = shipKey(who, ev.ShipID);
        break;
      case 'Loadout': {
        ship = shipKey(who, ev.ShipID);
        for (const k of [...modules.keys()]) if (k.startsWith(`${ship}|`)) modules.delete(k);
        for (const m of Array.isArray(ev.Modules) ? ev.Modules : []) {
          const g = m?.Engineering;
          if (g) modules.set(`${ship}|${lower(m.Slot)}`, { item: lower(m.Item), bp: lower(g.BlueprintName), level: gradeOf(g.Level), quality: qualityOf(g.Quality) });
        }
        break;
      }
      case 'Docked':
        market = ev.MarketID ?? null;
        dock = dockOf(ev);
        break;
      case 'Location':
        market = ev.Docked ? ev.MarketID ?? null : null;
        dock = ev.Docked ? dockOf(ev) : null;
        break;
      case 'Undocked':
        market = null;
        dock = null;
        break;
      case 'EngineerProgress': {
        const full = Array.isArray(ev.Engineers);
        if (full) surveys++;
        for (const x of full ? ev.Engineers : [ev]) {
          const name = textOf(x?.Engineer);
          if (!name) continue;
          const e = engineer(name);
          if (Number.isInteger(x.EngineerID)) e.id = x.EngineerID;
          if (textOf(x.Progress)) {
            e.progressLabel = x.Progress;
            e.unlocked = x.Progress === 'Unlocked';
          }
          // Rang de 1 à 5, progression de 0 à 100 % : une autre valeur n'est pas lue (rang ou progression inconnus)
          const rank = rankOf(x.Rank);
          if (full) {
            if (rank == null) continue;
            const rp = percentOf(x.RankProgress);
            if (e.rank === rank && e.seq) closeSeq(e, { kind: 'relevé', at: ev.timestamp, progress: rp });
            else if (e.seq) closeSeq(e, { kind: 'relevé', at: ev.timestamp, progress: rp, rank });
            e.rank = rank;
            e.snapshot = { at: ev.timestamp, progress: rp };
            resetSince(e);
            e.rankUpsSince = 0;
            e.up = null;
            if (rank < 5) openSeq(e, 'relevé', ev.timestamp, rp);
          } else if (rank != null && rank !== e.rank) {
            const unlock = x.Progress === 'Unlocked' && rank === 1 && e.rank == null;
            if (e.seq) closeSeq(e, { kind: 'montée', at: ev.timestamp, toRank: rank });
            // Base de l'estimation après la montée : son rang de départ et la dernière application qui l'a faite
            e.up = unlock ? null : { at: ev.timestamp, from: e.rank, to: rank, lastGrade: e.lastShop?.rank === e.rank ? e.lastShop.grade : null };
            e.rank = rank;
            e.rankUpsSince += unlock ? 0 : 1;
            resetSince(e);
            if (unlock) e.snapshot = { at: ev.timestamp, progress: 0, unlock: true };
            if (rank < 5) openSeq(e, unlock ? 'déblocage' : 'montée', ev.timestamp, unlock ? 0 : null);
          }
        }
        break;
      }
      case 'EngineerCraft': {
        const key = `${ship}|${lower(ev.Slot)}`;
        const before = modules.get(key);
        const sameBp = before && before.item === lower(ev.Module) && before.bp === lower(ev.BlueprintName);
        // Grade de 1 à 5 et qualité de 0 à 1 (null : illisible, le module garde un état inconnu, sans mesure)
        const grade = gradeOf(ev.Level);
        const quality = qualityOf(ev.Quality);
        const name = textOf(ev.Engineer);
        modules.set(key, { item: lower(ev.Module), bp: lower(ev.BlueprintName), level: grade, quality });
        // Sans nom d'ingénieur ni grade lisibles : ni mesure, ni place dans une montée ; la séquence de l'ingénieur ne
        // se vérifie plus (une application de grade inconnu peut l'avoir fait monter)
        if (!name || grade == null) {
          unreadable++;
          const e = name ? engineer(name) : null;
          if (e?.seq) e.seq.unreadable++;
          if (e && e.rank != null && e.rank < 5) e.unreadableSince++;
          break;
        }
        if (quality == null) unreadable++;
        const e = engineer(name);
        const experimental = !!ev.ApplyExperimentalEffect;
        // Grade refait alors qu'il était déjà à 100 % (même modification, même grade) : la règle REROLL_FULL_GRADE
        // (« inconnue », 0 cas dans les journaux de référence) ; ce n'est pas une mesure du pas de qualité
        const reroll = !experimental && !!sameBp && before.level === grade && before.quality != null && before.quality >= FULL;
        let from = null;
        if (!experimental && !reroll) {
          if (sameBp && before.level === grade) from = before.quality;
          else if (sameBp && before.level === grade - 1) from = 0;
          else if ((!sameBp || !before) && grade === 1) from = 0;
        }
        const step = from == null || quality == null ? null : +(quality - from).toFixed(4);
        let place;
        const host = hostOf && dock ? hostOf(dock) : null;
        if (hostOf) {
          if (experimental) place = host ? 'atelier' : 'inconnu';
          else if (!dock) place = 'inconnu';
          else {
            const author = authorIdOf ? authorIdOf(ev) : null;
            place = author == null ? 'inconnu' : host?.id === author ? 'atelier' : 'distance';
          }
        } else {
          const shop = workshopOf(name);
          place = market == null || shop == null ? 'inconnu' : Number(market) === Number(shop) ? 'atelier' : 'distance';
        }
        const rank = e.rank;
        const expected = rank != null && grade <= rank ? 1 / rollsFor(rank, grade) : null;
        const informative = step != null && expected != null && step > 0 && (quality < FULL || Math.abs(step - expected) < TOL);
        // Grade fini d'un coup avec un pas plus grand que la table : le vrai pas est au moins celui-là, il la contredit
        // (un pas plafonné plus petit que prévu, lui, ne mesure rien)
        const faster = !informative && step != null && expected != null && quality >= FULL && step > expected + TOL;
        const a = { at: ev.timestamp, engineer: name, rank, grade, quality, step, expected, informative, faster, reroll, unreadable: quality == null, place, experimental, blueprint: textOf(ev.BlueprintName) };
        // Champs internes (jamais rendus par rankView) : hôte et son rang à ce moment (R8 ; la vigie compte les effets
        // par hôte), auteur, module et emplacement, type de station
        a.engineerId = Number.isInteger(ev.EngineerID) ? ev.EngineerID : null;
        a.hostId = host?.id ?? null;
        a.hostName = host?.name ?? null;
        a.hostBy = host?.by ?? null;
        a.hostRank = host ? engineers.get(host.name)?.rank ?? null : null;
        a.module = lower(ev.Module);
        a.slot = textOf(ev.Slot);
        a.stationType = dock?.stationType ?? null;
        a.effect = textOf(ev.ApplyExperimentalEffect) || textOf(ev.ExperimentalEffect);
        applications.push(a);
        if (e.seq) e.seq.applications.push(a);
        if (rank != null && rank < 5) e.since.push(a);
        if (place !== 'distance' && !experimental) e.lastShop = a;
        break;
      }
      default:
        break;
    }
  }
  // Séquences en cours (rang < 5, depuis le dernier relevé ou la dernière montée)
  const open = [...engineers.values()].filter((e) => e.seq && (e.seq.applications.length || e.seq.unreadable)).map((e) => ({ ...e.seq, end: { kind: 'en cours' } }));
  return { engineers, applications, sequences: [...sequences, ...open], unreadable, surveys };
}

/**
 * Montée due d'après la table, sans montée écrite : depuis un départ sûr (relevé, 0 au déblocage ou après une montée)
 * et les applications faites depuis, au même rang. Seules comptent les applications SÛREMENT faites à l'atelier (lieu
 * connu ; ni à distance, ni effet expérimental), au gain le plus bas de la table : c'est le moins que le rang ait pu
 * gagner. Le jeu écrit une montée dans la seconde qui suit l'application qui la fait (15 montées sur 15 dans les
 * journaux de référence : 0 à 1 s, seul un ShipLocker entre les deux).
 * @returns {{ overdueAt: number|null, due: boolean, before: number, all: number }}
 *   overdueAt : numéro (1, 2…) de l'application à laquelle la table prévoyait la montée au plus tard, quand une autre
 *   l'a suivie : la montée aurait dû s'écrire, c'est un écart ; due : prévue à la dernière application (elle peut être
 *   en train de s'écrire : pas encore un écart) ; before / all : progression la plus basse avant la dernière
 *   application / après toutes (% du rang)
 */
export function climbDue(rank, start, applications) {
  const out = { overdueAt: null, due: false, before: start, all: start };
  if (!rankRow(rank, rank)?.climb) return out;
  let p = start;
  applications.forEach((a, i) => {
    if (a.place === 'atelier') p += appGain(rank, a, 'prudent');
    if (i < applications.length - 1) out.before = p;
    if (out.overdueAt == null && !out.due && rankReached(p, 'prudent')) {
      if (i < applications.length - 1) out.overdueAt = i + 1;
      else out.due = true;
    }
  });
  out.all = p;
  return out;
}

/**
 * Progression actuelle du rang d'un ingénieur, en % : depuis sa base (dernier relevé au chargement de la partie,
 * déblocage, ou dernière montée), plus les applications à l'atelier faites depuis (gains de la table, scénarios
 * prudent et favorable). Après une montée sans nouveau relevé, le report du surplus n'est pas connu : 0 en prudent,
 * au plus CARRY_RATIO × gain de la dernière application en favorable. Rang connu sans aucune progression lue : 0 à
 * 99,99 %.
 * Quand la table prévoyait déjà la montée et qu'elle n'est pas écrite (climbDue : écart), l'estimation ne tient plus :
 * « contredit », de la base à 99,99 % (le prudent repart de la base), et expectedMin dit ce que la table prévoyait.
 * Montée prévue à la dernière application (due) : l'estimation reste, plafonnée sous 100 %.
 * @returns {{ min: number, max: number, known: 'relevé'|'estimé'|'inconnu'|'contredit', at: string|null,
 *   applicationsSince: number, due?: boolean, expectedMin?: number,
 *   basis: { kind: 'relevé'|'déblocage'|'montée', at: string|null, rank: number, from?: number }|null }}
 */
export function currentProgress(e) {
  if (!e || e.rank == null) return { min: 0, max: 0, known: 'inconnu', at: null, applicationsSince: 0, basis: null };
  if (e.rank >= 5) return { min: 0, max: 0, known: 'relevé', at: e.snapshot?.at || null, applicationsSince: 0, basis: { kind: 'relevé', at: e.snapshot?.at || null, rank: 5 } };
  let basis = null;
  let min = 0;
  let max = 99.99;
  if (e.rankUpsSince === 0 && e.snapshot?.progress != null) {
    basis = { kind: e.snapshot.unlock ? 'déblocage' : 'relevé', at: e.snapshot.at, rank: e.rank };
    min = e.snapshot.progress;
    max = e.snapshot.progress + 0.99;
  } else if (e.rankUpsSince > 0 && e.up?.from != null) {
    basis = { kind: 'montée', at: e.up.at, rank: e.rank, from: e.up.from };
    // Surplus de la montée : moins que le gain de la dernière application (grade max du rang d'avant si inconnue)
    max = carryOver(rankGain(e.up.from, e.up.lastGrade ?? e.up.from, 'favorable'), e.up.from, 'favorable');
  }
  const start = min;
  const since = e.since.filter((a) => a.rank === e.rank);
  const due = climbDue(e.rank, start, since);
  if (due.overdueAt != null) {
    return { min: start, max: 99.99, known: 'contredit', expectedMin: due.all, at: e.snapshot?.at || null, applicationsSince: e.since.length, basis };
  }
  const shop = since.filter((a) => a.place !== 'distance' && !a.experimental);
  for (const a of shop) {
    min += appGain(a.rank, a, 'prudent');
    max += appGain(a.rank, a, 'favorable');
  }
  // Application illisible depuis la base (grade que le jeu n'écrit pas) : elle a pu faire monter le rang d'autant
  // qu'un grade max ; le plus haut n'est plus borné
  if (e.unreadableSince) max = 99.99;
  min = Math.min(min, 99.9);
  max = Math.min(Math.max(max, min), 99.99);
  const known = !basis ? (shop.length || e.unreadableSince ? 'estimé' : 'inconnu') : basis.kind === 'montée' || e.since.length || e.unreadableSince ? 'estimé' : 'relevé';
  return { min, max, known, at: e.snapshot?.at || null, applicationsSince: e.since.length, basis, ...(due.due ? { due: true } : {}) };
}

/**
 * Pour le pire cas du modèle (calcul prudent, rankModel.worstCaseModel) : départ sûr au rang actuel (% du dernier
 * relevé ; 0 au déblocage ou après une montée) et applications faites depuis à ce rang, par grade (counts[g]) : les
 * mêmes que la progression la plus basse de currentProgress. Écart avec la table (« contredit ») : le départ seul,
 * comme le prudent. null au rang 5 ou inconnu.
 * @returns {{ from: number, counts: number[] }|null}
 */
export function climbBasis(e, progress = currentProgress(e)) {
  if (!e || e.rank == null || e.rank >= 5) return null;
  const from = e.rankUpsSince === 0 && e.snapshot?.progress != null ? e.snapshot.progress : 0;
  const counts = [0, 0, 0, 0, 0, 0];
  if (progress.known !== 'contredit') {
    // Un grade refait (inconnu) n'est pas compté : le pire cas suppose qu'il n'a rien fait monter
    for (const a of e.since) if (a.rank === e.rank && a.place !== 'distance' && !a.experimental && !a.reroll && a.grade >= 1 && a.grade <= 5) counts[a.grade]++;
  }
  return { from, counts };
}

/** État des ingénieurs pour le calcul : nom → { id, progress, rank, rankProgress, climbBasis }. */
export function engineerStates(log) {
  const out = new Map();
  for (const e of log.engineers.values()) {
    const rankProgress = currentProgress(e);
    out.set(e.name, { id: e.id, progress: e.progressLabel, rank: e.rank, rankProgress, climbBasis: climbBasis(e, rankProgress) });
  }
  return out;
}

const ordinal = (n) => (n === 1 ? '1re' : `${n}e`);

/**
 * Vérifie une séquence contre la table : la montée (ou le relevé de fin) doit être atteignable avec les gains de la
 * table. Départ : 0 au déblocage, intervalle du relevé, ou de 0 au report le plus grand (CARRY_RATIO) après une montée.
 * Le moins gagné ne compte que les applications sûrement faites à l'atelier ; le plus gagné compte aussi celles au lieu
 * inconnu. Séquence en cours (sans montée écrite) : écart si la table prévoyait la montée avant la dernière
 * application (climbDue) ; prévue à la dernière : pas encore d'écart, une note.
 * @returns {{ ok: boolean, message: string|null, note?: string, shop: number, remote: number }}
 */
export function checkSequence(seq, previous = null) {
  const shop = seq.applications.filter((a) => a.place !== 'distance' && !a.experimental);
  // Application illisible (grade que le jeu n'écrit pas) : elle a pu tout changer, la séquence ne se vérifie pas
  if (seq.unreadable) {
    const n = seq.unreadable;
    return { ok: true, message: null, note: `${n} ${n === 1 ? 'application illisible' : 'applications illisibles'} (valeur que le jeu n’écrit pas) : séquence non vérifiée`, shop: shop.length, remote: seq.applications.filter((a) => a.place === 'distance').length };
  }
  const gains = (s) => seq.applications.map((a) => (s === 'prudent' && a.place !== 'atelier' ? 0 : appGain(seq.rank, a, s)));
  const gMin = gains('prudent');
  const gMax = gains('favorable');
  const sum = (g) => g.reduce((x, y) => x + y, 0);
  let s0 = 0;
  let s1 = 0;
  if (seq.start.kind === 'relevé') {
    s0 = seq.start.progress ?? 0;
    s1 = seq.start.progress != null ? seq.start.progress + 0.99 : 99.99;
  } else if (seq.start.kind === 'montée') {
    // Report : moins que le gain de la dernière application du rang d'avant (grade max de ce rang si elle n'est pas
    // connue), converti au plus par CARRY_RATIO (déduit)
    const from = previous?.rank ?? seq.rank - 1;
    const last = previous?.unreadable ? null : previous?.applications.filter((a) => a.place !== 'distance' && !a.experimental).at(-1);
    s1 = carryOver(rankGain(from, last ? last.grade : from, 'favorable'), from, 'favorable');
  }
  const out = { ok: true, message: null, shop: shop.length, remote: seq.applications.filter((a) => a.place === 'distance').length };
  if (!rankRow(seq.rank, seq.rank)?.climb) return out;
  if (seq.end.kind === 'montée') {
    const beforeMin = sum(gMin.slice(0, -1));
    if (s1 + sum(gMax) < 100 - 1e-9) {
      out.ok = false;
      out.message = `montée plus tôt que la table ne le permet (au plus ${Math.round(s1 + sum(gMax))} % prévus)`;
    } else if (rankReached(s0 + beforeMin, 'prudent')) {
      out.ok = false;
      out.message = `montée plus tard que prévu (au moins ${Math.round(s0 + beforeMin)} % avant la dernière application)`;
    }
  } else if (seq.end.kind === 'en cours') {
    const d = climbDue(seq.rank, s0, seq.applications);
    if (d.overdueAt != null) {
      out.ok = false;
      out.message = `pas de montée écrite alors que la table la prévoit au plus tard à la ${ordinal(d.overdueAt)} application (au moins ${Math.floor(d.before)} % avant la dernière)`;
    } else if (d.due) out.note = 'la table prévoit la montée à la dernière application : le jeu l’écrit d’habitude dans la seconde';
  } else if (seq.end.kind === 'relevé' && seq.end.progress != null && seq.end.rank == null) {
    const lo = s0 + sum(gMin);
    const hi = s1 + sum(gMax);
    if (seq.end.progress + 0.99 < lo - 1e-9 || seq.end.progress > hi + 1e-9) {
      out.ok = false;
      out.message = `relevé à ${seq.end.progress} % alors que la table prévoit ${Math.floor(lo)} à ${Math.floor(hi)} %`;
    }
  }
  return out;
}

/**
 * Vue « Ce que tes journaux montrent » : mesures par rang et par grade, séquences de montée, écarts avec la table.
 */
export function rankView(log) {
  const cells = new Map();
  const contradictions = [];
  // Grades refaits alors qu'ils étaient déjà à 100 % : la table dit « inconnue » (REROLL_FULL_GRADE, 0 cas) ; chaque
  // cas vu est la mesure qui la tranchera, à relire (la table ne change pas d'elle-même)
  const rerolls = [];
  for (const a of log.applications) {
    if (a.reroll) {
      rerolls.push({ at: a.at, engineer: a.engineer, rank: a.rank, grade: a.grade, place: a.place, blueprint: a.blueprint });
      contradictions.push({ kind: 'règle', at: a.at, engineer: a.engineer, rank: a.rank, grade: a.grade, message: `G${a.grade} refait alors qu'il était déjà à 100 % : la table dit encore « inconnue » pour refaire un grade déjà fini (0 cas dans les journaux de référence) ; à relire, et à corriger dans la table si le jeu l'a bien accepté` });
    }
    if (a.experimental || a.rank == null || !a.grade || a.grade > a.rank) continue;
    const k = `${a.rank}|${a.grade}`;
    if (!cells.has(k)) cells.set(k, { rank: a.rank, grade: a.grade, applications: 0, informative: 0, steps: new Map(), places: { atelier: 0, distance: 0, inconnu: 0 }, first: null, last: null, engineers: new Set(), contradictions: 0, faster: 0, rerolls: 0 });
    const c = cells.get(k);
    c.applications++;
    c.places[a.place]++;
    c.engineers.add(a.engineer);
    c.first ??= a.at;
    c.last = a.at;
    if (a.reroll) c.rerolls++;
    if (a.faster) {
      c.contradictions++;
      c.faster++;
      contradictions.push({ kind: 'qualité', at: a.at, engineer: a.engineer, rank: a.rank, grade: a.grade, message: `grade fini d'un coup : au moins +${Math.round(a.step * 100)} % de qualité au lieu de +${Math.round(a.expected * 100)} %` });
    }
    if (!a.informative) continue;
    c.informative++;
    const s = a.step.toFixed(2);
    c.steps.set(s, (c.steps.get(s) || 0) + 1);
    if (Math.abs(a.step - a.expected) >= TOL) {
      c.contradictions++;
      contradictions.push({ kind: 'qualité', at: a.at, engineer: a.engineer, rank: a.rank, grade: a.grade, message: `+${Math.round(a.step * 100)} % de qualité au lieu de +${Math.round(a.expected * 100)} %` });
    }
  }
  const measures = [...cells.values()].sort((x, y) => x.rank - y.rank || x.grade - y.grade).map((c) => {
    const steps = [...c.steps].sort((x, y) => y[1] - x[1]);
    const step = steps[0] ? Number(steps[0][0]) : null;
    return {
      rank: c.rank,
      grade: c.grade,
      maxGrade: c.grade === c.rank,
      applications: c.applications,
      informative: c.informative,
      step,
      rolls: step ? Math.round(1 / step) : null,
      steps: steps.map(([s, n]) => ({ step: Number(s), count: n })),
      places: c.places,
      first: day(c.first),
      last: day(c.last),
      engineers: [...c.engineers].sort(),
      contradictions: c.contradictions,
      faster: c.faster,
      rerolls: c.rerolls,
    };
  });

  const byEngineer = new Map();
  const sequences = log.sequences.map((seq) => {
    const prev = byEngineer.get(seq.engineer) || null;
    byEngineer.set(seq.engineer, seq);
    const check = checkSequence(seq, prev?.end?.kind === 'montée' ? prev : null);
    if (!check.ok) contradictions.push({ kind: 'rang', at: seq.end.at ?? seq.applications.at(-1)?.at ?? null, engineer: seq.engineer, rank: seq.rank, message: check.message });
    const grades = {};
    for (const a of seq.applications) {
      const g = (grades[a.grade] ||= { grade: a.grade, atelier: 0, distance: 0, inconnu: 0, experimental: 0 });
      if (a.experimental) g.experimental++;
      else g[a.place]++;
    }
    return {
      engineer: seq.engineer,
      rank: seq.rank,
      start: seq.start,
      end: seq.end,
      applications: seq.applications.length,
      grades: Object.values(grades).sort((x, y) => x.grade - y.grade),
      order: seq.applications.map((a) => ({ grade: a.grade, place: a.place, experimental: a.experimental, step: a.step, ...(a.reroll ? { reroll: true } : {}) })),
      ok: check.ok,
      message: check.message,
      ...(check.note ? { note: check.note } : {}),
      ...(seq.unreadable ? { unreadable: seq.unreadable } : {}),
    };
  });

  // Montées lues dans tes journaux, par rang : les séquences fermées par une montée, regroupées quand elles ont le même
  // départ et les mêmes applications (« 3 G1 depuis le déblocage, 2 fois ») ; à côté de la table, en direct
  const climbGroups = new Map();
  for (const s of sequences) {
    if (s.end.kind !== 'montée') continue;
    const comp = s.grades.map((g) => `${g.grade}:${g.atelier}:${g.distance}:${g.inconnu}:${g.experimental}`).join(';');
    const key = `${s.rank}|${s.start.kind}|${s.start.kind === 'relevé' ? s.start.progress : ''}|${comp}|${s.unreadable || 0}`;
    const g = climbGroups.get(key) || { rank: s.rank, toRank: s.end.toRank, start: { kind: s.start.kind, progress: s.start.kind === 'relevé' ? s.start.progress : null }, grades: s.grades, applications: s.applications, unreadable: s.unreadable || 0, count: 0, ok: true, engineers: new Set(), last: null };
    g.count++;
    g.ok &&= s.ok;
    g.engineers.add(s.engineer);
    if (!g.last || String(s.end.at) > String(g.last)) g.last = s.end.at ?? null;
    climbGroups.set(key, g);
  }
  const climbs = [...climbGroups.values()]
    .map((g) => ({ ...g, engineers: [...g.engineers].sort(), last: day(g.last) }))
    .sort((x, y) => x.rank - y.rank || y.count - x.count || x.applications - y.applications);

  const engineers = [...log.engineers.values()]
    .filter((e) => e.unlocked && e.rank != null)
    .map((e) => ({ name: e.name, rank: e.rank, snapshot: e.snapshot, progress: currentProgress(e) }))
    .sort((x, y) => x.rank - y.rank || x.name.localeCompare(y.name));

  return {
    measures,
    sequences: sequences.reverse(), // la plus récente d'abord
    climbs,
    rerolls: rerolls.reverse(), // le plus récent d'abord
    contradictions: contradictions.sort((x, y) => String(y.at).localeCompare(String(x.at))),
    engineers,
    applications: log.applications.length,
    // Applications illisibles (valeurs que le jeu n'écrit pas) : sans mesure, comptées à part
    unreadable: log.unreadable || 0,
    period: { first: day(log.applications[0]?.at), last: day(log.applications.at(-1)?.at) },
  };
}
