// Règles de l'itinéraire d'ingénierie et de la fiche « Chez l'ingénieur », déclarées ici et nulle part ailleurs : le
// calcul (route.js, pins.js, workshop.js), l'API (GET /route/rules) et la future vigie des règles lisent cette table.
// Elle ne change jamais d'elle-même : une observation qui la contredit est signalée, et c'est l’auteur qui décide.
//
// Statuts (du plus faible au plus fort) : « inconnue » < « à vérifier » < « publiée » < « mesurée ».
//   - mesurée    : vue dans les journaux de référence, au moins MEASURED_MIN fois (observations à l'appui) ;
//   - publiée    : écrite par une source publique (wiki, données coriolis), pas encore vue dans les journaux de référence ;
//   - à vérifier : vue moins de MEASURED_MIN fois, témoignage, hypothèse de l'app ou dite par l’auteur ;
//   - inconnue   : rien ne permet de la trancher (l'app prend le cas prudent).
// Les règles de l'app (kind « app ») et les réglages (kind « réglage ») sont des choix : ils n'ont pas de statut.
//
// R1, R4b et R7a ne sont PAS recopiées : elles renvoient à la table des rangs (rankRules.js), seule source de ces
// valeurs ; leur statut et leurs observations sont lus là-bas.
//
// `check` dit à la future vigie ce qu'il faut regarder dans le journal pour confirmer ou contredire la règle.
// Une phrase tirée des observations parle des « journaux de référence » (jamais de « tes journaux » : l'app est distribuée
// à l'escadron, et ces mesures ne viennent pas des journaux de celui qui regarde).

import { STATUS as RANK_STATUS, MEASURED_MIN, SIGNALE, RANK_RULES, JOURNAUX_PERIOD } from './rankRules.js';

export const STATUS = Object.freeze({ ...RANK_STATUS, PUBLISHED: 'publiée' });
export { MEASURED_MIN, SIGNALE };
export const ITINERARY_DATE = '2026-11-09';
export const ITINERARY_PERIOD = Object.freeze({ first: '2026-10-23', last: '2026-11-09', files: 52 });
export const JOURNAUX_ITIN = 'journaux de référence, 23 oct.–9 nov. 2026 (52 fichiers, jeu 4.4.2.1)';

const ORDER = [STATUS.UNKNOWN, STATUS.CHECK, STATUS.PUBLISHED, STATUS.MEASURED];

/** Le statut le plus faible d'une liste : inconnue < à vérifier < publiée < mesurée ; mesurée si la liste est vide. */
export function weakestRule(...statuses) {
  const list = statuses.flat().filter(Boolean);
  if (!list.length) return STATUS.MEASURED;
  return ORDER[Math.min(...list.map((s) => Math.max(0, ORDER.indexOf(s))))];
}

// Sources publiques (lues par l'API MediaWiki du wiki Fandom, qui renvoie 402/403 aux pages web)
const WIKI = (title) => `https://elite-dangerous.fandom.com/api.php?action=query&prop=revisions&redirects=1&rvprop=content|timestamp&rvslots=main&format=json&titles=${title}`;
export const SOURCES = Object.freeze({
  'W-RW': `Wiki Fandom, page « Remote Workshop » (révision du 9 oct. 2026) : ${WIKI('Remote_Workshop')}`,
  'W-ENG': `Wiki Fandom, page « Engineers », sections Crafting et Engineering rebalance (révision du 9 oct. 2026) : ${WIKI('Engineers')}`,
  'W-EXP': `Wiki Fandom, page « Experimental Effect » (révision du 13 août 2025) : ${WIKI('Experimental_Effect')}`,
  'S-2018': 'Forum Steam, « Engineers for dummies », 23 mai 2018 : https://steamcommunity.com/app/359320/discussions/0/1694922345925816734/',
  'W-ENGR': `Wiki Fandom, pages de chaque ingénieur et tableau « Ship Engineers » de la page Engineers (révision du 9 oct. 2026) : ${WIKI('Engineers')} (adresses de chaque fiche dans data/engineers.json, champ sources)`,
  COR: 'coriolis-data figé dans server/src/core/reference/download.js (ships/*.json, modules, modifications/modules.json), lu par refdata.js (shipSlots, modulesForSlot)',
  JOURNAL_MANUAL: 'Manuel du journal du jeu (Frontier, « Journal Manual », événement EngineerProgress : Progress = Invited, Acquainted, Unlocked ou Barred)',
});

const RANKS_FILE = 'rankRules.js';

/** Une ligne de la table. */
const rule = (id, kind, text, { value = null, status = null, basis = [], source = null, observations = null, also = null, why = null, check = null, ref = null } = {}) => Object.freeze({
  id,
  kind,
  text,
  value,
  ...(kind === 'jeu' || kind === 'jeu + app' ? { status } : {}),
  basis: Object.freeze([...basis]),
  source,
  observations,
  ...(also ? { also } : {}),
  ...(why ? { why } : {}),
  ...(ref ? { ref: Object.freeze(ref) } : {}),
  date: ITINERARY_DATE,
  check,
});

/** Renvoi vers une règle de rankRules.js : statut et observations lus là-bas, jamais recopiés. */
const fromRanks = (key) => RANK_RULES[key];

export const ITINERARY_RULES = Object.freeze([
  rule('R1', 'jeu', 'Applications pour finir le grade g au rang r de l’ingénieur : g + 5 − r (au rang 5 : 1 en G1… 5 en G5).', {
    status: STATUS.MEASURED,
    basis: ['journaux'],
    source: `renvoi : table des rangs (${RANKS_FILE}, RANK_TABLE et rollsFor)`,
    observations: JOURNAUX_PERIOD.applications,
    ref: { file: RANKS_FILE, key: 'RANK_TABLE', fn: 'rollsFor' },
    check: 'EngineerCraft : qualité gagnée par application, par rang et par grade (déjà relevée par l’onglet « Rangs des ingénieurs »)',
  }),
  rule('R2a', 'jeu', 'Un seul plan épinglé par ingénieur.', {
    status: STATUS.PUBLISHED, basis: ['wiki'], source: SOURCES['W-RW'], observations: 0,
    why: 'écrit par le wiki (« One blueprint can be pinned per Engineer ») ; le jeu n’écrit aucun épinglage dans le journal',
    check: 'aucun événement à lire : deux plans différents faits à distance chez le même ingénieur le contrediraient',
  }),
  rule('R2b', 'jeu', 'On épingle un plan à l’atelier de l’ingénieur, qui doit être débloqué.', {
    status: STATUS.PUBLISHED, basis: ['wiki'], source: SOURCES['W-RW'], observations: 0,
    why: 'écrit par le wiki ; le jeu n’écrit pas l’épinglage',
    check: 'une application à distance chez un ingénieur jamais débloqué la contredirait',
  }),
  rule('R2c', 'jeu', 'Le rang 5 n’est pas exigé pour épingler.', {
    status: STATUS.CHECK, basis: ['journaux'], source: `${JOURNAUX_ITIN} : Broo Tarquin, plan utilisé à distance alors qu’il était au rang 3 (5 nov.)`, observations: 1,
    why: 'vu une seule fois (il en faut 3)',
    check: 'EngineerCraft à distance chez un ingénieur sous le rang 5',
  }),
  rule('R2d', 'jeu', 'Épingler un autre plan chez le même ingénieur remplace le premier.', {
    status: STATUS.CHECK, basis: ['témoignage'], source: SOURCES['S-2018'], observations: 0,
    why: 'témoignage d’un joueur (« you can change the pinned blueprint any time by revisiting the engineer ») ; le jeu n’écrit pas l’épinglage',
    check: 'deux plans différents faits à distance chez le même ingénieur, à des dates différentes',
  }),
  rule('R3a', 'jeu', 'Atelier à distance : depuis toute station qui propose le service « engineer », sauf les installations au sol d’Odyssey.', {
    status: STATUS.MEASURED, basis: ['journaux', 'wiki'], source: `${JOURNAUX_ITIN} : 208 applications à distance (Coriolis 74, Orbis 72, Outpost 50, Dodec 12) ; installations au sol (SurfaceStation) : 13 amarrages, aucune avec ce service ; ${SOURCES['W-RW']}`, observations: 208,
    check: 'Docked : StationType, StationServices ; puis EngineerCraft sans ApplyExperimentalEffect, à quai hors base',
  }),
  rule('R3b', 'jeu', 'Atelier à distance aussi depuis un porte-vaisseaux.', {
    status: STATUS.PUBLISHED, basis: ['wiki'], source: `${SOURCES['W-RW']} (« any station or Drake-Class Carrier ») ; les porte-vaisseaux des journaux de référence ont bien le service « engineer »`, observations: 0,
    why: 'écrit par le wiki ; aucune application à distance depuis un porte-vaisseaux dans les journaux de référence',
    check: 'EngineerCraft sans effet, à quai à un Docked de StationType FleetCarrier',
  }),
  rule('R3c', 'jeu', 'Grade possible à distance : le grade que le rang actuel de l’ingénieur ouvre, dans la limite de son grade maximal pour ce plan.', {
    status: STATUS.MEASURED, basis: ['journaux'], source: `${JOURNAUX_ITIN} : 208 applications à distance, aucune au-dessus du rang (Broo Tarquin au rang 3 : G3)`, observations: 208,
    check: 'EngineerCraft à distance : Level ≤ rang de l’ingénieur (dernier EngineerProgress) et ≤ son grade maximal pour ce plan',
  }),
  rule('R3d', 'jeu', 'À distance, il faut autant d’applications qu’à l’atelier.', {
    status: STATUS.MEASURED, basis: ['journaux'], source: `${JOURNAUX_ITIN} : qualité gagnée à distance conforme à la table, au rang 5 et au rang 3`, observations: 208,
    check: 'EngineerCraft à distance : qualité gagnée par application = 1 / (g + 5 − r)',
  }),
  rule('R3e', 'jeu', 'Une épingle vaut pour tous les modules du même type, toutes tailles (le même groupe de modules).', {
    status: STATUS.MEASURED, basis: ['journaux'], source: `${JOURNAUX_ITIN} : épingles de 7 ingénieurs ; même BlueprintID pour le FSD et le FSD SCO (FSD_LongRange G1 128673690)`, observations: 7,
    check: 'EngineerCraft à distance du même plan sur des modules de tailles différentes',
  }),
  rule('R3f', 'jeu', 'Pour un autre type de module (autre arme, bouclier bi-tissé ou prismatique), l’épingle n’est pas comptée.', {
    status: STATUS.UNKNOWN, basis: ['journaux'], source: `${JOURNAUX_ITIN} : Weapon_LightWeight G1 a un BlueprintID différent sur un multicanon (128673490) et sur un laser à rayon (128673330)`, observations: 0,
    why: 'aucune donnée sur les boucliers ; pour les armes, les BlueprintID diffèrent : l’app ne compte pas l’épingle hors de son type',
    check: 'EngineerCraft à distance du plan épinglé sur un module d’un autre groupe',
  }),
  rule('R3g', 'app', '« Faisable ici » : à quai dans ton vaisseau, ni en taxi ni dans l’équipage d’un autre joueur ; à pied, il faut remonter à bord.', {
    basis: ['journaux', 'app'], source: `${JOURNAUX_ITIN} : champs Taxi et Multicrew présents dans les 310 Docked relus`, observations: 310,
    check: 'Docked : Taxi, Multicrew ; Disembark / Embark',
  }),
  rule('R4a', 'jeu', 'Aucun effet expérimental à distance : il faut un atelier d’ingénieur.', {
    status: STATUS.MEASURED, basis: ['journaux', 'wiki'], source: `${JOURNAUX_ITIN} : 32 effets sur 32 posés dans une base d’ingénieur ; ${SOURCES['W-RW']} ; ${SOURCES['W-EXP']}`, observations: 32,
    check: 'EngineerCraft avec ApplyExperimentalEffect : à quai dans une base d’ingénieur (MarketID)',
  }),
  rule('R4b', 'jeu', 'Aucune montée de rang à distance.', {
    status: fromRanks('REMOTE_RANK_GAIN').status,
    basis: ['journaux', 'wiki'],
    source: `renvoi : ${RANKS_FILE}, RANK_RULES.REMOTE_RANK_GAIN`,
    observations: fromRanks('REMOTE_RANK_GAIN').observations,
    ref: { file: RANKS_FILE, key: 'RANK_RULES.REMOTE_RANK_GAIN' },
    check: 'EngineerProgress : aucun changement de rang après des applications à distance',
  }),
  rule('R5a', 'jeu', 'Un ingénieur qui ne monte pas ce plan jusqu’au G5 peut poser l’effet sur un module de ce plan, dans la limite de son grade maximal.', {
    status: STATUS.MEASURED, basis: ['journaux'], source: `${JOURNAUX_ITIN} : 8 effets (Felicity Farseer ×5, Hera Tani ×2, Didi Vatermann ×1)`, observations: 8,
    check: 'EngineerCraft avec ApplyExperimentalEffect : grade maximal de l’hôte pour ce plan (coriolis) < 5, Level ≤ ce grade',
  }),
  rule('R5b', 'jeu', 'Un ingénieur qui propose ce plan peut poser l’effet même sur un module d’un grade au-dessus de son grade maximal (« quel que soit le grade »).', {
    status: STATUS.CHECK, basis: ['wiki', 'joueur'], source: `${SOURCES['W-EXP']} (« of any quality grade ») ; ${SIGNALE}`, observations: 0, also: SIGNALE,
    why: 'jamais vu dans les journaux de référence (0 cas) : un effet sur un module d’un grade au-dessus du grade maximal de l’hôte',
    check: 'EngineerCraft avec ApplyExperimentalEffect : Level > grade maximal de l’hôte (MarketID) pour ce plan',
  }),
  rule('R5c', 'jeu', 'Un ingénieur pose l’effet quel que soit son rang (il doit être débloqué).', {
    status: STATUS.CHECK, basis: ['journaux', 'joueur'], source: `${JOURNAUX_ITIN} : 1 cas, Broo Tarquin au rang 3 (Muang, 5 nov.) ; ${SIGNALE}`, observations: 1, also: SIGNALE,
    why: 'vu une seule fois (au rang 3) ; rangs 1 et 2 jamais vus',
    check: 'EngineerCraft avec ApplyExperimentalEffect chez un hôte (MarketID) sous le rang 5',
  }),
  rule('R6a', 'jeu', 'L’effet peut se poser sur un G1 (ou tout grade commencé).', {
    status: STATUS.MEASURED, basis: ['journaux'], source: `${JOURNAUX_ITIN} : effets posés sur G1 ×7, G2 ×5, G3 ×5 (et G5 ×15)`, observations: 17,
    check: 'EngineerCraft avec ApplyExperimentalEffect : Level < 5',
  }),
  rule('R6b', 'jeu', 'Monter ensuite le même plan à un atelier garde l’effet, y compris chez un autre ingénieur.', {
    status: STATUS.MEASURED, basis: ['journaux'], source: `${JOURNAUX_ITIN} : 164 applications du même plan sur un module à effet, l’effet gardé 164 fois, dont 61 chez un autre ingénieur que celui qui l’a posé`, observations: 164,
    check: 'EngineerCraft du même BlueprintName sur un module à effet : ExperimentalEffect identique avant et après',
  }),
  rule('R6c', 'jeu', '… et monter à distance garde aussi l’effet.', {
    status: STATUS.CHECK, basis: ['joueur'], source: SIGNALE, observations: 0, also: SIGNALE,
    why: 'jamais vu dans les journaux de référence (0 montée à distance d’un module à effet)',
    check: 'EngineerCraft sans ApplyExperimentalEffect, à quai hors base, ExperimentalEffect présent avant et après',
  }),
  rule('R7a', 'jeu', 'Une autre modification posée sur le module efface ses grades (on repart du G1).', {
    status: fromRanks('NEW_BLUEPRINT_RESTARTS').status,
    basis: ['journaux'],
    source: `renvoi : ${RANKS_FILE}, RANK_RULES.NEW_BLUEPRINT_RESTARTS`,
    observations: fromRanks('NEW_BLUEPRINT_RESTARTS').observations,
    ref: { file: RANKS_FILE, key: 'RANK_RULES.NEW_BLUEPRINT_RESTARTS' },
    check: 'EngineerCraft d’un autre BlueprintName : Level 1',
  }),
  rule('R7b', 'jeu', '… et son effet expérimental, sans retour.', {
    status: STATUS.MEASURED, basis: ['journaux', 'wiki'], source: `${JOURNAUX_ITIN} : 1er nov. 22:38:38 (ShieldGenerator_Thermic G3 et son effet → ShieldGenerator_Reinforced) et 5 nov. 12:34:06 (Weapon_Efficient G3 et « Désossage » → Weapon_LightWeight) ; ${SOURCES['W-ENG']}`, observations: 2,
    why: undefined,
    check: 'EngineerCraft d’un autre BlueprintName sur un module à effet : plus d’ExperimentalEffect',
  }),
  rule('R7c', 'jeu', 'Un autre effet posé sur le même plan remplace le premier.', {
    status: STATUS.CHECK, basis: ['app'], source: 'hypothèse de l’app', observations: 0,
    why: 'jamais vu dans les journaux de référence (0 cas)',
    check: 'EngineerCraft avec ApplyExperimentalEffect sur un module qui porte déjà un autre effet du même plan',
  }),
  rule('R8a', 'jeu', 'Dans une application, le nom de l’ingénieur désigne l’auteur de la modification en place sur le module, pas l’atelier où l’on se trouve.', {
    status: STATUS.CHECK, basis: ['journaux'], source: `${JOURNAUX_ITIN} : 208 applications à distance au nom de l’ingénieur de l’épingle ; 1 effet posé chez Broo Tarquin au nom de The Dweller (Muang, 5 nov. 12:33:56)`, observations: 1,
    why: 'aucune source ne le dit ; un seul effet chez un autre hôte que l’auteur le montre',
    check: 'EngineerCraft : Engineer / EngineerID comparé à l’hôte (MarketID du dernier Docked)',
  }),
  rule('R8b', 'app', 'L’hôte d’une application se trouve par le MarketID du dernier amarrage (ou d’une arrivée à quai) ; à défaut par le nom de la station et le système, jamais pour un porte-vaisseaux. Une application sans effet faite à quai chez un autre hôte que son auteur est faite à distance ; chez son auteur, à l’atelier.', {
    basis: ['app'], source: 'data/engineers.json (marketId, base, systemAddress)', observations: null,
    check: 'Docked / Location à quai : MarketID, StationName, SystemAddress',
  }),
  rule('R9', 'jeu + app', 'Le jeu n’écrit aucun épinglage : l’épingle se déduit de la dernière application à distance chez l’ingénieur ; entre ta saisie et cette déduction, la plus récente l’emporte.', {
    status: STATUS.MEASURED, basis: ['journaux'], source: `${JOURNAUX_ITIN} : 0 événement d’épinglage`, observations: ITINERARY_PERIOD.files,
    check: 'tout événement du journal dont le nom évoque un épinglage (« Pin », « Blueprint ») le contredirait',
  }),
  rule('R10', 'app', 'Distances à vol d’oiseau depuis ta dernière position lue (arrivée dans un système, saut, saut du porte-vaisseaux) ; position inconnue : on le dit, rien n’est inventé.', {
    basis: ['app'], source: 'StarPos des événements Location, FSDJump, CarrierJump ; coordonnées de data/engineers.json', observations: null,
    check: 'Location, FSDJump, CarrierJump : StarPos',
  }),
  rule('R11', 'app', 'Régions Bulle et Colonia. Jamais de traversée pour un travail qu’un ingénieur de ta région peut faire, même verrouillé : on te propose de le débloquer. Traversée seulement pour le reste, signalée. Un ingénieur qui t’a banni ne fait rien ; un parrain à faire monter dans l’autre région est une traversée signalée.', {
    basis: ['joueur', 'app'], source: `${SIGNALE} (« il faut lui proposer d’aller plutôt débloquer l’ingé bouclier dans la bulle ») ; régions : data/engineers.json, meta.regions`, observations: null,
    check: 'aucun',
  }),
  rule('R12', 'jeu', 'Continuer le même plan chez un autre ingénieur reprend au grade suivant.', {
    status: STATUS.MEASURED, basis: ['journaux'], source: `${JOURNAUX_ITIN} : 10 cas`, observations: 10,
    check: 'EngineerCraft du même BlueprintName chez un autre auteur : Level = grade d’avant + 1',
  }),
  rule('R12b', 'jeu', '… y compris après des grades faits à distance (épingle d’un autre ingénieur).', {
    status: STATUS.CHECK, basis: ['app'], source: 'hypothèse de l’app : après une application à distance, le module porte la modification de l’ingénieur de l’épingle, comme après une application à son atelier (R12)', observations: 0,
    why: 'jamais vu dans les journaux de référence (0 cas) : regarde ce que l’atelier te propose avant de payer',
    check: 'EngineerCraft à l’atelier d’un ingénieur, même BlueprintName, juste après des applications à distance d’un autre',
  }),
  rule('R13', 'jeu', 'Les bases d’ingénieurs ont l’équipement, pas de chantier naval : on ne peut pas y changer de vaisseau.', {
    status: STATUS.CHECK, basis: ['journaux'], source: `${JOURNAUX_ITIN} : 10 bases sur 25 relevées (outfitting oui, shipyard non)`, observations: 10,
    why: '15 bases sur 25 jamais relevées dans les journaux de référence',
    check: 'Docked à une base d’ingénieur : StationServices (outfitting, shipyard)',
  }),
  rule('R14', 'jeu', 'Découverte par référence : le parrain au rang 3 et au moins un tiers de la barre vers le rang 4 (ou plus haut). Le jeu peut ne l’écrire qu’au chargement suivant.', {
    status: STATUS.PUBLISHED, basis: ['wiki'], source: `${SOURCES['W-ENGR']} : les fiches disent « au moins 1/3 », le tableau « environ la moitié »`, observations: 0,
    why: 'les sources ne s’accordent pas sur le seuil : l’app vise la moitié de la barre (prudent)',
    check: 'EngineerProgress complet : un nouvel ingénieur Known après la montée du parrain',
  }),
  rule('R15', 'jeu', 'État « Acquainted » : sens à vérifier (avant ou après l’invitation) ; l’app le compte comme « connu ».', {
    status: STATUS.CHECK, basis: ['journal du jeu'], source: `${SOURCES.JOURNAL_MANUAL} ; ${JOURNAUX_ITIN} : 0 cas (Known 578, Invited 431, Unlocked 779)`, observations: 0,
    why: 'jamais vu dans les journaux de référence',
    check: 'EngineerProgress : Progress « Acquainted »',
  }),
  rule('R16', 'jeu', 'Un module se monte sur un autre vaisseau si un emplacement du même genre l’accepte : taille au moins égale (même fonction pour un module standard), compartiment réservé respecté, jamais le blindage.', {
    status: STATUS.PUBLISHED, basis: ['coriolis'], source: SOURCES.COR, observations: 0,
    why: 'données coriolis, pas vérifiées en jeu module par module',
    check: 'ModuleRetrieve / FetchRemoteModule puis Loadout : le module est bien monté',
  }),
  rule('R16b', 'jeu', 'Propulseurs et générateur de bouclier : la masse de coque du vaisseau doit rester sous leur masse maximale.', {
    status: STATUS.CHECK, basis: ['coriolis'], source: `${SOURCES.COR} (maxmass, hullMass)`, observations: 0,
    why: 'non vu en jeu',
    check: 'refus de l’équipement à monter un module trop léger (rien n’est écrit dans le journal)',
  }),
  rule('R17', 'jeu', 'Un vaisseau vendu à l’achat d’un autre lui laisse son numéro.', {
    status: STATUS.MEASURED, basis: ['journaux'], source: `${JOURNAUX_ITIN} : 3 fois sur 3 (ShipyardBuy avec SellShipID puis ShipyardNew du même numéro)`, observations: 3,
    check: 'ShipyardBuy (SellShipID) puis ShipyardNew (NewShipID)',
  }),
  rule('W', 'réglage', 'Coût en al-éq. (distance équivalente) : 100 par escale, 2 × √(distance à l’arrivée en sl) de supercroisière, 25 par application en plus due aux rangs, 100 de plus pour une seconde visite avec un autre vaisseau.', {
    basis: ['app'], source: 'choix de l’app, affiché ; à trancher', observations: null,
    check: 'aucun',
  }),
]);

export const RULES_BY_ID = new Map(ITINERARY_RULES.map((r) => [r.id, r]));

/** Réglages du calcul (al-éq. : distance équivalente). */
export const ROUTE_SETTINGS = Object.freeze({
  STOP_AL: 100,
  SUPERCRUISE_FACTOR: 2,
  ROLL_AL: 25,
  SHIP_SWAP_AL: 100,
  REFERRAL_PROGRESS: 50,
  MAX_REFERRAL_DEPTH: 4,
  WHY_MAX_OPTIONS: 4,
  EXACT_MAX_CANDIDATES: 16,
  MAX_EVALUATIONS: 200000,
  MAX_PLANS: 10,
  MAX_EXCLUDE: 25,
});

/**
 * États d'un ingénieur (EngineerProgress du jeu, plus deux états de l'app) : texte pour le joueur, étapes de déblocage
 * restantes, partie de l'itinéraire, statut du sens.
 */
export const PROGRESS_STATES = Object.freeze({
  Known: Object.freeze({ text: 'connu : pas encore invité', steps: 2, part: 'a-preparer', status: STATUS.MEASURED }),
  Acquainted: Object.freeze({ text: 'état « Acquainted » du jeu : sens à vérifier (avant ou après l’invitation)', steps: 2, part: 'a-preparer', status: STATUS.CHECK, rule: 'R15' }),
  Invited: Object.freeze({ text: 'invité ✓ : il reste à le débloquer', steps: 1, part: 'region', status: STATUS.MEASURED }),
  Unlocked: Object.freeze({ text: 'débloqué', steps: 0, part: 'region', status: STATUS.MEASURED }),
  Barred: Object.freeze({ text: 'banni', steps: null, part: null, status: STATUS.MEASURED }),
  absent: Object.freeze({ text: 'pas encore découvert', steps: 3, part: 'a-preparer', status: STATUS.MEASURED }),
  unknown: Object.freeze({ text: 'état inconnu : lance le jeu pour le relever', steps: 3, part: 'a-preparer', status: STATUS.MEASURED }),
});
