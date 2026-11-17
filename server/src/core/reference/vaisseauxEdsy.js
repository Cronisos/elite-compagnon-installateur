// Vaisseaux absents de coriolis-data (qui n'a pas bougé depuis avril 2026 : ni Lynx Highliner ni Anaconda Mk II),
// repris des tables d'EDSY (eddb.js, © taleden, CC BY-NC 4.0, voir eddbData.js) et mis à la forme d'une fiche coriolis,
// pour que le reste de l'app (emplacements, blindages, masse) les traite comme les autres. Seuls les vaisseaux que
// coriolis ne connaît pas sont ajoutés : pour les autres, coriolis reste la source.
//
// Forme vérifiée sur les vaisseaux connus des deux sources (vaisseauxEdsy.test.js) : mêmes emplacements standard, mêmes
// points d'emport, mêmes internes à trois détails près, propres à coriolis et reproduits ici : les compartiments
// militaires sont rangés parmi les internes, les emplacements réservés sont des objets, et un dernier emplacement de
// taille 1 porte la suite d'approche planétaire.

const lower = (x) => String(x || '').toLowerCase();

// Emplacements réservés d'EDSY (clés de ses types de modules) → restriction coriolis (nom, groupes admis)
const MILITAIRE = { name: 'Military', eligible: { mahr: 1, hr: 1, scb: 1, mrp: 1, gsrp: 1, gmrp: 1, ghrp: 1 } };
const SUITE = { class: 1, name: 'PlanetaryApproachSuite', eligible: { pas: 1 } };
const RESERVES = [
  { edsy: ['ipc'], name: 'Passenger', eligible: { pce: 1, pci: 1, pcm: 1, pcq: 1 } },
  { edsy: ['cft', 'icr'], name: 'Cargo', eligible: { cr: 1, crl: 1, ft: 1 } },
  { edsy: ['ifh', 'ipvh'], name: 'Fighter', eligible: { fh: 1 } },
];
const BLINDAGES = [
  ['_armour_grade1', 'Lightweight Alloy'], ['_armour_grade2', 'Reinforced Alloy'], ['_armour_grade3', 'Military Grade Composite'],
  ['_armour_mirrored', 'Mirrored Surface Composite'], ['_armour_reactive', 'Reactive Surface Composite'],
];

const tailles = (liste) => (Array.isArray(liste) ? liste.filter((n) => Number.isInteger(n) && n >= 0 && n <= 8) : []);

function restriction(reserve) {
  if (!reserve || typeof reserve !== 'object') return null;
  const cles = Object.keys(reserve).sort().join(',');
  return RESERVES.find((r) => [...r.edsy].sort().join(',') === cles) ?? null;
}

/** Internes à la façon de coriolis : réservés en objets, militaires rangés par taille, suite d'approche à la fin. */
export function internesCoriolis(ship) {
  const reserves = ship.reserved?.internal ?? [];
  const internes = tailles(ship.slots?.internal).map((taille, i) => {
    const r = restriction(reserves[i]);
    return r ? { class: taille, name: r.name, eligible: { ...r.eligible } } : taille;
  });
  const taille = (v) => (typeof v === 'object' ? v.class : v);
  for (const t of tailles(ship.slots?.military)) {
    // Après le dernier interne au moins aussi grand (comme l'Anaconda : 7, 6, 6, 6, 5, 5, 5, 5 militaire, 4…)
    let i = internes.length;
    while (i > 0 && taille(internes[i - 1]) < t) i -= 1;
    internes.splice(i, 0, { class: t, name: MILITAIRE.name, eligible: { ...MILITAIRE.eligible } });
  }
  internes.push({ ...SUITE, eligible: { ...SUITE.eligible } });
  return internes;
}

/** Fiche coriolis d'un vaisseau d'EDSY, ou null si la fiche d'EDSY est incomplète. */
export function ficheCoriolis(ship) {
  const composants = tailles(ship?.slots?.component);
  if (!ship?.fdname || !ship.name || composants.length !== 8 || !Number.isFinite(Number(ship.mass))) return null;
  const nombre = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
  const blindages = BLINDAGES.map(([fin, name]) => {
    const m = Object.values(ship.module ?? {}).find((x) => lower(x?.fdname) === `${lower(ship.fdname)}${fin}`);
    return { grp: 'bh', name, edID: nombre(m?.fdid), cost: nombre(m?.cost) ?? 0, mass: nombre(m?.mass) ?? 0 };
  });
  return {
    edID: nombre(ship.fdid),
    properties: {
      name: String(ship.name),
      class: nombre(ship.class),
      hullCost: nombre(ship.cost),
      speed: nombre(ship.topspd),
      boost: nombre(ship.bstspd),
      heatCapacity: nombre(ship.heatcap),
      minthrust: nombre(ship.minthrust),
      boostEnergy: nombre(ship.boostcost),
      boostInt: nombre(ship.boostint),
      baseShieldStrength: nombre(ship.shields),
      baseArmour: nombre(ship.armour),
      hardness: nombre(ship.hardness),
      hullMass: Number(ship.mass),
      masslock: nombre(ship.masslock),
      pitch: nombre(ship.pitch),
      roll: nombre(ship.roll),
      yaw: nombre(ship.yaw),
      crew: nombre(ship.crew),
      reserveFuelCapacity: nombre(ship.fuelreserve),
    },
    retailCost: nombre(ship.retail),
    bulkheads: blindages,
    slots: {
      standard: composants.slice(1), // le premier composant d'EDSY est le blindage
      hardpoints: [...tailles(ship.slots.hardpoint), ...tailles(ship.slots.utility)],
      internal: internesCoriolis(ship),
    },
    source: 'edsy',
  };
}

/**
 * Vaisseaux d'EDSY que coriolis ne connaît pas : { clé: fiche }. La clé est le nom du vaisseau dans le journal, en
 * minuscules (« mediumtransport01 »), comme le font déjà les vaisseaux récents de coriolis (« explorer_nx »).
 * @param {object|null} eddb tables d'EDSY (loadEddb), ou null si elles ne sont pas téléchargées
 * @param {object} connus vaisseaux de coriolis, par clé
 */
export function vaisseauxEdsy(eddb, connus) {
  const ajoutes = Object.create(null);
  if (!eddb?.ship || typeof eddb.ship !== 'object') return ajoutes;
  const ids = new Set(Object.values(connus).map((s) => String(s?.edID)));
  const noms = new Set(Object.values(connus).map((s) => lower(s?.properties?.name)));
  for (const ship of Object.values(eddb.ship)) {
    const cle = lower(ship?.fdname);
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(cle) || cle === 'constructor' || cle === 'prototype' || connus[cle] || ids.has(String(ship.fdid)) || noms.has(lower(ship.name))) continue;
    const fiche = ficheCoriolis(ship);
    if (fiche) ajoutes[cle] = fiche;
  }
  return ajoutes;
}
