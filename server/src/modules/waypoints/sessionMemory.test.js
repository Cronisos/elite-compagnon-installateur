// Mes repères : les événements gardés pour rejouer une session de minage reprise sont des formes réduites
// (sessionEvent), avec le même résultat que les événements entiers. Avant, le module gardait tous les événements de
// minage et d'activité depuis le premier journal, entiers (un Scan ou un Cargo pèse jusqu'à plusieurs Ko). Séance de
// minage anonymisée du banc de contrôle (lue seulement).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLines } from '../../core/journalFiles.js';
import { ACTIVITY_EVENTS, IDLE_MS, MINING_EVENTS, MiningSession, eventTime, runStart, sessionEvent, trimEvents } from './mining.js';

const SEANCE = fileURLToPath(new URL('../../../../scripts/controle/seances/minage-rhino-2026-11-07/Journal.2026-11-07T091533.01.log', import.meta.url));
const interesting = new Set([...MINING_EVENTS, ...ACTIVITY_EVENTS]);
const events = parseLines(fs.readFileSync(SEANCE, 'utf8')).filter((ev) => interesting.has(ev.event));

test('session rejouée sur les formes réduites : le même bilan que sur les événements entiers', () => {
  const refined = events.filter((ev) => ev.event === 'MiningRefined');
  assert.ok(refined.length > 50, 'la séance contient du minage');
  const debut = Date.parse(refined[0].timestamp);
  const fin = Date.parse(refined.at(-1).timestamp) + 60_000;
  const segments = [{ start: debut - 1000, end: debut + (fin - debut) / 2 }, { start: debut + (fin - debut) * 0.6 }];
  const entiers = new MiningSession(segments, { idleMs: IDLE_MS });
  const reduits = new MiningSession(segments, { idleMs: IDLE_MS });
  const compact = events.map(sessionEvent);
  for (const ev of events) entiers.apply(ev);
  for (const ev of compact) reduits.apply(ev);
  assert.deepEqual(reduits.summary(fin), entiers.summary(fin));
  assert.ok(entiers.summary(fin).refined > 0);
  // Début d'une série de tonnes et dernière tonne : mêmes heures
  const t = Date.parse(refined.at(-1).timestamp);
  assert.equal(runStart(compact, t), runStart(events, t));
  assert.equal(eventTime(compact.findLast((ev) => ev.event === 'MiningRefined')), t);
});

test('forme réduite : seulement le nom, l’heure et les champs lus par la session ; bien plus légère', () => {
  const scan = { event: 'Scan', timestamp: '2026-11-07T10:00:00Z', BodyName: 'Corps 1', Materials: [{ Name: 'iron', Percent: 20 }], Rings: [] };
  const cargo = { event: 'Cargo', timestamp: '2026-11-07T10:00:00Z', Vessel: 'Ship', Count: 3, Inventory: [{ Name: 'painite', Count: 3 }] };
  assert.deepEqual(Object.keys(sessionEvent(scan)).sort(), ['event', 't']);
  assert.deepEqual(Object.keys(sessionEvent(cargo)).sort(), ['event', 't']);
  const sell = sessionEvent({ event: 'MarketSell', timestamp: '2026-11-07T10:00:00Z', Type: 'painite', Count: 3, TotalSale: 900, StationName: 'x', MarketID: 1 });
  assert.deepEqual(sell, { event: 'MarketSell', t: Date.parse('2026-11-07T10:00:00Z'), Type: 'painite', Count: 3, TotalSale: 900 });
  assert.ok(Number.isNaN(sessionEvent({ event: 'Docked', timestamp: 'pas une date' }).t));
  const taille = (list) => JSON.stringify(list).length;
  const compact = events.map(sessionEvent);
  assert.ok(taille(compact) < taille(events) * 0.7, `${taille(compact)} octets contre ${taille(events)} (séance faite surtout de tonnes raffinées, déjà petites)`);
});

test('Mes repères garde les formes réduites, plus les événements entiers', () => {
  const src = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  assert.ok(!/events = history\.filter/.test(src), 'plus de copie des événements entiers de l’historique');
  assert.equal((src.match(/events\.push\(sessionEvent\(ev\)\)/g) || []).length, 1, 'une seule entrée : retenir()');
  assert.equal((src.match(/\bretenir\(ev\)/g) || []).length, 2, 'historique et direct');
  assert.ok(/events = trimEvents\(events, cutoff\)/.test(src), 'les événements trop anciens sont oubliés (pruneEvents)');
  assert.ok(!/events\.filter\(\(ev\) => ev\.event === 'MiningRefined'\)/.test(src), 'minerais raffinés tenus à part, sans relire tous les événements');
});

test('événements gardés : seulement depuis la coupure, avec le dernier total de mérites connu en tête', () => {
  const ev = (event, t, extra = {}) => ({ event, t, ...extra });
  const liste = [
    ev('Powerplay', 100, { Merits: 5000 }),
    ev('PowerplayMerits', 200, { MeritsGained: 10, TotalMerits: 5010 }),
    ev('MiningRefined', 300),
    ev('PowerplayMerits', 1200, { MeritsGained: 20, TotalMerits: 5030 }),
    ev('MiningRefined', 1300),
  ];
  const gardes = trimEvents(liste, 1000);
  assert.deepEqual(gardes.map((e) => e.event), ['Powerplay', 'PowerplayMerits', 'MiningRefined']);
  assert.deepEqual(gardes[0], { event: 'Powerplay', t: 999, Merits: 5010 });
  // Session rejouée sur les événements gardés : le gain se compte depuis le vrai total
  const s = new MiningSession([{ start: 1000 }]);
  for (const e of gardes) s.apply(e);
  assert.equal(s.summary(1400).merits, 20);
  assert.equal(trimEvents(liste, NaN), liste, 'coupure illisible : rien n’est oublié');
});

test('mérites de la session : doublon et ligne annulée retirés (7 nov. 13:50 : +2 015 puis +1 773 qui l’annule)', () => {
  const T = (s) => Date.UTC(2026, 10, 7, 13, 50, s);
  const s = new MiningSession([{ start: T(0) }]);
  const brut = [
    { event: 'Powerplay', timestamp: new Date(T(0) - 3600_000).toISOString(), Merits: 1000000 },
    { event: 'PowerplayMerits', timestamp: new Date(T(13)).toISOString(), MeritsGained: 2015, TotalMerits: 1002015 },
    { event: 'PowerplayMerits', timestamp: new Date(T(22)).toISOString(), MeritsGained: 1773, TotalMerits: 1001773 },
  ];
  const reduits = brut.map(sessionEvent);
  assert.equal(reduits[2].TotalMerits, 1001773, 'le total du jeu est gardé dans la forme réduite');
  assert.equal(reduits[0].Merits, 1000000);
  for (const e of reduits) s.apply(e);
  assert.equal(s.summary(T(22) + 3600_000).merits, 1773);
});

test('mérites de la session : un doublon d’avant la session, corrigé dedans, ne lui retire rien', () => {
  const T = (min) => Date.UTC(2026, 10, 7, 13, min, 0);
  const liste = [
    { event: 'Powerplay', t: T(0), Merits: 1000000 },
    { event: 'PowerplayMerits', t: T(1), MeritsGained: 28, TotalMerits: 1000028 },
    { event: 'PowerplayMerits', t: T(1), MeritsGained: 28, TotalMerits: 1000056 }, // doublon, hors session
    { event: 'MiningRefined', t: T(30), Type: 'platinum' },
    { event: 'PowerplayMerits', t: T(40), MeritsGained: 7, TotalMerits: 1000035 }, // dans la session
  ];
  const rejoue = (evs) => {
    const s = new MiningSession([{ start: T(20) }]);
    for (const e of evs) s.apply(e);
    return s.summary(T(50)).merits;
  };
  assert.equal(rejoue(liste), 7);
  // Coupure entre le doublon et la session : le total gardé en tête contient le doublon
  const gardes = trimEvents(liste, T(10));
  assert.equal(gardes[0].Merits, 1000056);
  assert.equal(rejoue(gardes), 7, 'même résultat après la coupure');
});

test('mérites de la session : un doublon compté dans la session lui est retiré même si la correction arrive après', () => {
  const T = (min) => Date.UTC(2026, 10, 7, 13, min, 0);
  const s = new MiningSession([{ start: T(0), end: T(30) }]);
  for (const e of [
    { event: 'Powerplay', t: T(0) - 1, Merits: 1000000 },
    { event: 'PowerplayMerits', t: T(10), MeritsGained: 28, TotalMerits: 1000028 },
    { event: 'PowerplayMerits', t: T(10), MeritsGained: 28, TotalMerits: 1000056 }, // doublon dans la session
    { event: 'PowerplayMerits', t: T(40), MeritsGained: 7, TotalMerits: 1000035 }, // après la session
  ]) s.apply(e);
  assert.equal(s.summary(T(50)).merits, 28);
});
