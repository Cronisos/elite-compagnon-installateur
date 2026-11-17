// Builds de l'app, exprimés avec les identifiants d'eddb.js :
//   { shipId, name, slots: { hardpoint: [...], utility: [...], component: [...], military: [...], internal: [...] } }
// Chaque emplacement vaut null (vide) ou { modid, bpid, grade, expid }. C'est aussi la forme enregistrée dans la
// table Build. Sert au constructeur de builds (édition, statistiques, partage par lien edsy.org) et à
// l'ingénierie (qui relit le lien d'un build enregistré : l'écriture et la lecture du lien doivent concorder).

import { LINK_GROUPS, COMPLETE_ROLL, packEngineering, writeLink } from './edsyLink.js';
import { moduleOf, fdnameIndex, hullModuleIndex, blueprintFor, effectFor } from './eddbData.js';

export { moduleOf } from './eddbData.js';

const lower = (x) => String(x || '').toLowerCase();

/** Contenu d'un emplacement. */
const fitting = (modid, bpid = null, grade = 0, expid = null) => ({ modid, bpid, grade, expid });

/** Grade ramené entre 1 et le grade maximal de la modification (5 si les données ne le disent pas). */
export function boundGrade(eddb, bpid, grade) {
  const max = Number(eddb.blueprint?.[bpid]?.maxgrade) || 5;
  return Math.min(Math.max(Number(grade) || 1, 1), max);
}

/**
 * Build relu (table Build, enregistré avec d'autres données de référence) : chaque grade ramené au grade maximal
 * actuel de sa modification. La Soute à extension (icr_xcr) est passée de G5 à G4 avec eddb 424029903 : un build
 * enregistré en G5 garde grade 5 en base, mais s'affiche, se calcule et se partage en G4. Le build n'est pas modifié.
 */
export function boundBuild(eddb, build) {
  const slots = {};
  for (const [g, row] of Object.entries(build?.slots || {})) {
    slots[g] = Array.isArray(row)
      ? row.map((s) => (s?.modid && s.bpid && eddb.blueprint?.[s.bpid] ? { ...s, grade: boundGrade(eddb, s.bpid, s.grade) } : s))
      : row;
  }
  return { ...build, slots };
}

/** Tous les emplacements du vaisseau, vides. */
const emptyRows = (ship) => Object.fromEntries(LINK_GROUPS.map((g) => [g, (ship.slots[g] || []).map(() => null)]));

/** Build d'origine du vaisseau (modules livrés au chantier naval, ship.stock). */
export function stockBuild(eddb, shipId, name = '') {
  const ship = eddb.ship[shipId];
  if (!ship) return null;
  const slots = {};
  for (const g of LINK_GROUPS) {
    const delivered = ship.stock?.[g] || [];
    slots[g] = (ship.slots[g] || []).map((_, i) => {
      // Un identifiant négatif désigne un module livré éteint : c'est le même module
      const modid = Math.abs(delivered[i] || 0);
      return modid ? fitting(modid) : null;
    });
  }
  return { shipId: Number(shipId), name, slots };
}

const RATING_ORDER = 'ABCDEFGHI';
/** `a` est-il meilleur que `b` : plus grande classe, puis meilleure note (A d'abord) ? */
const outranks = (a, b) => (a.class !== b.class ? a.class > b.class : RATING_ORDER.indexOf(a.rating) < RATING_ORDER.indexOf(b.rating));

/**
 * Vaisseau neuf aux modules de base au maximum : pour chaque module de base (sauf le blindage, gardé), le module
 * de même nom que celui d'origine (ni variante pré-modifiée, ni autre famille du même type) de la plus grande
 * classe permise et de la meilleure note ; à égalité, le plus petit identifiant.
 */
export function maxCoreBuild(eddb, shipId, name = '') {
  const build = stockBuild(eddb, shipId, name);
  if (!build) return null;
  const ship = eddb.ship[shipId];
  build.slots.component = build.slots.component.map((slot, index) => {
    if (index === 0 || !slot) return slot;
    const wanted = moduleOf(eddb, ship, slot.modid)?.name;
    let best = null;
    for (const [key, m] of Object.entries(eddb.module)) {
      const id = Number(key);
      if (m.name !== wanted || !moduleAllowed(eddb, shipId, 'component', index, id)) continue;
      if (best === null || outranks(m, eddb.module[best])) best = id;
    }
    return best ? fitting(best) : slot;
  });
  return build;
}

/** Résultat de decodeEdsy → build (les emplacements hors du vaisseau sont ignorés). */
export function decodedToBuild(eddb, decoded) {
  const slots = emptyRows(eddb.ship[decoded.shipId]);
  for (const s of decoded.slots) {
    const row = slots[s.group];
    if (!row || s.index >= row.length) continue;
    row[s.index] = fitting(s.modid, s.bpid || null, s.bpid ? s.grade : 0, s.expid || null);
  }
  return { shipId: decoded.shipId, name: decoded.name || '', slots };
}

// Dernier caractère codable dans le nom d'un lien (voir encodeText dans edsyLink.js)
const LAST_CODABLE = 0x107e;

/** Nom réduit aux caractères qu'un lien sait coder : « ⇄ » et « ↔ » deviennent « <-> », le reste au-delà de U+107E disparaît. */
export function safeName(name) {
  const text = String(name || '').replace(/[⇄↔]/g, '<->');
  return [...text].filter((ch) => ch.codePointAt(0) <= LAST_CODABLE).join('');
}

/**
 * Champ d'ingénierie d'un emplacement pour le lien : rangs de la modification et de l'effet dans les listes du
 * type de module (entrées retirées comprises : ce sont elles qui fixent les rangs). null : module non modifié.
 */
function engineeringField(eddb, ship, s) {
  const family = eddb.mtype[moduleOf(eddb, ship, s.modid)?.mtype] || {};
  const blueprint = s.bpid ? (family.blueprints || []).indexOf(s.bpid) + 1 : 0;
  const effect = s.expid ? (family.expeffects || []).indexOf(s.expid) + 1 : 0;
  const bits = packEngineering({ blueprint, grade: blueprint ? s.grade : 0, effect });
  // Une modification est écrite terminée (progression 100 %) : l'app compte toujours le maximum du grade
  return bits ? { bits, roll: blueprint ? COMPLETE_ROLL : 0 } : null;
}

/**
 * Lien edsy.org d'un build (https://edsy.org/#/L=…, version 20). decodeEdsy puis decodedToBuild redonnent
 * exactement le même build, nom réduit par safeName.
 * @throws {Error} vaisseau inconnu
 */
export function encodeEdsy(eddb, build) {
  const ship = eddb.ship[build.shipId];
  if (!ship) throw new Error(`Vaisseau EDSY inconnu (#${build.shipId}).`);
  const groups = {};
  for (const g of LINK_GROUPS) {
    groups[g] = [];
    (build.slots[g] || []).forEach((s, slot) => {
      if (s?.modid) groups[g].push({ slot, modid: s.modid, engineering: engineeringField(eddb, ship, s) });
    });
  }
  return `https://edsy.org/#/L=${writeLink({ shipId: build.shipId, groups, name: safeName(build.name) })}`;
}

/** Build → même forme que decodeEdsy (noms Frontier), pour l'ingénierie. */
export function buildToDecoded(eddb, build) {
  const ship = eddb.ship[build.shipId];
  const slots = [];
  for (const g of LINK_GROUPS) {
    (build.slots[g] || []).forEach((s, index) => {
      if (!s?.modid) return;
      const sheet = moduleOf(eddb, ship, s.modid);
      slots.push({
        group: g,
        index,
        size: ship.slots?.[g]?.[index] ?? null,
        modid: s.modid,
        bpid: s.bpid || null,
        expid: s.expid || null,
        symbol: sheet?.fdname ? sheet.fdname.toLowerCase() : null,
        moduleName: sheet?.name || null,
        blueprint: s.bpid ? eddb.blueprint[s.bpid]?.fdname || null : null,
        grade: s.bpid ? s.grade : 0,
        experimental: s.expid ? eddb.expeffect[s.expid]?.fdname || null : null,
      });
    });
  }
  return { shipId: build.shipId, shipFdname: ship.fdname, shipName: ship.name, name: build.name || '', slots };
}

/** Identifiant eddb.js d'un vaisseau d'après son nom dans le journal (Loadout.Ship), ou null. */
export function shipIdOf(eddb, journalShip) {
  const wanted = lower(journalShip);
  for (const [id, ship] of Object.entries(eddb.ship)) if (lower(ship?.fdname) === wanted) return Number(id);
  return null;
}

// Emplacements du journal : modules de base dans l'ordre d'eddb.js, points d'emport numérotés par taille
const CORE_SLOT_NAMES = ['Armour', 'PowerPlant', 'MainEngines', 'FrameShiftDrive', 'LifeSupport', 'PowerDistributor', 'Radar', 'FuelTank'];
const HARDPOINT_SIZE_NAMES = { 1: 'Small', 2: 'Medium', 3: 'Large', 4: 'Huge' };
const NUMBERED_INTERNAL = /^Slot(\d+)_Size(\d+)$/i;

/** Nom d'emplacement du journal (en minuscules) → [groupe, rang] pour ce vaisseau. */
function journalSlotMap(ship) {
  const map = new Map();
  const put = (name, group, index) => map.set(lower(name), [group, index]);
  CORE_SLOT_NAMES.forEach((n, i) => put(n, 'component', i));
  const perSize = {};
  (ship.slots.hardpoint || []).forEach((size, i) => {
    perSize[size] = (perSize[size] || 0) + 1;
    put(`${HARDPOINT_SIZE_NAMES[size]}Hardpoint${perSize[size]}`, 'hardpoint', i);
  });
  (ship.slots.utility || []).forEach((_, i) => put(`TinyHardpoint${i + 1}`, 'utility', i));
  (ship.slots.military || []).forEach((_, i) => put(`Military${String(i + 1).padStart(2, '0')}`, 'military', i));
  // Noms propres à certains vaisseaux (points d'emport de minage du Type-11, soutes réservées du Panther…) : prioritaires
  for (const g of LINK_GROUPS) (ship.slotnames?.[g] || []).forEach((n, i) => n && put(n, g, i));
  return map;
}

/**
 * Configuration du journal (Loadout) → build. Le grade vient de Engineering.Level, borné au grade maximal (la
 * qualité est ignorée : modification au maximum du grade). Une modification ou un effet au nom inconnu pour ce type
 * de module est laissé de côté avec un avertissement. Les modules que le catalogue cache (hidden d'EDSY : retirés
 * du jeu, doublons) sont acceptés : le vaisseau du joueur peut encore les porter. Les emplacements inconnus
 * (décorations…) sont ignorés sans avertissement.
 * @returns {{ build, warnings: string[] } | null} null si le vaisseau est inconnu d'eddb.js
 */
export function loadoutToBuild(eddb, loadout) {
  const shipId = shipIdOf(eddb, loadout?.Ship);
  if (shipId == null) return null;
  const ship = eddb.ship[shipId];
  const names = fdnameIndex(eddb);
  const hullModules = hullModuleIndex(ship);
  const warnings = [];
  const fromJournal = (m) => {
    const item = lower(m.Item);
    const modid = hullModules.get(item) ?? names.modules.get(item);
    if (!modid) {
      warnings.push(`Module inconnu d'EDSY : ${m.Item}`);
      return null;
    }
    const eng = m.Engineering && typeof m.Engineering === 'object' ? m.Engineering : null;
    if (!eng) return fitting(modid);
    // Modification cherchée par nom ET type de module : Sensor_LongRange est à la fois celle des capteurs et celle des
    // scanners utilitaires. Sans nom mais avec un grade : la modification sans nom Frontier du type (Exposing Seeker)
    const sheet = moduleOf(eddb, ship, modid);
    const level = Number(eng.Level) || 0;
    const bpid = eng.BlueprintName || level > 0 ? blueprintFor(eddb, sheet, eng.BlueprintName) : null;
    if (eng.BlueprintName && !bpid) warnings.push(`Modification inconnue pour ce module : ${eng.BlueprintName} (${m.Item})`);
    const expid = bpid && eng.ExperimentalEffect ? effectFor(eddb, sheet, eng.ExperimentalEffect) : null;
    if (bpid && eng.ExperimentalEffect && !expid) warnings.push(`Effet expérimental inconnu pour ce module : ${eng.ExperimentalEffect} (${m.Item})`);
    return fitting(modid, bpid, bpid ? boundGrade(eddb, bpid, level) : 0, expid);
  };

  const build = { shipId, name: typeof loadout.ShipName === 'string' ? loadout.ShipName.trim() : '', slots: emptyRows(ship) };
  // Une liste d'objets, sinon rien : un Loadout abîmé (journal, export JSON collé) ne fait plus une erreur 500
  const modules = Array.isArray(loadout.Modules) ? loadout.Modules.filter((m) => m && typeof m === 'object') : [];
  const places = journalSlotMap(ship);
  const internalTaken = new Set();
  for (const m of modules) {
    const place = places.get(lower(m.Slot));
    if (!place) continue;
    const [group, index] = place;
    build.slots[group][index] = fromJournal(m);
    if (group === 'internal') internalTaken.add(index);
  }

  // Internes « SlotNN_SizeN » d'un vaisseau sans noms propres : la numérotation du journal a des trous, on associe
  // donc dans l'ordre des numéros, chacun au premier emplacement libre de sa taille
  if (!ship.slotnames?.internal) {
    const numbered = modules
      .map((m) => ({ m, match: NUMBERED_INTERNAL.exec(m.Slot) }))
      .filter((x) => x.match)
      .sort((a, b) => Number(a.match[1]) - Number(b.match[1]));
    const sizes = ship.slots.internal || [];
    for (const { m, match } of numbered) {
      const size = Number(match[2]);
      const index = sizes.findIndex((s, k) => s === size && !internalTaken.has(k));
      if (index < 0) {
        warnings.push(`Emplacement non retrouvé : ${m.Slot}`);
        continue;
      }
      internalTaken.add(index);
      build.slots.internal[index] = fromJournal(m);
    }
  }
  return { build, warnings };
}

// Rangs des modules de base dont la taille doit être exacte : support vital et capteurs
const EXACT_SIZE_CORE = new Set([4, 6]);

/**
 * Le module peut-il aller dans cet emplacement ? Règles, toutes nécessaires :
 *   - son type est admis par le groupe (par rang pour les modules de base) ;
 *   - sa classe ne dépasse pas la taille de l'emplacement (taille exacte pour le support vital et les capteurs ;
 *     une FSD SCO plus petite que l'emplacement est acceptée, comme dans le jeu : SCO 5A sur la FSD de classe 8
 *     du Panther Clipper Mk II et de classe 6 du Krait Mk II, journaux de référence, nov. 2026) ;
 *   - module réservé à certains vaisseaux, emplacement réservé à certains types (soutes uniquement…) ;
 *   - soute ou contrôleur de drones réservé : seulement dans les emplacements nommés CARGO… / LIMPETCONTROLLER… ;
 *   - blindage : seulement l'un de ceux de cette coque.
 * @returns {boolean}
 */
export function moduleAllowed(eddb, shipId, group, index, modid) {
  const ship = eddb.ship[shipId];
  const sheet = moduleOf(eddb, ship, modid);
  if (!ship || !sheet) return false;
  const core = group === 'component';
  const admitted = core ? eddb.group.component[index] : eddb.group[group];
  if (!admitted?.mtypes?.[sheet.mtype]) return false;

  const size = ship.slots[group]?.[index];
  if (sheet.class > size) return false;
  if (core && EXACT_SIZE_CORE.has(index) && sheet.class < size) return false;

  if (sheet.reserved && !sheet.reserved[shipId]) return false;
  const slotReserve = ship.reserved?.[group]?.[index];
  if (slotReserve && !slotReserve[sheet.mtype]) return false;
  if (sheet.reserved) {
    const slotName = String(ship.slotnames?.[group]?.[index] || '').toUpperCase();
    if (sheet.mtype === 'icr' && !slotName.startsWith('CARGO')) return false;
    if (sheet.mtype === 'imlc' && !slotName.startsWith('LIMPETCONTROLLER')) return false;
  }

  if (core && index === 0) return Boolean(ship.module?.[modid]);
  return true;
}
