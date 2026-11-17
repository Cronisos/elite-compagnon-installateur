// Règles des textes que le jeu écrit dans le journal (langue, clés brutes, entités, noms connus, tri du marché).
// Voir LISEZMOI.md pour changer une règle. Le nettoyage lui-même est dans core/text.js.

import { domaine } from './fiche.js';

const D = domaine('textes', 'Textes du jeu', [
  {
    id: 'textes.langue.attendue', nom: 'EXPECTED_GAME_LANGUAGE', titre: 'Langue du jeu attendue (Fileheader.language)',
    valeur: 'French/FR', unite: 'Fileheader.language', statut: 'mesurée', date: '2026-11-07',
    source: 'Fileheader.language de tes 49 journaux (23 oct. → 7 nov. 2026)', controle: 'auto',
  },
  {
    id: 'textes.cles.brutes', nom: 'RAW_KEY_RE', titre: 'Clé de traduction écrite à la place du texte (« $Nom_De_La_Cle; »)',
    valeur: '^\\$([^\\s;]+);$', unite: 'expression régulière', statut: 'mesurée', date: '2026-11-07',
    source: '« $TacticalSuit_Class1_Name; » dans 17 SuitName_Localised et 1 Name_Localised (BuySuit) de tes journaux', controle: 'à remesurer',
  },
  {
    id: 'textes.entites.html', nom: 'NAMED_ENTITIES', titre: 'Entités HTML que le jeu laisse dans son texte',
    valeur: '&nbsp;', unite: 'entité vue', statut: 'mesurée', date: '2026-11-07',
    source: '6 LocalisedName (MissionAccepted) et 4 Message_Localised (ReceiveText) de tes journaux ; les autres entités sont décodées par prudence', controle: 'à remesurer',
  },
  {
    id: 'textes.noms.combinaisons', nom: 'KEY_NAMES', titre: 'Noms français des combinaisons quand le jeu n’écrit que la clé',
    valeur: { explorationsuit: 'Combinaison Artemis', flightsuit: 'Combinaison de vol', tacticalsuit: 'Combinaison Dominator', utilitysuit: 'Combinaison Maverick' },
    unite: 'famille de clé → nom', statut: 'à vérifier', statutDetail: 'mesurée (Artemis, de vol, Maverick) · à vérifier (Dominator)', date: '2026-11-07',
    source: 'SuitName_Localised et BuySuit.Name_Localised de tes journaux ; Dominator déduit (jamais écrit en français par le jeu)', controle: 'à remesurer',
  },
  {
    id: 'textes.marche.tri', nom: 'MARKET_SORT', titre: 'Ordre des marchandises du marché : par catégorie, puis par nom (alphabet français)',
    valeur: { locale: 'fr', keys: ['category', 'name'] }, unite: 'tri', statut: 'à vérifier', date: '2026-11-07',
    source: 'rapport des joueurs, idée 7 ; SrvSurvey PR 371 (sept. 2025)', controle: 'manuel',
  },
]);

export const TEXTES = D;
export const FICHES = D.fiches;
export const EXPECTED_GAME_LANGUAGE = D.v('EXPECTED_GAME_LANGUAGE');
export const RAW_KEY_RE = new RegExp(D.v('RAW_KEY_RE'));
export const KEY_NAMES = new Map(Object.entries(D.v('KEY_NAMES')));
export const MARKET_SORT = Object.freeze({ locale: D.v('MARKET_SORT').locale, keys: Object.freeze([...D.v('MARKET_SORT').keys]) });
