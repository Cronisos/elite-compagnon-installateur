// Repères regroupés par planète (ou station), rangés par système puis par planète : page Mes repères et fenêtre de
// l'overlay.

const placeKey = (w) => `${w.system || ''}\u0000${w.body || w.station || ''}`;

/** Nom court d'une planète : « Synuefe OU-E c28-2 4 a » → « 4 a » ; le système est rappelé à côté. */
export const shortPlace = (place, system) => (place && system && place.startsWith(`${system} `) ? place.slice(system.length + 1) : place);

/** @returns [{ key, system, place, list }] dans l'ordre système puis planète (« A 1 b » avant « A 1 c », « 2 » avant « 10 ») */
export function groupByPlace(waypoints) {
  const places = [];
  for (const w of [...waypoints].sort((a, b) => placeKey(a).localeCompare(placeKey(b), 'fr', { numeric: true }))) {
    const key = placeKey(w);
    if (places.at(-1)?.key !== key) places.push({ key, system: w.system, place: w.body || w.station || null, list: [] });
    places.at(-1).list.push(w);
  }
  return places;
}
