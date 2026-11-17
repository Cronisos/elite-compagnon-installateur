import { lazy } from 'react';

// Fenêtres en jeu, bandeaux et pages : chacun chargé quand il sert (App.jsx, Suspense), pas dans chaque fenêtre
const BilanOverlay = lazy(() => import('./BilanOverlay.jsx'));

// Page chargée à sa première visite : ni dans les fenêtres en jeu, ni au démarrage (App.jsx, Suspense)
const BilansPage = lazy(() => import('./BilansPage.jsx'));

export default {
  id: 'bilan',
  title: 'Bilans de session',
  description: 'Chaque session de jeu : durée, crédits, mérites, matériaux, morts, comparés à tes sessions passées',
  icon: '▦',
  path: '/bilans',
  Component: BilansPage,
  // Bilan en jeu à la fermeture du jeu ou au changement de mode, ouvert par le serveur (server/src/modules/bilan)
  hudPages: { bilan: BilanOverlay },
};
