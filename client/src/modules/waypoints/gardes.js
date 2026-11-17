// Petites gardes de la page Mes repères, testées à part (gardes.test.js) : Échap qui remonte d'un écran, et action
// lancée une seule fois même sur un double clic.

/**
 * Échap remonte d'un écran (↩), sauf s'il a déjà servi à fermer une fenêtre (Modale : elle le marque, preventDefault),
 * si une fenêtre est encore ouverte, ou si tu es en train de taper dans un champ.
 */
export function echapRemonte(e, doc = globalThis.document) {
  if (e.key !== 'Escape' || e.defaultPrevented) return false;
  if (doc?.querySelector?.('[aria-modal="true"]')) return false;
  return !e.target?.closest?.('input, textarea, select');
}

/**
 * Lance `fn` une seule fois à la fois : un deuxième appel pendant que le premier tourne est ignoré (renvoie null).
 * `verrou` : objet { current } gardé d'un affichage à l'autre (useRef) ; `occupe(vrai/faux)` grise le bouton.
 */
export async function uneFois(verrou, fn, occupe = () => {}) {
  if (verrou.current) return null;
  verrou.current = true;
  occupe(true);
  try {
    return await fn();
  } finally {
    verrou.current = false;
    occupe(false);
  }
}
