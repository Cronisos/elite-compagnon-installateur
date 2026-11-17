// Mise en forme du moniteur PC (sans React, testée) : Go, pourcentages, couleur des jauges.

export const VERT = '#5fd38d';
export const AMBRE = '#ffb547';
export const ROUGE = '#ff4d4d';

/** Mo → « 19,8 » (Go, une décimale). */
export const go = (mo) => (mo == null ? '—' : (mo / 1024).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

/** Couleur d'une charge en % : vert, ambre à partir de 75, rouge à partir de 90. */
export const couleurCharge = (pct) => (pct == null ? '#8a94a0' : pct >= 90 ? ROUGE : pct >= 75 ? AMBRE : VERT);

/** Couleur de la mémoire vidéo selon ce qui reste libre : rouge sous 1 Go (le copilote IA décharge), ambre sous 3. */
export const couleurVram = (libreMo) => (libreMo == null ? '#8a94a0' : libreMo < 1024 ? ROUGE : libreMo < 3072 ? AMBRE : VERT);

/** Couleur de la température de la carte : ambre à partir de 75 °C, rouge à partir de 85. */
export const couleurTemp = (c) => (c == null ? '#8a94a0' : c >= 85 ? ROUGE : c >= 75 ? AMBRE : VERT);

/** Fraction 0..1 pour une jauge. */
export const fraction = (v, total) => (v == null || !total ? 0 : Math.max(0, Math.min(1, v / total)));

/** Ligne de l'IA : « qwen3.8:27b · 17,4 Go », « rien de chargé », ou null si Ollama ne tourne pas. */
export function ligneIa(ia) {
  if (ia == null) return null;
  if (!ia.length) return 'rien de chargé';
  return ia.map((m) => `${m.nom} · ${go(m.vramMo)} Go`).join(' + ');
}
