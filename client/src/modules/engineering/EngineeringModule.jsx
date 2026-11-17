import { Routes, Route } from 'react-router';
import Onglets from '../../core/Onglets.jsx';
import EngDashboard from './pages/EngDashboard.jsx';
import NouveauPlanPage from './pages/NouveauPlanPage.jsx';
import PlanPage from './pages/PlanPage.jsx';
import MaterialsPage from './pages/MaterialsPage.jsx';
import DataPage from './pages/DataPage.jsx';
import RanksPage from './pages/RanksPage.jsx';
import RoutePage from './pages/RoutePage.jsx';
import EngineersPage from './pages/EngineersPage.jsx';
import EngineerPage from './pages/EngineerPage.jsx';
import RefGate from './components/RefGate.jsx';
import PageIntrouvable from '../../core/PageIntrouvable.jsx';

/** Rubrique Ingénierie : ses onglets (core/navigation.js), puis la page. La flotte est dans Mes vaisseaux (module vaisseaux). */
export default function EngineeringModule() {
  return (
    <div className="module">
      <Onglets de="ingenierie" />
      <RefGate>
        <Routes>
          <Route index element={<EngDashboard />} />
          <Route path="nouveau-plan" element={<NouveauPlanPage />} />
          <Route path="plan/:id" element={<PlanPage />} />
          <Route path="itineraire" element={<RoutePage />} />
          <Route path="ingenieurs" element={<EngineersPage />} />
          <Route path="ingenieurs/:id" element={<EngineerPage />} />
          <Route path="materiaux" element={<MaterialsPage />} />
          <Route path="rangs" element={<RanksPage />} />
          <Route path="donnees" element={<DataPage />} />
          <Route path="*" element={<PageIntrouvable retour="/ingenierie" nom="Mon ingénierie" />} />
        </Routes>
      </RefGate>
    </div>
  );
}
