// Statistiques d'un build : masse, saut, énergie, boucliers, coque, armement, distributeur, mobilité, chaleur, prix.
//
// Valeurs des modules : attributes.js (chaque modification comptée au maximum de son grade). Formules physiques :
// formulas.js. Données : eddb.js (© taleden, CC BY-NC 4.0), lu comme une donnée. Résultats vérifiés contre ceux
// affichés par edsy.org (edsy.test.js, relevés du 7 nov. 2026) et contre les valeurs du journal du jeu (builder.test.js).
// Simplifications assumées : réserve de carburant comptée dans la seule rotation (comme EDSY : la vitesse s'en passe),
// mode SCO non modélisé, vitesse et rotation calculées sans la cargaison ; vitesse NaN quand les propulseurs sont trop
// faibles pour la masse du vaisseau.

import { GROUPS, SHIP_HATCH_ID } from '../../core/reference/edsy.js';
import { fitModule, firingProfile } from './attributes.js';
import { jumpLength, rangeOnFullTank, massCurve, effectiveResistance } from './formulas.js';

export { massCurve, effectiveResistance } from './formulas.js';

// Rangs des modules de base dans build.slots.component
const ARMOUR = 0;
const POWER_PLANT = 1;
const THRUSTERS = 2;
const FSD = 3;
const DISTRIBUTOR = 5;

// Part de chaque type de dégâts (attribut en %) : cinétique, thermique, explosif, absolu, caustique, anti-xéno
const DAMAGE_SHARES = { kin: 'kinwgt', thm: 'thmwgt', exp: 'expwgt', abs: 'abswgt', cau: 'cauwgt', axe: 'axewgt' };
const RESISTANCES = { kin: 'kinres', thm: 'thmres', exp: 'expres' };
const mapKinds = (kinds, fn) => Object.fromEntries(Object.entries(kinds).map(([k, attr]) => [k, fn(attr, k)]));

/** Pips du distributeur : 4 au plus par condensateur ; SYS à 2 par défaut, comme EDSY à l'ouverture d'un build. */
export const MAX_PIPS = 4;
export const SYS_PIPS_DEFAUT = 2;
/** Secondes d'attente d'un bouclier effondré avant qu'il recommence à se reconstruire (EDSY). */
const DELAI_RELANCE = 16;
/** Pips SYS demandés, ramenés entre 0 et 4 par demi-pip ; défaut 2. */
export function sysPipsOf(v) {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n)) return SYS_PIPS_DEFAUT;
  return Math.min(MAX_PIPS, Math.max(0, Math.round(n * 2) / 2));
}

/**
 * Secondes pour qu'un bouclier effondré revienne à 50 % (attente de 16 s comprise), ou null s'il n'y revient jamais.
 * D'abord à pleine vitesse (`brokenRegen`, MJ/s) tant que le condensateur SYS plein tient, puis au rythme qu'il
 * permet (sa recharge `sysChg` ÷ `draw`, MJ du condensateur par MJ de bouclier). Sans distributeur ou sans
 * consommation, pleine vitesse jusqu'au bout. Le condensateur qui suffit à tout (0 pip SYS, gros condensateur) ne
 * laisse rien pour la phase lente : 0 s, et pas 0 ÷ 0.
 */
export function tempsReconstruction({ half, brokenRegen, draw = 0, sysCap = 0, sysChg = 0, distributor = true }) {
  if (!(brokenRegen > 0) || !(half >= 0)) return null;
  const bride = draw > 0 && distributor;
  const consommation = bride ? brokenRegen * draw - sysChg : 0; // MJ/s pris au condensateur au-delà de sa recharge
  const vide = consommation > 0 ? sysCap / consommation : Infinity; // s avant que le condensateur soit vide
  const vite = Math.min(half / brokenRegen, vide);
  const reste = half - brokenRegen * vite; // MJ encore à reconstruire au rythme du condensateur
  let lent = 0;
  if (reste > 1e-9) {
    const rythme = bride ? Math.min(brokenRegen, sysChg / draw) : brokenRegen;
    if (!(rythme > 0)) return null; // condensateur vide et sans recharge : le bouclier ne revient pas
    lent = reste / rythme;
  }
  const total = DELAI_RELANCE + vite + lent;
  return Number.isFinite(total) ? total : null;
}

/** Attributs simplement additionnés sur tous les modules installés. */
const SUMMED = ['mass', 'pwrcap', 'fuelcap', 'cargocap', 'hullbst', 'hullrnf', 'jumpbst', 'shieldbst', 'shieldrnf'];

/**
 * Inventaire du build : totaux additifs et modules classés par rôle. Les modules inconnus d'eddb.js sont ignorés.
 * Parcours dans l'ordre des groupes puis des emplacements (le premier générateur de bouclier est le seul compté).
 */
function inventory(eddb, ship, build) {
  const sum = Object.fromEntries(SUMMED.map((a) => [a, 0]));
  sum.mass = ship.mass;
  const out = {
    sum, drawDeployed: 0, drawRetracted: 0, cost: ship.cost || 0, cabins: 0,
    weapons: [], cellBanks: [], moduleGuards: [], shieldBoosters: [], hullPlates: [], generator: null,
  };
  for (const group of GROUPS) {
    (build.slots[group] || []).forEach((entry, slot) => {
      if (!entry?.modid) return;
      const m = fitModule(eddb, ship, entry);
      if (!m.sheet) return;
      for (const a of SUMMED) sum[a] += m.value(a);
      const draw = m.value('pwrdraw');
      out.drawDeployed += draw;
      // Armes rentrées : les points d'emport et les utilitaires actifs ne consomment plus
      if (group !== 'hardpoint' && (group !== 'utility' || m.sheet.passive)) out.drawRetracted += draw;
      out.cost += m.stock('cost') || 0; // prix catalogue, sans remise
      out.cabins += m.value('cabincap') || 0;
      if (group === 'hardpoint') {
        out.weapons.push({ slot, m });
        return;
      }
      const role = m.sheet.mtype;
      if (role === 'iscb') out.cellBanks.push({ slot, m });
      else if (role === 'imrp') out.moduleGuards.push(m);
      else if (role === 'usb') out.shieldBoosters.push(m);
      else if (role === 'ihrp' || role === 'imahrp') out.hullPlates.push(m);
      else if (role === 'isg' && !out.generator) out.generator = m;
    });
  }
  // Trappe de soute : sur chaque coque, hors des emplacements du build, et allumée (0,6 MW) : le jeu et EDSY la comptent
  const hatch = fitModule(eddb, ship, { modid: SHIP_HATCH_ID });
  if (hatch.sheet) {
    const draw = hatch.value('pwrdraw') || 0;
    out.drawDeployed += draw;
    out.drawRetracted += draw;
  }
  return out;
}

/** Module installé à un rang donné (même inconnu d'eddb.js : ses attributs prennent alors leurs valeurs par défaut). */
function fittedAt(eddb, ship, build, group, index) {
  const entry = build.slots[group]?.[index];
  return entry?.modid ? fitModule(eddb, ship, entry) : null;
}

/** Effet expérimental qui recharge l'arme sur le carburant du vaisseau (Balle à plasma : wpnx_plsl, hrgx_plsl). */
const FUEL_RELOAD = /reload from ship fuel/i;

/**
 * Une ligne de la liste des armes, la chaleur produite en tir soutenu, et ce que l'arme tire du condensateur WEP
 * (MW, en rafale et en tir soutenu) avec la durée de son chargeur (voir capacitorTime).
 * Munitions : comptées dès qu'il y a un chargeur, réserve ou non (lance-torpilles : un chargeur, aucune réserve),
 * comme EDSY ; une arme rechargée sur le carburant (Balle à plasma, réserve à −100 %) tire sans fin (ammo.fuel). EDSY
 * lui donne la durée d'un seul chargeur : écart d'EDSY, l'arme se recharge en jeu sur le réservoir.
 */
function weaponLine({ slot, m }) {
  const v = m.value;
  const profile = firingProfile(m);
  const rate = Number.isFinite(profile.sustainedRate) ? profile.sustainedRate : null; // null : rayon, tir continu
  const clip = v('ammoclip') || 0;
  const reserve = v('ammomax') || 0;
  const fuel = clip > 0 && FUEL_RELOAD.test(m.effect?.special || '');
  const rounds = clip > 0 && !fuel ? clip + reserve : 0;
  const draw = v('distdraw') || 0;
  return {
    usesWep: draw > 0,
    capacitor: { burst: draw * profile.burstRate, sustained: draw * (rate ?? 1), clipTime: profile.clipTime },
    sustainedHeat: v('thmload') * (rate ?? 1),
    line: {
      slot,
      sdps: profile.sustainedDps,
      bdps: profile.burstDps,
      rof: rate, // coups/s, rechargements compris
      damagePerShot: profile.shotDamage,
      pierce: v('pierce') || 0,
      // s de tir continu, toutes munitions (ralenti ensuite si le condensateur WEP se vide : computeStats) ; null : sans fin
      ammoTime: rounds && rate ? rounds / rate : null,
      power: v('pwrdraw') || 0,
      dist: draw * profile.burstRate, // tirage sur le condensateur WEP en rafale (MW)
      heat: (v('thmload') || 0) * profile.burstRate,
      range: v('maximumrng') || 0, // m
      ammo: clip > 0 ? { clip, max: reserve, fuel } : null, // fuel : rechargée sur le carburant du vaisseau
      damage: mapKinds(DAMAGE_SHARES, (attr) => (v(attr) || 0) / 100),
    },
  };
}

/**
 * Secondes de tir, toutes armes ensemble, avant de vider le condensateur WEP rechargé au maximum (4 pips) ;
 * null si la recharge suffit. Les armes tirent d'abord en rafale. Une arme dont le chargeur se vide avant le
 * condensateur tire ensuite à son rythme soutenu (ses rechargements laissent le condensateur se remplir) : on fait
 * passer les armes à ce rythme une à une, de la plus courte durée de chargeur à la plus longue, tant que le
 * condensateur tient plus longtemps que leur chargeur. Modèle vérifié contre edsy.org.
 * @param {number} capacity MJ
 * @param {number} recharge MW
 * @param {{ burst: number, sustained: number, clipTime: number }[]} draws tirage de chaque arme (MW) et durée de son chargeur (s)
 */
function capacitorTime(capacity, recharge, draws) {
  let drain = draws.reduce((acc, d) => acc + d.burst, 0);
  const seconds = () => (drain > recharge ? capacity / (drain - recharge) : Infinity);
  for (const d of [...draws].sort((a, b) => a.clipTime - b.clipTime)) {
    if (seconds() < d.clipTime) break; // le condensateur se vide avant ce chargeur, donc avant les suivants
    drain += d.sustained - d.burst;
  }
  const t = seconds();
  return Number.isFinite(t) ? t : null;
}

/** Points effectifs face à chaque type de dégâts : points / part qui passe (infini si la résistance atteint 100 %). */
const effectiveAgainst = (points, res) => res && Object.fromEntries(Object.entries(res).map(([k, r]) => [k, r < 100 ? points / (1 - r / 100) : Infinity]));

/** Produit, sur une liste de modules, des parts de dégâts qui passent (1 − résistance), et la plus petite d'entre elles. */
function passThrough(mods) {
  const product = { kin: 1, thm: 1, exp: 1 };
  const lowest = { kin: 1, thm: 1, exp: 1 };
  for (const m of mods) {
    for (const [k, attr] of Object.entries(RESISTANCES)) {
      const share = 1 - m.value(attr) / 100;
      product[k] *= share;
      lowest[k] = Math.min(lowest[k], share);
    }
  }
  return { product, lowest };
}

/**
 * @param {object} eddb tables d'EDSY
 * @param {object} build build (identifiants d'eddb.js)
 * @param {{ cargo?: number }} [opts] cargaison pour la portée chargée, en t (défaut : soute pleine)
 * @throws {Error} vaisseau inconnu
 */
export function computeStats(eddb, build, opts = {}) {
  const ship = eddb.ship[build.shipId];
  if (!ship) throw new Error(`Vaisseau EDSY inconnu (#${build.shipId}).`);
  const inv = inventory(eddb, ship, build);
  const { sum } = inv;
  const at = (index) => fittedAt(eddb, ship, build, 'component', index);
  const dryMass = sum.mass; // coque + modules
  const fuel = sum.fuelcap;

  // --- Saut ---
  const drive = at(FSD);
  const fsd = drive && {
    optmass: drive.value('fsdoptmass'), maxfuel: drive.value('maxfuel'), fuelmul: drive.value('fuelmul'), fuelpower: drive.value('fuelpower'),
  };
  const leap = (mass, tank) => (fsd ? jumpLength(fsd, mass, tank, sum.jumpbst) : 0);
  const fuelPerJump = Math.min(fuel, fsd?.maxfuel ?? 0);
  const cargo = opts.cargo ?? sum.cargocap;

  // --- Mobilité : courbe de masse des propulseurs, à vide avec le plein (et la réserve pour la rotation, comme EDSY) ---
  const thrusters = at(THRUSTERS);
  const distributorModule = at(DISTRIBUTOR);
  const thrustCurve = (suffix, mass) => {
    const mul = (k) => thrusters.value(`${k}mul${suffix}`) || thrusters.value(`eng${k}mul`);
    const t = thrusters.value;
    return massCurve(mass, t('engminmass'), t('engoptmass'), t('engmaxmass'), mul('min'), mul('opt'), mul('max')) / 100;
  };
  let speed = 0;
  let boost = 0;
  let rotation = null;
  if (thrusters) {
    const speedFactor = thrustCurve('spd', dryMass + fuel);
    speed = ship.topspd * speedFactor;
    // Boost possible seulement si le condensateur ENG plein couvre son coût
    boost = distributorModule && distributorModule.value('engcap') >= ship.boostcost ? ship.bstspd * speedFactor : 0;
    // Rotation : à la masse courante, réserve de carburant comprise (EDSY, edsy.js l. 9498)
    const turnFactor = thrustCurve('rot', dryMass + fuel + (ship.fuelreserve || 0));
    rotation = { pitch: ship.pitch * turnFactor, roll: ship.roll * turnFactor, yaw: ship.yaw * turnFactor };
  }

  // --- Boucliers : courbe de masse sur la masse de la coque seule, boosters, renforts ---
  const gen = inv.generator;
  let shieldPoints = 0;
  let shieldRes = null;
  if (gen && gen.value('genmaxmass') >= ship.mass) {
    const g = gen.value;
    const factor = massCurve(ship.mass, g('genminmass'), g('genoptmass'), g('genmaxmass'), g('genminmul'), g('genoptmul'), g('genmaxmul')) / 100;
    shieldPoints = ship.shields * (1 + sum.shieldbst / 100) * factor + sum.shieldrnf;
    const boosters = passThrough(inv.shieldBoosters).product;
    // Boosters : soumis aux rendements décroissants ; générateur : appliqué par-dessus
    shieldRes = mapKinds(RESISTANCES, (attr, k) => effectiveResistance(0, (1 - boosters[k]) * 100, g(attr)));
  }
  const shields = Math.max(0, shieldPoints);

  // --- Coque : blindage, renforts ---
  const armour = ship.armour * (1 + sum.hullbst / 100) + sum.hullrnf;
  const plating = at(ARMOUR);
  const plates = passThrough(inv.hullPlates);
  const armourRes = plating && mapKinds(RESISTANCES, (attr, k) => effectiveResistance(plating.value(attr), (1 - plates.product[k]) * 100, 0, (1 - plates.lowest[k]) * 100));

  // --- Distributeur : capacité (MJ) et recharge (MW) des trois condensateurs ---
  const distributor = distributorModule && {
    wep: { cap: distributorModule.value('wepcap'), chg: distributorModule.value('wepchg') },
    sys: { cap: distributorModule.value('syscap'), chg: distributorModule.value('syschg') },
    eng: { cap: distributorModule.value('engcap'), chg: distributorModule.value('engchg') },
  };

  // --- Armement ---
  const rows = inv.weapons.map(weaponLine);
  const list = rows.map((r) => r.line);
  const total = (pick) => list.reduce((acc, w) => acc + pick(w), 0);
  const sustained = total((w) => w.sdps);
  const byType = mapKinds(DAMAGE_SHARES, () => 0);
  for (const w of list) for (const k of Object.keys(byType)) byType[k] += w.sdps * w.damage[k];
  const wepDrain = total((w) => w.dist); // en rafale : fixe la durée du tir continu, pas la tenue du condensateur
  const wepTime = distributor ? capacitorTime(distributor.wep.cap, distributor.wep.chg, rows.map((r) => r.capacitor)) : null;
  // Tirage WEP en tir soutenu (rechargements compris) et soutenabilité : part du DPS soutenu que le distributeur peut
  // entretenir sans fin, pondérée par le DPS comme EDSY (les armes sans tirage WEP tirent toujours à plein)
  const wepDrainSustained = rows.reduce((acc, r) => acc + r.capacitor.sustained, 0);
  const dpsSansWep = rows.reduce((acc, r) => acc + (r.usesWep ? 0 : r.line.sdps), 0);
  const wepRatio = distributor && wepDrainSustained > 0 ? Math.min(1, Math.max(0, distributor.wep.chg / wepDrainSustained)) : 1;
  // Sans DPS soutenu (armes sans dégâts), la pondération est impossible : la part du tirage que la recharge couvre. Ainsi
  // la soutenabilité existe dès qu'il y a une arme et un distributeur, comme le voyant du tirage WEP soutenu
  const wepSustain = !distributor || !rows.length ? null
    : sustained > 0 ? (dpsSansWep + (sustained - dpsSansWep) * wepRatio) / sustained : wepRatio;
  // Autonomie des munitions : une fois le condensateur WEP vide (après wepTime), les armes qui tirent sur lui ne tirent
  // plus qu'à la part soutenable (EDSY, updateUIStatsWpn). Soutenabilité nulle (recharge WEP nulle) : elles cessent de
  // tirer au bout de wepTime (rayons compris) sans avoir vidé leurs munitions : ammoTime null et wepStall vrai
  // (« WEP vide » à l'écran)
  if (wepTime != null) {
    const pace = wepSustain ?? 1;
    for (const r of rows) {
      const t = r.line.ammoTime;
      if (!r.usesWep || (t != null && t <= wepTime)) continue;
      if (pace > 0) {
        if (t != null) r.line.ammoTime = wepTime + (t - wepTime) / pace;
      } else {
        r.line.ammoTime = null;
        r.line.wepStall = true;
      }
    }
  }
  const ammoTimes = list.map((w) => w.ammoTime).filter((t) => t != null);

  // --- Chaleur : générateur au tirage maximal (armes sorties), armes en tir soutenu ---
  const plant = at(POWER_PLANT);
  const plantHeat = plant ? plant.value('heateff') * Math.min(inv.drawDeployed, sum.pwrcap) : 0;
  const weaponHeat = rows.reduce((acc, r) => acc + r.sustainedHeat, 0);

  // --- Bouclier en détail : recharge, cellules ---
  const cells = inv.cellBanks.map(({ slot, m }) => ({
    slot,
    heal: (m.value('shieldrnfps') || 0) * (m.value('scbdur') || 0), // MJ par cellule
    spinup: m.value('spinup') || 0,
    ammo: (m.value('ammoclip') || 0) + (m.value('ammomax') || 0),
  }));
  const cellsTotal = cells.reduce((acc, c) => acc + c.heal * c.ammo, 0);
  let shield = null;
  if (gen) {
    // Pips SYS (0 à 4, demi-pips permis ; 2 par défaut, comme EDSY) : ils réduisent les dégâts subis par les boucliers
    // et règlent la recharge du condensateur SYS qui alimente la régénération. Formules d'EDSY (Commanders changelog
    // 2.3) : réduction = 60 % × (pips / 4)^0,85 ; recharge SYS disponible = syschg × (pips / 4)^1,1.
    const pips = sysPipsOf(opts.sysPips);
    const pipRes = 0.6 * (pips / MAX_PIPS) ** 0.85; // fraction des dégâts absorbée par les pips
    const sysMul = (pips / MAX_PIPS) ** 1.1;
    const regen = gen.value('genrate'); // MJ/s, bouclier actif
    const brokenRegen = gen.value('bgenrate'); // MJ/s, après effondrement
    const draw = gen.value('genpwr') || 0; // MJ du condensateur SYS par MJ de bouclier
    const half = shields * 0.5;
    const sysCap = distributor?.sys.cap ?? 0;
    const sysChg = (distributor?.sys.chg ?? 0) * sysMul;
    // Le distributeur bride la régénération : pas plus vite que ce que le condensateur SYS peut fournir
    const bridee = (rate) => (draw > 0 && distributor ? Math.min(rate, sysChg / draw) : rate);
    // Retour à 50 % : d'abord à pleine vitesse tant que le condensateur plein tient, puis au rythme qu'il permet
    // (+ 16 s d'attente, EDSY) ; calculable aussi à 0 pip SYS
    const rebuild = tempsReconstruction({ half, brokenRegen, draw, sysCap, sysChg, distributor: Boolean(distributor) });
    const regenEff = bridee(regen);
    const fromHalf = regenEff > 0 ? half / regenEff : null;
    const surPips = (v) => v / (1 - pipRes);
    const avecPips = (eff, brut) => (eff ? { abs: surPips(brut), ...mapKinds(eff, (v) => surPips(v)) } : null);
    shield = {
      base: ship.shields,
      boosters: inv.shieldBoosters.length,
      pips,
      pipResistance: pipRes,
      effective: avecPips(effectiveAgainst(shields, shieldRes), shields),
      regen,
      regenEffective: regenEff, // MJ/s, bridée par le distributeur
      brokenRegen,
      rebuild, // s pour revenir à 50 % après effondrement
      full: rebuild != null && fromHalf != null ? rebuild + fromHalf : null, // s de 0 à 100 %
      fromHalf, // s de 50 à 100 %
      cells,
      cellsTotal,
      withCells: shields + cellsTotal,
      withCellsEffective: avecPips(effectiveAgainst(shields + cellsTotal, shieldRes), shields + cellsTotal),
    };
  }

  return {
    ship: ship.name,
    mass: { hull: ship.mass, unladen: dryMass + fuel, laden: dryMass + fuel + sum.cargocap, dry: dryMass },
    fuel,
    cargo: sum.cargocap,
    cabins: inv.cabins,
    jump: {
      max: leap(dryMass, fuelPerJump), // juste le carburant d'un saut
      unladen: leap(dryMass, fuel), // plein fait, soute vide
      laden: leap(dryMass + cargo, fuel), // plein fait, cargaison à bord
      range: rangeOnFullTank(fsd, dryMass, fuel, sum.jumpbst),
      fuelPerJump,
    },
    power: { capacity: sum.pwrcap, deployed: inv.drawDeployed, retracted: inv.drawRetracted },
    shields,
    shieldRes,
    shield,
    armour,
    armourRes,
    hull: {
      base: ship.armour,
      effective: effectiveAgainst(armour, armourRes),
      moduleProtection: inv.moduleGuards.map((m) => m.value('dmgprot') || 0), // % absorbé par chaque renfort
      // Renforts cumulés, comme EDSY : chacun absorbe sa part de ce que les autres laissent passer
      moduleProtectionTotal: 100 * (1 - inv.moduleGuards.reduce((acc, m) => acc * (1 - (m.value('dmgprot') || 0) / 100), 1)),
      moduleIntegrity: inv.moduleGuards.reduce((acc, m) => acc + (m.value('integ') || 0), 0), // points de tous les renforts
    },
    dps: sustained,
    armament: {
      sustained,
      burst: total((w) => w.bdps),
      byType,
      wepDrain, // MW, toutes armes en rafale
      wepDrainSustained, // MW, toutes armes en tir soutenu
      wepSustain, // 0 à 1 : part du DPS soutenu entretenue sans fin par le distributeur (null : pas de distributeur ou d'arme)
      wepStall: list.some((w) => w.wepStall), // une arme au moins cesse de tirer une fois le condensateur WEP vide
      wepTime, // s avant de vider le condensateur WEP (null : la recharge suffit)
      ammoTime: ammoTimes.length ? Math.min(...ammoTimes) : null, // s : la plus courte autonomie (null : aucune ne s'épuise)
      heat: total((w) => w.heat),
      list,
    },
    distributor,
    speed,
    boost,
    boosts: distributor && ship.boostcost ? Math.floor(distributor.eng.cap / ship.boostcost) : 0, // d'affilée, condensateur plein
    rotation,
    heat: { capacity: ship.heatcap, powerPlant: plantHeat, weapons: weaponHeat },
    cost: { hull: ship.cost || 0, total: inv.cost, rebuy: inv.cost * 0.05 },
  };
}
