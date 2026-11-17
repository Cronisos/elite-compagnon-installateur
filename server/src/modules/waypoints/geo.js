// Position et navigation à la surface d'une planète, à partir de Status.json.

const FLAG_LANDED = 1 << 1; // vaisseau posé sur la planète
const FLAG_IN_SHIP = 1 << 24;
const FLAG_IN_FIGHTER = 1 << 25;
const FLAG_IN_SRV = 1 << 26;
const FLAG2_ON_FOOT = 1 << 0;

/** Véhicule du joueur d'après les indicateurs de Status.json. */
export function vehicleOf(status) {
  const f = status?.Flags || 0;
  const f2 = status?.Flags2 || 0;
  if (f2 & FLAG2_ON_FOOT) return 'onfoot';
  if (f & FLAG_IN_SRV) return 'srv';
  if (f & FLAG_IN_FIGHTER) return 'fighter';
  if (f & FLAG_IN_SHIP) return 'ship';
  return null;
}

/**
 * Au sol pour de vrai : en SRV, à pied, ou vaisseau posé. Le survol bas donne aussi latitude, longitude et planète dans
 * Status.json : il ne compte pas.
 */
export function onGround(status) {
  const v = vehicleOf(status);
  return v === 'srv' || v === 'onfoot' || Boolean((status?.Flags || 0) & FLAG_LANDED);
}

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/**
 * Distance au sol (m) et cap initial (°, 0 = nord) d'un point A vers un point B, sur une sphère
 * de rayon r (PlanetRadius de Status.json, en mètres) : formule de haversine.
 */
export function surfaceRoute(a, b, radius) {
  const φ1 = rad(a.latitude);
  const φ2 = rad(b.latitude);
  const Δφ = φ2 - φ1;
  const Δλ = rad(b.longitude - a.longitude);
  const h = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const distance = 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const bearing = (deg(Math.atan2(y, x)) + 360) % 360;
  return { distance, bearing };
}

/** Écart de cap (−180 à +180) : négatif = tourner à gauche. */
export function turn(bearing, heading) {
  return ((bearing - heading + 540) % 360) - 180;
}
