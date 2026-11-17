// Tests du banc de contrôle lui-même : anonymisation, normalisation, horloge figée, serveur isolé, orchestrateur.
import path from 'node:path';

export default {
  titre: 'Tests du banc de contrôle',
  async lancer(ctx) {
    const { resume } = await ctx.suiteNodeTest({ titre: 'Tests du banc', cwd: path.join(ctx.controle, 'tests'), motifs: ['*.test.mjs'], journal: ctx.journal() });
    return resume;
  },
};
