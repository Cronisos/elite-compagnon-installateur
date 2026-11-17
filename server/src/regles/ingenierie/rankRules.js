// Règles des rangs d'ingénieur, déclarées ici et nulle part ailleurs : le calcul (calc.js), la vue « Ce que tes
// journaux montrent » (ranks.js) et la future vigie des règles lisent cette table. Elle ne change jamais d'elle-même :
// une mesure qui la contredit est signalée dans la vue, et c'est l’auteur qui décide de la corriger.
//
// Vocabulaire : « rang » pour l'ingénieur (1 à 5), « grade » G1 à G5 pour la modification, « application » pour un jet.
//
// Chaque valeur porte son statut (comme les règles de l'escadron) :
//   - « mesurée »    : vérifiée dans les journaux de référence, nombre d'observations à l'appui ;
//   - « à vérifier » : déduite des mesures avec une hypothèse, ou mesurée moins de MEASURED_MIN fois (son motif,
//     why, le dit : le badge le montre au survol) ;
//   - « inconnue »   : rien ne permet de la chiffrer (le calcul le dit et prend le cas prudent).
//
// Mesures : journaux de référence du 24 oct. au 5 nov. 2026 (808 applications, jeu 4.4.2.1), toutes faites après la mise à
// jour 18.08 du 7 août 2024 qui a rendu les applications fixes (UPDATE_18_08 : l'annonce officielle de Frontier, qui
// porte le numéro, la date et la règle ; aussi, sans le numéro, « Each grade has a set number of spins depending on
// your rank with that engineer », https://steamcommunity.com/app/359320/discussions/0/4509877583652667355, lu le
// 8 nov. 2026). Aucune mesure n'est antérieure à 18.08 : rien ne compare l'avant et l'après.
//
// Progression de rang (colonne climb, report du surplus) : la SORTIE de la déduction de rankModel.js (hypothèses H1 à
// H6 écrites en tête de ce fichier) sur les séquences versionnées dans rankSequences.json, regénérées par
// scripts/regles/deduire-rangs.mjs. Un test refait la déduction et vérifie chaque chiffre ci-dessous : bornes basses
// arrondies vers le bas, hautes vers le haut, au dix-millième de %.
//
// Scénario prudent du calcul (prudentModel) : la montée n'est comptée que quand AUCUN modèle compatible avec ces
// séquences ne permet plus de rester sous le seuil (le pire cas des journaux de référence, à vérifier comme la colonne
// climb). Les bornes basses de la colonne climb, prises chacune à part, en demandent parfois une ou deux de plus.

import { readFileSync } from 'node:fs';
import { worstCaseModel } from './rankModel.js';

export const RULES_DATE = '2026-11-08';
export const JOURNAUX = 'journaux de référence, 24 oct.–5 nov. 2026 (808 applications, jeu 4.4.2.1)';
/**
 * Période de JOURNAUX (dates UTC des événements, bornes comprises) et son nombre d'applications : chaque compte
 * d'observations tiré des journaux se recompte sur cette période (ranks.test.js, avec les comptes jour par jour de
 * rankSequences.json ; scripts/regles/deduire-rangs.mjs les relit dans les vrais journaux).
 */
export const JOURNAUX_PERIOD = Object.freeze({ first: '2026-10-24', last: '2026-11-05', applications: 808 });

/**
 * La mise à jour qui a rendu les applications fixes : numéro, date et règle, tels que les écrit l'annonce officielle de
 * Frontier Developments (Steam, « Community Announcements »), lue le 9 nov. 2026 par l'API des actualités Steam (la page
 * de l'annonce ne s'affiche pas sans navigateur ; le forum Frontier et elitedangerous.com refusent la lecture, 403).
 */
export const UPDATE_18_08 = Object.freeze({
  name: '18.08',
  date: '2024-08-07',
  title: 'Elite Dangerous | Type-8 Update (18.08) | Wednesday 7th August 2024',
  author: 'Frontier Developments',
  quote: 'Updated engineer rolls to consistently give a fixed roll depending on the grade of the recipe and the commander rank with the engineer',
  url: 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=359320&count=6&maxlength=0&enddate=1723075200&feeds=steam_community_announcements',
  page: 'https://store.steampowered.com/news/app/359320/view/5963413728353422199',
  read: '2026-11-09',
});
export const SIGNALE = 'signalé par un joueur le 8 nov. 2026';
export const MODELE = 'déduit de 17 séquences (15 montées de rang) des journaux de référence (Tiana Fortune 28 oct., Lei Cheung, The Dweller et Selene Jean 1er nov., Broo Tarquin 2 et 5 nov.), hypothèses H1 à H6 de rankModel.js (points par grade, seuil par rang, surplus reporté en points, % entier tronqué), scripts/regles/deduire-rangs.mjs';
// Motif de la borne basse inconnue au rang 4, en mots de joueur (affiché au survol du badge « inconnue »). En termes
// du modèle : les points d'un G4 et le seuil du rang 4 n'apparaissent qu'au rang 4, et une borne basse de 0 pour les
// G1 à G3 reste compatible avec toutes les séquences (Selene Jean, 1er nov. : 2 G1, 3 G2, 4 G3 et 2 G4, où les G4 font
// presque 100 % à eux seuls) ; aucune séquence ne fixe donc la part d'un grade inférieur.
const NON_BORNEE = 'au rang 4, les G4 suffisent presque à expliquer chaque montée au rang 5 lue dans les journaux de référence : rien ne dit combien un G1, un G2 ou un G3 y fait monter le rang (peut-être presque rien)';

export const STATUS = Object.freeze({ MEASURED: 'mesurée', CHECK: 'à vérifier', UNKNOWN: 'inconnue' });
/** Observations à partir desquelles une valeur lue dans les journaux est dite « mesurée » (en dessous : « à vérifier »). */
export const MEASURED_MIN = 3;
/** Motif d'une progression de rang « à vérifier » (colonne climb, report du surplus) : déduite, avec des hypothèses. */
export const DEDUCED_WHY = 'déduite des montées de rang lues dans les journaux de référence, avec des hypothèses (rankModel.js)';
const ORDER = [STATUS.UNKNOWN, STATUS.CHECK, STATUS.MEASURED];

/** Le statut le plus faible d'une liste (inconnue < à vérifier < mesurée) ; mesurée si la liste est vide. */
export function weakest(...statuses) {
  const list = statuses.flat().filter(Boolean);
  if (!list.length) return STATUS.MEASURED;
  return ORDER[Math.min(...list.map((s) => Math.max(0, ORDER.indexOf(s))))];
}

/**
 * Tolérance des montées, en % du rang. Les bornes basses de la table sont atteintes (« 3 G1 suffisent »), les hautes
 * non (« moins de 50 % ») : le scénario prudent monte dès 100 − CLIMB_TOL %, le favorable seulement au-delà de
 * 100 + CLIMB_TOL %. Cela couvre l'arrondi de la table au dix-millième, sans changer aucun compte.
 */
export const CLIMB_TOL = 1e-3;

// « à vérifier » ici ne vient d'aucune hypothèse : la valeur est mesurée, mais trop peu de fois ; why le dit
const finish = (value, observations, extra = {}) => Object.freeze({
  value,
  status: observations >= MEASURED_MIN ? STATUS.MEASURED : STATUS.CHECK,
  source: JOURNAUX,
  observations,
  ...(observations < MEASURED_MIN ? { why: `mesurée ${observations} fois seulement (il en faut ${MEASURED_MIN} pour la dire mesurée), sans hypothèse` } : {}),
  ...extra,
});

/** Applications d'un seul grade pour un rang complet depuis 0 % : au moins (gain le plus haut), au plus (le plus bas). */
export function climbCounts(gainMin, gainMax) {
  return {
    min: gainMax > 0 ? Math.ceil((100 + CLIMB_TOL) / gainMax) : null,
    max: gainMin > 0 ? Math.ceil((100 - CLIMB_TOL) / gainMin) : null,
  };
}

// Progression de rang par application à l'atelier, en % du rang (fourchette), et ce qu'elle donne : nombre
// d'applications de ce seul grade pour un rang complet, depuis 0 % (max null : « au moins min »).
const climb = (min, max, sequences, why = null) => Object.freeze({
  gainMin: min,
  gainMax: max,
  ...climbCounts(min, max),
  status: why ? STATUS.UNKNOWN : STATUS.CHECK,
  source: MODELE,
  sequences,
  ...(why ? { why } : {}),
});

/**
 * Une ligne par rang d'ingénieur et par grade.
 *   finish : applications pour finir le grade (qualité 0 → 100 %), toujours g + 5 − rang (15 couples mesurés sur 15).
 *   climb  : progression de rang d'une application à l'atelier (gainMin–gainMax, % du rang) et applications de ce grade
 *            pour passer au rang suivant depuis 0 % (min–max) ; absent au rang 5.
 * Les applications au grade maximal du rang (grade = rang) font monter bien plus vite que celles en dessous
 * (aux rangs 2 et 3, de 2,8 à 4,7 fois moins par grade en dessous d'après ces fourchettes : déduit ; au rang 4, non
 * chiffré).
 */
export const RANK_TABLE = Object.freeze([
  { rank: 1, grade: 1, finish: finish(5, 9), climb: climb(33.3333, 49.9976, 3) },
  { rank: 2, grade: 1, finish: finish(4, 15), climb: climb(7.6923, 8.6615, 3) },
  { rank: 2, grade: 2, finish: finish(5, 6), climb: climb(28.9276, 36.063, 2) },
  { rank: 3, grade: 1, finish: finish(3, 22), climb: climb(2, 2.4517, 4) },
  { rank: 3, grade: 2, finish: finish(4, 15), climb: climb(8.4444, 9.2673, 5) },
  // Exemple de l’auteur : « au niveau 3, il faut faire 5 au lieu des 3 de base » pour finir le G3 ; mesuré 11 fois
  { rank: 3, grade: 3, finish: finish(5, 11, { also: SIGNALE }), climb: climb(26.6532, 39.2257, 3) },
  { rank: 4, grade: 1, finish: finish(2, 2), climb: climb(0, 0.8795, 1, NON_BORNEE) },
  { rank: 4, grade: 2, finish: finish(3, 5), climb: climb(0, 3.3198, 2, NON_BORNEE) },
  { rank: 4, grade: 3, finish: finish(4, 10), climb: climb(0, 9.5825, 4, NON_BORNEE) },
  { rank: 4, grade: 4, finish: finish(5, 14), climb: climb(28.9069, 50, 5) },
  // Rang 5 : la règle de 18.08 (1 application en G1… 5 en G5), mesurée des centaines de fois
  { rank: 5, grade: 1, finish: finish(1, 58), climb: null },
  { rank: 5, grade: 2, finish: finish(2, 107), climb: null },
  { rank: 5, grade: 3, finish: finish(3, 149), climb: null },
  { rank: 5, grade: 4, finish: finish(4, 146), climb: null },
  { rank: 5, grade: 5, finish: finish(5, 192), climb: null },
].map(Object.freeze));

/**
 * Report du surplus d'une montée (H3) : en points, donc en % du rang suivant au plus surplus × T_r / T_r+1. Au plus
 * (déduit) : le scénario favorable reporte ce maximum ; le prudent ne reporte rien.
 */
export const CARRY_RATIO = Object.freeze({ 1: 0.2599, 2: 0.3183, 3: 0.3596 });

const UNLOCK_RANK_SOURCE = `${JOURNAUX} : déblocages de Tiana Fortune 28 oct., Lei Cheung 1er nov., Broo Tarquin 2 nov.`;
const UNLOCK_PROGRESS_SOURCE = `${JOURNAUX} : Juri Ishmaak, rang 1 à 0 % aux 52 relevés, sans aucune application ; hypothèse H6 de rankModel.js`;
const UNLOCK_PROGRESS_WHY = 'le rang 1 au déblocage est lu dans les journaux de référence (3 déblocages sur 3), pas le 0 % : le déblocage n’écrit pas de progression. Appui : Juri Ishmaak, rang 1 à 0 % à chaque relevé, sans aucune application';

const rule = (value, status, source, observations = null, extra = {}) => Object.freeze({ value, status, source, observations, date: RULES_DATE, ...extra });

/** Règles générales des rangs (mêmes statuts). */
export const RANK_RULES = Object.freeze({
  // Le rang ne monte qu'à l'atelier de l'ingénieur : 5 applications de G3 faites à distance chez Broo Tarquin le 5 nov.
  // (Macmillan Terminal), sans montée alors que 3 suffisent à l'atelier ; aucun modèle ne s'accorde avec un gain à
  // distance. Le texte du jeu le dit aussi (« Using this workshop to craft blueprints means you will not gain
  // reputation with the associated engineer », cité dans https://steamcommunity.com/app/359320/discussions/0/2248931052745593271,
  // lu le 8 nov. 2026). La qualité, elle, progresse autant à distance (G3 au rang 3 : +20 %, 5 fois).
  REMOTE_RANK_GAIN: rule(0, STATUS.MEASURED, `${JOURNAUX} ; texte du jeu cité sur https://steamcommunity.com/app/359320/discussions/0/2248931052745593271`, 5),
  // Un ingénieur débloqué démarre au rang 1 : les 3 déblocages des journaux (Tiana Fortune 28 oct., Lei Cheung 1er nov.,
  // Broo Tarquin 2 nov. : « Unlocked », rang 1). Mesuré. Un ingénieur pas encore débloqué est compté ainsi dans le
  // calcul (« après déblocage »).
  UNLOCK_RANK: rule(1, STATUS.MEASURED, UNLOCK_RANK_SOURCE, 3),
  // … à 0 % : hypothèse H6 (rankModel.js), pas une lecture. Ces 3 événements de déblocage n'écrivent pas de
  // progression (aucun des 19 événements unitaires ne porte RankProgress) et aucun relevé ne tombe entre un déblocage
  // et la première application ; leurs 3 G1 jusqu'au rang 2 ne fixent pas le départ. Appui : Juri Ishmaak, rang 1 à
  // 0 % à chacun des 52 relevés de la période, sans aucune application (1 ingénieur ; les 10 relevés hors période,
  // du 23 oct. et des 6 au 8 nov., disent pareil).
  UNLOCK_PROGRESS: rule(0, STATUS.CHECK, UNLOCK_PROGRESS_SOURCE, 1, { why: UNLOCK_PROGRESS_WHY }),
  // Les deux ensemble : ce que le calcul compte pour un ingénieur pas encore débloqué (« après déblocage ») ; son
  // statut est le plus faible des deux
  UNLOCK_START: rule({ rank: 1, progress: 0 }, STATUS.CHECK, `rang 1 : ${UNLOCK_RANK_SOURCE} ; 0 % : ${UNLOCK_PROGRESS_SOURCE}`, null, { why: UNLOCK_PROGRESS_WHY }),
  // Le surplus d'une montée passe au rang suivant : sans ce report, aucune valeur n'explique les 17 séquences.
  // Sa conversion (au plus CARRY_RATIO) est déduite : le calcul prudent ne le compte pas.
  CARRY_OVER: rule(CARRY_RATIO, STATUS.CHECK, MODELE),
  // Le grade suivant ne s'applique qu'une fois le grade en cours à 100 % (195 passages sur 196 ; un à 99 %), sans saut
  // de grade ; une autre modification sur le module repart de G1 (ses grades sont perdus)
  NEXT_GRADE_AT_FULL: rule(true, STATUS.MEASURED, JOURNAUX, 196),
  NEW_BLUEPRINT_RESTARTS: rule(true, STATUS.MEASURED, JOURNAUX, 23),
  // Les applications sous le grade maximal du rang comptent aussi (Lei Cheung, 1er nov. : 12 applications de G1 au
  // rang 2 l'ont fait passer au rang 3), mais beaucoup moins (combien : colonne climb de la table, déduite)
  LOWER_GRADES_COUNT: rule(true, STATUS.MEASURED, `${JOURNAUX} ; Lei Cheung, 1er nov.`, 12),
  // Refaire un grade déjà à 100 % : jamais vu dans les journaux (pour monter, l’auteur a changé de modification et repris
  // au G1). Inconnu : le calcul prudent ne le suppose pas (montée sur un module neuf, depuis G1) ; seul le scénario
  // favorable le suppose possible.
  REROLL_FULL_GRADE: rule(null, STATUS.UNKNOWN, `${JOURNAUX} : 0 cas`),
  // Effet expérimental : sa part dans la montée est inconnue (comptée 0). Dans les journaux de référence, 31 des 32 effets ont
  // été posés chez un hôte au rang 5, et 1 chez Broo Tarquin au rang 3, sur une modification de The Dweller (R8 de
  // itineraryRules.js : le nom de l'application est l’auteur de la modification en place, pas l'atelier). Un gain de
  // rang se compterait chez l'hôte : la vigie le mesurera par hostName et hostRank de buildRankLog
  EXPERIMENTAL_RANK_GAIN: rule(null, STATUS.UNKNOWN, `${JOURNAUX} : 32 effets, 31 chez un hôte au rang 5, 1 chez Broo Tarquin au rang 3 (Muang, 5 nov., sur la modification de The Dweller) ; un éventuel gain de rang d'un effet se compterait chez l'hôte (l'ingénieur de la base où l'on est), mesuré par hostName et hostRank de buildRankLog`),
  // Progression du rang lue dans le journal : seulement au chargement de la partie (EngineerProgress complet,
  // RankProgress en % entier) ; une montée de rang est écrite sur le moment, sans progression. Comptes de la période
  // de JOURNAUX (JOURNAUX_PERIOD) ; les journaux du 23 oct. et des 6 au 8 nov. le confirment (10 relevés complets de
  // plus, aucun événement unitaire), hors de ce compte
  PROGRESS_AT_LOAD_ONLY: rule(true, STATUS.MEASURED, `${JOURNAUX} : 52 relevés complets, 19 événements unitaires sans RankProgress`, 71, { counts: Object.freeze({ full: 52, single: 19 }) }),
});

const BY_KEY = new Map(RANK_TABLE.map((r) => [`${r.rank}|${r.grade}`, r]));

/** Ligne de la table pour un rang et un grade (null hors table : grade au-dessus du rang, valeurs absurdes). */
export function rankRow(rank, grade) {
  return BY_KEY.get(`${rank}|${grade}`) || null;
}

/** Applications pour finir un grade au rang donné (rang 5 si inconnu). */
export function rollsFor(rank, grade) {
  return rankRow(rank, grade)?.finish.value ?? rankRow(5, grade)?.finish.value ?? grade;
}

/**
 * Progression de rang d'une application à l'atelier (% du rang) : scénario prudent (gain le plus bas) ou favorable
 * (le plus haut). 0 au rang 5, hors table, à distance, et pour un effet expérimental (inconnu, compté 0).
 */
export function rankGain(rank, grade, scenario = 'prudent') {
  const c = rankRow(rank, grade)?.climb;
  if (!c) return 0;
  return scenario === 'favorable' ? c.gainMax ?? 0 : c.gainMin;
}

let PRUDENT = null;
/**
 * Pire cas du modèle sur les séquences versionnées (rankSequences.json) : le scénario prudent du calcul. Construit au
 * premier usage. Séquences illisibles ou système infaisable : feasible false, et le calcul garde la table seule.
 */
export function prudentModel() {
  if (!PRUDENT) {
    try {
      PRUDENT = worstCaseModel(JSON.parse(readFileSync(new URL('./rankSequences.json', import.meta.url), 'utf8')).sequences);
    } catch {
      PRUDENT = { feasible: false, canStayBelow: () => true };
    }
  }
  return PRUDENT;
}

/** Le rang est-il atteint (progression en % du rang), selon le scénario (voir CLIMB_TOL). */
export function rankReached(progress, scenario = 'prudent') {
  return scenario === 'favorable' ? progress >= 100 + CLIMB_TOL : progress >= 100 - CLIMB_TOL;
}

/** Report du surplus au rang suivant, en % de ce rang : rien (prudent), au plus CARRY_RATIO (favorable). */
export function carryOver(overPercent, fromRank, scenario = 'prudent') {
  if (scenario !== 'favorable' || !(overPercent > 0)) return 0;
  return overPercent * (CARRY_RATIO[fromRank] ?? 0);
}

/**
 * Motifs des règles d'une ligne de la table utilisées qui ne sont pas mesurées : finir le grade, et la progression si
 * elle compte. [{ status, why }] ; vide si tout est mesuré. Le badge d'un ingénieur les donne au survol.
 * unknownMatters false : la part inconnue de la progression (borne basse non chiffrée) ne change aucun compte (le
 * calcul l'a vérifié en la faisant varier) : la progression reste déduite, « à vérifier », pas « inconnue ».
 */
export function rowReasons(rank, grade, { climbs = false, unknownMatters = true } = {}) {
  const row = rankRow(rank, grade);
  if (!row) return [{ status: STATUS.UNKNOWN, why: `G${grade} au rang ${rank} : hors de la table` }];
  const out = [];
  if (row.finish.status !== STATUS.MEASURED) out.push({ status: row.finish.status, why: `finir le G${grade} au rang ${rank} : ${row.finish.why}` });
  if (climbs && row.climb && row.climb.status !== STATUS.MEASURED) {
    if (row.climb.status === STATUS.UNKNOWN && !unknownMatters) out.push({ status: STATUS.CHECK, why: `progression de rang : ${DEDUCED_WHY}` });
    else out.push({ status: row.climb.status, why: row.climb.why || `progression de rang : ${DEDUCED_WHY}` });
  }
  return out;
}

/** Statut des règles d'une ligne de la table utilisées : finir le grade, et la progression si elle compte. */
export function rowStatus(rank, grade, opts = {}) {
  return weakest(rowReasons(rank, grade, opts).map((r) => r.status));
}
