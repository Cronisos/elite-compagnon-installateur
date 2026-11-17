import { lazy } from 'react';

// Page chargée à sa première visite : ni dans les fenêtres en jeu, ni au démarrage (App.jsx, Suspense)
const BuilderModule = lazy(() => import('./BuilderModule.jsx'));

export default {
  id: 'builder',
  title: 'Constructeur de builds',
  description: 'Composer un vaisseau, voir saut, boucliers, DPS et énergie, comparer et partager',
  icon: '⚙',
  path: '/builder',
  Component: BuilderModule,
};
