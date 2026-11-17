import { lazy } from 'react';
import { ColonisationHud, ShoppingListOverlay } from './ColonisationHud.jsx';
import { modeInfo } from '../../core/modes.js';

// Page chargée à sa première visite : ni dans les fenêtres en jeu, ni au démarrage (App.jsx, Suspense)
const ColonisationPage = lazy(() => import('./ColonisationPage.jsx'));

export default {
  id: 'colonisation',
  title: 'Colonisation',
  description: 'Chantiers de construction suivis : reste à livrer, liste de courses moins la soute, trajets, stations proches, échéance',
  icon: '🏗',
  path: '/colonisation',
  Component: ColonisationPage,
  Hud: ColonisationHud, // overlay : /hud/colonisation
  // Fenêtre en plus, ouverte avec le mode : la liste de courses du chantier actif
  hudPages: { 'colonisation-list': ShoppingListOverlay },
  mode: modeInfo('colonisation'), // menu « Mode de jeu » : nom, icône et fenêtres dans core/modes.js
};
