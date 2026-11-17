import { lazy } from 'react';
import { HudOverlay } from '../../core/hud.jsx';
import { materialsHud, useMaterials } from './useMaterials.jsx';
import { modeInfo } from '../../core/modes.js';

// Page chargée à sa première visite : ni dans les fenêtres en jeu, ni au démarrage (App.jsx, Suspense)
const MaterialsPage = lazy(() => import('./MaterialsPage.jsx'));

/** Page de l'overlay : /hud/materials */
function MaterialsOverlay() {
  return <HudOverlay props={materialsHud(useMaterials())} />;
}

export default {
  id: 'materials',
  title: 'Matériaux',
  description: 'Matériaux récupérés pendant la session, par catégorie et par grade, et les signaux du système',
  icon: '◈',
  path: '/materiaux',
  Component: MaterialsPage,
  Hud: MaterialsOverlay,
  mode: modeInfo('materials'), // menu « Mode de jeu » : nom, icône et fenêtres dans core/modes.js
};
