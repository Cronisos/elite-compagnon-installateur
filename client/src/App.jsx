import { Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router';
import Layout from './core/Layout.jsx';
import Home from './core/Home.jsx';
import SettingsPage from './core/SettingsPage.jsx';
import { modules } from './modules/index.js';
import { PageErrorBoundary } from './core/errorBoundary.js';
import { HudConnection } from './core/hudConnection.js';
import { DETACHEE } from './core/bureau.js';
import { PLAN, aSaPage } from './core/navigation.js';
import { RubriquePage } from './core/Rubriques.jsx';
import BarreBureau from './core/BarreBureau.jsx';
import PaveTactile from './core/PaveTactile.jsx';
import { useTeinte } from './core/teinte.js';
import CadreDisposition from './core/CadreDisposition.jsx';
import { nomFenetre } from './core/disposition.js';
import Tutoriel from './core/tutoriel/Tutoriel.jsx';
import FenetresEnJeu, { CHEMIN_FENETRES } from './core/tutoriel/FenetresEnJeu.jsx';
import InviteFenetres from './core/tutoriel/InviteFenetres.jsx';
import { CHEMIN_TUTORIELS, TutorielsPage } from './core/tutoriel/ReglageTutoriels.jsx';

/**
 * Une page (ou une fenêtre de l'overlay) en erreur n'emporte pas toute l'interface (core/errorBoundary.js). Les pages
 * des modules se chargent à leur première visite (lazy, dans modules/<module>/index.js) : « Chargement… » le temps
 * de lire leur fichier, et les fenêtres en jeu n'ont plus à compiler toutes les pages de l'app. Les fenêtres en jeu,
 * les bandeaux et les pages de capture se chargent de même, mais sans texte d'attente (rien au-dessus du jeu).
 */
function Guarded({ children, attente = <p className="muted">Chargement…</p> }) {
  const { pathname } = useLocation();
  return (
    <PageErrorBoundary resetKey={pathname}>
      <Suspense fallback={attente}>{children}</Suspense>
    </PageErrorBoundary>
  );
}

/** Application complète : cadre, menu et pages des modules. */
function Main() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Guarded><Home /></Guarded>} />
        <Route path="/parametres" element={<Guarded><SettingsPage /></Guarded>} />
        {/* Outils › Tutoriels : tous les tutoriels, vus ou non */}
        <Route path={CHEMIN_TUTORIELS} element={<Guarded><TutorielsPage /></Guarded>} />
        {/* Fenêtres en jeu, montrées en démonstration pour leur tutoriel */}
        <Route path={CHEMIN_FENETRES} element={<Guarded><FenetresEnJeu /></Guarded>} />
        <Route path={`${CHEMIN_FENETRES}/:mode`} element={<Guarded><FenetresEnJeu /></Guarded>} />
        {/* Pages des rubriques (Mes vaisseaux, Activités…) : des cartes vers leurs pages (core/navigation.js) */}
        {PLAN.filter(aSaPage).map((r) => (
          <Route key={r.id} path={r.chemin} element={<Guarded><RubriquePage rubrique={r} /></Guarded>} />
        ))}
        {/* Un module peut n'avoir qu'une fenêtre d'overlay, sans page (saut du porteur) */}
        {modules.filter((m) => m.Component).map((m) => (
          <Route key={m.id} path={`${m.path}/*`} element={<Guarded><m.Component /></Guarded>} />
        ))}
        <Route path="*" element={<p className="muted">Page introuvable.</p>} />
      </Routes>
      {/* Tutoriel interactif des pages : fenêtre principale seulement */}
      {!DETACHEE && <PageErrorBoundary><Tutoriel /><InviteFenetres /></PageErrorBoundary>}
      {/* Éléments permanents fournis par les modules (alertes…) : dans la fenêtre principale seulement, pas dans une page détachée */}
      {!DETACHEE && modules.filter((m) => m.Overlay).map((m) => (
        <PageErrorBoundary key={m.id}>
          <Suspense fallback={null}><m.Overlay /></Suspense>
        </PageErrorBoundary>
      ))}
    </Layout>
  );
}

export default function App() {
  useTeinte(); // couleur du HUD sur toutes les pages : fenêtre principale, détachées, MAR, pavé, fenêtres en jeu
  return (
    <Routes>
      {/* Pages HUD des modules, sans cadre ni menu : affichées par l'overlay (dossier overlay/) */}
      {modules.filter((m) => m.Hud).map((m) => (
        <Route key={m.id} path={`/hud/${m.id}`} element={<Guarded attente={null}><CadreDisposition nom={nomFenetre(m.id, m.title)}><HudConnection><m.Hud /></HudConnection></CadreDisposition></Guarded>} />
      ))}
      {/* Pages d'overlay en plus, ouvertes avec le mode du module (hudPages) */}
      {modules.flatMap((m) => Object.entries(m.hudPages || {}).map(([page, Page]) => [page, Page, m.title])).map(([page, Page, titre]) => (
        <Route key={page} path={`/hud/${page}`} element={<Guarded attente={null}><CadreDisposition nom={nomFenetre(page, titre)}><HudConnection><Page /></HudConnection></CadreDisposition></Guarded>} />
      ))}
      {/* Pages de capture des modules, sans cadre : l'app de bureau en fait une image (rapport de la semaine en GIF) */}
      {modules.flatMap((m) => Object.entries(m.capturePages || {})).map(([page, Page]) => (
        <Route key={`capture-${page}`} path={`/capture/${page}`} element={<Guarded attente={null}><Page /></Guarded>} />
      ))}
      {/* Barre de menu de l'app de bureau (fenêtre en haut à droite de l'écran, desktop/main.js) */}
      <Route path="/barre" element={<Guarded><BarreBureau /></Guarded>} />
      {/* Pavé tactile de l'app de bureau (fenêtre à part, pour un petit écran tactile) */}
      <Route path="/pave" element={<Guarded><PaveTactile /></Guarded>} />
      <Route path="*" element={<Main />} />
    </Routes>
  );
}
