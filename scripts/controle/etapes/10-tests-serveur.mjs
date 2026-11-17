// Tests unitaires du serveur (node --test, comme « npm test -w server »).
export default {
  titre: 'Tests unitaires du serveur',
  async lancer(ctx) {
    const { resume } = await ctx.suiteNodeTest({ titre: 'Tests du serveur', cwd: ctx.serveur, motifs: ['src/**/*.test.js', 'dbPush.test.mjs'], journal: ctx.journal() });
    return resume;
  },
};
