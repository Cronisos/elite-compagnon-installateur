import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router';
import Onglets from '../../core/Onglets.jsx';
import { builderApi } from './api.js';
import BuildList from './pages/BuildList.jsx';
import BuildEditor from './pages/BuildEditor.jsx';
import ComparePage from './pages/ComparePage.jsx';
import ApercuVaisseaux from './pages/ApercuVaisseaux.jsx';
import BuildsEscadron from './pages/BuildsEscadron.jsx';
import PageIntrouvable from '../../core/PageIntrouvable.jsx';

/** Builds (rubrique Mes vaisseaux) : les onglets de la rubrique, puis ceux des builds (core/navigation.js). */
export default function BuilderModule() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    builderApi.status().then(setStatus).catch(() => setStatus({ ready: false, message: 'Serveur injoignable.' }));
  }, []);

  return (
    <div className="module">
      <Onglets de="vaisseaux" />
      <Onglets de="builds" sous />
      {status && !status.ready ? (
        <div className="panel">
          <p className="bad">{status.message}</p>
          <Link className="btn" to="/ingenierie/donnees">Aller aux données de référence</Link>
        </div>
      ) : status ? (
        <Routes>
          <Route index element={<BuildList />} />
          <Route path="nouveau" element={<BuildEditor key="new" />} />
          <Route path="build/:id" element={<BuildEditor />} />
          <Route path="comparer" element={<ComparePage />} />
          <Route path="vaisseaux" element={<ApercuVaisseaux />} />
          <Route path="escadron" element={<BuildsEscadron />} />
          <Route path="*" element={<PageIntrouvable retour="/builder" nom="Constructeur de builds" />} />
        </Routes>
      ) : (
        <p className="muted">Chargement…</p>
      )}
    </div>
  );
}
