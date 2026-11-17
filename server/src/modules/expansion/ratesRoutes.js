// Onglet « Mérites par heure » du Projet extension : rendements par activité et par état du système, changements
// de règles et modificateurs connus. Branché par index.js, avec ses propres écoutes du journal.
//
// GET    /rates?period=rules|week|month|all  rendements de la période (par défaut : depuis le dernier changement
//                                             de règles connu)
// POST   /modifiers                          ajoute un modificateur ou un changement de règles saisi
// DELETE /modifiers/:id                      le supprime

import path from 'node:path';
import { dataDir } from '../../core/paths.js';
import { activity, IDLE_MS } from '../../core/activity.js';
import { weekStart } from './merits.js';
import {
  APPROACH_MS, KNOWN_MODIFIERS, MIN_ACTIVE_MS, MIN_UNITS, RATE_EVENTS, RULE_CHANGES, RateLog, SCAN_MS, lastRuleChange,
  rateReport, replayRates,
} from './rates.js';
import { ActionMarks, KINDS, ModifierStore, STATUSES } from './rateStore.js';

const DATA_DIR = dataDir() + path.sep;
export const PERIODS = ['rules', 'week', 'month', 'all'];
const MONTH_MS = 30 * 24 * 3600 * 1000;
const FLUSH_MS = 60_000;

/** Début de la période demandée (inconnue : depuis le dernier changement de règles). */
export function periodStart(period, { now = Date.now(), rules } = {}) {
  const kind = PERIODS.includes(period) ? period : 'rules';
  if (kind === 'week') return { kind, from: weekStart(now) };
  if (kind === 'month') return { kind, from: now - MONTH_MS };
  if (kind === 'all') return { kind, from: -Infinity };
  return { kind, from: rules ? Date.parse(`${rules.date}T00:00:00Z`) : -Infinity };
}

/** @returns { units, flush } : les travaux du moment et l'écriture des minutes jouées (pour les tests) */
export function registerRates({ router, journal, broadcast, dataDir = DATA_DIR, moves = activity(journal) }) {
  const store = new ModifierStore(path.join(dataDir, 'expansion-modifiers.json'));
  const marks = new ActionMarks(path.join(dataDir, 'expansion-activity.json'));
  marks.merge(moves.times);
  let log = new RateLog();
  let timer = null;
  const notify = () => {
    clearTimeout(timer);
    timer = setTimeout(() => broadcast('expansion:rates', {}), 500);
  };

  journal.addInterest(RATE_EVENTS);
  journal.on('ready', ({ history }) => {
    const times = [...new Set([...moves.times, ...marks.times()])].sort((a, b) => a - b);
    log = replayRates(history, times);
    notify();
  });
  journal.on('event', (ev) => {
    if (log.apply(ev)) notify();
  });
  moves.onAction((t) => {
    log.touch(t);
    marks.add(t);
  });
  setInterval(() => marks.flush(), FLUSH_MS).unref?.();

  const mine = (kind) => store.list().filter((m) => m.kind === kind);

  router.get('/rates', (req, res) => {
    const myRules = mine('rules');
    const last = lastRuleChange(myRules);
    const { kind, from } = periodStart(req.query.period, { rules: last });
    const since = [moves.times[0], marks.times()[0]].filter(Number.isFinite);
    res.json({
      period: { kind, from: Number.isFinite(from) ? from : null },
      rules: { last, list: [...RULE_CHANGES, ...myRules].sort((a, b) => b.date.localeCompare(a.date)) },
      ...rateReport(log.units, { from, modifiers: mine('modifier') }),
      known: KNOWN_MODIFIERS,
      // Avant cette date, seules les actions écrites dans le journal comptent : le temps actif peut être sous-estimé
      coverage: { since: since.length ? Math.min(...since) : null, idleMs: IDLE_MS },
      thresholds: { minUnits: MIN_UNITS, minActiveMs: MIN_ACTIVE_MS, approachMs: APPROACH_MS, scanMs: SCAN_MS },
      choices: { statuses: STATUSES, kinds: KINDS, periods: PERIODS },
    });
  });

  router.post('/modifiers', (req, res, next) => {
    try {
      const r = store.add(req.body);
      if (r.error) return res.status(400).json({ error: r.error });
      broadcast('expansion:rates', {});
      res.status(201).json(r.value);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/modifiers/:id', (req, res, next) => {
    try {
      if (!store.remove(req.params.id)) return res.status(404).json({ error: 'Modificateur introuvable.' });
      broadcast('expansion:rates', {});
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return { units: () => log.units, flush: () => marks.flush() };
}
