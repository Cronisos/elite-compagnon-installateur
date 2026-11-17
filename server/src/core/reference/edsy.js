// Import d'un build EDSY (lien https://edsy.org/#/L=…) ou d'un export JSON au format Loadout du journal.
//
// Le texte du lien est lu par edsyLink.js (format seul) ; ce fichier donne un sens aux identifiants avec les
// tables d'eddb.js (eddbData.js) et associe les emplacements à ceux des données coriolis pour l'ingénierie.
// Liens acceptés : version 15 et suivantes (edsy.org écrit aujourd'hui la version 20).

import {
  LINK_GROUPS, LINK_VERSION, OLDEST_VERSION, CARGO_HATCH, readLink, unpackEngineering,
  encodeNumber, decodeNumber, encodeText, decodeText,
} from './edsyLink.js';
import { moduleOf } from './eddbData.js';

export { loadEddb } from './eddbData.js';

// Noms historiques, utilisés par le constructeur, l'ingénierie et leurs tests
export const GROUPS = LINK_GROUPS;
export const HASH_VERSION = LINK_VERSION;
export const MIN_VERSION = OLDEST_VERSION;
export const SHIP_HATCH_ID = CARGO_HATCH;
/** Texte de chiffres base 64 → nombre. */
export const hashDecode = decodeNumber;
/** Nombre → chiffres base 64, sur `l` caractères au moins. */
export const hashEncode = encodeNumber;
/** Nom codé d'un lien → texte. */
export const hashDecodeT = decodeText;
/** Texte → nom codé d'un lien. */
export const hashEncodeT = encodeText;

/** Extrait le code du build (« L=… ») d'une URL ou d'un texte collé ; null s'il n'y en a pas. */
export function extractHash(input) {
  const found = /(?:^|[#/&])L=([^&\s]+)/.exec(String(input || '').trim());
  if (!found) return null;
  try {
    return decodeURIComponent(found[1]);
  } catch {
    return found[1]; // pourcentage mal formé : code brut
  }
}

/** Emplacement lu dans le lien → description avec les noms d'eddb.js (noms Frontier du journal). */
function describeRecord(eddb, ship, group, rec) {
  const sheet = moduleOf(eddb, ship, rec.modid);
  const family = (sheet && eddb.mtype[sheet.mtype]) || {};
  const eng = unpackEngineering(rec.engineering?.bits ?? 0);
  // Les rangs du lien désignent la n-ième entrée des listes du type de module (entrées retirées comprises)
  const bpid = (eng.blueprint && family.blueprints?.[eng.blueprint - 1]) || null;
  const expid = (eng.effect && family.expeffects?.[eng.effect - 1]) || null;
  return {
    group,
    index: rec.slot,
    bpid,
    expid,
    size: ship.slots?.[group]?.[rec.slot] ?? null,
    modid: rec.modid,
    symbol: sheet?.fdname ? sheet.fdname.toLowerCase() : null,
    moduleName: sheet?.name || null,
    blueprint: (bpid && eddb.blueprint[bpid]?.fdname) || null,
    grade: eng.grade,
    experimental: (expid && eddb.expeffect[expid]?.fdname) || null,
    preengineered: eng.preengineered,
  };
}

/**
 * Décode un build EDSY. Un module inconnu d'eddb.js n'arrête pas la lecture : son `symbol` vaut null.
 * Les valeurs de modification saisies à la main dans EDSY ne sont pas reprises (modification au maximum du grade).
 * @param {object} eddb tables d'EDSY
 * @param {string} buildhash code du lien (voir extractHash)
 * @returns {{ version, shipId, shipFdname, shipName, name,
 *   slots: { group, index, bpid, expid, size, modid, symbol, moduleName, blueprint, grade, experimental, preengineered }[] }}
 * @throws {Error} lien trop ancien, vaisseau inconnu
 */
export function decodeEdsy(eddb, buildhash) {
  const link = readLink(buildhash);
  if (link.version < MIN_VERSION) {
    throw new Error(`Lien EDSY trop ancien (version ${link.version}) : ouvre-le dans EDSY puis recopie le nouveau lien.`);
  }
  const ship = eddb.ship[link.shipId];
  if (!ship) throw new Error(`Vaisseau EDSY inconnu (#${link.shipId}).`);
  const slots = GROUPS.flatMap((g) => link.groups[g].map((rec) => describeRecord(eddb, ship, g, rec)));
  return { version: link.version, shipId: link.shipId, shipFdname: ship.fdname, shipName: ship.name, name: link.name, slots };
}

// Clés coriolis des modules de base, dans l'ordre des emplacements d'EDSY
const CORE_KEYS = ['std-bh', 'std-pp', 'std-t', 'std-fsd', 'std-ls', 'std-pd', 'std-s', 'std-ft'];

/** L'emplacement coriolis `x` peut-il recevoir un module du groupe EDSY `group` (hors modules de base) ? */
function sameFamily(group, x) {
  if (group === 'military') return x.restriction === 'Military';
  if (group === 'internal') return x.group === 'internal' && x.restriction !== 'Military';
  return (group === 'hardpoint' || group === 'utility') && x.group === group;
}

/**
 * Associe les emplacements d'un build EDSY décodé à ceux du vaisseau dans les données coriolis : modules de base
 * par rang, autres groupes par taille (même taille d'abord, sinon le premier emplacement assez grand).
 * Une modification inconnue des données coriolis fait perdre le grade et l'effet de ce module.
 * @returns {{ targets: Map<string, { module, blueprint, grade, experimental }>, warnings: string[] }}
 *   targets : clé d'emplacement coriolis → cible
 */
export function edsyToTargets(ref, shipKey, decoded) {
  const shipSlots = ref.shipSlots(shipKey) || [];
  const taken = new Set();
  const targets = new Map();
  const warnings = [];
  for (const s of decoded.slots) {
    let key = null;
    if (s.group === 'component') {
      key = CORE_KEYS[s.index] || null;
    } else {
      const candidates = shipSlots.filter((x) => !taken.has(x.key) && sameFamily(s.group, x));
      const fit = candidates.find((x) => x.size === s.size) || candidates.find((x) => s.size == null || x.size >= s.size);
      key = fit?.key || null;
    }
    if (!key) {
      warnings.push(`Emplacement non retrouvé : ${s.moduleName || s.symbol || s.modid}`);
      continue;
    }
    taken.add(key);
    // Le blindage d'EDSY porte le nom Frontier propre au vaisseau : il est gardé tel quel
    const known = s.symbol && (ref.modules.has(s.symbol) || /_armour_/.test(s.symbol));
    const symbol = known ? s.symbol : null;
    if (!symbol && s.symbol) warnings.push(`Module inconnu des données de référence : ${s.moduleName || s.symbol}`);
    const blueprint = ref.blueprintIn(ref.groupOf(symbol), ref.blueprintKey(s.blueprint)) || null;
    targets.set(key, {
      module: symbol,
      blueprint,
      grade: blueprint ? s.grade : 0,
      experimental: blueprint ? s.experimental : null,
    });
  }
  return { targets, warnings };
}

/** Export JSON (journal, EDSY…) : premier objet trouvé, en profondeur, qui a des `Modules` et un vaisseau. */
export function findLoadout(json) {
  const pending = [json];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node.Modules) && (node.Ship || node.ship)) return node;
    for (const child of Object.values(node)) pending.push(child);
  }
  return null;
}
