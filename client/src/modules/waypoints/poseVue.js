// Saisie du tiroir « repère posé » (SweepPose.jsx) : foreuses proposées, numéro d'EEP tapé au pavé.

const plat = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Minerais de « Autre… » qui répondent à la recherche (accents et majuscules ignorés) : ceux qui commencent par le texte
 * d'abord, puis ceux qui le contiennent. `libre` : le texte tapé, à prendre tel quel s'il n'est pas déjà dans la liste.
 */
export function chercherMinerais(liste, texte) {
  const t = plat(texte);
  const noms = Array.isArray(liste) ? liste : [];
  if (!t) return { trouves: noms, libre: null };
  const debut = noms.filter((n) => plat(n).startsWith(t));
  const dedans = noms.filter((n) => !plat(n).startsWith(t) && plat(n).includes(t));
  const propre = String(texte).trim().replace(/\s+/g, ' ').slice(0, 60);
  const libre = noms.some((n) => plat(n) === t) ? null : propre.charAt(0).toUpperCase() + propre.slice(1);
  return { trouves: [...debut, ...dedans], libre };
}

/** Nombres de foreuses proposés d'un clic. */
export const FOREUSES = [1, 2, 3, 4, 5, 6];

/** Chiffre ajouté au numéro en cours (3 chiffres au plus, pas de zéro en tête). */
export function ajouterChiffre(texte, chiffre) {
  const t = `${texte}${chiffre}`.replace(/^0+/, '');
  return t.slice(0, 3);
}

/** Numéro à enregistrer : undefined si rien n'a été tapé, null si effacé, sinon l'entier. */
export function numeroSaisi(texte) {
  if (texte == null) return undefined;
  if (texte === '') return null;
  const n = Number(texte);
  return Number.isInteger(n) && n > 0 ? n : null;
}
