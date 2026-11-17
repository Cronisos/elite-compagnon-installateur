// Règles de la supercroisière : overdrive (SCO) et son refroidissement. Voir LISEZMOI.md pour changer une règle.

import { domaine } from './fiche.js';

const PLUGIN = 'plugin EDMC SCO-Cooldown 0.1.0 (github.com/elitedangereuse/SCO-Cooldown, 9 oct. 2026, elitedangereuse/ships.py)';

const D = domaine('supercroisiere', 'Supercroisière', [
  {
    id: 'supercroisiere.sco.indicateur', nom: 'SCO_FLAG2', titre: 'Indicateur « SCO actif » dans Status.json (Flags2, bit 20)',
    valeur: 1 << 20, unite: 'masque de Flags2', statut: 'publiée', date: '2026-11-07',
    source: 'doc du journal, Status File (« 20 | 1048576 | Supercruise Overdrive (SCO) Active », elite-journal.readthedocs.io) ; vérifiée sur fsd-status.log (4-7 nov. 2026) : seulement en supercroisière, 3 à 12 s d’affilée', controle: 'à remesurer',
  },
  {
    id: 'supercroisiere.sco.refroidissement', nom: 'SCO_COOLDOWN_MS', titre: 'Refroidissement du SCO selon la génération du vaisseau',
    valeur: { legacy: 17_000, newGeneration: 9_000, caspian: 7_000, unknown: 9_000 }, unite: 'ms', statut: 'à vérifier', date: '2026-11-07',
    source: `${PLUGIN} : anciens 17 s, nouvelle génération 9 s, Caspian 7 s. Relevé du joueur, 5-7 nov. 2026 : Type-11 Prospector, plus court écart 10,2 s sur 14 réactivations, compatible avec 9 s ; rien encore pour les anciens vaisseaux ni pour le Caspian`, controle: 'auto',
  },
  {
    id: 'supercroisiere.sco.nouvelle-generation', nom: 'SCO_NEW_GENERATION', titre: 'Vaisseaux de nouvelle génération (refroidissement court)',
    valeur: ['python_nx', 'type8', 'mandalay', 'cobramkv', 'corsair', 'panthermkii', 'lakonminer', 'smallcombat01_nx', 'mediumtransport01'],
    unite: 'Loadout.Ship en minuscules', statut: 'à vérifier', date: '2026-11-07',
    source: `${PLUGIN} (« FDevIDs shipyard.csv entries from Python Mk II onwards ») ; tout autre vaisseau est ancien`, controle: 'auto',
  },
  {
    id: 'supercroisiere.sco.caspian', nom: 'SCO_CASPIAN', titre: 'Caspian Explorer : à part, refroidissement plus court',
    valeur: 'explorer_nx', unite: 'Loadout.Ship', statut: 'à vérifier', date: '2026-11-07',
    source: `${PLUGIN} (Explorer_NX)`, controle: 'auto',
  },
]);

export const SUPERCROISIERE = D;
export const FICHES = D.fiches;
export const SCO_FLAG2 = D.v('SCO_FLAG2');
export const SCO_COOLDOWN_MS = Object.freeze({ ...D.v('SCO_COOLDOWN_MS') });
export const SCO_NEW_GENERATION_LIST = D.v('SCO_NEW_GENERATION');
export const SCO_CASPIAN = D.v('SCO_CASPIAN');
