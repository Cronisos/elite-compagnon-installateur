// Photo de référence du constructeur de builds (golden) et relevés EDSY, OBLIGATOIRES : GOLDEN_REQUIRED=1 fait échouer
// au lieu de sauter quand les données de référence (server/data/reference) manquent ou ne sont pas la version figée.
export default {
  titre: 'Golden du constructeur de builds (obligatoire)',
  async lancer(ctx) {
    const { bilan, resume } = await ctx.suiteNodeTest({
      titre: 'Golden',
      cwd: ctx.serveur,
      motifs: ['src/modules/builder/__golden__/*.test.js'],
      env: ctx.envPropre({ GOLDEN_REQUIRED: '1' }),
      journal: ctx.journal(),
    });
    if (bilan.skipped) throw new ctx.EchecEtape(`Golden : ${bilan.skipped} test(s) sauté(s) alors que GOLDEN_REQUIRED=1 les exige.`);
    return resume;
  },
};
