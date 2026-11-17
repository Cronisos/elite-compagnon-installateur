// Règles Powerplay d'une vente de marchandises (où la marchandise doit avoir été minée ou achetée, et où la vendre).
// Les valeurs, leurs sources et leurs statuts sont dans le dépôt des règles : server/src/regles/powerplay.js (voir
// regles/LISEZMOI.md). Ce fichier les reprend sous les noms que le module utilise, et fait la table servie par l'API.
// Les ratios mérites / crédits ne sont PAS des règles : ils sont mesurés sur l'historique du joueur (saleWatch.js).

import { FICHES, ACQUISITION_RANGE_LY } from '../../regles/powerplay.js';

export {
  MERITS_WINDOW_MS, BULK_DEMAND_FACTOR, ACQUISITION_SOURCE_STATES, ACQUISITION_RANGE_LY, ACQUISITION_TRADE_MIN_MARGIN,
  REINFORCEMENT_SAME_SYSTEM, UNDERMINING_SAME_SYSTEM, ENEMY_OR_EMPTY_PAYS_NOTHING, RARE_OTHER_SYSTEM, REINFORCEMENT_PENALTY,
  ACQUISITION_BONUS, LOT_BY_LOT_OLDEST_FIRST, SRV_CARGO_TO_SHIP_ON_DOCK, RATIOS_SINCE, SMALL_SALE_MERITS,
} from '../../regles/powerplay.js';

const fiche = (nom) => FICHES.find((f) => f.nom === nom);
const ligne = (f) => ({ id: f.nom, value: f.valeur, status: f.statut, date: f.date, source: f.source });

/**
 * Marchandises qui ne se vendent pas pour des mérites : celles de la fiche (les drones). S'y ajoutent, appris dans le
 * journal (cargoLots.js), les marchandises Powerplay et les objets de sauvetage.
 */
export const NOT_FOR_SALE = new Set(fiche('NOT_FOR_SALE').valeur);

const portee = fiche('ACQUISITION_REACH_FORTIFIED_LY');
/** Règles d'une vente, telles que l'API de la vente les sert (forme d'avant le dépôt des règles). */
export const SALE_RULES = [
  ligne(fiche('MERITS_WINDOW_MS')),
  ligne(fiche('BULK_DEMAND_FACTOR')),
  ligne(fiche('ACQUISITION_SOURCE_STATES')),
  { id: 'ACQUISITION_RANGE_LY', value: ACQUISITION_RANGE_LY, status: portee.statut, date: portee.date, source: portee.source },
  ...['ACQUISITION_TRADE_MIN_MARGIN', 'REINFORCEMENT_SAME_SYSTEM', 'UNDERMINING_SAME_SYSTEM', 'ENEMY_OR_EMPTY_PAYS_NOTHING', 'RARE_OTHER_SYSTEM',
    'REINFORCEMENT_PENALTY', 'ACQUISITION_BONUS', 'LOT_BY_LOT_OLDEST_FIRST', 'SRV_CARGO_TO_SHIP_ON_DOCK', 'SMALL_SALE_MERITS', 'RATIOS_SINCE'].map((n) => ligne(fiche(n))),
];
