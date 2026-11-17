// Galaxie d'une séance de jeu, d'après la version écrite par le jeu (gameversion du Fileheader et du LoadGame).
//
// Le jeu écrit au même endroit les journaux de la galaxie Live (4.x), de la galaxie Legacy (Horizons 3.8) et des
// bêtas. Une partie Legacy ou bêta n'a rien à voir avec l'état Live du joueur : sa flotte, ses matériaux, ses boucles de
// commerce écrasaient ceux de Live jusqu'au relevé Live suivant. Le lecteur de journaux (journalService.js) ne publie
// donc que les séances Live.
//
// Règles reprises du dépôt des règles (server/src/regles/escadron.js : version majeure, marqueurs de bêta, date de séparation), pour une
// seule source dans toute l'app. Avant la séparation des deux galaxies (mise à jour 14, 29 nov. 2022), Horizons 3.8
// jouait dans la galaxie commune, devenue Live : un vieux journal 3.8 d'avant cette date reste lu.

import { fiche } from '../regles/index.js';

const MIN_MAJOR = fiche('escadron.galaxie.live')?.valeur ?? 4;
const BETA_MARKERS = fiche('escadron.galaxie.beta')?.valeur ?? ['alpha', 'beta'];
/** Séparation Live / Legacy (mise à jour 14 du jeu) : avant, une seule galaxie. Fiche escadron.galaxie.separation. */
const SPLIT = Date.parse(fiche('escadron.galaxie.separation')?.valeur);
export const LEGACY_SPLIT_AT = Number.isFinite(SPLIT) ? SPLIT : Date.parse('2022-11-29T00:00:00Z');

const isText = (v) => typeof v === 'string' && v.length > 0;

/**
 * Galaxie d'une version du jeu, à l'heure `at` (texte ISO ou ms) : 'live', 'legacy' ou 'beta'. Version inconnue ou
 * absente : 'live' (rien n'est écarté sans preuve).
 */
export function galaxyOf(gameVersion, at) {
  if (!isText(gameVersion)) return 'live';
  const lower = gameVersion.toLowerCase();
  if (BETA_MARKERS.some((m) => lower.includes(m))) return 'beta';
  const major = Number.parseInt(gameVersion, 10);
  if (!Number.isInteger(major) || major >= MIN_MAJOR) return 'live';
  const t = typeof at === 'number' ? at : Date.parse(at);
  // Heure inconnue : on ne sait pas si c'est d'avant la séparation, on garde
  return Number.isFinite(t) && t >= LEGACY_SPLIT_AT ? 'legacy' : 'live';
}

/** Événements qui disent la version du jeu (début de journal, lancement d'une partie). */
export const GALAXY_EVENTS = Object.freeze(['Fileheader', 'LoadGame']);
