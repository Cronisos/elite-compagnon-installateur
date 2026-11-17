// Pavé tactile (core/PaveTactile.jsx) : quels gros boutons montrer à chaque niveau. Fonctions pures, testées par
// paveVue.test.js. À la racine : « Mode de jeu » puis les rubriques du plan (core/navigation.js). Dans un menu :
// « Ouvrir la page » quand l'entrée a sa propre page, puis ses enfants. Un bouton à enfants descend d'un niveau ;
// un bouton sans enfants ouvre sa page dans la fenêtre principale.

import { PLAN, aPlat, estUnePage } from './navigation.js';

export const MODE = Object.freeze({ id: 'mode', titre: 'Mode de jeu', icone: '◌', mode: true });

/**
 * @param pile entrées ouvertes, de la racine au niveau affiché ([] : racine)
 * @returns { titre, boutons: [{ id, titre, icone, sous, chemin, page }] } ; sous : il ouvre un sous-menu ; page :
 *          bouton « Ouvrir la page » de l'entrée affichée
 */
export function vuePave(pile = [], plan = PLAN) {
  const haut = pile.at(-1);
  if (!haut) {
    return {
      titre: 'Menu',
      boutons: [MODE, ...plan].map((e) => ({ id: e.id, titre: e.titre, icone: e.icone, sous: Boolean(e.enfants) || Boolean(e.mode), chemin: e.chemin ?? null, mode: Boolean(e.mode) })),
    };
  }
  if (haut.mode) return { titre: MODE.titre, boutons: [], mode: true };
  // Sa propre page, si aucun enfant ne la reprend (Mes vaisseaux : la flotte ; Activités : ses cartes)
  const aPage = estUnePage(haut);
  return {
    titre: haut.titre,
    boutons: [
      ...(aPage ? [{ id: `${haut.id}-page`, titre: `Ouvrir « ${haut.titre} »`, icone: '↗', sous: false, chemin: haut.chemin, page: true }] : []),
      ...(haut.enfants || []).map((e) => ({ id: e.id, titre: e.titre, icone: e.icone || '•', sous: Boolean(e.enfants), chemin: e.chemin })),
    ],
  };
}

/** Fil du pavé : « Menu › Activités › Minage ». */
export const filPave = (pile = []) => ['Menu', ...pile.map((e) => e.titre)].join(' › ');

export const MAX_FAVORIS = 8;

/** Clé d'un favori : le chemin d'une page (« /combat ») ou « mode:<id> » pour un mode de jeu. */
export const cleFavori = (b) => (b.modeId ? `mode:${b.modeId}` : b.chemin);

/**
 * Boutons de la page des favoris, dans l'ordre choisi : une page du plan (titre et icône du menu ; une page qui en
 * contient d'autres garde le titre de l'entrée la plus haute) ou un mode de jeu. Un favori qui n'existe plus est sauté.
 */
export function favorisVue(favoris = [], plan = PLAN, modes = []) {
  const entrees = aPlat(plan).map((chaine) => chaine.at(-1));
  return favoris.map((cle) => {
    if (cle.startsWith('mode:')) {
      const m = modes.find((x) => x.id === cle.slice(5));
      return m ? { id: cle, titre: m.label, icone: m.icon, modeId: m.id, cle } : null;
    }
    const e = entrees.find((x) => x.chemin === cle);
    return e ? { id: cle, titre: e.titre, icone: e.icone || '•', chemin: e.chemin, cle } : null;
  }).filter(Boolean);
}

/** Ajoute ou retire un favori (nouvelle liste) ; plein (MAX_FAVORIS), un ajout est refusé. */
export function basculerFavori(favoris = [], cle) {
  if (favoris.includes(cle)) return favoris.filter((x) => x !== cle);
  return favoris.length >= MAX_FAVORIS ? favoris : [...favoris, cle];
}
