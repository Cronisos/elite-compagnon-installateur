import { lazy } from 'react';

// Fenêtres en jeu, bandeaux et pages : chacun chargé quand il sert (App.jsx, Suspense), pas dans chaque fenêtre
const CompanionWindow = lazy(() => import('./CompanionWindow.jsx'));
const CompanionDock = lazy(() => import('./CompanionDock.jsx'));

// Page chargée à sa première visite : ni dans les fenêtres en jeu, ni au démarrage (App.jsx, Suspense)
const CompanionPage = lazy(() => import('./CompanionPage.jsx'));

export default {
  id: 'compagnon',
  title: 'Compagnon',
  description: 'Un petit copilote qui réagit à ce que tu fais en jeu : avatar, humeurs, phrases (sans IA)',
  icon: '☺',
  path: '/compagnon',
  Component: CompanionPage,
  Hud: CompanionWindow, // fenêtre libre de l'overlay : /hud/compagnon
  Overlay: CompanionDock, // petit compagnon en bas à droite de l'application
};
