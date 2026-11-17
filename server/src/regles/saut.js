// Règles des sauts et du carburant : étoiles récupérables, consommation du FSD, alerte de carburant sur un itinéraire.
// Voir LISEZMOI.md pour changer une règle.

import { domaine } from './fiche.js';

const D = domaine('saut', 'Sauts et carburant', [
  {
    id: 'saut.etoiles.recuperables', nom: 'SCOOPABLE_CLASSES', titre: 'Étoiles où le récupérateur de carburant fonctionne (première lettre de StarClass)',
    valeur: ['O', 'B', 'A', 'F', 'G', 'K', 'M'], unite: 'classes', statut: 'publiée', date: '2026-11-10',
    source: 'règle du jeu « KGB FOAM » (géantes et supergéantes comprises : M_RedGiant, B_BlueWhiteSuperGiant…) ; pas les T Tauri, naines brunes, naines blanches, étoiles à neutrons, trous noirs', controle: 'manuel',
  },
  {
    id: 'saut.carburant.exposant', nom: 'FSD_POWER_CONSTANT', titre: 'Exposant de la consommation du FSD selon sa taille (carburant ∝ distance^exposant)',
    valeur: { 2: 2.0, 3: 2.15, 4: 2.3, 5: 2.45, 6: 2.6, 7: 2.75, 8: 2.9 }, unite: 'par taille de FSD', statut: 'déduite', date: '2026-11-10',
    source: 'constantes du FSD reprises par les outils de la communauté (Coriolis, EDSY) ; l’app ne s’en sert que pour passer d’une distance à une autre : le coefficient vient des vrais sauts du vaisseau', controle: 'manuel',
  },
  {
    id: 'saut.carburant.exposant-mkii', nom: 'FSD_POWER_CONSTANT_MKII', titre: 'Exposant des FSD « Mk II » (overchargebooster_mkii, celui du Caspian), quelle que soit leur taille',
    valeur: 2.45, unite: 'exposant', statut: 'mesurée', date: '2026-11-10',
    source: 'mesurée sur 307 sauts du joueur en Caspian Explorer (FSD taille 8 Mk II, 24 oct. – 10 nov. 2026) : 2,45 colle à 5 % près (jamais sous-estimé de plus), 2,9 (taille 8) sous-estime jusqu’à 61 %', controle: 'manuel',
  },
  {
    id: 'saut.carburant.echantillons', nom: 'FUEL_SAMPLES', titre: 'Sauts récents du vaisseau qui servent à estimer sa consommation',
    valeur: 10, unite: 'sauts', statut: 'déduite', date: '2026-11-10',
    source: 'choix de l’app : médiane des 10 derniers sauts du même vaisseau avec le même FSD, carburant = k × (distance × masse)^exposant (masse : à vide + soute + carburant). Vérifié sur 964 sauts du joueur (9 vaisseaux) : à 1 % près, sauf le Caspian avant la fiche Mk II. Sans les sauts boostés (étoile à neutrons, naine blanche, injection FSD)', controle: 'manuel',
  },
  {
    id: 'saut.carburant.marge', nom: 'FUEL_MARGIN', titre: 'Marge sur la consommation estimée (cargaison, carburant, erreur de l’estimation)',
    valeur: 1.15, unite: 'facteur', statut: 'déduite', date: '2026-11-10',
    source: 'choix de l’app : +15 % sur l’estimation, pour alerter un peu trop tôt plutôt que trop tard', controle: 'manuel',
  },
  {
    id: 'saut.carburant.sauts-alerte', nom: 'FUEL_ALERT_JUMPS', titre: 'Sauts à venir que le carburant doit couvrir, sinon alerte',
    valeur: 2, unite: 'sauts', statut: 'déduite', date: '2026-11-10',
    source: 'demande du joueur (10 nov. 2026) : alerte si le carburant ne permet pas les 2 sauts suivants, récupérateur compris s’il y en a un', controle: 'manuel',
  },
]);

export const SAUT = D;
export const FICHES = D.fiches;
export const SCOOPABLE_CLASSES = D.v('SCOOPABLE_CLASSES');
export const FSD_POWER_CONSTANT = Object.freeze({ ...D.v('FSD_POWER_CONSTANT') });
export const FSD_POWER_CONSTANT_MKII = D.v('FSD_POWER_CONSTANT_MKII');
export const FUEL_SAMPLES = D.v('FUEL_SAMPLES');
export const FUEL_MARGIN = D.v('FUEL_MARGIN');
export const FUEL_ALERT_JUMPS = D.v('FUEL_ALERT_JUMPS');
