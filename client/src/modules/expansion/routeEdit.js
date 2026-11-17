// Éditeur de route d'extension (RouteEditor.jsx) : lignes du formulaire, déplacements, et contrôle en direct avec les
// mêmes règles que le serveur (server/src/modules/expansion/route.js), portée lue dans GET /rules. Le serveur revérifie
// tout à l'enregistrement.

export const ROLE_OPTIONS = [
  ['held-stronghold', 'Déjà Forteresse'],
  ['held-fortified', 'Déjà Consolidé'],
  ['fortified', 'Objectif Consolidé'],
  ['stronghold', 'Objectif Forteresse'],
  ['target', 'Arrivée'],
];
const ROLE_NAMES = Object.fromEntries(ROLE_OPTIONS);
export const MAX_STEPS = 60;

let seq = 0;
const nextKey = () => `ligne-${++seq}`;
const al = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
const lower = (s) => String(s ?? '').trim().toLowerCase();

/** Numérotation de la colonne # (comme la liste des routes) : 0 pour le départ, puis 1, 2… */
export const rowLabel = (i) => (i === 0 ? 'Départ' : `Système n° ${i}`);

/** Saut tapé : nombre ≥ 0, virgule acceptée (« 25,4 ») ; null si vide, NaN si illisible ou négatif. */
export function parseJump(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : NaN;
  const s = String(v).trim().replace(/\s/g, '');
  if (!s) return null;
  if (!/^\d+(?:[.,]\d+)?$/.test(s)) return NaN;
  return Number(s.replace(',', '.'));
}

/** Une ligne : `from` est le système au-dessus quand le saut a été tapé ou calculé (pour repérer un saut à revoir). */
export const newRow = ({ name = '', role = 'fortified', jump = '', from = null } = {}) => ({ key: nextKey(), name, role, jump, from });

/** Brouillon d'une nouvelle route : un départ déjà tenu et une arrivée. */
export const emptyDraft = () => ({ name: '', description: '', rows: [newRow({ role: 'held-stronghold' }), newRow({ role: 'target' })] });

/** Brouillon d'une route enregistrée (réponse de GET /projects). */
export function draftFrom(p) {
  const steps = Array.isArray(p?.steps) ? p.steps : [];
  return {
    name: p?.name || '',
    description: p?.description || '',
    rows: steps.map((s, i) => newRow({ name: s.name, role: s.role, jump: i ? al(Number(s.jump) || 0) : '', from: i ? steps[i - 1].name : null })),
  };
}

export const addRow = (rows) => (rows.length >= MAX_STEPS ? rows : [...rows, newRow()]);
export const removeRow = (rows, i) => rows.filter((_, k) => k !== i);
export function moveRow(rows, i, delta) {
  const j = i + delta;
  if (j < 0 || j >= rows.length) return rows;
  const out = [...rows];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
export const setRow = (rows, i, patch) => rows.map((r, k) => {
  if (k !== i) return r;
  const next = { ...r, ...patch };
  // Un saut tapé se compte depuis le système juste au-dessus
  if ('jump' in patch) next.from = i > 0 ? rows[i - 1].name.trim() || null : null;
  return next;
});

/** Sauts calculés d'après les journaux (GET /jumps) : remplis là où ils sont connus ; nombre de sauts restés inconnus. */
export function applyJumps(rows, steps) {
  let missing = 0;
  const out = rows.map((r, i) => {
    if (i === 0) return r;
    const jump = steps?.[i]?.jump;
    if (jump == null) {
      missing += 1;
      return r;
    }
    return { ...r, jump: al(jump), from: rows[i - 1].name };
  });
  return { rows: out, missing };
}

/**
 * Contrôle en direct : par ligne { jump, error, warn }, la liste des erreurs qui bloquent l'enregistrement, et le
 * bilan (distance, saut le plus long). `reach` : { rôle: portée en AL } du serveur ; null tant qu'il n'a pas répondu.
 */
export function checkDraft(draft, reach) {
  const rows = draft.rows;
  const seen = new Map();
  const errors = [];
  const out = rows.map((r, i) => {
    const name = r.name.trim();
    const label = name || rowLabel(i);
    let error = null;
    let warn = null;
    const jump = i > 0 ? parseJump(r.jump) : 0;
    if (!name) error = 'nom manquant';
    else if (seen.has(lower(name))) {
      const j = seen.get(lower(name));
      error = `déjà sur la route (${j ? `n° ${j}` : 'c’est le départ'})`;
    }
    if (name && !seen.has(lower(name))) seen.set(lower(name), i);
    if (!error && i > 0) {
      const prev = rows[i - 1];
      const prevName = prev.name.trim() || (i === 1 ? 'le départ' : `le n° ${i - 1}`);
      if (Number.isNaN(jump)) error = 'saut illisible : tape une distance en AL, 0 ou plus (25,4 par exemple)';
      else if (jump == null) warn = 'saut vide : calculé depuis tes journaux à l’enregistrement si tu es passé dans les deux systèmes';
      else if (reach) {
        const max = reach[prev.role] ?? 0;
        if (!max) error = `${prevName} est une arrivée : elle ne sert pas d’appui pour aller plus loin`;
        else if (jump > max) error = `hors de portée : ${al(jump)} AL depuis ${prevName}, ${max} AL au plus depuis un système ${ROLE_NAMES[prev.role].replace(/^(Déjà|Objectif) /, '')}`;
      }
      if (!error && !warn && r.from && lower(r.from) !== lower(prev.name)) warn = `saut mesuré depuis ${r.from} : vérifie-le, le système au-dessus a changé`;
    }
    if (error) errors.push(`${label} : ${error}`);
    return { key: r.key, jump, error, warn };
  });
  if (rows.length < 2) errors.unshift('Il faut au moins deux systèmes : le départ et l’arrivée.');
  if (rows.length > MAX_STEPS) errors.unshift(`Une route a au plus ${MAX_STEPS} systèmes.`);
  const jumps = out.slice(1).map((r) => (Number.isFinite(r.jump) ? r.jump : 0));
  return {
    rows: out,
    errors,
    distance: Math.round(jumps.reduce((a, b) => a + b, 0) * 100) / 100,
    longest: jumps.length ? Math.max(...jumps) : 0,
  };
}

/** Corps envoyé au serveur (POST ou PUT /projects) : le saut tel que tapé, le serveur le relit. */
export function payload(draft) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    steps: draft.rows.map((r, i) => ({ name: r.name.trim(), role: r.role, jump: i ? String(r.jump ?? '').trim() : '' })),
  };
}
