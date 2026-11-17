import { lazy } from 'react';

// Page chargée à sa première visite : ni dans les fenêtres en jeu, ni au démarrage (App.jsx, Suspense)
const VaisseauxModule = lazy(() => import('./VaisseauxModule.jsx'));

export default {
  id: 'vaisseaux',
  title: 'Mes vaisseaux',
  description: 'Ta flotte : où sont tes vaisseaux, leur rôle, leur plan d’ingénierie',
  icon: '🚀',
  path: '/vaisseaux',
  Component: VaisseauxModule,
};
