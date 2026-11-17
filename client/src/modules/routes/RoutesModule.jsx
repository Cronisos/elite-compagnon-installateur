import { NavLink, Routes, Route } from 'react-router';
import Dashboard from './pages/Dashboard.jsx';
import NewRoute from './pages/NewRoute.jsx';
import MyRoutes from './pages/MyRoutes.jsx';
import History from './pages/History.jsx';
import RoutePage from './pages/RoutePage.jsx';
import RoutesEscadron from './pages/RoutesEscadron.jsx';
import PageIntrouvable from '../../core/PageIntrouvable.jsx';

/** Page du module : onglets Tableau de bord, Nouvelle route, Mes routes, Historique. */
export default function RoutesModule() {
  return (
    <div className="module">
      <nav className="tabs">
        <NavLink to="/routes" end>Tableau de bord</NavLink>
        <NavLink to="/routes/nouvelle">Nouvelle route</NavLink>
        <NavLink to="/routes/liste">Mes routes</NavLink>
        <NavLink to="/routes/historique">Historique</NavLink>
        <NavLink to="/routes/escadron">Escadron</NavLink>
      </nav>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="nouvelle" element={<NewRoute />} />
        <Route path="liste" element={<MyRoutes />} />
        <Route path="historique" element={<History />} />
        <Route path="escadron" element={<RoutesEscadron />} />
        <Route path=":id" element={<RoutePage />} />
        <Route path="*" element={<PageIntrouvable retour="/routes" nom="Mes routes commerciales" />} />
      </Routes>
    </div>
  );
}
