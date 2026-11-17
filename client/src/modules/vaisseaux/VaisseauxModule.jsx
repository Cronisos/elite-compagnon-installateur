// Rubrique « Mes vaisseaux » : ses onglets (Mes vaisseaux · Builds, d'après core/navigation.js), puis la flotte.

import { Route, Routes } from 'react-router';
import Onglets from '../../core/Onglets.jsx';
import FlottePage from './FlottePage.jsx';
import PageIntrouvable from '../../core/PageIntrouvable.jsx';

export default function VaisseauxModule() {
  return (
    <div className="module">
      <Onglets de="vaisseaux" />
      <Routes>
        <Route index element={<FlottePage />} />
        <Route path="*" element={<PageIntrouvable retour="/vaisseaux" nom="Mes vaisseaux" />} />
      </Routes>
    </div>
  );
}
