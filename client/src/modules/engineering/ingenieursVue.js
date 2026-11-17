// Cartes des ingénieurs (onglet Ingénieurs) : familles de modules pour les filtres (comme Inara), ce que fait chaque
// ingénieur au grade le plus haut, et son état chez TOI (débloqué, rang, invité…). Fonctions pures, testées par
// ingenieursVue.test.js. Données : GET /api/modules/engineering/engineers.

/** Noms français des groupes de modules absents des données de référence. */
export const NOMS_GROUPES = Object.freeze({
  advmc: 'Multicanon avancé', amr: 'Lance-missiles avancé', cc: 'Contrôleur de drones collecteurs',
  fx: 'Contrôleur de drones de ravitaillement', hb: 'Contrôleur de drones perce-soute', pc: 'Contrôleur de drones prospecteurs',
  ss: 'Scanner de surface détaillé', csl: 'Lance-produits caustiques',
});

/** Familles de modules, dans l'ordre des filtres. */
export const FAMILLES = Object.freeze([
  { id: 'thermiques', titre: 'Armes thermiques', groupes: ['bl', 'pl', 'ul'] },
  { id: 'cinetiques', titre: 'Armes cinétiques', groupes: ['mc', 'advmc', 'c', 'fc'] },
  { id: 'explosives', titre: 'Armes explosives', groupes: ['mr', 'amr', 'tp', 'nl'] },
  { id: 'mixtes', titre: 'Armes mixtes', groupes: ['pa', 'rg'] },
  { id: 'defense', titre: 'Défense', groupes: ['ch', 'ec', 'hs', 'po', 'csl'] },
  { id: 'boucliers', titre: 'Boucliers', groupes: ['sg', 'bsg', 'psg', 'sb', 'scb'] },
  { id: 'blindage', titre: 'Blindage et renforts', groupes: ['bh', 'hr'] },
  { id: 'propulsion', titre: 'FSD et propulseurs', groupes: ['fsd', 't', 'fi'] },
  { id: 'energie', titre: 'Générateur et distributeur', groupes: ['pp', 'pd'] },
  { id: 'scanners', titre: 'Scanners et détecteurs', groupes: ['s', 'ws', 'kw', 'cs', 'ss'] },
  { id: 'drones', titre: 'Contrôleurs de drones', groupes: ['cc', 'fx', 'hb', 'pc'] },
  { id: 'divers', titre: 'Divers', groupes: ['am', 'fs', 'ls', 'rf'] },
]);

const FAMILLE_DU_GROUPE = new Map(FAMILLES.flatMap((f) => f.groupes.map((g) => [g, f.id])));
export const familleDe = (grp) => FAMILLE_DU_GROUPE.get(grp) ?? 'divers';

/** Nom français d'un groupe de modules. */
export const nomGroupe = (grp, labels) => NOMS_GROUPES[grp] || labels?.groups?.[grp] || grp;

/**
 * Ce que fait l'ingénieur, une ligne par module, au grade le plus haut qu'il propose (comme Inara : « G5 : Propulseurs »),
 * du plus haut grade au plus bas, puis par nom.
 */
export function lignesOffres(offres, labels) {
  const max = new Map();
  for (const [grp, , grade] of offres || []) max.set(grp, Math.max(max.get(grp) ?? 0, Number(grade) || 0));
  return [...max]
    .map(([grp, grade]) => ({ grp, grade, nom: nomGroupe(grp, labels), famille: familleDe(grp) }))
    .sort((a, b) => b.grade - a.grade || a.nom.localeCompare(b.nom, 'fr'));
}

/** Familles que propose un ingénieur. */
export const famillesDe = (offres) => new Set((offres || []).map(([grp]) => familleDe(grp)));

/** État chez toi, pour le badge : { texte, ton, rang } (ton : 'debloque', 'invite', 'connu', 'inconnu'). */
export function etatIngenieur(state) {
  const p = state?.progress;
  if (p === 'Unlocked') return { texte: state.rank != null ? `Débloqué · rang ${state.rank}` : 'Débloqué', ton: 'debloque', rang: state.rank ?? null, progres: state.rankProgress ?? null };
  if (p === 'Invited') return { texte: 'Invité', ton: 'invite', rang: null, progres: null };
  if (p === 'Known') return { texte: 'Connu', ton: 'connu', rang: null, progres: null };
  return { texte: 'Pas encore découvert', ton: 'inconnu', rang: null, progres: null };
}

/** Initiales pour le portrait par défaut : « Bill Turner » → « BT », « The Dweller » → « TD », « Tod 'The Blaster' McQuinn » → « TM ». */
export function initiales(nom) {
  const mots = String(nom || '').replace(/'[^']*'/g, ' ').split(/\s+/).filter(Boolean);
  if (!mots.length) return '?';
  const lettres = mots.length === 1 ? mots[0].slice(0, 2) : `${mots[0][0]}${mots.at(-1)[0]}`;
  return lettres.toUpperCase();
}

/** Filtre des cartes par famille (null : toutes). */
export const filtrerFamille = (ingenieurs, famille) => (famille ? ingenieurs.filter((e) => famillesDe(e.offers).has(famille)) : ingenieurs);
