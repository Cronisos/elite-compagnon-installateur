import { lazy } from 'react';

// Page chargée à sa première visite : ni dans les fenêtres en jeu, ni au démarrage (App.jsx, Suspense)
const SystemsPage = lazy(() => import('./SystemsPage.jsx'));

export default {
  id: 'systems',
  title: 'Systèmes importants',
  description: 'Tes systèmes favoris et pourquoi ils comptent, et la recherche des zones riches en planètes',
  icon: '⭐',
  path: '/systemes',
  Component: SystemsPage,
};
