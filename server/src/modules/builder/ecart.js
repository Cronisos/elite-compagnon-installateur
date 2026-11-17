// Écart entre la configuration actuelle d'un vaisseau et un build (« ce qu'il te faut », fiche de Mes vaisseaux) :
// emplacement par emplacement, les modules à acheter, à retirer, et les modifications d'ingénierie à faire. Fonction
// pure : les données EDSY et les libellés sont passés par l'appelant (index.js), testée par ecart.test.js.

import { GROUPS } from '../../core/reference/edsy.js';

const meme = (a, b) => (a?.modid ?? null) === (b?.modid ?? null);
const memeIngenierie = (a, b) => (a?.bpid ?? null) === (b?.bpid ?? null) && (a?.bpid ? (a.grade ?? 0) === (b.grade ?? 0) : true) && (a?.expid ?? null) === (b?.expid ?? null);

/**
 * @param o.eddb, o.ship données EDSY et vaisseau
 * @param o.actuel, o.cible builds { slots: { groupe: [{ modid, bpid, grade, expid } | null] } }, même vaisseau
 * @param o.libelles { emplacement(g, i), module(m), plan(bp), effet(x) }
 * @param o.moduleOf (eddb, ship, modid) → fiche du module (prix « cost »)
 * @returns { lignes: [{ groupe, emplacement, type, actuel, cible, ingenierie }], achats, retraits, ingenierie, cout, identique }
 *   type : « acheter » (autre module), « retirer » (vide dans le build), « ingenierie » (même module, autre
 *   modification), « sans-modif » (ton module est modifié, celui du build non : rien à faire, pour information) ;
 *   ingenierie : { plan, grade, depuis, effet } à faire sur le module du build
 */
export function ecartBuild({ eddb, ship, actuel, cible, libelles, moduleOf }) {
  const lignes = [];
  let cout = 0;
  const nom = (s) => {
    if (!s?.modid) return null;
    const m = moduleOf(eddb, ship, s.modid);
    return m ? libelles.module(m) : String(s.modid);
  };
  const modif = (s) => {
    const bp = s?.bpid ? eddb.blueprint[s.bpid] : null;
    if (!bp) return null;
    const ex = s.expid ? eddb.expeffect[s.expid] : null;
    return { plan: libelles.plan(bp), grade: s.grade ?? 0, effet: ex ? libelles.effet(ex) : null };
  };
  for (const g of GROUPS) {
    const a = actuel?.slots?.[g] || [];
    const c = cible?.slots?.[g] || [];
    const n = Math.max(a.length, c.length);
    for (let i = 0; i < n; i++) {
      const sa = a[i]?.modid ? a[i] : null;
      const sc = c[i]?.modid ? c[i] : null;
      if (!sa && !sc) continue;
      const base = { groupe: g, emplacement: libelles.emplacement(g, i), actuel: nom(sa), cible: nom(sc), actuelModif: modif(sa) };
      if (!meme(sa, sc)) {
        if (!sc) {
          lignes.push({ ...base, type: 'retirer', ingenierie: null });
          continue;
        }
        const m = moduleOf(eddb, ship, sc.modid);
        cout += Number(m?.cost) || 0;
        lignes.push({ ...base, type: 'acheter', ingenierie: modif(sc) });
      } else if (!memeIngenierie(sa, sc)) {
        const voulu = modif(sc);
        if (!voulu) {
          lignes.push({ ...base, type: 'sans-modif', ingenierie: null });
          continue;
        }
        const avant = modif(sa);
        lignes.push({ ...base, type: 'ingenierie', ingenierie: { ...voulu, depuis: avant && avant.plan === voulu.plan ? avant.grade : 0 } });
      }
    }
  }
  return {
    lignes,
    achats: lignes.filter((l) => l.type === 'acheter').length,
    retraits: lignes.filter((l) => l.type === 'retirer').length,
    ingenierie: lignes.filter((l) => l.ingenierie).length,
    cout,
    // Rien à faire : aucune ligne, ou seulement des modules déjà mieux modifiés que le build
    identique: lignes.every((l) => l.type === 'sans-modif'),
  };
}
