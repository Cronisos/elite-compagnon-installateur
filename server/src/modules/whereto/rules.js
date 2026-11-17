// Règles du jeu utilisées par « Où agir cette semaine », regroupées ici avec leur source, leur date et leur statut :
//   « mesurée »   : vérifiée sur les journaux de référence ;
//   « publiée »   : annoncée par Frontier ou reprise par les guides des joueurs, pas encore mesurée ici ;
//   « à vérifier » : supposée, à confirmer en jeu.
// La table RULES en bas du fichier les liste pour la future « vigie des règles », qui les comparera à ce que le jeu
// fait réellement.
//
// Ce fichier ne contient que du calcul pur : aucun accès réseau ni disque.

// Valeurs, sources et statuts : dépôt des règles, server/src/regles/powerplay.js (voir regles/LISEZMOI.md).
import {
  ACQUISITION_REACH_FORTIFIED_LY, ACQUISITION_REACH_STRONGHOLD_LY, ACQUISITION_POINTS, WEEK_TICK_DAY_UTC, WEEK_TICK_HOUR_UTC,
  CONFLICT_ZONE_STATES, CONFLICT_ZONE_WAR_TYPES, UNDERMINING_NEEDS_REACH, STATES, POWERS, FICHES, weekStart,
} from '../../regles/powerplay.js';
import { tableModule } from '../../regles/fiche.js';

export {
  ACQUISITION_REACH_FORTIFIED_LY, ACQUISITION_REACH_STRONGHOLD_LY, ACQUISITION_POINTS, WEEK_TICK_DAY_UTC, WEEK_TICK_HOUR_UTC,
  CONFLICT_ZONE_STATES, CONFLICT_ZONE_WAR_TYPES, UNDERMINING_NEEDS_REACH, STATES, POWERS, weekStart,
};

export const HELD_STATES = ['Exploited', 'Fortified', 'Stronghold'];
export const STATE_LABELS = { Unoccupied: 'Inoccupé', Exploited: 'Exploité', Fortified: 'Consolidé', Stronghold: 'Forteresse' };

/** Portée de prise d'un système tenu, selon son état (0 : un Exploité ne permet aucune prise). */
export function reachOf(state) {
  if (state === 'Stronghold') return ACQUISITION_REACH_STRONGHOLD_LY;
  if (state === 'Fortified') return ACQUISITION_REACH_FORTIFIED_LY;
  return 0;
}
/** Portée la plus grande : sert à chercher les systèmes d'appui autour de la zone de recherche. */
export const MAX_REACH_LY = Math.max(ACQUISITION_REACH_FORTIFIED_LY, ACQUISITION_REACH_STRONGHOLD_LY);

// --- Activités et tâches ---

/**
 * Lien entre le système et la puissance du joueur :
 *   acquisition : Inoccupé, à prendre (règle de portée) ;
 *   own         : tenu par sa puissance (renforcement) ;
 *   enemy       : tenu par une autre puissance (sape) ;
 *   any         : peu importe.
 */
export const RELATIONS = ['acquisition', 'own', 'enemy', 'any'];

/** Groupes de types de station de Spansh, pour les tâches qui en exigent un. Données Spansh relevées le 7 nov. 2026. */
export const STATION_GROUPS = {
  starport: { label: 'Grand port', types: ['Coriolis Starport', 'Orbis Starport', 'Ocellus Starport', 'Dodec Starport', 'Asteroid base'] },
  outpost: { label: 'Avant-poste', types: ['Outpost'] },
  planetary: { label: 'Port planétaire', types: ['Planetary Port', 'Planetary Outpost'] },
  settlement: { label: 'Colonie Odyssey', types: ['Settlement'] },
  megaship: { label: 'Mégavaisseau', types: ['Mega ship'] },
  carrier: { label: 'Porte-vaisseaux', types: ['Drake-Class Carrier'] },
};

/** Activités toujours proposées. Les tâches de la semaine, saisies par le joueur, s'y ajoutent. */
export const ACTIVITIES = {
  acquisition: { id: 'acquisition', name: 'Prise (acquisition)', relation: 'acquisition', states: ['Unoccupied'] },
  reinforcement: { id: 'reinforcement', name: 'Renforcement', relation: 'own', states: [...HELD_STATES] },
  undermining: { id: 'undermining', name: 'Sape', relation: 'enemy', states: [...HELD_STATES] },
};

const text = (v, max) => String(v ?? '').trim().slice(0, max);
const pick = (list, allowed) => [...new Set((Array.isArray(list) ? list : []).filter((x) => typeof x === 'string' && allowed.includes(x)))];

/** Tâche saisie par le joueur, nettoyée (champs inconnus ignorés). Null si elle est inutilisable. */
export function cleanTask(input) {
  const b = input && typeof input === 'object' ? input : {};
  const name = text(b.name, 120);
  const relation = RELATIONS.includes(b.relation) ? b.relation : null;
  if (!name || !relation) return null;
  let states = pick(b.states, STATES);
  if (relation === 'acquisition') states = ['Unoccupied'];
  else if (relation !== 'any') states = states.filter((s) => s !== 'Unoccupied');
  if (!states.length) states = relation === 'any' ? [...STATES] : relation === 'acquisition' ? ['Unoccupied'] : [...HELD_STATES];
  return {
    name,
    relation,
    states,
    stationGroups: pick(b.stationGroups, Object.keys(STATION_GROUPS)),
    largePad: b.largePad === true,
    powerContact: b.powerContact === true,
    conflictZone: b.conflictZone === true,
    enemy: relation === 'enemy' && POWERS.includes(b.enemy) ? b.enemy : null,
    note: text(b.note, 500),
  };
}

// --- Validité d'un système ---

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const hasPos = (s) => !!s && [s.x, s.y, s.z].every(Number.isFinite);

/**
 * Système d'appui le plus proche qui permet de prendre `system` : un Consolidé à 20 al au plus, ou une Forteresse
 * à 30 al au plus, de la puissance. Null si aucun.
 */
export function bestAnchor(system, anchors) {
  if (!hasPos(system)) return null;
  let best = null;
  for (const a of anchors) {
    if (!hasPos(a) || a.name === system.name) continue;
    const d = dist(system, a);
    const reach = reachOf(a.state);
    if (reach && d <= reach + 1e-9 && (!best || d < best.distance)) best = { name: a.name, state: a.state, distance: d, source: a.source, at: a.at ?? null };
  }
  return best;
}

/** Stations du système qui répondent à la tâche (toutes celles qui comptent si la tâche n'exige pas de type). */
export function matchingStations(stations, task) {
  const groups = task.stationGroups || [];
  const types = new Set(groups.flatMap((g) => STATION_GROUPS[g]?.types || []));
  return (stations || []).filter((s) => {
    if (types.size ? !types.has(s.type) : !s.type || s.type.includes('Construction') || s.type === 'Drake-Class Carrier') return false;
    if (task.largePad && !s.largePad) return false;
    if (task.powerContact && !s.powerContact) return false;
    return true;
  });
}

/** La tâche exige-t-elle quelque chose d'une station ? */
export const needsStation = (task) => !!(task.stationGroups?.length || task.largePad || task.powerContact);

/**
 * Le dernier relevé du journal (arrivée dans le système) confirme-t-il la tâche ?
 * Retourne { valid, reasons } ; valid vaut null quand le relevé ne suffit pas à trancher.
 */
export function checkReading(reading, task, power) {
  if (!reading) return { valid: null, reasons: ['jamais visité'] };
  const reasons = [];
  let valid = true;
  const state = reading.state || null;
  const label = STATE_LABELS[state] || state || 'sans état Powerplay';
  if (!state || !task.states.includes(state)) {
    valid = false;
    reasons.push(`état ${label}`);
  }
  if (task.relation === 'acquisition') {
    if (!power) {
      if (valid) valid = null; // un état faux suffit à trancher
      reasons.push('puissance inconnue');
    }
    else if (!(reading.powers || []).includes(power)) {
      valid = false;
      reasons.push(`${power} absente des puissances du système : hors de portée`);
    }
  } else if (task.relation === 'own') {
    if (!power) {
      if (valid) valid = null; // un état faux suffit à trancher
      reasons.push('puissance inconnue');
    }
    else if (reading.controllingPower !== power) {
      valid = false;
      reasons.push(reading.controllingPower ? `tenu par ${reading.controllingPower}` : 'tenu par personne');
    }
  } else if (task.relation === 'enemy') {
    if (!reading.controllingPower || reading.controllingPower === power) {
      valid = false;
      reasons.push(reading.controllingPower ? 'tenu par ta puissance' : 'tenu par personne');
    } else if (task.enemy && reading.controllingPower !== task.enemy) {
      valid = false;
      reasons.push(`tenu par ${reading.controllingPower}, pas ${task.enemy}`);
    }
  }
  if (task.conflictZone && !reading.warZones) {
    valid = false;
    reasons.push('aucune guerre en cours');
  }
  if (valid && !reasons.length) {
    const who = task.relation === 'acquisition' ? `${power} à portée` : reading.controllingPower;
    reasons.push(`${label}${who ? `, ${who}` : ''}`);
  }
  return { valid, reasons };
}

/** Relevé Powerplay d'une arrivée dans un système (FSDJump, Location, CarrierJump). Null sans système. */
export function readingOf(ev) {
  if (!ev?.StarSystem) return null;
  const pos = Array.isArray(ev.StarPos) && ev.StarPos.length === 3 ? ev.StarPos.map(Number) : null;
  return {
    name: String(ev.StarSystem),
    at: ev.timestamp || null,
    x: pos?.[0] ?? null,
    y: pos?.[1] ?? null,
    z: pos?.[2] ?? null,
    state: typeof ev.PowerplayState === 'string' ? ev.PowerplayState : null,
    controllingPower: typeof ev.ControllingPower === 'string' ? ev.ControllingPower : null,
    powers: Array.isArray(ev.Powers) ? ev.Powers.filter((p) => typeof p === 'string') : [],
    controlProgress: Number.isFinite(ev.PowerplayStateControlProgress) ? ev.PowerplayStateControlProgress : null,
    reinforcement: Number.isFinite(ev.PowerplayStateReinforcement) ? ev.PowerplayStateReinforcement : null,
    undermining: Number.isFinite(ev.PowerplayStateUndermining) ? ev.PowerplayStateUndermining : null,
    conflict: (Array.isArray(ev.PowerplayConflictProgress) ? ev.PowerplayConflictProgress : [])
      .filter((c) => typeof c?.Power === 'string' && Number.isFinite(c.ConflictProgress))
      .map((c) => ({ power: c.Power, progress: c.ConflictProgress })),
    warZones: (Array.isArray(ev.Conflicts) ? ev.Conflicts : []).filter(
      (c) => CONFLICT_ZONE_WAR_TYPES.includes(String(c?.WarType || '').toLowerCase()) && String(c?.Status || '').toLowerCase() === 'active',
    ).length,
  };
}

// --- Table pour la vigie des règles ---

/** Règles d'« Où agir », telles que son API les sert (forme d'avant le dépôt des règles), faites à partir des fiches. */
export const RULES = tableModule(['ACQUISITION_REACH_FORTIFIED_LY', 'ACQUISITION_REACH_STRONGHOLD_LY', 'ACQUISITION_POINTS', 'WEEK_TICK_DAY_UTC',
  'WEEK_TICK_HOUR_UTC', 'CONFLICT_ZONE_STATES', 'CONFLICT_ZONE_WAR_TYPES', 'UNDERMINING_NEEDS_REACH', 'STATES'].map((n) => FICHES.find((f) => f.nom === n)));
