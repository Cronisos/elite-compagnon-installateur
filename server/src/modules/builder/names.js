// Noms français des modules du constructeur, tirés des noms EDSY : un seul dictionnaire, pour que toutes les listes
// parlent la même langue (« Soute » partout, plus de « Expanded Capacity Cargo Rack » à côté). La recherche Inara
// garde les noms officiels anglais (inara.js).

const NAMES = {
  // Blindages
  'Lightweight Alloy': 'Alliage léger',
  'Reinforced Alloy': 'Alliage renforcé',
  'Military Grade Composite': 'Composite militaire',
  'Mirrored Surface Composite': 'Composite réfléchissant',
  'Reactive Surface Composite': 'Composite réactif',
  'Mk II Ablative Lightweight Alloy': 'Alliage léger ablatif Mk II',
  'Mk II Ablative Reinforced Alloy': 'Alliage renforcé ablatif Mk II',
  'Mk II Ablative Military Grade Composite': 'Composite militaire ablatif Mk II',
  'Mk II Ablative Mirrored Surface Composite': 'Composite réfléchissant ablatif Mk II',
  'Mk II Ablative Reactive Surface Composite': 'Composite réactif ablatif Mk II',
  // Modules de base
  'Power Plant': 'Générateur',
  'Guardian Hybrid Power Plant': 'Générateur hybride gardien',
  Thrusters: 'Propulseurs',
  'Enhanced Performance Thrusters': 'Propulseurs haute performance',
  'Mk II Agile Boost Thrusters': 'Propulseurs à boost agile Mk II',
  'Mk II Gravity Optimised Thrusters': 'Propulseurs optimisés gravité Mk II',
  'Frame Shift Drive': 'Réacteur FSD',
  'Frame Shift Drive (SCO)': 'Réacteur FSD (SCO)',
  'Mk II Supercharge Optimised FSD (SCO)': 'Réacteur FSD surcharge optimisée Mk II (SCO)',
  'Life Support': 'Support vital',
  'Power Distributor': 'Distributeur de puissance',
  'Guardian Hybrid Power Distributor': 'Distributeur hybride gardien',
  Sensors: 'Capteurs',
  'Fuel Tank': 'Réservoir',
  'Cargo Hatch': 'Écoutille de soute',
  // Armes
  Cannon: 'Canon',
  'Concord Cannon': 'Canon Concord',
  'Beam Laser': 'Laser à faisceau',
  'Retributor Beam Laser': 'Laser à faisceau Retributor',
  'Burst Laser': 'Laser à rafales',
  'Cytoscrambler Burst Laser': 'Laser à rafales Cytoscrambler',
  'Pulse Laser': 'Laser à impulsion',
  'Pulse Disruptor Laser': 'Laser à impulsion disrupteur',
  'Multi-cannon': 'Multicanon',
  'Advanced Multi-cannon': 'Multicanon avancé',
  'Enforcer Cannon': 'Multicanon Enforcer',
  'AX Multi-Cannon': 'Multicanon AX',
  'Enhanced AX Multi-Cannon': 'Multicanon AX amélioré',
  'Fragment Cannon': 'Canon à fragmentation',
  'Pacifier Frag-Cannon': 'Canon à fragmentation Pacifier',
  'Missile Rack': 'Lance-missiles',
  'Advanced Missile Rack': 'Lance-missiles avancé',
  'Seeker Missile Rack': 'Lance-missiles à tête chercheuse',
  'Pack-Hound Missile Rack': 'Lance-missiles Pack-Hound',
  'Enzyme Missile Rack': 'Lance-missiles à enzymes',
  'AX Missile Rack': 'Lance-missiles AX',
  'Enhanced AX Missile Rack': 'Lance-missiles AX amélioré',
  'Rocket Propelled FSD Disrupter': 'Perturbateur FSD à propulsion',
  'Torpedo Pylon': 'Lance-torpilles',
  'Guardian Nanite Torpedo Pylon': 'Lance-torpilles à nanites gardien',
  'Mine Launcher': 'Lance-mines',
  'Shock Mine Launcher': 'Lance-mines à choc',
  'Rail Gun': 'Canon électrique',
  'Imperial Hammer Rail Gun': 'Canon électrique Imperial Hammer',
  'Plasma Accelerator': 'Accélérateur à plasma',
  'Advanced Plasma Accelerator': 'Accélérateur à plasma avancé',
  'Mk II Plasma Shock Accelerator': 'Accélérateur à plasma de choc Mk II',
  'Shock Cannon': 'Canon à choc',
  'Guardian Gauss Cannon': 'Canon Gauss gardien',
  'Guardian Plasma Charger': 'Chargeur à plasma gardien',
  'Guardian Shard Cannon': 'Canon à éclats gardien',
  'Remote Release Flak Launcher': 'Lance-flak à détonation',
  'Remote Release Flechette Launcher': 'Lance-fléchettes à détonation',
  // Minage
  'Mining Laser': 'Laser de minage',
  'Mining Lance Beam Laser': 'Laser de minage Mining Lance',
  'Mining Volley Repeater': 'Répéteur de minage Volley',
  'Abrasion Blaster': 'Désintégrateur abrasif',
  'Seismic Charge Launcher': 'Lance-charges sismiques',
  'Sub-surface Displacement Missile': 'Missile de déplacement sous-surface',
  'Sub-surface Extraction Missile': "Missile d'extraction sous-surface",
  // Utilitaires
  'Shield Booster': 'Booster de boucliers',
  'Point Defence': 'Défense ponctuelle',
  'Chaff Launcher': 'Lance-paillettes',
  'Heat Sink Launcher': 'Lance-dissipateurs thermiques',
  'Caustic Sink Launcher': 'Lance-dissipateurs caustiques',
  'Electronic Countermeasure': 'Contre-mesures électroniques',
  'Manifest Scanner': 'Scanner de cargaison',
  'Kill Warrant Scanner': 'Scanner de mandats',
  'Frame Shift Wake Scanner': 'Scanner de sillage FSD',
  'Pulse Wave Analyser': 'Analyseur à onde pulsée',
  'Xeno Scanner': 'Scanner xéno',
  'Enhanced Xeno Scanner': 'Scanner xéno amélioré',
  'Pulse Wave Xeno Scanner': 'Scanner xéno à onde pulsée',
  'Shutdown Field Neutraliser': "Neutraliseur de champ d'arrêt",
  'Thargoid Pulse Neutraliser': "Neutraliseur d'impulsion thargoïde",
  // Internes
  'Cargo Rack': 'Soute',
  'Anti-Corrosion Cargo Rack': 'Soute anticorrosion',
  'Mk II Cargo Rack': 'Soute Mk II',
  'Shield Generator': 'Générateur de boucliers',
  'Bi-Weave Shield Generator': 'Générateur de boucliers bi-tissés',
  'Prismatic Shield Generator': 'Générateur de boucliers prismatiques',
  'Shield Cell Bank': 'Banque de cellules de bouclier',
  'Hull Reinforcement Package': 'Renfort de coque',
  'Guardian Hull Reinforcement Package': 'Renfort de coque gardien',
  'Meta Alloy Hull Reinforcement Package': 'Renfort de coque en méta-alliage',
  'Module Reinforcement Package': 'Renfort de modules',
  'Guardian Module Reinforcement Package': 'Renfort de modules gardien',
  'Guardian Shield Reinforcement Package': 'Renfort de boucliers gardien',
  'Fuel Scoop': 'Collecteur de carburant',
  'Auto Field-Maintenance Unit': 'Maintenance automatique',
  Refinery: 'Raffinerie',
  'Frame Shift Drive Interdictor': 'Intercepteur FSD',
  'Guardian Frame Shift Drive Booster': 'Booster FSD gardien',
  'Detailed Surface Scanner': 'Scanner de surface détaillé',
  'Standard Docking Computer': "Ordinateur d'appontage",
  'Advanced Docking Computer': "Ordinateur d'appontage avancé",
  'Supercruise Assist': 'Assistance de supercroisière',
  'Experimental Weapon Stabiliser': "Stabilisateur d'armes expérimentales",
  'Economy Class Passenger Cabin': 'Cabine passagers économique',
  'Business Class Passenger Cabin': 'Cabine passagers affaires',
  'First Class Passenger Cabin': 'Cabine passagers première classe',
  'Luxury Class Passenger Cabin': 'Cabine passagers luxe',
  'Mk II Economy Class Passenger Cabin': 'Cabine passagers économique Mk II',
  'Mk II Business Class Passenger Cabin': 'Cabine passagers affaires Mk II',
  'Planetary Vehicle Hangar': 'Hangar de véhicule planétaire',
  'Large Planetary Vehicle Hangar': 'Grand hangar de véhicule planétaire',
  'Mk II Large Planetary Vehicle Hangar': 'Grand hangar de véhicule planétaire Mk II',
  'Vessel Hangar': 'Hangar à chasseurs',
  'Mk II Vessel Hangar': 'Hangar à chasseurs Mk II',
  // Contrôleurs de drones
  'Collector Limpet Controller': 'Contrôleur de drones de collecte',
  'Prospector Limpet Controller': 'Contrôleur de drones de prospection',
  'Fuel Transfer Limpet Controller': 'Contrôleur de drones de ravitaillement',
  'Hatch Breaker Limpet Controller': 'Contrôleur de drones perce-soute',
  'Limpet Control': 'Contrôleur de drones',
  'Repair Limpet Controller': 'Contrôleur de drones de réparation',
  'Decontamination Limpet Controller': 'Contrôleur de drones de décontamination',
  'Recon Limpet Controller': 'Contrôleur de drones de reconnaissance',
  'Research Limpet Controller': 'Contrôleur de drones de recherche',
  'Mining Multi-Limpet Controller': 'Contrôleur multi-drones de minage',
  'Mk II Mining Multi-Limpet Controller': 'Contrôleur multi-drones de minage Mk II',
  'Operations Limpet Controller': "Contrôleur multi-drones d'opérations",
  'Rescue Limpet Controller': 'Contrôleur multi-drones de sauvetage',
  'Universal Multi-Limpet Controller': 'Contrôleur multi-drones universel',
  'Xeno Limpet Controller': 'Contrôleur multi-drones xéno',
};

const MOUNTS = { F: 'fixe', G: 'cardan', T: 'tourelle' };
const int = (n) => Math.round(n).toLocaleString('fr-FR');

/** Nom français d'un module EDSY, sans classe ni note (anglais s'il manque au dictionnaire). */
export function frenchName(m) {
  const name = String(m.name || '').replace(/\s*\(Cap: \d+\)/, '');
  return NAMES[name] || name;
}

/**
 * Libellé d'un module dans le constructeur : « 6E Soute (64 t) », « 3C Multicanon (cardan) », « 5A Réacteur FSD ».
 * Le blindage n'a ni classe ni note.
 */
export function moduleLabel(m) {
  const name = frenchName(m);
  if (m.mtype === 'cbh') return name;
  const extra = [
    m.mount && MOUNTS[m.mount],
    m.cargocap && `${int(m.cargocap)} t`,
    m.mtype === 'cft' && m.fuelcap && `${int(m.fuelcap)} t`,
    m.cabincap && `${int(m.cabincap)} places`,
  ].filter(Boolean);
  return `${m.class ?? ''}${m.rating ?? ''} ${name}${extra.length ? ` (${extra.join(', ')})` : ''}`.trim();
}

const dec = (n, d = 1) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: d });

/** Caractéristique principale d'un module, affichée sous sa case dans le sélecteur (comme les colonnes d'EDSY). */
export function moduleInfo(m) {
  switch (m.mtype) {
    case 'icr': return m.cargocap && `${int(m.cargocap)} t`;
    case 'cft': return m.fuelcap && `${int(m.fuelcap)} t`;
    case 'ipc': return m.cabincap && `${int(m.cabincap)} pl.`;
    case 'cpp': return m.pwrcap && `${dec(m.pwrcap)} MW`;
    case 'cfsd':
    case 'cfsdo': return m.fsdoptmass && `${int(m.fsdoptmass)} t`;
    case 'ct': return m.engoptmass && `${int(m.engoptmass)} t`;
    case 'cpd': return m.wepcap && `${int(m.wepcap)} MJ`;
    case 'isg': return m.genoptmass && `${int(m.genoptmass)} t`;
    case 'usb': return m.shieldbst && `+${dec(m.shieldbst)} %`;
    case 'ihrp':
    case 'imahrp': return m.hullrnf && `+${int(m.hullrnf)}`;
    case 'isrp': return m.shieldrnf && `+${int(m.shieldrnf)} MJ`;
    case 'iscb': return m.shieldrnfps && m.scbdur && `${int(m.shieldrnfps * m.scbdur)} MJ`;
    case 'imrp': return m.dmgprot && `${int(m.dmgprot)} %`;
    case 'ifs': return m.scooprate && `${dec(m.scooprate, 3)} t/s`;
    default: return m.dps ? `${dec(m.dps)} DPS` : null;
  }
}

/** Noms EDSY absents du dictionnaire (contrôle des tests). */
export const untranslated = (names) => names.filter((n) => !NAMES[String(n).replace(/\s*\(Cap: \d+\)/, '')]);
