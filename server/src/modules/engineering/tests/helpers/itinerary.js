// Aides des tests de l'itinéraire d'ingénierie : vraies données des ingénieurs (data/engineers.json), vraies données
// de référence figées (server/data/reference : tests sautés si elles manquent), états d'ingénieurs, modules et plans
// écrits à la main, base en mémoire. Rien d'un joueur.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadReference } from '../../../../core/reference/refdata.js';
import { loadEngineerData, indexEngineerData } from '../../services/engineerData.js';
import { Inventory } from '../../services/inventory.js';

export const ref = loadReference();
export const DATA = loadEngineerData();
if (DATA.error) throw new Error(`data/engineers.json : ${DATA.error}`);
export const idx = indexEngineerData(DATA.data);
export const id = (name) => {
  const e = idx.list.find((x) => x.name === name);
  if (!e) throw new Error(`ingénieur inconnu : ${name}`);
  return e.id;
};

export const FSD = 'int_hyperdrive_size5_class5';
export const T5 = 'int_engine_size5_class5';
export const T6 = 'int_engine_size6_class5';
export const SG = 'int_shieldgenerator_size5_class5';
export const BSG = 'int_shieldgenerator_size5_class3_fast';
export const LS = 'int_lifesupport_size5_class2';
export const SCB = 'int_shieldcellbank_size5_class2';
export const BL = 'hpt_beamlaser_gimbal_small';
export const MC = 'hpt_multicannon_fixed_small';
export const PP = 'int_powerplant_size5_class5';
export const PD = 'int_powerdistributor_size5_class5';
export const SB = 'hpt_shieldbooster_size0_class5';
export const SOL = Object.freeze({ kind: 'sol', engineerId: null, system: 'Sol', systemAddress: null, starPos: [0, 0, 0], at: null });
export const COLONIA = Object.freeze({ kind: 'colonia', engineerId: null, system: 'Colonia', systemAddress: null, starPos: [-9530.5, -910.28125, 19808.125], at: null });

/** État d'un ingénieur débloqué (engineerStates de ranks.js), au rang donné, relevé à min %. */
export const U = (rank = 5, min = 0) => ({ id: null, progress: 'Unlocked', rank, rankProgress: { min, max: min + 0.99, known: 'relevé' }, climbBasis: null });
export const S = (progress) => ({ id: null, progress, rank: null, rankProgress: null, climbBasis: null });

/** Les 25 ingénieurs débloqués au rang 5, avec des exceptions ({ nom: état | null (absent du relevé) }). */
export function engineers(over = {}) {
  const m = new Map(idx.list.map((e) => [e.name, U()]));
  for (const [k, v] of Object.entries(over)) {
    if (!idx.list.some((e) => e.name === k)) throw new Error(`ingénieur inconnu : ${k}`);
    if (v === null) m.delete(k);
    else m.set(k, v);
  }
  return m;
}

/** Module d'un plan (comme calcModules du service). */
export const mod = (slot, module, blueprint, grade, experimental = null, current = null) => ({ slot, label: slot, grp: ref?.groupOf(module), target: { module, blueprint, grade, experimental }, current });
/** Plan pour le calcul. */
export const plan = (pid, modules, extra = {}) => ({ id: pid, name: `Plan ${pid}`, shipId: pid, shipType: 'krait_mkii', fingerprint: 'abcdef0123456789', model: 'Krait Mk II', modules, ...extra });

/** Épingle retenue. */
export const pin = (grp, blueprint, source = 'journal', at = '2026-11-05T10:00:00.000Z') => ({ grp, blueprint, source, at });

/** Entrée complète du calcul (computeRouteCore). */
export function routeInput(over = {}) {
  return {
    ref,
    idx,
    plans: [],
    engineers: engineers(),
    surveyed: true,
    pins: new Map(),
    from: SOL,
    positionAtCompute: null,
    exclude: [],
    inventory: new Inventory(),
    cargo: { known: true, lines: [] },
    balance: 1_000_000,
    visitedSystems: new Set(),
    pilotedShipId: null,
    now: '2026-11-09T12:00:00.000Z',
    ...over,
  };
}

/** Données de référence avec deux vaisseaux de test (test_a : FSD 5, propulseurs 5 ; test_b : FSD 4, propulseurs 6). */
export function refWithTestShips() {
  if (!ref) return null;
  const base = ref.ships.krait_mkii;
  const make = (fsd, t) => {
    const s = JSON.parse(JSON.stringify(base));
    s.slots.standard[1] = t; // propulseurs
    s.slots.standard[2] = fsd; // FSD
    s.properties = { ...s.properties, name: `Test FSD ${fsd} T${t}`, hullMass: 300 };
    return s;
  };
  const ships = Object.assign(Object.create(null), ref.ships, { test_a: make(5, 5), test_b: make(4, 6) });
  const out = Object.create(ref);
  out.ships = ships;
  out.shipSlots = function shipSlots(key) {
    if (key !== 'test_a' && key !== 'test_b') return ref.shipSlots(key);
    // Mêmes emplacements que le Krait Mk II, tailles du FSD et des propulseurs changées
    const slots = ref.shipSlots('krait_mkii').map((s) => ({ ...s }));
    const t = ships[key].slots.standard[1];
    const fsd = ships[key].slots.standard[2];
    slots.find((s) => s.key === 'std-t').size = t;
    slots.find((s) => s.key === 'std-fsd').size = fsd;
    return slots;
  };
  out.shipName = (k, j) => ships[k]?.properties?.name || ref.shipName(k, j);
  return out;
}

/** Dossier temporaire (supprimé par l'appelant). */
export const tempDir = (prefix = 'elite-itin-') => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

/** Base simulée en mémoire : plans et modules, avec include: { modules }. */
export function memoryPrisma() {
  const plans = [];
  let planId = 0;
  let moduleId = 0;
  const clone = (p, include) => (p ? { ...p, ...(include?.modules ? { modules: p.modules.map((m) => ({ ...m })) } : { modules: undefined }) } : null);
  const strip = (p, include) => {
    const c = clone(p, include);
    if (!include?.modules) delete c.modules;
    return c;
  };
  const newModule = (pid, m) => ({ id: ++moduleId, planId: pid, module: null, blueprint: null, grade: 0, experimental: null, currentModule: null, currentBlueprint: null, currentGrade: 0, currentQuality: 0, currentExperimental: null, ...m });
  return {
    plans,
    $transaction: async () => [],
    materialInventory: { deleteMany: () => ({}), createMany: () => ({}) },
    referenceData: { upsert: async () => ({}) },
    shipNickname: { findMany: async () => [] },
    engineeringPlan: {
      findFirst: async ({ where }) => { const p = plans.find((x) => x.shipId === where.shipId); return p ? strip(p) : null; },
      findUnique: async ({ where, include }) => { const p = plans.find((x) => x.id === where.id); return p ? strip(p, include) : null; },
      findMany: async ({ include } = {}) => plans.map((p) => strip(p, include)),
      create: async ({ data }) => {
        const { modules, ...rest } = data;
        const p = { id: ++planId, selected: true, createdAt: new Date(), updatedAt: new Date(), shipId: null, ...rest, modules: [] };
        p.modules = (modules?.create || []).map((m) => newModule(p.id, m));
        plans.push(p);
        return strip(p);
      },
      update: async ({ where, data }) => { const p = plans.find((x) => x.id === where.id); Object.assign(p, data); return strip(p); },
      delete: async ({ where }) => { plans.splice(plans.findIndex((x) => x.id === where.id), 1); return {}; },
    },
    planModule: {
      upsert: async ({ where, create, update }) => {
        const p = plans.find((x) => x.id === where.planId_slot.planId);
        const m = p.modules.find((x) => x.slot === where.planId_slot.slot);
        if (m) Object.assign(m, update);
        else p.modules.push(newModule(p.id, create));
        return {};
      },
      deleteMany: async ({ where }) => { const p = plans.find((x) => x.id === where.planId); if (p) p.modules = []; return {}; },
      createMany: async ({ data }) => { for (const m of data) plans.find((x) => x.id === m.planId).modules.push(newModule(m.planId, m)); return {}; },
    },
  };
}

/** Tolérance des distances et des coûts (al, al-éq.). */
export const close = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;
