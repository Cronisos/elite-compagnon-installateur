// Plan validé (A) : le joueur dit « ce plan est prêt ». Sans changer le schéma de la base, la validation est gardée dans
// engineering-validated.json : l'empreinte des cibles du plan (pour voir s'il a changé depuis), et une photo des modules
// visés au moment du clic (emplacement du journal, état actuel, auteur de la modification), qui servira à la fiche
// « Chez l'ingénieur » (lot 3) : l'emplacement du journal d'un module interne peut glisser si un emplacement se vide.
//
// Un plan modifié après sa validation n'est plus suivi (l'itinéraire le refuse, la fiche l'ignore) tant qu'il n'est pas
// revalidé : la copie validée sert seulement à montrer ce qui a changé.

import { createHash } from 'node:crypto';

const NAME = /^[A-Za-z0-9_]{1,80}$/;
const SLOT = /^[A-Za-z0-9_-]{1,60}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const fail = (why) => {
  throw new Error(why);
};
const sameKeys = (o, keys) => isObj(o) && Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));
const isoOk = (s) => typeof s === 'string' && s.length <= 40 && Number.isFinite(Date.parse(s));
const nameOrNull = (v) => v === null || (typeof v === 'string' && NAME.test(v));

/** Cibles d'un plan : les modules qui visent une modification, triés par emplacement. */
export function targetsOf(plan) {
  return (plan.modules || [])
    .filter((m) => m.blueprint && Number(m.grade) >= 1)
    .map((m) => [m.slot, m.module ?? null, m.blueprint, Number(m.grade), m.experimental ?? null])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** Empreinte d'un plan : vaisseau et cibles (ni le nom, ni la case du Dashboard, ni l'état actuel). */
export function fingerprintOf(plan) {
  const payload = JSON.stringify({ shipType: plan.shipType, shipId: plan.shipId ?? null, targets: targetsOf(plan) });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/**
 * Photo d'un plan au moment de la validation.
 * @param {object} plan plan avec ses modules
 * @param {object[]} slots emplacements (shipSlots : journalSlot, current) ; current null si la config n'est pas connue
 * @param {object|null} loadout Loadout brut du vaisseau (auteur de chaque modification), ou null
 */
export function snapshot(plan, slots, loadout, at = new Date().toISOString()) {
  const targets = targetsOf(plan);
  const raw = new Map((loadout?.Modules || []).map((m) => [String(m.Slot), m]));
  const bind = targets.map(([slot]) => {
    const row = slots.find((s) => s.key === slot) || null;
    const journalSlot = row?.journalSlot ?? null;
    const c = loadout ? row?.current : null;
    const engineerId = raw.get(journalSlot)?.Engineering?.EngineerID;
    return {
      slot,
      journalSlot,
      current: c ? {
        module: c.module || null,
        blueprint: c.blueprint || null,
        grade: Number.isInteger(c.grade) ? c.grade : 0,
        quality: typeof c.quality === 'number' && c.quality >= 0 && c.quality <= 1 ? c.quality : 0,
        experimental: c.experimental || null,
        engineerId: Number.isInteger(engineerId) ? engineerId : null,
      } : null,
    };
  });
  return { at, fingerprint: fingerprintOf(plan), shipId: plan.shipId ?? null, shipType: plan.shipType, targets, bind };
}

const asTarget = (t) => (t ? { module: t[1], blueprint: t[2], grade: t[3], experimental: t[4] } : null);

/** Libellés français d'une cible (l'interface compose « Portée augmentée → Démarrage rapide ») ; sans données de référence : rien. */
const withLabels = (t, ref) => {
  if (!t || !ref) return t;
  const bp = ref.blueprintKey?.(t.blueprint) || t.blueprint;
  return {
    ...t,
    moduleLabel: t.module ? ref.moduleLabel(t.module) : null,
    blueprintLabel: bp ? ref.blueprintLabel(bp) : null,
    experimentalLabel: t.experimental ? ref.specialLabel(t.experimental) : null,
  };
};

/**
 * Ce qui a changé depuis la validation : [{ slot, label, from, to }] (from / to : { module, blueprint, grade,
 * experimental } ou null ; avec les données de référence, leurs libellés en plus : moduleLabel, blueprintLabel,
 * experimentalLabel).
 */
export function changesOf(saved, plan, ref = null) {
  const before = new Map((saved?.targets || []).map((t) => [t[0], t]));
  const after = new Map(targetsOf(plan).map((t) => [t[0], t]));
  const labels = new Map((ref?.shipSlots?.(plan.shipType) || []).map((s) => [s.key, s.label]));
  const out = [];
  for (const slot of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const a = before.get(slot);
    const b = after.get(slot);
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    out.push({ slot, label: labels.get(slot) || slot, from: withLabels(asTarget(a), ref), to: withLabels(asTarget(b), ref) });
  }
  return out;
}

/**
 * État de validation d'un plan : { at, stale, changes, bound, ship }.
 * ship : null (plan sans vaisseau), 'remplace' (le numéro du vaisseau sert maintenant à un vaisseau d'un autre type :
 * R17), 'ok' sinon.
 */
export function validationState(saved, plan, { shipKeyNow = null, ref = null } = {}) {
  if (!saved) return null;
  const stale = saved.fingerprint !== fingerprintOf(plan);
  let ship = null;
  if (plan.shipId != null) ship = shipKeyNow && shipKeyNow !== plan.shipType ? 'remplace' : 'ok';
  return { at: saved.at, stale, changes: stale ? changesOf(saved, plan, ref) : [], bound: plan.shipId != null, ship };
}

/** Validation stricte du fichier engineering-validated.json (version 1). */
export function validateValidatedFile(json) {
  if (!sameKeys(json, ['version', 'plans']) || json.version !== 1 || !isObj(json.plans)) fail('forme inattendue');
  const keys = Object.keys(json.plans);
  if (keys.length > 500) fail('trop de plans');
  const plans = {};
  for (const k of keys) {
    if (!/^[1-9]\d{0,9}$/.test(k)) fail(`plan ${k} invalide`);
    const p = json.plans[k];
    if (!sameKeys(p, ['at', 'fingerprint', 'shipId', 'shipType', 'targets', 'bind'])) fail(`plan ${k} : champs inattendus`);
    if (!isoOk(p.at) || typeof p.fingerprint !== 'string' || !/^[0-9a-f]{16}$/.test(p.fingerprint)) fail(`plan ${k} : date ou empreinte`);
    if (!(p.shipId === null || (Number.isSafeInteger(p.shipId) && p.shipId >= 0))) fail(`plan ${k} : vaisseau`);
    if (typeof p.shipType !== 'string' || !/^[a-z0-9_]{1,64}$/.test(p.shipType)) fail(`plan ${k} : type de vaisseau`);
    if (!Array.isArray(p.targets) || p.targets.length > 80 || !Array.isArray(p.bind) || p.bind.length > 80) fail(`plan ${k} : cibles`);
    for (const t of p.targets) {
      if (!Array.isArray(t) || t.length !== 5 || typeof t[0] !== 'string' || !SLOT.test(t[0]) || !nameOrNull(t[1]) || typeof t[2] !== 'string' || !NAME.test(t[2])
        || !Number.isInteger(t[3]) || t[3] < 1 || t[3] > 5 || !nameOrNull(t[4])) fail(`plan ${k} : cible invalide`);
    }
    for (const b of p.bind) {
      if (!sameKeys(b, ['slot', 'journalSlot', 'current']) || typeof b.slot !== 'string' || !SLOT.test(b.slot) || !(b.journalSlot === null || (typeof b.journalSlot === 'string' && SLOT.test(b.journalSlot)))) fail(`plan ${k} : photo invalide`);
      const c = b.current;
      if (c !== null && (!sameKeys(c, ['module', 'blueprint', 'grade', 'quality', 'experimental', 'engineerId']) || !nameOrNull(c.module) || !nameOrNull(c.blueprint)
        || !Number.isInteger(c.grade) || c.grade < 0 || c.grade > 5 || typeof c.quality !== 'number' || !(c.quality >= 0 && c.quality <= 1) || !nameOrNull(c.experimental)
        || !(c.engineerId === null || Number.isSafeInteger(c.engineerId)))) fail(`plan ${k} : état photographié invalide`);
    }
    plans[k] = JSON.parse(JSON.stringify(p));
  }
  return { version: 1, plans };
}

export const emptyValidated = () => ({ version: 1, plans: {} });
