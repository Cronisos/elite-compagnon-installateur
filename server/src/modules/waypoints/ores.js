// Minerai d'un repère, pour le colorer sur la carte du balayage : d'abord son nom (tapé à la main, fautes comprises :
// « Iridiul », « rho »), sinon ce qui a été raffiné d'après ses notes (« raffiné : Iridium, Or »).

/**
 * Les autres minerais et matières que l'on peut miner (noms français du jeu), proposés par « Autre… » du tiroir repère
 * en plus des 12 courants. Un repère qui porte exactement l'un de ces noms a ce minerai (couleur blanche sur la carte).
 * Minerais planétaires du minage au Rhino ajoutés d'après le marché du jeu relevé par l’auteur (12 nov. 2026) : Dunite de
 * périclase, Thortveitite, Diamant, Saphir, Rubis, Hélium 3, Bastanäsite, Opale du vide.
 */
export const AUTRES_MINERAIS = [
  'Alexandrite', 'Aluminium', 'Bastanäsite', 'Bauxite', 'Benitoïte', 'Bertrandite', 'Béryllium', 'Bismuth',
  'Bromellite', 'Clathrate de méthane', 'Cobalt', 'Coltan', 'Cristaux de monohydrate de méthanol', 'Cryolite',
  'Cuivre', 'Diamant', 'Diamants basse température', 'Dunite de périclase', 'Eau', 'Gallite', 'Gallium', 'Goslarite',
  'Grandidiérite', 'Hafnium 178', 'Hélium 3', 'Hydroxyde de lithium', 'Indite', 'Indium', 'Jadéite', 'Lanthane',
  'Lépidolite', 'Lithium', 'Moissanite', 'Monazite', 'Musgravite', 'Opale du vide', 'Opales du Vide',
  'Oxygène liquide', 'Painite', 'Peroxyde d’hydrogène', 'Praséodyme', 'Pyrophyllite', 'Rubis', 'Rutile', 'Samarium',
  'Saphir', 'Serendibite', 'Taaffeite', 'Tantale', 'Thallium', 'Thorium', 'Thortveitite', 'Tritium', 'Uraninite',
];

/**
 * Nom de minerai tapé à la main, propre : espaces simples, première lettre en majuscule, 2 à 40 caractères faits de
 * lettres, de chiffres, d'espaces, d'apostrophes et de tirets (« Dunite de périclase », « Hélium 3 »). Sinon null.
 */
export function nomMinerai(texte) {
  const t = String(texte ?? '').trim().replace(/\s+/g, ' ');
  if (t.length < 2 || t.length > 40 || !/^[\p{L}][\p{L}\p{N} '’-]*$/u.test(t)) return null;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Le minerai de la liste `ores` que désigne ce mot, ou null. */
function oreOfWord(word, ores) {
  if (word === 'or') return ores.find((o) => plain(o) === 'or') || null;
  if (word.length < 3) return null;
  return ores.find((o) => {
    const p = plain(o);
    if (p.length < 3) return false;
    // « rho » → rhodplumsite ; « iridiul » → iridium (mêmes 4 premières lettres)
    return p.startsWith(word) || (word.length >= 4 && p.length >= 4 && word.startsWith(p.slice(0, 4)));
  }) || null;
}

/** Premier minerai trouvé dans un texte, mot par mot. */
function oreIn(text, ores) {
  for (const word of plain(text).split(/[^a-z]+/)) {
    const ore = word && oreOfWord(word, ores);
    if (ore) return ore;
  }
  return null;
}

/**
 * Minerai d'un repère : son nom exact d'abord (« Uraninite » n'est pas de l'uranium), puis un minerai courant dans son
 * nom (fautes comprises), puis la partie « raffiné : … » des notes. `autres` : noms reconnus seulement en entier.
 */
export function oreOf(w, ores, autres = []) {
  const exact = plain(w.label).trim();
  const entier = exact && [...ores, ...autres].find((o) => plain(o) === exact);
  if (entier) return entier;
  const fromLabel = oreIn(w.label, ores);
  if (fromLabel) return fromLabel;
  const refined = /raffin[ée]\s*:\s*([^·\n]*)/i.exec(w.notes || '');
  return refined ? oreIn(refined[1], ores) : null;
}
