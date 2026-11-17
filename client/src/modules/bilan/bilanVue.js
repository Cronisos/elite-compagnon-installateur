// Bilans de session : textes et comparaisons (fonctions pures, testées par bilanVue.test.js).

import { compact, duration, int } from '../../core/format.js';
import { MODES } from '../../core/modes.js';

/** Nom d'un mode de jeu (« ✚ Sauvetage »), ou son identifiant. */
export const nomMode = (id) => {
  const m = MODES.find((x) => x.id === id);
  return m ? `${m.icon} ${m.label}` : String(id || '—');
};

/** Crédits signés et compacts : « +3,0 M cr », « −120 k cr », « — ». */
export function credits(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${compact(Math.abs(v))} cr`;
}

/** Écart à la moyenne, en pour cent : « +25 % », « −10 % », null sans moyenne. */
export function ecart(valeur, moyenne) {
  if (valeur == null || !moyenne) return null;
  const p = Math.round(((valeur - moyenne) / Math.abs(moyenne)) * 100);
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)} %`;
}

/** Chiffres clés d'un bilan de session, dans l'ordre d'affichage : [{ label, valeur, sous }]. */
export function chiffres(b, comp = null) {
  return [
    { label: 'Durée', valeur: duration(b.duree / 1000) },
    { label: 'Crédits', valeur: credits(b.gain), sous: b.gainHeure != null ? `${credits(b.gainHeure)}/h${comp?.gainHeure ? ` · ${ecart(b.gainHeure, comp.gainHeure)} vs d'habitude` : ''}` : '' },
    { label: 'Mérites', valeur: int(b.merites), sous: b.meritesHeure != null ? `${int(b.meritesHeure)}/h${comp?.meritesHeure ? ` · ${ecart(b.meritesHeure, comp.meritesHeure)} vs d'habitude` : ''}` : '' },
    { label: 'Matériaux', valeur: int(b.materiauxTotal), sous: b.materiaux?.some(Boolean) ? b.materiaux.map((n, i) => (n ? `G${i + 1} ${int(n)}` : null)).filter(Boolean).join(' · ') : '' },
    { label: 'Morts', valeur: int(b.morts) },
    { label: 'Sauts', valeur: int(b.sauts), sous: b.distance ? `${int(b.distance)} al` : '' },
  ];
}
