// Tests de l'overlay (placement des fenêtres, comme « npm test -w overlay »). Electron n'est jamais lancé.
import path from 'node:path';

export default {
  titre: "Tests de l'overlay",
  async lancer(ctx) {
    const { resume } = await ctx.suiteNodeTest({ titre: "Tests de l'overlay", cwd: path.join(ctx.racine, 'overlay'), motifs: ['*.test.js'], journal: ctx.journal() });
    return resume;
  },
};
