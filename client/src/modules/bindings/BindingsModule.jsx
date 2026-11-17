// Module « Commandes du jeu » : Mes commandes (assignations reclassées, recherche, où les trouver dans le menu du jeu)
// et la Garde des commandes (le jeu ignore-t-il ton profil ?). Les onglets suivent le plan (core/navigation.js).

import { NavLink, Route, Routes } from 'react-router';
import BindingsPage from './BindingsPage.jsx';
import MesCommandesPage from './MesCommandesPage.jsx';
import PageIntrouvable from '../../core/PageIntrouvable.jsx';

export default function BindingsModule() {
  return (
    <div className="module">
      <nav className="tabs">
        <NavLink to="/commandes/mes-commandes">Mes commandes</NavLink>
        <NavLink to="/commandes" end>Garde des commandes</NavLink>
      </nav>
      <Routes>
        <Route index element={<BindingsPage />} />
        <Route path="mes-commandes" element={<MesCommandesPage />} />
        <Route path="*" element={<PageIntrouvable retour="/commandes" nom="Commandes du jeu" />} />
      </Routes>
    </div>
  );
}
