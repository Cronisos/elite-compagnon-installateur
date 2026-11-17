// Module facultatif « IA de bord » (Alicia) : absent de la version escadron (modules/index.js le charge s'il est là).

import { lazy } from 'react';

// Fenêtres en jeu, bandeaux et pages : chacun chargé quand il sert (App.jsx, Suspense), pas dans chaque fenêtre
const IaPage = lazy(() => import('./IaPage.jsx'));
const IaVolet = lazy(() => import('./IaVolet.jsx'));
const IaHud = lazy(() => import('./IaHud.jsx'));
const BouclierCadre = lazy(() => import('./BouclierCadre.jsx'));

export default {
  id: 'ia',
  title: 'Alicia',
  description: 'Ton IA de bord, sur ton PC : elle lit tes données dans l’app et répond à tes questions',
  icon: '✶',
  path: '/ia',
  Component: IaPage,
  Overlay: IaVolet, // bouton et volet de discussion, sur toutes les pages de la fenêtre principale
  Hud: IaHud, // fenêtre en jeu : /hud/ia
  hudPages: { bouclier: BouclierCadre }, // cadre de réglage de la jauge des boucliers : /hud/bouclier
};
