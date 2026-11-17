// Tests du module Mes repères : véhicule, distance et cap à la surface, guidage.
// Position réelle du 29 oct. 2026 : SRV sur 16 Librae 3 f (rayon 1 199 465,6 m).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { surfaceRoute, turn, vehicleOf } from './geo.js';
import { depletedUntil, guide, wholeNumber } from './index.js';
import { activeSegments, IDLE_MS, MiningSession, MiningState, runStart, siteIndex } from './mining.js';

const R = 1199465.625;
const here = { system: '16 Librae', body: '16 Librae 3 f', latitude: 57.530689, longitude: -88.696587, heading: 184, planetRadius: R };

test('véhicule lu dans les indicateurs de Status.json', () => {
  assert.equal(vehicleOf({ Flags: 2350941000, Flags2: 0 }), 'srv'); // valeur réelle, en SRV
  assert.equal(vehicleOf({ Flags: 1 << 24 }), 'ship');
  assert.equal(vehicleOf({ Flags: 0, Flags2: 1 }), 'onfoot');
  assert.equal(vehicleOf({}), null);
});

test('distance et cap : plein nord, plein est, même point', () => {
  const north = surfaceRoute({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }, R);
  assert.equal(Math.round(north.bearing), 0);
  assert.equal(Math.round(north.distance), Math.round((Math.PI * R) / 180)); // 1° de latitude
  assert.equal(Math.round(surfaceRoute({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, R).bearing), 90);
  assert.equal(surfaceRoute(here, here, R).distance, 0);
});

test('écart de cap : gauche négatif, droite positif, passage par le nord', () => {
  assert.equal(turn(90, 0), 90);
  assert.equal(turn(350, 10), -20);
  assert.equal(turn(10, 350), 20);
});

test('minage : emplacements de la planète et minerais raffinés, du plus au moins', () => {
  const m = new MiningState();
  assert.equal(m.suggestion('Mombaluma C 1'), null);
  m.apply({ event: 'SAASignalsFound', BodyName: 'Mombaluma C 1', Signals: [
    { Type: '$SAA_SignalType_Geological;', Count: 2 },
    { Type: '$PlanetaryMiningLocation_Name;', Count: 9 },
  ] });
  m.apply({ event: 'MiningRefined', Type: '$platinum_name;', Type_Localised: 'Platine' });
  m.apply({ event: 'MiningRefined', Type: '$iridium_name;', Type_Localised: 'Iridium' });
  m.apply({ event: 'MiningRefined', Type: '$iridium_name;', Type_Localised: 'Iridium' });
  assert.deepEqual(m.suggestion('Mombaluma C 1'), {
    category: 'mining',
    notes: '9 emplacements sur la planète · raffiné : Iridium, Platine',
  });
  m.apply({ event: 'FSDJump' });
  assert.equal(m.suggestion('Mombaluma C 1').notes, '9 emplacements sur la planète');
  assert.equal(m.suggestion('Sol 3'), null);
});

test('minage : numéro de l\'emplacement au toucher du vaisseau ou à la cible du HUD, sur la même planète', () => {
  const m = new MiningState();
  const near = (n) => `$SAA_Unknown_Signal:#type=$PlanetaryMiningLocation_Name;:#index=${n};`;
  assert.equal(siteIndex(near(7)), 7);
  assert.equal(siteIndex('$SAA_Unknown_Signal:#type=$SAA_SignalType_Geological;:#index=2;'), null);
  m.apply({ event: 'Touchdown', Body: 'Mombaluma C 1', NearestDestination: near(7) });
  assert.deepEqual(m.suggestion('Mombaluma C 1'), { category: 'mining', notes: '', siteNumber: 7 });
  assert.equal(m.suggestion('Mombaluma C 2'), null);
  m.target({ Name: near(12) }, 'Mombaluma C 1');
  assert.equal(m.suggestion('Mombaluma C 1').siteNumber, 12);
  m.target({ Name: 'Mombaluma C 1' }, 'Mombaluma C 1'); // autre cible : le dernier numéro reste
  assert.equal(m.suggestion('Mombaluma C 1').siteNumber, 12);
  m.apply({ event: 'FSDJump' });
  assert.equal(m.suggestion('Mombaluma C 1'), null);
});

test('soutes : la soute du vaisseau suit les transferts tant qu\'on est en SRV', () => {
  const m = new MiningState();
  m.apply({ event: 'Cargo', Vessel: 'Ship', Count: 10 });
  m.apply({ event: 'LaunchSRV', SRVType: 'mev_rhino', SRVType_Localised: 'VRS Rhino' });
  m.apply({ event: 'Cargo', Vessel: 'SRV', Count: 72 });
  m.apply({ event: 'CargoTransfer', Transfers: [{ Type: 'iridium', Count: 72, Direction: 'toship' }] });
  m.apply({ event: 'Cargo', Vessel: 'SRV', Count: 0 });
  assert.deepEqual(m.cargo(), { srv: 0, srvMax: 72, srvName: 'VRS Rhino', ship: 82 });
  m.apply({ event: 'CargoTransfer', Transfers: [{ Type: 'iridium', Count: 2, Direction: 'tosrv' }] });
  assert.equal(m.cargo().ship, 80);
});

test('taux récent : moyenne des boucles complètes, sans chute pendant l\'attente', () => {
  const start = Date.parse('2026-10-30T10:00:00Z');
  const s = new MiningSession(start);
  const loop = (min) => {
    for (let i = 0; i < 45; i++) s.apply({ event: 'MiningRefined', timestamp: new Date(start + min * 60000 + i * 3000).toISOString(), Type: '$platinum_name;' });
  };
  loop(0);
  assert.equal(s.summary(start + 3 * 60000).recentPerHour, 900); // première boucle : 45 t en 3 minutes
  [6, 12, 18, 24].forEach(loop);
  const rates = [27, 28, 29].map((min) => s.summary(start + min * 60000).recentPerHour);
  assert.deepEqual(rates, [450, 450, 450]); // 45 t toutes les 6 minutes, même pendant l'attente
  assert.equal(s.summary(start + 120 * 60000).recentPerHour, 113); // à l'arrêt, le taux finit par descendre : 225 t en 2 h
});

test('taux récent : une pause de la session ne compte pas dans les boucles', () => {
  const at = (min) => new Date(Date.parse('2026-10-30T10:00:00Z') + min * 60000).toISOString();
  const s = new MiningSession([{ start: at(0), end: at(10) }, { start: at(70) }]);
  [5, 75, 81].forEach((min) => s.apply({ event: 'MiningRefined', timestamp: at(min), Type: '$platinum_name;' }));
  assert.equal(s.summary(Date.parse(at(82))).recentPerHour, 8); // 2 t en 16 minutes actives, l'heure de pause exclue
});

test('session : compte depuis le lancement, taux moyen et taux récent', () => {
  const start = Date.parse('2026-10-30T10:00:00Z');
  const at = (min) => new Date(start + min * 60000).toISOString();
  const s = new MiningSession(start);
  s.apply({ event: 'MiningRefined', timestamp: at(-1), Type: '$platinum_name;', Type_Localised: 'Platine' }); // avant le lancement
  for (let i = 0; i < 30; i++) s.apply({ event: 'MiningRefined', timestamp: at(i), Type: '$platinum_name;', Type_Localised: 'Platine' });
  s.apply({ event: 'CargoTransfer', timestamp: at(30), Transfers: [{ Type: 'platinum', Type_Localised: 'Platine', Count: 30, Direction: 'toship' }] });
  s.apply({ event: 'MaterialCollected', timestamp: at(5), Name: 'iron', Count: 3 });
  s.apply({ event: 'MaterialCollected', timestamp: at(6), Name: 'iron', Count: 2 });
  const r = s.summary(start + 60 * 60000);
  assert.equal(r.refined, 30);
  assert.equal(r.transferred, 30);
  assert.equal(r.perHour, 30); // 30 t en 1 h
  assert.equal(r.recentPerHour, 10); // plus rien depuis 30 minutes : 6 t sur les 36 dernières
  assert.deepEqual(r.ores, [{ key: 'platinum', label: 'Platine', refined: 30, transferred: 30, sold: 0, credits: 0 }]); // « $platinum_name; » = « platinum »
  assert.deepEqual(r.materials, [{ key: 'iron', label: 'Iron', count: 5 }]);
  assert.equal(new MiningSession(start).summary(start + 1000).perHour, null); // trop tôt pour un taux
});

test('numéro d\'EEP : entier de 1 à 999, sinon aucun', () => {
  assert.equal(wholeNumber('7'), 7);
  assert.equal(wholeNumber(12), 12);
  for (const v of ['', null, undefined, 0, -1, 1000, '2,5', 'abc']) assert.equal(wholeNumber(v), null);
});

test('vente : seul le tonnage raffiné pendant la session rapporte, mérites compris', () => {
  const start = Date.parse('2026-10-30T10:00:00Z');
  const at = (min) => new Date(start + min * 60000).toISOString();
  const s = new MiningSession(start);
  for (let i = 0; i < 30; i++) s.apply({ event: 'MiningRefined', timestamp: at(1), Type: '$iridium_name;', Type_Localised: 'Iridium' });
  s.apply({ event: 'MarketSell', timestamp: at(20), Type: 'iridium', Count: 100, SellPrice: 800000, TotalSale: 80000000 }); // soute remplie avant la session
  s.apply({ event: 'MarketSell', timestamp: at(21), Type: 'gold', Count: 10, SellPrice: 9000, TotalSale: 90000 }); // pas miné ici
  s.apply({ event: 'PowerplayMerits', timestamp: at(22), MeritsGained: 120 });
  const r = s.summary(start + 30 * 60000);
  assert.equal(r.sold, 30);
  assert.equal(r.unsold, 0);
  assert.equal(r.soldOutside, 70);
  assert.equal(r.credits, 24000000);
  assert.equal(r.creditsPerHour, 48000000); // depuis le clic : 30 minutes
  assert.equal(r.merits, 120);
  assert.equal(r.meritsPerHour, 240);
});

test('reprise : la pause ne compte ni dans le temps ni dans les compteurs', () => {
  const start = Date.parse('2026-10-30T10:00:00Z');
  const at = (min) => new Date(start + min * 60000).toISOString();
  const s = new MiningSession([{ start: at(0), end: at(30) }, { start: at(60) }]);
  const refine = (min) => s.apply({ event: 'MiningRefined', timestamp: at(min), Type: '$platinum_name;', Type_Localised: 'Platine' });
  refine(10);
  refine(45); // pendant la pause
  refine(70);
  const r = s.summary(start + 90 * 60000);
  assert.equal(r.refined, 2);
  assert.equal(r.durationSec, 3600); // 30 + 30 minutes
  assert.equal(r.perHour, 2);
});

test('veine tarie : de retour 2 mois après', () => {
  assert.equal(depletedUntil('2026-10-30T12:00:00Z').toISOString(), '2026-12-30T12:00:00.000Z');
  assert.equal(depletedUntil('2026-11-15T12:00:00Z').toISOString(), '2027-01-15T12:00:00.000Z'); // changement d'année
  assert.equal(depletedUntil(null), null);
});

test('guidage : sur la même planète, distance et direction ; ailleurs, on dit où aller', () => {
  const w = { system: '16 Librae', body: '16 Librae 3 f', latitude: 57.6, longitude: -88.696587, planetRadius: R };
  const g = guide(w, here);
  assert.equal(g.state, 'guiding');
  assert.equal(g.bearing, 0); // plein nord
  assert.equal(g.turn, 176); // cap actuel 184° : faire demi-tour
  assert.ok(g.distance > 1400 && g.distance < 1500);
  assert.equal(guide({ ...w, body: '16 Librae 3 e' }, here).state, 'other-body');
  assert.equal(guide({ ...w, system: 'Sol' }, here).state, 'other-system');
  assert.equal(guide({ ...w, latitude: null }, here).state, 'no-coords');
  assert.equal(guide(w, { ...here, latitude: 57.6 }).arrived, true);
});

test('session automatique : elle compte la séance en cours, pas les raffinages d\'avant une longue pause', () => {
  const at = (iso) => ({ event: 'MiningRefined', timestamp: iso });
  const events = [at('2026-11-06T10:00:00Z'), at('2026-11-06T14:00:00Z'), at('2026-11-06T14:10:00Z'), { event: 'Cargo', timestamp: '2026-11-06T14:12:00Z' }, at('2026-11-06T14:20:00Z')];
  assert.equal(new Date(runStart(events, Date.parse('2026-11-06T14:20:00Z'))).toISOString(), '2026-11-06T14:00:00.000Z');
  assert.equal(runStart([], 1000), 1000);
});

test('pauses d’elles-mêmes : plus de 10 min sans rien faire, ou jeu fermé, jusqu’à la prochaine action', () => {
  const T = Date.parse('2026-11-06T20:00:00Z');
  const min = (m) => T + m * 60000;
  const mk = (...list) => list.map(([m, stop]) => ({ t: min(m), stop: Boolean(stop) }));
  // Minage de 0 à 30 min, nuit, retour à 600 min : la nuit ne compte pas
  let r = activeSegments([{ start: min(0) }], mk([5], [12], [21], [30], [600], [605]), min(606));
  assert.deepEqual(r.segments, [{ start: min(0), end: min(30) }, { start: min(600), end: null }]);
  assert.equal(r.pause, null);
  // Toujours endormi : en pause depuis la dernière action
  r = activeSegments([{ start: min(0) }], mk([5], [14], [22], [30]), min(300));
  assert.deepEqual(r.segments, [{ start: min(0), end: min(30) }]);
  assert.equal(r.pause, 'idle');
  // Moins de 10 min sans action (attente des foreuses) : le chrono tourne
  r = activeSegments([{ start: min(0) }], mk([5], [14]), min(20));
  assert.deepEqual(r.segments, [{ start: min(0), end: null }]);
  // Jeu fermé : pause tout de suite, jusqu'au retour
  r = activeSegments([{ start: min(0) }], mk([5], [8, true], [12], [13]), min(14));
  assert.deepEqual(r.segments, [{ start: min(0), end: min(8) }, { start: min(12), end: null }]);
  r = activeSegments([{ start: min(0) }], mk([5], [8, true]), min(9));
  assert.equal(r.pause, 'offline');
  // Période déjà close au bouton : pas de pause en cours
  r = activeSegments([{ start: min(0), end: min(100) }], mk([5], [12], [20]), min(200));
  assert.deepEqual(r.segments, [{ start: min(0), end: min(20) }]);
  assert.equal(r.pause, null);
});

test('session avec pauses : la nuit ne compte ni dans le temps ni dans les taux', () => {
  const T = Date.parse('2026-11-06T20:00:00Z');
  const at = (m) => new Date(T + m * 60000).toISOString();
  const s = new MiningSession(T, { idleMs: IDLE_MS });
  for (let m = 1; m <= 60; m++) s.apply({ event: 'MiningRefined', timestamp: at(m), Type: '$platinum_name;' });
  s.apply({ event: 'Shutdown', timestamp: at(62) });
  let r = s.summary(T + 660 * 60000);
  assert.equal(r.durationSec, 62 * 60);
  assert.equal(r.perHour, 58); // 60 t en 62 min
  s.apply({ event: 'LoadGame', timestamp: at(660) });
  s.mark(T + 670 * 60000); // le SRV roule
  r = s.summary(T + 675 * 60000);
  assert.equal(r.durationSec, (62 + 15) * 60);
});

test('Rhino rentré dans le vaisseau sans vider sa soute : le SRV repasse à 0, le vaisseau prend la soute écrite par le jeu', () => {
  const m = new MiningState();
  m.apply({ event: 'Cargo', Vessel: 'Ship', Count: 168 });
  m.apply({ event: 'Cargo', Vessel: 'SRV', Count: 71 });
  m.apply({ event: 'DockSRV', SRVType: 'mev_rhino' });
  m.apply({ event: 'Cargo', Vessel: 'Ship', Count: 239 });
  assert.equal(m.cargo().srv, 0);
  assert.equal(m.cargo().ship, 239);
});

test('repère reçu de l’escadron : champs connus seulement, coordonnées vérifiées', async () => {
  const { repereImporte } = await import('./index.js');
  const r = repereImporte({ label: ' Filon ', category: 'mining', system: 'Système Test', body: 'Système Test 2 a', latitude: 1.5, longitude: -2.25, drills: 4, siteNumber: 3, vehicle: 'srv', id: 99, createdAt: 'x', inconnu: true });
  assert.deepEqual(r, {
    label: 'Filon', category: 'mining', notes: '', siteNumber: 3, drills: 4, system: 'Système Test', systemAddress: null, body: 'Système Test 2 a',
    station: null, latitude: 1.5, longitude: -2.25, altitude: null, heading: null, planetRadius: null, vehicle: 'srv',
  });
  assert.equal(repereImporte({ system: 'Système Test', category: '__proto__', vehicle: 'char' }).category, 'autre');
  assert.equal(repereImporte({ system: 'Système Test', vehicle: 'char' }).vehicle, null);
  for (const bad of [null, {}, { system: '' }, { system: 'S', latitude: 91, longitude: 0 }, { system: 'S', latitude: 1 }, { system: 'S', latitude: '1', longitude: 2 }]) {
    assert.equal(repereImporte(bad), null, JSON.stringify(bad));
  }
});
