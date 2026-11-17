import { lazy } from 'react';
import { HudOverlay } from '../../core/hud.jsx';
import { combatHud, useCombat } from './useCombat.jsx';
import { modeInfo } from '../../core/modes.js';

// Page chargée à sa première visite : ni dans les fenêtres en jeu, ni au démarrage (App.jsx, Suspense)
const CombatPage = lazy(() => import('./CombatPage.jsx'));

/** Page de l'overlay : /hud/combat */
function CombatOverlay() {
  return <HudOverlay props={combatHud(useCombat())} />;
}

export default {
  id: 'combat',
  title: 'Combat',
  description: 'Primes, mérites et ennemis abattus pendant la session, en temps réel',
  icon: '⚔',
  path: '/combat',
  Component: CombatPage,
  Hud: CombatOverlay,
  mode: modeInfo('combat'), // menu « Mode de jeu » : nom, icône et fenêtres dans core/modes.js
};
