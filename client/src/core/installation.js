// Textes sur l'installation de l'app, montrés au joueur. Un membre de l'escadron n'a ni terminal ni npm : on lui
// conseille l'installateur. La commande ne s'affiche que pour qui développe (npm run dev), et c'est celle du projet
// (npm run installer), pas un « npm install » à la main qui laisserait partir la télémétrie de Prisma.
// Overlay coupé exprès (ELITE_NO_OVERLAY, état { disabled: true } du serveur) : réinstaller n'y changerait rien, le texte
// le dit tel quel.

const DEV = Boolean(typeof import.meta !== 'undefined' && import.meta.env?.DEV);

const COUPE = 'Fenêtres en jeu coupées (ELITE_NO_OVERLAY) : aucune ne s’ouvre.';
const COUPE_COURT = 'Fenêtres en jeu coupées (ELITE_NO_OVERLAY)';

/**
 * Overlay (fenêtres en jeu) indisponible sur ce PC.
 * @param o.coupe overlay coupé exprès (state.disabled du serveur), et non absent
 */
export function texteOverlayAbsent({ coupe = false } = {}, dev = DEV) {
  if (coupe) return COUPE;
  return dev
    ? "Fenêtres en jeu indisponibles : l'overlay n'est pas installé (lance « npm run installer » à la racine du projet)."
    : "Fenêtres en jeu indisponibles : relance l'installateur d'Enova.";
}

/** Version courte, à côté d'un bouton. */
export function texteOverlayAbsentCourt({ coupe = false } = {}, dev = DEV) {
  if (coupe) return COUPE_COURT;
  return dev ? 'Fenêtres en jeu indisponibles (npm run installer)' : 'Fenêtres en jeu indisponibles : relance l’installateur';
}
