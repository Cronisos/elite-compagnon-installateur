// Règles du jeu lues par le capteur d'escadron : galaxie Live, lignes de mérites réécrites ou annulées, statistiques.
// Le contrat de l'API du Squadron Tracker (Worker) n'est pas une règle du jeu : il reste dans modules/escadron/rules.js.
// Voir LISEZMOI.md pour changer une règle.

import { domaine } from './fiche.js';

const JOURNAUX = 'journaux de référence, 23 oct.–7 nov. 2026 (60 Statistics, 1 154 PowerplayMerits)';

const D = domaine('escadron', 'Escadron (mérites et statistiques)', [
  {
    id: 'escadron.galaxie.live', nom: 'LIVE_GALAXY_MIN_MAJOR', titre: 'Galaxie Live : version du jeu 4.0 ou plus (3.x = Legacy, après la séparation des galaxies)',
    valeur: 4, unite: 'version majeure', statut: 'à vérifier', date: '2026-11-07',
    source: 'EDMC monitor.is_live_galaxy(), repris de mémoire ; Fileheader du 7 nov. 2026 : gameversion « 4.4.2.1 »', controle: 'à remesurer',
  },
  {
    id: 'escadron.galaxie.beta', nom: 'BETA_MARKERS', titre: 'Marqueurs d’une version bêta dans gameversion',
    valeur: ['alpha', 'beta'], unite: 'mots', statut: 'à vérifier', date: '2026-11-07',
    source: 'EDMC monitor.is_beta (gameversion), repris de mémoire', controle: 'manuel',
  },
  {
    id: 'escadron.galaxie.separation', nom: 'LEGACY_SPLIT_AT', titre: 'Séparation des galaxies Live et Legacy : avant cette date, un journal 3.x est Live',
    valeur: '2022-11-29T00:00:00Z', unite: 'date UTC', statut: 'à vérifier', date: '2026-11-15',
    source: 'Mise à jour 14 du jeu (29 nov. 2022), reprise de mémoire : Horizons 3.8 jouait avant dans la galaxie commune, devenue Live', controle: 'manuel',
  },
  {
    id: 'escadron.merites.ligne-reecrite', nom: 'DUPLICATE_SAME_TOTAL', titre: 'Ligne PowerplayMerits réécrite (TotalMerits inchangé) : gain non crédité',
    valeur: true, unite: 'oui/non', statut: 'mesurée', date: '2026-11-07',
    source: `${JOURNAUX} ; 12 cas, ex. 26 oct. 18:43:15 et 18:43:16, 14 mérites, total 798 773 deux fois`, controle: 'auto',
  },
  {
    id: 'escadron.merites.annulee-par-la-suivante', nom: 'CANCELLED_BY_NEXT', titre: 'Ligne annulée par la suivante : le jeu crédite la suivante à sa place',
    valeur: true, unite: 'oui/non', statut: 'mesurée', date: '2026-11-08',
    source: `${JOURNAUX} ; 40 cas pour 6 271 mérites, crédit 0 dans 35 cas, négatif dans 5 ; ex. 7 nov. 13:50:13 (2 015) puis 13:50:22 (1 773)`, controle: 'auto',
  },
  {
    id: 'escadron.merites.meme-seconde', nom: 'SAME_SECOND_SAME_VALUE', titre: 'Gains distincts dans la même seconde avec la même valeur',
    valeur: true, unite: 'oui/non', statut: 'mesurée', date: '2026-11-08',
    source: `${JOURNAUX} ; 28 cas pour 245 mérites (ex. 26 oct. 18:43:15, trois fois 14)`, controle: 'à remesurer',
  },
  {
    id: 'escadron.stats.cumuls', nom: 'STATS_CUMULATIVE', titre: 'Classements d’escadron (Statistics) : cumuls depuis l’arrivée dans l’escadron',
    valeur: true, unite: 'oui/non', statut: 'mesurée', date: '2026-11-07',
    source: `${JOURNAUX} ; à recouper avec le menu d’escadron du jeu`, controle: 'à remesurer',
  },
  {
    id: 'escadron.stats.powerplay', nom: 'STATS_POWERPLAY_IS_MERITS', titre: 'Écart du classement Powerplay = écart de TotalMerits',
    valeur: true, unite: 'oui/non', statut: 'mesurée', date: '2026-11-07',
    source: `${JOURNAUX} (22 intervalles sur 23)`, controle: 'auto',
  },
  {
    id: 'escadron.stats.minage', nom: 'STATS_MINING_IS_PROFITS', titre: 'Écart du classement Minage = écart de Mining_Profits',
    valeur: true, unite: 'oui/non', statut: 'mesurée', date: '2026-11-07',
    source: `${JOURNAUX} (8 intervalles sur 8)`, controle: 'auto',
  },
  {
    id: 'escadron.stats.primes', nom: 'STATS_BOUNTY_IS_CREDITS', titre: 'Classement des primes en crédits (proche de Bounty_Hunting_Profit)',
    valeur: true, unite: 'oui/non', statut: 'à vérifier', date: '2026-11-07',
    source: `${JOURNAUX} (égal 3 fois sur 7)`, controle: 'auto',
  },
]);

export const ESCADRON = D;
export const FICHES = D.fiches;
