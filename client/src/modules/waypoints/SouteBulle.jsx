// Survol de la case « Vaisseau » du HUD de minage : la ligne du bas du HUD montre ce que contient la soute (Hélium 135 t,
// Iridium 40 t…) à la place du dernier événement, le temps du survol. Rien ne bouge ni ne s'agrandit : la fenêtre garde
// sa taille. Le jeu ne détaille la soute du vaisseau que quand tu es à bord : ce qui y était avant de partir en SRV
// s'affiche en « non détaillé ».

import { useEffect, useRef, useState } from 'react';
import { int } from '../../core/format.js';

/** Rend { survol, ouvert, ligne } : survol va sur la case, ligne remplace la ligne du bas tant qu'ouvert. */
export function useSouteSurvol(items, soute = null) {
  const [ouvert, setOuvert] = useState(false);
  const fermeture = useRef(null);
  useEffect(() => () => clearTimeout(fermeture.current), []);
  const survol = {
    onMouseEnter: () => {
      clearTimeout(fermeture.current);
      setOuvert(true);
    },
    onMouseLeave: () => {
      clearTimeout(fermeture.current);
      fermeture.current = setTimeout(() => setOuvert(false), 150);
    },
  };
  const liste = items || [];
  const detail = liste.reduce((n, x) => n + x.count, 0);
  const inconnu = (Number.isFinite(soute) ? Math.max(soute, detail) : detail) - detail;
  const ligne = liste.length || inconnu > 0 ? (
    <>
      {liste.map((x) => <span key={x.label}><b>{x.label}</b> {int(x.count)} t</span>)}
      {inconnu > 0 && <span>non détaillé {int(inconnu)} t</span>}
    </>
  ) : <span>soute vide</span>;
  return { survol, ouvert, ligne };
}
