// Tables d'EDSY (eddb.js) : chargement et accès communs au constructeur de builds et à l'ingénierie.
//
// eddb.js (© taleden, CC BY-NC 4.0) est téléchargé à part avec les données de référence (download.js) et
// n'est jamais exécuté : son texte est lu comme une donnée par jsLiteral.js, qui refuse tout ce qui n'est pas
// une valeur littérale. On y trouve les identifiants des vaisseaux, modules, modifications et effets
// expérimentaux qu'utilisent les liens edsy.org et la table Build, et les attributs des modules.

import fs from 'node:fs';
import path from 'node:path';
import { parseDataScript } from './jsLiteral.js';

/**
 * Lit <refDir>/edsy/eddb.js.
 * @returns {object|null} les tables d'EDSY, ou null si le fichier n'est pas téléchargé
 * @throws {Error} fichier illisible (autre chose que des valeurs littérales) ou sans les tables attendues
 */
export function loadEddb(refDir) {
  const file = path.join(refDir, 'edsy', 'eddb.js');
  if (!fs.existsSync(file)) return null;
  let tables;
  try {
    tables = parseDataScript(fs.readFileSync(file, 'utf8'), 'eddb');
  } catch (err) {
    throw new Error(`eddb.js illisible : ${err.message}`, { cause: err });
  }
  const missing = ['ship', 'module', 'mtype', 'attributes', 'blueprint', 'expeffect', 'group'].filter((k) => !tables?.[k] || typeof tables[k] !== 'object');
  if (missing.length) throw new Error(`eddb.js incomplet : table${missing.length > 1 ? 's' : ''} ${missing.join(', ')} absente${missing.length > 1 ? 's' : ''}.`);
  return tables;
}

/**
 * Fiche d'un module tel qu'installé sur une coque. Les blindages ont une fiche commune (type, nom, résistances)
 * complétée par une fiche propre à chaque vaisseau (nom Frontier, prix, masse), qui l'emporte.
 * @returns {object|null} null si l'identifiant est inconnu des deux
 */
export function moduleOf(eddb, ship, modid) {
  const common = eddb.module[modid];
  const hullSpecific = ship?.module?.[modid];
  if (!common && !hullSpecific) return null;
  const sheet = Object.assign({}, common, hullSpecific);
  sheet.mass = hullSpecific?.mass ?? common?.mass;
  return sheet;
}

const lower = (x) => String(x || '').toLowerCase();
const indexes = new WeakMap();

/**
 * Index par nom Frontier (en minuscules) des modules communs, des modifications et des effets, calculés une fois
 * par jeu de tables. Si deux entrées portent le même nom, la dernière l'emporte dans `blueprints` et `effects` ;
 * `blueprintsAll` et `effectsAll` gardent toutes les clés de chaque nom (Sensor_LongRange : capteurs cs_lr et
 * scanners utilitaires scan_lr), à départager par le type du module (blueprintFor, effectFor).
 * @returns {{ modules: Map<string, number>, blueprints: Map<string, string>, effects: Map<string, string>,
 *   blueprintsAll: Map<string, string[]>, effectsAll: Map<string, string[]> }}
 */
export function fdnameIndex(eddb) {
  let idx = indexes.get(eddb);
  if (!idx) {
    const modules = new Map();
    for (const [id, m] of Object.entries(eddb.module)) if (m?.fdname) modules.set(lower(m.fdname), Number(id));
    const byName = (table) => new Map(Object.entries(table || {}).map(([key, entry]) => [lower(entry?.fdname), key]));
    const allByName = (table) => {
      const out = new Map();
      for (const [key, entry] of Object.entries(table || {})) {
        const name = lower(entry?.fdname);
        if (!name) continue;
        if (!out.has(name)) out.set(name, []);
        out.get(name).push(key);
      }
      return out;
    };
    idx = {
      modules,
      blueprints: byName(eddb.blueprint),
      effects: byName(eddb.expeffect),
      blueprintsAll: allByName(eddb.blueprint),
      effectsAll: allByName(eddb.expeffect),
    };
    indexes.set(eddb, idx);
  }
  return idx;
}

/**
 * Modification d'un nom Frontier (Engineering.BlueprintName du journal) pour CE module : la clé que son type admet
 * (mtype.blueprints). Sans nom, la modification sans nom Frontier de son type (Exposing Seeker, wpn_exp), comme
 * EDSY (getFdevImportMap).
 * @param {object|null} sheet fiche du module (moduleOf)
 * @returns {string|null} null : nom inconnu ou non admis par ce type
 */
export function blueprintFor(eddb, sheet, fdname) {
  const allowed = eddb.mtype?.[sheet?.mtype]?.blueprints || [];
  if (!fdname) return allowed.find((k) => eddb.blueprint?.[k] && !eddb.blueprint[k].fdname) || null;
  return (fdnameIndex(eddb).blueprintsAll.get(lower(fdname)) || []).find((k) => allowed.includes(k)) || null;
}

/**
 * Effet expérimental d'un nom Frontier (Engineering.ExperimentalEffect) pour CE module : la clé que son type admet
 * (mtype.expeffects).
 * @returns {string|null} null : nom inconnu ou non admis par ce type
 */
export function effectFor(eddb, sheet, fdname) {
  if (!fdname) return null;
  const allowed = eddb.mtype?.[sheet?.mtype]?.expeffects || [];
  return (fdnameIndex(eddb).effectsAll.get(lower(fdname)) || []).find((k) => allowed.includes(k)) || null;
}

/** Index des fiches propres à une coque (blindages), par nom Frontier en minuscules. */
export function hullModuleIndex(ship) {
  const out = new Map();
  for (const [id, m] of Object.entries(ship?.module || {})) if (m?.fdname) out.set(lower(m.fdname), Number(id));
  return out;
}
