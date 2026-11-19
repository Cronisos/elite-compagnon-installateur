// Place du vaisseau sur la carte de la route (RouteMap.jsx), sans React : testé seul. Même règle que la carte Discord
// du Squadron Tracker (tracker/src/card.js) : à tenir ensemble.
//
// Le vaisseau est au-dessus du système où l'on travaille : dès qu'un système s'ouvre (passage de semaine), il y est,
// et il y reste tant qu'on y gagne des mérites ; l'anneau du système dit où l'on en est (l’auteur, 19 nov. 2026). Il ne
// voyage que pendant l'attente du jeudi, une fois le système d'avant complet : il parcourt alors TRANSIT du tronçon au
// fil des jours, sans jamais être « déjà arrivé » sur un système où l'on ne peut pas encore travailler.

export const TRANSIT = 0.9;
const SEMAINE_MS = 7 * 24 * 3600 * 1000;
const borne = (v) => Math.min(1, Math.max(0, v));

/** Part de la semaine déjà écoulée, de 0 à 1 ; `passage` : fin de la semaine en cours (ms). */
export function partSemaine(passage, now = Date.now()) {
  if (!Number.isFinite(passage)) return 0;
  return borne((now - (passage - SEMAINE_MS)) / SEMAINE_MS);
}

/**
 * Position du vaisseau le long de la route, de 0 (premier système) à 1 (dernier).
 *   - index : système en cours ; frac : son avancement (0 à 1) ; last : numéro du dernier système ;
 *   - enAttente : le système d'avant est complet, mais pas encore validé par le jeu (attente du jeudi) ;
 *   - semaine : part de la semaine écoulée (partSemaine).
 */
export function positionVaisseau({ index, frac, last, enAttente = false, semaine = 0 }) {
  if (last < 1) return 0;
  if (index > last) return 1;
  if (index === 0) return 0;
  if (enAttente) return (index - 1 + TRANSIT * borne(semaine)) / last;
  return index / last; // système ouvert : le vaisseau est dessus, quel que soit son avancement (frac)
}

/** Places des flèches de route sur un tronçon, de son système de départ à celui d'arrivée : `n` valeurs de t. */
export function placesFleches(depart, arrivee, n = 6) {
  return Array.from({ length: n }, (_, k) => depart + (arrivee - depart) * (0.16 + (0.7 * k) / (n - 1)));
}
