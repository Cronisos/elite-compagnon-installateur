// Règles d'une route d'extension Powerplay : on ne prend un système qu'à portée du précédent, portée lue dans le
// dépôt des règles (server/src/regles/powerplay.js : 20 AL depuis un système Consolidé, 30 AL depuis une Forteresse).
// Vérification d'une route reçue par l'API (création et modification) : noms, objectifs, sauts, portée.

import { ACQUISITION_REACH_FORTIFIED_LY, ACQUISITION_REACH_STRONGHOLD_LY } from '../../regles/powerplay.js';

/** Portée (AL) d'un système selon son rôle sur la route : celle de la Forteresse ou du Consolidé qu'il est ou sera. */
export const REACH = Object.freeze({
  'held-stronghold': ACQUISITION_REACH_STRONGHOLD_LY,
  'held-fortified': ACQUISITION_REACH_FORTIFIED_LY,
  stronghold: ACQUISITION_REACH_STRONGHOLD_LY,
  fortified: ACQUISITION_REACH_FORTIFIED_LY,
});
const HELD = ['held-stronghold', 'held-fortified'];
export const ROLES = [...Object.keys(REACH), 'target'];
export const MAX_STEPS = 60;
const MAX_JUMP = 10_000; // au-delà, une faute de frappe (la portée la refuserait de toute façon)

const text = (v, max) => String(v ?? '').trim().slice(0, max);
const al = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

/**
 * Saut lu dans un formulaire : nombre fini ≥ 0, virgule décimale acceptée (« 25,4 »).
 * null : vide ou absent ; NaN : illisible ou négatif.
 */
export function parseJump(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 && v <= MAX_JUMP ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const s = v.trim().replace(/\s/g, '');
  if (!s) return null;
  if (!/^\d+(?:[.,]\d+)?$/.test(s)) return NaN;
  const n = Number(s.replace(',', '.'));
  return n <= MAX_JUMP ? n : NaN;
}

/** Sauts plus longs que la portée du système de départ. */
export function rangeErrors(steps) {
  return steps.slice(1).flatMap((s, i) => {
    const reach = REACH[steps[i].role] ?? 0;
    return s.jump > reach ? [`${s.name} : ${al(s.jump)} AL depuis ${steps[i].name}, portée ${reach} AL`] : [];
  });
}

/**
 * Route reçue par l'API ({ name, description, steps: [{ name, role, jump }] }) : { route } vérifiée, ou { error } en
 * français. `canon(nom)` : l'orthographe du journal si le système y figure (le joueur peut taper en minuscules) ;
 * `distance(a, b)` : saut calculé depuis les positions du journal, pour un saut laissé vide (null si inconnu).
 */
export function cleanRoute(body, { canon = (n) => n, distance = () => null } = {}) {
  const raw = body?.steps;
  if (!Array.isArray(raw) || raw.length < 2) return { error: 'Une route a au moins deux systèmes : le départ et l’arrivée.' };
  if (raw.length > MAX_STEPS) return { error: `Une route a au plus ${MAX_STEPS} systèmes.` };
  const steps = [];
  const seen = new Set();
  for (const [i, s] of raw.entries()) {
    const typed = typeof s?.name === 'string' ? text(s.name, 120) : '';
    // Même numérotation que la colonne # de l'éditeur et de la liste des routes : 0 pour le départ
    if (!typed) return { error: `${i === 0 ? 'Départ' : `Système n° ${i}`} : nom manquant.` };
    const name = canon(typed) || typed;
    if (seen.has(name.toLowerCase())) return { error: `${name} apparaît deux fois sur la route.` };
    seen.add(name.toLowerCase());
    if (!ROLES.includes(s?.role)) return { error: `${name} : objectif inconnu.` };
    let jump = 0;
    if (i > 0) {
      const prev = steps[i - 1].name;
      jump = parseJump(s?.jump);
      if (jump === null) jump = distance(prev, name) ?? null;
      if (jump === null) return { error: `${name} : saut manquant (distance en AL depuis ${prev}). Tape-la, ou passe dans les deux systèmes pour que l’app la calcule.` };
      if (Number.isNaN(jump)) return { error: `${name} : saut illisible « ${text(s?.jump, 20)} ». Tape une distance en AL, 0 ou plus (25,4 par exemple).` };
      jump = Math.round(jump * 100) / 100;
    }
    steps.push({ name, jump, role: s.role });
  }
  const errors = rangeErrors(steps);
  if (errors.length) return { error: `Saut hors de portée. ${errors.join(' · ')}` };
  const str = (v, max) => (typeof v === 'string' ? text(v, max) : '');
  return { route: { name: str(body.name, 120) || 'Sans nom', description: str(body.description, 2000), steps } };
}

export function summary(steps) {
  const jumps = steps.slice(1).map((s) => Number(s.jump) || 0);
  return {
    toTake: steps.filter((s) => !HELD.includes(s.role)).length,
    strongholds: steps.filter((s) => s.role === 'stronghold').length,
    distance: Math.round(jumps.reduce((sum, j) => sum + j, 0) * 100) / 100,
    longest: jumps.length ? Math.max(...jumps) : 0,
  };
}
