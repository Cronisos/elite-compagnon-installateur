// Sessions en temps réel des modes de jeu (Combat, Sauvetage, Matériaux, Minage vaisseau) : rejeu du journal au
// démarrage, remise à zéro (bouton ou changement de mode), et pauses du chrono.
//
// Le chrono se met en pause de lui-même à quai (station, porteur) et quand le jeu est fermé, ou au bouton.
// Remises à zéro et pauses au bouton sont gardées sur disque : au redémarrage du serveur, la session est
// reconstruite depuis le journal et elles y sont rejouées à leur place, au lieu de repartir du lancement du jeu.

import { activity, IDLE_MS } from './activity.js';
import { isPlainObject, isUnread, readJsonFile, writeJsonAtomicSync } from './atomic.js';
import { dataPath } from './paths.js';

const SAVED = dataPath('sessions.json');
export const PAUSE_EVENTS = ['LoadGame', 'Location', 'Docked', 'Undocked', 'Shutdown'];
const PAUSES = new Set(PAUSE_EVENTS);

/** { reset, pauses: [{ from, to }], chrono } enregistré pour un module (ancien format : heure de remise à zéro seule). */
// Fichier partagé par Combat, Sauvetage, Matériaux et Minage vaisseau : illisible, il est mis de côté (jamais écrasé en
// silence, ce qui effaçait les remises à zéro et pauses de TOUS les modules à la première sauvegarde de l'un d'eux)
// Verrouillé à la lecture (antivirus, sauvegarde) : le dernier contenu bien lu sert à sa place. Avant, le fichier était
// lu comme vide, et la sauvegarde suivante n'y gardait que la session en cours.
let lastRead = null;
function loadAll() {
  const value = readJsonFile(SAVED, { fallback: {}, accept: isPlainObject, label: 'Sessions' });
  if (isUnread(SAVED) && lastRead) return lastRead;
  lastRead = value;
  return value;
}
export function savedSession(id) {
  const e = loadAll()[id];
  return typeof e === 'string' ? { reset: e, pauses: [], chrono: null } : { reset: e?.reset ?? null, pauses: e?.pauses ?? [], chrono: e?.chrono ?? null };
}
function save(id, entry) {
  try {
    const all = { ...loadAll(), [id]: entry };
    writeJsonAtomicSync(SAVED, all); // jamais un fichier coupé (core/atomic.js)
    lastRead = all;
  } catch (err) {
    console.error(`Session ${id} : non enregistrée (${err.message})`);
  }
}

/**
 * Temps de pause de la session : à quai ou jeu fermé (auto), au bouton (manual), ou plus de 10 min sans rien faire
 * (inactif : la pause part de ta dernière action et finit à la suivante). Les pauses ne se cumulent pas.
 */
export class PauseClock {
  constructor(idleMs = IDLE_MS) {
    this.auto = null; // 'docked' | 'offline' | null
    this.manual = false;
    this.since = null; // début de la pause en cours (ms)
    this.pausedMs = 0;
    this.idleMs = idleMs;
    this.last = null; // dernière action (ms)
    this.chronoFrom = null; // chrono remis à zéro seul (ms) : les taux, eux, comptent toute la session
    this.chronoPausedMs = 0; // temps de pause déjà compté à ce moment-là
  }

  /** Temps de pause total à l'instant t, pause en cours et inactivité comprises. */
  pausedAt(t) {
    const idle = this.idleSince(t);
    return this.pausedMs + (this.since !== null ? t - this.since : 0) + (idle !== null ? t - idle : 0);
  }

  /** Chrono seul remis à zéro à l'instant t. */
  resetChrono(t) {
    this.chronoFrom = t;
    this.chronoPausedMs = this.pausedAt(t);
  }

  paused() {
    return this.manual || this.auto !== null;
  }

  /**
   * Une action à l'instant t : si rien ne s'était passé depuis plus de 10 min (hors pause), ce trou devient une pause.
   * Avant la reprise, le trou s'arrête à la remise à zéro s'il la chevauche.
   */
  touch(t) {
    if (!Number.isFinite(t)) return;
    if (this.last !== null && t > this.last && !this.paused() && t - this.last > this.idleMs) this.pausedMs += t - this.last;
    if (this.last === null || t > this.last) this.last = t;
  }

  /** Inactif maintenant ? Depuis quand. */
  idleSince(now) {
    return !this.paused() && this.last !== null && now - this.last > this.idleMs ? this.last : null;
  }

  change(t, update) {
    const before = this.paused();
    if (!before) this.touch(t); // un trou d'inactivité juste avant la pause compte comme pause
    update();
    const after = this.paused();
    if (!before && after) this.since = t;
    if (before && !after) {
      this.pausedMs += t - this.since;
      this.since = null;
      this.last = t;
    }
  }

  setManual(on, t) {
    this.change(t, () => (this.manual = on));
  }

  /** Remise à zéro de la session : une pause en cours continue, mais compte à partir d'elle. */
  reset(at) {
    this.pausedMs = 0;
    if (this.since !== null) this.since = Date.parse(at);
    this.last = Date.parse(at);
    this.chronoFrom = null;
    this.chronoPausedMs = 0;
  }

  /** @returns true si l'événement change la pause */
  apply(ev) {
    const t = Date.parse(ev.timestamp);
    const before = [this.auto, this.manual];
    switch (ev.event) {
      case 'LoadGame': // nouvelle session : ni pause en cours, ni temps de pause
        Object.assign(this, new PauseClock(this.idleMs));
        this.last = t;
        return true;
      case 'Location':
        this.change(t, () => (this.auto = ev.Docked ? 'docked' : null));
        break;
      case 'Docked':
        this.change(t, () => (this.auto = 'docked'));
        break;
      case 'Undocked':
        this.change(t, () => (this.auto = null));
        break;
      case 'Shutdown':
        this.change(t, () => (this.auto = 'offline'));
        break;
      default:
        return false;
    }
    return before[0] !== this.auto || before[1] !== this.manual;
  }

  summary(now = Date.now()) {
    const idle = this.idleSince(now);
    const since = this.since ?? idle;
    return {
      pausedMs: this.pausedMs,
      pausedSince: since === null ? null : new Date(since).toISOString(),
      pauseReason: this.manual ? 'manual' : this.auto ?? (idle !== null ? 'idle' : null),
      chronoFrom: this.chronoFrom === null ? null : new Date(this.chronoFrom).toISOString(),
      chronoPausedMs: this.chronoPausedMs,
    };
  }
}

/**
 * Rejoue l'historique du journal dans state et clock, avec la remise à zéro et les pauses au bouton enregistrées
 * à leur place : les événements d'avant la remise à zéro sont effacés, et un lancement du jeu après elle ouvre
 * comme d'habitude une nouvelle session.
 * @param events noms des événements suivis par le module
 */
export function replaySession(state, clock, history, events, saved, moves = []) {
  const marks = [
    ...(saved.reset ? [{ at: saved.reset, kind: 'reset' }] : []),
    ...saved.pauses.flatMap((p) => [{ at: p.from, kind: 'pause' }, ...(p.to ? [{ at: p.to, kind: 'resume' }] : [])]),
    ...(saved.chrono ? [{ at: saved.chrono, kind: 'chrono' }] : []),
  ].map((m) => ({ ...m, t: Date.parse(m.at) })).filter((m) => Number.isFinite(m.t)).sort((a, b) => a.t - b.t);
  let next = 0;
  const flush = (t) => {
    for (; next < marks.length && marks[next].t <= t; next++) {
      const m = marks[next];
      if (m.kind === 'reset') {
        state.reset(m.at);
        clock.reset(m.at);
      } else if (m.kind === 'chrono') clock.resetChrono(m.t);
      else clock.setManual(m.kind === 'pause', m.t);
    }
  };
  let m = 0;
  for (const ev of history) {
    if (!events.has(ev.event) && !PAUSES.has(ev.event)) continue;
    const t = Date.parse(ev.timestamp);
    for (; m < moves.length && moves[m] <= t; m++) {
      flush(moves[m]);
      clock.touch(moves[m]);
    }
    flush(t);
    if (events.has(ev.event)) state.apply(ev);
    if (PAUSES.has(ev.event)) clock.apply(ev);
    if (ev.event !== 'Shutdown' && ev.event !== 'LoadGame') clock.touch(t);
  }
  for (; m < moves.length; m++) {
    flush(moves[m]);
    clock.touch(moves[m]);
  }
  flush(Infinity);
}

/**
 * Session en temps réel d'un module : rejeu au démarrage, événements en direct, routes GET /session,
 * POST /reset et POST /pause { on }, remise à zéro en passant au mode du module.
 * @param create  nouvel état du module (reset, apply, summary)
 * @param summary contenu envoyé au client, à partir de l'état
 * @returns { notify } pour renvoyer la session quand autre chose change (soute…)
 */
export function liveSession({ id, router, journal, overlay, broadcast, events, create, summary = (s) => s.summary(), resetAuMode = true }) {
  const set = new Set(events);
  let state = create();
  let clock = new PauseClock();
  let timer = null;
  const view = () => ({ ...summary(state), ...clock.summary() });
  const moves = activity(journal);
  // Tu bouges ou changes d'écran : action ; le chrono sort de la pause d'inactivité s'il y était
  moves.onAction((t) => {
    const wasIdle = clock.idleSince(t) !== null;
    clock.touch(t);
    if (wasIdle) notify();
  });
  // Passage en pause d'inactivité : prévenir la page et le HUD
  let idleShown = false;
  setInterval(() => {
    const idle = clock.idleSince(Date.now()) !== null;
    if (idle !== idleShown) notify();
    idleShown = idle;
  }, 15000);
  const notify = () => {
    clearTimeout(timer);
    timer = setTimeout(() => broadcast(`${id}:update`, view()), 300);
  };

  function reset() {
    const at = new Date().toISOString();
    state.reset(at);
    clock.reset(at);
    save(id, { reset: at, pauses: clock.manual ? [{ from: at }] : [] });
    notify();
  }

  journal.addInterest([...events, ...PAUSE_EVENTS]);
  journal.on('ready', ({ history }) => {
    state = create();
    clock = new PauseClock();
    replaySession(state, clock, history, set, savedSession(id), moves.times);
    notify();
  });
  journal.on('event', (ev) => {
    const t = Date.parse(ev.timestamp);
    const wasIdle = clock.idleSince(t) !== null;
    const changed = set.has(ev.event) && state.apply(ev);
    const paused = PAUSES.has(ev.event) && clock.apply(ev);
    if (ev.event !== 'Shutdown' && ev.event !== 'LoadGame') clock.touch(t);
    if (paused || changed || wasIdle) notify();
  });

  router.get('/session', (req, res) => res.json(view()));

  /** Nouvelle session sans relancer le jeu. Elle dure jusqu'au prochain lancement du jeu, même si l'app redémarre. */
  router.post('/reset', (req, res) => {
    reset();
    res.json(view());
  });

  /** Chrono seul remis à zéro (bouton ↺ du HUD) : compteurs et taux gardent toute la session. */
  router.post('/reset-time', (req, res) => {
    const now = new Date();
    clock.resetChrono(now.getTime());
    save(id, { ...savedSession(id), chrono: now.toISOString() });
    notify();
    res.json(view());
  });

  /** Pause au bouton, ou reprise ; à quai, le chrono reste en pause jusqu'au départ. */
  router.post('/pause', (req, res) => {
    const on = Boolean(req.body?.on);
    if (on !== clock.manual) {
      const now = new Date();
      clock.setManual(on, now.getTime());
      const saved = savedSession(id);
      if (on) saved.pauses.push({ from: now.toISOString() });
      else {
        const open = saved.pauses.findLast((p) => !p.to);
        if (open) open.to = now.toISOString();
      }
      save(id, saved);
      notify();
    }
    // Reprise demandée en pause d'inactivité : le clic est une action
    if (!on && clock.idleSince(Date.now()) !== null) {
      clock.touch(Date.now());
      notify();
    }
    res.json(view());
  });

  // Nouvelle session en passant à ce mode de jeu depuis un autre : le chrono repart de zéro
  // (sauf resetAuMode: false : Combat au sol, où l'on choisit souvent le mode en plein combat)
  if (resetAuMode) overlay.onMode((mode) => mode === id && reset());

  return { notify };
}
