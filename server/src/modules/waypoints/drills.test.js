// Tests des foreuses du Rhino. Rafales réelles de la séance du 7 nov. 2026 (Journal.2026-11-07T091533.01.log) :
// début, fin et nombre de MiningRefined de chacune, en SRV, sur Synuefe OU-E c28-2 4 (rayon 2 957 164,25 m).
// Les positions sont inventées : le journal ne les donne pas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import {
  BURST_GAP_MS, cleanRadiusKm, DRILL_MATCH_M, DRILL_RULES, DrillTracker, drillNumber, MAX_DRILLS, median, MERGE_MS, VIDANGE_MIN_TONS,
} from './drills.js';
import { guideTarget, mountDrills, writeAtomic } from './drillsApi.js';

const RP = 2957164.25;
const BODY = 'Synuefe OU-E c28-2 4';
const SYSTEM = 'Synuefe OU-E c28-2';
const LAT0 = -3.47264; // repère « Iridium », EEP 25
const LON0 = -3.334567;
const DAY = '2026-11-07T';
/** Position à (x, y) mètres du repère, x vers l'est, y vers le nord. */
const at = (x = 0, y = 0, extra = {}) => ({
  system: SYSTEM, body: BODY, planetRadius: RP, vehicle: 'srv', heading: 0,
  latitude: LAT0 + (y / RP) * (180 / Math.PI),
  longitude: LON0 + (x / (RP * Math.cos((LAT0 * Math.PI) / 180))) * (180 / Math.PI),
  ...extra,
});
const t = (hms) => Date.parse(`${DAY}${hms}Z`);

// Première sortie du Rhino (09:01:03 → DockSRV 10:28:19), puis la deuxième (10:59:46 → 11:24:24)
const RUN1 = [
  ['09:10:46', '09:11:24', 23], ['09:16:23', '09:17:02', 22], ['09:22:51', '09:23:28', 22], ['09:31:49', '09:32:25', 23],
  ['09:38:20', '09:39:11', 23], ['09:43:58', '09:44:43', 22], ['09:50:27', '09:51:09', 23], ['09:56:28', '09:57:06', 22],
  ['10:02:03', '10:02:42', 23], ['10:14:07', '10:14:46', 22], ['10:19:39', '10:19:53', 12], ['10:20:34', '10:20:48', 11],
  ['10:25:58', '10:27:02', 24],
];
const DOCK1 = '10:28:19';
const RUN2 = [['11:05:39', '11:06:17', 23], ['11:11:24', '11:12:02', 23], ['11:17:03', '11:17:40', 22], ['11:22:44', '11:23:21', 22]];

/** Une rafale : `n` tonnes réparties de son début à sa fin. */
function burst(tr, [from, to, n], pos) {
  const a = t(from);
  const b = t(to);
  for (let i = 0; i < n; i++) tr.refined(n === 1 ? a : Math.round(a + ((b - a) * i) / (n - 1)), pos);
}

test('règles : nommées, avec statut, date et source', () => {
  assert.equal(MAX_DRILLS, 6);
  assert.equal(BURST_GAP_MS, 40000);
  for (const r of DRILL_RULES) {
    assert.ok(['mesurée', 'publiée', 'à vérifier'].includes(r.status), r.name);
    assert.ok(r.source && r.date && r.value != null, r.name);
  }
});

test('séance du 7 nov. : 12 vidanges de 22 à 24 t, celle de 10:19 faite en deux fois', () => {
  const tr = new DrillTracker();
  for (const b of RUN1) burst(tr, b, at());
  assert.equal(tr.drills.length, 1, 'toujours au même endroit : une seule foreuse');
  const d = tr.drills[0];
  assert.equal(d.n, 1);
  assert.equal(d.vidanges.length, 12);
  assert.deepEqual(d.vidanges.map((v) => v.tons), [23, 22, 22, 23, 23, 22, 23, 22, 23, 22, 23, 24]);
  assert.ok(d.vidanges.every((v) => v.tons >= 22 && v.tons <= 24));
  // Cycle : médiane des intervalles fin de vidange → début de la suivante (4 min 47 à 11 min 25) : 5 min 19 s
  assert.equal(tr.seanceCycle(), 319000);
  const v = tr.view(at(), t('10:30:00'));
  assert.equal(v.drills[0].tons, 272);
  assert.equal(v.drills[0].avgTons, 22.7);
  assert.equal(v.drills[0].cycleFrom, 'drill');
});

test('retour au vaisseau : l’intervalle qui l’enjambe ne compte pas comme un cycle', () => {
  const tr = new DrillTracker();
  for (const b of RUN1) burst(tr, b, at());
  tr.dockSrv(t(DOCK1));
  for (const b of RUN2) burst(tr, b, at(5, -3));
  const d = tr.drills[0];
  assert.equal(d.vidanges.length, 16);
  const intervals = tr.intervals(d);
  assert.equal(intervals.length, 14, '15 intervalles, moins celui du retour au vaisseau (38 min)');
  assert.ok(Math.max(...intervals) < 12 * 60000);
  assert.equal(tr.seanceCycle(), 308500); // (307 s + 310 s) / 2
});

test('deux foreuses à 120 m l’une de l’autre, vidées à tour de rôle : numéros, cycle de chacune, prochaine', () => {
  const tr = new DrillTracker();
  const merged = [...RUN1.slice(0, 10), ['10:19:39', '10:20:48', 23], RUN1[12]];
  // La vidange de 10:19 en deux fois : on la rejoue telle quelle, au même endroit
  merged.forEach((b, i) => {
    const pos = i % 2 ? at(120, 0) : at();
    if (i === 10) {
      burst(tr, RUN1[10], pos);
      burst(tr, RUN1[11], pos);
    } else burst(tr, b, pos);
  });
  assert.deepEqual(tr.drills.map((d) => [d.n, d.vidanges.length]), [[1, 6], [2, 6]]);
  const v = tr.view(at(60, 0), t('10:27:30'));
  for (const d of v.drills) assert.ok(d.cycleMs > 10 * 60000 && d.cycleMs < 13 * 60000, `cycle ${d.cycleMs}`);
  // 10:27:30 : la 2 vient d'être vidée, la 1 l'a été à 10:20:48 : elle est la prochaine
  assert.equal(v.next, 1);
  assert.equal(v.drills.find((d) => d.n === 1).ready, false);
  assert.equal(tr.view(at(), t('10:40:00')).drills.find((d) => d.n === 1).ready, true);
  assert.ok(Math.abs(v.drills[1].x - v.drills[0].x - 120) < 1, 'à plat autour de la foreuse 1');
  assert.ok(Math.abs(v.drills[0].distance - 60) < 1);
});

test('pas une vidange : moins de 10 t, en vaisseau, ou sans position', () => {
  const tr = new DrillTracker();
  burst(tr, ['09:00:00', '09:00:20', VIDANGE_MIN_TONS - 1], at());
  assert.equal(tr.drills.length, 0);
  burst(tr, ['09:10:00', '09:10:40', 23], at(0, 0, { vehicle: 'ship' }));
  assert.equal(tr.drills.length, 0);
  burst(tr, ['09:20:00', '09:20:40', 23], { vehicle: 'srv', body: BODY });
  assert.equal(tr.drills.length, 0);
  // Rafale coupée par plus de 40 s : deux rafales de 9, pas une vidange de 18 (au même endroit, sans vidange avant)
  burst(tr, ['09:30:00', '09:30:16', 9], at());
  burst(tr, ['09:30:57', '09:31:13', 9], at());
  assert.equal(tr.drills.length, 0);
});

test('pose marquée : en SRV seulement ; la vidange d’à côté est la sienne ; reposée, son cycle repart', () => {
  const tr = new DrillTracker();
  assert.throws(() => tr.place(at(0, 0, { vehicle: 'ship' }), t('09:00:00')), /SRV/);
  assert.throws(() => tr.place({ vehicle: 'srv' }, t('09:00:00')), /Position/);
  const d = tr.place(at(), t('09:00:00'));
  assert.equal(d.n, 1);
  let v = tr.view(at(), t('09:03:00'));
  assert.equal(v.drills[0].lastKind, 'pose');
  assert.equal(v.drills[0].ready, null, 'pas encore de cycle mesuré');
  burst(tr, ['09:06:00', '09:06:40', 23], at(DRILL_MATCH_M - 20, 0));
  burst(tr, ['09:12:00', '09:12:40', 22], at(0, 15));
  assert.equal(tr.drills.length, 1);
  assert.equal(tr.drills[0].vidanges.length, 2);
  assert.equal(tr.place(at(10, 10), t('09:13:00')).n, 1, 'reposée au même endroit');
  burst(tr, ['09:19:00', '09:19:40', 22], at());
  assert.equal(tr.intervals(tr.drills[0]).length, 1, 'l’intervalle qui enjambe la pose ne compte pas');
  v = tr.view(at(), t('09:20:00'));
  assert.equal(v.drills[0].lastKind, 'vidange');
});

test('numéros de 1 à 6 ; une 7e foreuse prend la place de la plus ancienne', () => {
  const tr = new DrillTracker();
  for (let i = 0; i < 6; i++) tr.place(at(i * 200, 0), t(`09:0${i}:00`));
  assert.deepEqual(tr.drills.map((d) => d.n), [1, 2, 3, 4, 5, 6]);
  tr.remove(3);
  assert.equal(tr.place(at(0, 900), t('09:07:00')).n, 3, 'premier numéro libre');
  const seventh = tr.place(at(0, 2000), t('09:08:00'));
  assert.equal(seventh.n, 1, 'la 1, posée la première et jamais vidée, est remplacée');
  assert.equal(tr.drills.length, 6);
  assert.equal(drillNumber('7'), null);
  assert.equal(drillNumber('constructor'), null);
  assert.equal(drillNumber(2), 2);
});

test('autre planète, ou 3 h sans rien : nouvelle séance', () => {
  const tr = new DrillTracker();
  tr.place(at(), t('09:00:00'));
  burst(tr, ['09:10:00', '09:10:40', 23], at(0, 0, { body: 'Synuefe OU-E c28-2 2' }));
  assert.equal(tr.seance.body, 'Synuefe OU-E c28-2 2');
  assert.equal(tr.drills.length, 1);
  assert.equal(tr.drills[0].vidanges.length, 1);
  tr.place(at(0, 0, { body: 'Synuefe OU-E c28-2 2' }), t('13:30:00'));
  assert.equal(tr.drills[0].vidanges.length, 0, '3 h après : on repart de zéro');
});

test('carte du balayage, rayon de destruction seulement s’il est réglé', () => {
  const tr = new DrillTracker();
  tr.place(at(1000, 0), t('09:00:00'));
  const center = { ...at(0, 0), body: BODY };
  let v = tr.view(at(0, -3700), t('09:01:00'), center);
  assert.equal(v.origin, 'sweep');
  assert.ok(Math.abs(v.drills[0].x - 1000) < 2 && Math.abs(v.drills[0].y) < 2);
  assert.ok(Math.abs(v.you.y + 3700) < 2);
  assert.equal(v.destroyRadius, null);
  assert.equal(v.drills[0].warn, false, 'aucune alerte par défaut');
  tr.setDestroyRadius('4');
  v = tr.view(at(0, -3700), t('09:01:00'), center);
  assert.equal(v.destroyRadius, 4000);
  assert.equal(v.drills[0].warn, true, 'à 3,8 km d’un rayon de 4 km');
  assert.equal(tr.view(at(), t('09:01:00'), { ...center, body: 'Ailleurs 1' }).origin, 'drill');
  assert.equal(cleanRadiusKm(''), null);
  assert.equal(cleanRadiusKm('2,5'), 2500);
  assert.throws(() => cleanRadiusKm('900'), /Rayon/);
  assert.throws(() => cleanRadiusKm('abc'), /Rayon/);
});

test('guidage vers la prochaine foreuse ou vers un numéro', () => {
  const tr = new DrillTracker();
  assert.equal(tr.guide('next', at(), t('09:00:00')).state, 'none');
  burst(tr, ['09:00:00', '09:00:40', 23], at(0, 500));
  burst(tr, ['09:06:00', '09:06:40', 23], at(0, 500));
  burst(tr, ['09:08:00', '09:08:40', 23], at(300, 0)); // plus de 40 s après : autre rafale
  const g = tr.guide('next', at(), t('09:13:00'));
  assert.equal(g.state, 'guiding');
  assert.equal(g.n, 1, 'cycle 5 min 20 : la 1, vidée à 09:06:40, est prête');
  assert.equal(g.ready, true);
  assert.ok(Math.abs(g.distance - 500) < 2);
  assert.equal(g.bearing, 0);
  assert.equal(tr.guide(2, at(), t('09:13:00')).bearing, 90);
  assert.equal(tr.guide(2, at(300, 10), t('09:13:00')).arrived, true);
  assert.equal(tr.guide(1, at(0, 0, { body: 'Ailleurs 1' }), t('09:13:00')).state, 'other-body');
  assert.equal(tr.guide(5, at(), t('09:13:00')).state, 'none');
  assert.equal(guideTarget('next'), 'next');
  assert.equal(guideTarget('3'), 3);
  assert.equal(guideTarget('__proto__'), null);
});

test('sauvegarde : relue telle quelle, et ce qui est mal formé est écarté', () => {
  const tr = new DrillTracker();
  for (const b of RUN1.slice(0, 4)) burst(tr, b, at());
  tr.dockSrv(t('09:40:00'));
  tr.place(at(400, 0), t('09:41:00'));
  tr.setDestroyRadius(5);
  const back = DrillTracker.fromJSON(JSON.parse(JSON.stringify(tr)));
  assert.deepEqual(JSON.parse(JSON.stringify(back)), JSON.parse(JSON.stringify(tr)));
  assert.equal(back.seanceCycle(), tr.seanceCycle());
  assert.equal(DrillTracker.fromJSON(null).seance, null);
  assert.equal(DrillTracker.fromJSON({ seance: { body: 1 } }).seance, null);
  const odd = DrillTracker.fromJSON({
    seance: { body: BODY, planetRadius: RP, startedAt: '2026-11-07T09:00:00Z', lastAt: '2026-11-07T09:00:00Z' },
    drills: [{ n: 9, latitude: 0, longitude: 0, placedAt: '2026-11-07T09:00:00Z' }, { n: 2, latitude: 'x' }, { n: 1, latitude: 1, longitude: 1 }],
  });
  assert.equal(odd.drills.length, 0, 'numéro hors limites, position illisible, ni posée ni vidée');
  assert.equal(odd.seance, null);
});

test('médiane', () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 3); // (2 + 3) / 2 arrondi
});

// Routes HTTP et journal, avec un faux routeur : rien n'est écrit hors du dossier temporaire du test
function fakeRouter() {
  const routes = new Map();
  const add = (method) => (p, fn) => routes.set(`${method} ${p}`, fn);
  const router = { get: add('GET'), post: add('POST'), put: add('PUT'), delete: add('DELETE') };
  async function call(method, p, { body, params = {} } = {}) {
    const out = { status: 200, body: null, error: null };
    const res = {
      status(s) { out.status = s; return res; },
      json(b) { out.body = b; return res; },
    };
    await routes.get(`${method} ${p}`)({ body, params }, res, (e) => { out.error = e; });
    return out;
  }
  return { router, call };
}

test('branchement : vidange vue dans le journal, pose, retrait, réglage, boussole, fichier écrit d’un coup', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drills-'));
  const file = path.join(dir, 'drills.json');
  try {
    const { router, call } = fakeRouter();
    const journal = new EventEmitter();
    const sent = [];
    let pos = at();
    let clock = t('09:00:00');
    const api = mountDrills({ router, journal, broadcast: (type, data) => sent.push([type, data]), here: () => pos, file, now: () => clock });
    let r = await call('POST', '/drills');
    assert.equal(r.status, 201);
    assert.equal(r.body.n, 1);
    for (let i = 0; i < 23; i++) journal.emit('event', { event: 'MiningRefined', timestamp: new Date(t('09:06:00') + i * 1700).toISOString(), Type: '$iridium_name;' });
    pos = at(500, 0);
    clock = t('09:08:00');
    r = await call('POST', '/drills');
    assert.equal(r.body.n, 2);
    r = await call('GET', '/drills');
    assert.deepEqual(r.body.drills.map((d) => [d.n, d.vidanges, d.tons]), [[1, 1, 23], [2, 0, 0]]);
    assert.ok(sent.some(([type]) => type === 'waypoints:drills'));
    journal.emit('event', { event: 'DockSRV', timestamp: '2026-11-07T09:09:00Z' });
    assert.equal(api.tracker.seance.breaks.length, 1);

    r = await call('DELETE', '/drills/:n', { params: { n: 'abc' } });
    assert.equal(r.error?.status, 400);
    r = await call('DELETE', '/drills/:n', { params: { n: '5' } });
    assert.equal(r.error?.status, 404);
    r = await call('DELETE', '/drills/:n', { params: { n: '2' } });
    assert.equal(r.body.drills.length, 1);
    r = await call('PUT', '/drills/settings', { body: { destroyRadiusKm: 'beaucoup' } });
    assert.equal(r.error?.status, 400);
    r = await call('PUT', '/drills/settings', { body: { destroyRadiusKm: '5' } });
    assert.equal(r.body.destroyRadius, 5000);

    r = await call('PUT', '/drills/guide', { body: { target: 'next' } });
    assert.equal(r.body.state, 'guiding');
    assert.deepEqual(sent.at(-1), ['waypoints:drill-guide', { target: 'next' }]);
    api.guideOff();
    assert.deepEqual(sent.at(-1), ['waypoints:drill-guide', { target: null }]);
    assert.equal((await call('GET', '/drills/guide')).body.state, 'off');

    api.flush();
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.drills.length, 1);
    assert.equal(saved.settings.destroyRadius, 5000);
    assert.deepEqual(fs.readdirSync(dir), ['drills.json'], 'pas de fichier temporaire oublié');
    // Redémarrage : tout est relu
    const again = mountDrills({ router: fakeRouter().router, journal: new EventEmitter(), broadcast: () => {}, here: () => pos, file, now: () => clock });
    assert.equal(again.tracker.drills[0].vidanges[0].tons, 23);
    r = await call('DELETE', '/drills');
    assert.equal(r.body.active, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('écriture atomique : le fichier est remplacé en entier', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drills-w-'));
  try {
    const file = path.join(dir, 'sub', 'x.json');
    writeAtomic(file, '{"a":1}');
    writeAtomic(file, '{"a":2}');
    assert.equal(fs.readFileSync(file, 'utf8'), '{"a":2}');
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['x.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('position d’une foreuse jamais marquée : moyenne de ses vidanges, et l’écart le plus grand', () => {
  const tr = new DrillTracker();
  burst(tr, ['09:00:00', '09:00:40', 23], at(0, 0));
  burst(tr, ['09:06:00', '09:06:40', 23], at(30, 0));
  const v = tr.view(at(15, 0), t('09:07:00'));
  assert.equal(v.drills.length, 1);
  assert.ok(Math.abs(v.drills[0].distance) < 1, 'au milieu des deux vidanges');
  assert.equal(v.drills[0].spread, 15);
  // Une pose marquée donne la position exacte, et ne bouge plus
  tr.place(at(20, 0), t('09:08:00'));
  burst(tr, ['09:14:00', '09:14:40', 23], at(-10, 0));
  assert.ok(Math.abs(tr.view(at(20, 0), t('09:15:00')).drills[0].distance) < 1);
});

test('journal relu depuis le début : les vieux raffinages ne prennent pas ta position actuelle', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drills-old-'));
  try {
    const journal = new EventEmitter();
    const api = mountDrills({ router: fakeRouter().router, journal, broadcast: () => {}, here: () => at(), file: path.join(dir, 'd.json'), now: () => t('12:00:00') });
    for (let i = 0; i < 23; i++) journal.emit('event', { event: 'MiningRefined', timestamp: new Date(t('09:06:00') + i * 1700).toISOString() });
    assert.equal(api.tracker.drills.length, 0);
    api.flush();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('première vidange d’une séance : la rafale n’est pas coupée quand la séance s’ouvre, même si le SRV roule', () => {
  // Les 10 premières tonnes à l'arrivée, puis le SRV va chercher des morceaux à 60 m (plus loin que DRILL_MATCH_M)
  const pos = (i) => (i < 10 ? at(0, 0) : at(60, 0));
  const fresh = new DrillTracker();
  for (let i = 0; i < 23; i++) fresh.refined(t('09:10:46') + i * 1700, pos(i));
  assert.deepEqual(fresh.drills.map((d) => [d.n, d.vidanges.map((v) => v.tons)]), [[1, [23]]], 'une seule foreuse, une vidange de 23 t');
  // Même chose quand la séance d'avant était sur une autre planète
  const moved = new DrillTracker();
  burst(moved, ['08:00:00', '08:00:40', 23], at(0, 0, { body: 'Synuefe OU-E c28-2 2' }));
  for (let i = 0; i < 23; i++) moved.refined(t('09:10:46') + i * 1700, pos(i));
  assert.equal(moved.seance.body, BODY);
  assert.deepEqual(moved.drills.map((d) => [d.n, d.vidanges.map((v) => v.tons)]), [[1, [23]]]);
  // Et avec une séance déjà ouverte, rien ne change
  const open = new DrillTracker();
  open.place(at(0, 1000), t('09:09:00'));
  for (let i = 0; i < 23; i++) open.refined(t('09:10:46') + i * 1700, pos(i));
  assert.deepEqual(open.drills.map((d) => [d.n, d.vidanges.map((v) => v.tons)]), [[1, []], [2, [23]]]);
});

test('séance close après 3 h sans rien : plus montrée, plus suivie, et la suivante repart de zéro', () => {
  const tr = new DrillTracker();
  for (const s of ['09:10:46', '09:16:46', '09:22:46']) {
    for (let i = 0; i < 23; i++) tr.refined(t(s) + i * 1700, at());
  }
  const back = DrillTracker.fromJSON(JSON.parse(JSON.stringify(tr)));
  const last = back.seance.lastAt;
  assert.equal(back.isOpen(last + 3 * 3600 * 1000), true, '3 h pile : encore ouverte');
  const later = last + 26 * 3600 * 1000; // le lendemain
  assert.equal(back.isOpen(later), false);
  const v = back.view(at(0, 0, { body: 'Autre 1' }), later);
  assert.equal(v.active, false);
  assert.deepEqual(v.drills, []);
  assert.equal(back.next(later), null);
  assert.equal(back.guide('next', at(200, 0), later).state, 'none');
  assert.equal(back.guide(1, at(200, 0), later).state, 'none');
  // Les foreuses de la veille restent dans le fichier jusqu'à la prochaine vidange, qui ouvre une nouvelle séance
  for (let i = 0; i < 23; i++) back.refined(later + i * 1700, at(0, 0, { body: 'Autre 1' }));
  assert.equal(back.seance.body, 'Autre 1');
  assert.deepEqual(back.drills.map((d) => [d.n, d.vidanges.length]), [[1, 1]]);
  assert.equal(back.view(at(0, 0, { body: 'Autre 1' }), later + 60000).active, true);
});

test('séance close : dite une fois aux fenêtres, la boussole lâche les foreuses, puis plus de diffusion', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drills-close-'));
  try {
    const { router, call } = fakeRouter();
    const journal = new EventEmitter();
    const sent = [];
    let clock = t('09:06:00');
    const api = mountDrills({ router, journal, broadcast: (type, data) => sent.push([type, data]), here: () => at(), file: path.join(dir, 'd.json'), now: () => clock });
    for (let i = 0; i < 23; i++) {
      clock = t('09:06:00') + i * 1700;
      journal.emit('event', { event: 'MiningRefined', timestamp: new Date(clock).toISOString() });
    }
    assert.equal((await call('PUT', '/drills/guide', { body: { target: 'next' } })).body.state, 'guiding');
    clock += 3 * 3600 * 1000 + 1000;
    sent.length = 0;
    journal.emit('status', {});
    assert.deepEqual(sent.map(([type]) => type), ['waypoints:drill-guide', 'waypoints:drills']);
    assert.deepEqual(sent[0][1], { target: null });
    assert.equal(sent[1][1].active, false);
    journal.emit('status', {});
    journal.emit('status', {});
    assert.equal(sent.length, 2, 'plus rien à chaque Status.json');
    assert.equal((await call('GET', '/drills')).body.active, false);
    api.flush();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('seuils de rafale et de reprise : des marges choisies, à vérifier, avec ce qui a été mesuré', () => {
  for (const name of ['BURST_GAP_MS', 'MERGE_MS']) {
    const r = DRILL_RULES.find((x) => x.name === name);
    assert.equal(r.status, 'à vérifier', name);
    assert.match(r.measured, /4 min 47/, name);
  }
  assert.equal(DRILL_RULES.find((x) => x.name === 'MERGE_MS').value, MERGE_MS);
});
