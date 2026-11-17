// Modules limités en nombre par vaisseau, comme dans le jeu (champ « limit » d'EDSY, eddb.limit) : un seul générateur
// de boucliers, un seul booster FSD gardien, un seul collecteur de carburant, une seule raffinerie, un seul
// ordinateur d'appontage, quatre armes expérimentales au plus… Le constructeur grise ce qui dépasse, et un build qui
// dépasse n'est pas enregistré (l’auteur, 15 nov. 2026 : « il est possible de mettre deux boucliers »).

import { GROUPS } from '../../core/reference/edsy.js';
import { moduleOf } from '../../core/reference/edsyBuild.js';
import { frenchName } from './names.js';

/** Nom de la famille limitée, en français. */
export const LIMIT_LABELS = {
  isg: 'générateur de boucliers',
  ifsdb: 'booster FSD gardien',
  ifs: 'collecteur de carburant',
  ir: 'raffinerie',
  ifsdi: 'intercepteur FSD',
  ifh: 'hangar à chasseurs',
  imlc: 'contrôleur multi-drones',
  ifa_dc: "ordinateur d'appontage",
  ifa_sc: 'assistance de supercroisière',
  hex: 'arme expérimentale',
  uex: 'utilitaire expérimental',
  iex: 'module expérimental interne',
  ukws: 'scanner de mandat',
  ucs: 'scanner de cargaison',
  upwa: "analyseur d'onde pulsée",
  ufsws: 'scanner de sillage FSD',
};

/** Pluriels des familles limitées à plus d'un exemplaire. */
const PLURIELS = { hex: 'armes expérimentales' };
/** Familles au féminin : « une seule raffinerie ». */
const FEMININS = new Set(['ir', 'ifa_sc', 'hex']);

/** Libellé d'une limite : « un seul générateur de boucliers », « 4 armes expérimentales au plus ». */
export function limitText(key, max, exemple = null) {
  const nom = LIMIT_LABELS[key] || (exemple ? frenchName(exemple).toLowerCase() : key);
  if (max === 1) return `${FEMININS.has(key) ? 'une seule' : 'un seul'} ${nom} par vaisseau`;
  return `${max} ${PLURIELS[key] || nom.replace(/^(\S+)/, '$1s')} au plus par vaisseau`;
}

/**
 * Limites dépassées par un build : [{ key, max, n, texte }]. Le jeu refuse ces configurations.
 * Certains modules relèvent la limite d'une autre famille (champs unlimit / unlimitcount d'EDSY) : le stabilisateur
 * d'armes expérimentales 3F permet une arme expérimentale de plus, le 5F deux de plus. La limite d'une famille est
 * donc eddb.limit + la somme des unlimitcount des modules installés qui la relèvent, comme EDSY.
 * @param build { shipId, slots }
 */
export function depassements(eddb, build) {
  const ship = eddb.ship[build.shipId];
  if (!ship) return [];
  const counts = new Map();
  const extra = {};
  for (const g of GROUPS) {
    for (const s of build.slots?.[g] || []) {
      if (!s?.modid) continue;
      const m = moduleOf(eddb, ship, s.modid);
      if (m?.unlimit) extra[m.unlimit] = (extra[m.unlimit] || 0) + (Number(m.unlimitcount) || 0);
      if (!m?.limit) continue;
      const c = counts.get(m.limit) || { n: 0, exemple: m };
      c.n++;
      counts.set(m.limit, c);
    }
  }
  const out = [];
  for (const [key, { n, exemple }] of counts) {
    const base = eddb.limit?.[key];
    if (!base) continue;
    const max = base + (extra[key] || 0);
    if (n > max) out.push({ key, max, n, texte: `${limitText(key, max, exemple)} (${n} installés)` });
  }
  return out;
}
