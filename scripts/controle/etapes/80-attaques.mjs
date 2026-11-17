// Attaques contre l'API locale : tests de non-régression DÉFENSIFS, joués seulement contre le serveur isolé du banc
// (127.0.0.1, port temporaire, données et options temporaires, sonde préchargée) et contre le proxy de l'interface
// relié à lui. Chaque cas a son résultat attendu (refus 4xx avec la raison, rien d'écrit) ; tout écart fait échouer
// l'étape. Familles, résultats et écarts dans le journal de l'étape. Voir attaques/controler.mjs.

import { controlerAttaques } from '../attaques/controler.mjs';

export default {
  titre: 'Attaques contre l’API locale (serveur isolé et proxy de l’interface)',
  async lancer(ctx) {
    return controlerAttaques(ctx);
  },
};
