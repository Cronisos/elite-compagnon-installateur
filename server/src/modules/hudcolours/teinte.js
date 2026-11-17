// L'app aux couleurs du HUD : les oranges de l'app passés par la matrice de couleurs du jeu (celle du fichier
// GraphicsConfigurationOverride.xml), pour que fenêtres, MAR, pavé et fenêtres en jeu aient la couleur du cockpit.
// Même calcul que l'aperçu du module (client/src/modules/hudcolours/colour.js, espace sRGB, le choix par défaut) :
// affiché = R × MatrixRed + V × MatrixGreen + B × MatrixBlue, borné à 0…1. Une teinte trop sombre pour être lue sur le
// fond de l'app est éclaircie. Fonctions pures, testées par hudcolours.test.js.

/** Oranges de l'app (styles.css) : accent, accent soutenu, accent clair (textes), en 0…255. */
export const ORANGES = Object.freeze({ acc: [255, 154, 60], acc2: [255, 138, 31], clair: [255, 208, 138] });
const LUMINANCE_MIN = 0.4; // en dessous, l'accent ne se lit plus sur le fond sombre

const borne = (x) => Math.min(1, Math.max(0, x));
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Couleur [r, v, b] (0…255) vue à travers la matrice du jeu ; éclaircie si elle devient illisible. */
export function aTravers(m, rgb) {
  const [r, g, b] = rgb.map((c) => c / 255);
  let out = [0, 1, 2].map((i) => borne(r * m.red[i] + g * m.green[i] + b * m.blue[i]));
  const l = luminance(out);
  if (l > 0 && l < LUMINANCE_MIN) {
    const f = Math.min(LUMINANCE_MIN / l, 1 / Math.max(...out));
    out = out.map((c) => borne(c * f));
  }
  return out.map((c) => Math.round(c * 255));
}

const identite = (m) => ['red', 'green', 'blue'].every((k, i) => m[k].every((x, j) => Math.abs(x - (i === j ? 1 : 0)) < 1e-4));

/** Teinte de l'app pour une matrice (null : couleurs d'origine) : { identite, couleurs: { acc, acc2, clair } }. */
export function teinteApp(m) {
  if (!m || identite(m)) return { identite: true, couleurs: { ...ORANGES } };
  return { identite: false, couleurs: Object.fromEntries(Object.entries(ORANGES).map(([k, c]) => [k, aTravers(m, c)])) };
}
