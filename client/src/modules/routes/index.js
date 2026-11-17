import { lazy } from 'react';
import { modeInfo } from '../../core/modes.js';

// Fenêtres en jeu, bandeaux et pages : chacun chargé quand il sert (App.jsx, Suspense), pas dans chaque fenêtre
const RoutesOverlay = lazy(() => import('./components/RoutesOverlay.jsx'));

// Page chargée à sa première visite : ni dans les fenêtres en jeu, ni au démarrage (App.jsx, Suspense)
const RoutesModule = lazy(() => import('./RoutesModule.jsx'));

export default {
  // Affiché en permanence, sur toutes les pages (alertes d'achat, questions sur la route)
  Overlay: RoutesOverlay,
  id: 'routes',
  title: 'Mes routes commerciales',
  description: 'Boucles détectées automatiquement, gains, objectif de crédits',
  icon: '⇄',
  path: '/routes',
  Component: RoutesModule,
  mode: modeInfo('routes'), // menu « Mode de jeu » (pas de fenêtre par-dessus le jeu) : déclaré dans core/modes.js
};
