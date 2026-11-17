// Règles du Powerplay : semaine, prise, paliers, mérites, ventes. Voir LISEZMOI.md pour changer une règle.
//
// Avant le 9 nov. 2026, plusieurs de ces règles étaient écrites deux ou trois fois (120 000 points d'une prise dans
// trois modules, passage de semaine dans quatre, portée 20/30 al dans trois), parfois avec des statuts différents.
// Chacune n'a plus qu'une fiche, ici.

import { domaine } from './fiche.js';

const HERZBUBE = 'wiki herzbube (https://wiki.herzbube.ch/wiki/EDPowerPlay), lu le 25 oct. 2026';
const FORUM_ACTIVITES = 'forum Frontier, fil de joueurs « Powerplay 2.0 Activities » (https://forums.frontier.co.uk/threads/powerplay-2-0-activities.629227/)';

const D = domaine('powerplay', 'Powerplay', [
  // --- Semaine ---
  {
    id: 'powerplay.semaine.jour', nom: 'WEEK_TICK_DAY_UTC', titre: 'Jour du passage de semaine (renforcement remis à zéro)',
    valeur: 4, unite: 'jour UTC (0 = dimanche)', statut: 'mesurée', date: '2026-11-06',
    source: 'journaux de référence : renforcement remis à zéro le jeudi (Synuefe OU-E c28-2, 6 nov. 2026, et passages d’octobre 2026)', controle: 'à remesurer',
  },
  {
    id: 'powerplay.semaine.heure', nom: 'WEEK_TICK_HOUR_UTC', titre: 'Heure du passage de semaine',
    valeur: 7, unite: 'h UTC', statut: 'à vérifier', date: '2026-11-07',
    source: 'reprise du Projet extension (merits.js) ; à vérifier à l’heure près sur un passage de semaine', controle: 'à remesurer',
  },
  // --- Prise et paliers ---
  {
    id: 'powerplay.prise.points', nom: 'ACQUISITION_POINTS', titre: 'Points de contrôle pour 1,0 de progression de prise',
    valeur: 120_000, unite: 'points de contrôle pour 1,0 de prise', statut: 'mesurée', date: '2026-11-01',
    source: 'journaux de référence : Col 285 Sector AN-G et Synuefe GA-I b57-6', controle: 'à remesurer',
  },
  {
    id: 'powerplay.paliers.consolide', nom: 'TIER_FORTIFIED_POINTS', titre: 'Points de contrôle d’Exploité à Consolidé',
    valeur: 350_000, unite: 'points de contrôle', statut: 'mesurée', date: '2026-11-01',
    source: 'journaux de référence, 1er nov. 2026 (une seule mesure, à recouper en jeu)', controle: 'à remesurer',
  },
  {
    id: 'powerplay.paliers.forteresse', nom: 'TIER_STRONGHOLD_POINTS', titre: 'Points de contrôle de Consolidé à Forteresse',
    valeur: 650_000, unite: 'points de contrôle', statut: 'mesurée', date: '2026-11-01',
    source: 'journaux de référence, 1er nov. 2026 (une seule mesure, à recouper en jeu)', controle: 'à remesurer',
  },
  {
    id: 'powerplay.paliers.jauge-forteresse', nom: 'TIER_STRONGHOLD_GAUGE_POINTS', titre: 'Points de contrôle de la jauge d’une Forteresse',
    valeur: 1_000_000, unite: 'points de contrôle', statut: 'mesurée', date: '2026-10-30',
    source: 'journaux de référence : Mombaluma, 30 oct. 2026 (une seule mesure)', controle: 'à remesurer',
  },
  // --- Érosion du passage de semaine ---
  {
    id: 'powerplay.erosion.plancher', nom: 'EROSION_FLOOR', titre: 'Plancher de l’érosion hebdomadaire (part du palier jamais érodée)',
    valeur: 0.25, unite: 'part du palier du niveau', statut: 'mesurée', date: '2026-11-12',
    source: 'Frontier, Trailblazers 3.4 (« l’érosion ne descend pas sous 25 % ») ; journaux de référence : ICZ RY-R b4-4 à 0,154 (Exploité), ni sape ni perte au passage du 5 nov. 2026', controle: 'à remesurer',
  },
  {
    id: 'powerplay.erosion.diviseur', nom: 'EROSION_DIVISOR', titre: 'Érosion au passage de semaine : un douzième de ce qui dépasse le plancher',
    valeur: 12, unite: 'érosion = (points au passage − plancher × palier) ÷ 12, arrondi en dessous', statut: 'mesurée', date: '2026-11-12',
    source: 'journaux de référence, Synuefe OU-E c28-2 (Exploité) : (149 600 − 87 500) ÷ 12 = 5 175 le 5 nov., (268 600 − 87 500) ÷ 12 = 15 091 le 12 nov. 2026, montrés en sape au journal ; points au passage = jauge après + sape − renfort après. Vérifié en Exploité seulement', controle: 'à remesurer',
  },
  {
    id: 'powerplay.prise.portee-consolide', nom: 'ACQUISITION_REACH_FORTIFIED_LY', titre: 'Portée d’une prise depuis un système Consolidé',
    valeur: 20, unite: 'al', statut: 'mesurée', date: '2026-11-08',
    source: `${FORUM_ACTIVITES} ; journaux de référence : 56/56 systèmes Inoccupés (Powers ↔ appui Spansh à portée), Consolidé à 21,8 al sans effet ; Spansh : 75/75 autour de Synuefe OU-E c28-2 (2026-11-07)`, controle: 'à remesurer',
  },
  {
    id: 'powerplay.prise.portee-forteresse', nom: 'ACQUISITION_REACH_STRONGHOLD_LY', titre: 'Portée d’une prise depuis une Forteresse',
    valeur: 30, unite: 'al', statut: 'mesurée', date: '2026-11-08',
    source: `${FORUM_ACTIVITES} ; journaux de référence : 56/56 systèmes Inoccupés (Powers ↔ appui Spansh à portée) ; Spansh : 75/75 autour de Synuefe OU-E c28-2 (2026-11-07)`, controle: 'à remesurer',
  },
  {
    id: 'powerplay.etats.liste', nom: 'STATES', titre: 'États Powerplay d’un système, tels que le journal les écrit',
    valeur: ['Unoccupied', 'Exploited', 'Fortified', 'Stronghold'], unite: 'PowerplayState', statut: 'mesurée', date: '2026-11-07',
    source: 'journaux de référence et réponses Spansh (289 « Unoccupied », 233 « Exploited », 69 « Fortified », 224 « Stronghold »)', controle: 'à remesurer',
  },
  {
    id: 'powerplay.puissances.liste', nom: 'POWERS', titre: 'Les douze puissances (orthographe du journal)',
    valeur: ['A. Lavigny-Duval', 'Aisling Duval', 'Archon Delaine', 'Denton Patreus', 'Edmund Mahon', 'Felicia Winters', 'Jerome Archer', 'Li Yong-Rui', 'Nakato Kaine', 'Pranav Antal', 'Yuri Grom', 'Zemina Torval'],
    unite: 'noms', statut: 'publiée', date: '2026-11-07',
    source: 'Powerplay 2.0 (Jerome Archer a remplacé Zachary Hudson) ; à revoir si Frontier ajoute ou renomme une puissance', controle: 'manuel',
  },
  // --- Mérites et points ---
  {
    id: 'powerplay.points.merites-par-point', nom: 'MERITS_PER_POINT_TABLE', titre: 'Mérites pour un point de contrôle, selon l’activité',
    valeur: { defaut: 4, exploration: 6, exobiology: 6 }, unite: 'mérites par point', statut: 'mesurée', date: '2026-11-01',
    source: 'journaux de référence (prises de Col 285 Sector AN-G et Synuefe GA-I b57-6) ; exploration et exobiologie : guides des joueurs', controle: 'à remesurer',
  },
  // --- Zones de conflit et sape (« Où agir ») ---
  {
    id: 'powerplay.conflits.etats', nom: 'CONFLICT_ZONE_STATES', titre: 'États de faction qui ouvrent des zones de conflit',
    valeur: ['War', 'Civil War'], unite: 'états de faction', statut: 'à vérifier', date: '2026-11-07',
    source: 'règle du BGS connue des joueurs ; à vérifier sur un journal (« Conflicts » de FSDJump)', controle: 'à remesurer',
  },
  {
    id: 'powerplay.conflits.types', nom: 'CONFLICT_ZONE_WAR_TYPES', titre: 'Types de conflit du journal qui ouvrent des zones de conflit',
    valeur: ['war', 'civilwar'], unite: 'FSDJump.Conflicts[].WarType', statut: 'à vérifier', date: '2026-11-07',
    source: 'format mesuré sur les journaux de référence (oct. 2026 : « civilwar », « election ») ; règle des zones à vérifier', controle: 'à remesurer',
  },
  {
    id: 'powerplay.sape.portee', nom: 'UNDERMINING_NEEDS_REACH', titre: 'La sape demande-t-elle une portée ?',
    valeur: false, unite: 'oui/non', statut: 'à vérifier', date: '2026-11-07',
    source: 'aucune source trouvée le 7 nov. 2026 : tout système tenu par une autre puissance est proposé', controle: 'manuel',
  },
  // --- Ventes de marchandises ---
  {
    id: 'powerplay.vente.delai-merites', nom: 'MERITS_WINDOW_MS', titre: 'Délai maximal entre une vente et ses mérites',
    valeur: 60_000, unite: 'ms', statut: 'mesurée', date: '2026-10-30',
    source: 'journaux de référence : 13 s au plus (785 t d’iridium, Mombaluma, 30 oct. 2026)', controle: 'auto',
  },
  {
    id: 'powerplay.vente.demande-en-gros', nom: 'BULK_DEMAND_FACTOR', titre: 'Vente en gros : demande minimale (× la quantité vendue) pour ne pas être taxé',
    valeur: 4, unite: '× la quantité', statut: 'publiée', date: '2026-10-25',
    source: `${HERZBUBE} ; même seuil côté prix, « not more than 25 percent of the demand » (https://steamcommunity.com/app/359320/discussions/0/4700162167909920915, 28 oct. 2024)`, controle: 'à remesurer',
  },
  {
    id: 'powerplay.vente.acquisition-source', nom: 'ACQUISITION_SOURCE_STATES', titre: 'Acquisition : états du système où la marchandise doit avoir été minée ou achetée',
    valeur: ['Fortified', 'Stronghold'], unite: 'PowerplayState', statut: 'publiée', date: '2026-10-25',
    source: `${HERZBUBE} ; mesure partielle, seulement le cas négatif : source Inoccupée → 0 (1 184 t d’iridium, Synuefe GA-I b57-6, 31 oct. 2026)`, controle: 'auto',
  },
  {
    id: 'powerplay.vente.acquisition-marge', nom: 'ACQUISITION_TRADE_MIN_MARGIN', titre: 'Commerce en acquisition : bénéfice minimal',
    valeur: 0.4, unite: 'part du prix d’achat', statut: 'à vérifier', date: '2024',
    source: `${FORUM_ACTIVITES}, 2024 ; concorde avec le palladium de HIP 71601 vendu à Synuefe GA-I b57-6 le 31 oct. 2026 : 0`, controle: 'à remesurer',
  },
  {
    id: 'powerplay.vente.renforcement-meme-systeme', nom: 'REINFORCEMENT_SAME_SYSTEM', titre: 'Renforcement : minerai miné et vendu dans le même système',
    valeur: true, unite: 'oui/non', statut: 'mesurée', date: '2026-11-06',
    source: `${HERZBUBE} ; mesurée : 12 t d’iridium de Gungnir vendues à Talta le 29 oct. 2026 : 0 ; 1 t de HIP 73834 vendue à Synuefe OU-E c28-2 le 6 nov. 2026 : 0`, controle: 'auto',
  },
  {
    id: 'powerplay.vente.sape-meme-systeme', nom: 'UNDERMINING_SAME_SYSTEM', titre: 'Sabotage : minerai miné et vendu dans le même système ennemi',
    valeur: true, unite: 'oui/non', statut: 'à vérifier', date: '2026-10-25',
    source: `${HERZBUBE} ; jamais mesurée dans les journaux de référence`, controle: 'à remesurer',
  },
  {
    id: 'powerplay.vente.ennemi-ou-vide', nom: 'ENEMY_OR_EMPTY_PAYS_NOTHING', titre: 'Système ennemi (hors minerai miné sur place) ou sans puissance : aucun mérite',
    valeur: true, unite: 'oui/non', statut: 'mesurée', date: '2026-10-31',
    source: 'Vequess 30 oct., HIP 8060 31 oct., Cemiess 27-28 oct. 2026 : 0 à chaque fois', controle: 'auto',
  },
  {
    id: 'powerplay.vente.rares-autre-systeme', nom: 'RARE_OTHER_SYSTEM', titre: 'Marchandises rares : à vendre dans un autre système que celui de l’achat',
    valeur: true, unite: 'oui/non', statut: 'publiée', date: '2026-10-25',
    source: `${HERZBUBE} (« Cannot buy & sell in the same system ») ; reliques de Soontill, 24-26 oct. 2026 : environ 1 500 mérites par million`, controle: 'à remesurer',
  },
  {
    id: 'powerplay.vente.penalite-renforcement', nom: 'REINFORCEMENT_PENALTY', titre: 'Pénalité du renforcement',
    valeur: 0.35, unite: 'part retirée', statut: 'à vérifier', date: '2026-10-25',
    source: `${HERZBUBE} ; contredite : reliques de Soontill 1 500 / M en acquisition, 520 / M en renforcement (1er nov. 2026). Sert seulement à extrapoler un ratio, marqué « extrapolé »`, controle: 'auto',
  },
  {
    id: 'powerplay.vente.bonus-acquisition', nom: 'ACQUISITION_BONUS', titre: 'Bonus de l’acquisition et du sabotage',
    valeur: 0.05, unite: 'part ajoutée', statut: 'à vérifier', date: '2026-10-25',
    source: `${HERZBUBE} ; même contradiction que la pénalité du renforcement (2,9 fois mesuré, 1,62 attendu). Une sorte mesurée dans les deux modes prend son facteur mesuré`, controle: 'auto',
  },
  {
    id: 'powerplay.vente.lots-plus-anciens', nom: 'LOT_BY_LOT_OLDEST_FIRST', titre: 'Une vente est jugée tonne par tonne, les plus anciennes d’abord',
    valeur: true, unite: 'oui/non', statut: 'à vérifier', date: '2026-11-08',
    source: 'hypothèse de l’app, jamais mesurée sur une soute mélangée : à vérifier sur une vente partielle d’une soute venue de deux systèmes', controle: 'à remesurer',
  },
  {
    id: 'powerplay.vente.soute-srv', nom: 'SRV_CARGO_TO_SHIP_ON_DOCK', titre: 'La cargaison du SRV passe dans la soute du vaisseau au retour',
    valeur: true, unite: 'oui/non', statut: 'mesurée', date: '2026-10-29',
    source: 'journaux de référence : 16 Librae, 29 oct. 2026 (SRV à 7 t, soute de 30 à 37 t) ; une mort dans le SRV laisse la soute du vaisseau', controle: 'à remesurer',
  },
  {
    id: 'powerplay.vente.petite-vente', nom: 'SMALL_SALE_MERITS', titre: 'Petite vente : sous ce nombre de mérites prévus, l’arrondi du jeu peut donner 0',
    valeur: 3, unite: 'mérites', statut: 'à vérifier', date: '2026-11-06',
    source: 'gallium 28 oct. (0), hématite 6 nov. (0), titane 6 nov. 2026 (2)', controle: 'auto',
  },
  {
    id: 'powerplay.vente.ratios-depuis', nom: 'RATIOS_SINCE', titre: 'Ratios mérites / crédits comparables depuis la mise à jour Dodec',
    valeur: '2025-11-11', unite: 'date', statut: 'publiée', date: '2025-11-11',
    source: 'mise à jour Dodec, actualités Steam (https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=359320)', controle: 'manuel',
  },
  {
    id: 'powerplay.vente.pas-de-merites', nom: 'NOT_FOR_SALE', titre: 'Marchandises qui ne se vendent pas pour des mérites',
    valeur: ['drones'], unite: 'marchandises', statut: 'mesurée', date: '2026-10-28',
    source: 'journaux de référence (drones) ; s’y ajoutent, appris dans le journal, les marchandises Powerplay et les objets de sauvetage', controle: 'à remesurer',
  },
]);

export const POWERPLAY = D;
export const FICHES = D.fiches;

export const WEEK_TICK_DAY_UTC = D.v('WEEK_TICK_DAY_UTC');
export const WEEK_TICK_HOUR_UTC = D.v('WEEK_TICK_HOUR_UTC');
export const ACQUISITION_POINTS = D.v('ACQUISITION_POINTS');
export const TIER_FORTIFIED_POINTS = D.v('TIER_FORTIFIED_POINTS');
export const TIER_STRONGHOLD_POINTS = D.v('TIER_STRONGHOLD_POINTS');
export const TIER_STRONGHOLD_GAUGE_POINTS = D.v('TIER_STRONGHOLD_GAUGE_POINTS');
export const EROSION_FLOOR = D.v('EROSION_FLOOR');
export const EROSION_DIVISOR = D.v('EROSION_DIVISOR');
export const ACQUISITION_REACH_FORTIFIED_LY = D.v('ACQUISITION_REACH_FORTIFIED_LY');
export const ACQUISITION_REACH_STRONGHOLD_LY = D.v('ACQUISITION_REACH_STRONGHOLD_LY');
export const ACQUISITION_RANGE_LY = Object.freeze({ Fortified: ACQUISITION_REACH_FORTIFIED_LY, Stronghold: ACQUISITION_REACH_STRONGHOLD_LY });
export const STATES = D.v('STATES');
export const POWERS = D.v('POWERS');
export const MERITS_PER_POINT_TABLE = D.v('MERITS_PER_POINT_TABLE');
export const CONFLICT_ZONE_STATES = D.v('CONFLICT_ZONE_STATES');
export const CONFLICT_ZONE_WAR_TYPES = D.v('CONFLICT_ZONE_WAR_TYPES');
export const UNDERMINING_NEEDS_REACH = D.v('UNDERMINING_NEEDS_REACH');
export const MERITS_WINDOW_MS = D.v('MERITS_WINDOW_MS');
export const BULK_DEMAND_FACTOR = D.v('BULK_DEMAND_FACTOR');
export const ACQUISITION_SOURCE_STATES = D.v('ACQUISITION_SOURCE_STATES');
export const ACQUISITION_TRADE_MIN_MARGIN = D.v('ACQUISITION_TRADE_MIN_MARGIN');
export const REINFORCEMENT_SAME_SYSTEM = D.v('REINFORCEMENT_SAME_SYSTEM');
export const UNDERMINING_SAME_SYSTEM = D.v('UNDERMINING_SAME_SYSTEM');
export const ENEMY_OR_EMPTY_PAYS_NOTHING = D.v('ENEMY_OR_EMPTY_PAYS_NOTHING');
export const RARE_OTHER_SYSTEM = D.v('RARE_OTHER_SYSTEM');
export const REINFORCEMENT_PENALTY = D.v('REINFORCEMENT_PENALTY');
export const ACQUISITION_BONUS = D.v('ACQUISITION_BONUS');
export const LOT_BY_LOT_OLDEST_FIRST = D.v('LOT_BY_LOT_OLDEST_FIRST');
export const SRV_CARGO_TO_SHIP_ON_DOCK = D.v('SRV_CARGO_TO_SHIP_ON_DOCK');
export const SMALL_SALE_MERITS = D.v('SMALL_SALE_MERITS');
export const RATIOS_SINCE = Date.parse(`${D.v('RATIOS_SINCE')}T00:00:00Z`);

const WEEK_MS = 7 * 24 * 3600 * 1000;

/** Début de la semaine Powerplay qui contient l'instant t (ms) : le dernier passage (jour et heure ci-dessus). */
export function weekStart(t) {
  const d = new Date(t);
  const back = (d.getUTCDay() - WEEK_TICK_DAY_UTC + 7) % 7;
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back, WEEK_TICK_HOUR_UTC);
  return start > t ? start - WEEK_MS : start;
}

/**
 * Érosion au prochain passage de semaine d'un système tenu (pas en prise), pour `points` de contrôle dans un palier
 * de `palier` points : un douzième de ce qui dépasse 25 % du palier, 0 en dessous. Affichée par le jeu en sape.
 */
export function erosionOf(points, palier) {
  if (!Number.isFinite(points) || !Number.isFinite(palier) || palier <= 0) return null;
  return Math.max(0, Math.floor((points - EROSION_FLOOR * palier) / EROSION_DIVISOR));
}

/** Points de contrôle que vaut un gain : 4 mérites = 1 point, 6 en exploration et exobiologie. */
export const pointsOf = (merits, activity) => merits / (Object.hasOwn(MERITS_PER_POINT_TABLE, activity) && activity !== 'defaut' ? MERITS_PER_POINT_TABLE[activity] : MERITS_PER_POINT_TABLE.defaut);
