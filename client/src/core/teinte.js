// L'app aux couleurs du HUD : la teinte calculée par le serveur (module Couleurs du HUD, GET /teinte : les oranges de
// l'app vus à travers la matrice du jeu) posée en variables CSS sur la page (--acc-rgb, --acc2-rgb, --accent-clair),
// que styles.css et les fenêtres en jeu utilisent partout à la place de l'orange. Chaque fenêtre de l'app la lit
// (fenêtre principale, pages détachées, MAR, pavé, fenêtres en jeu), et la relit quand la couleur change.

import { useEffect } from 'react';
import { api } from './api.js';
import { useEvent } from './stream.js';

const rgb = (c) => (Array.isArray(c) && c.length === 3 && c.every((x) => Number.isInteger(x) && x >= 0 && x <= 255) ? c : null);

/** Variables CSS d'une teinte ({ acc, acc2, clair } en 0…255), ou null si elle est illisible. */
export function variablesTeinte(couleurs) {
  const acc = rgb(couleurs?.acc);
  const acc2 = rgb(couleurs?.acc2);
  const clair = rgb(couleurs?.clair);
  if (!acc || !acc2 || !clair) return null;
  return { '--acc-rgb': acc.join(', '), '--acc2-rgb': acc2.join(', '), '--accent-clair': `rgb(${clair.join(', ')})` };
}

/** Pose la teinte sur la page (rien si elle est illisible : l'app garde son orange). */
export function appliquerTeinte(couleurs, el = typeof document !== 'undefined' ? document.documentElement : null) {
  const v = variablesTeinte(couleurs);
  if (!v || !el) return false;
  for (const [k, val] of Object.entries(v)) el.style.setProperty(k, val);
  return true;
}

/** Lit la teinte au chargement de la page et à chaque changement de couleur du HUD (ou du réglage « suivre »). */
export function useTeinte() {
  const lire = () => api('/modules/hudcolours/teinte').then((t) => appliquerTeinte(t?.couleurs)).catch(() => {});
  useEffect(() => {
    lire();
  }, []);
  useEvent('hudcolours:update', lire);
}
