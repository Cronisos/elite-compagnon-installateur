import { lazy } from 'react';
import { HudOverlay } from '../../core/hud.jsx';
import { shipMiningHud, useShipMining } from './useShipMining.jsx';
import { modeInfo } from '../../core/modes.js';

// Page chargée à sa première visite : ni dans les fenêtres en jeu, ni au démarrage (App.jsx, Suspense)
const ShipMiningPage = lazy(() => import('./ShipMiningPage.jsx'));

/** Page de l'overlay : /hud/shipmining */
function ShipMiningOverlay() {
  return <HudOverlay props={shipMiningHud(useShipMining())} />;
}

export default {
  id: 'shipmining',
  title: 'Minage vaisseau',
  description: 'Prospecteur (teneur de chaque astéroïde, filon mère), drones, raffinage et soute pendant la session',
  icon: '☄',
  path: '/minage-vaisseau',
  Component: ShipMiningPage,
  Hud: ShipMiningOverlay,
  mode: modeInfo('shipmining'), // menu « Mode de jeu » : nom, icône et fenêtres dans core/modes.js
};
