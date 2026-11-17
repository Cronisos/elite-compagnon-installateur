// Règles des foreuses du Rhino (minage de surface). Voir LISEZMOI.md pour changer une règle.
// Plusieurs « règles » ici sont des marges choisies autour de ce que le journal a montré : `observe` dit ce qui a été vu.

import { domaine } from './fiche.js';

const JOURNAL_7_NOV = 'Journal.2026-11-07T091533.01.log';

const D = domaine('foreuses', 'Foreuses du Rhino', [
  {
    id: 'foreuses.nombre.max', nom: 'MAX_DRILLS', titre: 'Foreuses posées au plus',
    valeur: 6, unite: 'foreuses', statut: 'publiée', date: '2026-09-05',
    source: 'journal de développement Frontier d’août 2026 (six foreuses) ; SrvSurvey 2.0.95.48 du 5 sept. 2026 (« 6 positions for 6 rigs »)', controle: 'à remesurer',
  },
  {
    id: 'foreuses.vidange.fin-de-rafale', nom: 'BURST_GAP_MS', titre: 'Plus de ce délai sans raffiner : la rafale est finie',
    valeur: 40_000, unite: 'ms', statut: 'à vérifier', date: '2026-11-07',
    source: `${JOURNAL_7_NOV} ; seuil choisi (= LOOP_GAP_MS du minage)`, observe: 'au plus 25 s entre deux tonnes d’une vidange ; au moins 4 min 47 entre deux vidanges', controle: 'à remesurer',
  },
  {
    id: 'foreuses.vidange.tonnes-min', nom: 'VIDANGE_MIN_TONS', titre: 'Une rafale d’au moins ce tonnage est une vidange de foreuse',
    valeur: 10, unite: 't', statut: 'à vérifier', date: '2026-11-07',
    source: 'journal du 7 nov. 2026 (12 vidanges de 22 à 24 t, dont une en deux fois : 12 + 11 t) ; ramassage à la main : 9 morceaux (Simulation Daily)', controle: 'à remesurer',
  },
  {
    id: 'foreuses.vidange.fusion', nom: 'MERGE_MS', titre: 'Rafale reprise à la même foreuse dans ce délai : même vidange',
    valeur: 3 * 60_000, unite: 'ms', statut: 'à vérifier', date: '2026-11-07',
    source: 'journal du 7 nov. 2026 (vidange de 10:19 en deux fois) ; seuil choisi', observe: 'une reprise 41 s après la fin de la rafale ; au moins 4 min 47 entre deux vidanges', controle: 'à remesurer',
  },
  {
    id: 'foreuses.pose.ecart', nom: 'RIG_SPACING_M', titre: 'Écart minimal entre deux foreuses posées',
    valeur: 100, unite: 'm', statut: 'à vérifier', date: '2026-09',
    source: 'forum Frontier, un seul joueur (fil « Mining Rig closer placement should be allowed », sept. 2026)', controle: 'à remesurer',
  },
  {
    id: 'foreuses.pose.reconnaissance', nom: 'DRILL_MATCH_M', titre: 'Vidange ou pose à moins de cette distance d’une foreuse connue : c’est elle',
    valeur: 50, unite: 'm', statut: 'à vérifier', date: '2026-11-07',
    source: 'déduite de l’écart minimal (la moitié), pour que deux foreuses voisines ne se confondent pas', controle: 'à remesurer',
  },
  {
    id: 'foreuses.destruction.rayon', nom: 'DESTROY_RADIUS_UNVERIFIED_M', titre: 'Rayon au-delà duquel une foreuse serait détruite',
    valeur: 5000, unite: 'm', statut: 'à vérifier', date: '2026',
    source: 'le seul auteur d’EDSMT (edcodex.info, outil 647, alertes à 3,5 et 4,8 km), jamais mesuré par l’escadron', controle: 'manuel',
  },
]);

export const FOREUSES = D;
export const FICHES = D.fiches;
export const MAX_DRILLS = D.v('MAX_DRILLS');
export const BURST_GAP_MS = D.v('BURST_GAP_MS');
export const VIDANGE_MIN_TONS = D.v('VIDANGE_MIN_TONS');
export const MERGE_MS = D.v('MERGE_MS');
export const RIG_SPACING_M = D.v('RIG_SPACING_M');
export const DRILL_MATCH_M = D.v('DRILL_MATCH_M');
export const DESTROY_RADIUS_UNVERIFIED_M = D.v('DESTROY_RADIUS_UNVERIFIED_M');
/** Forme d'avant le dépôt ({ name, value, unit, status, date, source, measured }), lue par le module et ses tests. */
export const DRILL_RULES = D.fiches.map((f) => ({ name: f.nom, value: f.valeur, unit: f.unite, status: f.statut, date: f.date, source: f.source, ...(f.observe ? { measured: f.observe } : {}) }));
