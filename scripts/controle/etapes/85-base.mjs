// Base de données : la base réelle du joueur (celle de l'app de bureau, sinon server/data/elite.db de l'app), COPIÉE de façon cohérente dans un dossier
// temporaire (jamais ouverte ni écrite là où elle est) ; le schéma du projet appliqué à la copie sans perte, le serveur
// isolé démarré dessus, toutes ses lectures interrogées, et les lignes de chaque table identiques avant et après.
// Sans base réelle sur ce PC : étape sautée avec un avertissement. Voir base/controler.mjs.

import { controlerBase } from '../base/controler.mjs';

export default {
  titre: 'Base de données réelle (copie : schéma, lectures, lignes intactes)',
  async lancer(ctx) {
    return controlerBase(ctx);
  },
};
