// Méthodes d'obtention des matériaux : courtes, par type, catégorie et grade.
// Le lieu précis n'est pas donné, seulement la manière de les obtenir.

const SPECIFIC = {
  // Manufacturés de grade 5 liés à une faction ou à la guerre
  imperialshielding: "Sources d'émissions de haut niveau (HGE) dans les systèmes de l'Empire",
  coredynamicscomposites: 'HGE dans les systèmes de la Fédération',
  protolightalloys: 'HGE dans les systèmes de la Fédération',
  protoradiolicalloys: 'HGE dans les systèmes de la Fédération',
  protoheatradiators: 'HGE dans les systèmes de la Fédération',
  militarygradealloys: 'HGE dans les systèmes en guerre ou en guerre civile',
  militarysupercapacitors: 'HGE dans les systèmes en guerre ou en guerre civile',
  pharmaceuticalisolators: 'HGE dans les systèmes en épidémie',
  improvisedcomponents: 'HGE dans les systèmes en guerre civile',
  // Données de grade 5
  dataminedwake: 'Sources d\'émissions chiffrées et récompenses de missions ; rare au scan de sillages',
  adaptiveencryptors: 'Sources d\'émissions chiffrées (grade élevé), récompenses de missions',
  classifiedscandata: 'Points de données de sites planétaires et colonies',
  compactemissionsdata: 'Scan de vaisseaux et sources d\'émissions chiffrées',
  embeddedfirmware: 'Points de données de sites planétaires',
  shieldfrequencydata: 'Scan de vaisseaux de grand gabarit (boucliers)',
};

const MANUFACTURED_LOW = 'Récupération sur épaves et vaisseaux détruits, sources de signaux, sites planétaires';
const MANUFACTURED_HIGH = "Sources d'émissions de haut niveau (HGE) dans les systèmes en état particulier";

const ENCODED_BY_CATEGORY = {
  'Wake Scans': 'Scan des sillages de vaisseaux (scanner de sillage FSD) près des grandes stations',
  'Emission Data': "Scan de vaisseaux et de balises de navigation, sources d'émissions chiffrées",
  'Shield Data': 'Scan de vaisseaux (boucliers actifs), sources d\'émissions chiffrées',
  'Encryption Files': "Scan de vaisseaux, sources d'émissions chiffrées",
  'Data Archives': 'Points de données de sites planétaires, colonies et stations',
  'Encoded Firmware': 'Points de données de sites planétaires',
};

/** Courte méthode d'obtention d'un matériau. */
export function obtainMethod(key, info) {
  if (SPECIFIC[key]) return SPECIFIC[key];
  if (!info) return 'Méthode inconnue : consulte Inara';
  const { type, category, grade } = info;
  if (/guardian/i.test(category) || /guardian/i.test(info.name)) return 'Sites gardiens (ruines et structures)';
  if (/thargoid/i.test(category) || /thargoid/i.test(info.name)) return 'Débris et sites thargoïdes, zones de conflit AX';
  if (type === 'Raw') {
    return grade >= 4
      ? 'Collecte en surface (SRV) : sites géologiques et cristaux ; récompenses de missions'
      : 'Collecte en surface (SRV) sur affleurements et sites géologiques ; minage';
  }
  if (type === 'Manufactured') return grade >= 4 ? MANUFACTURED_HIGH : MANUFACTURED_LOW;
  if (type === 'Encoded') return ENCODED_BY_CATEGORY[category] || "Scan de vaisseaux et sources d'émissions chiffrées";
  return 'Méthode inconnue : consulte Inara';
}

/** Stock maximum par grade (limites du jeu). */
export const MAX_BY_GRADE = { 1: 300, 2: 250, 3: 200, 4: 150, 5: 100 };
