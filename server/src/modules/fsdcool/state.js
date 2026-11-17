// Refroidissement du FSD, d'après Status.json (relu toutes les 500 ms) : l'indicateur « FSD Cooldown » (bit 18
// de Flags). Le jeu ne donne pas la durée : elle est mesurée à chaque refroidissement et la dernière sert de compte
// à rebours au suivant. Le refroidissement qui suit un saut hyperespace n'est pas suivi (il fait partie du saut).

export const FLAG = { supercruise: 1 << 4, charging: 1 << 17, cooldown: 1 << 18 };
export const AFTER_JUMP_MS = 20_000; // un refroidissement commencé moins de 20 s après un saut lui appartient

export class FsdCooldown {
  constructor() {
    this.active = null; // { since } pendant un refroidissement suivi
    this.lastJumpAt = null;
    this.durations = []; // durées mesurées (ms), les plus récentes à la fin
    this.flags = null;
  }

  /** Saut hyperespace (StartJump ou FSDJump) : le refroidissement qui suit n'est pas suivi. */
  jumped(at) {
    this.lastJumpAt = at;
  }

  /**
   * Nouvel état de Status.json. Renvoie 'start', 'end' ou null selon le refroidissement suivi.
   * @param at heure de la lecture (ms)
   */
  status(flags, at) {
    const before = this.flags;
    this.flags = flags;
    const was = before != null && Boolean(before & FLAG.cooldown);
    const now = Boolean(flags & FLAG.cooldown);
    if (now && !was) {
      if (this.lastJumpAt != null && at - this.lastJumpAt < AFTER_JUMP_MS) return null;
      this.active = { since: at };
      return 'start';
    }
    if (!now && was && this.active) {
      const duration = at - this.active.since;
      if (duration >= 1000) this.durations = [...this.durations, duration].slice(-10);
      this.active = null;
      return 'end';
    }
    return null;
  }

  /** Durée attendue : la médiane des dernières mesures, ou null avant la première. */
  expected() {
    if (!this.durations.length) return null;
    const sorted = [...this.durations].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  summary() {
    return {
      active: this.active && { since: new Date(this.active.since).toISOString() },
      expectedMs: this.expected(),
      measured: this.durations.length,
    };
  }
}
