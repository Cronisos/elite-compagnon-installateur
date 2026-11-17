// Module « Règles du jeu » : les fiches en français (RulesPage) et la vigie des règles (VigiePage).
// La vigie est un outil de développement, coupé par défaut (Paramètres) : son onglet n'apparaît que quand elle est
// allumée, ou quand on est déjà sur sa page (lien depuis Paramètres).

import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router';
import { api } from '../../core/api.js';
import { useEvent } from '../../core/stream.js';
import RulesPage from './RulesPage.jsx';
import VigiePage from './VigiePage.jsx';
import PageIntrouvable from '../../core/PageIntrouvable.jsx';

export default function RulesModule() {
  const [vigie, setVigie] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    api('/vigie/reglage').then((r) => setVigie(r?.actif === true)).catch(() => {});
  }, []);
  useEvent('vigie', (vue) => setVigie(vue?.actif === true));
  const surVigie = pathname.replace(/\/$/, '').endsWith('/regles/vigie');
  return (
    <div className="module">
      {(vigie || surVigie) && (
        <nav className="tabs">
          <NavLink to="/regles" end>Fiches en français</NavLink>
          <NavLink to="/regles/vigie">Vigie des règles</NavLink>
        </nav>
      )}
      <Routes>
        <Route index element={<RulesPage />} />
        <Route path="vigie" element={<VigiePage />} />
        <Route path="*" element={<PageIntrouvable retour="/regles" nom="Règles du jeu" />} />
      </Routes>
    </div>
  );
}
