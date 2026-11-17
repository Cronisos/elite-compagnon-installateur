// Le jeu tourne-t-il ? D'après le journal seulement (aucun programme lancé pour lister les processus).
// Le jeu ne lit ses couleurs qu'au démarrage : la page prévient qu'il faudra le relancer.

export const RUN_EVENTS = ['Fileheader', 'LoadGame', 'Shutdown'];
export const RECENT_MS = 20 * 60_000; // journal écrit il y a moins de 20 min : le jeu est ouvert

export class GameRun {
  constructor() {
    this.lastStart = null; // ms : début d'un journal ou chargement d'une partie
    this.lastShutdown = null; // ms : fermeture du jeu
  }

  apply(ev) {
    const t = Date.parse(ev?.timestamp);
    if (!Number.isFinite(t)) return false;
    if (ev.event === 'Shutdown') this.lastShutdown = Math.max(this.lastShutdown ?? t, t);
    else if (ev.event === 'Fileheader' || ev.event === 'LoadGame') this.lastStart = Math.max(this.lastStart ?? t, t);
    else return false;
    return true;
  }

  /**
   * running : lancé, pas fermé, journal écrit récemment ; closed : fermeture notée ;
   * unknown : rien dans le journal, ou lancé sans fermeture notée mais plus rien d'écrit (fermeture brutale ?).
   * lastWrite : dernière écriture du journal (ms ou null).
   */
  status({ lastWrite = null, now = Date.now() } = {}) {
    const iso = (t) => (t == null ? null : new Date(t).toISOString());
    if (this.lastStart == null && this.lastShutdown == null) return { state: 'unknown', since: null, lastWrite: iso(lastWrite) };
    if (this.lastShutdown != null && (this.lastStart == null || this.lastShutdown >= this.lastStart)) {
      return { state: 'closed', since: iso(this.lastShutdown), lastWrite: iso(lastWrite) };
    }
    const recent = Math.max(this.lastStart, lastWrite ?? 0);
    return { state: now - recent < RECENT_MS ? 'running' : 'unknown', since: iso(this.lastStart), lastWrite: iso(lastWrite) };
  }
}
