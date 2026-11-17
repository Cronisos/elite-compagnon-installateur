// Déduction des fourchettes de progression de rang (colonne « climb » de RANK_TABLE, report du surplus) à partir
// des séquences de montée lues dans le journal (ranks.js, buildRankLog). C'est d'ici, et seulement d'ici, que
// viennent les chiffres « déduits » de rankRules.js : un test (ranks.test.js) refait la déduction sur les séquences
// versionnées (rankSequences.json) et vérifie que la table déclarée en est bien la sortie.
//
// Hypothèses (écrites, à vérifier en jeu) :
//   H1  chaque application à l'atelier rapporte un nombre de points qui ne dépend que de son grade (p1 = 1, p2, p3,
//       p4), quel que soit le rang ;
//   H2  chaque rang r a son seuil T_r : le rang monte sur l'application qui atteint le seuil (celle d'avant était
//       dessous) ; sans montée écrite, les points restent sous le seuil ;
//   H3  le surplus (points − seuil) passe au rang suivant, en points ;
//   H4  à distance, et pour un effet expérimental, 0 point (le rang ne bouge pas à distance : mesuré) ;
//   H5  RankProgress est le pourcentage entier tronqué : k ≤ 100 · points / T_r < k + 1 ;
//   H6  au déblocage, 0 point. Le rang 1 au déblocage est mesuré (3 déblocages sur 3), le 0 % ne l'est pas : les 3
//       événements de déblocage n'écrivent pas de progression, et aucun relevé ne tombe entre un déblocage et la
//       première application. Appui : Juri Ishmaak, rang 1 à 0 % à chaque relevé, sans aucune application.
// Une application au lieu inconnu (ni atelier ni distance) écarte sa séquence : on ne sait pas si elle a compté.
// Inégalités strictes (« sous le seuil », « < k + 1 % ») : avec une marge de EPS point (un dix-millième d'un G1).
// Une borne haute vient presque toujours d'une inégalité stricte : elle n'est pas atteinte (le calcul la traite ainsi,
// voir CLIMB_TOL dans rankRules.js).
//
// Gain d'une application, en % du rang : 100 · p_g / T_r. Chaque borne est le plus petit (ou le plus grand) gain
// compatible avec TOUTES les séquences à la fois, trouvé par programme linéaire (simplexe) et bissection. Une borne
// que les séquences ne contraignent pas est dite « non bornée » (null) : jamais remplacée par un chiffre inventé.

export const EPS = 1e-4; // marge des inégalités strictes, en points
const BASE_VARS = ['p2', 'p3', 'p4', 'T1', 'T2', 'T3', 'T4'];
const FLOOR = 1e-3; // points d'un grade et seuils : strictement positifs
const MIN_GAIN = 0.01; // % : sous ce gain, une borne basse est dite non bornée
const MAX_GAIN = 1000; // % : au-delà, une borne haute est dite non bornée
const MAX_RATIO = 100; // rapport de seuils T_r / T_r+1 : au-delà, non borné
const STEPS = 50; // bissection

/**
 * Faisabilité d'un système linéaire (variables ≥ 0) : simplexe en deux phases (phase 1 seule), règle de Bland.
 * @param {number} n nombre de variables
 * @param {{ a: number[], op: '<='|'>=', b: number }[]} cons
 * @returns {boolean}
 */
export function feasible(n, cons) {
  const rows = cons.map((c) => (c.b < 0 ? { a: c.a.map((v) => -v), b: -c.b, op: c.op === '<=' ? '>=' : '<=' } : c));
  const m = rows.length;
  const nArt = rows.filter((r) => r.op === '>=').length;
  const N = n + m + nArt; // variables, écarts, artificielles
  const T = [];
  const basis = [];
  let art = n + m;
  rows.forEach((r, i) => {
    const row = new Float64Array(N + 1);
    for (let j = 0; j < n; j++) row[j] = r.a[j] || 0;
    if (r.op === '<=') {
      row[n + i] = 1;
      basis.push(n + i);
    } else {
      row[n + i] = -1;
      row[art] = 1;
      basis.push(art++);
    }
    row[N] = r.b;
    T.push(row);
  });
  // Phase 1 : minimiser la somme des artificielles (coûts réduits z)
  const z = new Float64Array(N + 1);
  for (let j = n + m; j < N; j++) z[j] = 1;
  T.forEach((row, i) => {
    if (basis[i] >= n + m) for (let j = 0; j <= N; j++) z[j] -= row[j];
  });
  const tol = 1e-9;
  for (let it = 0; it < 20000; it++) {
    let e = -1;
    for (let j = 0; j < N; j++) {
      if (z[j] < -tol) {
        e = j;
        break;
      }
    }
    if (e < 0) break;
    let l = -1;
    let best = Infinity;
    for (let i = 0; i < m; i++) {
      if (T[i][e] > tol) {
        const ratio = T[i][N] / T[i][e];
        if (ratio < best - 1e-12 || (Math.abs(ratio - best) <= 1e-12 && basis[i] < basis[l])) {
          best = ratio;
          l = i;
        }
      }
    }
    if (l < 0) break; // non borné : impossible en phase 1 (objectif ≥ 0)
    const pv = T[l][e];
    for (let j = 0; j <= N; j++) T[l][j] /= pv;
    for (let i = 0; i < m; i++) {
      if (i === l) continue;
      const f = T[i][e];
      if (f !== 0) for (let j = 0; j <= N; j++) T[i][j] -= f * T[l][j];
    }
    const f = z[e];
    for (let j = 0; j <= N; j++) z[j] -= f * T[l][j];
    basis[l] = e;
  }
  return -z[N] < 1e-7;
}

// Expressions linéaires : { c: { variable: coefficient }, k: constante }
const lin = (c = {}, k = 0) => ({ c: { ...c }, k });
const add = (x, y) => {
  const c = { ...x.c };
  for (const [v, w] of Object.entries(y.c)) c[v] = (c[v] || 0) + w;
  return { c, k: x.k + y.k };
};
const scale = (x, s) => ({ c: Object.fromEntries(Object.entries(x.c).map(([v, w]) => [v, w * s])), k: x.k * s });
const P = (g) => (g === 1 ? lin({}, 1) : lin({ [`p${g}`]: 1 }));
const Tr = (r) => lin({ [`T${r}`]: 1 });

/** Points d'une application (H1, H4), ou undefined si son lieu est inconnu. */
function pointsOf(a) {
  if (a.experimental || a.place === 'distance') return lin();
  if (a.place !== 'atelier') return undefined;
  return P(a.grade);
}

/** « G1 G3d G5x G2? » ↔ applications { grade, place, experimental } (d : à distance, x : effet expérimental, ? : lieu inconnu). */
export function parseApplications(text) {
  return String(text || '').split(/\s+/).filter(Boolean).map((tok) => {
    const m = /^G(\d)([dx?]?)$/.exec(tok);
    if (!m) throw new Error(`application illisible : ${tok}`);
    return { grade: Number(m[1]), place: m[2] === 'd' ? 'distance' : m[2] === '?' ? 'inconnu' : 'atelier', experimental: m[2] === 'x' };
  });
}
export function compactApplications(list) {
  return list.map((a) => `G${a.grade}${a.experimental ? 'x' : a.place === 'distance' ? 'd' : a.place === 'atelier' ? '' : '?'}`).join(' ');
}

/** Séquences du journal (buildRankLog) → forme versionnée (rankSequences.json) : rien d'autre que les ingénieurs. */
export function compactSequences(sequences) {
  return sequences
    .filter((s) => s.rank != null && s.rank < 5)
    .map((s) => ({
      engineer: s.engineer,
      rank: s.rank,
      start: { kind: s.start.kind, at: s.start.at ?? null, progress: s.start.progress ?? null },
      end: { kind: s.end.kind, at: s.end.at ?? null, ...(s.end.progress != null ? { progress: s.end.progress } : {}), ...(s.end.rank != null ? { rank: s.end.rank } : {}), ...(s.end.toRank != null ? { toRank: s.end.toRank } : {}) },
      applications: typeof s.applications === 'string' ? s.applications : compactApplications(s.applications),
    }))
    .sort((a, b) => a.engineer.localeCompare(b.engineer) || String(a.start.at).localeCompare(String(b.start.at)));
}

/**
 * Système linéaire des séquences (H1 à H6). Les séquences d'un ingénieur sont enchaînées : une montée passe son
 * surplus à la suivante (H3), un relevé de fin sert de départ à la séquence qui commence à ce relevé.
 * @param {object[]} sequences forme versionnée (applications en texte) ou celle de buildRankLog
 * @returns {{ vars: string[], cons: object[], used: number, skipped: { engineer, rank, why }[] }}
 */
export function buildSystem(sequences) {
  const vars = [...BASE_VARS];
  const raw = [];
  const rel = (x, op, y) => raw.push({ d: add(x, scale(y, -1)), op });
  const ge = (x, y) => rel(x, '>=', y);
  const lt = (x, y) => rel(x, '<=', add(y, lin({}, -EPS)));
  const snap = (r, x, k) => {
    ge(scale(x, 100), scale(Tr(r), k));
    lt(scale(x, 100), scale(Tr(r), k + 1));
  };
  const fresh = () => {
    const v = `x${vars.length}`;
    vars.push(v);
    return lin({ [v]: 1 });
  };
  for (const v of BASE_VARS) ge(lin({ [v]: 1 }), lin({}, FLOOR));

  const byEngineer = new Map();
  for (const s of sequences) {
    if (!byEngineer.has(s.engineer)) byEngineer.set(s.engineer, []);
    byEngineer.get(s.engineer).push(s);
  }
  let used = 0;
  const skipped = [];
  for (const list of byEngineer.values()) {
    list.sort((a, b) => String(a.start.at).localeCompare(String(b.start.at)));
    let prev = null; // { seq, endPoints, carry }
    for (const s of list) {
      const apps = typeof s.applications === 'string' ? parseApplications(s.applications) : s.applications;
      const pts = apps.map(pointsOf);
      const why = s.rank == null || s.rank >= 5 ? 'rang 5 ou inconnu'
        : apps.some((a) => a.grade < 1 || a.grade > s.rank) ? 'grade au-dessus du rang'
          : pts.some((p) => p === undefined) ? 'application au lieu inconnu' : null;
      if (why) {
        skipped.push({ engineer: s.engineer, rank: s.rank, why });
        prev = null;
        continue;
      }
      let start;
      if (s.start.kind === 'déblocage') start = lin(); // H6
      else if (s.start.kind === 'relevé') {
        // Relevé de fin de la séquence d'avant, au même rang et au même % : aucune application entre les deux (sinon
        // une séquence les porterait), donc les mêmes points, même si d'autres relevés sans application sont passés
        const linked = prev && prev.seq.end.kind === 'relevé' && prev.seq.rank === s.rank && prev.seq.end.rank == null && prev.seq.end.progress != null && prev.seq.end.progress === s.start.progress;
        if (linked) start = prev.endPoints;
        else {
          start = fresh();
          if (s.start.progress != null) snap(s.rank, start, s.start.progress);
        }
      } else {
        const linked = prev && prev.seq.end.kind === 'montée' && prev.seq.end.toRank === s.rank && prev.seq.end.at === s.start.at;
        start = linked ? prev.carry : fresh(); // report inconnu : seulement ≥ 0
      }
      const sum = (list2) => list2.reduce((x, y) => add(x, y), lin());
      const all = add(start, sum(pts));
      let carry = null;
      if (s.end.kind === 'montée') {
        if (pts.length) lt(add(start, sum(pts.slice(0, -1))), Tr(s.rank));
        ge(all, Tr(s.rank));
        carry = add(all, scale(Tr(s.rank), -1)); // H3
      } else {
        lt(all, Tr(s.rank)); // pas de montée écrite : sous le seuil (H2)
        if (s.end.kind === 'relevé' && s.end.rank == null && s.end.progress != null) snap(s.rank, all, s.end.progress);
      }
      used++;
      prev = { seq: s, endPoints: all, carry };
    }
  }
  const index = new Map(vars.map((v, i) => [v, i]));
  const cons = raw.map(({ d, op }) => {
    const a = new Array(vars.length).fill(0);
    for (const [v, w] of Object.entries(d.c)) a[index.get(v)] += w;
    return { a, op, b: -d.k };
  });
  return { vars, cons, used, skipped };
}

/** Contrainte « a·x op b » sur les variables de base (p2…T4), complétée de zéros. */
function extra(sys, coefs, op, b) {
  const a = new Array(sys.vars.length).fill(0);
  for (const [v, w] of Object.entries(coefs)) a[sys.vars.indexOf(v)] += w;
  return { a, op, b };
}

/** Plus grand c tel que le système plus « f(c) ≥ 0 » reste faisable (f décroissante en c), ou null si ≥ hi. */
function supremum(sys, make, hi) {
  const ok = (c) => feasible(sys.vars.length, [...sys.cons, make(c)]);
  if (ok(hi)) return null;
  let lo = 0;
  let top = hi;
  for (let i = 0; i < STEPS; i++) {
    const mid = (lo + top) / 2;
    if (ok(mid)) lo = mid;
    else top = mid;
  }
  return lo;
}
/** Plus petit c tel que le système plus « g(c) ≤ 0 » reste faisable (g décroissante en c), ou null si ≤ lo. */
function infimum(sys, make, lo, hi) {
  const ok = (c) => feasible(sys.vars.length, [...sys.cons, make(c)]);
  if (ok(lo)) return null;
  let bottom = lo;
  let top = hi;
  for (let i = 0; i < STEPS; i++) {
    const mid = (bottom + top) / 2;
    if (ok(mid)) top = mid;
    else bottom = mid;
  }
  return top;
}

/**
 * Bornes déduites des séquences.
 * @returns {{ feasible: boolean, used: number, skipped: object[],
 *   gains: { rank, grade, min: number|null, max: number|null }[],  min/max en % du rang ; null : non bornée
 *   carry: { from, to, ratioMax: number|null }[] }}  report : surplus en % du rang r × T_r / T_r+1 au plus
 */
export function deduceRankModel(sequences) {
  const sys = buildSystem(sequences);
  const ok = feasible(sys.vars.length, sys.cons);
  const out = { feasible: ok, used: sys.used, skipped: sys.skipped, gains: [], carry: [] };
  if (!ok) return out;
  for (let r = 1; r <= 4; r++) {
    for (let g = 1; g <= r; g++) {
      // 100·p_g − c·T_r ≥ 0 (gain ≥ c) ; ≤ 0 (gain ≤ c). p1 = 1 : constante.
      const make = (op) => (c) => (g === 1
        ? extra(sys, { [`T${r}`]: -c }, op, -100)
        : extra(sys, { [`p${g}`]: 100, [`T${r}`]: -c }, op, 0));
      const max = supremum(sys, make('>='), MAX_GAIN);
      const min = infimum(sys, make('<='), MIN_GAIN, MAX_GAIN);
      out.gains.push({ rank: r, grade: g, min, max });
    }
  }
  for (let r = 1; r <= 3; r++) {
    const ratioMax = supremum(sys, (c) => extra(sys, { [`T${r}`]: 1, [`T${r + 1}`]: -c }, '>=', 0), MAX_RATIO);
    out.carry.push({ from: r, to: r + 1, ratioMax });
  }
  return out;
}

/**
 * Pire cas du modèle, pour le scénario prudent du calcul (calc.js) : le rang peut-il encore rester sous son seuil après
 * ces applications à l'atelier, dans un modèle compatible avec TOUTES les séquences à la fois (H1 à H6) ? Sinon, la
 * montée est sûre. Une contrainte s'ajoute au système des séquences, avec le départ le plus bas possible (un relevé à
 * k % vaut au moins k % du rang ; après une montée, le report vaut au moins 0) :
 *     fromPercent / 100 · T_r + Σ_g n_g · p_g ≤ T_r − EPS
 * Les bornes de la table, elles, viennent chacune d'un modèle différent : additionnées, elles demandent parfois une ou
 * deux applications de plus que n'importe quel modèle compatible avec les journaux (Selene Jean, 1er nov. : rang 4,
 * relevé à 0 %, 2 G1, 3 G2, 4 G3 et 2 G4 ont suffi ; les bornes basses de la table en demandaient 4 G4).
 * @param {object[]} sequences forme versionnée (rankSequences.json)
 * @returns {{ feasible: boolean, canStayBelow: (rank: number, fromPercent: number, counts: number[]) => boolean }}
 *   counts : applications par grade (counts[g], g de 1 à rank) ; réponses mémorisées par (rang, départ, comptes).
 *   Système des séquences infaisable : feasible false, et canStayBelow toujours vrai (le calcul garde alors la table).
 */
const MEMO_MAX = 100000;
export function worstCaseModel(sequences) {
  const sys = buildSystem(sequences);
  const ok = feasible(sys.vars.length, sys.cons);
  const memo = new Map();
  const canStayBelow = (rank, fromPercent, counts) => {
    if (!ok || !(rank >= 1 && rank <= 4)) return true;
    const from = Math.max(0, Number(fromPercent) || 0);
    const n = Array.from({ length: rank }, (_, i) => Math.max(0, Number(counts?.[i + 1]) || 0));
    const key = `${rank}|${from.toFixed(6)}|${n.join(',')}`;
    if (memo.has(key)) return memo.get(key);
    // Σ_{g ≥ 2} n_g · p_g + (from / 100 − 1) · T_r ≤ −EPS − n_1 (p1 = 1)
    const coefs = { [`T${rank}`]: from / 100 - 1 };
    for (let g = 2; g <= rank; g++) if (n[g - 1]) coefs[`p${g}`] = n[g - 1];
    const res = feasible(sys.vars.length, [...sys.cons, extra(sys, coefs, '<=', -EPS - n[0])]);
    if (memo.size >= MEMO_MAX) memo.clear(); // le serveur tourne longtemps : la mémoire reste bornée
    memo.set(key, res);
    return res;
  };
  return { feasible: ok, canStayBelow };
}

/** Arrondis de la table : borne basse vers le bas, borne haute vers le haut (4 décimales), jamais plus serrés. */
export const floor4 = (x) => Math.floor(x * 1e4) / 1e4;
export const ceil4 = (x) => Math.ceil(x * 1e4) / 1e4;

/**
 * Valeurs de la table tirées de la déduction : gainMin (0 si non bornée : le calcul prudent ne compte alors rien),
 * gainMax (null si non bornée), rapport de report au plus. C'est ce que rankRules.js doit déclarer.
 */
export function tableFromModel(model) {
  return {
    gains: model.gains.map((g) => ({
      rank: g.rank,
      grade: g.grade,
      gainMin: g.min == null ? 0 : floor4(g.min),
      gainMax: g.max == null ? null : ceil4(g.max),
      lowerUnbounded: g.min == null,
    })),
    carry: model.carry.map((c) => ({ from: c.from, to: c.to, ratioMax: c.ratioMax == null ? null : ceil4(c.ratioMax) })),
  };
}
