// Colonnes JSON de la base (structure d'une route, étapes d'un projet, étiquettes d'une boucle…), lues ligne par ligne.
//
// Avant, chaque colonne était lue par un JSON.parse nu : une seule ligne abîmée (base modifiée à la main, écriture
// coupée d'une ancienne version) renvoyait une erreur 500 pour toute la liste, et arrêtait la synchronisation des
// routes suivantes. Ici, la ligne fautive vaut `fallback`, et un avertissement le dit dans la console (une fois par
// ligne et par lancement, pas à chaque affichage).

const warned = new Set();
const WARNED_MAX = 500;

/**
 * Valeur d'une colonne JSON, ou `fallback` si elle est illisible ou refusée par `accept`.
 * @param {unknown} text contenu de la colonne (texte JSON)
 * @param {*} fallback valeur rendue si la colonne est illisible
 * @param {{ label?: string, accept?: (v: unknown) => boolean, warn?: (msg: string) => void }} [o]
 */
export function parseJsonColumn(text, fallback, { label = 'Colonne JSON', accept = () => true, warn = console.warn } = {}) {
  let value;
  let ok = false;
  try {
    value = JSON.parse(String(text));
    ok = accept(value);
  } catch {
    ok = false;
  }
  if (ok) return value;
  if (!warned.has(label)) {
    if (warned.size >= WARNED_MAX) warned.clear();
    warned.add(label);
    warn(`${label} : donnée illisible en base, ignorée (la ligne reste, le reste de la liste s'affiche).`);
  }
  return fallback;
}
