// Phrase venue d'ailleurs (POST /api/modules/compagnon/dire) : un autre module (le copilote IA…) fait parler le
// compagnon avec son avatar et sa bulle. Le compagnon ne sait pas d'où elle vient : il vérifie seulement la forme.

import { MOOD_LABELS } from './categories.js';

export const MAX_TEXTE = 600;
export const MIN_MS = 4_000;
export const MAX_MS = 30_000; // une réponse se lit plus longtemps qu'une réplique

/** Durée de la bulle : le temps de la lire. */
export const dureeBulle = (texte) => Math.min(MAX_MS, Math.max(MIN_MS, 2_500 + String(texte).length * 60));

/** @returns {{ text, mood, ms, source, parler, voix, vitesse, hauteur, volume, audio } | { error }} */
export function phraseExterne(body) {
  const b = body && typeof body === 'object' ? body : {};
  const text = typeof b.texte === 'string' ? b.texte.replace(/\s+/g, ' ').trim() : '';
  if (!text || text.length > MAX_TEXTE) return { error: `Texte attendu (1 à ${MAX_TEXTE} caractères).` };
  const mood = b.humeur == null ? 'neutre' : b.humeur;
  if (!Object.hasOwn(MOOD_LABELS, mood)) return { error: `Humeur inconnue : ${Object.keys(MOOD_LABELS).join(', ')}.` };
  const source = typeof b.source === 'string' && /^[a-z0-9-]{1,20}$/.test(b.source) ? b.source : null;
  if (b.parler != null && typeof b.parler !== 'boolean') return { error: '« parler » : vrai ou faux.' };
  const voix = typeof b.voix === 'string' && b.voix.trim().length <= 100 && !/[\u0000-\u001f]/.test(b.voix) ? b.voix.trim() || null : null;
  const borne = (v, min, max) => (typeof v === 'number' && v >= min && v <= max ? v : 1);
  // Son déjà prêt (voix naturelle) : un chemin de l'API locale d'un module, rien d'autre
  const audio = typeof b.audio === 'string' && /^\/api\/modules\/[a-z0-9-]{1,30}\/[a-z0-9/_-]{1,60}$/.test(b.audio) ? b.audio : null;
  return { text, mood, ms: dureeBulle(text), source, parler: b.parler === true, voix, vitesse: borne(b.vitesse, 0.5, 2), hauteur: borne(b.hauteur, 0, 2), volume: borne(b.volume, 0, 1), audio };
}
