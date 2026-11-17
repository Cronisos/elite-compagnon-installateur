// Foreuses du Rhino : textes et calculs d'affichage, sans React (testés à part).

export const READY_COLOR = '#5fd38d';
export const WAIT_COLOR = '#9fb3c8';
export const UNKNOWN_COLOR = '#f4f6f8';
export const DANGER_COLOR = '#ff6b6b';

/** Durée lisible : « < 1 min », « 7 min », « 1 h 05 ». */
export function ago(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const min = Math.floor(Math.max(0, ms) / 60000);
  if (min < 1) return '< 1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

/**
 * Où en est une foreuse à l'instant `now` (horloge du PC, la même que celle du serveur) : temps depuis sa dernière
 * vidange (ou sa pose), prête ou non d'après son cycle mesuré. Sans cycle mesuré, on ne dit pas « prête ».
 */
export function drillState(d, now = Date.now()) {
  const last = Date.parse(d?.lastAt);
  const since = Number.isFinite(last) ? Math.max(0, now - last) : null;
  const cycle = Number.isFinite(d?.cycleMs) ? d.cycleMs : null;
  const ready = cycle == null || since == null ? null : since >= cycle;
  const readyIn = ready === false ? cycle - since : null;
  let label = '';
  if (ready) label = 'prête';
  else if (ready === false) label = `prête dans ${ago(readyIn)}`;
  const color = ready ? READY_COLOR : ready === false ? WAIT_COLOR : UNKNOWN_COLOR;
  return { since, cycle, ready, readyIn, label, color };
}

/** « vidée il y a 7 min » ou « posée il y a 2 min ». */
export function sinceText(d, now = Date.now()) {
  const { since } = drillState(d, now);
  return `${d?.lastKind === 'pose' ? 'posée' : 'vidée'} il y a ${ago(since)}`;
}

/** Tonnes : « 23 t ». */
export const tons = (n) => (n == null ? '—' : `${Math.round(n).toLocaleString('fr-FR')} t`);

/**
 * Cadrage de la petite carte des foreuses (sans balayage) : centre et échelle pour que toutes les foreuses, et toi,
 * tiennent dans un disque de rayon `size`, sans zoomer plus que `minSpan` mètres de large.
 */
export function fitMap(points, { size = 100, minSpan = 400 } = {}) {
  const pts = points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!pts.length) return { cx: 0, cy: 0, k: size / (minSpan / 2) };
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const half = Math.max(minSpan / 2, ...pts.map((p) => Math.hypot(p.x - cx, p.y - cy)));
  return { cx, cy, k: (size * 0.88) / half };
}

/** Une distance « ronde » pour l'échelle de la petite carte : 50, 100, 200, 500 m, 1, 2, 5 km… */
export function scaleBar(metersAcross) {
  const steps = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  return steps.findLast((s) => s <= metersAcross / 3) ?? steps[0];
}
