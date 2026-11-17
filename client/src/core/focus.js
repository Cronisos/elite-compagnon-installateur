// Focus au clavier dans une fenêtre modale (core/Modale.jsx) : Tab et Maj+Tab tournent dans la fenêtre au lieu de
// partir sur la page derrière.

/** Éléments qu'on peut atteindre avec Tab. */
export const FOCUSABLES = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Élément où envoyer le focus quand Tab (ou Maj+Tab, `arriere`) sortirait de la liste `elements`, ou null si le
 * navigateur peut faire seul (on reste dans la fenêtre). `actuel` : l'élément qui a le focus.
 */
export function focusSuivant(elements, actuel, arriere = false) {
  if (!elements.length) return null;
  const premier = elements[0];
  const dernier = elements[elements.length - 1];
  const dedans = elements.includes(actuel);
  if (arriere) return !dedans || actuel === premier ? dernier : null;
  return !dedans || actuel === dernier ? premier : null;
}
