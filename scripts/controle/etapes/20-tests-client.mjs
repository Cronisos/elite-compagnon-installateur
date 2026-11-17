// Tests unitaires de l'interface (node --test, comme « npm test -w client »).
export default {
  titre: 'Tests unitaires du client',
  async lancer(ctx) {
    const { resume } = await ctx.suiteNodeTest({ titre: 'Tests du client', cwd: ctx.client, motifs: ['src/**/*.test.js'], journal: ctx.journal() });
    return resume;
  },
};
