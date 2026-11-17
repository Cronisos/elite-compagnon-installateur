// Règles des objectifs communautaires (OC). Voir LISEZMOI.md pour changer une règle.
//
// Constatés, sans usage dans le calcul (journaux de référence) : IsComplete passe à true au plus 1 h 01 après Expiry ; un OC
// terminé et non réclamé reste dans CurrentGoals au moins 9 jours.

import { domaine } from './fiche.js';

const EDOMH = 'schéma edomh (http://schemas.edomh.nl/), lu le 7 nov. 2026';
const JOURNAUX = 'journaux de référence, 24 oct.–7 nov. 2026';

const D = domaine('objectifs', 'Objectifs communautaires', [
  {
    id: 'objectifs.tranche.sans-contribution', nom: 'NO_CONTRIBUTION_BAND', titre: 'Tranche donnée à qui n’a rien apporté',
    valeur: 100, unite: 'PlayerPercentileBand', statut: 'mesurée', date: '2026-11-07',
    source: `${EDOMH} (« no contribution -> 100 ») ; mesurée : OC 863, contribution 0, tranche 100 (${JOURNAUX})`, controle: 'à remesurer',
  },
  {
    id: 'objectifs.recompense.contribution-min', nom: 'MIN_CONTRIBUTION_FOR_REWARD', titre: 'Contribution minimale pour toucher une récompense',
    valeur: 1, unite: 'contribution', statut: 'à vérifier', date: '2026-11-07',
    source: 'aucune source publiée trouvée (schéma edomh sans description, wiki Fandom inaccessible) ; à trancher par le premier CommunityGoalReward d’un OC à contribution nulle', controle: 'à remesurer',
  },
  {
    id: 'objectifs.palier.atteint', nom: 'TIER_REACHED_FIELD', titre: 'Premier palier atteint quand TierReached apparaît ; Bonus = récompense de ta tranche',
    valeur: 'TierReached', unite: 'champ du journal', statut: 'publiée', date: '2026-11-07',
    source: `${EDOMH} ; à vérifier : Bonus face au Reward du CommunityGoalReward (OC 864 : Bonus 170 000 000 cr au 7 nov. 2026)`, controle: 'à remesurer',
  },
  {
    id: 'objectifs.palier.numero', nom: 'TIER_NUMBER', titre: 'Nom des paliers selon la langue (« Tier 3 », « Niveau 3 ») : le numéro en dernier',
    valeur: '(\\d+)\\s*$', unite: 'expression régulière', statut: 'mesurée', date: '2026-11-07',
    source: `les deux formes dans les ${JOURNAUX}`, controle: 'à remesurer',
  },
  {
    id: 'objectifs.recompense.station', nom: 'CLAIM_AT_GOAL_STATION', titre: 'La récompense se réclame à la station de l’OC',
    valeur: true, unite: 'oui/non', statut: 'à vérifier', date: '2026-11-07',
    source: 'aucune source publiée trouvée ; à trancher par le premier CommunityGoalReward (son System face au SystemName de l’OC)', controle: 'à remesurer',
  },
]);

export const OBJECTIFS = D;
export const FICHES = D.fiches;
export const NO_CONTRIBUTION_BAND = D.v('NO_CONTRIBUTION_BAND');
export const MIN_CONTRIBUTION_FOR_REWARD = D.v('MIN_CONTRIBUTION_FOR_REWARD');
export const TIER_REACHED_FIELD = D.v('TIER_REACHED_FIELD');
export const TIER_NUMBER = new RegExp(D.v('TIER_NUMBER'));
export const CLAIM_AT_GOAL_STATION = D.v('CLAIM_AT_GOAL_STATION');
