// Valeur des attributs d'un module installé : fiche d'eddb.js, modification au grade choisi, effet expérimental.
//
// Modèle (chaque modification est comptée à son maximum : depuis la mise à jour 18.08 d'août 2024, chaque grade
// d'ingénierie se termine à 100 %) :
//   1. valeur d'origine : celle de la fiche du module, sinon la valeur par défaut de l'attribut (eddb.attributes),
//      qui peut renvoyer à un autre attribut (ex. multiplicateur de vitesse mini → multiplicateur mini) ;
//   2. effets : la modification donne, par grade, un nombre (en % sauf mention contraire) ; l'effet expérimental
//      donne un nombre fixe. Ramenés à une fraction (÷ 100, ou ÷ l'échelle propre de l'attribut, ou tels quels
//      pour un attribut remplacé ou ajouté) ;
//   3. certains attributs suivent la modification d'un autre (mini et maxi suivent l'optimal) ;
//   4. combinaison des effets : remplacement → le dernier l'emporte ; addition → somme ;
//      sinon les variations relatives se multiplient : (1 + a)(1 + b) − 1 ;
//   5. application selon le mode de l'attribut :
//        remplacement (modset)  : valeur = effet          (ex. type de dégâts, taille de rafale)
//        addition (modadd)      : valeur + effet          (ex. projectiles par tir)
//        échelle m (modmod)     : la grandeur qui varie est (1 + valeur/m) : valeur' = ((1 + v/m)(1 + effet) − 1)·m
//                                 m = 100 pour un bonus en % (renfort de coque : +x % → multiplicateur 1 + x/100),
//                                 m = −100 pour une résistance (c'est la part des dégâts qui passe, 1 − v/100, qui varie)
//        relatif (par défaut)   : valeur × (1 + effet)
//      puis arrondi au pas de l'attribut et bornes mini / maxi ;
//   6. règles propres à deux attributs, quand ils sont modifiés : le chargeur est arrondi au multiple supérieur
//      de la taille de rafale, et la baisse des dégâts ne commence jamais au-delà de la portée maximale.
// Une modification ne touche que les attributs que le type de module déclare modifiables (mtype.modifiable) ;
// un effet expérimental touche tous les attributs qu'il cite.
// Règles 3 et 6 vérifiées contre edsy.org le 7 nov. 2026 (rotation des propulseurs modifiés, chargeur du Double
// tir, Longue portée).

import { moduleOf } from '../../core/reference/eddbData.js';

const ruleTables = new WeakMap();

/** Règles des attributs (mode, échelle, pas, bornes, valeur par défaut), indexées par nom ; calculées une fois. */
function attributeRules(eddb) {
  let rules = ruleTables.get(eddb);
  if (!rules) {
    rules = new Map();
    for (const rule of Object.values(eddb.attributes || {})) if (rule) rules.set(rule.attr, rule);
    ruleTables.set(eddb, rules);
  }
  return rules;
}

const NO_RULE = Object.freeze({});

// Attributs qui suivent la modification d'un autre : [attribut suivi, plancher éventuel de la variation]
const FOLLOWERS = new Map([
  ['genminmul', ['genoptmul']],
  ['genmaxmul', ['genoptmul']],
  ['genminmass', ['genoptmass']],
  ['genmaxmass', ['genoptmass', 0]], // une masse optimale réduite ne réduit pas la masse maximale
  ['engminmass', ['engoptmass']],
  ['engmaxmass', ['engoptmass']],
  ['engminmul', ['engoptmul']],
  ['engmaxmul', ['engoptmul']],
  ['minmulspd', ['engoptmul']],
  ['optmulspd', ['engoptmul']],
  ['maxmulspd', ['engoptmul']],
  // La rotation suit, comme la vitesse, le multiplicateur optimal des propulseurs (Propulseurs modifiés…)
  ['minmulrot', ['engoptmul']],
  ['optmulrot', ['engoptmul']],
  ['maxmulrot', ['engoptmul']],
  // Les projectiles vont plus vite quand la portée s'allonge (Longue portée), jamais moins vite quand elle diminue
  ['shotspd', ['maximumrng', 0]],
  // Portée maximale des capteurs : suit leur portée de détection d'une émission typique (Longue portée : plus loin,
  // Grand angle : moins loin), sans plancher, comme EDSY (getRelatedAttrModifier)
  ['maxrng', ['typemis']],
]);

/** Taille du chargeur : au multiple supérieur de la rafale (à 1e-9 près, pour qu'un produit entier ne passe pas au suivant). */
const roundClip = (clip, burst) => Math.ceil(clip / burst - 1e-9) * burst;

const hasMode = (rule) => Boolean(rule.modset || rule.modadd || rule.modmod);

/** Diviseur qui ramène un nombre de modification ou d'effet à la grandeur de l'attribut. */
const scaleOf = (rule) => (rule.modset || rule.modadd ? 1 : rule.modmod || 100);

/** Deux effets sur un même attribut ; un effet nul ou indéfini ne compte pas. */
function combine(rule, first, second) {
  if (!second) return first;
  if (!first) return second;
  if (rule.modset) return second;
  if (rule.modadd) return first + second;
  return (1 + first) * (1 + second) - 1;
}

/**
 * Module installé dans un emplacement.
 * @param {object} eddb tables d'EDSY
 * @param {object|null} ship fiche du vaisseau (pour les blindages, propres à chaque coque)
 * @param {{ modid, bpid?, grade?, expid? }} entry contenu de l'emplacement
 * @returns {{ sheet: object|null, stock(attr): *, value(attr): number|* }}
 *   sheet : fiche du module (null si inconnu) ; stock : valeur d'origine ; value : valeur effective
 */
export function fitModule(eddb, ship, entry) {
  const rules = attributeRules(eddb);
  const sheet = moduleOf(eddb, ship, entry.modid);
  const family = eddb.mtype[sheet?.mtype] || {};
  const modifiable = new Set(family.modifiable || []);
  const blueprint = entry.bpid ? eddb.blueprint?.[entry.bpid] : null;
  const grade = entry.grade || 0;
  const effect = entry.expid ? eddb.expeffect?.[entry.expid] : null;
  const ruleOf = (attr) => rules.get(attr) || NO_RULE;

  function stock(attr, seen = new Set()) {
    const own = sheet?.[attr];
    if (own !== undefined && own !== null) return own;
    const fallback = ruleOf(attr).default;
    // Une valeur par défaut textuelle qui nomme un attribut renvoie à celui-ci (sans boucler)
    if (typeof fallback === 'string' && rules.has(fallback) && !seen.has(fallback)) return stock(fallback, seen.add(attr));
    return fallback;
  }

  /** Variation due à la modification, au grade choisi borné à [1, grade maximal]. */
  function fromBlueprint(attr) {
    const perGrade = blueprint?.[attr];
    if (!perGrade || !grade || !modifiable.has(attr)) return 0;
    const rule = ruleOf(attr);
    // Une variation relative sur une valeur nulle ne change rien : on ne la compte pas
    if (!hasMode(rule) && !stock(attr)) return 0;
    const g = Math.min(Math.max(grade, 1), blueprint.maxgrade);
    return perGrade[g - 1] / scaleOf(rule);
  }

  function fromEffect(attr) {
    const amount = effect?.[attr];
    return amount ? amount / scaleOf(ruleOf(attr)) : 0;
  }

  function fromFollowed(attr) {
    const link = FOLLOWERS.get(attr);
    if (!link) return 0;
    const [followed, floor] = link;
    const change = totalChange(followed);
    return floor === undefined ? change : Math.max(floor, change);
  }

  function totalChange(attr) {
    const rule = ruleOf(attr);
    return combine(rule, combine(rule, fromEffect(attr), fromFollowed(attr)), fromBlueprint(attr));
  }

  function value(attr) {
    const original = stock(attr);
    if (original === undefined || original === null) return 0;
    const change = totalChange(attr);
    const rule = ruleOf(attr);
    if (!change || Number.isNaN(original) || (!original && !hasMode(rule))) return original;
    let v;
    if (rule.modset) v = change;
    else if (rule.modadd) v = original + change;
    else if (rule.modmod) v = ((1 + original / rule.modmod) * (1 + change) - 1) * rule.modmod;
    else v = original * (1 + change);
    // Chargeur modifié : des rafales entières (Double tir : rafales de 2 coups, 3 × 1,35 = 4,05 → 6 coups)
    if (attr === 'ammoclip') v = roundClip(v, Math.max(1, value('bstsize') || 1));
    else if (rule.step) v = Math.round(v / rule.step) * rule.step;
    // Baisse des dégâts modifiée (Longue portée : +9 999 %) : elle commence au plus à la portée maximale
    if (attr === 'dmgfall' && value('maximumrng') > 0) v = Math.min(v, value('maximumrng'));
    if (rule.min !== undefined) v = Math.max(v, rule.min);
    if (rule.max !== undefined) v = Math.min(v, rule.max);
    return v;
  }

  // effect : fiche de l'effet expérimental (son nom Frontier distingue les effets sans attribut chiffré)
  return { sheet, effect, stock: (attr) => stock(attr), value };
}

// Effet expérimental « Rechargement automatique » : une munition revient dans le chargeur tous les deux tirs
const AUTO_LOADER = 'special_auto_loader';

/**
 * Cadences et DPS d'une arme. Une arme tire par rafales de `bstsize` coups (cadence interne `bstrof` coups/s),
 * séparées de `bstint` s ; `duration` est un temps de charge avant chaque tir. Avec un chargeur, elle tire ses
 * coups en ceil(coups / rafale) rafales (la dernière, même incomplète, compte pour une rafale entière), puis recharge
 * pendant `rldtime` s, dont le dernier intervalle (charge + bstint) fait déjà partie.
 *   coups par chargeur = ammoclip, ou 2 × ammoclip − 1 avec le Rechargement automatique (sans chargeur : une rafale)
 *   durée du chargeur  = rafales × (charge + (bstsize − 1)/bstrof + bstint)
 *   cadence soutenue   = coups par chargeur / (durée du chargeur + max(0, rldtime − charge − bstint)) ;
 *                        infinie pour un rayon (durée nulle)
 *   cadence en rafale  = coups par chargeur / durée du chargeur (chargeur plein, sans rechargement)
 *   DPS = dégâts par coup × projectiles × cadence ; pour un rayon, les dégâts sont déjà par seconde (cadence 1)
 * Arme à charge facultative (multiplicateur de dégâts à pleine charge `dmgmul` : chargeur à plasma guardian,
 * charges sismiques…) : tirs comptés sans charge, donc sans temps de charge ni multiplicateur, comme EDSY.
 * Une charge obligatoire (canon électrique, canon gauss guardian : pas de multiplicateur) est comptée.
 * @param {ReturnType<typeof fitModule>} weapon
 * @returns {{ sustainedRate: number, burstRate: number, shotDamage: number, sustainedDps: number, burstDps: number,
 *   clipTime: number }} clipTime : s pour vider le chargeur en rafale (une rafale sans chargeur)
 */
export function firingProfile(weapon) {
  const v = weapon.value;
  const perBurst = v('bstsize') || 1;
  const burstCadence = v('bstrof') || 1;
  const gap = v('bstint') || 0;
  const charge = v('dmgmul') ? 0 : v('duration') || 0;
  const clip = v('ammoclip');
  const reload = v('rldtime') || 0;

  const autoLoader = clip > 0 && weapon.effect?.fdname === AUTO_LOADER;
  const shots = clip ? (autoLoader ? 2 * clip - 1 : clip) : perBurst;
  const burstTime = charge + (perBurst - 1) / burstCadence + gap;
  const clipTime = Math.ceil(shots / perBurst) * burstTime;
  const sustainedRate = shots / (clipTime + Math.max(0, reload - charge - gap));
  const burstRate = clipTime > 0 ? shots / clipTime : 1;

  const shotDamage = v('damage') * (v('rounds') || 1);
  return {
    sustainedRate,
    burstRate,
    shotDamage,
    sustainedDps: shotDamage * (Number.isFinite(sustainedRate) ? sustainedRate : 1),
    burstDps: shotDamage * burstRate,
    clipTime,
  };
}
