// Rejeu des séances de référence sur un serveur isolé, et comparaison exacte avec les résultats attendus de chaque
// module (scripts/controle/attendu/<module>.json). Voir rejeu/rejouer.mjs.
//   CONTROLE_UPDATE=1 : réécrit les attendus (après relecture de ce qui change : git diff scripts/controle/attendu).

import { rejouer } from '../rejeu/rejouer.mjs';

export default {
  titre: 'Rejeu des séances de référence (serveur isolé)',
  async lancer(ctx) {
    const r = await rejouer({ maj: ctx.maj, journal: (l) => ctx.dire(l) });
    const base = `${r.seances} séances × ${r.modes} modes, ${r.requetes} réponses, ${r.verifications} vérifications en dur, ${r.scenarios} scénario(s)`;
    if (r.problemes.length) {
      throw new ctx.EchecEtape(`Rejeu : ${r.problemes.length} problème(s) pendant les séances.`, { details: `${r.problemes.join('\n')}\n\nRésultats obtenus : ${r.obtenus}` });
    }
    if (ctx.maj) return `${base} ; attendus RÉÉCRITS dans scripts/controle/attendu : relis « git diff scripts/controle/attendu » avant de valider`;
    if (r.ecarts.length) {
      const lignes = r.ecarts.slice(0, 25).map((e) => `[${e.module}] ${e.texte}`);
      if (r.ecarts.length > 25) lignes.push(`… et ${r.ecarts.length - 25} autre(s)`);
      throw new ctx.EchecEtape(`Rejeu : ${r.ecarts.length} écart(s) avec les résultats attendus.`, {
        details: `${lignes.join('\n')}\n\nRésultats obtenus : ${r.obtenus}\nSi le changement est voulu : relis-le, puis CONTROLE_UPDATE=1 npm run controle -- --etape=rejeu`,
      });
    }
    return `${base}, toutes identiques aux attendus`;
  },
};
