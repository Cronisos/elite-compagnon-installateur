// Onglets d'une entrée du plan (core/navigation.js) : ses pages, dans l'ordre du menu. Les rubriques et leurs pages
// montrent ainsi les mêmes onglets que le menu ☰, sans liste à tenir à part (Mes vaisseaux : Mes vaisseaux · Builds ;
// Builds : Mes builds · Nouveau build · Comparer…).

import { NavLink } from 'react-router';
import { entree, estUnePage, exact } from './navigation.js';

export default function Onglets({ de, sous = false }) {
  const parent = entree(de);
  if (!parent?.enfants) return null;
  return (
    <nav className={`tabs${sous ? ' tabs-sous' : ''}`} aria-label={parent.titre}>
      {/* L'entrée elle-même quand elle est une page (Mes vaisseaux : la flotte), allumée seulement sur elle */}
      {estUnePage(parent) && <NavLink to={parent.chemin} end>{parent.titre}</NavLink>}
      {parent.enfants.map((e) => (
        <NavLink key={e.id} to={e.chemin} end={exact(e, parent.enfants)}>
          {e.titre}
        </NavLink>
      ))}
    </nav>
  );
}
