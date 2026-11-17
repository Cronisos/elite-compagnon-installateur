// Tests de l'app de bureau (desktop/ : données, fenêtres, Node du PC, processus), comme « npm test --prefix desktop ».
// Electron n'est jamais lancé.
import path from 'node:path';

export default {
  titre: "Tests de l'app de bureau",
  async lancer(ctx) {
    const { resume } = await ctx.suiteNodeTest({ titre: "Tests de l'app de bureau", cwd: path.join(ctx.racine, 'desktop'), motifs: ['*.test.js'], journal: ctx.journal() });
    return resume;
  },
};
