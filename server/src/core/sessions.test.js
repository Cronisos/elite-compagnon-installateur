// Tests des sessions : remise à zéro et pauses au bouton rejouées à leur place, pauses à quai et jeu fermé.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PauseClock, replaySession } from './sessions.js';

const T = (sec) => new Date(Date.UTC(2026, 10, 5, 17, 0, sec)).toISOString().replace('.000', '');

class Counter {
  constructor() {
    this.reset(null);
  }
  reset(at) {
    this.startedAt = at;
    this.count = 0;
  }
  apply(ev) {
    if (ev.event === 'LoadGame') this.reset(ev.timestamp);
    else this.count++;
  }
}
const EVENTS = new Set(['LoadGame', 'Bounty']);
// Résumé sans le chrono remis à zéro seul (testé à part)
const bare = ({ chronoFrom, chronoPausedMs, ...rest }) => rest;
const replay = (history, saved = {}) => {
  const state = new Counter();
  const clock = new PauseClock();
  replaySession(state, clock, history, EVENTS, { reset: null, pauses: [], ...saved });
  const end = Math.max(...history.map((ev) => Date.parse(ev.timestamp))); // vu juste après le dernier événement
  return { state, clock: bare(clock.summary(end)) };
};

test('remise à zéro rejouée à sa place : chrono et compteurs repartent d\'elle', () => {
  const { state } = replay([
    { event: 'LoadGame', timestamp: T(0) },
    { event: 'Bounty', timestamp: T(10) },
    { event: 'Bounty', timestamp: T(30) },
    { event: 'Music', timestamp: T(31) },
  ], { reset: '2026-11-05T17:00:20.500Z' });
  assert.equal(state.startedAt, '2026-11-05T17:00:20.500Z');
  assert.equal(state.count, 1);
});

test('lancement du jeu après la remise à zéro : il ouvre la session, comme d\'habitude', () => {
  const { state } = replay([{ event: 'Bounty', timestamp: T(10) }, { event: 'LoadGame', timestamp: T(40) }, { event: 'Bounty', timestamp: T(50) }], { reset: T(20) });
  assert.equal(state.startedAt, T(40));
  assert.equal(state.count, 1);
});

test('remise à zéro après le dernier événement, ou aucune', () => {
  const late = replay([{ event: 'LoadGame', timestamp: T(0) }, { event: 'Bounty', timestamp: T(10) }], { reset: T(30) }).state;
  assert.deepEqual([late.startedAt, late.count], [T(30), 0]);
  const none = replay([{ event: 'LoadGame', timestamp: T(0) }, { event: 'Bounty', timestamp: T(10) }]).state;
  assert.deepEqual([none.startedAt, none.count], [T(0), 1]);
});

test('à quai : pause du chrono jusqu\'au départ ; jeu fermé : pause en cours', () => {
  const { clock } = replay([
    { event: 'LoadGame', timestamp: T(0) },
    { event: 'Location', timestamp: T(1), Docked: true },
    { event: 'Undocked', timestamp: T(11) },
    { event: 'Docked', timestamp: T(20) },
    { event: 'Undocked', timestamp: T(25) },
    { event: 'Shutdown', timestamp: T(40) },
  ]);
  assert.deepEqual(clock, { pausedMs: 15_000, pausedSince: new Date(Date.parse(T(40))).toISOString(), pauseReason: 'offline' });
});

test('pause au bouton : rejouée, et pas comptée deux fois avec une pause à quai', () => {
  const { clock } = replay([
    { event: 'LoadGame', timestamp: T(0) },
    { event: 'Docked', timestamp: T(15) },
    { event: 'Undocked', timestamp: T(25) },
  ], { pauses: [{ from: T(10), to: T(20) }, { from: T(30) }] });
  assert.equal(clock.pausedMs, 15_000); // 10 → 25 : bouton puis quai
  assert.equal(clock.pauseReason, 'manual');
});

test('remise à zéro pendant une pause : la pause continue, comptée à partir d\'elle', () => {
  const { clock } = replay([{ event: 'LoadGame', timestamp: T(0) }, { event: 'Docked', timestamp: T(5) }], { reset: T(20) });
  assert.deepEqual([clock.pausedMs, clock.pausedSince], [0, new Date(Date.parse(T(20))).toISOString()]);
});

test('nouveau lancement du jeu : plus de pause au bouton', () => {
  const { clock } = replay([{ event: 'LoadGame', timestamp: T(40) }], { pauses: [{ from: T(10) }] });
  assert.deepEqual(clock, { pausedMs: 0, pausedSince: null, pauseReason: null });
});

test('inactif : plus de 10 min sans rien faire, pause depuis la dernière action jusqu’à la suivante', () => {
  const M = (min) => Date.UTC(2026, 10, 5, 17, min);
  const ev = (event, min) => ({ event, timestamp: new Date(M(min)).toISOString() });
  const clock = new PauseClock();
  const state = new Counter();
  replaySession(state, clock, [ev('LoadGame', 0), ev('Bounty', 5), ev('Bounty', 12)], EVENTS, { reset: null, pauses: [] }, [M(20)]);
  assert.deepEqual(bare(clock.summary(M(25))), { pausedMs: 0, pausedSince: null, pauseReason: null }); // 8 min de route : ça tourne
  assert.deepEqual(bare(clock.summary(M(400))), { pausedMs: 0, pausedSince: new Date(M(20)).toISOString(), pauseReason: 'idle' });
  clock.touch(M(400)); // retour : la nuit devient une pause
  assert.deepEqual(bare(clock.summary(M(401))), { pausedMs: M(400) - M(20), pausedSince: null, pauseReason: null });
  // Inactif puis à quai : la pause démarre à la dernière action, sans compter deux fois
  clock.apply(ev('Docked', 430));
  assert.equal(clock.pausedMs, M(400) - M(20) + M(430) - M(400));
  assert.equal(clock.summary(M(500)).pauseReason, 'docked');
});

test('↺ temps : le chrono repart de zéro, pas les compteurs ; rejoué à sa place après un redémarrage', () => {
  const M = (min) => Date.UTC(2026, 10, 5, 17, min);
  const ev = (event, min) => ({ event, timestamp: new Date(M(min)).toISOString() });
  const history = [ev('LoadGame', 0), ev('Bounty', 5), ev('Docked', 8), ev('Undocked', 12), ev('Bounty', 15)];
  const state = new Counter();
  const clock = new PauseClock();
  replaySession(state, clock, history, EVENTS, { reset: null, pauses: [], chrono: new Date(M(10)).toISOString() });
  assert.equal(state.count, 2); // les primes restent
  const s = clock.summary(M(16));
  assert.equal(s.chronoFrom, new Date(M(10)).toISOString());
  // Chrono affiché à 16 min : 6 min depuis le ↺, moins les 2 min encore à quai après lui (10 → 12)
  const paused = s.pausedMs;
  assert.equal((M(16) - M(10) - (paused - s.chronoPausedMs)) / 60000, 4);
  // Remise à zéro complète : le ↺ s'efface
  clock.reset(new Date(M(20)).toISOString());
  assert.equal(clock.summary(M(21)).chronoFrom, null);
});
