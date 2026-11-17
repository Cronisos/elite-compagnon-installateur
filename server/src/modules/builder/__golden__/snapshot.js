// Photographie (golden) du code des builds : toutes ses sorties, calculées sur le corpus (corpus.json)
// et sur l'ensemble des données d'eddb.js (tous les vaisseaux, toutes les modifications, toutes les armes).
// Pur : ne lit ni n'écrit aucun fichier ; reçoit l'API à photographier (adapter.js), les données et le corpus.

import { createHash } from 'node:crypto';

/** Valeur enregistrable et comparable en JSON : Map → objet, Infinity/NaN → texte, -0 → 0, undefined retiré. */
export function normalize(v) {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'NaN';
    if (v === Infinity) return 'Infinity';
    if (v === -Infinity) return '-Infinity';
    return Object.is(v, -0) ? 0 : v;
  }
  if (v === undefined || typeof v === 'function') return undefined;
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Map) return normalize(Object.fromEntries(v));
  if (v instanceof Set) return normalize([...v]);
  // Array.from : tableaux de ce contexte (l'ancien code chargeait eddb.js par vm, dans un autre contexte)
  if (Array.isArray(v)) return Array.from(v, (x) => normalize(x) ?? null);
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    const n = normalize(x);
    if (n !== undefined) out[k] = n;
  }
  return out;
}

/** Appel protégé : une erreur fait partie de la photo (message exact). */
function attempt(fn) {
  try {
    return fn();
  } catch (err) {
    return { error: String(err?.message || err) };
  }
}

const byNumber = (a, b) => a - b;
const sortedIds = (obj) => Object.keys(obj || {}).map(Number).sort(byNumber);
// Même vaisseau et mêmes emplacements (comparaison indépendante de l'ordre des clés et du contexte d'origine)
const sameBuild = (a, b) => !!a && !a.error && a.shipId === b.shipId && compare(b.slots, a.slots, { tol: 0, max: 1 }).length === 0;

/** Sorties d'un build du corpus : statistiques, lien EDSY et retour, noms du journal, emplacements de l'ingénierie. */
function caseOutputs(api, { eddb, ref }, c) {
  const out = {};
  const build = c.build;
  if (c.loadout) {
    // Le build du corpus vient de cette conversion (nom à part) : on ne détaille que s'il en diffère
    const r = attempt(() => api.loadoutToBuild(eddb, c.loadout));
    out.fromLoadout = r && sameBuild(r.build, build) ? { sameAsBuild: true, name: r.build.name, warnings: r.warnings } : r;
  }
  const ship = eddb.ship[build.shipId];
  out.allowed = Object.fromEntries(api.GROUPS.map((g) => [g, (build.slots[g] || []).map((s, i) => (s?.modid ? api.moduleAllowed(eddb, build.shipId, g, i, s.modid) : null))]));
  out.stats = attempt(() => api.computeStats(eddb, build));
  // La cargaison ne change que la portée « soute pleine »
  out.ladenJump = Object.fromEntries([0, 100].map((cargo) => [cargo, attempt(() => api.computeStats(eddb, build, { cargo }).jump.laden)]));
  out.edsy = attempt(() => api.encodeEdsy(eddb, build));
  if (typeof out.edsy === 'string') {
    out.decoded = attempt(() => api.decodeEdsy(eddb, api.extractHash(out.edsy)));
    const back = attempt(() => api.decodedToBuild(eddb, out.decoded));
    out.roundtrip = sameBuild(back, build) && back.name === build.name ? { sameAsBuild: true } : back;
    if (ref && ship) out.targets = attempt(() => api.edsyToTargets(ref, ref.shipKey(out.decoded.shipFdname), out.decoded));
  }
  out.toDecoded = attempt(() => api.buildToDecoded(eddb, build));
  return out;
}

/** Liens EDSY écrits à la main (format complet d'EDSY : prix, remises, valeurs de modification, erreurs). */
function linkOutputs(api, { eddb, ref }, l) {
  const out = { hash: api.extractHash(l.input) };
  if (out.hash == null) return out;
  out.decoded = attempt(() => api.decodeEdsy(eddb, out.hash));
  if (out.decoded.error) return out;
  out.build = attempt(() => api.decodedToBuild(eddb, out.decoded));
  out.reencoded = attempt(() => api.encodeEdsy(eddb, out.build));
  if (ref) out.targets = attempt(() => api.edsyToTargets(ref, ref.shipKey(out.decoded.shipFdname), out.decoded));
  return out;
}

/** Codage des nombres et des noms dans les liens, extraction du code d'un texte collé. */
function hashOutputs(api, h) {
  return {
    encode: h.encode.map(([n, len]) => api.hashEncode(n, len)),
    decode: h.decode.map((s) => api.hashDecode(s)),
    encodeT: h.texts.map((t) => api.hashEncodeT(t)),
    decodeT: h.texts.map((t) => api.hashDecodeT(api.hashEncodeT(t))),
    decodeRawT: h.rawT.map((s) => api.hashDecodeT(s)),
    safeName: h.names.map((t) => api.safeName(t)),
    extract: h.extract.map((t) => api.extractHash(t)),
  };
}

/** Configurations du journal inhabituelles : vaisseau inconnu, emplacement ou module introuvable, export imbriqué. */
function loadoutEdgeOutputs(api, { eddb }, e) {
  const found = api.findLoadout(e.input);
  return { found: found ? { Ship: found.Ship ?? null, ship: found.ship ?? null, modules: found.Modules.length } : null, build: found ? attempt(() => api.loadoutToBuild(eddb, found)) : null };
}

/** Pour chaque vaisseau : builds d'origine et « modules de base au maximum », leurs stats, modules permis par emplacement. */
function shipOutputs(api, { eddb }) {
  const ships = {};
  const sets = {};
  for (const id of sortedIds(eddb.ship)) {
    const ship = eddb.ship[id];
    const ids = [...new Set([...sortedIds(eddb.module), ...sortedIds(ship.module)])].sort(byNumber);
    const allowed = {};
    for (const g of api.GROUPS) {
      allowed[g] = (ship.slots[g] || []).map((_, i) => {
        const list = ids.filter((m) => api.moduleAllowed(eddb, id, g, i, m));
        const key = createHash('sha1').update(list.join(',')).digest('hex').slice(0, 12);
        sets[key] = list;
        return key;
      });
    }
    const stock = api.stockBuild(eddb, id, 'stock');
    const max = api.maxCoreBuild(eddb, id, 'max');
    ships[id] = {
      name: ship.name,
      fdname: ship.fdname,
      stock: stock.slots,
      maxCore: max.slots.component,
      shipIdOf: api.shipIdOf(eddb, ship.fdname),
      statsStock: attempt(() => api.computeStats(eddb, stock)),
      statsMaxCore: attempt(() => api.computeStats(eddb, max)),
      edsyStock: attempt(() => api.encodeEdsy(eddb, stock)),
      allowed,
    };
  }
  return { ships, allowedSets: Object.fromEntries(Object.entries(sets).sort(([a], [b]) => a.localeCompare(b))) };
}

/**
 * Moteur des modifications : pour chaque type de module, un module représentatif, et la valeur de chaque attribut
 * modifiable sans ingénierie, avec chaque modification (grade 1 et grade maximal), avec chaque effet seul, et avec
 * chaque effet sur la première modification au grade maximal.
 */
function modifierOutputs(api, { eddb }) {
  const out = {};
  const numericKeys = (o) => Object.keys(o || {}).filter((k) => k !== 'maxgrade' && (typeof o[k] === 'number' || Array.isArray(o[k]) && typeof o[k][0] === 'number'));
  for (const mt of Object.keys(eddb.mtype).sort()) {
    const def = eddb.mtype[mt];
    const bps = (def.blueprints || []).filter((b) => eddb.blueprint[b]);
    const exps = (def.expeffects || []).filter((x) => eddb.expeffect[x]);
    const ids = sortedIds(eddb.module).filter((id) => eddb.module[id].mtype === mt);
    if (!ids.length || (!bps.length && !exps.length)) continue;
    const modid = ids[Math.floor(ids.length / 2)];
    const attrs = [...new Set([
      ...(def.modifiable || []),
      ...bps.flatMap((b) => numericKeys(eddb.blueprint[b])),
      ...exps.flatMap((x) => numericKeys(eddb.expeffect[x])),
    ])].sort();
    const values = (entry) => attrs.map((a) => attempt(() => api.moduleValue(eddb, null, entry, a)));
    const row = { module: eddb.module[modid].fdname, modid, attrs, base: values({ modid }), blueprints: {}, experimentals: {}, combined: {} };
    for (const b of bps) {
      const max = eddb.blueprint[b].maxgrade;
      row.blueprints[b] = { 1: values({ modid, bpid: b, grade: 1 }), [max]: values({ modid, bpid: b, grade: max }) };
    }
    for (const x of exps) {
      row.experimentals[x] = values({ modid, expid: x });
      if (bps[0]) row.combined[x] = values({ modid, bpid: bps[0], grade: eddb.blueprint[bps[0]].maxgrade, expid: x });
    }
    out[mt] = row;
  }
  return out;
}

/** Toutes les armes : cadence et DPS, sans ingénierie, avec la première modification au maximum, avec le premier effet. */
function weaponOutputs(api, { eddb }) {
  const out = {};
  const hardpoint = eddb.group.hardpoint.mtypes;
  for (const id of sortedIds(eddb.module)) {
    const m = eddb.module[id];
    if (!hardpoint[m.mtype]) continue;
    const def = eddb.mtype[m.mtype] || {};
    const bp = (def.blueprints || []).find((b) => eddb.blueprint[b]);
    const exp = (def.expeffects || []).find((x) => eddb.expeffect[x]);
    const rates = (entry) => attempt(() => api.weaponRates(eddb, null, entry));
    out[id] = {
      fdname: m.fdname,
      plain: rates({ modid: id }),
      blueprint: bp ? { id: bp, ...rates({ modid: id, bpid: bp, grade: eddb.blueprint[bp].maxgrade }) } : null,
      experimental: exp ? { id: exp, ...rates({ modid: id, expid: exp }) } : null,
    };
  }
  return out;
}

/** Courbe de masse et résistances : grilles d'entrées du corpus. */
function formulaOutputs(api, f) {
  return {
    massCurve: f.massCurve.map((args) => api.massCurve(...args)),
    effectiveResistance: f.effectiveResistance.map((args) => api.effectiveResistance(...args)),
  };
}

/**
 * Photographie complète. Chaque section est comparée à part par golden.test.js.
 * @param {object} api adaptateur (adapter.js)
 * @param {{ eddb, ref }} data données de référence
 * @param {object} corpus contenu de corpus.json
 */
export function snapshot(api, data, corpus) {
  const constants = { GROUPS: api.GROUPS, HASH_VERSION: api.HASH_VERSION, SHIP_HATCH_ID: api.SHIP_HATCH_ID, MIN_VERSION: api.MIN_VERSION };
  const out = {
    constants,
    cases: Object.fromEntries(corpus.cases.map((c) => [c.id, caseOutputs(api, data, c)])),
    links: Object.fromEntries(corpus.links.map((l) => [l.id, linkOutputs(api, data, l)])),
    hash: hashOutputs(api, corpus.hash),
    loadoutEdges: Object.fromEntries(corpus.loadoutEdges.map((e) => [e.id, loadoutEdgeOutputs(api, data, e)])),
    ...shipOutputs(api, data),
    modifiers: modifierOutputs(api, data),
    weapons: weaponOutputs(api, data),
    formulas: formulaOutputs(api, corpus.formulas),
  };
  return normalize(out);
}

/**
 * Différences entre la photo de référence et une nouvelle, avec une tolérance relative sur les nombres.
 * @returns {{ path, expected, actual }[]} au plus `max` différences
 */
export function compare(expected, actual, { tol = 1e-9, max = 30 } = {}) {
  const diffs = [];
  const push = (path, e, a) => diffs.length < max && diffs.push({ path, expected: e, actual: a });
  const walk = (e, a, path) => {
    if (diffs.length >= max) return;
    if (typeof e === 'number' && typeof a === 'number') {
      if (Math.abs(e - a) > tol * Math.max(1, Math.abs(e), Math.abs(a))) push(path, e, a);
      return;
    }
    if (Array.isArray(e) || Array.isArray(a)) {
      if (!Array.isArray(e) || !Array.isArray(a)) return push(path, e, a);
      if (e.length !== a.length) push(`${path}.length`, e.length, a.length);
      for (let i = 0; i < Math.min(e.length, a.length); i++) walk(e[i], a[i], `${path}[${i}]`);
      return;
    }
    if (e && a && typeof e === 'object' && typeof a === 'object') {
      for (const k of new Set([...Object.keys(e), ...Object.keys(a)])) {
        if (!(k in a)) push(`${path}.${k}`, e[k], '(absent)');
        else if (!(k in e)) push(`${path}.${k}`, '(absent)', a[k]);
        else walk(e[k], a[k], `${path}.${k}`);
      }
      return;
    }
    if (e !== a) push(path, e, a);
  };
  walk(expected, actual, '');
  return diffs;
}

/** Profondeur dépliée de chaque section dans golden.json : une ligne par build, par sortie, par vaisseau… */
export const GOLDEN_DEPTHS = { cases: 2, ships: 2 };

/**
 * JSON lisible et diffable : chaque section sur une ligne par entrée, dépliée jusqu'à sa profondeur (1 par défaut),
 * le reste compact sur la ligne.
 */
export function format(value, depths = GOLDEN_DEPTHS) {
  const write = (v, depth, indent) => {
    if (depth <= 0 || v === null || typeof v !== 'object') return JSON.stringify(v);
    const pad = ' '.repeat(indent + 1);
    const array = Array.isArray(v);
    const items = Object.entries(v).map(([k, x]) => `${pad}${array ? '' : `${JSON.stringify(k)}: `}${write(x, depth - 1, indent + 1)}`);
    const [open, close] = array ? ['[', ']'] : ['{', '}'];
    return items.length ? `${open}\n${items.join(',\n')}\n${' '.repeat(indent)}${close}` : `${open}${close}`;
  };
  const sections = Object.entries(value).map(([k, x]) => ` ${JSON.stringify(k)}: ${write(x, depths[k] ?? 1, 1)}`);
  return `{\n${sections.join(',\n')}\n}\n`;
}
