// Couleurs du HUD : le calcul du jeu (approché, voir SPACES), pour l'aperçu et les préréglages.
//
// Sens de la matrice (vérifié dans le code de l'éditeur de référence arkku.com/elite/hud_editor) : chaque
// ligne est une couleur D'ORIGINE du jeu, ses trois nombres disent combien elle donne de rouge, de vert et
// de bleu À L'ÉCRAN :   affiché = R × MatrixRed + V × MatrixGreen + B × MatrixBlue   (puis borné à 0…1).
// Le filtre SVG feColorMatrix prend la transposée : sa ligne i (couleur affichée i) vaut
// [MatrixRed[i], MatrixGreen[i], MatrixBlue[i]].

export const IDENTITY = { red: [1, 0, 0], green: [0, 1, 0], blue: [0, 0, 1] };
export const ROWS = [
  ['red', 'MatrixRed', 'Rouge d’origine'],
  ['green', 'MatrixGreen', 'Vert d’origine'],
  ['blue', 'MatrixBlue', 'Bleu d’origine'],
];
export const LIMIT = 3; // le serveur refuse au-delà

// Orange principal du HUD : beaucoup de rouge, un peu moins de la moitié de vert, pas de bleu (≈ #FF7A00)
export const ORANGE = [1, 0.478, 0];
export const ORANGE_HUE = ORANGE[1] * 60; // ≈ 28,7°

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const round = (x, d = 3) => Number(x.toFixed(d)) || 0; // jamais « -0 »

// Espace du calcul, PAS ENCORE VÉRIFIÉ EN JEU :
// - 'srgb' : la matrice s'applique aux valeurs de couleur telles quelles (choix par défaut de l'app) ;
// - 'linear' : sur la lumière linéaire, comme l'aperçu de l'éditeur arkku (feColorMatrix sans
//   color-interpolation-filters : linearRGB par défaut).
// Une même matrice donne des couleurs différentes : le joueur choisit celui qui ressemble à son jeu.
export const SPACES = ['srgb', 'linear'];
export const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const same = (c) => c;

/** Couleur affichée par le jeu pour une couleur d'origine [r, v, b] (0…1). */
export function shown(m, rgb, space = 'srgb') {
  const lin = space === 'linear';
  const [r, g, b] = lin ? rgb.map((c) => toLinear(clamp01(c))) : rgb;
  const out = [0, 1, 2].map((i) => clamp01(r * m.red[i] + g * m.green[i] + b * m.blue[i]));
  return lin ? out.map(toSrgb) : out;
}

/** Valeurs de feColorMatrix (4 × 5, alpha inchangé). */
export function feMatrix(m) {
  const rows = [0, 1, 2].map((i) => `${m.red[i]} ${m.green[i]} ${m.blue[i]} 0 0`);
  return [...rows, '0 0 0 1 0'].join('  ');
}

export function hsvToRgb(h, s, v) {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  const m = v - c;
  return [r + m, g + m, b + m];
}

export function rgbToHsv([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { hue: (h + 360) % 360, sat: max ? d / max : 0, val: max };
}

export const hex = (rgb) => `#${rgb.map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, '0')).join('')}`;
export function parseHex(s) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(s || '').trim());
  if (!m) return null;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
}

/** Teinte que prend le bleu pur quand l'orange passe à la teinte choisie (même décalage). */
export const autoSecondaryHue = (hue) => (((240 + hue - ORANGE_HUE) % 360) + 360) % 360;

/**
 * Matrice à partir de la couleur voulue pour l'orange du HUD (teinte, saturation, luminosité) :
 * - l'orange devient exactement cette couleur ;
 * - le bleu pur (boucliers…) prend la teinte secondaire (par défaut, décalée comme l'orange) ;
 * - le blanc reste blanc autant que possible, le vert garde sa place, et aucun nombre n'est négatif.
 * Teinte d'origine, saturation et luminosité à 100 % : matrice d'origine.
 * space : espace du calcul (voir SPACES) ; en 'linear', le même raisonnement porte sur la lumière linéaire.
 */
export function buildMatrix({ hue, sat, val, secondary = null }, space = 'srgb') {
  const conv = space === 'linear' ? toLinear : same;
  const target = hsvToRgb(hue, sat, val).map(conv);
  const blue = hsvToRgb(secondary ?? autoSecondaryHue(hue), 1, 1).map(conv);
  const g = conv(ORANGE[1]);
  const green = [0, 1, 2].map((c) => {
    const ideal = c === 1 ? 1 : 0; // vert d'origine → vert
    const lo = Math.max(0, (1 - target[c] - blue[c]) / (1 - g)); // blanc encore blanc
    const hi = target[c] / g; // ligne rouge jamais négative
    return Math.min(hi, Math.max(lo, ideal));
  });
  const red = [0, 1, 2].map((c) => target[c] - g * green[c]);
  return roundMatrix({ red, green, blue });
}

export const roundMatrix = (m, d = 3) => ({ red: m.red.map((x) => round(x, d)), green: m.green.map((x) => round(x, d)), blue: m.blue.map((x) => round(x, d)) });

export function sameMatrix(a, b, eps = 1e-4) {
  if (!a || !b) return false;
  return ROWS.every(([k]) => a[k].every((x, i) => Math.abs(x - b[k][i]) <= eps));
}

export function validMatrix(m) {
  return Boolean(m) && ROWS.every(([k]) => Array.isArray(m[k]) && m[k].length === 3 && m[k].every((x) => Number.isFinite(x) && Math.abs(x) <= LIMIT));
}

const formatNumber = (v) => String(Number(v.toFixed(4)) || 0);

/** Bloc à coller dans GraphicsConfigurationOverride.xml (même écriture que le serveur). */
export function snippet(m) {
  return [
    '<GUIColour>',
    '  <Default>',
    '    <LocalisationName>Standard</LocalisationName>',
    ...ROWS.map(([k, tag]) => `    <${tag}>${m[k].map(formatNumber).join(', ')}</${tag}>`),
    '  </Default>',
    '</GUIColour>',
  ].join('\n');
}

// Teintes de départ de l'aperçu, proches de celles du jeu (dessin de l'app, pas une capture)
export const PALETTE = [
  { key: 'orange', label: 'Orange du HUD', where: 'panneaux, radar, textes', rgb: ORANGE },
  { key: 'dark', label: 'Orange sombre', where: 'fonds et bords de panneaux', rgb: [0.6, 0.287, 0] },
  { key: 'white', label: 'Blanc', where: 'textes importants, station', rgb: [1, 1, 1] },
  { key: 'blue', label: 'Bleu', where: 'boucliers, vitesse optimale', rgb: [0.3, 0.62, 1] },
  { key: 'red', label: 'Rouge', where: 'alertes, cibles hostiles', rgb: [1, 0.16, 0.1] },
  { key: 'green', label: 'Vert', where: 'alliés, équipiers', rgb: [0.3, 1, 0.35] },
  { key: 'yellow', label: 'Jaune', where: 'repères de navigation', rgb: [1, 0.84, 0.15] },
];

// --- Teintes qui se ressemblent après la matrice ---

const labF = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);

/** Couleur sRGB (0…1) → CIE L*a*b* (blanc D65) : les écarts y suivent à peu près ceux que voit l'œil. */
export function toLab(rgb) {
  const [r, g, b] = rgb.map((c) => toLinear(clamp01(c)));
  const x = labF((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = labF(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = labF((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** Écart de couleur ΔE (CIE76) : moins de 2 se voit à peine ; l'orange et le rouge d'origine de l'aperçu sont à ≈ 34. */
export function deltaE(a, b) {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

export const CLOSE_DELTA_E = 20;
const PALETTE_RGB = new Map(PALETTE.map((p) => [p.key, p.rgb]));
// Paires à garder distinctes en jeu (clés de PALETTE) et ce que le joueur risque de confondre
const PAIRS = [
  ['orange', 'red', 'les alertes et les cibles hostiles (rouge) se distingueront mal du reste du HUD'],
  ['orange', 'blue', 'les boucliers (bleu) se distingueront mal du reste du HUD'],
  ['orange', 'green', 'les alliés et les équipiers (vert) se distingueront mal du reste du HUD'],
  ['red', 'green', 'les cibles hostiles (rouge) et les alliés (vert) se ressembleront'],
];

/**
 * Teintes que cette matrice rend difficiles à distinguer (ΔE < 20) alors qu'elles se distinguent mieux à
 * l'origine : [{ a, b, text, deltaE }]. Simple indication, d'après les teintes approchées de l'aperçu.
 */
export function closeTints(m, space = 'srgb') {
  const out = [];
  for (const [a, b, text] of PAIRS) {
    const ra = PALETTE_RGB.get(a);
    const rb = PALETTE_RGB.get(b);
    const after = deltaE(shown(m, ra, space), shown(m, rb, space));
    if (after < CLOSE_DELTA_E && after < deltaE(ra, rb)) out.push({ a, b, text, deltaE: Math.round(after) });
  }
  return out;
}

const tint = (id, label, hue, sat, val = 1) => ({ id, label, params: { hue, sat, val, secondary: null } });

/** Préréglages : params (curseurs) ou matrix (fixe). */
export const PRESETS = [
  { id: 'orange', label: 'Orange d’origine', params: { hue: ORANGE_HUE, sat: 1, val: 1, secondary: null } },
  tint('bleu', 'Bleu', 212, 0.8),
  tint('cyan', 'Cyan', 188, 0.85),
  tint('vert', 'Vert', 125, 0.8),
  tint('violet', 'Violet', 275, 0.7),
  tint('rose', 'Rose', 322, 0.65),
  tint('rouge', 'Rouge', 2, 0.82),
  tint('or', 'Or', 46, 0.95),
  tint('blanc', 'Blanc', ORANGE_HUE, 0),
  // Bleu « inversé » : orange → bleu et bleu → orange (boucliers orange), celui de la sauvegarde .bleu.bak
  { id: 'bleu-inverse', label: 'Bleu inversé', note: 'boucliers orange', matrix: { red: [0.2, 0.2, 1], green: [0.1, 0.6, 0.1], blue: [1, 0.6, 0] } },
];

export const presetMatrix = (p, space = 'srgb') => p.matrix || buildMatrix(p.params, space);
export const BLEU_INVERSE = PRESETS.find((p) => p.id === 'bleu-inverse').matrix;
