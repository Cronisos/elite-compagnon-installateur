// Fiche « Chez l'ingénieur » (itinéraire, lot 3) : à quai à la base d'un ingénieur qui a des tâches pour tes plans
// validés, « ici tu dois faire ça, ça, ça, et ça te coûte ça », cochée en direct à chaque application, avec le choix du
// plan à la main et les alertes (modification qui efface des grades ou un effet, application sur un autre module).
//
// Version simple, sans suivi des modules d'un vaisseau à l'autre ni des entrepôts : les tâches viennent du dernier
// itinéraire calculé (engineering-route.json : escales, tâches, matériaux, libellés). L'état d'un module est lu sur le
// vaisseau du plan ; si tu pilotes un autre vaisseau (modules montés dessus pour sauter plus loin), le même module à bord
// du vaisseau piloté est pris à la place, et la fiche le dit. Rien n'est écrit sur le disque : tout tient jusqu'au départ.
//
// Ouverture de la fenêtre en jeu, toutes ces conditions : un événement en direct (jamais à la seule relecture du
// journal), à quai, base d'un ingénieur reconnue (MarketID, sinon nom de station et système), au moins une tâche chez lui
// pour un plan validé et non modifié du dernier itinéraire, pas fermée par ✕ pendant cet amarrage. Fermeture : départ,
// chargement de partie, arrêt du jeu, mort.

import { dockOf, hostOf } from './workshop.js';
import { fingerprintOf } from './validation.js';

export const VISIT_PAGE = 'engineering-visit';
export const VISIT_EVENTS = ['Docked', 'Undocked', 'Location', 'LoadGame', 'Shutdown', 'Died', 'EngineerCraft', 'Loadout', 'ShipyardSwap'];
const LEAVE = new Set(['Undocked', 'LoadGame', 'Shutdown', 'Died']);
const DONE_QUALITY = 0.99;
const MAX_ALERTS = 20;

const low = (v) => String(v ?? '').toLowerCase();
const sameBp = (a, b) => Boolean(a) && Boolean(b) && low(a) === low(b);

/** État d'un grade g du plan B sur un module : fait, en cours (qualité partielle), à faire. */
export function gradeState(cur, blueprint, g) {
  if (!cur || !sameBp(cur.blueprint, blueprint)) return 'a-faire';
  if (cur.grade > g || (cur.grade === g && cur.quality >= DONE_QUALITY)) return 'fait';
  if (cur.grade === g) return 'en-cours';
  return 'a-faire';
}

/** Effet : fait, à faire, ou verrouillé tant que le module ne porte pas le plan B (le poser serait effacé, R7). */
export function effectState(cur, blueprint, experimental) {
  if (cur && low(cur.experimental) === low(experimental)) return 'fait';
  if (!cur || !sameBp(cur.blueprint, blueprint) || !(cur.grade >= 1)) return 'verrouille';
  return 'a-faire';
}

/** Ce que l'application de B efface sur ce module (R7), ou null. */
export function replaces(cur, blueprint) {
  if (!cur?.blueprint || sameBp(cur.blueprint, blueprint)) return null;
  if (!(cur.grade > 0) && !cur.experimental) return null;
  return { blueprint: cur.blueprint, grade: cur.grade, experimental: cur.experimental, experimentalLabel: cur.experimentalLabel, engineer: cur.engineer };
}

export class Visit {
  /**
   * @param svc EngineeringService (flotte, itinéraire, plans, inventaire, données des ingénieurs)
   * @param o.overlay ctx.overlay (setExtra) ; o.broadcast diffusion temps réel
   */
  constructor(svc, { overlay = null, broadcast = () => {}, delayMs = 250 } = {}) {
    this.svc = svc;
    this.overlay = overlay;
    this.broadcast = broadcast;
    this.delayMs = delayMs;
    this.reset();
    this.live = false;
    this.lastKey = null;
    this.timer = null;
    this.open = false;
  }

  reset() {
    this.dock = null;
    this.closed = false;
    this.manualPlan = null;
    this.alerts = [];
    this.crafts = 0;
    this.nextAlert = 1;
  }

  /** Événement du journal en direct. À appeler AVANT que la flotte n'applique l'événement (état d'avant pour les alertes). */
  onEvent(ev) {
    if (!ev || typeof ev !== 'object') return;
    this.live = true;
    if (ev.event === 'Docked' || (ev.event === 'Location' && ev.Docked)) {
      this.reset();
      this.dock = dockOf(ev);
    } else if (ev.event === 'Location' || LEAVE.has(ev.event)) {
      this.reset();
    } else if (ev.event === 'EngineerCraft' && this.dock) {
      this.crafts += 1;
      this.checkCraft(ev);
    }
    this.schedule();
  }

  host() {
    return this.dock && this.svc.engIdx ? hostOf(this.dock, this.svc.engIdx) : null;
  }

  /**
   * Module à l'emplacement `slot` (clé du plan) d'un vaisseau, ou null. commanderId : commandant du vaisseau (celui du
   * plan ; undefined : le commandant chargé), un ShipID n'étant unique que pour un commandant.
   */
  slotOf(shipType, shipId, slot, commanderId = undefined) {
    try {
      return this.svc.shipSlots(shipType, shipId, commanderId).find((s) => s.key === slot) || null;
    } catch {
      return null;
    }
  }

  /** ShipID du plan s'il vise un vaisseau du commandant chargé, sinon null (vaisseau d'un autre compte). */
  planShip(plan) {
    return typeof this.svc.ownShipId === 'function' ? this.svc.ownShipId(plan) : plan.shipId ?? null;
  }

  /** Vaisseau piloté : { shipId, shipType } d'après la flotte (celle du commandant chargé). */
  piloted() {
    const id = this.svc.fleet?.currentShipId;
    const s = id != null ? this.svc.fleet.ships.get(id) : null;
    return s ? { shipId: s.shipId, shipType: s.type, name: s.name || null } : null;
  }

  /**
   * Module d'une tâche : sur le vaisseau du plan ; si tu en pilotes un autre et qu'il porte à un emplacement de même
   * groupe le même module (même objet), c'est celui-là (modules montés sur un autre vaisseau).
   */
  moduleOf(plan, slot, targetModule) {
    const pil = this.piloted();
    const own = this.slotOf(plan.shipType, plan.shipId, slot, plan.commanderId ?? null);
    const mine = this.planShip(plan); // même numéro chez un autre commandant : pas le vaisseau piloté
    if (pil && pil.shipId !== mine && targetModule) {
      try {
        const there = this.svc.shipSlots(pil.shipType, pil.shipId).find((s) => s.current && low(s.current.module) === low(targetModule));
        if (there) return { cur: there.current, aboard: 'pilote', slot: there.journalSlot || there.key };
      } catch {
        // vaisseau piloté inconnu des données de référence : on reste sur celui du plan
      }
    }
    return { cur: own?.current || null, aboard: pil && mine != null && pil.shipId === mine ? 'plan' : 'ailleurs', slot: own?.journalSlot || slot };
  }

  /** Alertes d'une application (état du module d'avant). */
  checkCraft(ev) {
    const pil = this.piloted();
    if (!pil) return;
    let slots;
    try {
      slots = this.svc.shipSlots(pil.shipType, pil.shipId);
    } catch {
      return;
    }
    const before = slots.find((s) => low(s.journalSlot) === low(ev.Slot))?.current || null;
    const posed = ev.BlueprintName;
    const tasks = this.lastTasks || [];
    const planned = tasks.find((t) => before && low(t.module) === low(before.module) && sameBp(t.blueprint, posed));
    const lost = replaces(before, posed);
    if (lost) {
      const label = (bp) => this.svc.ref?.blueprintLabel?.(this.svc.ref.blueprintKey?.(bp) || bp) || bp;
      if (planned) this.alert('remplace-prevu', `✓ ${label(posed)} posé : ${label(lost.blueprint)} G${lost.grade}${lost.experimentalLabel ? ` et « ${lost.experimentalLabel} »` : ''} remplacés, comme prévu.`);
      else if (lost.experimental) this.alert('effet-efface', `⚠ Effet « ${lost.experimentalLabel || lost.experimental} » perdu : ${label(posed)} a remplacé ${label(lost.blueprint)} G${lost.grade}${lost.engineer ? ` (${lost.engineer})` : ''} sur ${ev.Slot}.`);
      else this.alert('grades-effaces', `⚠ ${label(posed)} a remplacé ${label(lost.blueprint)} G${lost.grade}${lost.engineer ? ` (${lost.engineer})` : ''} sur ${ev.Slot} : ses grades sont perdus.`);
    }
    // Application sur un module qu'aucune tâche d'ici ne vise, alors qu'une tâche du même plan reste à faire
    const aimed = tasks.some((t) => before && low(t.module) === low(before.module));
    const open = tasks.find((t) => sameBp(t.blueprint, posed) && !t.done);
    if (!aimed && open) this.alert('autre-module', `⚠ Application sur ${ev.Slot} du vaisseau piloté : ce n'est pas le module du plan « ${open.planName} » (${open.label}).`);
  }

  alert(kind, text) {
    this.alerts.push({ id: `a${this.nextAlert++}`, kind, text, at: new Date().toISOString() });
    if (this.alerts.length > MAX_ALERTS) this.alerts.splice(0, this.alerts.length - MAX_ALERTS);
  }

  dismiss(id) {
    const before = this.alerts.length;
    this.alerts = this.alerts.filter((a) => a.id !== id);
    if (this.alerts.length !== before) this.schedule();
    return { ok: true };
  }

  close() {
    this.closed = true;
    this.schedule();
    return { ok: true };
  }

  async choosePlan(planId) {
    this.manualPlan = planId == null ? null : Number(planId);
    this.schedule();
    return this.state();
  }

  /** État complet de la fiche (GET /visit). */
  async state() {
    const dock = this.dock;
    const host = this.host();
    const base = { dock, host, open: false, reason: null, plans: [], planId: null, manual: this.manualPlan != null, modules: [], cost: null, alerts: this.alerts, done: null, piloted: this.piloted() };
    if (!dock) return { ...base, reason: 'pas à quai' };
    if (!host) return { ...base, reason: 'pas une base d’ingénieur' };
    const result = this.svc.itin?.route.read().result;
    const stops = (result?.parts || []).flatMap((p) => p.stops || []).filter((s) => s.engineer === host.id);
    if (!stops.length) {
      this.lastTasks = [];
      return { ...base, reason: result ? 'sans tâche' : 'aucun itinéraire calculé' };
    }
    const plans = await this.svc.prisma.engineeringPlan.findMany({ include: { modules: true } });
    const byId = new Map(plans.map((p) => [p.id, p]));
    const validated = this.svc.itin.validated.read().plans;
    const ok = (id) => byId.has(id) && Object.hasOwn(validated, String(id)) && validated[String(id)].fingerprint === fingerprintOf(byId.get(id));
    const tasks = stops.flatMap((s) => s.tasks || []).filter((t) => t.planId != null && ok(t.planId) && (t.kind === 'grades' || t.kind === 'effet'));
    if (!tasks.length) {
      this.lastTasks = [];
      return { ...base, reason: 'sans tâche' };
    }
    const planIds = [...new Set(tasks.map((t) => t.planId))];
    const pil = this.piloted();
    const chosen = (this.manualPlan != null && planIds.includes(this.manualPlan) && this.manualPlan)
      || planIds.find((id) => this.planShip(byId.get(id)) != null && this.planShip(byId.get(id)) === pil?.shipId)
      || planIds[0];
    const plan = byId.get(chosen);
    const label = (bp) => this.svc.ref?.blueprintLabel?.(this.svc.ref.blueprintKey?.(bp) || bp) || bp;
    const all = [];
    const modules = [];
    for (const t of tasks) {
      const p = byId.get(t.planId);
      const target = p.modules.find((m) => m.slot === t.slot);
      const where = this.moduleOf(p, t.slot, target?.module);
      const cur = where.cur;
      const row = { planId: t.planId, planName: p.name, slot: t.slot, module: target?.module || null, blueprint: t.blueprint, label: t.label || t.slot };
      if (t.kind === 'grades') {
        const grades = (t.grades || []).map((g) => ({ grade: g, state: gradeState(cur, t.blueprint, g) }));
        row.done = grades.every((g) => g.state === 'fait');
        if (t.planId === chosen) {
          modules.push({ ...row, kind: 'grades', aboard: where.aboard, journalSlot: where.slot, blueprintLabel: t.labels?.blueprintLabel || label(t.blueprint), grades, rolls: t.rolls ?? null, done: row.done, replaces: replaces(cur, t.blueprint), currentLabel: cur?.blueprint ? label(cur.blueprint) : null });
        }
      } else {
        const st = effectState(cur, t.blueprint, t.experimental);
        row.done = st === 'fait';
        if (t.planId === chosen) {
          modules.push({ ...row, kind: 'effet', aboard: where.aboard, journalSlot: where.slot, blueprintLabel: t.labels?.blueprintLabel || label(t.blueprint), experimental: t.experimental, experimentalLabel: t.labels?.experimentalLabel || t.experimental, state: st, done: row.done, replaces: replaces(cur, t.blueprint), currentLabel: cur?.blueprint ? label(cur.blueprint) : null });
        }
      }
      all.push(row);
    }
    this.lastTasks = all;
    // Coût : matériaux de l'escale (calcul de l'itinéraire), comparés à ton inventaire d'aujourd'hui
    const mats = new Map();
    for (const s of stops) {
      for (const m of s.materials || []) {
        const x = mats.get(m.key) || { key: m.key, label: m.label || m.key, need: 0 };
        x.need += Number(m.need) || 0;
        mats.set(m.key, x);
      }
    }
    const materials = [...mats.values()].filter((m) => m.need > 0).map((m) => {
      const owned = this.svc.inventory?.count?.(m.key) ?? 0;
      return { ...m, owned, missing: Math.max(0, m.need - owned) };
    });
    const doneCount = modules.filter((m) => m.done).length;
    const open = this.live && !this.closed;
    const shown = planIds.map((id) => ({ planId: id, name: byId.get(id).name, shipId: byId.get(id).shipId, tasks: all.filter((t) => t.planId === id).length, left: all.filter((t) => t.planId === id && !t.done).length }));
    return {
      ...base,
      open,
      reason: open ? null : this.closed ? 'fermée' : 'jeu pas vu en marche',
      plans: shown,
      planId: chosen,
      planName: plan.name,
      planShipId: plan.shipId,
      modules,
      cost: { materials, missingCount: materials.filter((m) => m.missing > 0).length },
      done: { done: doneCount, total: modules.length, all: modules.length > 0 && doneCount === modules.length },
    };
  }

  /** Publication différée : fenêtre en jeu ouverte ou fermée, état diffusé s'il a changé. */
  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.publish().catch((err) => console.error(`Chez l'ingénieur : ${err.message}`)), this.delayMs);
    this.timer.unref?.();
  }

  async publish() {
    const s = await this.state();
    if (s.open !== this.open) {
      this.open = s.open;
      this.overlay?.setExtra?.(VISIT_PAGE, s.open);
    }
    const key = JSON.stringify(s);
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.broadcast('engineering:visit', s);
    }
    return s;
  }
}
