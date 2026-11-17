// Calcul des matériaux nécessaires pour un plan d'ingénierie.
//
// Règles (table et sources : rankRules.js) :
// - Depuis la mise à jour 18.08 (7 août 2024), les applications sont fixes. Pour finir un grade il faut
//   grade + 5 − rang applications : au rang 5, 1 en G1… 5 en G5 ; au rang 3, 3 en G1, 4 en G2, 5 en G3 (mesuré).
// - Le grade suivant ne s'applique qu'une fois le grade en cours à 100 % : un grade commencé (qualité entre 0 et
//   100 %) est fini d'abord. Une qualité de 0 sur un grade déjà posé (ingénierie ancienne) compte comme finie.
// - Chaque application à l'atelier fait progresser le rang de l'ingénieur ; au-dessus de son rang, il faut d'abord
//   le monter. Les applications du plan chez un même ingénieur comptent pour sa montée (partagée entre tous les
//   modules faits chez lui, y compris un module visé sous son rang, fait alors avant la montée quand c'est moins cher
//   en tout) ; seul le manque s'ajoute.
// - Ce manque, en scénario prudent : une montée sur un module NEUF de la même modification (G1, puis G2… jusqu'au
//   grade du rang, chaque grade fini avant le suivant, mesuré), car refaire un grade déjà fini est inconnu. En
//   scénario favorable seulement : en refaisant le grade du rang (si c'est possible : inconnu).
// - Un ingénieur pas encore débloqué est compté comme après son déblocage : rang 1 (mesuré 3 fois sur 3), 0 % (à
//   vérifier : le déblocage n'écrit pas de progression). Le module reste signalé bloqué.
// - Progression de rang par application : déduite des mesures (rankModel.js, à vérifier). Scénario prudent pour les
//   totaux : la montée n'est comptée que quand aucun modèle compatible avec les séquences des journaux ne permet plus
//   de rester sous le seuil (pire cas du modèle, rankRules.prudentModel), sans report du surplus ; scénario favorable
//   (gain le plus haut de la table, report au plus) pour la fourchette affichée.
// - Seul ce qui manque est compté. Changer de module ou de modification repart de G1 (l'ingénierie existante est
//   perdue, effet expérimental compris).

import { blueprintTail } from '../../../core/reference/refdata.js';
import { rollsFor, rankGain, rankReached, carryOver, rankRow, rowStatus, rowReasons, weakest, prudentModel, RANK_RULES, STATUS, JOURNAUX } from './rankRules.js';

/** Applications par grade au rang 5 (règle de 18.08), tirées de la table. */
export const ROLLS_AT_RANK5 = Object.freeze(Object.fromEntries([1, 2, 3, 4, 5].map((g) => [g, rollsFor(5, g)])));

const lower = (s) => (s ? String(s).toLowerCase() : null);
const UNITS = 60; // qualité en soixantièmes : les pas 1/1 à 1/5 tombent juste
const FULL = 0.99; // qualité vue comme complète (un passage au grade suivant mesuré à 99 %)
const MAX_STEPS = 20000;

/** Qualité du journal (0 à 1) → soixantièmes ; complète au-delà de 99 %. */
export function qualityUnits(q) {
  const n = Number(q) || 0;
  if (n >= FULL) return UNITS;
  return Math.max(0, Math.min(UNITS - 1, Math.round(n * UNITS)));
}

const stepUnits = (rank, grade) => UNITS / rollsFor(rank, grade);

/** Applications pour finir un grade à un rang donné, depuis une qualité (soixantièmes). */
export function rollsToFinish(rank, grade, fromUnits = 0) {
  return Math.max(0, Math.ceil((UNITS - fromUnits) / stepUnits(rank, grade) - 1e-9));
}

/**
 * Étapes restantes pour un module.
 * @param {object} target { module, blueprint, grade, experimental }
 * @param {object|null} current { module, blueprint, grade, quality, experimental }
 * @returns {{ grades: number[], startQuality: number, experimental: boolean, done: boolean }}
 *   startQuality : qualité déjà acquise sur le premier grade de la liste (grade en cours), 0 sinon
 */
export function remainingSteps(target, current) {
  // Pas de modification visée : rien à faire (un effet expérimental exige une modification)
  if (!target?.blueprint || !target.grade) return { grades: [], startQuality: 0, experimental: false, done: true };
  const sameModule = current && lower(current.module) === lower(target.module);
  const sameBlueprint = sameModule && blueprintTail(current.blueprint) === blueprintTail(target.blueprint);
  let from = sameBlueprint ? (current.grade || 0) + 1 : 1;
  let startQuality = 0;
  const q = sameBlueprint ? Number(current.quality) || 0 : 0;
  // Grade commencé mais pas fini : il faut le finir avant le suivant (ou pour l'atteindre s'il est visé)
  if (sameBlueprint && current.grade >= 1 && q > 0 && q < FULL && current.grade <= target.grade) {
    from = current.grade;
    startQuality = q;
  }
  const grades = [];
  for (let g = from; g <= target.grade; g++) grades.push(g);
  const expKept = sameBlueprint && lower(current.experimental) === lower(target.experimental);
  const experimental = !!target.experimental && !expKept;
  return { grades, startQuality, experimental, done: grades.length === 0 && !experimental };
}

/**
 * Besoins en matériaux d'un module au rang 5 (base, sans les rangs).
 * @returns {{ materials: Map<string, number>, rolls: number, steps: object[], done: boolean }}
 */
export function moduleNeeds(ref, target, current, grp) {
  const steps = remainingSteps(target, current);
  const materials = new Map();
  const add = (key, n) => materials.set(key, (materials.get(key) || 0) + n);
  const detail = [];
  let rolls = 0;
  steps.grades.forEach((g, i) => {
    const r = rollsToFinish(5, g, i === 0 ? qualityUnits(steps.startQuality) : 0);
    rolls += r;
    for (const c of ref.gradeComponents(target.blueprint, g)) add(c.key, c.count * r);
    detail.push({ grade: g, rolls: r, engineers: ref.engineersFor(grp, target.blueprint, g) });
  });
  if (steps.experimental) {
    for (const c of ref.specialComponents(target.experimental)) add(c.key, c.count);
    detail.push({ experimental: target.experimental, rolls: 1, engineers: ref.engineersFor(grp, target.blueprint, 1) });
  }
  return { materials, rolls, steps: detail, done: steps.done };
}

/**
 * Statut des ingénieurs pour une étape : qui peut le faire, débloqué ou non, au bon rang.
 * Le nombre d'applications n'est garanti qu'au rang 5.
 */
export function engineerStatus(names, grade, engineers) {
  const list = names.map((n) => {
    const e = engineers.get(n);
    const unlocked = e?.progress === 'Unlocked';
    return { name: n, unlocked, rank: e?.rank ?? null, ok: unlocked && (e?.rank ?? 0) >= grade };
  });
  const best = list.filter((x) => x.ok).sort((a, b) => (b.rank || 0) - (a.rank || 0))[0] || null;
  return { list, best, available: !!best, estimate: !best || (best.rank ?? 0) < 5 };
}

/**
 * Simule le travail chez un ingénieur : ses modules du plan (tâches), dans l'ordre le moins coûteux, avec sa montée
 * de rang. Ordre retenu : un grade à un rang plus haut coûte moins d'applications, donc on monte d'abord le rang avec
 * les applications du plan au grade maximal du rang (module « moteur » : celui qui vise le plus haut, puis le plus
 * avancé), et on garde le reste pour quand le rang est le plus haut. Si le plan ne suffit pas pour la montée, seul le
 * manque s'ajoute (applications en plus), avec la modification d'un module qui vise plus haut que le rang :
 *   - prudent : sur un autre module de ce type, NEUF : G1, puis G2… jusqu'au grade du rang, chaque grade fini avant
 *     le suivant (mesuré) ; ce module « de montée » est repris au rang suivant s'il en faut encore (ses grades déjà
 *     faits restent) ; refaire un grade déjà fini est inconnu, jamais supposé ;
 *   - favorable : le moins cher de ce chemin et du grade du rang refait (si c'est possible : inconnu).
 * Parmi les modules qui visent plus haut, la modification retenue est la moins chère (unitCost).
 * Un module du plan qui vise SOUS le rang compte aussi pour la montée s'il est fait tout de suite, à ce rang, avant
 * le manque : il coûte alors plus d'applications qu'au rang final, mais chacune fait monter le rang et remplace une
 * application en plus sur le module de montée. Les deux ordres (le garder pour le rang final, ou le faire d'abord)
 * sont simulés jusqu'au bout, à chaque rang où la question se pose ; le moins cher en matériaux est retenu (à coût
 * égal, le moins d'applications, puis le garder pour le rang final). Exemple : rang 3 à 60 %, un module en G3 visé G5
 * et des propulseurs neufs visés G2 : les propulseurs faits au rang 3 (3 G1 + 4 G2) amènent le rang à 99,8 % au
 * moins, et il ne manque qu'1 G1 en plus, au lieu de 7 ou 8 applications en plus et des propulseurs faits au rang 5.
 *
 * Montée de rang : progression P au gain de la table (le plus bas en prudent, le plus haut en favorable) ; en prudent,
 * la montée vient aussi dès que le pire cas du modèle (model.canStayBelow : départ du rang et applications faites à ce
 * rang) ne permet plus de rester sous le seuil, c'est-à-dire au plus tard quand tous les modèles compatibles avec les
 * journaux montent. Départ déjà au-delà de ce pire cas sans montée écrite (le modèle est contredit à ce rang) : la
 * table seule, jusqu'à la montée suivante.
 *
 * @param {{ rank: number, progress: number, from?: number, counts?: number[] }} start rang actuel et progression (%
 *   du rang) ; pour le modèle : départ sûr à ce rang (from, % du relevé ; 0 après une montée) et applications à
 *   l'atelier faites depuis, par grade (counts[g]) ; sans eux, from = progress
 * @param {{ key, blueprint, grades: number[], startUnits: number }[]} tasks grades contigus à faire, par module
 * @param {'prudent'|'favorable'} scenario
 * @param {object} [opts]
 * @param {(blueprint: string, grade: number) => number} [opts.unitCost] matériaux d'une application
 * @param {object|null} [opts.model] pire cas du modèle (prudent ; null : la table seule)
 * @param {(rank: number, grade: number) => number} [opts.gainOf] gain d'une application imposé (% du rang), à la place
 *   de la table (vérifier si une valeur inconnue change un compte)
 * @param {boolean} [opts.fixedRank] atelier à distance (R3c, R4b) : le rang ne bouge pas, pas de module de montée ;
 *   applications = rollsToFinish(rang, grade) ; un grade au-dessus du rang : impossible
 * @param {{ rank: number, progress: number }|null} [opts.goal] montée de référence (R14) : après les tâches, des
 *   applications en plus (kind « référence ») sur un module neuf de climbBlueprint, G1, puis G2… jusqu'au grade du rang,
 *   chaque grade fini avant le suivant, jusqu'à un rang au-dessus de goal.rank, ou goal.rank avec au moins
 *   goal.progress % (gain le plus bas de la table en prudent ; le pire cas du modèle ne sert qu'au seuil du rang)
 * @param {string|null} [opts.climbBlueprint] modification du module de montée de référence
 * @returns {{ tasks: Map, extras: object[], ups: object[], order: object[], rank: number, impossible: boolean,
 *   cost: number, applications: number }}
 *   tasks : clé → { per: [{ grade, rolls, ranks, byRank: [{ rank, rolls }] }], done, early }
 *   (early : rang où ce module, visé sous ce rang, est fait avant la montée parce qu'il compte pour elle ; null sinon)
 *   extras : { rank, grades: [{ grade, count }], count, kind: 'module neuf'|'grade refait', spare, task, blueprint }
 *   (spare : numéro du module de montée, le même d'un rang à l'autre)
 *   cost : matériaux de toutes les applications (unitCost), montée comprise ; applications : leur nombre
 */
export function simulateEngineer(start, tasks, scenario = 'prudent', { unitCost = () => 1, model = prudentModel(), gainOf = null, fixedRank = false, goal = null, climbBlueprint = null } = {}) {
  if (fixedRank) return simulateFixed(start, tasks, unitCost);
  const opts = { unitCost, model, gainOf, goal, climbBlueprint };
  const runs = new Map();
  const runOf = (early) => {
    const key = [...early].sort().join(',');
    if (!runs.has(key)) runs.set(key, simulateOnce(start, tasks, scenario, opts, early));
    return runs.get(key);
  };
  // Chaque rang où un module visé sous le rang attend pendant qu'il manque des applications pour monter : deux
  // suites (le garder pour le rang final, le faire d'abord), simulées jusqu'au bout ; 4 rangs au plus, donc 16 suites
  let best = null;
  const consider = (run) => {
    const better = !best || run.cost < best.cost - 1e-9 || (Math.abs(run.cost - best.cost) <= 1e-9 && run.applications < best.applications);
    if (better) best = run;
  };
  const explore = (early, after) => {
    const run = runOf(early);
    const next = run.choices.find((rk) => rk > after);
    if (next == null) return consider(run);
    explore(early, next);
    explore(new Set([...early, next]), next);
    return null;
  };
  explore(new Set(), 0);
  const { choices, ...out } = best;
  return out;
}

/** Une suite de la simulation : early, les rangs où les modules visés sous le rang sont faits avant le manque. */
/**
 * Atelier à distance : rang fixe (R3c, R4b), aucune montée. Chaque grade se finit en rollsToFinish(rang, grade)
 * applications ; un grade au-dessus du rang est impossible.
 */
function simulateFixed(start, tasks, unitCost) {
  const r = Math.max(1, Math.min(5, start.rank || 1));
  let impossible = false;
  let cost = 0;
  let applications = 0;
  const order = [];
  const out = new Map();
  for (const t of tasks) {
    const per = [];
    let ok = true;
    t.grades.forEach((g, k) => {
      if (g > r) {
        ok = false;
        return;
      }
      const n = rollsToFinish(r, g, k === 0 ? t.startUnits || 0 : 0);
      per.push({ grade: g, rolls: n, ranks: [r], byRank: [{ rank: r, rolls: n }] });
      cost += n * unitCost(t.blueprint, g);
      applications += n;
      order.push({ task: t.key, grade: g, rank: r, count: n });
    });
    if (!ok) impossible = true;
    out.set(t.key, { per, done: ok, early: null });
  }
  return { tasks: out, extras: [], ups: [], order, rank: r, impossible, cost: cost + (impossible ? 1e6 : 0), applications };
}

function simulateOnce(start, tasks, scenario, { unitCost, model, gainOf, goal = null, climbBlueprint = null }, early) {
  let r = Math.max(1, Math.min(5, start.rank || 1));
  let P = r >= 5 ? 0 : Math.max(0, Number(start.progress) || 0);
  const gain = (rk, g) => (gainOf ? gainOf(rk, g) : rankGain(rk, g, scenario));
  // Pire cas du modèle (prudent) : départ sûr du rang en cours et applications à l'atelier faites à ce rang
  const useModel = scenario === 'prudent' && !!model?.feasible;
  let base = Math.max(0, Number(start.from ?? start.progress) || 0);
  let counts = [0, 0, 0, 0, 0, 0];
  for (let g = 1; g <= 5; g++) counts[g] = Math.max(0, Number(start.counts?.[g]) || 0);
  let modelOn = useModel && r < 5 && model.canStayBelow(r, base, counts);
  const reached = (p, cnt) => rankReached(p, scenario) || (modelOn && !model.canStayBelow(r, base, cnt));
  const st = tasks.map((t, i) => ({
    i,
    key: t.key,
    blueprint: t.blueprint,
    T: t.grades.at(-1),
    g: t.grades[0],
    q: t.startUnits || 0,
    done: !t.grades.length,
    per: new Map(),
    early: null,
  }));
  const extras = [];
  const choices = []; // rangs où un module visé sous le rang attend alors qu'il manque des applications pour monter
  let cost = 0;
  let applications = 0;
  const ups = [];
  const order = [];
  let impossible = false;
  const note = (entry) => {
    const last = order.at(-1);
    if (entry.task != null && last?.task === entry.task && last.grade === entry.grade && last.rank === entry.rank) last.count++;
    else order.push({ ...entry, count: 1 });
  };
  const climbed = (over, info) => {
    ups.push({ from: r, to: r + 1, ...info });
    order.push({ up: { from: r, to: r + 1 } });
    P = r + 1 >= 5 ? 0 : carryOver(over, r, scenario);
    r += 1;
    // Rang suivant : départ au report compté (prudent : 0), aucune application encore
    base = P;
    counts = [0, 0, 0, 0, 0, 0];
    modelOn = useModel && r < 5;
  };
  const apply = (t) => {
    const g = t.g;
    const at = r;
    // byRank : applications de ce grade rang par rang, dans l'ordre (un grade peut être mis en pause pendant qu'un
    // autre module fait monter le rang : ses applications suivantes se font au nouveau rang)
    const rec = t.per.get(g) || { grade: g, rolls: 0, ranks: [], byRank: [] };
    rec.rolls++;
    if (!rec.ranks.includes(at)) rec.ranks.push(at);
    if (rec.byRank.at(-1)?.rank === at) rec.byRank.at(-1).rolls++;
    else rec.byRank.push({ rank: at, rolls: 1 });
    t.per.set(g, rec);
    note({ task: t.key, grade: g, rank: at });
    cost += unitCost(t.blueprint, g);
    applications++;
    t.q = Math.min(UNITS, t.q + stepUnits(at, g));
    if (t.q >= UNITS - 1e-9) {
      if (g < t.T) {
        t.g = g + 1;
        t.q = 0;
      } else t.done = true;
    }
    if (at < 5) {
      P += gain(at, g);
      counts[g]++;
      if (reached(P, counts)) climbed(P - 100, { task: t.key, grade: g });
    }
  };
  const finishAll = () => {
    for (const t of st) {
      let guard = 0;
      while (!t.done && t.g <= r && guard++ < MAX_STEPS) apply(t);
    }
  };
  // Modules de montée : neufs, de la modification d'un module qui vise plus haut ; repris d'un rang à l'autre
  const spares = [];
  // Applications sur un module de montée depuis son état (grade g, qualité q) jusqu'à la montée, à partir de la
  // progression en cours (P, et comptes du rang pour le modèle) ; un module neuf de plus si celui-ci arrive au bout du
  // grade du rang sans montée (restart)
  const climbOn = (rank, g0, q0, restart) => {
    let p = P;
    const cnt = counts.slice();
    let g = g0;
    let q = q0;
    const per = new Map();
    let n = 0;
    while (!reached(p, cnt) && n++ < MAX_STEPS) {
      if (g > rank) {
        if (!restart) return null;
        g = 1;
        q = 0;
      }
      per.set(g, (per.get(g) || 0) + 1);
      p += gain(rank, g);
      cnt[g]++;
      q += stepUnits(rank, g);
      if (q >= UNITS - 1e-9) {
        g += 1;
        q = 0;
      }
    }
    const grades = [...per].map(([grade, count]) => ({ grade, count })).sort((x, y) => x.grade - y.grade);
    return { grades, count: grades.reduce((x, y) => x + y.count, 0), over: p - 100, g, q, kind: 'module neuf' };
  };
  // Le grade du rang refait (scénario favorable seulement : refaire un grade fini est inconnu)
  const reroll = (rank, from) => {
    const each = gain(rank, rank);
    let count = 1;
    while (!rankReached(from + count * each, scenario) && count < MAX_STEPS) count++;
    return { grades: [{ grade: rank, count }], count, over: from + count * each - 100, kind: 'grade refait' };
  };
  const costOfExtra = (x, bp) => x.grades.reduce((a, y) => a + y.count * unitCost(bp, y.grade), 0);

  let guard = 0;
  while (st.some((t) => !t.done) && guard++ < MAX_STEPS) {
    if (r >= 5) {
      finishAll();
      break;
    }
    const rank = r;
    const needHigher = st.filter((t) => !t.done && t.T > rank);
    // Modules « moteurs » : ils auront de toute façon des applications au grade maximal du rang
    const vehicles = st
      .filter((t) => !t.done && t.T >= rank && t.g <= rank)
      .sort((a, b) => Number(b.T > rank) - Number(a.T > rank) || (rank - a.g) - (rank - b.g) || b.q - a.q || a.i - b.i);
    let rose = false;
    for (const v of vehicles) {
      let n = 0;
      while (!v.done && v.g <= rank && r === rank && n++ < MAX_STEPS) apply(v);
      if (r !== rank) {
        rose = true;
        break;
      }
    }
    if (rose) continue;
    if (needHigher.length) {
      // Modules du plan visés sous ce rang : faits d'abord, à ce rang, si cette suite le retient (early) ; leurs
      // applications comptent pour la montée et le manque se calcule après eux
      const lowers = st.filter((t) => !t.done && t.T < rank);
      if (lowers.length) {
        choices.push(rank);
        if (early.has(rank)) {
          for (const t of lowers.sort((a, b) => b.T - a.T || a.i - b.i)) {
            t.early ??= rank;
            let n = 0;
            while (!t.done && r === rank && n++ < MAX_STEPS) apply(t);
            if (r !== rank) break;
          }
          if (r !== rank) continue;
        }
      }
      // Les applications du plan ne suffisent pas : le manque, sur un module neuf (ou grade refait, favorable)
      if (!(gain(rank, rank) > 0)) {
        impossible = true;
        break;
      }
      const ways = [];
      for (const sp of spares) {
        if (sp.g > rank) continue;
        const w = climbOn(rank, sp.g, sp.q, false);
        if (w) ways.push({ ...w, spare: sp, blueprint: sp.blueprint, task: sp.task });
      }
      for (const t of [...needHigher].sort((a, b) => a.i - b.i)) {
        ways.push({ ...climbOn(rank, 1, 0, true), spare: null, blueprint: t.blueprint, task: t.key });
        // Grade refait : seulement sur un module dont le grade du rang est fini (pas sur un module déjà plus haut)
        if (scenario === 'favorable' && t.g === rank + 1 && t.q === 0) ways.push({ ...reroll(rank, P), spare: null, blueprint: t.blueprint, task: t.key });
      }
      let best = null;
      for (const w of ways) {
        const cost = costOfExtra(w, w.blueprint);
        if (!best || cost < best.cost - 1e-9) best = { ...w, cost };
      }
      let id = null;
      if (best.kind === 'module neuf') {
        const sp = best.spare || { id: spares.length + 1, blueprint: best.blueprint, task: best.task };
        if (!best.spare) spares.push(sp);
        sp.g = best.g;
        sp.q = best.q;
        id = sp.id;
      }
      const x = { rank, grades: best.grades, count: best.count, kind: best.kind, spare: id, task: best.task, blueprint: best.blueprint };
      extras.push(x);
      cost += best.cost;
      applications += best.count;
      order.push({ extra: { rank, grades: x.grades, count: x.count, kind: x.kind, spare: id, task: x.task } });
      climbed(best.over, { extra: true });
      continue;
    }
    finishAll();
    if (r === rank) break; // tout est fait à ce rang
  }
  // Montée de référence (R14) : un module neuf de climbBlueprint, jusqu'au rang et à la progression visés
  if (goal && !impossible) {
    const reachedGoal = () => r > goal.rank || (r === goal.rank && P >= goal.progress - 1e-9);
    const sp = { id: spares.length + 1, g: 1, q: 0 };
    let seg = null;
    const flush = () => {
      if (!seg) return;
      const grades = [...seg.per].map(([grade, count]) => ({ grade, count })).sort((x, y) => x.grade - y.grade);
      const x = { rank: seg.rank, grades, count: seg.count, kind: 'référence', spare: seg.spare, task: null, blueprint: climbBlueprint };
      extras.push(x);
      order.push({ extra: { rank: x.rank, grades, count: x.count, kind: x.kind, spare: x.spare, task: null } });
      seg = null;
    };
    let n = 0;
    while (!reachedGoal() && r < 5 && n++ < MAX_STEPS) {
      if (sp.g > r) {
        // Ce module est au bout du grade du rang sans montée : un autre, neuf
        flush();
        sp.id += 1;
        sp.g = 1;
        sp.q = 0;
      }
      const g = sp.g;
      const at = r;
      if (!seg) seg = { rank: at, per: new Map(), count: 0, spare: sp.id };
      seg.per.set(g, (seg.per.get(g) || 0) + 1);
      seg.count++;
      cost += unitCost(climbBlueprint, g);
      applications++;
      sp.q += stepUnits(at, g);
      if (sp.q >= UNITS - 1e-9) {
        sp.g = g + 1;
        sp.q = 0;
      }
      P += gain(at, g);
      counts[g]++;
      if (reached(P, counts)) {
        flush();
        climbed(P - 100, { extra: true, reference: true });
      }
    }
    flush();
    if (!reachedGoal()) impossible = true;
  }
  return { tasks: new Map(st.map((t) => [t.key, { per: [...t.per.values()].sort((a, b) => a.grade - b.grade), done: t.done, early: t.early }])), extras, ups, order, rank: r, impossible, cost: cost + (impossible ? 1e6 : 0), applications, choices };
}

/**
 * Départ de la simulation : rang et progression selon le scénario. Rang inconnu : rang 1 prudent, rang 5 favorable.
 * Ingénieur pas encore débloqué : rang 1, 0 % dans les deux (RANK_RULES.UNLOCK_START : rang mesuré 3 fois sur 3, 0 %
 * à vérifier). Prudent : pour le pire cas du modèle, le départ sûr à ce rang et les applications faites depuis
 * (climbBasis de ranks.js) ; sans eux, la progression la plus basse sert de départ.
 */
function startOf(e, scenario) {
  if (e?.locked) return { ...RANK_RULES.UNLOCK_START.value };
  const known = Number.isInteger(e?.rank);
  if (!known) return { rank: scenario === 'favorable' ? 5 : 1, progress: 0 };
  const p = e.rankProgress;
  if (scenario === 'favorable') return { rank: e.rank, progress: p?.max ?? 99.99 };
  const b = e.climbBasis;
  return { rank: e.rank, progress: p?.min ?? 0, ...(b ? { from: b.from, counts: b.counts } : {}) };
}

/** Applications d'une liste de tâches au rang 5 (règle de 18.08), depuis leur qualité de départ. */
function rollsAtRank5(tasks) {
  let n = 0;
  for (const t of tasks) t.grades.forEach((g, k) => { n += rollsToFinish(5, g, k === 0 ? t.startUnits || 0 : 0); });
  return n;
}

/**
 * Modèle des ingénieurs pour l'itinéraire : état, rang, et applications qu'un ensemble de tâches coûte chez un
 * ingénieur (scénario prudent, montée de rang comprise et partagée entre ces tâches), comme planNeeds (même départ :
 * startOf, UNLOCK_START pour un ingénieur pas encore débloqué). Mémoïsé.
 *   extraRolls(nom, tâches, { fixedRank, rank, goal, climbBlueprint }) : applications prudentes − applications au
 *   rang 5 (Infinity si c'est impossible) ; à distance (fixedRank), au rang donné ; goal : montée de référence (R14),
 *   toutes ses applications en plus.
 * @param {Map<string, object>} engineers nom (journal) → état (engineerStates de ranks.js)
 */
export function engineerModel(ref, engineers) {
  const engs = engineers || new Map();
  const unlocked = (n) => engs.get(n)?.progress === 'Unlocked';
  const rankOf = (n) => (unlocked(n) && Number.isInteger(engs.get(n)?.rank) ? engs.get(n).rank : null);
  const stateOf = (n) => (unlocked(n) ? engs.get(n) : { locked: true, progress: engs.get(n)?.progress ?? null, rank: null });
  const unitCost = (bp, g) => ref.gradeComponents(bp, g).reduce((a, c) => a + c.count, 0);
  const memo = new Map();
  const simulate = (name, tasks, { fixedRank = false, rank = null, goal = null, climbBlueprint = null } = {}) => {
    const id = JSON.stringify([name, fixedRank, fixedRank ? rank : null, goal, goal ? climbBlueprint : null, tasks.map((t) => [t.key, t.blueprint, t.grades, t.startUnits || 0])]);
    if (!memo.has(id)) {
      const start = fixedRank ? { rank: rank ?? rankOf(name) ?? 1, progress: 0 } : startOf(stateOf(name), 'prudent');
      memo.set(id, simulateEngineer(start, tasks, 'prudent', { unitCost, fixedRank, goal, climbBlueprint }));
    }
    return memo.get(id);
  };
  return {
    stateOf,
    rankOf,
    unlocked,
    unitCost,
    simulate,
    extraRolls(name, tasks, opts = {}) {
      const sim = simulate(name, tasks, opts);
      return sim.impossible ? Infinity : sim.applications - rollsAtRank5(tasks);
    },
    rolls(name, tasks, opts = {}) {
      const sim = simulate(name, tasks, opts);
      return sim.impossible ? Infinity : sim.applications;
    },
  };
}

const addTo = (map, key, n) => n && map.set(key, (map.get(key) || 0) + n);
const units = (map) => [...map.values()].reduce((a, b) => a + b, 0);

/**
 * Bilan d'un plan : besoins par matériau comparés à l'inventaire, rangs des ingénieurs compris.
 * @param {object} p { modules: [{ slot, label, grp, target, current }], inventory, engineers }
 *   engineers : nom (celui du journal) → { progress: 'Unlocked'…, rank, rankProgress: { min, max, known, at } }
 * @param {object} [o]
 * @param {Map<number, object>|null} [o.choice] ingénieur imposé par module (indice dans modules), pour l'itinéraire :
 *   { engineer: nom } (à son atelier), { remote: nom, rank } (à distance, épingle : rang fixe, R3c), ou
 *   { split: { remote: nom, rank, upTo }, engineer: nom } (G1 à G{upTo} à distance, le reste à l'atelier). Donné, le
 *   choix des ingénieurs (étape 3) est sauté ; un module absent du choix garde le moins cher, module par module. Une
 *   part à distance est simulée à part (rang fixe) ; sa ligne d'ingénieur porte remote: true.
 */
export function planNeeds(ref, { modules, inventory, engineers }, { choice: forced = null } = {}) {
  const engs = engineers || new Map();
  // Part à distance d'un module (choix imposé) : un pseudo-ingénieur « remote|nom », simulé au rang fixe
  const REMOTE = 'remote|';
  const isRemote = (n) => typeof n === 'string' && n.startsWith(REMOTE);
  const realOf = (n) => (isRemote(n) ? n.slice(REMOTE.length) : n);
  const remoteRank = new Map();
  const unlocked = (n) => engs.get(realOf(n))?.progress === 'Unlocked';
  const rankOf = (n) => (isRemote(n) ? remoteRank.get(n) ?? null : unlocked(n) && Number.isInteger(engs.get(n)?.rank) ? engs.get(n).rank : null);
  // Pas encore débloqué : compté comme après son déblocage (rang 1, 0 %), le module reste bloqué
  const stateOf = (n) => (unlocked(n) ? engs.get(realOf(n)) : { locked: true, progress: engs.get(realOf(n))?.progress ?? null, rank: null });
  const unitCost = (bp, g) => ref.gradeComponents(bp, g).reduce((a, c) => a + c.count, 0);

  // 1. Étapes de chaque module et ingénieurs possibles
  const items = modules.map((m, idx) => {
    const steps = remainingSteps(m.target, m.current);
    const lists = steps.grades.map((g) => ref.engineersFor(m.grp, m.target.blueprint, g));
    return { m, idx, steps, lists, startUnits: qualityUnits(steps.startQuality) };
  });

  // 2. Tâches d'un module : un ingénieur pour tout le module (nom), ou grade par grade (tableau, null : personne)
  const tasksOf = (it, who) => {
    const per = Array.isArray(who) ? who : it.steps.grades.map(() => who);
    const out = [];
    it.steps.grades.forEach((g, k) => {
      const last = out.at(-1);
      if (last && last.engineer === per[k]) last.grades.push(g);
      else out.push({ key: `${it.idx}:${out.length}`, item: it.idx, engineer: per[k], blueprint: it.m.target.blueprint, grades: [g], startUnits: k === 0 ? it.startUnits : 0 });
    });
    return out;
  };

  const memo = new Map();
  const simulate = (name, tasks, scenario) => {
    const id = `${name}|${scenario}|${tasks.map((t) => `${t.key}:${t.grades.join(',')}`).join(';')}`;
    if (!memo.has(id)) {
      memo.set(id, isRemote(name)
        ? simulateEngineer({ rank: remoteRank.get(name) ?? 1, progress: 0 }, tasks, scenario, { unitCost, fixedRank: true })
        : simulateEngineer(startOf(stateOf(name), scenario), tasks, scenario, { unitCost }));
    }
    return memo.get(id);
  };
  // Coût en matériaux (unités, scénario prudent) d'un ensemble de tâches chez un ingénieur, montée comprise
  const costOf = (name, tasks) => {
    if (!tasks.length) return 0;
    const sim = simulate(name, tasks, 'prudent');
    let n = 0;
    for (const t of tasks) {
      for (const p of sim.tasks.get(t.key)?.per || []) n += p.rolls * unitCost(t.blueprint, p.grade);
    }
    for (const x of sim.extras) for (const y of x.grades) n += y.count * unitCost(x.blueprint, y.grade);
    return sim.impossible ? n + 1e6 : n;
  };
  const assignmentCost = (it, who) => {
    const tasks = tasksOf(it, who).filter((t) => t.engineer);
    return [...new Set(tasks.map((t) => t.engineer))].reduce((a, n) => a + costOf(n, tasks.filter((t) => t.engineer === n)), 0);
  };
  const namesOf = (who) => (Array.isArray(who) ? who : [who]).filter(Boolean);
  const keyOf = (o) => (Array.isArray(o) ? o.map((x) => x ?? '').join('|') : String(o));
  // Coût d'un ingénieur au rang 5 : la somme de ses modules (aucune montée) ; sous le rang 5, de rang inconnu ou pas
  // encore débloqué, la montée est partagée entre ses modules : le coût d'un module dépend des autres
  const sharedCost = (n) => !isRemote(n) && rankOf(n) !== 5;
  // Ordre entre ingénieurs : dans un module, la part d'un ingénieur vient avant celle du suivant (un grade ne
  // s'applique qu'une fois le précédent fini). La simulation de chaque ingénieur suppose ses grades prêts quand elle les
  // fait : c'est possible si un ingénieur sous le rang 5 ne fait qu'une suite de grades d'un module (sinon il ferait
  // le G3 avant le G1) et si ces ordres ne tournent pas en rond (A avant B pour un module, B avant A pour un autre) :
  // on fait alors tout chez A, puis tout chez B. Un rang 5 ne compte pas : ses applications coûtent pareil à tout moment.
  const chainOf = (it, o) => tasksOf(it, o).map((t) => t.engineer).filter((n) => n && sharedCost(n));
  const selfLoop = (chain) => chain.some((n, i) => chain.indexOf(n) !== i);
  const cyclic = (idxs) => {
    const next = new Map();
    for (const i of idxs) {
      const c = chainOf(items[i], choice.get(i));
      if (selfLoop(c)) return true;
      for (let k = 1; k < c.length; k++) {
        if (!next.has(c[k - 1])) next.set(c[k - 1], new Set());
        next.get(c[k - 1]).add(c[k]);
      }
    }
    const state = new Map(); // 1 : en cours, 2 : vu
    const loops = (n) => {
      state.set(n, 1);
      for (const m of next.get(n) || []) if (state.get(m) === 1 || (!state.get(m) && loops(m))) return true;
      state.set(n, 2);
      return false;
    };
    return [...next.keys()].some((n) => !state.get(n) && loops(n));
  };

  // 3. Choix des ingénieurs : coût total en matériaux, montée de rang comprise et partagée entre les modules ; à coût
  // égal, le moins d'ingénieurs pour un module, puis le moins d'allers-retours, puis les plus hauts rangs.
  // Options d'un module : chaque grade chez un ingénieur débloqué qui le propose (un rang 5 qui ne fait que les premiers
  // grades peut coûter moins qu'un rang 3 qui fait tout : chez le rang 3, les G1 et G2 coûtent plus d'applications
  // qu'ils n'aident à monter) ; pour un grade qu'aucun débloqué ne propose, un ingénieur pas encore débloqué (compté
  // après son déblocage), qui peut alors aussi prendre les autres grades qu'il propose. Les options ne dépendent pas
  // des rangs : un rang de plus ne retire jamais une option.
  // Deux options qui confient les mêmes grades aux mêmes ingénieurs sous le rang 5 ne diffèrent que par la part faite
  // au rang 5, qui s'additionne : seule la moins chère des deux reste (rien n'est perdu).
  const lex = (p, q) => p.reduce((d, v, i) => d || v - q[i], 0);
  const MAX_ENUM = 4096; // combinaisons grade par grade énumérées au plus pour un module
  const options = new Map(); // idx → [{ o, pref, cost }] (cost : le module seul)
  for (const it of items) {
    if (!it.steps.grades.length) continue;
    const open = it.lists.map((l) => l.filter(unlocked));
    const gapLocked = new Set(it.lists.flatMap((l, k) => (open[k].length ? [] : l)));
    const cands = it.lists.map((l, k) => {
      const c = [...open[k], ...l.filter((n) => gapLocked.has(n) && !unlocked(n))];
      return c.length ? c : [null];
    });
    const product = cands.reduce((a, c) => a * c.length, 1);
    const combos = [];
    if (product <= MAX_ENUM) {
      const walk = (k, acc) => {
        if (k === cands.length) combos.push(acc.slice());
        else for (const c of cands[k]) walk(k + 1, [...acc, c]);
      };
      walk(0, []);
    } else {
      // Trop de combinaisons : chaque ingénieur pour tous les grades qu'il propose, le premier proposé ailleurs
      for (const n of new Set(cands.flat())) combos.push(cands.map((c) => (c.includes(n) ? n : c[0])));
    }
    const best = new Map(); // empreinte sous le rang 5 → { o, add, pref }
    for (const a of combos) {
      const o = a.every((x) => x != null && x === a[0]) ? a[0] : a;
      let add = 0;
      const shared = [];
      for (const t of tasksOf(it, o)) {
        if (t.engineer && sharedCost(t.engineer)) shared.push(`${t.engineer}:${t.grades.join(',')}`);
        else if (t.engineer) for (const [k, g] of t.grades.entries()) add += rollsToFinish(5, g, k === 0 ? t.startUnits : 0) * unitCost(t.blueprint, g);
        else shared.push(`-:${t.grades.join(',')}`);
      }
      const segments = tasksOf(it, o).length;
      const pref = [new Set(namesOf(o)).size, segments, -a.reduce((s, x) => s + (rankOf(x) || 0), 0)];
      const print = shared.join(';');
      const cur = best.get(print);
      if (!cur || add < cur.add - 1e-9 || (Math.abs(add - cur.add) <= 1e-9 && lex(pref, cur.pref) < 0)) best.set(print, { o, add, pref });
    }
    const ranked = [...best.values()]
      .map((x, k) => ({ ...x, k }))
      .sort((x, y) => lex(x.pref, y.pref) || x.k - y.k)
      .map((x, pref) => ({ o: x.o, pref, cost: assignmentCost(it, x.o) }));
    // Un ingénieur sous le rang 5 qui ferait deux suites de grades du module : écarté, sauf s'il n'y a rien d'autre
    const ok = ranked.filter((x) => !selfLoop(chainOf(it, x.o)));
    options.set(it.idx, ok.length ? ok : ranked);
  }
  // Départ : le moins cher module par module, parmi les options qui n'imposent aucun ordre entre deux ingénieurs sous
  // le rang 5 s'il y en a (aucun ordre ne peut alors tourner en rond)
  const choice = new Map(); // idx → nom ou tableau par grade
  for (const [idx, opts] of options) {
    const free = opts.filter((x) => chainOf(items[idx], x.o).length <= 1);
    choice.set(idx, [...(free.length ? free : opts)].sort((a, b) => a.cost - b.cost || a.pref - b.pref)[0].o);
  }
  // Choix imposé (itinéraire) : l'ingénieur de l'escale, la part à distance (épingle), ou les deux
  if (forced) {
    const pseudo = (x) => {
      const p = `${REMOTE}${x.remote}`;
      remoteRank.set(p, x.rank);
      return p;
    };
    for (const it of items) {
      const c = forced.get(it.idx);
      if (!c || !it.steps.grades.length) continue;
      if (c.split) {
        const p = pseudo(c.split);
        const per = it.steps.grades.map((g) => (g <= c.split.upTo ? p : c.engineer));
        choice.set(it.idx, per.every((x) => x === per[0]) ? per[0] : per);
      } else if (c.remote) choice.set(it.idx, pseudo(c));
      else if (c.engineer) choice.set(it.idx, c.engineer);
    }
  }
  const tasksAt = (name) => {
    const out = [];
    for (const it of items) {
      const who = choice.get(it.idx);
      if (who == null) continue;
      for (const t of tasksOf(it, who)) if (t.engineer === name) out.push(t);
    }
    return out.sort((a, b) => a.item - b.item);
  };

  // Les modules ne dépendent les uns des autres que par un ingénieur au coût partagé (sharedCost). Chaque groupe de
  // modules liés ainsi est choisi à part, sans ordre qui tourne en rond (cyclic) quand c'est possible. Petit groupe (au
  // plus EXHAUSTIVE combinaisons) : toutes les combinaisons, la moins chère retenue. Sinon, en partant du moins cher
  // module par module, les coups qui font baisser le total, tant qu'il en reste : un module change d'option ; « tout
  // chez X » (chaque module qui le propose pour lui seul) ; tous les modules faits chez A passent chez B (une montée
  // partagée peut demander d'en déplacer plusieurs à la fois).
  const EXHAUSTIVE = 2048;
  const parent = new Map([...options.keys()].map((i) => [i, i]));
  const find = (i) => (parent.get(i) === i ? i : find(parent.get(i)));
  const firstAt = new Map();
  for (const [idx, opts] of options) {
    for (const n of new Set(opts.flatMap((x) => namesOf(x.o)))) {
      if (!sharedCost(n)) continue;
      if (!firstAt.has(n)) firstAt.set(n, idx);
      else parent.set(find(idx), find(firstAt.get(n)));
    }
  }
  const groups = new Map();
  for (const idx of options.keys()) {
    const root = find(idx);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(idx);
  }
  // Coût d'un groupe avec le choix en cours (seulement chez les ingénieurs de only, s'il est donné)
  const groupCost = (idxs, only = null) => {
    const per = new Map();
    for (const idx of [...idxs].sort((a, b) => a - b)) {
      for (const t of tasksOf(items[idx], choice.get(idx))) {
        if (!t.engineer || (only && !only.has(t.engineer))) continue;
        if (!per.has(t.engineer)) per.set(t.engineer, []);
        per.get(t.engineer).push(t);
      }
    }
    let c = 0;
    for (const [n, ts] of per) c += costOf(n, ts);
    return c;
  };
  const prefOf = (idxs) => idxs.reduce((a, i) => a + (options.get(i).find((x) => keyOf(x.o) === keyOf(choice.get(i)))?.pref ?? 0), 0);
  for (const idxs of forced ? [] : groups.values()) {
    const lists = idxs.map((i) => options.get(i));
    const product = lists.reduce((a, l) => a * l.length, 1);
    if (product <= 1) continue;
    if (product <= EXHAUSTIVE) {
      let best = null;
      const visit = (j) => {
        if (j === idxs.length) {
          const loop = Number(cyclic(idxs));
          const cost = groupCost(idxs);
          const pref = prefOf(idxs);
          const better = !best || loop < best.loop || (loop === best.loop && (cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) <= 1e-9 && pref < best.pref)));
          if (better) best = { loop, cost, pref, os: idxs.map((i) => choice.get(i)) };
          return;
        }
        for (const x of lists[j]) {
          choice.set(idxs[j], x.o);
          visit(j + 1);
        }
      };
      visit(0);
      idxs.forEach((i, j) => choice.set(i, best.os[j]));
      continue;
    }
    const optsOf = (i) => options.get(i).map((x) => x.o);
    const here = [...new Set(idxs.flatMap((i) => optsOf(i).filter((o) => typeof o === 'string')))];
    for (let pass = 0; pass < 50; pass++) {
      const moves = new Map(); // empreinte → [[idx, option]…]
      const addMove = (mv) => {
        if (mv.length) moves.set(mv.map(([i, o]) => `${i}=${keyOf(o)}`).join(';'), mv);
      };
      for (const i of idxs) for (const o of optsOf(i)) if (keyOf(o) !== keyOf(choice.get(i))) addMove([[i, o]]);
      for (const X of here) addMove(idxs.filter((i) => optsOf(i).includes(X) && choice.get(i) !== X).map((i) => [i, X]));
      for (const A of here) for (const B of here) if (A !== B) addMove(idxs.filter((i) => choice.get(i) === A && optsOf(i).includes(B)).map((i) => [i, B]));
      let best = null;
      const loopNow = Number(cyclic(idxs));
      for (const mv of moves.values()) {
        const touched = new Set(mv.flatMap(([i, o]) => [...namesOf(choice.get(i)), ...namesOf(o)]));
        const before = groupCost(idxs, touched);
        const old = mv.map(([i]) => [i, choice.get(i)]);
        for (const [i, o] of mv) choice.set(i, o);
        const delta = groupCost(idxs, touched) - before;
        const loop = Number(cyclic(idxs));
        for (const [i, o] of old) choice.set(i, o);
        // Un ordre qui tourne en rond défait d'abord, puis le total qui baisse le plus
        const gain = loop < loopNow || (loop === loopNow && delta < -1e-9);
        if (gain && (!best || loop < best.loop || (loop === best.loop && delta < best.delta - 1e-9))) best = { mv, delta, loop };
      }
      if (!best) break;
      for (const [i, o] of best.mv) choice.set(i, o);
    }
  }

  // 4. Simulation finale, ingénieur par ingénieur, dans les deux scénarios
  const names = new Set();
  for (const who of choice.values()) for (const n of Array.isArray(who) ? who : [who]) if (n) names.add(n);
  const sims = new Map();
  for (const n of names) {
    const tasks = tasksAt(n);
    sims.set(n, { tasks, prudent: simulate(n, tasks, 'prudent'), favorable: simulate(n, tasks, 'favorable') });
  }
  // Statut des règles utilisées chez un ingénieur : finir chaque grade à chaque rang ; la progression de rang
  // seulement s'il y a une montée (ou des applications en plus) dans l'un des deux scénarios, et seulement pour les
  // applications faites à un rang d'où l'un des deux scénarios monte encore (sous le rang le plus haut atteint) : au
  // rang final, leur part dans la montée ne change aucun compte ; rang inconnu, ou départ après déblocage.
  // Une progression dont la borne basse n'est pas chiffrée (« inconnue » : G1 à G3 au rang 4) ne rend le badge
  // « inconnue » que si elle change un compte : la simulation est refaite avec la table seule, ces lignes à leur
  // borne basse puis à leur borne haute, les autres au gain le plus bas puis au plus haut. Mêmes applications par
  // grade et en plus partout : elle ne change rien, la progression reste « à vérifier » (déduite). C'est le cas quand
  // le rang ne monte qu'une fois pendant un grade : il coûte autant d'applications quel que soit le moment de la
  // montée (k au rang r, puis ceil((n − k)(n − 1)/n) = n − k au rang suivant).
  // Motifs du statut (statusWhy) : ceux des règles au statut retenu, pour le dire au survol du badge (une valeur
  // mesurée trop peu de fois n'est pas « déduite avec une hypothèse »)
  const countsSig = (tasks, sim) => JSON.stringify([
    tasks.map((t) => (sim.tasks.get(t.key)?.per || []).map((p) => [p.grade, p.rolls])),
    sim.extras.map((x) => [x.rank, x.grades.map((y) => [y.grade, y.count])]),
    sim.impossible,
  ]);
  const unknownChangesCounts = (n, tasks) => {
    for (const scenario of ['prudent', 'favorable']) {
      const sigs = new Set();
      for (const end of ['min', 'max']) {
        const gainOf = (rk, g) => {
          const c = rankRow(rk, g)?.climb;
          if (!c) return 0;
          if (c.status === STATUS.UNKNOWN) return end === 'min' ? c.gainMin : c.gainMax ?? c.gainMin;
          return scenario === 'favorable' ? c.gainMax ?? 0 : c.gainMin;
        };
        sigs.add(countsSig(tasks, simulateEngineer(startOf(stateOf(n), scenario), tasks, scenario, { unitCost, model: null, gainOf })));
      }
      if (sigs.size > 1) return true;
    }
    return false;
  };
  const statusOf = new Map();
  const whyOf = new Map();
  for (const [n, s] of sims) {
    const climbs = [s.prudent, s.favorable].some((x) => x.ups.length || x.extras.length);
    const top = Math.max(s.prudent.rank, s.favorable.rank);
    const list = [];
    const reasons = [];
    let unknownMatters = null;
    const use = (rk, grade, opts) => {
      const o = opts.climbs && rankRow(rk, grade)?.climb?.status === STATUS.UNKNOWN ? { ...opts, unknownMatters: (unknownMatters ??= unknownChangesCounts(n, s.tasks)) } : opts;
      list.push(rowStatus(rk, grade, o));
      reasons.push(...rowReasons(rk, grade, o));
    };
    for (const sim of [s.prudent, s.favorable]) {
      for (const t of s.tasks) for (const p of sim.tasks.get(t.key)?.per || []) for (const rk of p.ranks) use(rk, p.grade, { climbs: climbs && rk < top });
      for (const x of sim.extras) for (const y of x.grades) use(x.rank, y.grade, { climbs: true });
      if (sim.impossible) {
        list.push(STATUS.UNKNOWN);
        reasons.push({ status: STATUS.UNKNOWN, why: 'la montée de rang n’est pas chiffrée à ce rang' });
      }
    }
    if (stateOf(n).locked) {
      // Départ après déblocage : rang 1 mesuré, 0 % à vérifier (le déblocage n'écrit pas de progression)
      const u = RANK_RULES.UNLOCK_START;
      list.push(u.status);
      if (u.status !== STATUS.MEASURED) reasons.push({ status: u.status, why: `départ après déblocage, rang 1 à 0 % : ${u.why}` });
    } else if (rankOf(n) == null) {
      list.push(STATUS.UNKNOWN);
      reasons.push({ status: STATUS.UNKNOWN, why: 'rang non lu dans le journal : compté au rang 1 en prudent, au rang 5 en favorable' });
    }
    const status = weakest(list);
    statusOf.set(n, status);
    whyOf.set(n, [...new Set(reasons.filter((r) => r.status === status).map((r) => r.why))]);
  }

  // 5. Matériaux et détail par module
  const total = new Map();
  const totalBase = new Map();
  const totalFav = new Map();
  const perModule = [];
  const engineerRows = new Map();
  for (const it of items) {
    const { m, steps } = it;
    const who = choice.get(it.idx);
    const per = Array.isArray(who) ? who : steps.grades.map(() => who ?? null);
    const need = new Map();
    const base = new Map();
    const fav = new Map();
    const stepRows = [];
    const extrasHere = [];
    let rolls = 0;
    let rollsBase = 0;
    let rollsFav = 0;
    const tasks = tasksOf(it, who ?? null);
    steps.grades.forEach((g, k) => {
      const name = per[k];
      const task = tasks.find((t) => t.grades.includes(g));
      const b = rollsToFinish(5, g, k === 0 ? it.startUnits : 0);
      let pr = b;
      let fv = b;
      let ranks = [5];
      let byRank = [{ rank: 5, rolls: b }];
      let early = null;
      const sim = name ? sims.get(name) : null;
      if (sim) {
        early = sim.prudent.tasks.get(task.key)?.early ?? null;
        const p = sim.prudent.tasks.get(task.key)?.per.find((x) => x.grade === g);
        const f = sim.favorable.tasks.get(task.key)?.per.find((x) => x.grade === g);
        if (p) {
          pr = p.rolls;
          ranks = p.ranks;
          byRank = p.byRank.map((x) => ({ ...x }));
        }
        if (f) fv = f.rolls;
      }
      rolls += pr;
      rollsBase += b;
      rollsFav += fv;
      for (const c of ref.gradeComponents(m.target.blueprint, g)) {
        addTo(need, c.key, c.count * pr);
        addTo(base, c.key, c.count * b);
        addTo(fav, c.key, c.count * fv);
      }
      const list = it.lists[k].map((n) => ({ name: n, unlocked: unlocked(n), rank: rankOf(n), ok: unlocked(n) }));
      const locked = !!name && !unlocked(name);
      const found = name && !locked ? list.find((x) => x.name === realOf(name)) || null : null;
      const best = found && isRemote(name) ? { ...found, rank: rankOf(name), remote: true } : found;
      stepRows.push({
        grade: g,
        rolls: pr,
        rollsBase: b,
        rollsFavorable: fv,
        ranks,
        // Scénario prudent : applications de ce grade rang par rang (la ligne du module dit à quel rang les faire)
        byRank,
        // Scénario prudent : module visé sous le rang de l'ingénieur, fait à ce rang avant la montée parce qu'il compte
        // pour elle (moins cher en tout que de le garder pour le rang final et de monter avec un module neuf) ; null sinon
        early,
        startQuality: k === 0 ? steps.startQuality : 0,
        engineers: it.lists[k],
        status: {
          list,
          best,
          available: !!best,
          // Compté chez cet ingénieur une fois débloqué (rang 1, 0 %)
          afterUnlock: locked ? { name: realOf(name), rank: RANK_RULES.UNLOCK_START.value.rank } : null,
          estimate: !name || statusOf.get(name) !== STATUS.MEASURED,
        },
      });
    });
    // Applications en plus pour monter de rang, rattachées au module dont elles prennent la modification
    for (const name of new Set(per.filter(Boolean))) {
      const sim = sims.get(name);
      for (const x of sim.prudent.extras) {
        if (!tasks.some((tt) => tt.key === x.task)) continue;
        extrasHere.push({ engineer: name, rank: x.rank, grades: x.grades, count: x.count, kind: x.kind, spare: x.spare });
        rolls += x.count;
        for (const y of x.grades) for (const c of ref.gradeComponents(x.blueprint, y.grade)) addTo(need, c.key, c.count * y.count);
      }
      for (const y of sim.favorable.extras) {
        if (!tasks.some((tt) => tt.key === y.task)) continue;
        rollsFav += y.count;
        for (const z of y.grades) for (const c of ref.gradeComponents(y.blueprint, z.grade)) addTo(fav, c.key, c.count * z.count);
      }
    }
    if (steps.experimental) {
      const engList = ref.engineersFor(m.grp, m.target.blueprint, 1);
      const list = engList.map((n) => ({ name: n, unlocked: unlocked(n), rank: rankOf(n), ok: unlocked(n) }));
      const first = realOf(per.find((n) => n && !isRemote(n)) ?? null);
      const name = first && list.some((x) => x.name === first && x.ok) ? first : list.filter((x) => x.ok).sort((a, b) => (b.rank || 0) - (a.rank || 0))[0]?.name;
      const best = name ? list.find((x) => x.name === name) : null;
      for (const c of ref.specialComponents(m.target.experimental)) {
        addTo(need, c.key, c.count);
        addTo(base, c.key, c.count);
        addTo(fav, c.key, c.count);
      }
      rolls += 1;
      rollsBase += 1;
      rollsFav += 1;
      const afterUnlock = !best && first && !unlocked(first) && engList.includes(first) ? { name: first, rank: RANK_RULES.UNLOCK_START.value.rank } : null;
      stepRows.push({ experimental: m.target.experimental, rolls: 1, rollsBase: 1, rollsFavorable: 1, ranks: best?.rank ? [best.rank] : [], engineers: engList, status: { list, best: best || null, available: !!best, afterUnlock, estimate: false } });
    }
    for (const [k, v] of need) addTo(total, k, v);
    for (const [k, v] of base) addTo(totalBase, k, v);
    for (const [k, v] of fav) addTo(totalFav, k, v);
    const engineerName = typeof who === 'string' ? realOf(who) : null;
    const rankRows = [...new Set(per.filter(Boolean))].map((n) => ({
      name: realOf(n),
      ...(isRemote(n) ? { remote: true } : {}),
      rank: rankOf(n),
      locked: !!stateOf(n).locked,
      progress: unlocked(n) ? engs.get(realOf(n))?.rankProgress || null : null,
      status: statusOf.get(n),
      statusWhy: whyOf.get(n),
    }));
    perModule.push({
      slot: m.slot,
      label: m.label,
      done: steps.done,
      rolls,
      rollsBase,
      rollsFavorable: rollsFav,
      steps: stepRows,
      materials: [...need].map(([key, n]) => ({ key, need: n, base: base.get(key) || 0 })),
      engineer: engineerName,
      engineerRanks: rankRows,
      extras: extrasHere,
      // Estimation : le nombre d'applications dépend d'une règle qui n'est pas mesurée (à vérifier, inconnue)
      estimate: stepRows.some((s) => s.status.estimate) || rankRows.some((e) => e.status !== STATUS.MEASURED),
      blocked: stepRows.some((s) => !s.status.available),
    });
  }

  // 6. Récapitulatif par ingénieur : rang, progression, montées, applications en plus, ordre conseillé
  const labelOf = (key) => {
    const it = items[Number(String(key).split(':')[0])];
    return it ? { slot: it.m.slot, label: it.m.label } : { slot: null, label: null };
  };
  const extraRow = (x) => ({ rank: x.rank, grades: x.grades, count: x.count, kind: x.kind, spare: x.spare, ...labelOf(x.task) });
  for (const [n, s] of sims) {
    const e = engs.get(realOf(n));
    const rank = rankOf(n);
    const locked = !!stateOf(n).locked;
    engineerRows.set(n, {
      name: realOf(n),
      ...(isRemote(n) ? { remote: true } : {}),
      rank,
      rankKnown: rank != null,
      locked,
      lockedProgress: locked ? e?.progress ?? null : null, // Invited, Known… (absent du journal : null)
      startRank: locked ? RANK_RULES.UNLOCK_START.value.rank : rank,
      progress: locked ? null : e?.rankProgress || null,
      status: statusOf.get(n),
      statusWhy: whyOf.get(n),
      modules: [...new Set(s.tasks.map((t) => items[t.item].m.slot))],
      ups: s.prudent.ups.map((u) => ({ from: u.from, to: u.to, extra: !!u.extra, ...(u.task != null ? labelOf(u.task) : {}), grade: u.grade ?? null })),
      upsFavorable: s.favorable.ups.length,
      rankAfter: s.prudent.rank,
      rankAfterFavorable: s.favorable.rank,
      extras: s.prudent.extras.map(extraRow),
      extrasFavorable: s.favorable.extras.map(extraRow),
      // Fourchette des applications en plus : prudent (module neuf) ; favorable (au mieux, grade refait compris)
      extraCount: s.prudent.extras.reduce((a, x) => a + x.count, 0),
      extraCountFavorable: s.favorable.extras.reduce((a, x) => a + x.count, 0),
      extraFavorableReroll: s.favorable.extras.some((x) => x.kind === 'grade refait'),
      order: s.prudent.order.map((o) => (o.task != null ? { ...labelOf(o.task), grade: o.grade, rank: o.rank, count: o.count } : o.extra ? { extra: { ...o.extra, ...labelOf(o.extra.task), task: undefined } } : o)),
      impossible: s.prudent.impossible,
    });
  }

  const cmp = compare(ref, total, inventory);
  const favOf = (key) => (totalFav.has(key) ? totalFav.get(key) : totalBase.get(key) || 0);
  for (const row of cmp.materials) {
    row.base = totalBase.get(row.key) || 0;
    row.rankExtra = Math.max(0, row.need - row.base);
    row.needFavorable = favOf(row.key);
  }
  // Matériaux en plus dus aux rangs, prudent et favorable. Par matériau, le prudent n'est pas toujours le plus haut :
  // le cas favorable peut refaire le grade du rang (G3 ×2 au lieu de G1 ×3, G2 ×4, G3 ×1 : plus de niobium, moins de
  // débris), voire demander un matériau que le prudent ne demande pas. « Nécessaire » et « Manquant » restent ceux du
  // prudent ; ce que le favorable demande en plus est donné à part (favorableMore, missingFavorable), jamais caché.
  const extraRows = [];
  for (const key of new Set([...cmp.materials.map((r) => r.key), ...totalFav.keys()])) {
    const base = totalBase.get(key) || 0;
    const need = total.get(key) || 0;
    const fav = favOf(key);
    const extra = Math.max(0, need - base);
    const extraFavorable = Math.max(0, fav - base);
    if (!extra && !extraFavorable) continue;
    const info = ref.materials.get(key);
    const owned = inventory.count(key);
    extraRows.push({
      key,
      label: ref.materialLabel(key, inventory.items.get(key)?.label),
      type: info?.type || inventory.items.get(key)?.type || null,
      grade: info?.grade || null,
      extra,
      extraFavorable,
      favorableMore: Math.max(0, fav - need),
      owned,
      missing: Math.max(0, need - owned),
      missingFavorable: Math.max(0, fav - owned),
    });
  }
  extraRows.sort((a, b) => b.extra - a.extra || (a.grade || 0) - (b.grade || 0));
  const sum = (k) => perModule.reduce((a, m) => a + m[k], 0);
  return {
    ...cmp,
    modules: perModule,
    modulesDone: perModule.filter((m) => m.done).length,
    modulesTotal: perModule.length,
    rolls: sum('rolls'),
    rollsBase: sum('rollsBase'),
    rollsFavorable: sum('rollsFavorable'),
    rankExtra: {
      materials: extraRows,
      units: units(total) - units(totalBase),
      unitsFavorable: Math.max(0, units(totalFav) - units(totalBase)),
      rolls: sum('rolls') - sum('rollsBase'),
      rollsFavorable: sum('rollsFavorable') - sum('rollsBase'),
    },
    engineers: [...engineerRows.values()].sort((a, b) => Number(b.locked) - Number(a.locked) || (a.rank ?? 0) - (b.rank ?? 0) || a.name.localeCompare(b.name)),
    rules: {
      measured: STATUS.MEASURED,
      source: JOURNAUX,
      remote: RANK_RULES.REMOTE_RANK_GAIN,
      reroll: RANK_RULES.REROLL_FULL_GRADE,
      carry: RANK_RULES.CARRY_OVER,
      unlock: RANK_RULES.UNLOCK_START,
      unlockRank: RANK_RULES.UNLOCK_RANK,
      unlockProgress: RANK_RULES.UNLOCK_PROGRESS,
      nextGrade: RANK_RULES.NEXT_GRADE_AT_FULL,
    },
  };
}

/** Compare des besoins à l'inventaire : nécessaire, possédé, manquant, avancement. */
export function compare(ref, needs, inventory) {
  const rows = [];
  let needSum = 0;
  let haveSum = 0;
  for (const [key, need] of needs) {
    const info = ref.materials.get(key);
    const owned = inventory.count(key);
    const missing = Math.max(0, need - owned);
    needSum += need;
    haveSum += Math.min(need, owned);
    rows.push({
      key,
      label: ref.materialLabel(key, inventory.items.get(key)?.label),
      type: info?.type || inventory.items.get(key)?.type || null,
      category: info?.category || null,
      grade: info?.grade || null,
      need,
      owned,
      missing,
    });
  }
  rows.sort((a, b) => b.missing - a.missing || (a.type || '').localeCompare(b.type || '') || (a.grade || 0) - (b.grade || 0));
  return { materials: rows, progress: needSum ? haveSum / needSum : 1, needSum, haveSum, missingCount: rows.filter((r) => r.missing).length };
}

/**
 * Dashboard multi-vaisseaux : un même matériau n'est compté qu'une fois dans le stock.
 * @param {object[]} plans [{ id, name, needs: Map<string, number> }]
 * @param {Map<string, number>} [globalNeeds] besoins de tous les plans ensemble, s'ils diffèrent de la somme
 *   (montées de rang partagées entre plans chez un même ingénieur)
 */
export function sharedStock(ref, plans, inventory, globalNeeds = null) {
  const total = new Map();
  for (const p of plans) for (const [k, v] of p.needs) total.set(k, (total.get(k) || 0) + v);
  const global = compare(ref, globalNeeds || total, inventory);
  const perPlan = plans.map((p) => {
    const c = compare(ref, p.needs, inventory);
    return { id: p.id, name: p.name, progress: c.progress, missingCount: c.missingCount, canFinishNow: c.missingCount === 0 && p.needs.size > 0 };
  });
  return { global, perPlan };
}
