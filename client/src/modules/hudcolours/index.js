import { lazy } from 'react';

// Page chargée à sa première visite : ni dans les fenêtres en jeu, ni au démarrage (App.jsx, Suspense)
const HudColoursPage = lazy(() => import('./HudColoursPage.jsx'));

export default {
  id: 'hudcolours',
  title: 'Couleurs du HUD',
  description: 'Change la couleur de l’interface du jeu : aperçu avant / après, préréglages, puis un clic pour l’appliquer',
  icon: '🎨',
  path: '/couleurs-hud',
  Component: HudColoursPage,
  nav: false, // pas dans la barre : sur l'accueil, avec les outils
};
