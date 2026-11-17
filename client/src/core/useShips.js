// Vaisseaux, côté interface : rôles de tous les vaisseaux, vaisseau où tu es, et avis de bascule vers un rôle principal,
// lus au serveur puis tenus à jour en temps réel. Lecture seule : rien n'est écrit à l'ouverture d'une page.

import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useEvent } from './stream.js';

/** Lit `path` une fois, puis suit le message temps réel `event` (qui donne la même chose). */
function useLive(path, event, initial, pick = (d) => d) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    let alive = true;
    api(path).then((d) => alive && setValue(pick(d))).catch(() => {});
    return () => {
      alive = false;
    };
  }, [path]);
  useEvent(event, (d) => setValue(pick(d)));
  return value;
}

/** Rôles de tous les vaisseaux ({ "43": { primary, secondary } }) et roleOf(shipId). */
export function useShipRoles() {
  const ships = useLive('/ships/roles', 'ships:roles', {}, (d) => (d && typeof d.ships === 'object' && d.ships ? d.ships : {}));
  const roleOf = (shipId) => (shipId == null || !Object.hasOwn(ships, String(shipId)) ? null : ships[String(shipId)]);
  return { ships, roleOf };
}

/** Vaisseau où tu es : { shipId, title, model, name, nickname, role } (shipId null s'il est inconnu), ou null au chargement. */
export function useCurrentShip() {
  return useLive('/ships/current', 'ships:current', null);
}

/** Avis de bascule en cours ({ mode, shipId, ship, at, until }), ou null. */
export function useSwitchNotice() {
  return useLive('/overlay/switch', 'overlay:switch', null);
}

/** Mode proposé d'après ce que tu fais ({ mode, reason, discreet, canRemember, shipId, source }), ou null. */
export function useSuggestion() {
  return useLive('/overlay/suggest', 'overlay:suggest', null);
}
