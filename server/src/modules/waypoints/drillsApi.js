// Foreuses du Rhino, côté serveur : écoute du journal (vidanges, SRV rentré), routes HTTP, sauvegarde dans
// server/data/drills.json et diffusion en direct (« waypoints:drills »). Branché par index.js du module.

import { isPlainObject, readJsonFile, writeFileAtomicSync } from '../../core/atomic.js';
import { DrillTracker, drillNumber } from './drills.js';

const SAVE_DELAY_MS = 2000; // une vidange, c'est une vingtaine de tonnes en 40 s : une seule écriture
const PUSH_MS = 1000; // position en direct : au plus une diffusion par seconde
// Événement du journal plus vieux que ça (journal relu depuis le début) : la position actuelle n'est plus la sienne
const STALE_MS = 2 * 60 * 1000;

const wrap = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);

function bad(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}

/** Écriture atomique : fichier temporaire puis renommage, pour ne jamais laisser un JSON coupé en deux. */
export function writeAtomic(file, text) {
  writeFileAtomicSync(file, text); // core/atomic.js
}

/** Cible du guidage reçue : « next » (la prochaine à vider), un numéro de 1 à 6, ou rien. */
export function guideTarget(v) {
  if (v === 'next') return 'next';
  return drillNumber(v);
}

/**
 * Branche le suivi des foreuses sur le routeur du module.
 * @param here        position actuelle (même forme que here() du module)
 * @param sweepCenter centre du balayage en cours (carte commune), ou null
 * @param file        fichier de sauvegarde
 */
export function mountDrills({ router, journal, broadcast, here, sweepCenter = () => null, file, now = () => Date.now() }) {
  let tracker = new DrillTracker();
  // Aucune foreuse encore, ou fichier illisible (mis de côté, core/atomic.js)
  const saved = readJsonFile(file, { fallback: null, accept: isPlainObject, label: 'Foreuses du Rhino' });
  if (saved) {
    try {
      tracker = DrillTracker.fromJSON(saved);
    } catch (err) {
      console.warn(`Foreuses du Rhino : sauvegarde ignorée (${err.message}).`);
    }
  }
  let target = null; // guidage de la boussole : null, 'next' ou un numéro
  let saveTimer = null;
  let pushTimer = null;
  let lastPush = 0;

  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      writeAtomic(file, JSON.stringify(tracker));
    } catch (e) {
      console.error('Foreuses : sauvegarde impossible :', e.message);
    }
  };
  const saveSoon = () => {
    saveTimer ??= setTimeout(save, SAVE_DELAY_MS);
  };
  // Une séance ouverte a été montrée (route ou diffusion) depuis la dernière diffusion d'une séance close
  let saidOpen = false;
  const view = () => {
    const v = tracker.view(here(), now(), sweepCenter());
    if (v.active) saidOpen = true;
    return v;
  };
  const push = () => {
    clearTimeout(pushTimer);
    pushTimer = null;
    lastPush = now();
    const v = view();
    broadcast('waypoints:drills', v);
    if (!v.active) saidOpen = false;
  };
  /** La boussole ne suit plus les foreuses (un repère choisi, ou la séance close). */
  const guideOff = () => {
    if (target == null) return;
    target = null;
    broadcast('waypoints:drill-guide', { target });
  };
  /** Foreuses changées : sauvegarde groupée, diffusion tout de suite. */
  const changed = () => {
    saveSoon();
    push();
  };

  journal.on('event', (ev) => {
    const t = Date.parse(ev.timestamp);
    if (!Number.isFinite(t) || now() - t > STALE_MS) return;
    if (ev.event === 'MiningRefined' && tracker.refined(t, here())) changed();
    else if (ev.event === 'DockSRV' && tracker.dockSrv(t)) changed();
  });
  // Tu bouges : distance et cap vers chaque foreuse, au plus une fois par seconde, tant que la séance est ouverte
  journal.on('status', () => {
    if (!tracker.seance || pushTimer) return;
    if (!tracker.isOpen(now())) {
      // 3 h sans pose ni vidange : séance close. On le dit une fois, la boussole lâche les foreuses, puis plus rien
      if (saidOpen) {
        guideOff();
        push();
      }
      return;
    }
    pushTimer = setTimeout(push, Math.max(0, PUSH_MS - (now() - lastPush)));
  });

  router.get('/drills', (req, res) => res.json(view()));
  /** Foreuse posée ici (bouton du balayage, ou Alt+Maj+F dans l'overlay). */
  router.post('/drills', wrap(async (req, res) => {
    const d = tracker.place(here(), now());
    changed();
    res.status(201).json({ n: d.n, ...view() });
  }));
  router.delete('/drills', (req, res) => {
    tracker.clear();
    target = null;
    broadcast('waypoints:drill-guide', { target });
    save();
    push();
    res.json(view());
  });
  router.delete('/drills/:n', wrap(async (req, res) => {
    const n = drillNumber(req.params.n);
    if (n == null) throw bad('Foreuse invalide : numéro de 1 à 6.');
    if (!tracker.remove(n)) throw bad('Foreuse introuvable.', 404);
    save();
    push();
    res.json(view());
  }));
  router.put('/drills/settings', wrap(async (req, res) => {
    tracker.setDestroyRadius(req.body?.destroyRadiusKm);
    save();
    push();
    res.json(view());
  }));
  // Boussole (fenêtre « Guidage ») vers une foreuse : elle passe avant le repère suivi
  router.get('/drills/guide', (req, res) => res.json(target == null ? { target: null, state: 'off' } : tracker.guide(target, here(), now())));
  router.put('/drills/guide', (req, res) => {
    target = guideTarget(req.body?.target);
    broadcast('waypoints:drill-guide', { target });
    res.json(target == null ? { target: null, state: 'off' } : tracker.guide(target, here(), now()));
  });

  return {
    /** Un repère a été choisi pour la boussole (dans la liste, ou d'office au retour sur la planète) : elle ne suit plus les foreuses. */
    guideOff,
    get tracker() {
      return tracker;
    },
    flush: save,
  };
}
