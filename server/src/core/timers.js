// Minuteries du cœur (propositions de mode, avis de bascule) : une seule définition, partagée.

/** Minuteries réelles, qui ne retiennent pas le serveur à l'arrêt. Les tests passent les leurs, ou null. */
export const REAL_TIMERS = Object.freeze({
  set(fn, ms) {
    const t = setTimeout(fn, ms);
    t.unref?.();
    return t;
  },
  clear: (t) => clearTimeout(t),
});
