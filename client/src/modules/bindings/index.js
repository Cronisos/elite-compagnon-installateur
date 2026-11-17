import { lazy } from 'react';

// Fenêtres en jeu, bandeaux et pages : chacun chargé quand il sert (App.jsx, Suspense), pas dans chaque fenêtre
const BindingsBanner = lazy(() => import('./BindingsBanner.jsx'));
const BindingsHud = lazy(() => import('./BindingsHud.jsx'));

// Page chargée à sa première visite : ni dans les fenêtres en jeu, ni au démarrage (App.jsx, Suspense)
const BindingsModule = lazy(() => import('./BindingsModule.jsx'));

export default {
  id: 'bindings',
  title: 'Garde des commandes',
  description: 'Te prévient quand le jeu ignore ton profil de commandes (manette absente)',
  icon: '🕹',
  path: '/commandes',
  Component: BindingsModule, // Garde des commandes (/commandes) et Mes commandes (/commandes/mes-commandes)
  nav: false, // pas dans la barre : l'accueil, et le bandeau quand il y a un souci
  Hud: BindingsHud, // fenêtre de l'overlay /hud/bindings, ouverte d'elle-même par le serveur
  Overlay: BindingsBanner, // bandeau sur toutes les pages
};
