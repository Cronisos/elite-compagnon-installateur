// Itinéraire d'ingénierie, côté service : plans validés, épingles, calcul et lecture de l'itinéraire, fiches des
// ingénieurs. Les données persistées vont dans trois fichiers JSON du dossier des données (aucun changement du schéma
// de la base) : engineering-validated.json, engineering-pins.json, engineering-route.json (magasins stricts,
// jsonStore.js). Rien n'est écrit au démarrage ni par une lecture ; le calcul ne se fait qu'à la demande du joueur.

import { dataPath } from '../../../core/paths.js';
import { rowId, requireRowId } from '../../../core/ids.js';
import { GROUP_LABELS } from '../../../core/reference/labels.js';
import { remainingSteps } from './calc.js';
import { engineerStates } from './ranks.js';
import { RANK_TABLE, RANK_RULES } from './rankRules.js';
import { ITINERARY_RULES, ITINERARY_DATE, ITINERARY_PERIOD, ROUTE_SETTINGS, PROGRESS_STATES } from './itineraryRules.js';
import { canonicalBlueprint, maxGradeOf, offersOf, regionOf } from './engineerData.js';
import { JsonStore } from './jsonStore.js';
import { snapshot, validationState, validateValidatedFile, emptyValidated, targetsOf, fingerprintOf } from './validation.js';
import { deducePins, effectivePin, validatePinsFile, emptyPins } from './pins.js';
import { parentNeedsClimb, itemCheck } from './unlock.js';
import { computeRouteCore } from './route.js';
import { distanceLy, START_POINTS } from './position.js';
import { remoteWorkshopHere } from './workshop.js';
import { strictBody, inputError, engineerIdParam } from './input.js';

const r2 = (x) => Math.round(x * 100) / 100;
const shortDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' });
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

/** Contrôle d'un résultat d'itinéraire relu (engineering-route.json) : forme et clés sûres, à toute profondeur. */
export function validateRouteFile(json) {
  if (!isObj(json) || Object.keys(json).length !== 2 || json.version !== 1) throw new Error('forme inattendue');
  const walk = (v, depth = 0) => {
    if (depth > 40) throw new Error('trop profond');
    if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        if (FORBIDDEN.has(k)) throw new Error(`clé interdite ${k}`);
        walk(v[k], depth + 1);
      }
    }
  };
  walk(json.result);
  const r = json.result;
  if (r !== null) {
    if (!isObj(r) || typeof r.computedAt !== 'string' || !Number.isFinite(Date.parse(r.computedAt))) throw new Error('date du calcul');
    if (!isObj(r.from) || !Array.isArray(r.from.starPos) || r.from.starPos.length !== 3 || !r.from.starPos.every(Number.isFinite)) throw new Error('départ');
    if (!Array.isArray(r.plans) || !r.plans.every((p) => isObj(p) && Number.isSafeInteger(p.id) && typeof p.fingerprint === 'string')) throw new Error('plans');
    if (!isObj(r.options) || !Array.isArray(r.options.exclude) || !r.options.exclude.every(Number.isSafeInteger)) throw new Error('options');
    for (const k of ['parts', 'remote', 'impossible', 'notes']) if (!Array.isArray(r[k])) throw new Error(k);
    if (!isObj(r.inputs) || !isObj(r.inputs.pins) || !isObj(r.inputs.engineers)) throw new Error('entrées');
  }
  return { version: 1, result: r };
}

export class Itinerary {
  /**
   * @param {object} svc EngineeringService
   * @param {{ files?: { validated?, pins?, route? }, fsImpl?, warn? }} [o]
   */
  constructor(svc, { files = {}, fsImpl, warn } = {}) {
    this.svc = svc;
    const opts = (label, validate, empty, maxBytes) => ({ label, validate, empty, maxBytes, ...(fsImpl ? { fsImpl } : {}), ...(warn ? { warn } : {}) });
    this.validated = new JsonStore(files.validated || dataPath('engineering-validated.json'), opts('des plans validés', validateValidatedFile, emptyValidated));
    this.pins = new JsonStore(files.pins || dataPath('engineering-pins.json'), opts('des épingles', validatePinsFile, emptyPins));
    this.route = new JsonStore(files.route || dataPath('engineering-route.json'), opts('de l’itinéraire', validateRouteFile, () => ({ version: 1, result: null }), 1_000_000));
    this.deduced = new Map();
    this.lastNotices = new Map();
  }

  get ref() {
    return this.svc.ref;
  }

  get idx() {
    return this.svc.engIdx;
  }

  /** Données des ingénieurs lues, sinon 503 avec la raison. */
  requireData() {
    if (!this.svc.engIdx) {
      throw inputError(503, `Données des ingénieurs illisibles (${this.svc.engError || 'fichier absent'}) : la liste des ingénieurs, l’itinéraire et la fiche chez l’ingénieur sont indisponibles.`);
    }
    return this.svc.engIdx;
  }

  warnings() {
    return [this.validated, this.pins, this.route].map((s) => s.notice()).filter(Boolean);
  }

  // --- Épingles ---

  /** Relit les épingles déduites (après chaque reconstruction des rangs) ; diffuse une contradiction ou une nouvelle. */
  refreshPins({ live = false } = {}) {
    if (!this.idx || !this.ref) {
      this.deduced = new Map();
      return;
    }
    this.deduced = deducePins(this.svc.ranks, this.ref, this.idx);
    const saisies = this.pins.read().pins;
    for (const e of this.idx.list) {
      const { notice } = effectivePin(saisies[e.id] || null, this.deduced.get(e.id) || null);
      const key = notice ? `${notice.kind}|${notice.deduced?.blueprint}|${notice.deduced?.at}` : null;
      if (live && key && this.lastNotices.get(e.id) !== key) this.svc.broadcast('engineering:pin', { engineerId: e.id, notice });
      this.lastNotices.set(e.id, key);
    }
  }

  /** Épingles retenues : id → { grp, blueprint, source, at }. */
  effectivePins() {
    const out = new Map();
    if (!this.idx) return out;
    const saisies = this.pins.read().pins;
    for (const e of this.idx.list) {
      const { pin } = effectivePin(saisies[e.id] || null, this.deduced.get(e.id) || null);
      if (pin) out.set(e.id, pin);
    }
    return out;
  }

  stateOf(name) {
    return engineerStates(this.svc.ranks).get(name) || null;
  }

  /** État d'épingle d'un ingénieur (PinState). */
  pinState(id) {
    const ref = this.ref;
    const e = this.idx.byId.get(id);
    const saisie = this.pins.read().pins[id] || null;
    const deduced = this.deduced.get(id) || null;
    const eff = effectivePin(saisie, deduced);
    const st = this.stateOf(e.name);
    const label = (grp, bp) => (bp ? ref?.blueprintLabel(bp) ?? bp : null);
    const unlocked = st?.progress === 'Unlocked';
    const remoteMax = (p) => (p && unlocked && Number.isInteger(st.rank) && ref ? Math.min(st.rank, maxGradeOf(ref, this.idx, id, p.grp, p.blueprint)) : null);
    return {
      effective: eff.pin ? { ...eff.pin, label: label(eff.pin.grp, eff.pin.blueprint), groupLabel: GROUP_LABELS[eff.pin.grp] || eff.pin.grp, remoteMax: remoteMax(eff.pin) } : null,
      saisie: saisie ? { ...saisie, ...(saisie.blueprint ? { label: label(saisie.grp, saisie.blueprint), groupLabel: GROUP_LABELS[saisie.grp] || saisie.grp } : {}) } : null,
      deduced: deduced ? { grp: deduced.grp, blueprint: deduced.blueprint, label: label(deduced.grp, deduced.blueprint), groupLabel: GROUP_LABELS[deduced.grp] || deduced.grp, at: deduced.at, grade: deduced.grade, rank: deduced.rank, count: deduced.count } : null,
      unused: eff.unused,
      notice: eff.notice,
      locked: !!st?.progress && !unlocked,
    };
  }

  /** PUT /engineers/:id/pin */
  setPin(idParam, body) {
    const idx = this.requireData();
    const ref = this.svc.requireRef();
    const id = engineerIdParam(idParam, idx);
    const e = idx.byId.get(id);
    const b = strictBody(body, ['choice', 'grp', 'blueprint']);
    const CHOICE = 'Choisis « J’ai épinglé » avec un plan, « Aucun » ou « Je ne sais pas ».';
    if (!['pinned', 'none', 'unknown'].includes(b.choice)) throw inputError(400, CHOICE);
    let entry;
    if (b.choice === 'pinned') {
      if (typeof b.grp !== 'string' || typeof b.blueprint !== 'string') throw inputError(400, CHOICE);
      const k = canonicalBlueprint(ref, b.grp, b.blueprint);
      if (!k || k !== b.blueprint || maxGradeOf(ref, idx, id, b.grp, k) < 1) throw inputError(400, `${e.name} ne propose pas ce plan : choisis-en un dans la liste.`);
      entry = { choice: 'pinned', grp: b.grp, blueprint: k, at: new Date().toISOString() };
    } else {
      if (b.grp !== undefined || b.blueprint !== undefined) throw inputError(400, CHOICE);
      entry = { choice: b.choice, at: new Date().toISOString() };
    }
    const st = this.stateOf(e.name);
    if (st?.progress && st.progress !== 'Unlocked') throw inputError(409, `${e.name} n’est pas débloqué d’après tes journaux : on n’épingle qu’à son atelier, une fois débloqué.`);
    const cur = this.pins.read();
    const pins = this.cleanPins(cur.pins);
    pins[id] = entry;
    this.pins.write({ version: 1, pins });
    this.refreshPins();
    this.svc.notify();
    return this.pinState(id);
  }

  /** DELETE /engineers/:id/pin : retour à la déduction. */
  clearPin(idParam) {
    const idx = this.requireData();
    const id = engineerIdParam(idParam, idx);
    const cur = this.pins.read();
    if (Object.hasOwn(cur.pins, String(id))) {
      const pins = this.cleanPins(cur.pins);
      delete pins[id];
      this.pins.write({ version: 1, pins });
      this.refreshPins();
      this.svc.notify();
    }
    return this.pinState(id);
  }

  /** Saisies gardées à l'écriture (un id inconnu des données reste, ignoré ; 64 au plus). */
  cleanPins(pins) {
    return Object.fromEntries(Object.entries(pins).slice(0, 63));
  }

  // --- Plans validés ---

  savedOf(planId) {
    const v = this.validated.read().plans;
    return Object.hasOwn(v, String(planId)) ? v[String(planId)] : null;
  }

  shipKeyNow(plan) {
    if (plan.shipId == null) return null;
    const s = this.svc.shipOf(plan.shipId, plan.commanderId ?? null); // le vaisseau de son commandant
    const lo = s?.loadout;
    if (!lo) return null;
    return this.ref?.shipKey(lo.Ship) || String(lo.Ship || '').toLowerCase();
  }

  validationOf(plan) {
    return validationState(this.savedOf(plan.id), plan, { shipKeyNow: this.shipKeyNow(plan), ref: this.ref });
  }

  /** GET /validations */
  async validations() {
    const plans = await this.svc.prisma.engineeringPlan.findMany({ include: { modules: true } });
    const v = this.validated.read().plans;
    return plans.filter((p) => Object.hasOwn(v, String(p.id))).map((p) => ({ planId: p.id, at: v[String(p.id)].at, stale: v[String(p.id)].fingerprint !== fingerprintOf(p) })).sort((a, b) => a.planId - b.planId);
  }

  /** POST /plans/:id/validation : valide (ou revalide), puis calcule une fois l'itinéraire depuis ta position. */
  async validate(idParam) {
    this.svc.requireRef();
    const plan = await this.svc.getPlan(requireRowId(idParam, 'Plan introuvable.'));
    if (!targetsOf(plan).length) throw inputError(400, 'Ce plan ne vise aucune modification : rien à valider.');
    const slots = this.svc.shipSlots(plan.shipType, plan.shipId, plan.commanderId ?? null);
    const loadout = this.svc.loadoutOf(plan.shipType, plan.shipId, plan.commanderId ?? null);
    const snap = snapshot(plan, slots, loadout, new Date().toISOString());
    const existing = new Set((await this.svc.prisma.engineeringPlan.findMany({ select: { id: true } })).map((p) => p.id));
    const plans = Object.fromEntries(Object.entries(this.validated.read().plans).filter(([k]) => existing.has(Number(k))));
    plans[plan.id] = snap;
    this.validated.write({ version: 1, plans });
    // Un calcul, un seul : les plans du dernier calcul encore validés et non modifiés, plus celui-ci
    let route;
    try {
      const last = this.route.read().result;
      const all = await this.svc.prisma.engineeringPlan.findMany({ include: { modules: true } });
      const v = this.validated.read().plans;
      const okPlan = (p) => p && Object.hasOwn(v, String(p.id)) && v[String(p.id)].fingerprint === fingerprintOf(p);
      const byId = new Map(all.map((p) => [p.id, p]));
      let ids = last ? last.plans.map((p) => p.id).filter((id) => okPlan(byId.get(id))) : all.filter(okPlan).map((p) => p.id);
      ids = [plan.id, ...ids.filter((id) => id !== plan.id)];
      if (ids.length > ROUTE_SETTINGS.MAX_PLANS) {
        const recent = ids.slice(1).sort((a, b) => String(v[String(b)].at).localeCompare(String(v[String(a)].at)) || b - a);
        ids = [plan.id, ...recent.slice(0, ROUTE_SETTINGS.MAX_PLANS - 1)];
      }
      if (!this.svc.position) route = { computed: false, reason: 'position inconnue', message: 'Ta position n’est pas connue (aucun saut ni arrivée dans tes journaux) : choisis un point de départ.' };
      else {
        const res = await this.compute({ planIds: ids, from: 'position', ...(last ? {} : { exclude: [] }) });
        route = { computed: true, computedAt: res.computedAt, system: res.from.system, planIds: res.plans.map((p) => p.id), stops: res.parts.reduce((a, p) => a + p.stops.length, 0), totalAl: res.totalAl };
      }
    } catch (err) {
      route = { computed: false, reason: 'erreur', message: err.publicMessage || 'calcul impossible' };
    }
    this.svc.notify();
    return { ...this.validationOf(plan), route };
  }

  /** DELETE /plans/:id/validation (idempotent ; ne calcule rien). */
  async unvalidate(idParam) {
    const plan = await this.svc.getPlan(requireRowId(idParam, 'Plan introuvable.'));
    const cur = this.validated.read().plans;
    if (Object.hasOwn(cur, String(plan.id))) {
      const existing = new Set((await this.svc.prisma.engineeringPlan.findMany({ select: { id: true } })).map((p) => p.id));
      const plans = Object.fromEntries(Object.entries(cur).filter(([k]) => existing.has(Number(k)) && Number(k) !== plan.id));
      this.validated.write({ version: 1, plans });
      this.svc.notify();
    }
    return { ok: true };
  }

  // --- Itinéraire ---

  /** Modules d'un plan à calculer, avec l'état actuel de chaque module (shipSlots). */
  modulesOf(plan) {
    const ref = this.ref;
    const slots = this.svc.shipSlots(plan.shipType, plan.shipId, plan.commanderId ?? null);
    const bySlot = new Map(slots.map((s) => [s.key, s]));
    const out = [];
    for (const t of plan.modules) {
      if (!t.blueprint || !(t.grade >= 1)) continue;
      const s = bySlot.get(t.slot);
      const target = { module: t.module, blueprint: t.blueprint, grade: t.grade, experimental: t.experimental };
      out.push({ slot: t.slot, label: `${s?.label || t.slot} · ${t.module ? ref.moduleLabel(t.module) : ''}`, grp: ref.groupOf(t.module), target, current: s?.current || null });
    }
    return out.sort((a, b) => (a.slot < b.slot ? -1 : 1));
  }

  /** Point de départ : { kind, engineerId, system, systemAddress, starPos, at } (400 si invalide). */
  startOf(from) {
    const idx = this.idx;
    if (from === 'position') {
      const p = this.svc.position;
      if (!p) throw inputError(400, 'Ta position n’est pas connue (aucun saut ni arrivée dans tes journaux) : choisis un point de départ.');
      return { kind: 'position', engineerId: null, system: p.system, systemAddress: p.systemAddress, starPos: p.starPos, at: p.at };
    }
    if (from === 'sol' || from === 'colonia') return { kind: from, engineerId: null, system: START_POINTS[from].system, systemAddress: null, starPos: [...START_POINTS[from].starPos], at: null };
    if (isObj(from) && Object.keys(from).length === 1 && Object.hasOwn(from, 'engineer')) {
      const e = Number.isSafeInteger(from.engineer) ? idx.byId.get(from.engineer) : null;
      if (e) return { kind: 'engineer', engineerId: e.id, system: e.system, systemAddress: e.systemAddress, starPos: [e.coords.x, e.coords.y, e.coords.z], at: null };
    }
    throw inputError(400, 'Point de départ invalide : « position », « sol », « colonia » ou un ingénieur.');
  }

  /** POST /route : calcule, enregistre et rend le résultat. */
  async compute(body) {
    const idx = this.requireData();
    const ref = this.svc.requireRef();
    const b = strictBody(body, ['planIds', 'from', 'exclude']);
    const { planIds, from } = b;
    const PLANS = 'Coche au moins un plan validé (10 au plus).';
    if (!Array.isArray(planIds) || !planIds.length || planIds.length > ROUTE_SETTINGS.MAX_PLANS) throw inputError(400, PLANS);
    const ids = planIds.map((x) => rowId(x));
    if (ids.some((x) => x == null) || new Set(ids).size !== ids.length) throw inputError(400, PLANS);
    let exclude;
    if (b.exclude === undefined) exclude = (this.route.read().result?.options?.exclude || []).filter((x) => idx.byId.has(x));
    else {
      if (!Array.isArray(b.exclude) || b.exclude.length > ROUTE_SETTINGS.MAX_EXCLUDE || !b.exclude.every((x) => Number.isSafeInteger(x) && idx.byId.has(x)) || new Set(b.exclude).size !== b.exclude.length) {
        throw inputError(400, 'Liste des ingénieurs écartés invalide (25 au plus).');
      }
      exclude = [...b.exclude];
    }
    const start = this.startOf(from);
    const v = this.validated.read().plans;
    const plans = [];
    for (const id of ids) {
      const plan = await this.svc.prisma.engineeringPlan.findUnique({ where: { id }, include: { modules: true } });
      if (!plan) throw inputError(400, `Le plan ${id} n’existe pas (ou plus).`);
      const saved = Object.hasOwn(v, String(id)) ? v[String(id)] : null;
      if (!saved) throw inputError(400, `Le plan « ${plan.name} » n’est pas validé : valide-le d’abord.`);
      if (saved.fingerprint !== fingerprintOf(plan)) throw inputError(400, `Le plan « ${plan.name} » a changé depuis sa validation du ${shortDate(saved.at)} : revalide-le.`);
      // Vaisseau d'un autre commandant (second compte) : ni le vaisseau piloté ni un vaisseau où transférer un module ;
      // compté à part, comme un vaisseau sans numéro
      plans.push({ id: plan.id, name: plan.name, shipId: this.svc.ownShipId(plan), shipType: plan.shipType, fingerprint: saved.fingerprint, model: ref.shipName(plan.shipType), modules: this.modulesOf(plan) });
    }
    // Le magasin doit pouvoir écrire avant tout calcul (fichier verrouillé : 503, rien n'est calculé ni écrit)
    this.route.ensureWritable();
    const pos = this.svc.position;
    const result = computeRouteCore({
      ref,
      idx,
      plans,
      engineers: engineerStates(this.svc.ranks),
      surveyed: (this.svc.ranks.surveys || 0) > 0,
      pins: this.effectivePins(),
      from: start,
      positionAtCompute: pos ? { system: pos.system, systemAddress: pos.systemAddress, starPos: pos.starPos, at: pos.at } : null,
      exclude,
      inventory: this.svc.inventory,
      cargo: { known: !!this.svc.cargoSeen, lines: this.svc.game?.state?.cargo || [] },
      balance: typeof this.svc.game?.state?.balance === 'number' ? this.svc.game.state.balance : null,
      visitedSystems: this.svc.visitedSystems,
      pilotedShipId: this.svc.fleet.currentShipId ?? null,
      now: new Date().toISOString(),
    });
    this.route.write({ version: 1, result });
    this.svc.notify();
    return result;
  }

  /** GET /route : le dernier résultat, tel quel, et ce qui a changé depuis (jamais recalculé). */
  async view() {
    const idx = this.requireData();
    const ref = this.ref;
    const result = this.route.read().result;
    const pos = this.svc.position;
    const all = await this.svc.prisma.engineeringPlan.findMany({ include: { modules: true } });
    const byId = new Map(all.map((p) => [p.id, p]));
    const v = this.validated.read().plans;
    const validated = all.filter((p) => Object.hasOwn(v, String(p.id))).map((p) => {
      const saved = v[String(p.id)];
      const todo = ref ? this.modulesOf(p).filter((m) => !remainingSteps({ ...m.target, blueprint: canonicalBlueprint(ref, m.grp, m.target.blueprint) || m.target.blueprint }, m.current).done).length : null;
      return { id: p.id, name: p.name, shipType: p.shipType, shipId: p.shipId, at: saved.at, stale: saved.fingerprint !== fingerprintOf(p), todo };
    }).sort((a, b) => a.id - b.id);
    const changes = [];
    const live = { done: {}, missing: {}, remoteHere: remoteWorkshopHere(this.svc.lastDock, idx, { onFoot: this.svc.onFoot }) };
    if (result) {
      const pac = result.positionAtCompute;
      if (result.from?.kind === 'position' && pac && pos && (pos.systemAddress != null && pac.systemAddress != null ? pos.systemAddress !== pac.systemAddress : pos.system !== pac.system)) {
        changes.push({ kind: 'position', from: pac.system, to: pos.system, distanceAl: r2(distanceLy(pac.starPos, pos.starPos)) });
      }
      for (const p of result.plans) {
        const cur = byId.get(p.id);
        const saved = Object.hasOwn(v, String(p.id)) ? v[String(p.id)] : null;
        if (!cur) changes.push({ kind: 'plan', planId: p.id, what: 'supprime' });
        else if (!saved) changes.push({ kind: 'plan', planId: p.id, what: 'validation-annulee' });
        else if (saved.fingerprint !== fingerprintOf(cur)) changes.push({ kind: 'plan', planId: p.id, what: 'modifie' });
        else if (saved.fingerprint !== p.fingerprint) changes.push({ kind: 'plan', planId: p.id, what: 'revalide' });
      }
      const inPlans = new Set(result.plans.map((p) => p.id));
      for (const p of validated) if (!inPlans.has(p.id) && !p.stale) changes.push({ kind: 'plan-nouveau', planId: p.id });
      const pinsNow = this.effectivePins();
      for (const e of idx.list) {
        const a = result.inputs.pins[String(e.id)] || null;
        const b = pinsNow.get(e.id) || null;
        if ((a?.grp ?? null) !== (b?.grp ?? null) || (a?.blueprint ?? null) !== (b?.blueprint ?? null)) changes.push({ kind: 'pin', engineer: e.id });
        const was = result.inputs.engineers[String(e.id)];
        const st = this.stateOf(e.name);
        if (was && st?.progress === 'Unlocked' && was.progress !== 'Unlocked') changes.push({ kind: 'engineer', engineer: e.id, what: 'debloque' });
        else if (was && st?.progress === 'Unlocked' && Number.isInteger(st.rank) && was.rank != null && st.rank !== was.rank) changes.push({ kind: 'engineer', engineer: e.id, what: 'rang', from: was.rank, to: st.rank });
      }
      // Cases faites et manques, à jour (l'ordre et les choix, eux, datent du calcul)
      const currentOf = new Map();
      for (const p of result.plans) {
        const plan = byId.get(p.id);
        if (plan && ref) for (const m of this.modulesOf(plan)) currentOf.set(`${p.id}/${m.slot}`, m);
      }
      const stateOfTask = (t) => {
        if (t.kind === 'reference') {
          const f = idx.byId.get(t.for);
          return this.stateOf(f?.name)?.progress ? 'fait' : 'a-faire';
        }
        const m = currentOf.get(`${t.planId}/${t.slot}`);
        if (!m) return 'a-faire';
        const c = m.current;
        if (t.kind === 'effet') return c?.experimental && String(c.experimental).toLowerCase() === String(m.target.experimental).toLowerCase() ? 'fait' : 'a-faire';
        const same = c && String(c.module).toLowerCase() === String(m.target.module).toLowerCase() && String(c.blueprint).toLowerCase().split('_').pop() === String(t.blueprint).toLowerCase().split('_').pop();
        const top = t.grades.at(-1);
        if (same && (c.grade > top || (c.grade === top && ((c.quality ?? 0) >= 0.99 || c.quality === 0)))) return 'fait';
        if (same && c.grade >= t.grades[0]) return 'en-cours';
        return 'a-faire';
      };
      for (const t of result.remote) live.done[t.id] = stateOfTask({ ...t, kind: 'grades' });
      const stock = new Map();
      const owned = (k) => {
        if (!stock.has(k)) stock.set(k, this.svc.inventory.count(k));
        return stock.get(k);
      };
      const take = (list) => list.map((x) => {
        const before = owned(x.key);
        stock.set(x.key, Math.max(0, before - x.need));
        return { key: x.key, missing: Math.max(0, x.need - before) };
      }).filter((x) => x.missing > 0);
      for (const t of result.remote.filter((x) => x.before == null)) take(t.materials || []);
      for (const part of result.parts) {
        for (const s of part.stops) {
          for (const t of s.tasks) live.done[t.id] = stateOfTask(t);
          for (const t of result.remote.filter((x) => x.before === s.n)) take(t.materials || []);
          live.missing[s.n] = take(s.materials || []);
        }
      }
    }
    const notices = idx.list.map((e) => ({ engineerId: e.id, notice: effectivePin(this.pins.read().pins[e.id] || null, this.deduced.get(e.id) || null).notice })).filter((x) => x.notice);
    return {
      result,
      position: pos ? { system: pos.system, systemAddress: pos.systemAddress, starPos: pos.starPos, at: pos.at, region: regionOf(pos.starPos, idx.regions) } : null,
      validated,
      changes,
      live,
      notices,
      warnings: this.warnings(),
    };
  }

  /** GET /route/rules */
  rules() {
    return {
      date: ITINERARY_DATE,
      period: ITINERARY_PERIOD,
      rules: ITINERARY_RULES,
      settings: ROUTE_SETTINGS,
      progressStates: PROGRESS_STATES,
      rank: { R1: RANK_TABLE, R4b: RANK_RULES.REMOTE_RANK_GAIN, R7a: RANK_RULES.NEW_BLUEPRINT_RESTARTS },
    };
  }

  // --- Fiches des ingénieurs ---

  /** Ligne d'un ingénieur (liste et fiche). */
  engineerRow(e, result) {
    const pos = this.svc.position;
    const st = this.stateOf(e.name);
    const progress = ['Unlocked', 'Invited', 'Known', 'Acquainted', 'Barred'].includes(st?.progress) ? st.progress : null;
    const unlocked = progress === 'Unlocked';
    const tasks = result ? result.parts.flatMap((p) => p.stops).filter((s) => s.engineer === e.id).reduce((a, s) => a + s.tasks.length, 0) + result.remote.filter((t) => t.engineer === e.id).length : 0;
    return {
      id: e.id,
      name: e.name,
      system: e.system,
      systemAddress: e.systemAddress,
      region: e.region,
      distanceAl: pos ? r2(distanceLy(pos.starPos, e.coords)) : null,
      base: e.base,
      baseType: e.baseType,
      body: e.body,
      arrivalLs: e.distanceToArrivalLs,
      pads: e.pads,
      permit: { required: !!e.permit.required, name: e.permit.name ?? null, condition: e.permit.condition ?? null, seen: e.permit.required ? (unlocked || this.svc.visitedSystems.has(e.systemAddress) ? true : null) : null },
      // surveyed : un relevé complet des ingénieurs a été lu (sans état, il n'est alors « pas encore découvert »)
      state: { progress, surveyed: (this.svc.ranks?.surveys || 0) > 0, rank: unlocked && Number.isInteger(st?.rank) ? st.rank : null, rankProgress: unlocked && st?.rankProgress ? { min: st.rankProgress.min, max: st.rankProgress.max, known: st.rankProgress.known } : null },
      pin: this.pinState(e.id),
      uncertain: e.uncertain,
      tasks,
    };
  }

  /** GET /engineers */
  engineers() {
    const idx = this.requireData();
    const result = this.route.read().result;
    const pos = this.svc.position;
    const ref = this.ref;
    // Ce que chacun propose (filtre « Qui fait » de l'onglet Ingénieurs) : [groupe, plan, grade max], libellés à part
    const labels = { groups: {}, blueprints: {} };
    const rows = idx.list.map((e) => {
      const offers = ref ? offersOf(ref, idx, e.id) : [];
      for (const o of offers) {
        labels.groups[o.grp] ??= GROUP_LABELS[o.grp] || o.grp;
        labels.blueprints[o.blueprint] ??= ref.blueprintLabel(o.blueprint);
      }
      return { ...this.engineerRow(e, result), offers: offers.map((o) => [o.grp, o.blueprint, o.maxGrade]) };
    });
    rows.sort((a, b) => (a.distanceAl ?? 0) - (b.distanceAl ?? 0) || a.name.localeCompare(b.name, 'fr'));
    return { position: pos ? { system: pos.system, systemAddress: pos.systemAddress, starPos: pos.starPos, at: pos.at, region: regionOf(pos.starPos, idx.regions) } : null, engineers: rows, labels, warnings: this.warnings() };
  }

  /** GET /engineers/:id */
  async engineer(idParam) {
    const idx = this.requireData();
    const id = engineerIdParam(idParam, idx);
    const e = idx.byId.get(id);
    const ref = this.ref;
    const result = this.route.read().result;
    const row = this.engineerRow(e, result);
    // Chaîne des parrains (R14)
    const chain = [];
    let p = e.referral.by;
    const seen = new Set([id]);
    while (p != null && !seen.has(p) && chain.length < ROUTE_SETTINGS.MAX_REFERRAL_DEPTH) {
      seen.add(p);
      const pe = idx.byId.get(p);
      const st = this.stateOf(pe.name);
      const progress = st?.progress || null;
      const rank = progress === 'Unlocked' && Number.isInteger(st?.rank) ? st.rank : null;
      chain.push({ id: p, name: pe.name, state: progress, rank, region: pe.region, needsClimb: parentNeedsClimb({ progress, rank, rankProgress: st?.rankProgress }) });
      p = pe.referral.by;
    }
    const have = { ref, inventory: this.svc.inventory, cargo: { known: !!this.svc.cargoSeen, lines: this.svc.game?.state?.cargo || [] }, balance: typeof this.svc.game?.state?.balance === 'number' ? this.svc.game.state.balance : null };
    const offers = ref ? offersOf(ref, idx, id).map((o) => ({ ...o, groupLabel: GROUP_LABELS[o.grp] || o.grp, label: ref.blueprintLabel(o.blueprint) })) : [];
    // Plans validés : ce qu'il propose pour leurs modules
    const plans = [];
    if (ref) {
      const v = this.validated.read().plans;
      for (const plan of await this.svc.prisma.engineeringPlan.findMany({ include: { modules: true } })) {
        if (!Object.hasOwn(v, String(plan.id))) continue;
        const modules = this.modulesOf(plan).map((m) => {
          const bp = canonicalBlueprint(ref, m.grp, m.target.blueprint);
          const maxGrade = bp ? maxGradeOf(ref, idx, id, m.grp, bp) : 0;
          return { slot: m.slot, label: m.label, blueprint: bp, blueprintLabel: bp ? ref.blueprintLabel(bp) : null, maxGrade, effectHere: maxGrade >= 1 && !!m.target.experimental };
        }).filter((m) => m.maxGrade >= 1);
        if (modules.length) plans.push({ planId: plan.id, name: plan.name, modules });
      }
    }
    let route = null;
    if (result) {
      const parts = result.parts.map((pt) => ({ pt, stop: pt.stops.find((s) => s.engineer === id) })).find((x) => x.stop);
      route = { computedAt: result.computedAt, stop: parts?.stop.n ?? null, part: parts?.pt.kind ?? null, tasks: parts?.stop.tasks ?? [], remote: result.remote.filter((t) => t.engineer === id) };
    }
    return {
      ...row,
      discovery: e.discovery,
      referral: { by: e.referral.by, name: e.referral.by != null ? idx.byId.get(e.referral.by).name : null, state: chain[0]?.state ?? null, rank: chain[0]?.rank ?? null, region: chain[0]?.region ?? null, ok: chain[0] ? !chain[0].needsClimb : null, chain },
      invitation: e.invitation,
      unlock: { text: e.unlock.text, items: e.unlock.items.map((it) => ({ en: it.en, fr: it.fr, label: it.fr ?? it.en, type: it.type, qty: it.qty, credits: it.credits ?? null, kind: it.kind, have: itemCheck(it, have) })) },
      reputationNotes: e.reputationNotes,
      note: e.note ?? null,
      sources: e.sources,
      rangsFr: e.rangsFr ?? null,
      offers,
      plans,
      route,
    };
  }
}
