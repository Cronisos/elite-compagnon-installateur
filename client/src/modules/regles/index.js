import { lazy } from 'react';

// Fenêtres en jeu, bandeaux et pages : chacun chargé quand il sert (App.jsx, Suspense), pas dans chaque fenêtre
const RulesModule = lazy(() => import('./RulesModule.jsx'));
const VigieOverlay = lazy(() => import('./VigieOverlay.jsx'));

export default {
  id: 'regles',
  title: 'Règles du jeu',
  description: 'Powerplay, mérites de vente, colonisation et escadrons en français, avec le terme anglais, la source et la date de vérification ; vigie des règles',
  icon: '📖',
  path: '/regles',
  Component: RulesModule,
  // Alertes de la vigie des règles, ouvertes par le serveur à une nouvelle alerte (server/src/core/vigie.js)
  hudPages: { vigie: VigieOverlay },
};
