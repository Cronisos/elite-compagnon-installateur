import { lazy } from 'react';

// Fenêtres en jeu, bandeaux et pages : chacun chargé quand il sert (App.jsx, Suspense), pas dans chaque fenêtre
const EscadronModule = lazy(() => import('./EscadronModule.jsx'));

export default {
  id: 'escadron',
  title: 'Escadron',
  description: "Tes mérites envoyés au Squadron Tracker sans EDMC (si tu l'actives), et ton apport à chaque classement de l'escadron",
  icon: '🛡',
  path: '/escadron',
  Component: EscadronModule,
};
