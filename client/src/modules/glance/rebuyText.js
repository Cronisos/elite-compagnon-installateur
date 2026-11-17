// Textes et couleurs de la case « Rachat » (Rebuy.jsx), à part pour être testés sans React.

import { compact, int } from '../../core/format.js';

export const GREEN = '#5fd38d';
export const RED = '#ff4d4d';
const GREY = '#8a94a0';

// Couleur du mode de jeu : l'Open (autres joueurs) ressort en orange, le groupe privé en bleu
const MODE_COLORS = new Map([['Open', '#ff9a3c'], ['Solo', GREY], ['Group', '#6fb6ff']]);

/** Libellé du mode de jeu : « Open », « Solo », « Groupe privé « EDFR » ». */
export function modeText(mode) {
  if (!mode) return null;
  return mode.group ? `${mode.label} « ${mode.group} »` : mode.label;
}

/** Couleur du mode de jeu (clé venue du journal, LoadGame.GameMode) ; mode inconnu : gris clair. */
export const modeColor = (mode) => MODE_COLORS.get(mode?.mode) || '#dfe4ea';

/** État du rachat : texte, couleur et sous-titre. */
export function rebuyStatus(r) {
  if (r.covered === true) {
    const sub = r.rebuy === 0 ? 'rachat gratuit' : r.times != null ? `${int(r.times)} rachat${r.times > 1 ? 's' : ''} d'avance` : '';
    return { text: 'Couvert ✓', color: GREEN, sub };
  }
  if (r.covered === false) return { text: 'NON COUVERT', color: RED, sub: `il manque ${compact(r.missing)} cr` };
  return { text: 'crédits inconnus', color: GREY, sub: 'attends le prochain relevé du solde' };
}
