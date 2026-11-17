import { lazy } from 'react';

// Fenêtres en jeu, bandeaux et pages : chacun chargé quand il sert (App.jsx, Suspense), pas dans chaque fenêtre
const VisitOverlay = lazy(() => import('./VisitOverlay.jsx'));
const PassageOverlay = lazy(() => import('./PassageOverlay.jsx'));

// Page chargée à sa première visite : ni dans les fenêtres en jeu, ni au démarrage (App.jsx, Suspense)
const EngineeringModule = lazy(() => import('./EngineeringModule.jsx'));

export default {
  id: 'engineering',
  title: 'Mon ingénierie',
  description: 'Plans par vaisseau, matériaux nécessaires comparés à ton inventaire',
  icon: '⚙',
  path: '/ingenierie',
  Component: EngineeringModule,
  // Fiche « Chez l'ingénieur », ouverte par le serveur à quai chez un ingénieur qui a des tâches (services/visit.js)
  // Alertes de passage, ouvertes par le serveur en arrivant dans un système utile aux plans (services/passage.js)
  hudPages: { 'engineering-visit': VisitOverlay, 'engineering-passage': PassageOverlay },
};
