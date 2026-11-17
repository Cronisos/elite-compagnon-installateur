// Appels du module Mes vaisseaux. La flotte est tenue par le serveur (module Ingénierie : où est chaque vaisseau, son
// image) et la configuration de chaque vaisseau par le module Constructeur : on les lit par leur API, jamais en
// important leur code.

import { useEffect, useRef } from 'react';
import { api } from '../../core/api.js';
import { useEvent } from '../../core/stream.js';

const ENG = '/modules/engineering';

// Fiche et résumés (lecture seule) : configuration réelle de chaque vaisseau, calculée par le module Constructeur
const BUILDER = '/modules/builder';

export const vaisseauxApi = {
  flotte: () => api(`${ENG}/fleet`),
  resumes: () => api(`${BUILDER}/fleet/resumes`),
  fiche: (shipId) => api(`${BUILDER}/fleet/${encodeURIComponent(shipId)}/fiche`),
  // Ses builds et « ce qu'il te faut » depuis sa configuration actuelle
  builds: (shipId) => api(`${BUILDER}/fleet/${encodeURIComponent(shipId)}/builds`),
  // Plan d'ingénierie créé à partir d'un build (son lien EDSY), rattaché à ce vaisseau : matériaux nécessaires
  planDepuisBuild: (edsy, shipId) => api(`${ENG}/import`, { method: 'POST', body: { text: edsy, shipId } }),
};

/** Recharge quand la flotte change (journal lu, plan créé ou validé, données de référence mises à jour). */
export function useRechargeFlotte(recharger) {
  const minuterie = useRef(null);
  useEffect(() => () => clearTimeout(minuterie.current), []);
  const plusTard = () => {
    clearTimeout(minuterie.current);
    minuterie.current = setTimeout(recharger, 300);
  };
  useEvent('engineering:update', plusTard);
  useEvent('engineering:refdata', (d) => {
    if (!d?.running) plusTard();
  });
}
