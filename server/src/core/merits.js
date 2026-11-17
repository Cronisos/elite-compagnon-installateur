// Mérites Powerplay réellement gagnés, d'après le journal.
//
// Le jeu écrit parfois deux fois la même ligne PowerplayMerits (même gain, même seconde) sans créditer le
// doublon : son TotalMerits monte, puis la ligne suivante repart du vrai total (journaux de référence, 2 et 4 nov. 2026 :
// 60, 28, 28 puis 7 → totaux 1 095 289, 1 095 317, 1 095 345, 1 095 324). Suivre l'écart de TotalMerits donne
// le gain réel : le doublon est retiré à la ligne suivante.

export class MeritCounter {
  constructor() {
    this.total = null;
  }

  /** Total donné par l'événement Powerplay (connexion). */
  setTotal(total) {
    if (total != null) this.total = total;
  }

  /** Gain réel d'une ligne PowerplayMerits : négatif quand le jeu retire un doublon. */
  gain(ev) {
    const gained = ev.TotalMerits != null && this.total != null ? ev.TotalMerits - this.total : ev.MeritsGained || 0;
    if (ev.TotalMerits != null) this.total = ev.TotalMerits;
    return gained;
  }
}
