// Balayage d'un EEP en SRV. Le jeu ne donne ni la position ni la taille des EEP : on marque le centre, puis le bord
// du cercle. L'app trace alors les cercles concentriques qui couvrent tout le disque avec la portée du scanner, au
// plus court, et compte ce que le scanner a déjà vu, détours compris, sur une grille posée à plat autour du centre.
// Seules les positions en SRV comptent : c'est son scanner qui voit les gisements.

import { surfaceRoute, turn } from './geo.js';

// Portée de détection du scanner du SRV (m), mesurée en jeu le 7 nov. 2026 : un gisement apparaît à 1,5 km. Il reste
// affiché jusqu'à 4,5 km une fois trouvé, mais c'est la détection qui compte. La marge de conduite (MARGE_SUIVI) se
// prend sur l'espacement des cercles, pas sur cette portée.
export const SCAN = 1500;
export const SECTORS = 36; // tranches de 10° par cercle
const DONE = 0.9; // part d'une tranche balayée pour la compter faite
const MAX_CELLS = 200; // cellules par côté de la grille de couverture
const MIN_CELL = 50; // m
export const MIN_RADIUS = 200; // m : bord marqué trop près du centre en dessous
const LOOKAHEAD = 600; // m : point visé devant toi sur le cercle
// Marge de conduite : personne ne suit le pointillé au mètre près. Les cercles sont espacés comme si le scanner portait
// 300 m de moins : à 300 m du pointillé, d'un côté ou de l'autre, toute la bande du cercle est encore vue.
export const MARGE_SUIVI = 300;
/** Portée utilisée pour placer les cercles (la couverture, elle, compte la vraie portée). */
const portee = (scan, marge) => Math.max(scan / 2, scan - marge);
const MAX_TRAIL = 5000; // positions gardées entre le centre et le bord

/**
 * Étapes du balayage d'un disque de rayon `radius`, de l'extérieur vers le centre. Chaque cercle est au plus petit
 * rayon qui voit encore le bord pas encore couvert (bord − portée), et couvre une bande de deux portées ; quand il ne
 * reste qu'un disque plus petit que la portée, un passage au centre suffit.
 * `min`–`max` : les rayons où le cercle couvre encore toute sa bande. Ils ne diffèrent que pour le dernier cercle,
 * quand il voit aussi le centre : tout rayon entre bord − portée et la portée convient (le plus petit fait le tour
 * le plus court).
 */
export function planSweep(radius, scanReel = SCAN, marge = MARGE_SUIVI) {
  const scan = portee(scanReel, marge);
  const steps = [];
  let outer = radius;
  while (outer > scan) {
    const inner = Math.max(0, outer - 2 * scan);
    steps.push({ kind: 'ring', radius: outer - scan, min: outer - scan, max: inner + scan, outer, inner });
    outer -= 2 * scan;
  }
  // Reste un petit disque au centre : un passage par le centre, sauf s'il tient dans la marge (le scanner le voit déjà)
  if (outer > marge) steps.push({ kind: 'center', radius: 0, outer, inner: 0 });
  return steps;
}

/** Longueur du parcours (m) : les cercles, plus la descente du bord jusqu'au dernier cercle ou au centre. */
export function routeLength(radius, steps) {
  if (!steps.length) return 0;
  const rings = steps.reduce((sum, s) => sum + 2 * Math.PI * s.radius, 0);
  return rings + (radius - steps[steps.length - 1].radius);
}

/** Position à plat autour du centre (m, x vers l'est, y vers le nord), exacte en distance au centre. */
export function project(center, pos, planetRadius) {
  const { distance, bearing } = surfaceRoute(center, pos, planetRadius);
  const a = (bearing * Math.PI) / 180;
  return { x: distance * Math.sin(a), y: distance * Math.cos(a), d: distance, theta: bearing };
}

const angleOf = (x, y) => ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
const onSurface = (p) => p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude);

function bad(message) {
  const err = new Error(message);
  err.status = 400;
  err.publicMessage = message;
  return err;
}

export class Sweep {
  /** marge : écart toléré avec le cercle à suivre (« Sur le cercle ✓ », la route verte sur la carte). */
  constructor(scan = SCAN, marge = MARGE_SUIVI) {
    this.marge = marge;
    this.scan = scan;
    this.clear();
  }

  clear() {
    this.center = null; // { latitude, longitude, body, system, planetRadius }
    this.radius = null;
    this.trail = [];
    this.grid = null;
    this.direction = 1; // 1 = sens des aiguilles d'une montre vu de dessus, -1 = l'inverse
    this.lastTheta = null;
    this.startedAt = null;
  }

  get state() {
    if (!this.center) return 'empty';
    return this.radius == null ? 'center' : 'ready';
  }

  /** Centre de l'EEP : là où tu es. Efface le balayage précédent. */
  setCenter(here) {
    if (!onSurface(here) || !here.body || !here.planetRadius) throw bad('Position au sol inconnue : approche-toi de la planète.');
    this.clear();
    this.center = { latitude: here.latitude, longitude: here.longitude, body: here.body, system: here.system || null, planetRadius: here.planetRadius };
    this.startedAt = new Date().toISOString();
  }

  /** Bord du cercle : là où tu es. Le rayon en découle, puis le plan ; le trajet depuis le centre compte déjà. */
  setEdge(here) {
    if (!this.center) throw bad('Marque d’abord le centre de l’EEP.');
    if (!onSurface(here) || here.body !== this.center.body) throw bad('Tu n’es pas sur la planète du centre marqué.');
    const { d } = project(this.center, here, this.center.planetRadius);
    if (d < MIN_RADIUS) throw bad(`Tu es à ${Math.round(d)} m du centre : roule jusqu’au bord du cercle.`);
    this.radius = d;
    this.build();
    for (const p of this.trail) this.cover(p.x, p.y);
    this.trail = [];
  }

  /** Grille de couverture : pour chaque cellule du disque, son étape et sa tranche. */
  build(bits = null) {
    const R = this.radius;
    this.steps = planSweep(R, this.scan, this.marge);
    const { cell, n } = gridSize(R);
    const slots = new Int32Array(n * n).fill(-1);
    const totals = new Int32Array(this.steps.length * SECTORS);
    const band = 2 * portee(this.scan, this.marge); // même découpage que planSweep
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -R + (i + 0.5) * cell;
        const y = -R + (j + 0.5) * cell;
        const d = Math.hypot(x, y);
        if (d > R) continue;
        const step = Math.min(this.steps.length - 1, Math.floor((R - d) / band));
        const slot = step * SECTORS + Math.min(SECTORS - 1, Math.floor(angleOf(x, y) / (360 / SECTORS)));
        slots[k(i, j, n)] = slot;
        totals[slot]++;
      }
    }
    this.grid = { cell, n, slots, totals, covered: new Uint8Array(n * n), counts: new Int32Array(totals.length), seen: 0, cells: totals.reduce((a, b) => a + b, 0) };
    if (bits) {
      const g = this.grid;
      for (let c = 0; c < g.covered.length && c < bits.length; c++) {
        if (!bits[c] || g.slots[c] < 0) continue;
        g.covered[c] = 1;
        g.counts[g.slots[c]]++;
        g.seen++;
      }
    }
  }

  /** Le scanner voit tout ce qui est à moins de sa portée de (x, y). Renvoie le nombre de cellules nouvelles. */
  cover(x, y) {
    const g = this.grid;
    const R = this.radius;
    const s = this.scan;
    const lo = (v) => Math.max(0, Math.floor((v - s + R) / g.cell));
    const hi = (v) => Math.min(g.n - 1, Math.floor((v + s + R) / g.cell));
    let added = 0;
    for (let j = lo(y); j <= hi(y); j++) {
      const cy = -R + (j + 0.5) * g.cell;
      for (let i = lo(x); i <= hi(x); i++) {
        const c = k(i, j, g.n);
        if (g.covered[c] || g.slots[c] < 0) continue;
        const cx = -R + (i + 0.5) * g.cell;
        if ((cx - x) ** 2 + (cy - y) ** 2 > s * s) continue;
        g.covered[c] = 1;
        g.counts[g.slots[c]]++;
        g.seen++;
        added++;
      }
    }
    return added;
  }

  /** Nouvelle position. Seul le SRV balaie (son scanner) ; le sens du tour se déduit de ta façon de tourner. */
  move(here) {
    if (!this.center || !onSurface(here) || here.body !== this.center.body) return 0;
    const p = project(this.center, here, this.center.planetRadius);
    if (p.d > 300) {
      if (this.lastTheta != null) {
        const delta = ((p.theta - this.lastTheta + 540) % 360) - 180;
        if (Math.abs(delta) >= 2) {
          this.direction = delta > 0 ? 1 : -1;
          this.lastTheta = p.theta;
        }
      } else this.lastTheta = p.theta;
    }
    if (here.vehicle !== 'srv') return 0;
    if (this.state === 'center') {
      if (this.trail.length >= MAX_TRAIL) return 0;
      this.trail.push({ x: p.x, y: p.y });
      return 1;
    }
    return this.cover(p.x, p.y);
  }

  /** Tranches faites de chaque étape. */
  stepsView() {
    const g = this.grid;
    return this.steps.map((s, i) => {
      const sectors = [];
      for (let t = 0; t < SECTORS; t++) {
        const slot = i * SECTORS + t;
        sectors.push(g.totals[slot] === 0 || g.counts[slot] / g.totals[slot] >= DONE ? 1 : 0);
      }
      const done = sectors.filter(Boolean).length;
      return { ...s, sectors, done: done === SECTORS, progress: done / SECTORS };
    });
  }

  /**
   * Repères de la planète posés sur la carte : ceux du disque, et un peu au-delà du bord (20 %).
   * `marks` : repères bruts (latitude, longitude, body…), `auto` vrai pour le repère « fin du dernier minage ».
   */
  marksView(marks) {
    const c = this.center;
    return marks
      .filter((w) => w.body === c.body && Number.isFinite(w.latitude) && Number.isFinite(w.longitude))
      .map((w) => {
        const p = project(c, w, c.planetRadius);
        return {
          id: w.id, label: w.label, category: w.category, x: p.x, y: p.y, d: p.d,
          ore: w.ore || null, drills: w.drills ?? null,
          depleted: Boolean(w.depletedAt), unprofitable: Boolean(w.unprofitable), auto: Boolean(w.auto),
        };
      })
      .filter((m) => m.d <= this.radius * 1.2);
  }

  /** Ce que montre la fenêtre de balayage, pour ta position (et les repères de la planète, s'il y en a). */
  view(here, marks = []) {
    const base = { state: this.state, scan: this.scan, marge: this.marge, startedAt: this.startedAt };
    if (!this.center) return base;
    const c = this.center;
    const same = onSurface(here) && here.body === c.body;
    const p = same ? project(c, here, c.planetRadius) : null;
    const you = p && { x: p.x, y: p.y, d: p.d, theta: p.theta, heading: here.heading ?? null, vehicle: here.vehicle || null };
    const out = { ...base, body: c.body, system: c.system, center: { latitude: c.latitude, longitude: c.longitude }, you, onBody: same };
    if (this.state !== 'ready') return out;

    const steps = this.stepsView();
    const current = steps.findIndex((s) => !s.done);
    const g = this.grid;
    Object.assign(out, {
      radius: this.radius,
      steps,
      current: current < 0 ? null : current,
      covered: g.cells ? g.seen / g.cells : 1,
      route: routeLength(this.radius, this.steps),
      direction: this.direction,
      done: current < 0,
      marks: this.marksView(marks),
    });
    if (current >= 0 && p) out.guide = this.guide(steps[current], p, here.heading);
    return out;
  }

  /**
   * Où aller : un point du cercle un peu devant toi, dans ton sens de rotation, ou le centre. Le cercle visé est le
   * plus court (bord − portée) ; si le cercle a de la marge (min–max) et que tu roules dedans, tout est vu quand
   * même : c'est bon (`inBand`), et on te laisse sur ton rayon.
   */
  guide(step, p, heading) {
    let tx = 0;
    let ty = 0;
    let offset = null;
    let inBand = false;
    if (step.kind === 'ring' && step.radius > 0) {
      offset = p.d - step.radius;
      const min = step.min ?? step.radius;
      const max = step.max ?? step.radius;
      inBand = max > min + 1 && p.d >= min - this.marge && p.d <= max + this.marge;
      const radius = inBand ? Math.min(max, Math.max(min, p.d)) : step.radius;
      const a = ((p.d > 1 ? p.theta : 0) * Math.PI) / 180 + (this.direction * LOOKAHEAD) / radius;
      tx = radius * Math.sin(a);
      ty = radius * Math.cos(a);
    }
    const bearing = angleOf(tx - p.x, ty - p.y);
    return {
      kind: step.kind,
      radius: step.radius,
      offset,
      onRing: offset != null && (Math.abs(offset) <= this.marge || inBand),
      near: offset != null && Math.abs(offset) <= this.marge,
      inBand,
      distance: step.kind === 'center' ? p.d : Math.abs(offset),
      bearing: Math.round(bearing),
      turn: Number.isFinite(heading) ? turn(bearing, heading) : null,
    };
  }

  toJSON() {
    return {
      center: this.center,
      radius: this.radius,
      scan: this.scan,
      direction: this.direction,
      startedAt: this.startedAt,
      trail: this.trail,
      covered: this.grid ? Buffer.from(this.grid.covered).toString('base64') : null,
    };
  }

  /**
   * Relu sans confiance (fichier local ou carte reçue) : date ISO ou rien, trace bornée, couverture exacte ou rien. Une
   * couverture qui n'a pas la taille de la grille (champ piégé, base64 abîmé) est ignorée : le balayage repart à zéro.
   */
  static fromJSON(data, scan = SCAN, marge = MARGE_SUIVI) {
    const s = new Sweep(scan, marge);
    if (!data?.center) return s;
    s.center = data.center;
    s.direction = data.direction === -1 ? -1 : 1;
    s.startedAt = isoDate(data.startedAt);
    s.trail = Array.isArray(data.trail)
      ? data.trail.slice(0, MAX_TRAIL).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)).map((p) => ({ x: p.x, y: p.y }))
      : [];
    if (Number.isFinite(data.radius) && data.radius >= MIN_RADIUS) {
      s.radius = data.radius;
      s.build(coveredBits(data.covered, data.radius));
    }
    return s;
  }
}

const k = (i, j, n) => j * n + i;

/** Taille de la grille de couverture d'un disque de rayon R (cellule en m, cellules par côté). */
function gridSize(R) {
  const cell = Math.max(MIN_CELL, Math.ceil((2 * R) / MAX_CELLS));
  return { cell, n: Math.ceil((2 * R) / cell) };
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/; // même contrôle que core/imageCheck.js

/**
 * Couverture enregistrée (base64, un octet par cellule) → Uint8Array de la taille exacte de la grille ; null si elle
 * manque ou ne colle pas (pas une chaîne, trop longue, base64 abîmé, mauvaise taille). Le texte est borné avant tout
 * décodage : un champ piégé ne coûte rien.
 */
export function coveredBits(covered, radius) {
  if (typeof covered !== 'string' || !covered || !Number.isFinite(radius) || radius < MIN_RADIUS) return null;
  const { n } = gridSize(radius);
  const attendu = n * n;
  if (covered.length !== Math.ceil(attendu / 3) * 4 || !BASE64.test(covered)) return null;
  const buf = Buffer.from(covered, 'base64');
  return buf.length === attendu ? new Uint8Array(buf) : null;
}

/** Date ISO relue sans confiance (chaîne courte qui se relit en date), sinon null. */
export function isoDate(v) {
  if (typeof v !== 'string' || v.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(v) || !Number.isFinite(Date.parse(v))) return null;
  return v;
}
