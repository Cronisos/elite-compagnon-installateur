// Place par défaut d'une fenêtre de l'overlay, quand aucune position n'a été fixée (📌) : calcul pur, sans Electron,
// testé par place.test.js (npm test -w overlay).
//
// Plusieurs fenêtres s'ouvrent d'elles-mêmes (alerte des commandes, compagnon, vente de mérites, liste de courses de la
// colonisation, refroidissement FSD, saut du porteur, Coup d'œil pendant l'alerte du rachat…) : elles ne doivent pas
// s'ouvrir les unes sur les autres. On prend donc la première place libre de l'écran :
//   - HUD (bandeaux et fenêtres carrées) : en haut au centre, sous les fenêtres déjà ouvertes dans cette colonne ;
//   - fenêtre libre : sa place préférée si elle en a une (compagnon), sinon la plus haute possible, en partant de la
//     droite : en haut à droite, puis en haut à gauche, puis à côté ou sous les fenêtres déjà ouvertes, au plus près
//     d'un bord de l'écran.
// Trois essais, du plus exigeant au moins exigeant :
//   1. une fenêtre libre laisse la colonne des HUD (au centre) aux HUD, et rien ne se place sous une fenêtre qui prend
//      la hauteur de son contenu (Coup d'œil, liste de courses) : elle peut grandir vers le bas ;
//   2. la colonne des HUD n'est plus réservée ;
//   3. seules comptent les tailles actuelles.
// Sans aucune place libre, l'ancienne place par défaut : en haut à droite, ou HUD empilés au centre. Mieux vaut une
// fenêtre qui en couvre une autre qu'une fenêtre hors de l'écran.
// Un tiroir (Top 10 du balayage) sort sur le côté gauche de sa fenêtre : sa largeur est réservée à gauche.

const MARGIN = 20; // du bord droit ou gauche de l'écran
const TOP = 40; // du haut de l'écran
const GAP = 10; // entre deux fenêtres

const intersects = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (r, area) => r.x >= area.x && r.y >= area.y && r.x + r.width <= area.x + area.width && r.y + r.height <= area.y + area.height;
const finite = (r) => r && [r.x, r.y, r.width, r.height].every(Number.isFinite);

/**
 * @param {object} p
 * @param {{ width: number, height: number }} p.size taille de la nouvelle fenêtre
 * @param {{ x: number, y: number, width: number, height: number }} p.area zone de l'écran
 * @param {Array<{ x: number, y: number, width: number, height: number, grows?: boolean }>} p.others fenêtres déjà
 *   ouvertes (tiroirs compris, cachées comprises : elles peuvent être montrées à tout moment)
 * @param {boolean} p.free fenêtre libre (sinon HUD)
 * @param {{ x: number, y: number } | null} [p.preferred] place préférée (fenêtre libre)
 * @param {number} [p.drawer] largeur des tiroirs de la fenêtre, réservée à sa gauche
 * @param {boolean} [p.grows] la fenêtre prend la hauteur de son contenu : la colonne sous elle lui est réservée
 * @param {number} p.hudWidth largeur de la colonne des HUD (HUD_SIZE.width)
 * @param {number} [p.hudIndex] nombre de HUD déjà ouverts (ancienne place par défaut)
 * @param {number} [p.hudStep] hauteur d'un HUD et de son écart (ancienne place par défaut)
 * @returns {{ x: number, y: number }}
 */
function findPlace({ size, area, others = [], free, preferred = null, drawer = 0, grows = false, hudWidth, hudIndex = 0, hudStep = 134 }) {
  const w = size.width;
  const h = size.height;
  const top = area.y + TOP;
  const bottom = area.y + area.height;
  const columnX = area.x + Math.round((area.width - hudWidth) / 2);
  const placed = others.filter(finite);
  // Emprise de la fenêtre à la place (x, y) : ses tiroirs à gauche, et jusqu'au bas de l'écran si elle grandit
  const footprint = (x, y, reserveGrowth) => ({ x: x - drawer, y, width: w + drawer, height: reserveGrowth && grows ? Math.max(h, bottom - y) : h });
  const obstacle = (o, reserveGrowth) => (reserveGrowth && o.grows ? { ...o, height: Math.max(o.height, bottom - o.y) } : o);

  // Places essayées : la place préférée, puis en haut à droite, en haut à gauche, à côté et sous chaque fenêtre ouverte
  // (les plus hautes d'abord, puis les plus près d'un bord). Pour un HUD, d'abord la colonne du centre, de haut en bas.
  const anywhere = [];
  if (free && preferred && Number.isFinite(preferred.x) && Number.isFinite(preferred.y)) anywhere.push({ ...preferred, first: true });
  const xs = [area.x + area.width - MARGIN - w, area.x + MARGIN + drawer];
  const ys = [top];
  for (const o of placed) {
    xs.push(o.x - GAP - w, o.x + o.width + GAP + drawer, o.x, o.x + o.width - w);
    ys.push(o.y, o.y + o.height + GAP);
  }
  for (const y of ys) for (const x of xs) anywhere.push({ x, y });
  // À hauteur égale, la plus près d'un bord de l'écran (le centre reste au jeu et aux HUD), la droite d'abord
  const fromEdge = (c) => Math.min(area.x + area.width - MARGIN - (c.x + w), c.x - drawer - (area.x + MARGIN));
  anywhere.sort((a, b) => (b.first ? 1 : 0) - (a.first ? 1 : 0) || a.y - b.y || fromEdge(a) - fromEdge(b) || b.x - a.x);
  const column = [top, ...placed.map((o) => o.y + o.height + GAP)].sort((a, b) => a - b).map((y) => ({ x: columnX, y, column: true }));
  // Hors de sa place préférée et de la colonne des HUD, une fenêtre garde sa marge aux bords gauche et droit
  const sides = { x: area.x + MARGIN, y: area.y, width: area.width - 2 * MARGIN, height: area.height };

  const hudColumn = { x: columnX, y: area.y, width: hudWidth, height: area.height };
  const tries = free
    ? [
        { candidates: anywhere, reserveGrowth: true, reserveColumn: true },
        { candidates: anywhere, reserveGrowth: true },
        { candidates: anywhere, reserveGrowth: false },
      ]
    : [
        { candidates: column, reserveGrowth: true },
        { candidates: column, reserveGrowth: false },
        // Colonne du centre pleine (beaucoup de HUD ouverts) : à côté, plutôt que les uns sur les autres
        { candidates: anywhere, reserveGrowth: true },
        { candidates: anywhere, reserveGrowth: false },
      ];
  for (const { candidates, reserveGrowth, reserveColumn = false } of tries) {
    const blocks = placed.map((o) => obstacle(o, reserveGrowth));
    if (reserveColumn) blocks.push(hudColumn);
    for (const c of candidates) {
      const x = Math.round(c.x);
      const y = Math.round(c.y);
      const r = footprint(x, y, reserveGrowth);
      if (y < top && !c.first) continue;
      if (!inside(r, c.first || c.column ? area : sides)) continue;
      if (blocks.some((b) => intersects(r, b))) continue;
      return { x, y };
    }
  }
  // Aucune place libre : l'ancienne place par défaut
  return free ? { x: area.x + area.width - w - MARGIN, y: top } : { x: columnX, y: top + hudIndex * hudStep };
}

module.exports = { findPlace, MARGIN, TOP, GAP };
