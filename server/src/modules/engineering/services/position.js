// Position du joueur (R10) : le dernier StarPos lu dans le journal (arrivée dans un système, saut, saut du
// porte-vaisseaux) et les distances à vol d'oiseau jusqu'aux ingénieurs. Rien n'est deviné : sans StarPos lisible, la
// position est inconnue et l'itinéraire le dit.

/** Événements de position, en plus de Location (déjà dans PLACE_EVENTS de ranks.js). */
export const POSITION_EVENTS = ['FSDJump', 'CarrierJump'];

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Coordonnées { x, y, z } d'un StarPos [x, y, z] (trois nombres finis), sinon null. */
export function starPosOf(v) {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(finite)) return null;
  return v.slice();
}

/**
 * Position d'un événement Location, FSDJump ou CarrierJump : { system, systemAddress, starPos: [x, y, z], at, event },
 * ou null (autre événement, StarPos illisible).
 */
export function positionOf(ev) {
  if (!ev || !['Location', 'FSDJump', 'CarrierJump'].includes(ev.event)) return null;
  const starPos = starPosOf(ev.StarPos);
  if (!starPos) return null;
  return {
    system: typeof ev.StarSystem === 'string' ? ev.StarSystem : null,
    systemAddress: Number.isSafeInteger(ev.SystemAddress) ? ev.SystemAddress : null,
    starPos,
    at: typeof ev.timestamp === 'string' ? ev.timestamp : null,
    event: ev.event,
  };
}

const xyz = (p) => (Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p);

/** Distance à vol d'oiseau en al, entre deux points [x, y, z] ou { x, y, z } (mélangés permis). */
export function distanceLy(a, b) {
  const p = xyz(a);
  const q = xyz(b);
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
}

/** Points de départ proposés en plus de ta position (coordonnées EDSM, comme meta.regions d'engineers.json). */
export const START_POINTS = Object.freeze({
  sol: Object.freeze({ system: 'Sol', starPos: Object.freeze([0, 0, 0]) }),
  colonia: Object.freeze({ system: 'Colonia', starPos: Object.freeze([-9530.5, -910.28125, 19808.125]) }),
});
