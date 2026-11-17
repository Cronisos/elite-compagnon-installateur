// Caractéristiques du vaisseau utiles à plusieurs modules (portée chargée, plateforme).
// Partagé par le cœur : les modules ne s'importent pas entre eux.

/** Taille max d'un FSD de classe A (t de carburant par saut), à défaut de valeur dans le Loadout. */
const MAX_FUEL_A = { 2: 0.9, 3: 1.8, 4: 3.0, 5: 5.0, 6: 8.0, 7: 12.8, 8: 20.0 };

/**
 * Portée chargée (al) = masse optimale × (carburant max ÷ fuelmul)^(1/fuelpower)
 *                       ÷ (masse à vide + carburant + cargaison).
 * Le numérateur se déduit de MaxJumpRange du Loadout, calculé par le jeu avec
 * masse à vide + carburant d'un saut : on évite ainsi les tables de chaque FSD.
 */
export function ladenRange(loadout, cargo, fuel) {
  if (!loadout?.maxJumpRange || !loadout.unladenMass) return null;
  const fsd = loadout.fsd || {};
  let mf = fsd.maxFuelPerJump;
  if (!mf) {
    mf = MAX_FUEL_A[fsd.size] ?? 8;
    if (fsd.overcharge) mf *= 1.023; // FSD SCO : un peu plus de carburant par saut
    if (fsd.cls && fsd.cls < 5) mf *= 0.8;
  }
  const k = loadout.maxJumpRange * (loadout.unladenMass + mf);
  const f = fuel ?? loadout.fuelCapacity ?? 0;
  return k / (loadout.unladenMass + f + (cargo || 0));
}

// Taille de plateforme nécessaire, par nom de vaisseau du journal (Loadout.Ship, en minuscules).
// Source : tailles d'atterrissage officielles (fiches vaisseaux du jeu).
const LARGE = new Set([
  'anaconda', 'cutter', 'federation_corvette', 'type9', 'type9_military', 'belugaliner',
  'orca', 'panthermkii', 'type7', 'empire_trader', 'imperial_clipper', // Imperial Clipper : « empire_trader » dans le journal
]);
const SMALL = new Set([
  'sidewinder', 'eagle', 'empire_eagle', 'hauler', 'adder', 'viper', 'viper_mkiv', 'cobramkiii',
  'cobramkiv', 'cobramkv', 'dolphin', 'vulture', 'diamondback', 'diamondbackxl', 'empire_courier',
]); // Type-6, Keelback et les trois Alliance (typex…) demandent une plateforme moyenne

/** 'L', 'M' ou 'S' ; null si le vaisseau est inconnu. */
export function shipPad(ship) {
  const s = String(ship || '').toLowerCase();
  if (!s) return null;
  if (LARGE.has(s)) return 'L';
  if (SMALL.has(s)) return 'S';
  return 'M';
}

// Nom en clair de chaque modèle du journal (Loadout.Ship, en minuscules), tel que le jeu l'affiche. Secours seulement :
// le nom appris du journal (Ship_Localised, ShipType_Localised) passe avant ; sans lui (journal commencé en cours de
// session), « panthermkii » ou « lakonminer » s'affichaient tels quels.
const MODELES = {
  sidewinder: 'Sidewinder', eagle: 'Eagle', hauler: 'Hauler', adder: 'Adder', viper: 'Viper Mk III', cobramkiii: 'Cobra Mk III',
  type6: 'Type-6 Transporter', dolphin: 'Dolphin', type7: 'Type-7 Transporter', asp: 'Asp Explorer', vulture: 'Vulture',
  empire_trader: 'Imperial Clipper', federation_dropship: 'Federal Dropship', orca: 'Orca', type9: 'Type-9 Heavy', python: 'Python',
  belugaliner: 'Beluga Liner', ferdelance: 'Fer-de-Lance', anaconda: 'Anaconda', federation_corvette: 'Federal Corvette',
  cutter: 'Imperial Cutter', diamondback: 'Diamondback Scout', empire_courier: 'Imperial Courier', diamondbackxl: 'Diamondback Explorer',
  empire_eagle: 'Imperial Eagle', federation_dropship_mkii: 'Federal Assault Ship', federation_gunship: 'Federal Gunship',
  viper_mkiv: 'Viper Mk IV', cobramkiv: 'Cobra Mk IV', independant_trader: 'Keelback', asp_scout: 'Asp Scout',
  type9_military: 'Type-10 Defender', krait_mkii: 'Krait Mk II', typex: 'Alliance Chieftain', typex_2: 'Alliance Crusader',
  typex_3: 'Alliance Challenger', krait_light: 'Krait Phantom', mamba: 'Mamba', python_nx: 'Python Mk II', type8: 'Type-8 Transporter',
  mandalay: 'Mandalay', cobramkv: 'Cobra Mk V', corsair: 'Corsair', panthermkii: 'Panther Clipper Mk II', lakonminer: 'Type-11 Prospector',
  explorer_nx: 'Caspian Explorer', mediumtransport01: 'Lynx Highliner', smallcombat01_nx: 'Kestrel Mk II',
  anacondamkii: 'Anaconda Mk II',
};

/** Nom en clair d'un modèle du journal, ou null s'il est inconnu (vaisseau sorti depuis). */
export function nomModele(ship) {
  const s = String(ship || '').toLowerCase();
  return Object.hasOwn(MODELES, s) ? MODELES[s] : null;
}
