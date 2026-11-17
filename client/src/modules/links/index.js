import { lazy } from 'react';

// Page chargée à sa première visite : ni dans les fenêtres en jeu, ni au démarrage (App.jsx, Suspense)
const LinksPage = lazy(() => import('./LinksPage.jsx'));

export default {
  id: 'links',
  title: 'Applications externes',
  description: 'Menu clair vers Inara, Spansh, EDSY… avec les liens de ta position actuelle',
  icon: '↗',
  path: '/applications',
  Component: LinksPage,
};
