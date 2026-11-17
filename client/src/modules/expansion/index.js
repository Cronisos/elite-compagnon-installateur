import { lazy } from 'react';

// Fenêtres en jeu, bandeaux et pages : chacun chargé quand il sert (App.jsx, Suspense), pas dans chaque fenêtre
const ExpansionPage = lazy(() => import('./ExpansionPage.jsx'));
const SaleOverlay = lazy(() => import('./SaleOverlay.jsx'));
const CaptureRapport = lazy(() => import('./CaptureRapport.jsx'));

export default {
  id: 'expansion',
  title: 'Projet extension',
  description: "Les routes Powerplay à prendre système par système, l'historique des mérites gagnés semaine par semaine, et le calculateur de routes rentables",
  icon: '🚩',
  path: '/extension',
  Component: ExpansionPage,
  // Fenêtre en jeu ouverte d'elle-même à quai par le serveur (sale.js) : mérites prévus pour la soute, puis résultat de la vente
  hudPages: { 'expansion-sale': SaleOverlay },
  // Page de capture, sans cadre : l'app de bureau en fait le GIF animé du rapport de la semaine, pour Discord
  capturePages: { 'rapport-semaine': CaptureRapport },
};
