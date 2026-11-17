// Règles de l'ingénierie, vues comme des fiches du dépôt. Les deux tables vivent dans ingenierie/ (rankRules.js :
// applications, montée de rang ; itineraryRules.js : épingles, atelier à distance, effets, bases), chacune avec ses
// statuts, ses sources et ses observations : pour changer une règle d'ingénierie, c'est là qu'on écrit. Ce fichier les
// présente seulement au format commun (fiche.js) pour l'index et la vigie, sans rien recopier.

import { domaine } from './fiche.js';
import { RANK_RULES, RANK_TABLE, JOURNAUX, RULES_DATE } from './ingenierie/rankRules.js';
import { ITINERARY_RULES, ITINERARY_DATE } from './ingenierie/itineraryRules.js';

/** Titres en français des règles de rang (rankRules.js les documente en commentaires). */
const TITRES_RANG = {
  REMOTE_RANK_GAIN: 'Le rang ne monte pas à l’atelier à distance',
  UNLOCK_RANK: 'Un ingénieur débloqué démarre au rang 1',
  UNLOCK_PROGRESS: 'Un ingénieur débloqué démarre à 0 % du rang 1',
  UNLOCK_START: 'Départ d’un ingénieur pas encore débloqué, pour le calcul',
  CARRY_OVER: 'Report du surplus de progression sur le rang suivant',
  NEXT_GRADE_AT_FULL: 'Le grade suivant ne s’applique qu’une fois le grade en cours à 100 %',
  NEW_BLUEPRINT_RESTARTS: 'Un autre plan sur un module repart au G1',
  LOWER_GRADES_COUNT: 'Les grades sous le maximum du rang comptent aussi pour monter de rang',
  REROLL_FULL_GRADE: 'Refaire un grade déjà à 100 % fait-il monter le rang ?',
  EXPERIMENTAL_RANK_GAIN: 'Part d’un effet expérimental dans la montée de rang',
  PROGRESS_AT_LOAD_ONLY: 'La progression de rang n’est écrite qu’au chargement de la partie',
};
const kebab = (k) => k.toLowerCase().replace(/_/g, '-');
const MESURE_EN_DIRECT = new Set(['REMOTE_RANK_GAIN', 'UNLOCK_RANK', 'UNLOCK_PROGRESS', 'CARRY_OVER', 'NEXT_GRADE_AT_FULL', 'LOWER_GRADES_COUNT']);

const D = domaine('ingenierie', 'Ingénierie', [
  {
    id: 'ingenierie.rangs.applications', nom: 'RANK_TABLE', titre: 'Applications pour finir un grade, et pour monter de rang, selon le rang de l’ingénieur',
    valeur: RANK_TABLE, unite: 'table rang × grade (rankRules.js)', statut: 'mesurée', date: RULES_DATE,
    source: `${JOURNAUX} : il faut (grade + 5 − rang) applications pour finir un grade ; montée de rang déduite des séquences (à vérifier)`, controle: 'auto',
  },
  ...Object.entries(RANK_RULES).map(([k, r]) => ({
    id: `ingenierie.rangs.${kebab(k)}`, nom: `RANK_${k}`, titre: TITRES_RANG[k] || k,
    valeur: r.value ?? null, unite: 'voir rankRules.js', statut: r.status, date: RULES_DATE, source: r.source,
    controle: MESURE_EN_DIRECT.has(k) ? 'auto' : 'à remesurer',
  })),
  // Règles du jeu de l'itinéraire seulement (les choix de l'app et les réglages du calcul n'en sont pas)
  ...ITINERARY_RULES.filter((r) => String(r.kind).includes('jeu')).map((r) => ({
    id: `ingenierie.itineraire.${r.id.toLowerCase()}`, nom: `ITIN_${r.id.toUpperCase()}`, titre: r.text,
    valeur: r.value ?? true, unite: 'voir itineraryRules.js', statut: r.status, date: r.date || ITINERARY_DATE,
    source: typeof r.source === 'string' && r.source.trim() ? r.source : 'voir itineraryRules.js', controle: 'à remesurer',
  })),
]);

export const INGENIERIE = D;
export const FICHES = D.fiches;
