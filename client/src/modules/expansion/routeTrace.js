// Tracé de la carte de la route (RouteMap.jsx), sans React : testé seul.
//
// Jusqu'à 12 systèmes, une seule vague de gauche à droite, comme la carte Discord du Squadron Tracker. Au-delà, les
// noms se chevaucheraient (une route de 65 systèmes était illisible, l’auteur, 19 nov. 2026) : la route devient sinueuse.
// Elle va de gauche à droite sur une ligne, fait demi-tour par un arc, revient de droite à gauche sur la suivante, et
// ainsi de suite ; la carte grandit en hauteur avec le nombre de lignes.

export const W = 1200;
export const SEUIL_SINUEUX = 12; // au-delà de ce nombre de systèmes, la route serpente
export const PAR_LIGNE = 10;
const LIGNE_H = 140; // d'une ligne à la suivante : le vaisseau au-dessus, trois lignes de texte dessous
const X0 = 110;
const X1 = W - 110;
const HAUT = 95;
const BOSSE = 8; // légère courbure de chaque ligne, pour garder l'allure d'une route
const borne = (v) => Math.min(1, Math.max(0, v));

/**
 * Tracé pour `n` systèmes : { sinueux, H, pas, curve(t) → [x, y], slope(t) → degrés }, t de 0 (premier système) à 1
 * (dernier) ; le système k est à t = k / (n − 1). `pas` : nombre de segments pour dessiner toute la route.
 */
export function trace(n) {
  if (!(n > SEUIL_SINUEUX)) {
    return {
      sinueux: false,
      H: 270, // assez haut pour les noms complets sur deux lignes
      pas: 60,
      curve: (t) => [75 + 1050 * t, 125 + 48 * Math.sin(t * 7.4 + 0.5)],
      slope: (t) => (Math.atan2(48 * 7.4 * Math.cos(t * 7.4 + 0.5), 1050) * 180) / Math.PI,
    };
  }
  const last = n - 1;
  const lignes = Math.ceil(n / PAR_LIGNE);
  const dx = (X1 - X0) / (PAR_LIGNE - 1);
  const R = LIGNE_H / 2;
  // Chaque ligne porte PAR_LIGNE systèmes ; le demi-tour vers la ligne suivante vaut un tronçon entre deux systèmes
  const curve = (t) => {
    const u = borne(t) * last;
    const ligne = Math.min(lignes - 1, Math.floor(u / PAR_LIGNE));
    const w = u - ligne * PAR_LIGNE;
    const versDroite = ligne % 2 === 0;
    const y0 = HAUT + ligne * LIGNE_H;
    if (w <= PAR_LIGNE - 1) {
      const bosse = BOSSE * Math.sin((Math.PI * w) / (PAR_LIGNE - 1));
      return [versDroite ? X0 + w * dx : X1 - w * dx, y0 + (versDroite ? -bosse : bosse)];
    }
    const a = -Math.PI / 2 + Math.PI * (w - (PAR_LIGNE - 1));
    return [(versDroite ? X1 : X0) + (versDroite ? 1 : -1) * R * Math.cos(a), y0 + R + R * Math.sin(a)];
  };
  const slope = (t) => {
    const d = 1e-4;
    const a = curve(Math.max(0, t - d));
    const b = curve(Math.min(1, t + d));
    return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  };
  return { sinueux: true, H: HAUT + (lignes - 1) * LIGNE_H + 125, pas: n * 12, curve, slope };
}

/**
 * Pose du vaisseau pour une pente donnée (degrés, 0 = vers la droite) : sur une ligne qui revient vers la gauche, il
 * est retourné en miroir plutôt que tête en bas. `angle` s'applique après le miroir.
 */
export function poseVaisseau(pente) {
  const p = ((pente + 180) % 360 + 360) % 360 - 180;
  if (Math.abs(p) <= 90) return { miroir: false, angle: p };
  return { miroir: true, angle: p > 0 ? 180 - p : -180 - p };
}
