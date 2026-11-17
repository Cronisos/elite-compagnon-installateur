// Module Escadron : ses onglets (core/navigation.js), la page d'envoi et d'apport, le guide pour rejoindre, et
// l'assistant du chef (serveur, carte Discord, membres).

import { Route, Routes } from 'react-router';
import Onglets from '../../core/Onglets.jsx';
import EscadronPage from './EscadronPage.jsx';
import GuideMembre from './GuideMembre.jsx';
import GuideChef from './GuideChef.jsx';

export default function EscadronModule() {
  return (
    <div className="module">
      <Onglets de="escadron" />
      <Routes>
        <Route index element={<EscadronPage />} />
        <Route path="rejoindre" element={<GuideMembre />} />
        <Route path="chef" element={<GuideChef />} />
        <Route path="*" element={<p className="muted">Page introuvable.</p>} />
      </Routes>
    </div>
  );
}
