// Règles des échangeurs de matériaux : taux d'échange entre grades et entre catégories. Voir LISEZMOI.md.

import { domaine } from './fiche.js';

const MESURE = 'mesurée sur les 127 échanges des journaux du joueur (25 oct. – 10 nov. 2026, matières premières, manufacturés, données) : tous exacts';

const D = domaine('echangeurs', 'Échangeurs de matériaux', [
  {
    id: 'echangeurs.taux.monter', nom: 'TRADE_UP_COST', titre: 'Monter d’un grade dans la même catégorie : matériaux payés pour 1 reçu',
    valeur: 6, unite: 'payés pour 1 reçu, par grade', statut: 'mesurée', date: '2026-11-10', source: `${MESURE} (G1 → G2 : 6 pour 1)`, controle: 'à remesurer',
  },
  {
    id: 'echangeurs.taux.descendre', nom: 'TRADE_DOWN_GAIN', titre: 'Descendre d’un grade dans la même catégorie : matériaux reçus pour 1 payé',
    valeur: 3, unite: 'reçus pour 1 payé, par grade', statut: 'mesurée', date: '2026-11-10', source: `${MESURE} (G5 → G1 : 81 pour 1)`, controle: 'à remesurer',
  },
  {
    id: 'echangeurs.taux.categorie', nom: 'TRADE_CATEGORY_PENALTY', titre: 'Changer de catégorie (même type) : le taux est divisé par',
    valeur: 6, unite: 'facteur', statut: 'mesurée', date: '2026-11-10', source: `${MESURE} (G5 d’une catégorie → G1 d’une autre : 13,5 pour 1)`, controle: 'à remesurer',
  },
  {
    id: 'echangeurs.type', nom: 'TRADE_SAME_TYPE', titre: 'On n’échange qu’entre matériaux du même type (matières premières, manufacturés, données), chez l’échangeur de ce type',
    valeur: true, unite: 'règle', statut: 'publiée', date: '2026-11-10', source: 'règle du jeu : trois sortes d’échangeurs (Raw, Manufactured, Encoded : TraderType du journal MaterialTrade) ; matériaux gardiens et thargoïdes non échangeables', controle: 'manuel',
  },
]);

export const ECHANGEURS = D;
export const FICHES = D.fiches;
export const TRADE_UP_COST = D.v('TRADE_UP_COST');
export const TRADE_DOWN_GAIN = D.v('TRADE_DOWN_GAIN');
export const TRADE_CATEGORY_PENALTY = D.v('TRADE_CATEGORY_PENALTY');
