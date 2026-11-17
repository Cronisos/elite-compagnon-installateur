// Nombre de cases d'EEP d'une planète (page de la planète) : jamais plus que ce que le serveur accepte pour un numéro
// d'EEP (1 à 999). Le nombre vient de Spansh (relevés EDDN, publiés par n'importe qui) quand la planète n'a pas encore
// été scannée : 4 294 967 296 faisait planter la page (page blanche), 30 000 000 saturait l'onglet.

export const MAX_TILES = 999; // borne de wholeNumber côté serveur (waypoints/index.js)

const whole = (v) => (Number.isInteger(v) && v > 0 ? Math.min(v, MAX_TILES) : 0);

/** Cases à montrer : le nombre d'EEP connu, ou au moins jusqu'au plus grand numéro déjà noté (et `number`). */
export function tileCount(planet, number = 0) {
  const sites = Array.isArray(planet?.sites) ? planet.sites : [];
  return Math.max(whole(planet?.count), whole(number), ...sites.map((s) => whole(s?.number)));
}
