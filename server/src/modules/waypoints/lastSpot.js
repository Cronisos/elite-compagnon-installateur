// Retour au minage : là où tu as raffiné ta dernière tonne en SRV sur une planète. Quand tu reviens sur cette planète
// (atterrissage, ou SRV sorti) après être parti vider ta soute, la boussole s'ouvre d'elle-même vers cet endroit.

import { surfaceRoute } from './geo.js';

export const AUTO_LABEL = '⛏ Fin du dernier minage';
const AWAY_MS = 2 * 60 * 1000; // dernière tonne d'il y a plus de 2 min : tu étais bien reparti
const NEAR_M = 150; // déjà sur place : pas de boussole
const FAR_M = 50000; // plus loin : autre coin de la planète, ce n'est pas un retour

/**
 * Faut-il guider vers ce dernier coin de minage depuis `here` ? Même planète, parti depuis un moment, ni sur place ni
 * à l'autre bout de la planète.
 */
export function shouldGuide(spot, here, now = Date.now()) {
  if (!spot || !here?.body || here.body !== spot.body) return false;
  if (!Number.isFinite(here.latitude) || !Number.isFinite(here.longitude) || !here.planetRadius) return false;
  if (now - Date.parse(spot.at) < AWAY_MS) return false;
  const { distance } = surfaceRoute(here, spot, here.planetRadius);
  return distance >= NEAR_M && distance <= FAR_M;
}
