// Distribution : ce qui part chez les autres (installateur, copie pour l'escadron) ne contient rien du joueur. Ni ses
// données (server/data, base, réglages, mémoire d'Alicia), ni un secret (jeton d'escadron, webhook Discord, .env).
// Règles : scripts/distribution.mjs (les mêmes que l'installateur utilisera).

import { verifierDistribution } from '../../distribution.mjs';

export default {
  titre: 'Distribution (aucune donnée ni aucun secret du joueur dans l’app)',
  async lancer(ctx) {
    const { fichiers, problemes } = verifierDistribution(ctx.racine);
    if (problemes.length) {
      throw new ctx.EchecEtape(`${problemes.length} fichier(s) qui ne doivent pas partir chez les autres. Retire-les du dépôt (git rm --cached) et ajoute-les à .gitignore ; un secret dans un fichier : remplace-le par une valeur fictive.`, { details: problemes.slice(0, 40).join('\n') });
    }
    return `${fichiers} fichiers distribuables, aucune donnée ni aucun secret du joueur (jeton d’escadron cherché aussi en clair)`;
  },
};
