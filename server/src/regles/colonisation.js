// Règles de la colonisation : invariants du dépôt de construction, vérifiés par le module à chaque lecture (un écart est
// noté dans le diagnostic, GET /diagnostics, jamais corrigé en silence). Voir LISEZMOI.md pour changer une règle.

import { domaine } from './fiche.js';

/** [clé du module, titre, source] : la clé reste celle du diagnostic du module. */
const INVARIANTS = [
  ['progress-formula', 'ConstructionProgress = Σ livré ÷ Σ demandé, en tonnes (tolérance 1e-6)', 'vérifié sur EDDI, SrvSurvey et BGS-Tally'],
  ['complete-progress', 'ConstructionComplete vaut true exactement quand l\'avancement atteint 1', 'fixture BGS-Tally'],
  ['payment-constant', 'Payment constant pour une même marchandise, sur tous les chantiers', 'valeurs identiques d\'avril 2025 à 2026 (EDAPITool)'],
  ['required-stable', 'RequiredAmount ne change pas pour un même chantier', 'jamais vu changer en cours de chantier'],
  ['provided-monotonic', 'ProvidedAmount ne baisse jamais', 'cumul de toutes les livraisons'],
  ['contribution-counted', 'Entre deux lectures, Δ livré ≥ tes livraisons (ColonisationContribution)', 'EDAPITool : Δ livré − tes livraisons = livré par d\'autres'],
  ['contribution-known', 'Ce que tu livres fait partie des besoins du chantier (même symbole)', 'normalisation des noms (EDCT, SrvSurvey)'],
  ['name-case-depot', 'Name du dépôt en minuscules (« $steel_name; »)', 'EDCT, log du 31 juil. 2026'],
  ['name-case-contribution', 'Name de la livraison en PascalCase (« $Steel_name; »)', 'EDCT, log du 31 juil. 2026'],
  ['complete-event', 'CompleteConstruction : événement rare, à comparer avec ConstructionComplete du dépôt', 'EDDiscovery : « only seen briefly »'],
  ['complete-read', 'La fin d\'un chantier est lue au dépôt (ConstructionComplete: true) avant que la station change', 'fixture BGS-Tally ; nom et MarketID changent à la fin (port primaire)'],
];

const D = domaine('colonisation', 'Colonisation', INVARIANTS.map(([cle, titre, source]) => ({
  id: `colonisation.chantier.${cle}`, nom: `COLONISATION_${cle.toUpperCase().replace(/-/g, '_')}`, cle, titre,
  valeur: true, unite: 'invariant vérifié à chaque lecture', statut: 'publiée', date: '2026-11-07', source, controle: 'auto',
})));

export const COLONISATION = D;
export const FICHES = D.fiches;
/** Forme du module ({ id: clé, label, source }), servie par son diagnostic. */
export const COLONISATION_RULES = D.fiches.map((f) => ({ id: f.cle, label: f.titre, source: f.source }));
