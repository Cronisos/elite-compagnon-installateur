// Libellés français : groupes de modules, modifications, effets expérimentaux, éléments.
// Ce qui n'est pas traduit ici garde son nom anglais d'origine (coriolis-data).

export const GROUP_LABELS = {
  bh: 'Blindage', pp: 'Générateur', t: 'Propulseurs', fsd: 'Réacteur FSD', ls: 'Support vital',
  pd: 'Distributeur de puissance', s: 'Détecteurs', ft: 'Réservoir', sg: 'Générateur de boucliers',
  psg: 'Générateur de boucliers prismatiques', bsg: 'Générateur de boucliers bi-tissés', sb: 'Booster de boucliers',
  scb: 'Banque de cellules de bouclier', hr: 'Renfort de coque', mrp: 'Renfort de modules', fs: 'Collecteur de carburant',
  fi: 'Intercepteur FSD', cr: 'Soute', crl: 'Grande soute', ch: 'Lance-paillettes', ec: 'Contre-mesure électronique',
  hs: 'Lance-dissipateurs', pd_: 'Défense ponctuelle', po: 'Défense ponctuelle', kw: 'Scanner d\'avis de recherche',
  cs: 'Scanner de cargaison', ws: 'Scanner de sillage', pl: 'Laser à impulsion', ul: 'Laser à rafale', bl: 'Laser à faisceau',
  mc: 'Multicanon', c: 'Canon', fc: 'Canon à fragmentation', rg: 'Canon électrique', pa: 'Accélérateur plasma',
  mr: 'Lance-missiles', tp: 'Lance-torpilles', nl: 'Lance-mines', ml: 'Laser minier', am: 'Maintenance automatique',
  rf: 'Raffinerie', dc: 'Ordinateur d\'appontage', sc: 'Scanner de surface', pv: 'Hangar SRV', fh: 'Hangar à chasseurs',
};

export const BLUEPRINT_LABELS = {
  'Increased range': 'Portée augmentée', 'Faster boot sequence': 'Démarrage rapide', Shielded: 'Blindé',
  'Dirty drives': 'Propulseurs bricolés', 'Clean drives': 'Propulseurs propres', 'Drive strengthening': 'Propulseurs renforcés',
  Overcharged: 'Surchargé', Armoured: 'Blindé', 'Low emissions': 'Faibles émissions', 'Charge enhanced': 'Charge améliorée',
  'Engine focused': 'Axé propulseurs', 'Weapon focused': 'Axé armement', 'System focused': 'Axé systèmes',
  'High charge capacity': 'Capacité de charge élevée', Lightweight: 'Allégé', Reinforced: 'Renforcé', 'Heavy duty': 'Robuste',
  'Thermal resistant': 'Résistance thermique', 'Kinetic resistant': 'Résistance cinétique', 'Blast resistant': 'Résistance explosive',
  'Resistance augmented': 'Résistance augmentée', 'Enhanced low power': 'Basse consommation améliorée',
  'Expanded radius': 'Rayon étendu', 'Long range': 'Longue portée', 'Wide angle': 'Grand angle', Efficient: 'Efficace',
  Focused: 'Focalisé', 'Short range': 'Courte portée', Sturdy: 'Robuste', 'High capacity': 'Grande capacité',
  'Double shot': 'Double tir', 'Rapid fire': 'Tir rapide', 'Fast scan': 'Analyse rapide', 'Ammo capacity': 'Capacité de munitions',
  'Light weight mount': 'Support allégé', 'Rapid charge': 'Charge rapide', 'Specialised': 'Spécialisé',
  'Kinetic Resistant': 'Résistance cinétique', 'Thermal Resistant': 'Résistance thermique', 'Blast Resistant': 'Résistance explosive',
  'Lightweight armour': 'Blindage allégé', 'Heavy duty armour': 'Blindage robuste', 'Advanced plating': 'Blindage avancé',
};

Object.assign(BLUEPRINT_LABELS, {
  Clean: 'Propulseurs propres', Dirty: 'Propulseurs bricolés', 'Expanded Capacity': 'Capacité étendue',
  'Expanded Probe Scanning Radius': 'Rayon de sondage étendu', 'Expanded capture arc': 'Arc de capture étendu',
});

/**
 * Effets expérimentaux, par nom anglais (le même nom sert à plusieurs modules).
 * Les noms français écrits par le jeu dans le journal sont prioritaires (voir refdata).
 */
export const SPECIAL_NAME_LABELS = {
  'Double Braced': 'Double renfort', 'Stripped Down': 'Allégé', 'Thermal Spread': 'Dispersion thermique',
  'Flow Control': 'Contrôle du flux', 'Mass Manager': 'Gestionnaire de masse', 'Deep Charge': 'Charge profonde',
  'Drive Distributors': 'Distributeurs de propulsion', 'Drag Drives': 'Propulseurs de traînée', Monstered: 'Monstrueux',
  'Cluster Capacitors': 'Condensateurs en grappe', 'Super Conduits': 'Super conduits', 'Recycling Cell': 'Cellule de recyclage',
  'Boss Cells': 'Cellules boss', Oversized: 'Surdimensionné', 'Multi-servos': 'Multi-servos',
  'Reflective Plating': 'Blindage réfléchissant', 'Angled Plating': 'Blindage incliné', 'Layered Plating': 'Blindage stratifié',
  'Deep Plating': 'Blindage profond', 'Thermo Block': 'Bloc thermique', 'Force Block': 'Bloc de force',
  'Blast Block': 'Bloc anti-explosion', 'Super Capacitors': 'Super condensateurs', 'Fast Charge': 'Charge rapide',
  'Multi-weave': 'Multi-tissage', 'Hi-Cap': 'Haute capacité', 'Lo-draw': 'Faible consommation',
  'Auto loader': 'Chargeur automatique', 'Phasing sequence': 'Séquence de phase', 'Incendiary rounds': 'Munitions incendiaires',
  'Thermal shock': 'Choc thermique', 'Thermal conduit': 'Conduit thermique', 'Thermal vent': 'Évent thermique',
  'Thermal cascade': 'Cascade thermique', 'Emissive munitions': 'Munitions émissives', 'Corrosive shell': 'Obus corrosif',
  'High yield shell': 'Obus à haut rendement', 'Smart rounds': 'Munitions intelligentes', 'Scramble spectrum': 'Spectre brouillé',
  'Concordant sequence': 'Séquence concordante', 'Regeneration sequence': 'Séquence de régénération',
  'Inertial impact': 'Impact inertiel', 'Drag munitions': 'Munitions de traînée', 'Dispersal field': 'Champ de dispersion',
  'Force shell': 'Obus de force', 'Screening shell': "Obus d'écran", 'FSD interrupt': 'Interruption FSD',
  'Ion disruptor': 'Perturbateur ionique', 'Overload munitions': 'Munitions de surcharge', 'Penetrator payload': 'Charge pénétrante',
  'Target lock breaker': 'Brise-verrouillage', 'Mass lock munition': 'Munition de blocage de masse',
};

export const SPECIAL_LABELS = {};

export const RAW_LABELS = {
  iron: 'Fer', nickel: 'Nickel', sulphur: 'Soufre', carbon: 'Carbone', phosphorus: 'Phosphore', chromium: 'Chrome',
  manganese: 'Manganèse', zinc: 'Zinc', germanium: 'Germanium', vanadium: 'Vanadium', arsenic: 'Arsenic',
  niobium: 'Niobium', tungsten: 'Tungstène', selenium: 'Sélénium', zirconium: 'Zirconium', boron: 'Bore',
  mercury: 'Mercure', molybdenum: 'Molybdène', cadmium: 'Cadmium', tin: 'Étain', polonium: 'Polonium',
  ruthenium: 'Ruthénium', technetium: 'Technétium', tellurium: 'Tellure', yttrium: 'Yttrium', antimony: 'Antimoine',
  lead: 'Plomb', rhenium: 'Rhénium',
};

export const TYPE_LABELS = { Raw: 'Matière première', Manufactured: 'Manufacturé', Encoded: 'Données' };

export const STANDARD_SLOTS = [
  { key: 'std-pp', journal: 'PowerPlant', grp: 'pp', label: 'Générateur' },
  { key: 'std-t', journal: 'MainEngines', grp: 't', label: 'Propulseurs' },
  { key: 'std-fsd', journal: 'FrameShiftDrive', grp: 'fsd', label: 'Réacteur FSD' },
  { key: 'std-ls', journal: 'LifeSupport', grp: 'ls', label: 'Support vital' },
  { key: 'std-pd', journal: 'PowerDistributor', grp: 'pd', label: 'Distributeur de puissance' },
  { key: 'std-s', journal: 'Radar', grp: 's', label: 'Détecteurs' },
  { key: 'std-ft', journal: 'FuelTank', grp: 'ft', label: 'Réservoir' },
];

export const HARDPOINT_SIZES = { 4: 'Huge', 3: 'Large', 2: 'Medium', 1: 'Small', 0: 'Tiny' };
export const HARDPOINT_LABELS = { 4: 'Énorme', 3: 'Grand', 2: 'Moyen', 1: 'Petit', 0: 'Utilitaire' };

/** Modification « la plus courante » par groupe, pour le raccourci « tout en G5 ». */
export const DEFAULT_BLUEPRINTS = {
  bh: 'Armour_HeavyDuty', pp: 'PowerPlant_Boosted', t: 'Engine_Dirty', fsd: 'FSD_LongRange',
  ls: 'LifeSupport_LightWeight', pd: 'PowerDistributor_HighFrequency', s: 'Sensor_LongRange', sg: 'ShieldGenerator_Reinforced',
  sb: 'ShieldBooster_HeavyDuty', hr: 'HullReinforcement_HeavyDuty', scb: 'ShieldCellBank_Rapid', fi: 'FSDinterdictor_LongRange',
  mc: 'MC_Overcharged', c: 'Weapon_Overcharged', pl: 'Weapon_Efficient', bl: 'Weapon_Efficient', ul: 'Weapon_Focused',
  rg: 'Weapon_ShortRange', pa: 'Weapon_Focused', fc: 'Weapon_DoubleShot', mr: 'Weapon_HighCapacity',
};
