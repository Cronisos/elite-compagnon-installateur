// Échangeur de matériaux : pour chaque matériau qui manque aux plans, quoi donner chez l'échangeur, en ne prenant que
// le surplus (ce qui dépasse les besoins des plans). Taux du jeu : dépôt des règles (regles/echangeurs.js, mesurés).
// On préfère : un matériau au plafond ou presque (il serait perdu à la prochaine collecte), la même catégorie (pas de
// pénalité), puis le moins cher en valeur. Fonction pure, testée par echanges.test.js.

import { TRADE_CATEGORY_PENALTY, TRADE_DOWN_GAIN, TRADE_UP_COST } from '../../../regles/echangeurs.js';

const ECHANGEABLES = new Set(['Raw', 'Manufactured', 'Encoded']);
const echangeable = (m) => ECHANGEABLES.has(m?.type) && m.grade >= 1 && m.grade <= 5 && m.category && m.category !== 'None';

/** Matériaux reçus pour 1 donné, d'un matériau à un autre du même type (fraction possible : 13,5, 1/6, 1/36…). */
export function taux(source, cible) {
  const d = source.grade - cible.grade;
  let r = d >= 0 ? TRADE_DOWN_GAIN ** d : 1 / TRADE_UP_COST ** -d;
  if (String(source.category) !== String(cible.category)) r /= TRADE_CATEGORY_PENALTY;
  return r;
}

/** Lot le plus petit que le jeu échange : { donne, recoit } entiers (13,5 → 2 donnés pour 27 ; 1/36 → 36 pour 1). */
export function lot(r) {
  if (r >= 1) {
    for (let donne = 1; donne <= 12; donne++) if (Number.isInteger(Math.round(r * donne * 1e9) / 1e9)) return { donne, recoit: Math.round(r * donne) };
    return { donne: 1, recoit: Math.floor(r) };
  }
  return { donne: Math.round(1 / r), recoit: 1 };
}

/** Valeur d'un matériau en « G1 » (ce qu'il rapporte en descendant) : pour comparer ce qu'on donne. */
const valeur = (m) => TRADE_DOWN_GAIN ** (m.grade - 1);

/**
 * @param manques [{ key, label, type, category, grade, missing }] matériaux qui manquent aux plans
 * @param stock [{ key, label, type, category, grade, count, max, need }] inventaire ; need : besoin des plans (0 sinon)
 * @returns [{ key, label, grade, manque, echanges: [{ key, label, grade, memeCategorie, donne, recoit, perdu? }], reste,
 *   echangeable, place?, plusieursPassages? }]
 *   reste : ce qui manque encore après les échanges proposés (0 : couvert), en ne comptant que le reçu utile ;
 *   place : ce que le stock du matériau peut encore garder (plafond − stock), quand le plafond est connu ;
 *   plusieursPassages : il manque plus que cette place, à faire en plusieurs fois (utiliser, puis revenir échanger) ;
 *   perdu : reçu au-delà du plafond (un lot entier qui dépasse), seulement quand aucun autre lot ne tient.
 */
export function planEchanges(manques, stock) {
  // Surplus de chaque matériau : ce qui dépasse le besoin des plans
  const surplus = new Map();
  const parCle = new Map();
  for (const s of stock || []) {
    parCle.set(s.key, s);
    if (!echangeable(s)) continue;
    const libre = Math.max(0, (s.count || 0) - (s.need || 0));
    if (libre > 0) surplus.set(s.key, { ...s, libre });
  }
  const out = [];
  for (const m of [...(manques || [])].sort((a, b) => b.grade - a.grade)) {
    if (!(m.missing > 0)) continue;
    if (!echangeable(m)) {
      out.push({ key: m.key, label: m.label, grade: m.grade, manque: m.missing, echanges: [], reste: m.missing, echangeable: false });
      continue;
    }
    // Plafond du matériau reçu : le stock n'en garde pas plus que max − stock (l'excédent serait perdu)
    const cible = parCle.get(m.key);
    const place = cible?.max > 0 ? Math.max(0, cible.max - (cible.count || 0)) : Infinity;
    let besoin = Math.min(m.missing, place); // ce qu'il est utile de recevoir maintenant
    let placeLibre = place;
    let recu = 0;
    const echanges = [];
    // Sources possibles, la meilleure d'abord
    const sources = [...surplus.values()]
      .filter((s) => s.key !== m.key && s.type === m.type)
      .map((s) => {
        const r = taux(s, m);
        const l = lot(r);
        const plein = s.max ? s.count / s.max : 0;
        return { s, r, l, cout: (l.donne * valeur(s)) / l.recoit, plein, meme: String(s.category) === String(m.category) };
      })
      .sort((a, b) => (b.plein >= 0.9) - (a.plein >= 0.9) || b.meme - a.meme || a.cout - b.cout || b.plein - a.plein);
    // D'abord les lots qui tiennent sous le plafond ; s'il manque encore, un lot qui le dépasse (excédent perdu, signalé)
    for (const debordeOk of [false, true]) {
      for (const x of sources) {
        if (besoin <= 0) break;
        const lotsPossibles = Math.floor(x.s.libre / x.l.donne);
        if (lotsPossibles <= 0) continue;
        let lots = Math.min(lotsPossibles, Math.ceil(besoin / x.l.recoit));
        if (!debordeOk) lots = Math.min(lots, Math.floor(placeLibre / x.l.recoit));
        if (lots <= 0) continue;
        const donne = lots * x.l.donne;
        const recoit = lots * x.l.recoit;
        const utile = Math.min(recoit, besoin);
        const perdu = Math.max(0, recoit - placeLibre);
        x.s.libre -= donne;
        placeLibre = Math.max(0, placeLibre - recoit);
        besoin -= utile;
        recu += utile;
        const deja = echanges.find((e) => e.key === x.s.key);
        if (deja) {
          deja.donne += donne;
          deja.recoit += recoit;
          if (perdu) deja.perdu = (deja.perdu || 0) + perdu;
        } else echanges.push({ key: x.s.key, label: x.s.label, grade: x.s.grade, memeCategorie: x.meme, donne, recoit, ...(perdu ? { perdu } : {}) });
      }
    }
    const reste = Math.max(0, m.missing - recu);
    const plafond = Number.isFinite(place) ? { place, ...(m.missing > place ? { plusieursPassages: true } : {}) } : {};
    out.push({ key: m.key, label: m.label, grade: m.grade, manque: m.missing, echanges, reste, echangeable: true, ...plafond });
  }
  return out;
}
