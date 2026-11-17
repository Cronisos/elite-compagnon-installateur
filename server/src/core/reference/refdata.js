// Index des données de référence téléchargées : vaisseaux et leurs emplacements,
// modules, modifications, effets expérimentaux, matériaux, ingénieurs.

import fs from 'node:fs';
import path from 'node:path';
import { REF_DIR, SHIP_IMAGES, readMeta, recoverInterruptedReplace, verifyReference } from './download.js';
import {
  BLUEPRINT_LABELS, SPECIAL_LABELS, SPECIAL_NAME_LABELS, GROUP_LABELS, RAW_LABELS, STANDARD_SLOTS, HARDPOINT_SIZES, HARDPOINT_LABELS,
} from './labels.js';
import { loadEddb } from './eddbData.js';
import { vaisseauxEdsy } from './vaisseauxEdsy.js';

/** Fin du nom d'une modification, commune à ses variantes pour un même module. */
export const blueprintTail = (b) => String(b || '').toLowerCase().split('_').pop();

// Coquilles des données d'origine → nom correct
const COMPONENT_ALIASES = { 'adaptive encyptors capture': 'adaptive encryptors capture' };

// Noms d'ingénieurs : coriolis écrit « Tod "The Blaster" McQuinn » (guillemets doubles) et « Felicty Farseer »
// (coquille, propulseurs G1 à G3) ; le journal et FDevIDs (engineers.csv) « Tod 'The Blaster' McQuinn » et
// « Felicity Farseer ». Les noms de coriolis sont ramenés à ceux de FDevIDs, ceux du journal.
const ENGINEER_ALIASES = new Map([['felicty farseer', 'felicity farseer']]);

/** Forme de comparaison d'un nom d'ingénieur : minuscules, guillemets et espaces unifiés, coquilles connues. */
export function engineerKey(name) {
  const k = String(name ?? '').normalize('NFC').toLowerCase().replace(/[‘’‚‛′`´"“”„‟″]/g, "'").replace(/\s+/g, ' ').trim();
  return ENGINEER_ALIASES.get(k) ?? k;
}

/**
 * Lecture d'un fichier des données. Une erreur garde le fichier en cause (err.file) : un fichier tronqué ou abîmé
 * (antivirus, disque, retouche à la main) est nommé. Son message est le seul que le joueur voit (« illisible » ou
 * « contenu invalide ») ; l'erreur technique en anglais (« Expected double-quoted… ») reste dans err.cause, écrite
 * dans le journal du serveur (readReference).
 */
function readFile(file, parse) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
    return parse(text);
  } catch (err) {
    throw Object.assign(new Error(text === undefined ? 'illisible' : 'contenu invalide', { cause: err }), { file });
  }
}

const readJson = (file) => readFile(file, (t) => JSON.parse(t));

function readCsv(file) {
  return readFile(file, parseCsv);
}

function parseCsv(text) {
  const [head, ...rows] = text.trim().split(/\r?\n/);
  const keys = head.split(',');
  return rows.map((l) => {
    const v = l.split(',');
    return Object.fromEntries(keys.map((k, i) => [k, (v[i] ?? '').trim()]));
  });
}

/** Dossier ou fichier d'un parcours illisible (dossier manquant…) : nommé comme un fichier (err.file). */
function readPath(p, read) {
  try {
    return read(p);
  } catch (err) {
    throw Object.assign(new Error('illisible', { cause: err }), { file: p });
  }
}

function readJsonTree(dir) {
  const out = [];
  for (const f of readPath(dir, fs.readdirSync)) {
    const p = path.join(dir, f);
    if (readPath(p, fs.statSync).isDirectory()) out.push(...readJsonTree(p));
    else if (f.endsWith('.json')) out.push(readJson(p));
  }
  return out;
}

/** Début du message d'une donnée abîmée ; la suite dit quel fichier, puis comment réparer. */
export const DAMAGED_PREFIX = 'Données de référence abîmées';
export const DAMAGED_FIX = 'retélécharge-les (Mon ingénierie → Données → « Mettre à jour les données »)';

/**
 * Ce que le joueur lit d'une erreur de chargement : le fichier en cause (relatif au dossier des données) et ce qui ne
 * va pas, en français. Erreur sans fichier (format des données inattendu, un champ manque) : « format inattendu ».
 */
function damagedWhat(dir, err) {
  const file = err?.file || err?.path; // err.path : erreur de fs restée sans fichier nommé
  const where = file ? `${path.relative(dir, file).replace(/\\/g, '/')} : ` : '';
  const what = err?.file ? err.message : err?.path ? 'illisible' : 'format inattendu';
  return `${where}${what}`;
}

/**
 * Charge l'index. Rend { ref, error } : ref null et error null si les données n'ont pas encore été téléchargées ; ref
 * null et error (en français, avec le fichier en cause) si elles sont abîmées. Ne lève jamais d'erreur : un fichier
 * tronqué arrêtait le serveur au démarrage (constructeur de Mon ingénierie), et avec lui le bouton qui le répare.
 * Un remplacement du dossier coupé net (download.js, reste « .old ») est d'abord remis en place.
 */
export function readReference(dir = REF_DIR) {
  recoverInterruptedReplace(dir);
  if (!fs.existsSync(path.join(dir, 'meta.json'))) return { ref: null, error: null };
  try {
    return { ref: buildReference(dir), error: null };
  } catch (err) {
    const what = damagedWhat(dir, err);
    // Détail technique (en anglais) pour le journal du serveur (bureau.log) seulement
    console.warn(`Données de référence (${what}) : ${(err?.cause ?? err)?.message ?? err}`);
    return { ref: null, error: `${DAMAGED_PREFIX} (${what}) : ${DAMAGED_FIX}.`, detail: what };
  }
}

/** Charge l'index ; null si les données n'ont pas encore été téléchargées, ou si elles sont abîmées (voir readReference). */
export function loadReference(dir = REF_DIR) {
  return readReference(dir).ref;
}

// --- Cache commun à tous les modules ---
// Avant, chaque module gardait sa propre copie (« reference ??= loadReference() ») : après « Mettre à jour les
// données », matériaux, sauvetage, bilan et repères restaient sur l'ancienne jusqu'à l'arrêt du serveur. Ici, une seule
// copie par dossier, relue quand meta.json change (chaque téléchargement le réécrit). meta.json est regardé au plus une
// fois par seconde : les grades des matériaux sont demandés à chaque événement de la relecture de l'historique.

const CHECK_MS = 1000;
const cache = new Map(); // dossier → { stamp, checkedAt, ref, error }

function metaStamp(dir) {
  try {
    const s = fs.statSync(path.join(dir, 'meta.json'));
    return `${s.ino}:${s.size}:${s.mtimeMs}`;
  } catch {
    return null;
  }
}

/**
 * Données de référence en place, partagées par tous les modules : { ref, error } (voir readReference).
 * @param {string} [dir]
 * @param {{ fresh?: boolean, now?: number }} [o] fresh : relit meta.json tout de suite (juste après un téléchargement)
 */
export function getReference(dir = REF_DIR, { fresh = false, now = Date.now() } = {}) {
  const key = path.resolve(dir);
  const hit = cache.get(key);
  if (hit && !fresh && now - hit.checkedAt < CHECK_MS) return hit;
  // Remplacement coupé net : remis en place avant de regarder meta.json (sinon « absent » serait gardé en cache)
  if (!hit?.ref) recoverInterruptedReplace(dir);
  const stamp = metaStamp(dir);
  if (hit && hit.stamp === stamp) {
    hit.checkedAt = now;
    return hit;
  }
  const entry = { stamp, checkedAt: now, ...(stamp ? readReference(dir) : { ref: null, error: null }) };
  if (entry.error) console.warn(entry.error);
  cache.set(key, entry);
  return entry;
}

/** Index en place, partagé (getReference) ; null si absent ou abîmé. */
export function currentReference(dir = REF_DIR) {
  return getReference(dir).ref;
}

function buildReference(dir) {
  const c = (p) => path.join(dir, 'coriolis', p);

  // Matériaux : nom interne du journal ↔ nom anglais des recettes
  const materials = new Map();
  const byEnglish = new Map();
  for (const m of readCsv(path.join(dir, 'fdevids', 'material.csv'))) {
    const key = m.symbol.toLowerCase();
    const entry = { key, name: m.name, grade: Number(m.rarity) || 0, type: m.type, category: m.category };
    materials.set(key, entry);
    byEnglish.set(m.name.toLowerCase(), entry);
  }
  const materialFromComponent = (name) => {
    const n = name.toLowerCase();
    return byEnglish.get(COMPONENT_ALIASES[n] || n) || null;
  };

  // Modules : symbole du journal → module coriolis (avec son groupe)
  const modules = new Map();
  const byGroup = new Map();
  const all = [];
  for (const file of readJsonTree(c('modules'))) {
    for (const [grp, list] of Object.entries(file)) {
      if (!Array.isArray(list)) continue;
      for (const m of list) if (m.symbol) all.push({ ...m, grp, symbol: m.symbol.toLowerCase() });
    }
  }
  // Coriolis donne aux FSD pré-modifiées (« FSD PreEng (V1) ») le symbole du module standard : sans ce tri, la
  // FSD 5A standard s'affichait « 5A FSD PreEng (V1) »
  const preEng = (m) => /PreEng/i.test(m.name || '');
  const standard = new Set(all.filter((m) => !preEng(m)).map((m) => m.symbol));
  for (const mod of all) {
    if (preEng(mod) && standard.has(mod.symbol)) continue;
    modules.set(mod.symbol, mod);
    if (!byGroup.has(mod.grp)) byGroup.set(mod.grp, []);
    byGroup.get(mod.grp).push(mod);
  }
  // Noms anglais des modules absents de coriolis (outfitting.csv)
  const outfitting = new Map(readCsv(path.join(dir, 'fdevids', 'outfitting.csv')).map((o) => [o.symbol.toLowerCase(), o]));

  // Modifications et effets expérimentaux
  const blueprints = readJson(c('modifications/blueprints.json'));
  const specials = readJson(c('modifications/specials.json'));
  const modMods = readJson(c('modifications/modules.json'));
  const blueprintByLower = new Map(Object.keys(blueprints).map((k) => [k.toLowerCase(), k]));

  // Vaisseaux : ShipType du journal → clé coriolis (via les identifiants Frontier)
  const ships = Object.create(null); // sans prototype : « constructor » n'est pas un vaisseau
  for (const file of readJsonTree(c('ships'))) Object.assign(ships, file);
  // Vaisseaux que coriolis ne connaît pas encore (Lynx Highliner, Anaconda Mk II) : repris d'EDSY (vaisseauxEdsy.js).
  // Des tables d'EDSY absentes ou illisibles ne privent pas des autres vaisseaux : ceux-là manquent, c'est tout.
  try {
    Object.assign(ships, vaisseauxEdsy(loadEddb(dir), ships));
  } catch (err) {
    console.warn(`Vaisseaux d'EDSY non repris : ${err?.message ?? err}`);
  }
  const shipByEdId = new Map(Object.entries(ships).map(([k, s]) => [String(s.edID), k]));
  const shipyard = readCsv(path.join(dir, 'fdevids', 'shipyard.csv'));
  const journalShip = new Map();
  // Repli par le nom : coriolis n'a pas le bon identifiant Frontier pour certains vaisseaux récents (Corsair), qui
  // restaient sans clé, donc sans dessin ni fiche
  const shipByName = new Map(Object.entries(ships).map(([k, s]) => [String(s.properties?.name || '').toLowerCase(), k]));
  shipByName.delete('');
  for (const y of shipyard) {
    const key = shipByEdId.get(y.id) || shipByName.get(String(y.name || '').toLowerCase()) || null;
    journalShip.set(y.symbol.toLowerCase(), { key, name: y.name });
  }

  const engineerRows = readCsv(path.join(dir, 'fdevids', 'engineers.csv'));
  const engineers = new Map(engineerRows.map((e) => [Number(e.id), e.name]));
  // Base de chaque ingénieur (adresse du système, MarketID) : sert aux liens Inara / Spansh
  const engineerBases = new Map(engineerRows.map((e) => [e.name, { systemAddress: e.system_address, marketId: e.market_id }]));
  // Nom FDevIDs (celui du journal) d'un nom écrit autrement (coriolis) ; inconnu : tel quel
  const engineerByKey = new Map(engineerRows.map((e) => [engineerKey(e.name), e.name]));
  const engineerName = (n) => engineerByKey.get(engineerKey(n)) ?? n;
  const engineerLists = new Map(); // grp|modification|grade → noms FDevIDs (même tableau à chaque appel)

  const ref = {
    meta: readMeta(dir), // celle du dossier lu (avant : toujours celle de REF_DIR, même pour un autre dossier)
    // Versions figées de cette version de l'app ? (download.js, verifyReference) : affiché dans l'onglet Données
    integrity: verifyReference(dir),
    materials,
    materialFromComponent,
    modules,
    byGroup,
    outfitting,
    blueprints,
    specials,
    modMods,
    ships,
    journalShip,
    engineers,
    engineerBases,

    /** Clé coriolis d'un ShipType du journal ("federation_corvette" → "federal_corvette"). */
    shipKey(journalType) {
      const t = String(journalType || '').toLowerCase();
      return journalShip.get(t)?.key || (ships[t] ? t : null);
    },

    shipName(key, journalType) {
      return ships[key]?.properties?.name || journalShip.get(String(journalType || '').toLowerCase())?.name || journalType || key;
    },

    imageFile(key) {
      const f = SHIP_IMAGES[key];
      return f && fs.existsSync(path.join(dir, 'images', `${f}.svg`)) ? path.join(dir, 'images', `${f}.svg`) : null;
    },

    /** Emplacements d'un vaisseau : standard, points d'emport, utilitaires, internes. */
    shipSlots(key) {
      const s = ships[key];
      if (!s) return null;
      const slots = [{ key: 'std-bh', group: 'standard', grp: 'bh', size: null, label: 'Blindage' }];
      STANDARD_SLOTS.forEach((def, i) => {
        const v = s.slots.standard[i];
        slots.push({ key: def.key, group: 'standard', grp: def.grp, size: typeof v === 'object' ? v.class : v, label: def.label, journal: def.journal });
      });
      s.slots.hardpoints.forEach((v, i) => {
        const size = typeof v === 'object' ? v.class : v;
        slots.push({
          key: `hp-${i}`,
          group: size === 0 ? 'utility' : 'hardpoint',
          size,
          label: size === 0 ? 'Utilitaire' : `Point d'emport ${HARDPOINT_LABELS[size]?.toLowerCase()}`,
        });
      });
      s.slots.internal.forEach((v, i) => {
        const obj = typeof v === 'object' ? v : null;
        slots.push({
          key: `int-${i}`,
          group: 'internal',
          size: obj ? obj.class : v,
          restriction: obj?.name || null, // Military, Cargo, PlanetaryApproachSuite…
          eligible: obj?.eligible ? Object.keys(obj.eligible) : null,
          label: obj?.name === 'Military' ? 'Compartiment militaire' : obj?.name === 'Cargo' ? 'Soute uniquement'
            : obj?.name === 'Passenger' ? 'Cabine passagers uniquement' : obj?.name === 'Fighter' ? 'Hangar uniquement'
            : obj?.name === 'PlanetaryApproachSuite' ? "Suite d'approche planétaire" : 'Interne',
        });
      });
      return slots;
    },

    /** Modules installables dans un emplacement (taille et restrictions respectées). */
    modulesForSlot(shipKeyName, slot) {
      if (slot.group === 'standard') {
        if (slot.grp === 'bh') return bulkheads(shipKeyName);
        return (byGroup.get(slot.grp) || []).filter((m) => m.class <= slot.size);
      }
      const all = [];
      for (const [grp, list] of byGroup) {
        if (['pp', 't', 'fsd', 'ls', 'pd', 's', 'ft'].includes(grp)) continue;
        for (const m of list) {
          const hp = m.symbol.startsWith('hpt_');
          if (slot.group === 'utility' && !(hp && m.class === 0)) continue;
          if (slot.group === 'hardpoint' && !(hp && m.class > 0 && m.class <= slot.size)) continue;
          if (slot.group === 'internal' && (hp || m.class > slot.size)) continue;
          if (slot.eligible && !slot.eligible.includes(grp)) continue;
          all.push(m);
        }
      }
      return all;
    },

    moduleLabel(symbol) {
      const s = String(symbol || '').toLowerCase();
      const m = modules.get(s);
      if (m) {
        const base = m.name || GROUP_LABELS[m.grp] || m.ukName || m.grp;
        const mount = m.mount ? ` (${{ F: 'fixe', G: 'cardan', T: 'tourelle' }[m.mount] || m.mount})` : '';
        return `${m.class}${m.rating} ${base}${mount}`;
      }
      const armour = /_armour_(grade\d|mirrored|reactive)/.exec(s);
      if (armour) return { grade1: 'Alliage léger', grade2: 'Alliage renforcé', grade3: 'Composite militaire', mirrored: 'Composite réfléchissant', reactive: 'Composite réactif' }[armour[1]];
      const o = outfitting.get(s);
      return o ? `${o.class || ''}${o.rating || ''} ${o.name}`.trim() : symbol;
    },

    /** Groupe coriolis d'un module (y compris le blindage). */
    groupOf(symbol) {
      const s = String(symbol || '').toLowerCase();
      if (/_armour_/.test(s)) return 'bh';
      return modules.get(s)?.grp || null;
    },

    /** Modifications possibles pour un groupe de modules. */
    blueprintsFor(grp) {
      const entry = modMods[grp];
      if (!entry?.blueprints) return [];
      return Object.keys(entry.blueprints)
        .filter((k) => blueprints[k])
        .map((k) => ({ key: k, name: BLUEPRINT_LABELS[blueprints[k].name] || blueprints[k].name, grades: Object.keys(blueprints[k].grades).map(Number) }));
    },

    /** Effets expérimentaux possibles pour un groupe de modules. */
    specialsFor(grp) {
      const entry = modMods[grp];
      if (!entry) return [];
      const keys = new Set([...(entry.specials || []), ...(entry.specials_S || []), ...(entry.specials_D || [])]);
      return [...keys].filter((k) => specials[k]).map((k) => ({ key: k, name: this.specialLabel(k) }));
    },

    /** Nom correct d'une modification (le journal et coriolis ne respectent pas toujours la casse). */
    blueprintKey(name) {
      return name ? blueprintByLower.get(String(name).toLowerCase()) || null : null;
    },

    blueprintLabel(key) {
      const b = blueprints[key];
      return b ? BLUEPRINT_LABELS[b.name] || b.name : key;
    },

    /** Noms français vus dans le journal (ExperimentalEffect_Localised), prioritaires. */
    localSpecials: new Map(),

    specialLabel(key) {
      const en = specials[key]?.name;
      return this.localSpecials.get(key) || SPECIAL_LABELS[key] || SPECIAL_NAME_LABELS[en] || en || key;
    },

    /** Matériaux d'une application de la modification au grade donné : [{ key, count }]. */
    gradeComponents(blueprint, grade) {
      const g = blueprints[blueprint]?.grades?.[grade];
      if (!g) return [];
      return Object.entries(g.components).map(([name, count]) => ({ key: materialFromComponent(name)?.key || name, count }));
    },

    specialComponents(special) {
      return Object.entries(specials[special]?.components || {}).map(([name, count]) => ({ key: materialFromComponent(name)?.key || name, count }));
    },

    /**
     * Nom d'une modification dans un groupe : EDSY et le journal disent Misc_LightWeight ou
     * Weapon_Overcharged là où le groupe dit LifeSupport_LightWeight ou MC_Overcharged.
     */
    blueprintIn(grp, blueprint) {
      const own = modMods[grp]?.blueprints;
      if (!own || !blueprint || own[blueprint]) return blueprint;
      const tail = blueprintTail(blueprint);
      return Object.keys(own).find((k) => blueprintTail(k) === tail) || blueprint;
    },

    /** Ingénieurs capables d'appliquer une modification à un grade, pour un groupe (noms du journal, FDevIDs). */
    engineersFor(grp, blueprint, grade) {
      const bp = this.blueprintIn(grp, blueprint);
      const key = `${grp}|${bp}|${grade}`;
      if (!engineerLists.has(key)) {
        const raw = modMods[grp]?.blueprints?.[bp]?.grades?.[grade]?.engineers || [];
        engineerLists.set(key, [...new Set(raw.map(engineerName))]);
      }
      return engineerLists.get(key);
    },

    /** Nom d'un ingénieur tel que le journal l'écrit (FDevIDs), d'après un nom écrit autrement. */
    engineerName,

    materialLabel(key, localised) {
      if (localised) return localised;
      return RAW_LABELS[key] || materials.get(key)?.name || key;
    },
  };

  function bulkheads(key) {
    const list = ships[key]?.bulkheads || [];
    const ids = ['grade1', 'grade2', 'grade3', 'mirrored', 'reactive'];
    const journalKey = [...journalShip.entries()].find(([, v]) => v.key === key)?.[0] || key;
    return list.map((b, i) => ({
      symbol: `${journalKey}_armour_${ids[i]}`,
      grp: 'bh',
      class: 1,
      rating: '',
      name: { grade1: 'Alliage léger', grade2: 'Alliage renforcé', grade3: 'Composite militaire', mirrored: 'Composite réfléchissant', reactive: 'Composite réactif' }[ids[i]],
    }));
  }

  return ref;
}

export { HARDPOINT_SIZES };
