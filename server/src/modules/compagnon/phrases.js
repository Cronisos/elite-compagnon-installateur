// Phrases du compagnon : validation (phrases par défaut et phrases d'un pack du joueur) et fusion.
//
// Une phrase est du texte seul, jamais du HTML : la page l'affiche comme du texte. Format accepté :
//   "Texte"                                     → humeur neutre
//   { "texte": "…", "humeur": "content", "cas": "soir" }
// « cas » réserve la phrase à un cas de la catégorie (bonjour du soir, refus pour cause de distance…) ;
// sans cas, elle sert dans tous.

import { CATEGORY_MAP, MOODS, varsOf } from './categories.js';

export const MAX_TEXT = 220;
export const MAX_PER_CATEGORY = 40;
export const MAX_TOTAL = 600;

// Caractères de contrôle et d'inversion de sens d'écriture : remplacés par une espace
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;
const MOOD_SET = new Set(MOODS);

/** Texte nettoyé (espaces resserrées), ou null s'il est vide ou trop long. */
export function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const s = value.replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim();
  return s && s.length <= max ? s : null;
}

/** Variables {xxx} d'un texte. */
export const placeholders = (text) => [...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);

/**
 * Phrases validées.
 * @param raw objet { catégorie: [phrases] } lu dans un fichier JSON
 * @returns {{ phrases: Record<string, {texte: string, humeur: string, cas?: string}[]>, errors: string[], count: number }}
 */
export function cleanPhrases(raw) {
  const phrases = {};
  const errors = [];
  let count = 0;
  if (raw == null) return { phrases, errors, count };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { phrases, errors: ['« phrases » doit être un objet { catégorie: [phrases] }.'], count };
  for (const key of Object.keys(raw)) {
    const def = CATEGORY_MAP.get(key);
    if (!def) {
      errors.push(`Catégorie inconnue : « ${String(key).slice(0, 40)} ».`);
      continue;
    }
    const list = raw[key];
    if (!Array.isArray(list)) {
      errors.push(`${key} : une liste de phrases est attendue.`);
      continue;
    }
    if (list.length > MAX_PER_CATEGORY) errors.push(`${key} : ${list.length} phrases, seules les ${MAX_PER_CATEGORY} premières sont gardées.`);
    const vars = varsOf(key);
    const cases = new Set(def.cases || []);
    const out = [];
    list.slice(0, MAX_PER_CATEGORY).forEach((item, i) => {
      const where = `${key} n° ${i + 1}`;
      if (count >= MAX_TOTAL) return;
      const obj = typeof item === 'string' ? { texte: item } : item;
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return errors.push(`${where} : texte ou objet { texte, humeur } attendu.`);
      const texte = cleanText(Object.hasOwn(obj, 'texte') ? obj.texte : null, MAX_TEXT);
      if (!texte) return errors.push(`${where} : texte vide ou de plus de ${MAX_TEXT} caractères.`);
      const unknown = placeholders(texte).filter((p) => !vars.has(p));
      if (unknown.length) return errors.push(`${where} : variable inconnue {${unknown[0].slice(0, 30)}}.`);
      let humeur = Object.hasOwn(obj, 'humeur') ? obj.humeur : 'neutre';
      if (!MOOD_SET.has(humeur)) {
        errors.push(`${where} : humeur « ${String(humeur).slice(0, 30)} » inconnue, neutre à la place.`);
        humeur = 'neutre';
      }
      const phrase = { texte, humeur };
      if (Object.hasOwn(obj, 'cas') && obj.cas != null) {
        if (!cases.has(obj.cas)) return errors.push(`${where} : cas « ${String(obj.cas).slice(0, 30)} » inconnu pour cette catégorie.`);
        phrase.cas = obj.cas;
      }
      out.push(phrase);
      count += 1;
    });
    if (out.length) phrases[key] = out;
  }
  return { phrases, errors, count };
}

/**
 * Phrases d'un pack ajoutées à celles par défaut, ou à leur place (replace) pour les catégories que le pack remplit.
 */
export function mergePhrases(base, extra, replace = false) {
  const out = {};
  for (const id of CATEGORY_MAP.keys()) {
    const own = Object.hasOwn(extra || {}, id) ? extra[id] : [];
    const def = Object.hasOwn(base || {}, id) ? base[id] : [];
    out[id] = replace && own.length ? [...own] : [...def, ...own];
  }
  return out;
}
