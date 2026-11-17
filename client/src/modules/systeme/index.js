import { lazy } from 'react';

// Fenêtres en jeu, bandeaux et pages : chacun chargé quand il sert (App.jsx, Suspense), pas dans chaque fenêtre
const MoniteurHud = lazy(() => import('./MoniteurHud.jsx'));

// Page chargée à sa première visite : ni dans les fenêtres en jeu, ni au démarrage (App.jsx, Suspense)
const MoniteurPage = lazy(() => import('./MoniteurPage.jsx'));

export default {
  id: 'systeme',
  title: 'Moniteur PC',
  description: 'Carte graphique, mémoire vidéo, processeur, mémoire : en direct, en jeu',
  icon: '▥',
  path: '/moniteur',
  Component: MoniteurPage,
  Hud: MoniteurHud, // fenêtre en jeu : /hud/systeme
};
