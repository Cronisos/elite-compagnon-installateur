// Itinéraire d'ingénierie (B) : quelles escales, chez quels ingénieurs, dans quel ordre, depuis un point de départ, pour
// faire tout ce que des plans validés demandent. Calcul pur, déterministe, lancé seulement au clic du joueur (bouton,
// validation d'un plan) : jamais en continu. Les règles viennent de itineraryRules.js (et de rankRules.js pour les rangs).
//
// Unités de travail, par module : les grades à faire dans ta région (à une escale, ou à distance si une épingle le
// permet : R3c), les grades que personne ne fait dans ta région (traversée, signalée : R11), l'effet expérimental (à un
// atelier : R4a, chez tout ingénieur de la région qui propose ce plan : R5). Choix des escales : couverture au moindre
// coût, dans cet ordre : pas de traversée pour une référence, le moins de déblocages, le moins d'étapes de déblocage,
// puis le coût en al-éq. (trajet à vol d'oiseau, escales, supercroisière, applications en plus dues aux rangs, secondes
// visites avec un autre vaisseau : ROUTE_SETTINGS). Ordre : chemin ouvert exact (Held-Karp) jusqu'à 16 points, sinon
// approché (plus proche voisin, 2-opt, Or-opt).

import { blueprintTail } from '../../../core/reference/refdata.js';
import { GROUP_LABELS } from '../../../core/reference/labels.js';
import { remainingSteps, qualityUnits, planNeeds, engineerModel, rollsToFinish } from './calc.js';
import { ROUTE_SETTINGS as RS, RULES_BY_ID, STATUS } from './itineraryRules.js';
import { canonicalBlueprint, maxGradeOf, offersOf, referenceRegion } from './engineerData.js';
import { distanceLy } from './position.js';
import { unlockChain, unlockSteps, ownSteps } from './unlock.js';
import { bestCover, bitsOf, popcount, lexCmp, openPath } from './routeSolver.js';
import { chooseVehicle } from './shipFit.js';

const EPS = 1e-9;
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : x);
const lower = (s) => String(s ?? '').toLowerCase();
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const fmtAl = (n) => (n < 1000 ? (Math.round(n * 10) / 10).toLocaleString('fr-FR') : fmt(n));
const regionName = (r) => (r === 'Colonia' ? 'Colonia' : 'la Bulle');
// Élisions devant un nom qui commence par une voyelle (« qu’Elvira », « d’Elvira »)
const VOWEL = /^[AEIOUYÉÈÊÀÂÎÔÛaeiouyéèêàâîôû]/;
const que = (name) => (VOWEL.test(name) ? `qu’${name}` : `que ${name}`);
const de = (name) => (VOWEL.test(name) ? `d’${name}` : `de ${name}`);
const toRegion = (r) => (r === 'Colonia' ? 'à Colonia' : 'dans la Bulle');
const otherRegion = (r) => (r === 'Colonia' ? 'Bulle' : 'Colonia');
const PROGRESS = ['Unlocked', 'Invited', 'Known', 'Acquainted', 'Barred'];
const GOAL = Object.freeze({ rank: 3, progress: RS.REFERRAL_PROGRESS });

/** Règles non mesurées d'une liste d'identifiants (pour le badge du client), dans l'ordre donné. */
const ruleList = (ids) => [...new Set(ids)].filter((id) => RULES_BY_ID.has(id));

/**
 * Calcule l'itinéraire.
 * @param {object} input
 * @param {object} input.ref données de référence
 * @param {object} input.idx index des ingénieurs (indexEngineerData)
 * @param {object[]} input.plans [{ id, name, shipId, shipType, fingerprint, model, modules: [{ slot, label, grp, target, current }] }]
 * @param {Map<string, object>} input.engineers nom → état (engineerStates)
 * @param {boolean} input.surveyed un relevé complet des ingénieurs a été lu
 * @param {Map<number, object>} input.pins id → épingle retenue { grp, blueprint, source, at }
 * @param {object} input.from { kind, engineerId, system, systemAddress, starPos, at }
 * @param {object|null} input.positionAtCompute
 * @param {number[]} input.exclude ingénieurs écartés
 * @param {object} input.inventory inventaire (count(key), items)
 * @param {{ known: boolean, lines: object[] }} input.cargo soute du vaisseau
 * @param {number|null} input.balance solde
 * @param {Set<number>} input.visitedSystems SystemAddress des systèmes vus (permis)
 * @param {number|null} input.pilotedShipId
 * @param {string} input.now heure du calcul (ISO)
 */
export function computeRouteCore(input) {
  const { ref, idx } = input;
  const m = engineerModel(ref, input.engineers);
  const start = input.from;
  const startPos = { x: start.starPos[0], y: start.starPos[1], z: start.starPos[2] };
  const { region: H, note: regionNote } = referenceRegion(start.starPos, idx.regions);
  const exclude = new Set(input.exclude || []);
  const notes = [];
  if (regionNote) notes.push(regionNote);

  // --- Ingénieurs ---
  const byKey = new Map([...input.engineers.keys()].map((n) => [lower(n).replace(/[‘’"“”]/g, "'"), n]));
  const E = new Map();
  for (const d of idx.list) {
    const simName = input.engineers.has(d.name) ? d.name : byKey.get(lower(d.name).replace(/[‘’"“”]/g, "'")) || d.name;
    const st = input.engineers.get(simName);
    let progress = st?.progress;
    if (!PROGRESS.includes(progress)) progress = input.surveyed ? 'absent' : 'unknown';
    const unlocked = progress === 'Unlocked';
    const sl = Number.isFinite(d.distanceToArrivalLs) ? d.distanceToArrivalLs : 0;
    E.set(d.id, {
      id: d.id,
      name: d.name,
      simName,
      data: d,
      coords: d.coords,
      region: d.region,
      sl,
      stopCost: RS.STOP_AL + RS.SUPERCRUISE_FACTOR * Math.sqrt(sl),
      progress,
      rank: unlocked && Number.isInteger(st?.rank) ? st.rank : null,
      rankProgress: unlocked ? st?.rankProgress ?? null : null,
      permitNeeded: !!d.permit.required && !(unlocked || input.visitedSystems?.has(d.systemAddress)),
      banned: progress === 'Barred',
      excluded: exclude.has(d.id),
      referralBy: d.referral.by,
      ready: unlocked || progress === 'Invited',
    });
  }
  const kept = (e) => !e.banned && !e.excluded;
  const offers = (id, grp, B) => maxGradeOf(ref, idx, id, grp, B);
  const chainCache = new Map();
  const uctx = { E, H };
  const chainOf = (id) => {
    if (!chainCache.has(id)) chainCache.set(id, unlockChain(id, uctx));
    return chainCache.get(id);
  };
  const climbBpCache = new Map();
  const unitCost = (bp, g) => ref.gradeComponents(bp, g).reduce((a, c) => a + c.count, 0);
  // Plan de la montée de référence d'un parrain : le moins cher de ceux qu'il propose jusqu'au G3 au moins (pas le
  // blindage), posé sur un module de ce type acheté exprès
  const climbBlueprintOf = (id) => {
    if (!climbBpCache.has(id)) {
      const list = offersOf(ref, idx, id).filter((o) => o.maxGrade >= 3 && o.grp !== 'bh')
        .map((o) => ({ ...o, cost: [1, 2, 3].reduce((a, g) => a + unitCost(o.blueprint, g), 0) }))
        .sort((a, b) => a.cost - b.cost || a.grp.localeCompare(b.grp) || a.blueprint.localeCompare(b.blueprint));
      climbBpCache.set(id, list[0] || null);
    }
    return climbBpCache.get(id);
  };
  const goalOpts = (id) => ({ goal: GOAL, climbBlueprint: climbBlueprintOf(id)?.blueprint ?? null });

  // --- Modules et unités de travail ---
  const mods = [];
  const impossible = [];
  const regionUnits = [];
  const travUnits = [];
  const bannedNotes = new Map(); // nom → texte
  const hEng = [...E.values()].filter((e) => e.region === H && !e.banned);
  // Ordre des entrées sans effet sur le résultat : plans par numéro, modules par emplacement
  const plansIn = [...input.plans].sort((a, b) => a.id - b.id).map((p) => ({ ...p, modules: [...p.modules].sort((a, b) => (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0)) }));
  for (const plan of plansIn) {
    for (const cm of plan.modules) {
      const grp = cm.grp;
      const B = canonicalBlueprint(ref, grp, cm.target.blueprint);
      const key = `${plan.id}/${cm.slot}`;
      const labels = {
        moduleLabel: ref.moduleLabel(cm.target.module),
        blueprintLabel: B ? ref.blueprintLabel(B) : cm.target.blueprint,
        experimentalLabel: cm.target.experimental ? ref.specialLabel(cm.target.experimental) : null,
        shipModel: plan.model || ref.shipName(plan.shipType),
        groupLabel: GROUP_LABELS[grp] || grp,
      };
      if (!B) {
        impossible.push({ id: key, planId: plan.id, slot: cm.slot, label: cm.label, reason: 'personne', grades: [], engineers: [], labels, text: 'modification inconnue pour ce module' });
        continue;
      }
      const target = { ...cm.target, blueprint: B };
      const steps = remainingSteps(target, cm.current);
      const G = steps.grades;
      if (!G.length && !steps.experimental) continue;
      const cur = cm.current;
      const sameModule = !!cur && lower(cur.module) === lower(target.module);
      const sameBp = sameModule && blueprintTail(cur.blueprint) === blueprintTail(B);
      const mod = { key, plan, cm, grp, B, G, steps, target, startUnits: qualityUnits(steps.startQuality), labels, warnings: [], region: null, trav: null, effect: null, sameBp };
      mods.push(mod);
      if (sameModule && cur.blueprint && !sameBp && (cur.grade > 0 || cur.experimental)) {
        mod.warnings.push({
          rule: 'R7',
          loses: cur.experimental ? 'grades et effet' : 'grades',
          current: {
            blueprint: ref.blueprintKey(cur.blueprint) || cur.blueprint,
            blueprintLabel: ref.blueprintLabel(ref.blueprintKey(cur.blueprint) || cur.blueprint),
            grade: cur.grade || 0,
            experimental: cur.experimental || null,
            experimentalLabel: cur.experimental ? cur.experimentalLabel || ref.specialLabel(cur.experimental) : null,
            engineerName: cur.engineer || null,
          },
        });
      }
      if (sameBp && cur.experimental && target.experimental && lower(cur.experimental) !== lower(target.experimental)) {
        mod.warnings.push({ rule: 'R7c', from: cur.experimental, fromLabel: cur.experimentalLabel || ref.specialLabel(cur.experimental), to: target.experimental, toLabel: ref.specialLabel(target.experimental) });
      }
      if (target.module && !sameModule) mod.warnings.push({ rule: 'newModule', module: target.module, moduleLabel: labels.moduleLabel });

      // Épingle (R3c, R3e) : chez un ingénieur débloqué, de rang connu, ni banni ni écarté, dans n'importe quelle région
      let pin = null;
      for (const e of [...E.values()].sort((a, b) => a.id - b.id)) {
        const p = input.pins?.get(e.id);
        if (!p) continue;
        if (p.grp !== grp && blueprintTail(p.blueprint) === blueprintTail(B) && G.length) {
          mod.warnings.push({ rule: 'R3f', engineer: e.id, pinGrp: p.grp, pinGroupLabel: GROUP_LABELS[p.grp] || p.grp });
          continue;
        }
        if (p.grp !== grp || p.blueprint !== B || !G.length) continue;
        if (e.progress !== 'Unlocked' || e.rank == null || !kept(e)) continue;
        const k = Math.min(e.rank, offers(e.id, grp, B));
        if (k < G[0]) continue;
        const remoteGrades = G.filter((g) => g <= k);
        const cost = m.extraRolls(e.simName, [{ key: `${key}@d`, blueprint: B, grades: remoteGrades, startUnits: mod.startUnits }], { fixedRank: true, rank: e.rank });
        const cand = { e: e.id, k, rank: e.rank, cost, source: p.source, at: p.at };
        if (!pin || k > pin.k || (k === pin.k && (cost < pin.cost - EPS || (Math.abs(cost - pin.cost) <= EPS && e.id < pin.e)))) pin = cand;
      }

      // Partage par région (R11)
      if (G.length) {
        const top = (list) => list.reduce((a, e) => Math.max(a, offers(e.id, grp, B)), 0);
        const topAll = top(hEng);
        const topKept = top(hEng.filter((e) => !e.excluded));
        const bannedHere = [...E.values()].filter((e) => e.region === H && e.banned && offers(e.id, grp, B) > topAll);
        let R = [];
        let remote = null;
        let hi = null;
        let Eg = [];
        let Tg = [];
        const maxG = G.at(-1);
        if (pin && pin.k >= maxG) {
          R = G.slice();
          remote = { ...pin, grades: G.slice(), covers: true };
        } else if (pin && pin.k >= topKept) {
          R = G.filter((g) => g <= pin.k);
          remote = { ...pin, grades: R.slice(), covers: true };
          const rest = G.filter((g) => g > pin.k);
          Eg = rest.filter((g) => g <= topAll);
          Tg = rest.filter((g) => g > topAll);
        } else {
          R = G.filter((g) => g <= topKept);
          Eg = G.filter((g) => g > topKept && g <= topAll);
          Tg = G.filter((g) => g > topAll);
          if (pin) {
            remote = { ...pin, grades: R.filter((g) => g <= pin.k), covers: false };
            hi = R.filter((g) => g > pin.k);
          }
        }
        if (R.length) {
          const maxR = R.at(-1);
          const unit = {
            id: `${key}:grades`, kind: 'grades', part: 'region', mod, grades: R,
            startUnits: R[0] === G[0] ? mod.startUnits : 0,
            cands: hEng.filter((e) => !e.excluded && offers(e.id, grp, B) >= maxR).map((e) => e.id).sort((a, b) => a - b),
            remote, hi: hi?.length ? hi : null,
          };
          mod.region = unit;
          regionUnits.push(unit);
        }
        if (Eg.length) {
          const who = [...E.values()].filter((e) => e.region === H && e.excluded && offers(e.id, grp, B) >= Eg[0]).map((e) => e.id);
          impossible.push({ id: `${key}:grades`, planId: plan.id, slot: cm.slot, label: cm.label, reason: 'ecarte', grades: Eg, engineers: who, labels, text: `Tu as écarté ${who.map((i) => E.get(i).name).join(', ')} : personne d’autre dans ${regionName(H)} ne fait « ${labels.blueprintLabel} » G${Eg.at(-1)} (${labels.moduleLabel}). Remets-${who.length > 1 ? 'les' : 'le'}, ou il faudra traverser.` });
        }
        if (Tg.length) {
          const maxT = Tg.at(-1);
          const tc = [...E.values()].filter((e) => e.region !== H && kept(e) && offers(e.id, grp, B) >= maxT).map((e) => e.id).sort((a, b) => a - b);
          if (tc.length) {
            const unit = { id: `${key}:traversee`, kind: 'grades', part: 'traversee', mod, grades: Tg, startUnits: Tg[0] === G[0] ? mod.startUnits : 0, cands: tc, remote: null, hi: null, topAll, banned: bannedHere.map((e) => e.id) };
            mod.trav = unit;
            travUnits.push(unit);
          } else {
            const ex = [...E.values()].filter((e) => e.region !== H && e.excluded && offers(e.id, grp, B) >= maxT).map((e) => e.id);
            impossible.push({ id: `${key}:traversee`, planId: plan.id, slot: cm.slot, label: cm.label, reason: ex.length ? 'ecarte' : 'personne', grades: Tg, engineers: ex, labels, text: ex.length ? `Tu as écarté ${ex.map((i) => E.get(i).name).join(', ')} : remets-le pour le G${maxT}.` : `Personne ne fait « ${labels.blueprintLabel} » G${maxT} (${labels.moduleLabel}).` });
          }
        }
        for (const e of [...E.values()].filter((x) => x.banned && offers(x.id, grp, B) >= 1)) {
          if (!bannedHere.includes(e)) bannedNotes.set(e.name, `${e.name} t’a banni : il ne compte pas dans le calcul.`);
        }
      }
      // Effet expérimental (R4a, R5)
      if (steps.experimental) {
        const ec = hEng.filter((e) => !e.excluded && offers(e.id, grp, B) >= 1).map((e) => e.id).sort((a, b) => a - b);
        if (ec.length) {
          mod.effect = { id: `${key}:effet`, kind: 'effet', part: 'region', mod, cands: ec };
          regionUnits.push(mod.effect);
        } else if (hEng.some((e) => e.excluded && offers(e.id, grp, B) >= 1)) {
          const who = hEng.filter((e) => e.excluded && offers(e.id, grp, B) >= 1).map((e) => e.id);
          impossible.push({ id: `${key}:effet`, planId: plan.id, slot: cm.slot, label: cm.label, reason: 'ecarte', grades: [], effect: true, engineers: who, labels, text: `Tu as écarté ${who.map((i) => E.get(i).name).join(', ')} : personne d’autre dans ${regionName(H)} ne pose l’effet « ${labels.experimentalLabel} » (${labels.moduleLabel}). Remets-${who.length > 1 ? 'les' : 'le'}, ou il faudra traverser.` });
        } else {
          const tc = [...E.values()].filter((e) => e.region !== H && kept(e) && offers(e.id, grp, B) >= 1).map((e) => e.id).sort((a, b) => a - b);
          if (tc.length) {
            mod.effect = { id: `${key}:effet`, kind: 'effet', part: 'traversee', mod, cands: tc };
            travUnits.push(mod.effect);
          } else impossible.push({ id: `${key}:effet`, planId: plan.id, slot: cm.slot, label: cm.label, reason: 'personne', grades: [], effect: true, engineers: [], labels, text: `Personne ne pose l’effet « ${labels.experimentalLabel} » sur ce module.` });
        }
      }
    }
  }
  for (const t of bannedNotes.values()) notes.push(t);

  // --- Problème de couverture d'une partie ---
  const makeProblem = (units, from, { forced = [] } = {}) => {
    const candIds = [...new Set(units.flatMap((u) => u.cands))].sort((a, b) => a - b);
    const all = new Set([...candIds, ...forced]);
    for (const id of [...all]) for (const x of chainOf(id).members) all.add(x);
    const ids = [...all].sort((a, b) => a - b);
    const pos = new Map(ids.map((id, i) => [id, i]));
    const points = ids.map((id) => ({ id, coords: E.get(id).coords, stopCost: E.get(id).stopCost }));
    const memberMask = new Map(ids.map((id) => [id, chainOf(id).members.reduce((mk, x) => mk | (1 << pos.get(x)), 0)]));
    const closureOf = (mask) => {
      let mk = mask;
      for (;;) {
        let next = mk;
        for (const i of bitsOf(mk)) next |= memberMask.get(ids[i]);
        if (next === mk) return mk;
        mk = next;
      }
    };
    const needStop = units.filter((u) => !(u.kind === 'grades' && u.remote?.covers));
    const classOf = (mask) => {
      const members = bitsOf(mask).map((i) => E.get(ids[i]));
      return [
        members.some((e) => e.region !== H) && units[0]?.part === 'region' ? 1 : 0,
        members.filter((e) => e.progress !== 'Unlocked').length,
        members.reduce((a, e) => a + (ownSteps(e, chainOf(e.id)) ?? 0), 0),
      ];
    };
    return {
      ids, pos, points, startPos: from,
      choosable: candIds.map((id) => pos.get(id)),
      units: needStop.map((u) => ({ cands: u.cands.map((id) => pos.get(id)) })),
      closureOf, classOf,
      forcedMask: forced.reduce((mk, id) => mk | (1 << pos.get(id)), 0),
    };
  };

  // Affectation des unités de grades dans un ensemble d'escales (§ 4.10.4)
  const climbersOf = (members) => {
    const set = new Set();
    for (const id of members) for (const p of chainOf(id).climbs) if (members.has(p)) set.add(p);
    return set;
  };
  const totalRolls = (gradeUnits, choice, climbers) => {
    const at = new Map();
    const remote = new Map();
    const push = (map, id, t) => {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(t);
    };
    for (const u of gradeUnits) {
      const o = choice.get(u.id);
      if (!o) continue;
      const B = u.mod.B;
      if (o.kind === 'stop') push(at, o.e, { key: u.id, blueprint: B, grades: u.grades, startUnits: u.startUnits });
      else if (o.kind === 'split') {
        push(remote, u.remote.e, { key: `${u.id}@d`, blueprint: B, grades: u.remote.grades, startUnits: u.startUnits });
        push(at, o.e, { key: u.id, blueprint: B, grades: u.hi, startUnits: 0 });
      } else if (o.kind === 'remote') push(remote, u.remote.e, { key: `${u.id}@d`, blueprint: B, grades: u.remote.grades, startUnits: u.startUnits });
    }
    let rolls = 0;
    const per = new Map();
    for (const id of new Set([...at.keys(), ...climbers])) {
      const tasks = (at.get(id) || []).sort((a, b) => (a.key < b.key ? -1 : 1));
      const e = E.get(id);
      const x = m.extraRolls(e.simName, tasks, climbers.has(id) ? goalOpts(id) : {});
      per.set(id, { tasks, extra: x });
      rolls += x;
    }
    const perRemote = new Map();
    for (const [id, tasks] of remote) {
      const e = E.get(id);
      const sorted = tasks.sort((a, b) => (a.key < b.key ? -1 : 1));
      const x = m.extraRolls(e.simName, sorted, { fixedRank: true, rank: e.rank });
      perRemote.set(id, { tasks: sorted, extra: x });
      rolls += x;
    }
    return { rolls, per, perRemote };
  };
  const optionsOf = (u, members) => {
    const atStop = u.cands.filter((id) => members.has(id));
    const pinHere = !!u.remote && atStop.includes(u.remote.e);
    const out = [];
    if (u.remote?.covers && !pinHere) out.push({ kind: 'remote' });
    if (u.remote && !u.remote.covers && u.hi && !pinHere) for (const e of atStop) out.push({ kind: 'split', e });
    for (const e of atStop) out.push({ kind: 'stop', e });
    return out;
  };
  const prefOf = (o) => [o.kind === 'remote' ? 0 : o.kind === 'split' ? 1 : 2, -(E.get(o.e)?.rank ?? (o.kind === 'remote' ? 6 : 0)), o.e ?? 0];
  const assign = (gradeUnits, members, climbers) => {
    const choice = new Map();
    const opts = new Map(gradeUnits.map((u) => [u.id, optionsOf(u, members)]));
    for (const u of gradeUnits) if (!opts.get(u.id).length) return null;
    // Départ : chaque unité, dans l'ordre, l'option au moindre coût marginal ; à égalité, la distance d'abord
    for (const u of gradeUnits) {
      let best = null;
      for (const o of opts.get(u.id)) {
        choice.set(u.id, o);
        const r = totalRolls(gradeUnits, choice, climbers).rolls;
        if (!best || r < best.r - EPS || (Math.abs(r - best.r) <= EPS && lexCmp(prefOf(o), prefOf(best.o)) < 0)) best = { o, r };
      }
      choice.set(u.id, best.o);
    }
    // Recherche locale : une unité à la fois, tant que le total baisse (au plus 20 passes)
    let cur = totalRolls(gradeUnits, choice, climbers);
    for (let pass = 0; pass < 20; pass++) {
      let move = null;
      for (const u of gradeUnits) {
        const was = choice.get(u.id);
        for (const o of opts.get(u.id)) {
          if (o === was) continue;
          choice.set(u.id, o);
          const r = totalRolls(gradeUnits, choice, climbers).rolls;
          if (r < cur.rolls - EPS && (!move || r < move.r - EPS)) move = { u, o, r };
        }
        choice.set(u.id, was);
      }
      if (!move) break;
      choice.set(move.u.id, move.o);
      cur = totalRolls(gradeUnits, choice, climbers);
    }
    return { choice, ...cur };
  };

  // Ordre des escales d'un ensemble : parties dans cet ordre (prêts de la région, à préparer, traversée, retour),
  // chaque parrain avant son filleul
  const orderOf = (problem, memberIds, hk, from) => {
    const { pos, points } = problem;
    const isTravPart = problem.part === 'traversee';
    const groups = { region: [], prep: [], trav: [], retour: [] };
    for (const id of memberIds) {
      const e = E.get(id);
      if (isTravPart) groups.trav.push(id);
      else if (e.region !== H) groups.trav.push(id);
      else if (e.ready) groups.region.push(id);
      else if (chainOf(id).reach === 'traversee') groups.retour.push(id);
      else groups.prep.push(id);
    }
    const before = [];
    for (const id of memberIds) {
      const c = chainOf(id);
      const p = c.discovery?.parent;
      if (p != null && c.climbs.includes(p) && memberIds.includes(p)) before.push([pos.get(p), pos.get(id)]);
    }
    const idxs = (list) => list.map((id) => pos.get(id));
    const rest = (fromCoords) => {
      let at = fromCoords;
      let len = 0;
      const out = {};
      for (const g of ['prep', 'trav', 'retour']) {
        const p = openPath(at, points, idxs(groups[g]), before);
        out[g] = p.order;
        len += p.length;
        if (p.order.length) at = points[p.order.at(-1)].coords;
      }
      return { len, out };
    };
    let best = null;
    const ready = idxs(groups.region);
    if (ready.length && hk) {
      const mask = ready.reduce((mk, i) => mk | (1 << i), 0);
      for (const a of ready.sort((x, y) => x - y)) {
        const base = hk.dp[mask * hk.K + a];
        const r = rest(points[a].coords);
        const total = base + r.len;
        if (!best || total < best.length - EPS) best = { length: total, region: hk.pathOf(mask, a).order, ...r.out };
      }
    } else {
      const p = openPath(from, points, ready, before);
      const r = rest(p.order.length ? points[p.order.at(-1)].coords : from);
      best = { length: p.length + r.len, region: p.order, ...r.out };
    }
    const toIds = (list) => list.map((i) => points[i].id);
    return { length: best.length, parts: { region: toIds(best.region), prep: toIds(best.prep), trav: toIds(best.trav), retour: toIds(best.retour) } };
  };

  // Vaisseau(x) d'une escale : ce que chaque plan y a à faire
  const vehicleOf = (stopTasks, e) => {
    const byPlan = new Map();
    for (const t of stopTasks) {
      const p = t.mod.plan;
      if (!byPlan.has(p.id)) byPlan.set(p.id, { planId: p.id, shipId: p.shipId ?? null, shipType: p.shipType, items: [] });
      const b = byPlan.get(p.id);
      let it = b.items.find((x) => x.slot === t.mod.cm.slot);
      if (!it) {
        it = { slot: t.mod.cm.slot, item: t.mod.target.module, size: ref.modules?.get(lower(t.mod.target.module))?.class ?? 0, steps: 0 };
        b.items.push(it);
      }
      it.steps += t.kind === 'effet' ? 1 : t.grades.length;
    }
    const res = chooseVehicle(ref, { bring: [...byPlan.values()] }, input.pilotedShipId ?? null);
    const extra = res.revisits.length * (RS.STOP_AL + RS.SUPERCRUISE_FACTOR * Math.sqrt(e.sl) + RS.SHIP_SWAP_AL);
    // Emplacement d'arrivée d'un module déplacé, en mots (« Interne, taille 5 ») pour l'interface
    const slotsV = res.vehicle && res.transfers.length ? ref.shipSlots(res.vehicle.shipType) || [] : [];
    const toLabel = (key) => {
      const s = slotsV.find((x) => x.key === key);
      return s ? `${s.label}${s.size ? `, taille ${s.size}` : ''}` : key;
    };
    return {
      ...res,
      transfers: res.transfers.map((t) => ({ ...t, toLabel: toLabel(t.to) })),
      bring: [...byPlan.values()].sort((a, b) => a.planId - b.planId).map((b) => ({ planId: b.planId, slots: b.items.map((x) => x.slot).sort() })),
      extraW: extra,
    };
  };

  // Évaluation complète d'un ensemble d'escales d'une partie
  const evaluator = (problem, units, from) => (mask, hk) => {
    const memberIds = bitsOf(mask).map((i) => problem.ids[i]);
    const members = new Set(memberIds);
    const climbers = problem.part === 'traversee' ? new Set() : climbersOf(members);
    const gradeUnits = units.filter((u) => u.kind === 'grades');
    const a = assign(gradeUnits, members, climbers);
    if (!a || !Number.isFinite(a.rolls)) return null;
    for (const u of units) if (u.kind === 'effet' && !u.cands.some((id) => members.has(id))) return null;
    const order = orderOf(problem, memberIds, hk, from);
    const seq = [...order.parts.region, ...order.parts.prep, ...order.parts.trav, ...order.parts.retour];
    const posInOrder = new Map(seq.map((id, k) => [id, k]));
    // Tâches par escale
    const tasksAt = new Map(seq.map((id) => [id, []]));
    for (const u of gradeUnits) {
      const o = a.choice.get(u.id);
      if (o.kind === 'stop' || o.kind === 'split') tasksAt.get(o.e).push({ kind: 'grades', unit: u, mod: u.mod, grades: o.kind === 'split' ? u.hi : u.grades });
    }
    // Effets (§ 4.10.6)
    const effects = new Map();
    for (const u of units.filter((x) => x.kind === 'effet')) {
      const mod = u.mod;
      const own = mod.region && u.part === 'region' ? a.choice.get(mod.region.id) : null;
      const travOwn = u.part === 'traversee' && mod.trav ? a.choice.get(mod.trav.id) : null;
      let host = null;
      let rule = 0;
      if (own && (own.kind === 'stop' || own.kind === 'split') && u.cands.includes(own.e)) {
        host = own.e;
        rule = own.kind === 'split' ? 3 : mod.trav ? 2 : 1;
      } else if (travOwn && travOwn.kind === 'stop' && u.cands.includes(travOwn.e)) {
        host = travOwn.e;
        rule = 5;
      }
      const afterRemote = own?.kind === 'remote';
      // Grade du module quand l'effet est posé : après les grades à distance, ou celui qu'il a déjà
      let gradeFinal = mod.sameBp ? mod.cm.current?.grade || 0 : 0;
      if (own?.kind === 'remote') gradeFinal = mod.region.remote.grades.at(-1);
      else if (own) gradeFinal = mod.region.grades.at(-1);
      if (host == null) {
        rule = 4;
        const hosts = u.cands.filter((id) => members.has(id));
        const scored = hosts.map((id) => {
          const plus = [...(tasksAt.get(id) || []), { kind: 'effet', mod }];
          const rev = vehicleOf(plus, E.get(id)).revisits.length - vehicleOf(tasksAt.get(id) || [], E.get(id)).revisits.length;
          return { id, key: [rev > 0 ? 1 : 0, offers(id, mod.grp, mod.B) >= gradeFinal ? 0 : 1, posInOrder.get(id), id] };
        }).sort((x, y) => lexCmp(x.key, y.key));
        host = scored[0]?.id ?? null;
      }
      if (host == null) return null;
      tasksAt.get(host).push({ kind: 'effet', unit: u, mod });
      effects.set(u.id, { host, rule, afterRemote, gradeFinal: rule === 4 ? gradeFinal : null });
    }
    // Vaisseaux et secondes visites
    let revisitW = 0;
    const vehicles = new Map();
    for (const id of seq) {
      const v = vehicleOf(tasksAt.get(id), E.get(id));
      vehicles.set(id, v);
      revisitW += v.extraW;
    }
    const stopsAl = seq.length * RS.STOP_AL;
    const supercruiseAl = seq.reduce((x, id) => x + RS.SUPERCRUISE_FACTOR * Math.sqrt(E.get(id).sl), 0);
    const w = order.length + stopsAl + supercruiseAl + RS.ROLL_AL * a.rolls + revisitW;
    return { w, pathAl: order.length, stopsAl, supercruiseAl, rolls: a.rolls, revisitW, order, assignment: a, effects, tasksAt, vehicles, climbers };
  };

  const solve = (units, from, part, opts = {}) => {
    const problem = makeProblem(units, from, opts);
    problem.part = part;
    problem.evaluate = evaluator(problem, units, from);
    const res = bestCover(problem, { exactMax: RS.EXACT_MAX_CANDIDATES, maxEvaluations: RS.MAX_EVALUATIONS });
    return { problem, res };
  };

  // --- Région, puis traversée ---
  let region = solve(regionUnits, startPos, 'region');
  const endOf = (sol, fallback) => {
    const ev = sol?.res.best?.ev;
    if (!ev) return fallback;
    const seq = [...ev.order.parts.region, ...ev.order.parts.prep];
    return seq.length ? E.get(seq.at(-1)).coords : fallback;
  };
  let trav = travUnits.length ? solve(travUnits, endOf(region, startPos), 'traversee') : null;
  // Un candidat de la traversée dont le parrain à faire monter est dans ta région : ce parrain rejoint ta région
  if (trav?.res.best) {
    const need = bitsOf(trav.res.best.mask).map((i) => trav.problem.ids[i]).flatMap((id) => chainOf(id).climbs).filter((p) => E.get(p).region === H);
    const have = new Set(region.res.best ? bitsOf(region.res.best.mask).map((i) => region.problem.ids[i]) : []);
    const missing = [...new Set(need)].filter((p) => !have.has(p));
    if (missing.length) {
      region = solve(regionUnits, startPos, 'region', { forced: missing });
      trav = solve(travUnits, endOf(region, startPos), 'traversee');
    }
  }

  // --- Assemblage ---
  const result = assemble({ input, ref, m, E, H, chainOf, climbBlueprintOf, goalOpts, offers, region, trav, impossible, notes, startPos, regionUnits, travUnits });
  result.from = { kind: start.kind, engineerId: start.engineerId ?? null, system: start.system, systemAddress: start.systemAddress ?? null, starPos: start.starPos, at: start.at ?? null, region: H, regionNote };
  return result;
}

/**
 * Module « synthétique » pour le calcul des matériaux d'une escale : seulement les grades faits ici (du premier au
 * dernier), et l'effet s'il est posé ici.
 */
function taskModule(mod, { grades = [], effect = false, gradeAtEffect = null }) {
  const t = mod.target;
  if (grades.length) {
    const first = grades[0];
    const current = first === mod.G[0] ? mod.cm.current : { module: t.module, blueprint: mod.B, grade: first - 1, quality: 1, experimental: null };
    return { slot: mod.key, label: mod.cm.label, grp: mod.grp, target: { ...t, grade: grades.at(-1), experimental: effect ? t.experimental : null }, current };
  }
  const g = gradeAtEffect || (mod.G.length ? mod.G.at(-1) : mod.cm.current?.grade || 1);
  return { slot: mod.key, label: mod.cm.label, grp: mod.grp, target: { ...t, grade: g }, current: { module: t.module, blueprint: mod.B, grade: g, quality: 1, experimental: null } };
}

function assemble(ctx) {
  const { input, ref, m, E, H, chainOf, climbBlueprintOf, goalOpts, offers, region, trav, impossible, notes, startPos } = ctx;
  const rbest = region.res.best;
  const tbest = trav?.res.best || null;
  if (ctx.regionUnits.length && !rbest) {
    for (const u of ctx.regionUnits) impossible.push({ id: u.id, planId: u.mod.plan.id, slot: u.mod.cm.slot, label: u.mod.cm.label, reason: 'personne', grades: u.grades || [], engineers: [], labels: u.mod.labels, text: 'aucune combinaison d’ingénieurs ne fait ce travail' });
  }
  const rev = rbest?.ev || null;
  const tev = tbest?.ev || null;
  // Parties et numérotation des escales
  const partsSeq = [];
  const add = (kind, ids, required, sourceEv, problem, exact) => {
    if (ids.length) partsSeq.push({ kind, ids, required, ev: sourceEv, problem, exact });
  };
  if (rev) {
    add('region', rev.order.parts.region, true, rev, region.problem, region.res.exact);
    add('a-preparer', rev.order.parts.prep, true, rev, region.problem, region.res.exact);
  }
  // Traversée : les escales des grades que personne ne fait ici, et les parrains hors de ta région, en un seul chemin
  const travIds = [...(rev?.order.parts.trav || []), ...(tev ? [...tev.order.parts.region, ...tev.order.parts.prep, ...tev.order.parts.trav, ...tev.order.parts.retour] : [])];
  const travRequired = !!rev?.order.parts.trav.length;
  let travOrder = travIds;
  const regionEnd = (() => {
    const seq = partsSeq.flatMap((p) => p.ids);
    return seq.length ? E.get(seq.at(-1)).coords : startPos;
  })();
  if (travIds.length > 1) {
    const pts = travIds.map((id) => ({ id, coords: E.get(id).coords }));
    const p = openPath(regionEnd, pts, pts.map((_, i) => i), []);
    travOrder = p.order.map((i) => pts[i].id);
  }
  if (travOrder.length) partsSeq.push({ kind: 'traversee', ids: travOrder, required: travRequired, ev: null, exact: (trav?.res.exact ?? true) && region.res.exact });
  if (rev?.order.parts.retour.length) {
    const from = travOrder.length ? E.get(travOrder.at(-1)).coords : regionEnd;
    const pts = rev.order.parts.retour.map((id) => ({ id, coords: E.get(id).coords }));
    const before = [];
    for (const id of rev.order.parts.retour) {
      const p = chainOf(id).discovery?.parent;
      const a = rev.order.parts.retour.indexOf(p);
      if (a >= 0) before.push([a, rev.order.parts.retour.indexOf(id)]);
    }
    const o = openPath(from, pts, pts.map((_, i) => i), before);
    partsSeq.push({ kind: 'retour', ids: o.order.map((i) => pts[i].id), required: true, ev: rev, exact: region.res.exact });
  }

  // Tâches par escale, toutes parties (la région, puis la traversée)
  const tasksAt = new Map();
  const effects = new Map();
  const choice = new Map();
  for (const ev of [rev, tev].filter(Boolean)) {
    for (const [id, list] of ev.tasksAt) tasksAt.set(id, [...(tasksAt.get(id) || []), ...list]);
    for (const [k, v] of ev.effects) effects.set(k, v);
    for (const [k, v] of ev.assignment.choice) choice.set(k, v);
  }
  const climbers = rev?.climbers || new Set();
  const seqAll = partsSeq.flatMap((p) => p.ids);
  const numberOf = new Map(seqAll.map((id, k) => [id, k + 1]));

  // Tâches à distance
  const remote = [];
  const unitsById = new Map([...ctx.regionUnits, ...ctx.travUnits].map((u) => [u.id, u]));
  for (const u of ctx.regionUnits.filter((x) => x.kind === 'grades')) {
    const o = choice.get(u.id);
    if (!o || (o.kind !== 'remote' && o.kind !== 'split')) continue;
    const e = E.get(u.remote.e);
    const tasks = [{ key: `${u.id}@d`, blueprint: u.mod.B, grades: u.remote.grades, startUnits: u.startUnits }];
    const sim = m.simulate(e.simName, tasks, { fixedRank: true, rank: e.rank });
    const rolls = sim.applications;
    const rollsBase = u.remote.grades.reduce((a, g, k) => a + rollsToFinish(5, g, k === 0 ? u.startUnits : 0), 0);
    const eff = u.mod.effect ? effects.get(u.mod.effect.id) : null;
    const continuesAt = o.kind === 'split' ? numberOf.get(o.e) ?? null : null;
    const before = continuesAt ?? (eff ? numberOf.get(eff.host) ?? null : null);
    const pinInfo = input.pins?.get(e.id);
    remote.push({
      id: u.id, planId: u.mod.plan.id, slot: u.mod.cm.slot, label: u.mod.cm.label, grp: u.mod.grp, blueprint: u.mod.B,
      engineer: e.id, pin: { source: pinInfo?.source ?? null, at: pinInfo?.at ?? null }, rank: e.rank,
      grades: u.remote.grades, startQuality: u.remote.grades[0] === u.mod.G[0] ? u.mod.steps.startQuality : 0,
      split: o.kind === 'split', upTo: u.remote.grades.at(-1), continuesAt,
      rolls, rollsBase, before,
      rules: ruleList(['R3c', 'R3d', ...(o.kind === 'split' ? ['R12b'] : [])]),
      warnings: u.mod.warnings,
      labels: { ...u.mod.labels, engineerName: e.name },
      _task: tasks[0],
      _mod: u.mod,
    });
  }

  // Escales
  const routeStop = (id, part) => {
    const e = E.get(id);
    const list = tasksAt.get(id) || [];
    const n = numberOf.get(id);
    const tasks = [];
    const simTasks = list.filter((t) => t.kind === 'grades').map((t) => ({ key: t.unit.id, blueprint: t.mod.B, grades: t.grades, startUnits: t.grades[0] === t.mod.G[0] ? t.mod.startUnits : 0 })).sort((a, b) => (a.key < b.key ? -1 : 1));
    const isClimber = climbers.has(id);
    const sim = m.simulate(e.simName, simTasks, isClimber ? goalOpts(id) : {});
    const extraRolls = sim.impossible ? null : sim.applications - simTasks.reduce((a, t) => a + t.grades.reduce((x, g, k) => x + rollsToFinish(5, g, k === 0 ? t.startUnits : 0), 0), 0);
    for (const t of list) {
      const mod = t.mod;
      if (t.kind === 'grades') {
        const per = sim.tasks.get(t.unit.id)?.per || [];
        const rolls = per.reduce((a, p) => a + p.rolls, 0);
        const st = t.grades[0] === mod.G[0] ? mod.startUnits : 0;
        const rules = [];
        if (t.unit.part === 'traversee' && mod.region) rules.push('R12');
        if (t.unit.part === 'traversee' && mod.effect && effects.get(mod.effect.id)?.host !== id) rules.push('R6b');
        const o = choice.get(t.unit.id);
        if (o?.kind === 'split') rules.push('R12b');
        tasks.push({
          id: t.unit.id, planId: mod.plan.id, slot: mod.cm.slot, label: mod.cm.label, grp: mod.grp, blueprint: mod.B, kind: 'grades',
          grades: t.grades, maxGrade: offers(id, mod.grp, mod.B), rolls, rollsBase: t.grades.reduce((a, g, k) => a + rollsToFinish(5, g, k === 0 ? st : 0), 0),
          ...(o?.kind === 'split' ? { afterRemote: { engineer: mod.region.remote.e, upTo: mod.region.remote.grades.at(-1) } } : {}),
          rules: ruleList(rules), warnings: mod.warnings, labels: mod.labels,
        });
      } else {
        const eff = effects.get(t.unit.id);
        const maxGrade = offers(id, mod.grp, mod.B);
        const rules = [];
        let fallback = null;
        let variant = null;
        if (eff.rule === 4 && eff.gradeFinal > maxGrade) {
          rules.push('R5b');
          // Repli : l'ingénieur de ta région le plus proche de cette escale qui propose ce plan jusqu'au grade final
          const f = [...E.values()].filter((x) => x.region === H && !x.banned && !x.excluded && x.id !== id && offers(x.id, mod.grp, mod.B) >= eff.gradeFinal)
            .map((x) => ({ x, d: distanceLy(e.coords, x.coords) })).sort((a, b) => a.d - b.d || a.x.id - b.x.id)[0];
          if (f) {
            const k = seqAll.indexOf(id);
            const nextId = seqAll[k + 1];
            const samePart = nextId != null && partsSeq.find((p) => p.ids.includes(id))?.ids.includes(nextId);
            const extraAl = samePart ? f.d + distanceLy(f.x.coords, E.get(nextId).coords) - distanceLy(e.coords, E.get(nextId).coords) : f.d;
            fallback = { engineer: f.x.id, extraAl: r2(extraAl) };
          }
        }
        if (eff.afterRemote) variant = { rules: ['R6c'] };
        // Rang de l'hôte quand il pose l'effet : après les grades faits à cette escale (montée comprise)
        const hostRank = sim.impossible ? (e.progress === 'Unlocked' ? e.rank : 1) : sim.rank;
        if (hostRank != null && hostRank < 5) rules.push('R5c');
        tasks.push({
          id: t.unit.id, planId: mod.plan.id, slot: mod.cm.slot, label: mod.cm.label, grp: mod.grp, blueprint: mod.B, kind: 'effet',
          experimental: mod.target.experimental, maxGrade, afterRemote: !!eff.afterRemote, gradeAtEffect: eff.gradeFinal ?? (mod.region ? mod.region.grades.at(-1) : null),
          rules: ruleList(rules), ...(fallback ? { fallback } : {}), ...(variant ? { variant } : {}), warnings: mod.warnings, labels: mod.labels,
        });
      }
    }
    // Référence : ce parrain doit monter pour faire connaître un filleul de l'itinéraire
    if (isClimber) {
      const climb = climbBlueprintOf(id);
      const forIds = seqAll.filter((c) => chainOf(c).discovery?.parent === id && chainOf(c).climbs.includes(id));
      const refExtras = sim.extras.filter((x) => x.kind === 'référence');
      for (const f of forIds) {
        tasks.push({
          id: `ref:${f}`, kind: 'reference', for: f, goal: { ...GOAL },
          from: { rank: e.progress === 'Unlocked' ? e.rank : 1, progress: e.progress === 'Unlocked' ? e.rankProgress?.min ?? 0 : 0 },
          climb: climb ? { grp: climb.grp, blueprint: climb.blueprint, blueprintLabel: ref.blueprintLabel(climb.blueprint), groupLabel: GROUP_LABELS[climb.grp] || climb.grp, rolls: refExtras.reduce((a, x) => a + x.count, 0), order: refExtras.map((x) => ({ rank: x.rank, grades: x.grades })) } : null,
          rules: ruleList(['R14']),
        });
      }
    }
    // Matériaux de l'escale (calculés plus bas, dans l'ordre du trajet)
    const v = rev?.vehicles?.get(id) || tev?.vehicles?.get(id) || { vehicle: null, transfers: [], revisits: [], bring: [] };
    const pinInfo = input.pins?.get(id) || null;
    const chain = chainOf(id);
    const unlock = e.progress === 'Unlocked' ? null : {
      progress: e.progress,
      totalSteps: chain.totalSteps,
      steps: unlockSteps(e, chain, { ref, inventory: input.inventory, cargo: input.cargo, balance: input.balance }, E).map((s) => (s.kind === 'decouverte' && s.parent ? { ...s, parent: { ...s.parent, stop: numberOf.get(s.parent.id) ?? null } } : s)),
    };
    const warnings = [];
    if ((v.bring || []).length > 1 || v.revisits?.length) warnings.push({ rule: 'R13' });
    if (v.revisits?.some((x) => x.why === 'masse')) warnings.push({ rule: 'R16b' });
    return {
      n, engineer: id, legAl: 0, cumulAl: 0, arrivalLs: e.sl,
      pin: pinInfo ? { grp: pinInfo.grp, blueprint: pinInfo.blueprint, source: pinInfo.source, at: pinInfo.at } : null,
      plans: [...new Set(list.map((t) => t.mod.plan.id))].sort((a, b) => a - b),
      bring: v.bring || [],
      vehicle: v.vehicle || null,
      transfers: v.transfers || [],
      revisits: (v.revisits || []).map((x) => ({ ...x, extraW: r2(RS.STOP_AL + RS.SUPERCRUISE_FACTOR * Math.sqrt(e.sl) + RS.SHIP_SWAP_AL) })),
      unlock,
      rank: {
        from: e.progress === 'Unlocked' ? e.rank : 1,
        to: sim.rank,
        order: sim.order,
        extraRolls,
        status: null,
      },
      tasks,
      materials: [],
      warnings,
      why: null,
      _sim: { simTasks, isClimber },
    };
  };

  const parts = partsSeq.map((p) => ({
    kind: p.kind,
    region: p.kind === 'traversee' ? otherRegion(H) : H,
    required: p.required,
    totalAl: 0,
    cost: null,
    order: { method: p.exact ? 'exact' : 'approche', stops: p.ids.length, candidates: p.kind === 'traversee' ? trav?.res.effort.candidates ?? p.ids.length : region.res.effort.candidates },
    stops: p.ids.map((id) => routeStop(id, p)),
  }));

  // Distances, étape par étape
  let at = startPos;
  let cumul = 0;
  for (const part of parts) {
    let pl = 0;
    for (const s of part.stops) {
      const c = E.get(s.engineer).coords;
      const leg = distanceLy(at, c);
      cumul += leg;
      pl += leg;
      s.legAl = r2(leg);
      s.cumulAl = r2(cumul);
      at = c;
    }
    const rolls = part.stops.reduce((a, s) => a + (s.rank.extraRolls || 0), 0);
    const supercruise = part.stops.reduce((a, s) => a + RS.SUPERCRUISE_FACTOR * Math.sqrt(E.get(s.engineer).sl), 0);
    const revisit = part.stops.reduce((a, s) => a + s.revisits.reduce((x, y) => x + y.extraW, 0), 0);
    part.totalAl = r2(pl);
    part.cost = { w: r2(pl + part.stops.length * RS.STOP_AL + supercruise + RS.ROLL_AL * rolls + revisit), pathAl: r2(pl), stopsAl: part.stops.length * RS.STOP_AL, supercruiseAl: r2(supercruise), rollsExtra: rolls, revisitAl: r2(revisit) };
  }
  // Les applications en plus des tâches à distance comptent dans la partie de ta région
  const remoteExtra = remote.reduce((a, t) => a + (t.rolls - t.rollsBase), 0);
  if (remoteExtra && parts[0]) {
    parts[0].cost.rollsExtra += remoteExtra;
    parts[0].cost.w = r2(parts[0].cost.w + RS.ROLL_AL * remoteExtra);
  }

  // Matériaux, dans l'ordre : tâches à distance « quand tu veux », puis chaque escale précédée de celles qui la précèdent
  const stock = new Map();
  const ownedOf = (key) => {
    if (!stock.has(key)) stock.set(key, input.inventory?.count(key) || 0);
    return stock.get(key);
  };
  const consume = (needs) => needs.map((x) => {
    const before = ownedOf(x.key);
    stock.set(x.key, Math.max(0, before - x.need));
    return { key: x.key, label: x.label, need: x.need, ownedBefore: before, missing: Math.max(0, x.need - before) };
  });
  const needsOf = (modules, forcedChoice) => {
    if (!modules.length) return [];
    const res = planNeeds(ref, { modules, inventory: input.inventory, engineers: input.engineers }, { choice: forcedChoice });
    return { list: res.materials.map((x) => ({ key: x.key, label: x.label, need: x.need })), engineers: res.engineers };
  };
  const remoteNeeds = (t) => {
    const e = E.get(t.engineer);
    const mod = t._mod;
    const synth = { slot: mod.key, label: mod.cm.label, grp: mod.grp, target: { ...mod.target, grade: t.grades.at(-1), experimental: null }, current: t.grades[0] === mod.G[0] ? { ...(mod.cm.current || {}), experimental: null } : { module: mod.target.module, blueprint: mod.B, grade: t.grades[0] - 1, quality: 1, experimental: null } };
    const r = needsOf([synth], new Map([[0, { remote: e.simName, rank: e.rank }]]));
    return r.list || [];
  };
  for (const t of remote.filter((x) => x.before == null)) t.materials = consume(remoteNeeds(t));
  for (const part of parts) {
    for (const s of part.stops) {
      for (const t of remote.filter((x) => x.before === s.n)) t.materials = consume(remoteNeeds(t));
      const e = E.get(s.engineer);
      const list = tasksAt.get(s.engineer) || [];
      const byMod = new Map();
      for (const t of list) {
        const b = byMod.get(t.mod.key) || { mod: t.mod, grades: [], effect: false, gradeAtEffect: null };
        if (t.kind === 'grades') b.grades = t.grades;
        else {
          b.effect = true;
          b.gradeAtEffect = effects.get(t.unit.id)?.gradeFinal ?? null;
        }
        byMod.set(t.mod.key, b);
      }
      const modules = [...byMod.values()].map((b) => taskModule(b.mod, b));
      const forcedChoice = new Map(modules.map((_, i) => [i, { engineer: e.simName }]));
      const r = needsOf(modules, forcedChoice);
      const needs = new Map((r.list || []).map((x) => [x.key, { ...x }]));
      // Montée de référence : les matériaux du module acheté exprès
      const climb = climbBlueprintOf(s.engineer);
      if (s._sim.isClimber && climb) {
        const sim = m.simulate(e.simName, s._sim.simTasks, goalOpts(s.engineer));
        for (const x of sim.extras.filter((y) => y.kind === 'référence')) {
          for (const y of x.grades) {
            for (const c of ref.gradeComponents(climb.blueprint, y.grade)) {
              const cur = needs.get(c.key) || { key: c.key, label: ref.materialLabel(c.key, input.inventory?.items?.get(c.key)?.label), need: 0 };
              cur.need += c.count * y.count;
              needs.set(c.key, cur);
            }
          }
        }
      }
      s.materials = consume([...needs.values()].sort((a, b) => a.key.localeCompare(b.key)));
      const row = r.engineers?.find((x) => x.name === e.simName && !x.remote);
      s.rank.status = row?.status ?? (s.tasks.some((t) => t.kind === 'grades' || t.kind === 'reference') ? null : STATUS.MEASURED);
      delete s._sim;
    }
  }
  for (const t of remote) {
    t.materials ??= [];
    delete t._task;
    delete t._mod;
  }

  // Une épingle aurait permis de faire à distance tout ou partie des grades d'une unité faite à cette escale : ce que
  // ça aurait coûté en applications de plus (sous le rang 5, les petits grades servent à la montée de l'hôte). Rien si
  // l'épingle est chez l'hôte lui-même, ou si la distance n'aurait rien coûté de plus.
  const pinSkippedOf = (hostId, u) => {
    const o = choice.get(u.id);
    if (!u.remote || o?.kind !== 'stop' || u.remote.e === hostId) return null;
    const host = E.get(hostId);
    const pe = E.get(u.remote.e);
    const byKey = (a, b) => (a.key < b.key ? -1 : 1);
    const here = (tasksAt.get(hostId) || []).filter((x) => x.kind === 'grades')
      .map((x) => ({ key: x.unit.id, blueprint: x.mod.B, grades: x.grades, startUnits: x.grades[0] === x.mod.G[0] ? x.mod.startUnits : 0 })).sort(byKey);
    const opts = climbers.has(hostId) ? goalOpts(hostId) : {};
    const alt = u.remote.covers ? here.filter((x) => x.key !== u.id) : here.map((x) => (x.key === u.id ? { ...x, grades: u.hi, startUnits: 0 } : x));
    const now = m.extraRolls(host.simName, here, opts);
    const remoteCost = m.extraRolls(pe.simName, [{ key: `${u.id}@d`, blueprint: u.mod.B, grades: u.remote.grades, startUnits: u.startUnits }], { fixedRank: true, rank: pe.rank });
    const delta = m.extraRolls(host.simName, alt, opts) + remoteCost - now;
    if (!Number.isFinite(delta) || delta <= EPS) return null;
    return { engineer: pe.id, from: u.remote.grades[0], upTo: u.remote.grades.at(-1), extraRolls: delta };
  };

  // Pourquoi lui ? (escales de ta région et à préparer)
  const whyFor = (s, sol) => {
    const best = sol.res.best;
    if (!best) return null;
    const problem = sol.problem;
    const sIdx = problem.pos.get(s.engineer);
    if (sIdx == null) return null;
    const evaluate = problem.evaluate;
    const W = best.ev.w;
    const pathNow = best.ev.pathAl;
    const units = [];
    const unitsHere = (tasksAt.get(s.engineer) || []).filter((t) => problem.ids.includes(s.engineer));
    const costOf = (X) => {
      const xIdx = problem.pos.get(X);
      if (xIdx == null) return null;
      const replaced = problem.closureOf((best.mask & ~(1 << sIdx)) | (1 << xIdx));
      const covers = problem.units.every((u) => u.cands.some((i) => replaced & (1 << i)));
      let mask = replaced;
      let how = 'remplacement';
      if (!covers) {
        mask = problem.closureOf(best.mask | (1 << xIdx));
        how = 'insertion';
      }
      const r = evaluate(mask, sol.res.hk);
      if (!r) return null;
      return { addedW: r2(r.w - W), addedAl: r2(r.pathAl - pathNow), how };
    };
    for (const t of unitsHere) {
      const mod = t.mod;
      const needed = t.kind === 'effet' ? 1 : t.grades.at(-1);
      const others = [];
      for (const X of [...E.values()].sort((a, b) => a.id - b.id)) {
        if (X.id === s.engineer) continue;
        const o = offers(X.id, mod.grp, mod.B);
        if (o < 1) continue;
        const base = { engineer: X.id, region: X.region, maxGrade: o, progress: X.progress, rank: X.rank };
        if (X.banned) {
          if (o >= needed) others.push({ ...base, verdict: 'banni' });
          continue;
        }
        if (X.excluded) {
          if (o >= needed) others.push({ ...base, verdict: 'ecarte' });
          continue;
        }
        if (X.region !== H) {
          if (o >= needed) others.push({ ...base, verdict: 'autre-region', fromYouAl: r2(distanceLy(startPos, X.coords)) });
          continue;
        }
        if (o < needed) {
          others.push({ ...base, verdict: 'grade-max' });
          continue;
        }
        const c = costOf(X.id);
        if (!c) continue;
        let verdict = 'plus-loin';
        const extra = { };
        if (bitsOf(best.mask).map((i) => problem.ids[i]).includes(X.id)) verdict = 'deja-escale';
        else if (X.progress !== 'Unlocked') {
          verdict = 'verrouille';
          extra.steps = chainOf(X.id).totalSteps;
          extra.crossing = chainOf(X.id).reach === 'traversee';
        } else if (X.permitNeeded) verdict = 'permis';
        else if (t.kind === 'grades') {
          const x = m.extraRolls(X.simName, [{ key: t.unit.id, blueprint: mod.B, grades: t.grades, startUnits: 0 }]);
          if (x > 0) {
            verdict = 'rang';
            extra.extraRolls = x;
          }
        }
        others.push({ ...base, verdict, ...extra, ...c });
      }
      // Sélection (au plus WHY_MAX_OPTIONS) : la meilleure de ta région avec un coût, la plus proche de l'autre région,
      // puis les autres avec un coût, puis les sans-coût
      const withCost = others.filter((x) => x.addedW != null).sort((a, b) => a.addedW - b.addedW || a.engineer - b.engineer);
      const otherReg = others.filter((x) => x.verdict === 'autre-region').sort((a, b) => a.fromYouAl - b.fromYouAl || a.engineer - b.engineer);
      const noCost = [
        ...others.filter((x) => x.verdict === 'grade-max').sort((a, b) => b.maxGrade - a.maxGrade || a.engineer - b.engineer),
        ...others.filter((x) => x.verdict === 'ecarte'),
        ...others.filter((x) => x.verdict === 'banni'),
        ...otherReg.slice(1),
      ];
      const chosen = [];
      const pick = (x) => {
        if (x && !chosen.includes(x) && chosen.length < RS.WHY_MAX_OPTIONS) chosen.push(x);
      };
      pick(withCost[0]);
      pick(otherReg[0]);
      for (const x of withCost.slice(1)) pick(x);
      for (const x of noCost) pick(x);
      const rank = (x) => (x.addedW != null ? 0 : x.verdict === 'autre-region' ? 1 : x.verdict === 'grade-max' ? 2 : x.verdict === 'ecarte' ? 3 : 4);
      chosen.sort((a, b) => rank(a) - rank(b) || (a.addedW ?? 0) - (b.addedW ?? 0) || (rank(a) === 1 ? a.fromYouAl - b.fromYouAl : 0) || (rank(a) === 2 ? b.maxGrade - a.maxGrade : 0) || a.engineer - b.engineer);
      const pinSkipped = t.kind === 'grades' ? pinSkippedOf(s.engineer, t.unit) : null;
      units.push({ id: t.unit.id, kind: t.kind, others: chosen, more: others.length - chosen.length, ...(pinSkipped ? { pinSkipped } : {}) });
    }
    // Sans lui
    const wb = sol.res.withoutBest.get(sIdx);
    let without;
    if (!wb) {
      const unitIds = unitsHere.map((t) => t.unit.id);
      const crossing = unitIds.some((uid) => {
        const u = unitsById.get(uid);
        return u && [...E.values()].some((X) => X.region !== H && !X.banned && !X.excluded && offers(X.id, u.mod.grp, u.mod.B) >= (u.kind === 'effet' ? 1 : u.grades.at(-1)));
      });
      without = { feasible: false, crossing };
    } else {
      const bestIds = new Set(bitsOf(best.mask).map((i) => problem.ids[i]));
      const wIds = bitsOf(wb.mask).map((i) => problem.ids[i]);
      without = {
        feasible: true,
        crossing: wb.cls[0] > best.cls[0],
        dUnlocks: wb.cls[1] - best.cls[1],
        dSteps: wb.cls[2] - best.cls[2],
        dW: r2(wb.ev.w - W),
        dPathAl: r2(wb.ev.pathAl - pathNow),
        dStops: popcount(wb.mask) - popcount(best.mask),
        dSupercruiseAl: r2(wb.ev.supercruiseAl - best.ev.supercruiseAl),
        dRolls: wb.ev.rolls - best.ev.rolls,
        replacedBy: wIds.filter((id) => !bestIds.has(id)).sort((a, b) => a - b),
      };
    }
    return { units, without };
  };
  const memberOf = (sol, id) => !!sol?.res.best && bitsOf(sol.res.best.mask).some((i) => sol.problem.ids[i] === id);
  for (const part of parts) {
    for (const s of part.stops) {
      const sol = memberOf(region, s.engineer) ? region : memberOf(trav, s.engineer) ? trav : null;
      s.why = sol ? whyFor(s, sol) : null;
    }
  }

  // Notes de la région (§ 4.10.9)
  const travStops = parts.filter((p) => p.kind === 'traversee').flatMap((p) => p.stops);
  for (const u of ctx.travUnits.filter((x) => x.kind === 'grades')) {
    const host = [...tasksAt].find(([, list]) => list.some((t) => t.unit === u))?.[0];
    const mod = u.mod;
    const d = host != null ? distanceLy(startPos, E.get(host).coords) : null;
    const banned = (u.banned || []).map((id) => E.get(id).name);
    const gradesText = u.grades.length === 1 ? `le G${u.grades[0]}` : u.grades.length === 2 ? `les G${u.grades[0]} et G${u.grades[1]}` : `les G${u.grades[0]} à G${u.grades.at(-1)}`;
    const tail = `Pour ${gradesText}, il faut aller ${toRegion(otherRegion(H))}${d != null ? ` (${fmtAl(d)} al)` : ''}. N’y va que si tu le veux.`;
    notes.push(banned.length
      ? `${banned.join(', ')} t’a banni : personne d’autre dans ${regionName(H)} ne monte « ${mod.labels.blueprintLabel} » (${mod.labels.moduleLabel}) au-delà du G${u.topAll}. ${tail}`
      : `Personne dans ${regionName(H)} ne monte « ${mod.labels.blueprintLabel} » (${mod.labels.moduleLabel}) au-delà du G${u.topAll}. ${tail}`);
  }
  for (const s of travStops) {
    const e = E.get(s.engineer);
    const fors = s.tasks.filter((t) => t.kind === 'reference');
    for (const t of fors) {
      const f = E.get(t.for);
      notes.push(`Pour connaître ${f.name}, il faut d’abord ${que(e.name)}, ${toRegion(e.region)} (${fmtAl(distanceLy(startPos, e.coords))} al), soit au rang 3 et à la moitié de la barre vers le rang 4. Cette traversée est nécessaire pour la suite.`);
      // Puisque tu y vas : qui ferait le travail de ce filleul dans l'autre région
      for (const ft of (tasksAt.get(f.id) || []).filter((x) => x.kind === 'grades' || x.kind === 'effet')) {
        const mod = ft.mod;
        const g = ft.kind === 'grades' ? ft.grades.at(-1) : 1;
        const X = [...E.values()].filter((x) => x.region === e.region && x.id !== e.id && !x.banned && !x.excluded && offers(x.id, mod.grp, mod.B) >= g)
          .sort((a, b) => Number(b.progress === 'Unlocked') - Number(a.progress === 'Unlocked') || distanceLy(e.coords, a.coords) - distanceLy(e.coords, b.coords) || a.id - b.id)[0];
        if (X && ft.kind === 'grades') notes.push(`Puisque tu iras ${toRegion(e.region)} pour la référence ${de(e.name)} : ${X.name} y fait aussi « ${mod.labels.blueprintLabel} » G${g}, à ${fmtAl(distanceLy(e.coords, X.coords))} al ${de(e.name)}. Je garde ${f.name}, de ta région (règle de l’app : jamais de traversée pour ce qu’un ingénieur de ta région peut faire).`);
      }
    }
  }

  // En débloquant… (meilleure solution sans tenir compte des déblocages, si elle est moins chère)
  let ifUnlocked = null;
  const bi = region.res.bestIgnoringUnlocks;
  if (bi && rbest && bi.cls[1] > rbest.cls[1] && bi.ev.w < rbest.ev.w - EPS) {
    const ids = bitsOf(bi.mask).map((i) => region.problem.ids[i]).filter((id) => E.get(id).progress !== 'Unlocked');
    ifUnlocked = { engineers: ids, gainW: r2(rbest.ev.w - bi.ev.w), steps: ids.reduce((a, id) => a + chainOf(id).totalSteps, 0) };
  }

  return {
    computedAt: input.now,
    positionAtCompute: input.positionAtCompute ?? null,
    plans: input.plans.map((p) => ({ id: p.id, name: p.name, fingerprint: p.fingerprint, shipId: p.shipId ?? null, shipType: p.shipType, model: p.model || ref.shipName(p.shipType) })),
    options: { exclude: [...(input.exclude || [])].sort((a, b) => a - b) },
    inputs: {
      pins: Object.fromEntries([...(input.pins || new Map())].sort((a, b) => a[0] - b[0]).map(([id, p]) => [String(id), { grp: p.grp, blueprint: p.blueprint, source: p.source, at: p.at }])),
      engineers: Object.fromEntries([...E.values()].map((e) => [String(e.id), { progress: e.progress, rank: e.rank }])),
    },
    exact: region.res.exact && (trav?.res.exact ?? true),
    effort: { candidates: region.res.effort.candidates + (trav?.res.effort.candidates || 0), evaluated: region.res.effort.evaluated + (trav?.res.effort.evaluated || 0) },
    remote,
    parts,
    totalAl: parts.length ? parts.at(-1).stops.at(-1).cumulAl : 0,
    impossible,
    ifUnlocked,
    notes: [...new Set(notes)],
  };
}
