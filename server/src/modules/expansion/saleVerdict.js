// Verdict Powerplay d'un lot de la soute vendu dans un système donné : compte-t-il, et sinon pourquoi.
// Les règles appliquées sont dans saleRules.js, avec leurs sources ; ce fichier ne fait que les combiner.

import {
  ACQUISITION_RANGE_LY, ACQUISITION_SOURCE_STATES, ACQUISITION_TRADE_MIN_MARGIN, REINFORCEMENT_SAME_SYSTEM,
  UNDERMINING_SAME_SYSTEM, RARE_OTHER_SYSTEM,
} from './saleRules.js';

export const STATE_LABELS = {
  Unoccupied: 'Inoccupé', Exploited: 'Exploité', Fortified: 'Consolidé', Stronghold: 'Forteresse', Contested: 'Disputé',
};
export const MODE_LABELS = {
  reinforcement: 'renforcement', acquisition: 'acquisition', enemy: 'système ennemi', empty: 'sans puissance', unpledged: 'sans engagement',
};
export const KIND_LABELS = { mined: 'miné', bought: 'acheté', rare: 'rare acheté', collected: 'ramassé', unknown: 'provenance inconnue' };

/** Libellé d'une table pour une clé venue du journal ou du fichier : propre à la table seulement, sinon null. */
export const labelOf = (table, key) => (typeof key === 'string' && Object.hasOwn(table, key) ? table[key] : null);

const stateLabel = (s) => (typeof s === 'string' && s ? labelOf(STATE_LABELS, s) || s : null);

/** « Forteresse d'Aisling Duval », « Inoccupé », « sans puissance » */
export function describePlace(place) {
  if (!place || place.unknown) return 'état inconnu';
  if (place.power) return `${stateLabel(place.state) || 'tenu'} ${/^[AEIOUYÉ]/i.test(place.power) ? "d'" : 'de '}${place.power}`;
  if (place.state) return stateLabel(place.state);
  return 'sans puissance';
}

/**
 * Mode Powerplay d'une vente dans ce système, pour ta puissance.
 * @returns 'unpledged' | 'reinforcement' | 'acquisition' | 'enemy' | 'empty'
 */
export function modeAt(place, power) {
  if (!power) return 'unpledged';
  if (!place || place.unknown) return null;
  if (place.power === power) return 'reinforcement';
  if (place.power) return 'enemy';
  if ((place.powers || []).includes(power)) return 'acquisition';
  return 'empty';
}

/** Distance en AL entre deux systèmes connus, ou null. */
export function distanceLy(a, b) {
  if (!a?.starPos || !b?.starPos) return null;
  return Math.hypot(a.starPos[0] - b.starPos[0], a.starPos[1] - b.starPos[1], a.starPos[2] - b.starPos[2]);
}

const of = (power) => (/^[AEIOUYÉ]/i.test(power) ? `d'${power}` : `de ${power}`);
const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString('fr-FR');

/**
 * Le lot vient-il d'un système Consolidé ou Forteresse de ta puissance, à portée du système de vente ?
 * @returns null si oui, sinon { cause, text }
 */
function acquisitionSource(lot, here, power, what) {
  const src = lot.place;
  const supported = src && src.power === power && ACQUISITION_SOURCE_STATES.includes(src.state);
  // Mesuré : une source sans ta puissance (Inoccupée, autre puissance, sans puissance) ne rapporte rien. Une source de ta
  // puissance dans un autre état (Exploité…), elle, n'a jamais été vue : la règle publiée le dit, à vérifier.
  if (!supported && src && src.power === power) {
    return {
      cause: lot.kind === 'mined' ? 'acq-mined-unsupported' : 'acq-bought-unsupported',
      unverified: true,
      text: `${what} à ${lot.system || '?'} (${describePlace(src)}) : en acquisition, il devrait venir d'un système Consolidé ou Forteresse ${of(power)} (règle publiée, jamais mesurée : à vérifier).`,
    };
  }
  if (!supported) {
    return {
      cause: lot.kind === 'mined' ? 'acq-mined-unsupported' : 'acq-bought-unsupported',
      text: `${what} à ${lot.system || '?'} (${describePlace(src)}) : en acquisition, il doit venir d'un système Consolidé ou Forteresse ${of(power)}.`,
    };
  }
  const d = distanceLy(src, here);
  const range = ACQUISITION_RANGE_LY[src.state];
  if (d != null && d > range) {
    // Portée publiée, jamais mesurée : à vérifier
    return { cause: 'acq-out-of-range', unverified: true, text: `${what} à ${lot.system}, à ${fmt1(d)} AL : la portée d'un système ${stateLabel(src.state)} serait de ${range} AL (règle publiée, jamais mesurée : à vérifier).` };
  }
  return null;
}

/**
 * Verdict d'un lot vendu ici.
 * @param lot { kind, system, place, buyPrice, viaCarrier }
 * @param here état du système de vente (placeOf)
 * @param power ta puissance
 * @param sellPrice prix de vente unitaire, pour la marge en acquisition (facultatif)
 * @returns {{ ok: boolean|null, cause: string|null, text: string, mode, unverified?: true }} ok null : on ne sait pas ;
 *   unverified : « compte » d'après une règle publiée dont le cas positif n'a jamais été vu (acquisition)
 */
export function lotVerdict(lot, here, power, sellPrice = null) {
  const mode = modeAt(here, power);
  const sameSystem = lot.system && here && lot.system === here.system;
  const note = lot.viaCarrier ? ' Passé par ton porteur : règle non documentée, à mesurer.' : '';
  const res = (ok, cause, text) => ({ ok, cause, text: text + note, mode });

  if (mode === 'unpledged') return res(false, 'unpledged', "Tu n'es engagé auprès d'aucune puissance : pas de mérites.");
  if (mode === null) return res(null, 'here-unknown', "État Powerplay du système inconnu : refais un saut pour le relever.");
  if (mode === 'empty') {
    const absent = here.powers?.length ? `${power} n'est pas présente à ${here.system}` : `${here.system} n'a aucune puissance`;
    return res(false, 'empty', `${absent} : aucun mérite.`);
  }
  if (lot.kind === 'unknown') return res(null, 'unknown', "Provenance inconnue : acquise avant les journaux lus, ou hors de la soute suivie.");
  if (lot.kind === 'collected') return res(null, 'collected', `Ramassé dans l'espace à ${lot.system || '?'} : règle Powerplay inconnue.`);

  if (mode === 'enemy') {
    if (lot.kind === 'mined' && sameSystem && UNDERMINING_SAME_SYSTEM) {
      return res(null, 'undermining', `Miné dans ce système tenu par ${here.power} : sabotage possible (règle publiée, jamais mesurée).`);
    }
    return res(false, 'enemy', `${here.system} est ${describePlace(here)} : vendre ici ne rapporte rien à ${power}.`);
  }

  if (lot.kind === 'rare') {
    if (sameSystem && RARE_OTHER_SYSTEM) return res(false, 'rare-same-system', 'Rare acheté dans ce système : il faut le vendre ailleurs.');
    return res(true, null, `Rare acheté à ${lot.system || '?'}.`);
  }

  if (mode === 'reinforcement') {
    if (lot.kind === 'mined') {
      if (sameSystem || !REINFORCEMENT_SAME_SYSTEM) return res(true, null, 'Miné sur place.');
      return res(false, 'reinf-mined-elsewhere', `Miné à ${lot.system || '?'} : en renforcement, le minerai doit être miné et vendu dans le même système.`);
    }
    return res(true, null, `Acheté à ${lot.system || '?'}.`);
  }

  // Acquisition
  const what = lot.kind === 'mined' ? 'Miné' : 'Acheté';
  const bad = acquisitionSource(lot, here, power, what);
  // Cas jamais mesuré : « on ne sait pas » (ok null), jamais présenté comme sûr
  if (bad?.unverified) return { ...res(null, bad.cause, bad.text), unverified: true };
  if (bad) return res(false, bad.cause, bad.text);
  if (lot.kind === 'bought' && lot.buyPrice && sellPrice) {
    const margin = (sellPrice - lot.buyPrice) / lot.buyPrice;
    if (margin < ACQUISITION_TRADE_MIN_MARGIN) {
      return res(false, 'acq-low-margin', `Bénéfice de ${Math.round(margin * 100)} % : il en faudrait au moins ${Math.round(ACQUISITION_TRADE_MIN_MARGIN * 100)} % en acquisition (règle à vérifier).`);
    }
  }
  // Règles publiées dont seul le cas négatif a été vu (ACQUISITION_SOURCE_STATES, ACQUISITION_TRADE_MIN_MARGIN) : le
  // lot « compte », mais aucune vente de minerai ni de commerce créditée en acquisition n'a encore été vue. La prévision
  // (saleForecast.js) le dit tant que tes propres ventes n'en ont pas mesuré une.
  return { ...res(true, null, `${what} à ${lot.system} (${describePlace(lot.place)}) : compte d'après la règle publiée, jamais vue créditée (à vérifier).`), unverified: true };
}
