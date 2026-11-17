import { lazy } from 'react';
import { HudOverlay } from '../../core/hud.jsx';
import { groundCombatHud, useGroundCombat } from './useGroundCombat.jsx';
import { modeInfo } from '../../core/modes.js';

// Page chargée à sa première visite : ni dans les fenêtres en jeu, ni au démarrage (App.jsx, Suspense)
const GroundCombatPage = lazy(() => import('./GroundCombatPage.jsx'));

/** Page de l'overlay : /hud/groundcombat */
function GroundCombatOverlay() {
  return <HudOverlay props={groundCombatHud(useGroundCombat())} />;
}

export default {
  id: 'groundcombat',
  title: 'Combat au sol',
  description: 'Kills à pied en zone de conflit au sol, gains, mérites, morts et consommables, avec les guerres du système',
  icon: '🪖',
  path: '/combat-au-sol',
  Component: GroundCombatPage,
  Hud: GroundCombatOverlay,
  mode: modeInfo('groundcombat'), // menu « Mode de jeu » : nom, icône et fenêtres dans core/modes.js
};
