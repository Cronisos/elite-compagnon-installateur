// Route commerciale reçue de l'escadron : sa fiche en lignes de texte, d'après ce que le module Escadron a composé
// (server/src/modules/escadron/sources.js, routePartageable). Sans React : testé seul.

import { compact, dec1, int } from '../../core/format.js';

const marchandise = (g) => (g?.name ? `${g.name}${g.prix != null ? ` à ${int(g.prix)} cr/t` : ''}` : null);
const plateforme = (pad) => (pad ? ` · plateforme ${pad}` : '');
const trajet = (t) => (t?.sauts != null ? `${t.sauts} saut${t.sauts > 1 ? 's' : ''}${t.distance != null ? `, ${dec1(t.distance)} al` : ''}` : null);

/** Les étapes dans l'ordre : [{ lieu, faire: ['Vendre : …', 'Acheter : …'], trajet }]. */
export function etapesRoute(d) {
  if (!d?.depart) return [];
  const lignes = [{
    lieu: `${d.depart.station} · ${d.depart.system}${plateforme(d.depart.pad)}`,
    faire: [marchandise(d.depart.achete) && `Acheter : ${marchandise(d.depart.achete)}`].filter(Boolean),
    trajet: null,
  }];
  for (const e of Array.isArray(d.etapes) ? d.etapes : []) {
    lignes.push({
      lieu: `${e.station} · ${e.system}${plateforme(e.pad)}`,
      faire: [marchandise(e.vend) && `Vendre : ${marchandise(e.vend)}`, marchandise(e.achete) && `Acheter : ${marchandise(e.achete)}`].filter(Boolean),
      trajet: trajet(e.trajet),
    });
  }
  lignes.push({
    lieu: `Retour à ${d.depart.station}`,
    faire: [marchandise(d.retour?.vend) && `Vendre : ${marchandise(d.retour.vend)}`].filter(Boolean),
    trajet: trajet(d.retour?.trajet),
  });
  return lignes;
}

/** Ce qu'elle rapporte à celui qui la partage : « ≈ 75,5 M par boucle · ≈ 17 min · 1 218 t par trajet · 8 boucles ». */
export function bilanRoute(d) {
  return [
    d?.gainMoyen != null && `≈ ${compact(d.gainMoyen)} par boucle`,
    d?.minutesMoyennes != null && `≈ ${Math.round(d.minutesMoyennes)} min`,
    d?.soute != null && `${int(d.soute)} t par trajet`,
    d?.sautLePlusLong != null && `saut le plus long ${dec1(d.sautLePlusLong)} al`,
    d?.boucles != null && `${int(d.boucles)} boucle${d.boucles > 1 ? 's' : ''} mesurée${d.boucles > 1 ? 's' : ''}`,
  ].filter(Boolean).join(' · ');
}
