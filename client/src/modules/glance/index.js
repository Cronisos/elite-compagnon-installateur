import { lazy } from 'react';

// Fenêtres en jeu, bandeaux et pages : chacun chargé quand il sert (App.jsx, Suspense), pas dans chaque fenêtre
const GlanceOverlay = lazy(() => import('./GlanceOverlay.jsx'));
const GlanceWindow = lazy(() => import('./GlanceWindow.jsx'));

// Page chargée à sa première visite : ni dans les fenêtres en jeu, ni au démarrage (App.jsx, Suspense)
const GlancePage = lazy(() => import('./GlancePage.jsx'));

export default {
  id: 'glance',
  title: "Coup d'œil",
  description: 'Tout ce que tu possèdes et peux encaisser, en un regard (Alt+C)',
  icon: '👁',
  path: '/coup-doeil',
  Component: GlancePage,
  nav: false, // pas dans la barre : case du menu « Mode de jeu », Alt+C, ou l'accueil
  Hud: GlanceWindow, // fenêtre libre de l'overlay : /hud/glance
  Overlay: GlanceOverlay, // bouton et raccourci Alt+C, sur toutes les pages
};
