// Recherche de l'itinéraire (fonctions pures, déterministes) : ordre des escales et choix des ingénieurs.
//
// Ordre : chemin OUVERT depuis le point de départ (pas de retour), à vol d'oiseau. Jusqu'à EXACT_MAX_CANDIDATES points,
// la table de Held-Karp donne le plus court chemin exact pour chaque ensemble de points ; au-delà, plus proche voisin
// puis améliorations 2-opt et Or-opt (morceaux du trajet retournés ou déplacés tant que ça raccourcit), en respectant
// les contraintes « a avant b » (un parrain avant son filleul).
//
// Choix des escales (bestCover) : chaque ensemble d'ingénieurs qui couvre les tâches, étendu par ses parrains à faire
// monter, est classé par (traversée pour une référence, déblocages, étapes de déblocage, borne basse du coût), puis
// évalué dans cet ordre (affectation, ordre, secondes visites) ; on s'arrête dès qu'aucun suivant ne peut faire mieux.

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const EPS = 1e-9;

function popcount(n) {
  let c = 0;
  let x = n;
  while (x) {
    x &= x - 1;
    c += 1;
  }
  return c;
}

const bitsOf = (mask) => {
  const out = [];
  for (let i = 0; mask >> i; i++) if (mask & (1 << i)) out.push(i);
  return out;
};
export { bitsOf, popcount };

/**
 * Table de Held-Karp pour des chemins ouverts depuis startPos : dp[mask·K + i] = longueur du plus court chemin qui part
 * du départ, passe par tous les points de mask et finit en i.
 * @param {{x,y,z}} startPos
 * @param {{ coords: {x,y,z} }[]} points (K ≤ 20 ; triés par l'appelant)
 */
export function heldKarp(startPos, points) {
  const K = points.length;
  const N = 1 << K;
  const dp = new Float64Array(N * K).fill(Infinity);
  const parent = new Int8Array(N * K).fill(-1);
  const fromStart = points.map((p) => dist(startPos, p.coords));
  const dm = points.map((p) => points.map((q) => dist(p.coords, q.coords)));
  for (let i = 0; i < K; i++) dp[(1 << i) * K + i] = fromStart[i];
  for (let mask = 1; mask < N; mask++) {
    for (let i = 0; i < K; i++) {
      if (!(mask & (1 << i))) continue;
      const cur = dp[mask * K + i];
      if (cur === Infinity) continue;
      const row = dm[i];
      for (let j = 0; j < K; j++) {
        if (mask & (1 << j)) continue;
        const at = (mask | (1 << j)) * K + j;
        const v = cur + row[j];
        if (v < dp[at] - EPS) {
          dp[at] = v;
          parent[at] = i;
        }
      }
    }
  }
  const best = (mask) => {
    if (!mask) return { length: 0, end: -1 };
    let length = Infinity;
    let end = -1;
    for (let i = 0; i < K; i++) {
      if (!(mask & (1 << i))) continue;
      const v = dp[mask * K + i];
      if (v < length - EPS) {
        length = v;
        end = i;
      }
    }
    return { length, end };
  };
  const pathOf = (mask, end = best(mask).end) => {
    const order = [];
    let m = mask;
    let i = end;
    const length = mask ? dp[mask * K + end] : 0;
    while (i >= 0 && m) {
      order.push(i);
      const p = parent[m * K + i];
      m &= ~(1 << i);
      i = p;
    }
    return { length, order: order.reverse() };
  };
  return { K, dp, parent, best, pathOf, dm, fromStart };
}

/** Longueur d'un chemin ouvert (indices dans points), depuis from. */
export function pathLength(from, points, order) {
  let len = 0;
  let at = from;
  for (const i of order) {
    len += dist(at, points[i].coords);
    at = points[i].coords;
  }
  return len;
}

const respects = (order, before) => {
  if (!before.length) return true;
  const pos = new Map(order.map((x, k) => [x, k]));
  return before.every(([a, b]) => !pos.has(a) || !pos.has(b) || pos.get(a) < pos.get(b));
};

/** Chemin ouvert le plus court par force brute (≤ 7 points), contraintes « a avant b » respectées. */
export function bruteOpen(from, points, idxs, before = []) {
  let best = null;
  const n = idxs.length;
  if (!n) return { length: 0, order: [] };
  const perm = [];
  const used = new Array(n).fill(false);
  const walk = (len, at) => {
    if (best && len >= best.length - EPS) return;
    if (perm.length === n) {
      if (!best || len < best.length - EPS) best = { length: len, order: perm.slice() };
      return;
    }
    for (let k = 0; k < n; k++) {
      if (used[k]) continue;
      const x = idxs[k];
      // Un point dont un prédécesseur obligé n'est pas encore passé attend
      if (before.some(([a, b]) => b === x && idxs.includes(a) && !perm.includes(a))) continue;
      used[k] = true;
      perm.push(x);
      walk(len + dist(at, points[x].coords), points[x].coords);
      perm.pop();
      used[k] = false;
    }
  };
  walk(0, from);
  return best || { length: Infinity, order: [] };
}

/**
 * Plus proche voisin, puis 2-opt et Or-opt sur un chemin ouvert depuis startPos (indices dans points), contraintes
 * « a avant b » respectées à chaque étape. Déterministe (égalités : le plus petit indice).
 * @param {{x,y,z}} startPos
 * @param {{ coords }[]} points
 * @param {{ idxs?: number[], before?: [number, number][] }} [o] idxs : sous-ensemble (tous par défaut)
 */
export function nearestNeighbor2Opt(startPos, points, { idxs = points.map((_, i) => i), before = [] } = {}) {
  const left = new Set(idxs);
  const order = [];
  let at = startPos;
  while (left.size) {
    let pick = -1;
    let bd = Infinity;
    for (const i of [...left].sort((a, b) => a - b)) {
      if (before.some(([a, b]) => b === i && left.has(a))) continue;
      const v = dist(at, points[i].coords);
      if (v < bd - EPS) {
        bd = v;
        pick = i;
      }
    }
    if (pick < 0) pick = Math.min(...left); // contraintes en boucle : jamais ici (validées en amont)
    order.push(pick);
    left.delete(pick);
    at = points[pick].coords;
  }
  let len = pathLength(startPos, points, order);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    // 2-opt : retourner un morceau
    for (let i = 0; i < order.length - 1 && !improved; i++) {
      for (let j = i + 1; j < order.length && !improved; j++) {
        const next = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        if (!respects(next, before)) continue;
        const l = pathLength(startPos, points, next);
        if (l < len - 1e-7) {
          order.splice(0, order.length, ...next);
          len = l;
          improved = true;
        }
      }
    }
    // Or-opt : déplacer un morceau de 1 à 3 escales
    for (let size = 1; size <= 3 && !improved; size++) {
      for (let i = 0; i + size <= order.length && !improved; i++) {
        const seg = order.slice(i, i + size);
        const rest = [...order.slice(0, i), ...order.slice(i + size)];
        for (let p = 0; p <= rest.length && !improved; p++) {
          if (p === i) continue;
          const next = [...rest.slice(0, p), ...seg, ...rest.slice(p)];
          if (!respects(next, before)) continue;
          const l = pathLength(startPos, points, next);
          if (l < len - 1e-7) {
            order.splice(0, order.length, ...next);
            len = l;
            improved = true;
          }
        }
      }
    }
  }
  return { length: len, order };
}

/** Chemin ouvert d'un morceau : force brute jusqu'à 6 points, sinon plus proche voisin et 2-opt. */
export function openPath(from, points, idxs, before = []) {
  if (idxs.length <= 6) return bruteOpen(from, points, idxs, before);
  return nearestNeighbor2Opt(from, points, { idxs, before });
}

const lexCmp = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (Math.abs(d) > EPS) return d;
  }
  return 0;
};
export { lexCmp };

/**
 * Meilleure couverture.
 * @param {object} problem
 * @param {{x,y,z}} problem.startPos
 * @param {{ id, coords, stopCost }[]} problem.points triés par id
 * @param {number[]} problem.choosable indices des candidats (les parrains n'entrent que par closureOf)
 * @param {{ cands: number[] }[]} problem.units unités qui demandent une escale
 * @param {(mask: number) => number} problem.closureOf masque étendu par les parrains à faire monter
 * @param {(mask: number) => number[]} problem.classOf [traversée, déblocages, étapes]
 * @param {(mask: number, hk: object|null) => ({ w: number }|null)} problem.evaluate
 * @param {number} [problem.forcedMask] points imposés
 * @param {{ exactMax: number, maxEvaluations: number }} o
 * @returns {{ best, withoutBest: Map<number, object|null>, bestIgnoringUnlocks, exact: boolean, effort, hk }}
 */
export function bestCover(problem, { exactMax, maxEvaluations }) {
  const { points, choosable, units, closureOf, classOf, evaluate } = problem;
  const forced = problem.forcedMask || 0;
  const K = points.length;
  const memo = new Map();
  let evaluated = 0;
  let overBudget = false;
  const covers = (mask) => units.every((u) => u.cands.some((i) => mask & (1 << i)));
  const stopsCost = (mask) => bitsOf(mask).reduce((a, i) => a + points[i].stopCost, 0);
  const exactPossible = K <= exactMax;
  const hk = exactPossible ? heldKarp(problem.startPos, points) : null;
  const run = (mask) => {
    if (memo.has(mask)) return memo.get(mask);
    if (evaluated >= maxEvaluations) {
      overBudget = true;
      return undefined;
    }
    evaluated += 1;
    const ev = evaluate(mask, hk);
    const out = ev ? { mask, cls: classOf(mask), ev } : null;
    memo.set(mask, out);
    return out;
  };
  const better = (a, b) => {
    if (!b) return true;
    const c = lexCmp(a.cls, b.cls);
    if (c) return c < 0;
    if (Math.abs(a.ev.w - b.ev.w) > EPS) return a.ev.w < b.ev.w;
    const s = popcount(a.mask) - popcount(b.mask);
    if (s) return s < 0;
    return a.mask < b.mask;
  };

  if (exactPossible) {
    const seen = new Set();
    const entries = [];
    const C = choosable.length;
    for (let sub = 0; sub < 1 << C; sub++) {
      let m = forced;
      for (let k = 0; k < C; k++) if (sub & (1 << k)) m |= 1 << choosable[k];
      const cm = closureOf(m);
      if (seen.has(cm)) continue;
      seen.add(cm);
      if (!covers(cm)) continue;
      const lb = (cm ? hk.best(cm).length : 0) + stopsCost(cm);
      entries.push({ mask: cm, cls: classOf(cm), lb, stops: popcount(cm) });
    }
    entries.sort((a, b) => lexCmp(a.cls, b.cls) || a.lb - b.lb || a.stops - b.stops || a.mask - b.mask);
    const scan = (skip, ignoreUnlocks = false) => {
      let best = null;
      const list = ignoreUnlocks ? [...entries].sort((a, b) => a.cls[0] - b.cls[0] || a.lb - b.lb || a.stops - b.stops || a.mask - b.mask) : entries;
      for (const e of list) {
        if (skip(e.mask)) continue;
        if (best) {
          if (!ignoreUnlocks && lexCmp(e.cls, best.cls) > 0) break;
          if (ignoreUnlocks && e.cls[0] > best.cls[0]) break;
          if (e.lb > best.ev.w + EPS) {
            if (ignoreUnlocks) break;
            // Même classe : plus rien ne peut faire mieux dans cette classe, et la suivante est moins bonne
            break;
          }
        }
        const r = run(e.mask);
        if (r === undefined) break;
        if (!r) continue;
        if (ignoreUnlocks) {
          if (!best || r.cls[0] < best.cls[0] || (r.cls[0] === best.cls[0] && (r.ev.w < best.ev.w - EPS || (Math.abs(r.ev.w - best.ev.w) <= EPS && better(r, best))))) best = r;
        } else if (better(r, best)) best = r;
      }
      return best;
    };
    const best = scan(() => false);
    const withoutBest = new Map();
    if (best) for (const i of bitsOf(best.mask)) withoutBest.set(i, scan((mask) => !!(mask & (1 << i))));
    const bestIgnoringUnlocks = best ? scan(() => false, true) : null;
    return { best, withoutBest, bestIgnoringUnlocks, exact: !overBudget, effort: { candidates: K, evaluated }, hk };
  }

  // Approché : glouton (l'unité qui a le moins de candidats d'abord, l'ingénieur au plus petit coût marginal), puis
  // retraits, ajouts et échanges d'une escale tant que le coût baisse
  const greedy = (skipIdx = -1) => {
    let mask = closureOf(forced);
    let guard = 0;
    while (!covers(mask) && guard++ < 64) {
      const open = units.filter((u) => !u.cands.some((i) => mask & (1 << i)));
      open.sort((a, b) => a.cands.length - b.cands.length);
      const u = open[0];
      let pick = null;
      for (const i of [...u.cands].sort((a, b) => a - b)) {
        if (i === skipIdx) continue;
        const m = closureOf(mask | (1 << i));
        if (skipIdx >= 0 && m & (1 << skipIdx)) continue;
        // Coût marginal : couverture partielle évaluée comme si elle suffisait
        const r = evaluate(m, null);
        evaluated += 1;
        if (!r) continue;
        const cand = { mask: m, cls: classOf(m), ev: r };
        if (better(cand, pick)) pick = cand;
      }
      if (!pick) return null;
      mask = pick.mask;
    }
    if (!covers(mask)) return null;
    let cur = run(mask);
    if (!cur) return null;
    for (let pass = 0; pass < 50 && evaluated < maxEvaluations; pass++) {
      let next = null;
      const members = bitsOf(cur.mask);
      const tries = [];
      for (const i of members) tries.push(cur.mask & ~(1 << i));
      for (const i of choosable) if (!(cur.mask & (1 << i))) tries.push(cur.mask | (1 << i));
      for (const i of members) for (const j of choosable) if (!(cur.mask & (1 << j))) tries.push((cur.mask & ~(1 << i)) | (1 << j));
      for (const t of tries) {
        const m = closureOf(t | forced);
        if (skipIdx >= 0 && m & (1 << skipIdx)) continue;
        if (!covers(m)) continue;
        const r = run(m);
        if (r === undefined) break;
        if (r && better(r, cur) && better(r, next)) next = r;
      }
      if (!next) break;
      cur = next;
    }
    return cur;
  };
  const best = greedy();
  const withoutBest = new Map();
  if (best) for (const i of bitsOf(best.mask)) withoutBest.set(i, greedy(i));
  return { best, withoutBest, bestIgnoringUnlocks: null, exact: false, effort: { candidates: K, evaluated }, hk: null };
}
