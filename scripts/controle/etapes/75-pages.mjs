// Pages et fenêtres : chaque page de l'interface (sous-pages, onglets et parcours compris) et chaque fenêtre de
// l'overlay (/hud/<page>, liste tirée des modules clients) ouverte dans Chrome sans fenêtre, sur l'interface compilée
// de la worktree reliée à un serveur isolé : avec toutes les séances rejouées, sans aucun journal, puis toutes les
// fenêtres ensemble pendant qu'une séance s'écrit. Voir pages/controler.mjs et pages/attendus.mjs.
//   CONTROLE_CHROME : chemin de chrome.exe s'il n'est pas à sa place habituelle ;
//   CONTROLE_SANS_CHROME=1 : étape sautée sur un PC sans Chrome (le contrôle n'est alors pas vert).

import { controlerPages } from '../pages/controler.mjs';

export default {
  titre: 'Pages et fenêtres (Chrome sans fenêtre)',
  async lancer(ctx) {
    return controlerPages(ctx);
  },
};
