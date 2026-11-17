import { lazy } from 'react';
import { HudOverlay } from '../../core/hud.jsx';
import { rescueHud, useRescue } from './useRescue.jsx';
import { modeInfo } from '../../core/modes.js';

// Page chargée à sa première visite : ni dans les fenêtres en jeu, ni au démarrage (App.jsx, Suspense)
const RescuePage = lazy(() => import('./RescuePage.jsx'));

/** Page de l'overlay : /hud/rescue */
function RescueOverlay() {
  return <HudOverlay props={rescueHud(useRescue())} />;
}

export default {
  id: 'rescue',
  title: 'Sauvetage',
  description: 'Nacelles récupérées et livrées, récompenses et mérites de la session, en temps réel',
  icon: '✚',
  path: '/sauvetage',
  Component: RescuePage,
  Hud: RescueOverlay,
  mode: modeInfo('rescue'), // menu « Mode de jeu » : nom, icône et fenêtres dans core/modes.js
};
