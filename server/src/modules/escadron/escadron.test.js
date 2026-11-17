// Tests du module Escadron : capteur du Squadron Tracker et « Mon apport à l'escadron ».
// Aucun envoi réseau : fetch et minuteries sont simulés, les fichiers vont dans un dossier temporaire du système.
// Les chiffres viennent des journaux de référence (24 oct.–7 nov. 2026).

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { MeritContext, buildPayload, isLiveGalaxy, payloadKey, validPayload } from './payload.js';
import { SquadronSensor, maskToken, sinceFor, weekStart, workerBase } from './sensor.js';
import { STATE_FILE, TOKEN_FILE, fileStore } from './store.js';
import { SquadronStats, describeKey, readSquadron } from './stats.js';
import { moduleFetch, setup } from './index.js';
import { RULES, WORKER_MAX_AGE_MS } from './rules.js';

// Serveur d'escadron des tests : l'app n'en a aucun par défaut, chaque escadron règle le sien
const WORKER_URL = 'https://escadron-test.workers.dev';

const TOKEN = `${'Ab3_'.repeat(10)}x-Z`; // 43 caractères, comme un vrai jeton (newToken du Worker)
const OTHER_TOKEN = `${'Zz9-'.repeat(10)}k_Q`;
const NOW = Date.parse('2026-11-07T22:00:00Z');

const header = (ts = '2026-11-07T08:13:00Z', gameversion = '4.4.2.1') => ({ event: 'Fileheader', timestamp: ts, gameversion });
const login = (ts = '2026-11-07T08:14:00Z', Commander = 'Testeur') => ({ event: 'LoadGame', timestamp: ts, Commander, gameversion: '4.4.2.1' });
const jump = (StarSystem, timestamp) => ({ event: 'FSDJump', timestamp, StarSystem });
const merit = (timestamp, MeritsGained, TotalMerits) => ({ event: 'PowerplayMerits', timestamp, Power: 'Aisling Duval', MeritsGained, TotalMerits });
const start = [header(), login(), jump('Synuefe OU-E c28-2', '2026-11-07T08:20:00Z')];

const dirs = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-escadron-'));
  dirs.push(dir);
  return dir;
};
after(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** Faux réseau : chaque appel prend la réponse suivante de la liste (200 ensuite). */
function fakeNet(replies = []) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    const next = replies.length ? replies.shift() : 200;
    if (next instanceof Error) throw next;
    return { status: next };
  };
  return { calls, fetch };
}

/** Fausses minuteries : rien ne part tout seul, le test déclenche. */
function fakeTimers() {
  const timers = new Map();
  let id = 0;
  return {
    timers,
    setTimer: (fn, ms) => {
      timers.set(++id, { fn, ms });
      return id;
    },
    clearTimer: (h) => timers.delete(h),
    fire() {
      const [[h, t]] = timers;
      timers.delete(h);
      t.fn();
    },
  };
}

function makeSensor({ dir = tmp(), replies, now = () => NOW, token = TOKEN, allowHost } = {}) {
  const net = fakeNet(replies);
  const clock = fakeTimers();
  const store = fileStore(dir);
  if (token) store.writeToken(token);
  const sensor = new SquadronSensor({
    store, fetch: net.fetch, now, gapMs: 0, saveDelayMs: 0, setTimer: clock.setTimer, clearTimer: clock.clearTimer, allowHost,
    url: `${WORKER_URL}/v1/merits`,
  });
  return { sensor, net, clock, dir, store };
}

/** Attend la fin de l'envoi en cours (le faux réseau répond tout de suite). */
async function settle(sensor) {
  await new Promise((r) => setImmediate(r));
  while (sensor.running) await new Promise((r) => setImmediate(r));
}

// --- Contrat du Worker ---

test('le message envoyé : quatre champs, à l\'adresse du plugin, jeton en en-tête, sans redirection', async () => {
  const { sensor, net } = makeSensor();
  sensor.configure({ enabled: true, since: 'week' });
  sensor.ingestHistory([...start, merit('2026-11-07T13:50:22Z', 1773, 1296017)]);
  await settle(sensor);
  assert.equal(net.calls.length, 1);
  const [call] = net.calls;
  assert.equal(call.url, `${WORKER_URL}/v1/merits`);
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(call.options.headers['content-type'], 'application/json');
  assert.equal(call.options.redirect, 'manual');
  assert.deepEqual(call.body, { cmdr: 'Testeur', system: 'Synuefe OU-E c28-2', merits: 1773, at: '2026-11-07T13:50:22Z' });
  assert.equal(sensor.view().counts.sent, 1);
  assert.equal(sensor.view().lastConfirmedAt, '2026-11-07T13:50:22Z');
});

// --- Serveur d'un autre escadron ---

test('adresse du serveur : https, nom public, origine seule ; celle de l\'app ou vide redonne le serveur de l\'app', () => {
  assert.equal(workerBase('https://Mon-Escadron.workers.dev'), 'https://mon-escadron.workers.dev');
  assert.equal(workerBase(' https://mon-escadron.workers.dev/v1/merits/ '), 'https://mon-escadron.workers.dev');
  assert.equal(workerBase(WORKER_URL), WORKER_URL);
  assert.equal(workerBase(''), null);
  assert.equal(workerBase(null), null);
  for (const bad of ['http://mon-escadron.workers.dev', 'https://moi:mdp@x.workers.dev', 'https://x.workers.dev:8443',
    'https://x.workers.dev/?a=1', 'https://x.workers.dev/autre', 'https://192.168.1.10', 'https://localhost', 'https://nas.lan',
    'https://[::1]', 'pas une adresse', 42, 'https://' + 'a'.repeat(300) + '.dev']) {
    assert.throws(() => workerBase(bad), (e) => e.status === 400 && typeof e.publicMessage === 'string', String(bad));
  }
});

test('autre serveur : le jeton est effacé (jamais envoyé ailleurs), le rattrapage repart vers le nouveau', async () => {
  const dir = tmp();
  const hosts = [];
  const { sensor, net, store } = makeSensor({ dir, allowHost: (h) => hosts.push(h) });
  assert.deepEqual(hosts, [null]); // serveur de l'app : aucun hôte en plus dans la liste blanche
  sensor.configure({ enabled: true, since: 'week' });
  sensor.ingestHistory([...start, merit('2026-11-07T13:50:22Z', 1773, 1296017)]);
  await settle(sensor);
  assert.equal(net.calls.length, 1);
  sensor.setWorker('https://mon-escadron.workers.dev');
  assert.deepEqual(hosts, [null, 'mon-escadron.workers.dev']);
  const v = sensor.view();
  assert.equal(v.hasToken, false);
  assert.equal(store.readToken(), null);
  assert.equal(v.worker, 'https://mon-escadron.workers.dev');
  assert.equal(v.destination, 'https://mon-escadron.workers.dev/v1/merits');
  assert.equal('defaultWorker' in v, false, 'aucun serveur par défaut');
  assert.equal(v.counts.sent, 0);
  assert.equal(v.queue, 1, 'le gain déjà reçu par l\'ancien serveur repart vers le nouveau');
  await settle(sensor);
  assert.equal(net.calls.length, 1, 'rien ne part sans le jeton du nouveau serveur');
  sensor.setToken(OTHER_TOKEN);
  await settle(sensor);
  assert.equal(net.calls.length, 2);
  assert.equal(net.calls[1].url, 'https://mon-escadron.workers.dev/v1/merits');
  assert.equal(net.calls[1].options.headers.authorization, `Bearer ${OTHER_TOKEN}`);
  // Gardé au redémarrage, avec son jeton
  sensor.stop();
  const b = makeSensor({ dir, token: null, allowHost: (h) => hosts.push(h) });
  assert.equal(b.sensor.view().destination, 'https://mon-escadron.workers.dev/v1/merits');
  assert.equal(b.sensor.view().hasToken, true);
  assert.equal(hosts.at(-1), 'mon-escadron.workers.dev');
  // Même adresse : rien ne change ; adresse refusée : rien ne change non plus
  b.sensor.setWorker('https://mon-escadron.workers.dev/');
  assert.equal(b.sensor.view().hasToken, true);
  assert.throws(() => b.sensor.setWorker('https://192.168.1.10'), (e) => e.status === 400);
  assert.equal(b.sensor.view().hasToken, true);
  // Retour au serveur de l'app : jeton effacé aussi
  b.sensor.setWorker('');
  assert.equal(b.sensor.view().worker, null);
  assert.equal(b.sensor.view().hasToken, false);
  assert.equal(hosts.at(-1), null);
});

test('réglage du serveur modifié à la main : le jeton ne part pas vers une adresse qu\'il ne connaît pas', () => {
  const dir = tmp();
  const store = fileStore(dir);
  store.writeToken(TOKEN);
  store.writeState({ version: 1, enabled: true, workerUrl: 'https://192.168.1.10' });
  const { sensor } = makeSensor({ dir, token: null });
  assert.equal(sensor.view().worker, null);
  assert.equal(sensor.view().hasToken, false);
});

test('buildPayload : mêmes refus que le Worker (validMerits)', () => {
  const ev = merit('2026-11-07T13:50:22Z', 10, 1);
  assert.deepEqual(buildPayload('Testeur', 'Sol', ev), { cmdr: 'Testeur', system: 'Sol', merits: 10, at: '2026-11-07T13:50:22Z' });
  assert.equal(buildPayload('', 'Sol', ev), null);
  assert.equal(buildPayload(null, 'Sol', ev), null);
  assert.equal(buildPayload('x'.repeat(65), 'Sol', ev), null);
  for (const MeritsGained of [0, -5, 1.5, '10', 1_000_001]) assert.equal(buildPayload('C', 'Sol', { ...ev, MeritsGained }), null);
  assert.equal(buildPayload('C', 'Sol', { ...ev, timestamp: '2026-11-07T13:50:22.123Z' }), null);
  // Système inconnu ou trop long : envoyé vide (le Worker l'accepte), le gain n'est pas perdu
  assert.equal(buildPayload('C', null, ev).system, '');
  assert.equal(buildPayload('C', 'y'.repeat(65), ev).system, '');
  assert.equal(validPayload({ cmdr: 'C', system: 'Sol', merits: 3, at: '2026-11-07T13:50:22Z', extra: 1 }).extra, undefined);
  assert.equal(validPayload({ cmdr: 'C', merits: 3, at: '2026-11-07T13:50:22Z' }), null);
});

test('système : celui où l\'on est au moment du gain, pas la destination d\'un saut', () => {
  const ctx = new MeritContext();
  for (const ev of [header(), login(), jump('Mombaluma', '2026-11-07T09:00:00Z')]) ctx.apply(ev);
  ctx.apply({ event: 'StartJump', timestamp: '2026-11-07T09:10:00Z', JumpType: 'Hyperspace', StarSystem: 'Vequess' });
  assert.equal(ctx.apply(merit('2026-11-07T09:10:05Z', 50, 100)).payload.system, 'Mombaluma');
  ctx.apply({ event: 'CarrierJump', timestamp: '2026-11-07T10:00:00Z', StarSystem: 'HIP 8060' });
  assert.equal(ctx.apply(merit('2026-11-07T10:00:05Z', 50, 150)).payload.system, 'HIP 8060');
  ctx.apply({ event: 'Commander', timestamp: '2026-11-07T10:01:00Z', Name: 'Autre' });
  assert.equal(ctx.apply(merit('2026-11-07T10:01:05Z', 5, 155)).payload.cmdr, 'Autre');
});

test('galaxie Legacy, bêta ou version inconnue : rien ne part, comme avec EDMC', async () => {
  assert.equal(isLiveGalaxy('4.4.2.1'), true);
  assert.equal(isLiveGalaxy('4.0.0.1300'), true);
  assert.equal(isLiveGalaxy('3.8.0.407'), false);
  assert.equal(isLiveGalaxy('4.5.0.100 Beta'), false);
  assert.equal(isLiveGalaxy('4.5.0.100 alpha'), false);
  assert.equal(isLiveGalaxy(null), false);
  const { sensor, net } = makeSensor();
  sensor.configure({ enabled: true, since: 'week' });
  sensor.ingestHistory([
    header('2026-11-07T08:13:00Z', '4.5.0.1 Beta'), { ...login(), gameversion: '4.5.0.1 Beta' }, merit('2026-11-07T09:00:00Z', 10, 10),
    header('2026-11-07T09:13:00Z', '3.8.0.407'), { ...login('2026-11-07T09:14:00Z'), gameversion: '3.8.0.407' }, merit('2026-11-07T09:20:00Z', 10, 20),
  ]);
  await settle(sensor);
  assert.equal(net.calls.length, 0);
  assert.equal(sensor.view().tally.galaxie, 2);
  assert.equal(sensor.view().liveGalaxy, false);
});

test('lignes en double du jeu : même total réécrit, non envoyé ; même seconde et même gain, une seule fois', async () => {
  const { sensor, net } = makeSensor();
  sensor.configure({ enabled: true, since: 'week' });
  sensor.ingestHistory([
    ...start,
    // 26 oct. 2026 18:43 (ici le 7 nov.) : 14 mérites, total 798 773 écrit deux fois
    merit('2026-11-07T18:43:15Z', 14, 798773),
    merit('2026-11-07T18:43:16Z', 14, 798773),
    // 2 nov. 2026 : 60, 28, 28 (même seconde) puis 7, totaux 1 095 289, 1 095 317, 1 095 345, 1 095 324
    merit('2026-11-07T20:38:20Z', 60, 1095289),
    merit('2026-11-07T20:38:21Z', 28, 1095317),
    merit('2026-11-07T20:38:21Z', 28, 1095345),
    merit('2026-11-07T20:38:33Z', 7, 1095324),
  ]);
  await settle(sensor);
  assert.deepEqual(net.calls.map((c) => [c.body.at, c.body.merits]), [
    ['2026-11-07T18:43:15Z', 14], ['2026-11-07T20:38:20Z', 60], ['2026-11-07T20:38:21Z', 28], ['2026-11-07T20:38:33Z', 7],
  ]);
  assert.equal(sensor.view().tally.doublon, 1);
  // Le second 28 est annulé par le 7 (1 095 324 − 7 = 1 095 345 − 28) ; le premier, crédité, a la même clé et part
  assert.equal(sensor.view().tally.annule, 1);
});

test('gain annulé par la ligne suivante : pas envoyé au rattrapage, même s\'il attendait dans la file avant l\'arrêt', async () => {
  // 7 nov. 2026 : 2 015 à 13:50:13 (total 1 296 259), puis 1 773 à 13:50:22 (total 1 296 017) : seul 1 773 compte
  const history = [...start, merit('2026-11-07T13:49:00Z', 50, 1294244), merit('2026-11-07T13:50:13Z', 2015, 1296259), merit('2026-11-07T13:50:22Z', 1773, 1296017)];
  const { sensor, net } = makeSensor();
  sensor.configure({ enabled: true, since: 'week' });
  sensor.ingestHistory(history);
  await settle(sensor);
  assert.deepEqual(net.calls.map((c) => c.body.merits), [50, 1773]);
  assert.equal(sensor.view().tally.annule, 1);
  // L'app s'arrête avec 2 015 en file (serveur injoignable) ; au redémarrage, le journal montre qu'il a été annulé
  const dir = tmp();
  const a = makeSensor({ dir, replies: [503] });
  a.sensor.configure({ enabled: true, since: 'week' });
  a.sensor.ingestHistory(history.slice(0, -1));
  await settle(a.sensor);
  a.sensor.stop();
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, STATE_FILE), 'utf8')).pending.length, 2);
  const b = makeSensor({ dir, token: null });
  b.sensor.ingestHistory(history);
  await settle(b.sensor);
  assert.deepEqual(b.net.calls.map((c) => c.body.merits), [50, 1773]);
});

test('gain annulé par la ligne suivante, en direct : retiré de la file s\'il attendait ; déjà parti, il reste compté', async () => {
  const waiting = makeSensor({ replies: [503] });
  waiting.sensor.configure({ enabled: true, since: 'week' });
  waiting.sensor.ingestHistory(start);
  waiting.sensor.live(merit('2026-11-07T13:50:13Z', 2015, 1296259));
  await settle(waiting.sensor);
  assert.equal(waiting.sensor.view().waitingRetry, true);
  waiting.sensor.live(merit('2026-11-07T13:50:22Z', 1773, 1296017));
  assert.equal(waiting.sensor.view().queue, 1);
  waiting.clock.fire();
  await settle(waiting.sensor);
  assert.deepEqual(waiting.net.calls.map((c) => c.body.merits), [2015, 1773]); // 2 015 : seulement l'essai en 503
  assert.equal(waiting.sensor.view().counts.sent, 1);

  const gone = makeSensor();
  gone.sensor.configure({ enabled: true, since: 'week' });
  gone.sensor.ingestHistory(start);
  gone.sensor.live(merit('2026-11-07T13:50:13Z', 2015, 1296259));
  await settle(gone.sensor);
  gone.sensor.live(merit('2026-11-07T13:50:22Z', 1773, 1296017));
  await settle(gone.sensor);
  assert.deepEqual(gone.net.calls.map((c) => c.body.merits), [2015, 1773]);
  assert.equal(gone.sensor.view().tally.annuleApresEnvoi, 1);
  assert.equal(gone.sensor.view().tally.annule, 0);
});

test('annulation : jamais d\'une partie à l\'autre ni d\'une puissance à l\'autre, et jamais un gain crédité', () => {
  const ctx = new MeritContext();
  for (const ev of start) ctx.apply(ev);
  const a = ctx.apply(merit('2026-11-07T10:00:00Z', 100, 1100));
  const b = ctx.apply(merit('2026-11-07T10:01:00Z', 10, 1110)); // normal : 1 110 − 10 = 1 100 > 1 100 − 100
  assert.equal(a.skip, null);
  assert.equal(b.cancels, undefined);
  ctx.apply(login('2026-11-07T11:00:00Z'));
  ctx.apply(merit('2026-11-07T11:01:00Z', 50, 1000)); // nouvelle partie : rien à comparer avec la précédente
  assert.equal(b.skip, null);
  const c = ctx.apply(merit('2026-11-07T11:02:00Z', 40, 1040));
  ctx.apply({ ...merit('2026-11-07T11:03:00Z', 5, 5), Power: 'Edmund Mahon' }); // autre puissance (défection)
  assert.equal(c.skip, null);
});

// --- Opt-in et jeton ---

test('désactivé par défaut : rien ne part, même avec un jeton enregistré', async () => {
  const { sensor, net } = makeSensor();
  assert.equal(sensor.view().enabled, false);
  sensor.ingestHistory([...start, merit('2026-11-07T13:50:22Z', 1773, 1296017)]);
  sensor.live(merit('2026-11-07T21:00:00Z', 20, 1296037));
  await settle(sensor);
  assert.equal(net.calls.length, 0);
  assert.equal(sensor.view().queue, 0);
});

test('activé sans jeton : rien ne part ; le jeton collé ensuite lance l\'envoi', async () => {
  const { sensor, net } = makeSensor({ token: null });
  sensor.configure({ enabled: true, since: 'week' });
  sensor.ingestHistory([...start, merit('2026-11-07T13:50:22Z', 1773, 1296017)]);
  await settle(sensor);
  assert.equal(net.calls.length, 0);
  assert.equal(sensor.view().queue, 1);
  sensor.setToken(`  ${TOKEN}\n`); // collé avec des espaces
  await settle(sensor);
  assert.equal(net.calls.length, 1);
});

test('jeton : format vérifié, stocké à part, jamais renvoyé ni écrit en entier ailleurs', async () => {
  const { sensor, dir } = makeSensor({ token: null });
  // Un jeton valide dans un tableau ou un objet n'est pas un texte : refusé (String() l'aurait accepté)
  for (const bad of ['', 'court', `${TOKEN}=`, `${TOKEN.slice(0, 42)}+`, null, 42, [TOKEN], { toString: () => TOKEN }]) {
    assert.throws(() => sensor.setToken(bad), (err) => err.status === 400 && !String(err.message).includes(String(bad || '§')));
  }
  sensor.setToken(TOKEN);
  sensor.configure({ enabled: true, since: 'now' });
  const view = sensor.view();
  assert.equal(view.hasToken, true);
  assert.equal(view.token, `••••••••${TOKEN.slice(-4)}`);
  assert.equal(maskToken(null), null);
  assert.ok(!JSON.stringify(view).includes(TOKEN));
  assert.ok(!fs.readFileSync(path.join(dir, STATE_FILE), 'utf8').includes(TOKEN));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, TOKEN_FILE), 'utf8')).token, TOKEN);
  sensor.clearToken();
  assert.equal(fs.existsSync(path.join(dir, TOKEN_FILE)), false);
  assert.equal(sensor.view().hasToken, false);
});

test('jeton refusé (401) : la file attend un nouveau jeton, rien n\'est perdu ni journalisé', async (t) => {
  const printed = [];
  for (const level of ['log', 'warn', 'error', 'info']) t.mock.method(console, level, (...args) => printed.push(args.join(' ')));
  const { sensor, net } = makeSensor({ replies: [401] });
  sensor.configure({ enabled: true, since: 'week' });
  sensor.ingestHistory([...start, merit('2026-11-07T10:00:00Z', 100, 1000), merit('2026-11-07T11:00:00Z', 200, 1200)]);
  await settle(sensor);
  assert.equal(net.calls.length, 1);
  assert.equal(sensor.view().paused, true);
  assert.equal(sensor.view().queue, 2);
  assert.match(sensor.view().status.text, /Jeton refusé/);
  sensor.live(merit('2026-11-07T12:00:00Z', 300, 1500)); // en pause : mis en file, pas envoyé
  await settle(sensor);
  assert.equal(net.calls.length, 1);
  sensor.setToken(OTHER_TOKEN);
  await settle(sensor);
  assert.equal(net.calls.length, 4);
  assert.deepEqual(net.calls.slice(1).map((c) => c.body.merits), [100, 200, 300]);
  assert.equal(net.calls[3].options.headers.authorization, `Bearer ${OTHER_TOKEN}`);
  assert.ok(printed.every((line) => !line.includes(TOKEN) && !line.includes(OTHER_TOKEN)));
});

test('jeton remplacé pendant un envoi : le refus de l\'ancien ne bloque pas, renvoi avec le nouveau', async () => {
  const dir = tmp();
  fileStore(dir).writeToken(TOKEN);
  const used = [];
  let sensor;
  const fetch = async (url, options) => {
    used.push(options.headers.authorization);
    if (used.length === 1) {
      sensor.setToken(OTHER_TOKEN); // collé pendant que la requête est en route
      return { status: 401 };
    }
    return { status: 200 };
  };
  sensor = new SquadronSensor({ store: fileStore(dir), fetch, now: () => NOW, gapMs: 0, saveDelayMs: 0, setTimer: () => 0, clearTimer: () => {}, url: `${WORKER_URL}/v1/merits` });
  sensor.configure({ enabled: true, since: 'week' });
  sensor.ingestHistory([...start, merit('2026-11-07T10:00:00Z', 100, 1000)]);
  await settle(sensor);
  assert.deepEqual(used, [`Bearer ${TOKEN}`, `Bearer ${OTHER_TOKEN}`]);
  assert.equal(sensor.view().paused, false);
  assert.equal(sensor.view().counts.sent, 1);
});

// --- File d'attente et nouvel essai ---

test('serveur injoignable, puis 503, puis 429 : nouvel essai chaque minute, puis accepté', async () => {
  const { sensor, net, clock } = makeSensor({ replies: [new TypeError('fetch failed'), 503, 429, 200] });
  sensor.configure({ enabled: true, since: 'week' });
  sensor.ingestHistory([...start, merit('2026-11-07T10:00:00Z', 100, 1000)]);
  await settle(sensor);
  assert.equal(net.calls.length, 1);
  assert.match(sensor.view().status.text, /injoignable/);
  assert.deepEqual([...clock.timers.values()].map((x) => x.ms), [60_000]);
  sensor.live(merit('2026-11-07T10:05:00Z', 7, 1007)); // pendant l'attente : rien ne part avant la minute
  await settle(sensor);
  assert.equal(net.calls.length, 1);
  clock.fire();
  await settle(sensor);
  assert.match(sensor.view().status.text, /erreur 503/);
  clock.fire();
  await settle(sensor);
  assert.match(sensor.view().status.text, /erreur 429/);
  clock.fire();
  await settle(sensor);
  assert.equal(net.calls.length, 5); // 3 échecs, puis les deux gains
  assert.deepEqual(net.calls.map((c) => c.body.merits), [100, 100, 100, 100, 7]);
  assert.equal(sensor.view().queue, 0);
  assert.equal(clock.timers.size, 0);
});

test('« Réessayer maintenant » n\'attend pas la minute', async () => {
  const { sensor, net, clock } = makeSensor({ replies: [502] });
  sensor.configure({ enabled: true, since: 'week' });
  sensor.ingestHistory([...start, merit('2026-11-07T10:00:00Z', 100, 1000)]);
  await settle(sensor);
  assert.equal(sensor.view().waitingRetry, true);
  sensor.retryNow();
  await settle(sensor);
  assert.equal(net.calls.length, 2);
  assert.equal(clock.timers.size, 0);
  assert.equal(sensor.view().counts.sent, 1);
});

test('refus définitifs (400, 413) : le gain est écarté, la suite part', async () => {
  const { sensor, net } = makeSensor({ replies: [400, 413, 200] });
  sensor.configure({ enabled: true, since: 'week' });
  sensor.ingestHistory([...start, ...[1, 2, 3].map((i) => merit(`2026-11-07T1${i}:00:00Z`, i, 1000 + i * 10))]);
  await settle(sensor);
  assert.equal(net.calls.length, 3);
  assert.deepEqual(sensor.view().counts, { sent: 1, dropped: 2, expired: 0 });
  assert.equal(sensor.view().queue, 0);
});

test('jeton d\'un autre commandant (403) : un seul refus, les gains attendent, puis partent avec le bon jeton', async () => {
  const { sensor, net } = makeSensor({ replies: [403] });
  sensor.configure({ enabled: true, since: 'max' });
  sensor.ingestHistory([...start, merit('2026-11-07T10:00:00Z', 100, 1000), merit('2026-11-07T11:00:00Z', 200, 1200), merit('2026-11-07T12:00:00Z', 300, 1500)]);
  await settle(sensor);
  assert.equal(net.calls.length, 1); // pas un refus par gain : sur 30 jours de rattrapage, ce serait 1 000 requêtes perdues
  let view = sensor.view();
  assert.equal(view.queue, 3);
  assert.equal(view.blocked, 3);
  assert.deepEqual(view.blockedCmdrs, ['Testeur']);
  assert.deepEqual(view.counts, { sent: 0, dropped: 0, expired: 0 });
  assert.match(view.status.text, /pas celui de Testeur \(erreur 403\)/);
  sensor.live(merit('2026-11-07T13:00:00Z', 7, 1507)); // mis en file, pas envoyé
  await settle(sensor);
  assert.equal(net.calls.length, 1);
  // L'escadron donne le jeton enregistré au bon nom : tout repart, rien n'est perdu
  sensor.setToken(OTHER_TOKEN);
  await settle(sensor);
  assert.deepEqual(net.calls.slice(1).map((c) => c.body.merits), [100, 200, 300, 7]);
  view = sensor.view();
  assert.equal(view.counts.sent, 4);
  assert.equal(view.blocked, 0);
  assert.equal(view.queue, 0);
});

test('plusieurs commandants dans les journaux, jeton pas encore confirmé : rien ne part avant le choix du joueur', async () => {
  // Les deux ordres : l'autre commandant plus ancien (constat d'audit), ou dernier chargé (il partait alors, avec le
  // jeton, au seul motif qu'il était le « commandant actuel »)
  const histories = [
    [header(), login('2026-11-06T20:00:00Z', 'Autre Joueur'), merit('2026-11-06T20:30:00Z', 30, 30),
      header('2026-11-07T08:00:00Z'), login('2026-11-07T08:01:00Z', 'Testeur'), merit('2026-11-07T09:00:00Z', 12, 1012)],
    [header(), login('2026-11-06T20:00:00Z', 'Testeur'), merit('2026-11-06T20:30:00Z', 12, 1012),
      header('2026-11-07T08:00:00Z'), login('2026-11-07T08:01:00Z', 'Autre Joueur'), merit('2026-11-07T09:00:00Z', 30, 30)],
  ];
  for (const history of histories) {
    const { sensor, net } = makeSensor();
    sensor.configure({ enabled: true, since: 'week' });
    sensor.ingestHistory(history);
    sensor.retryNow();
    await settle(sensor);
    assert.deepEqual(net.calls, [], 'rien ne part, et surtout pas le gain d’« Autre Joueur »');
    let view = sensor.view();
    assert.equal(view.needsChoice, true);
    assert.deepEqual(view.commanders, ['Autre Joueur', 'Testeur']);
    assert.equal(view.sendingFor, null);
    assert.equal(view.queue, 2, 'les gains attendent le choix, sans partir');
    assert.equal(view.blocked, 2);
    assert.equal(view.tally.autreCommandant, 0);
    // Le joueur choisit son commandant : seuls ses gains partent, ceux de l'autre sont écartés pour de bon
    assert.throws(() => sensor.chooseCmdr('Inconnu'), (err) => err.status === 400 && /Commandant inconnu/.test(err.publicMessage));
    assert.throws(() => sensor.chooseCmdr(undefined), (err) => err.status === 400);
    assert.throws(() => sensor.chooseCmdr(['Testeur']), (err) => err.status === 400);
    sensor.chooseCmdr('testeur'); // casse libre : le nom des journaux est gardé
    await settle(sensor);
    assert.deepEqual(net.calls.map((c) => c.body.cmdr), ['Testeur']);
    view = sensor.view();
    assert.equal(view.chosenCmdr, 'Testeur');
    assert.equal(view.tokenCmdr, 'Testeur');
    assert.equal(view.needsChoice, false);
    assert.equal(view.queue, 0);
    assert.equal(view.tally.autreCommandant, 1);
    // Accepté pour Testeur : on ne peut plus choisir l'autre avec ce jeton
    assert.throws(() => sensor.chooseCmdr('Autre Joueur'), (err) => err.status === 409 && /colle son jeton/.test(err.publicMessage));
  }
});

test('un seul commandant dans les journaux : aucun choix demandé ; un deuxième chargé avant confirmation : tout attend le choix', async () => {
  const { sensor, net } = makeSensor({ token: null });
  sensor.configure({ enabled: true, since: 'week' });
  sensor.ingestHistory([...start, merit('2026-11-07T10:00:00Z', 100, 1000)]);
  assert.equal(sensor.view().needsChoice, false);
  assert.equal(sensor.view().sendingFor, 'Testeur');
  // Pas encore de jeton : rien n'est confirmé. Un proche charge son commandant et gagne des mérites.
  sensor.live(login('2026-11-07T15:00:00Z', 'Proche'));
  sensor.live(merit('2026-11-07T15:10:00Z', 9, 9));
  assert.equal(sensor.view().needsChoice, true);
  sensor.setToken(TOKEN); // jeton sans commandant : le choix reste à faire
  await settle(sensor);
  assert.deepEqual(net.calls, []);
  // Jeton collé avec son commandant : ses gains partent, et eux seuls
  sensor.setToken(OTHER_TOKEN, 'Proche');
  await settle(sensor);
  assert.deepEqual(net.calls.map((c) => [c.body.cmdr, c.body.merits]), [['Proche', 9]]);
  assert.equal(sensor.view().tokenCmdr, 'Proche');
});

test('jeton avec un commandant inconnu : refusé avant tout changement ; nouveau jeton : le choix est à refaire', async () => {
  const { sensor, net, store } = makeSensor();
  sensor.configure({ enabled: true, since: 'week' });
  sensor.ingestHistory([
    header(), login('2026-11-06T20:00:00Z', 'Autre Joueur'), merit('2026-11-06T20:30:00Z', 30, 30),
    header('2026-11-07T08:00:00Z'), login('2026-11-07T08:01:00Z', 'Testeur'), merit('2026-11-07T09:00:00Z', 12, 1012),
  ]);
  assert.throws(() => sensor.setToken(OTHER_TOKEN, 'Inconnu'), (err) => err.status === 400);
  assert.equal(store.readToken(), TOKEN, 'jeton inchangé');
  sensor.setToken(TOKEN, 'Testeur');
  await settle(sensor);
  assert.deepEqual(net.calls.map((c) => c.body.cmdr), ['Testeur']);
  sensor.setToken(OTHER_TOKEN); // le commandant du nouveau jeton n'est plus connu
  sensor.retryNow();
  sensor.retryNow();
  await settle(sensor);
  assert.equal(sensor.view().needsChoice, true);
  assert.deepEqual(net.calls.map((c) => c.body.cmdr), ['Testeur'], 'jamais « Autre Joueur » sans choix');
  // L'autre commandant est chargé : il ne part pas pour autant (le dernier chargé n'est pas un choix)
  sensor.live(login('2026-11-07T15:00:00Z', 'Autre Joueur'));
  sensor.retryNow();
  await settle(sensor);
  assert.deepEqual(net.calls.map((c) => c.body.cmdr), ['Testeur']);
  // Le joueur dit que ce jeton est celui d'« Autre Joueur » : alors seulement, ses gains partent
  sensor.chooseCmdr('Autre Joueur');
  await settle(sensor);
  assert.deepEqual(net.calls.map((c) => c.body.cmdr), ['Testeur', 'Autre Joueur']);
});

test('commandant choisi : gardé au redémarrage ; jeton effacé : choix effacé', async () => {
  const dir = tmp();
  const history = [
    header(), login('2026-11-06T20:00:00Z', 'Autre Joueur'), merit('2026-11-06T20:30:00Z', 30, 30),
    header('2026-11-07T08:00:00Z'), login('2026-11-07T08:01:00Z', 'Testeur'), merit('2026-11-07T09:00:00Z', 12, 1012),
  ];
  const a = makeSensor({ dir, replies: [503] }); // serveur injoignable : rien n'est confirmé
  a.sensor.configure({ enabled: true, since: 'week' });
  a.sensor.ingestHistory(history);
  a.sensor.chooseCmdr('Testeur');
  await settle(a.sensor);
  a.sensor.stop();
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, STATE_FILE), 'utf8')).chosenCmdr, 'Testeur');
  const b = makeSensor({ dir, token: null });
  b.sensor.ingestHistory(history);
  await settle(b.sensor);
  assert.deepEqual(b.net.calls.map((c) => c.body.cmdr), ['Testeur']);
  assert.equal(b.sensor.view().needsChoice, false);
  b.sensor.clearToken();
  assert.equal(b.sensor.view().chosenCmdr, null);
});

test('jeton remplacé pendant un envoi accepté : l’acceptation ne fixe pas le commandant du nouveau jeton', async () => {
  let release;
  const calls = [];
  const fetch = (url, options) => {
    calls.push(JSON.parse(options.body).cmdr);
    return new Promise((resolve) => { release = () => resolve({ status: 200 }); });
  };
  const dir = tmp();
  fileStore(dir).writeToken(TOKEN);
  const sensor = new SquadronSensor({ store: fileStore(dir), fetch, now: () => NOW, gapMs: 0, saveDelayMs: 0, setTimer: () => 0, clearTimer: () => {}, url: `${WORKER_URL}/v1/merits` });
  sensor.configure({ enabled: true, since: 'week' });
  sensor.ingestHistory([...start, merit('2026-11-07T10:00:00Z', 100, 1000)]);
  await new Promise((r) => setImmediate(r));
  sensor.setToken(OTHER_TOKEN); // pendant l'envoi
  release();
  await settle(sensor);
  assert.equal(sensor.view().tokenCmdr, null, 'accepté pour l’ancien jeton : rien n’est dit du nouveau');
  assert.deepEqual(calls, ['Testeur']);
});

test('403 gardé au redémarrage ; « Réessayer maintenant » retente une fois (nom corrigé côté escadron)', async () => {
  const dir = tmp();
  const history = [...start, merit('2026-11-07T10:00:00Z', 100, 1000), merit('2026-11-07T11:00:00Z', 200, 1200), merit('2026-11-07T12:00:00Z', 300, 1500)];
  const a = makeSensor({ dir, replies: [403] });
  a.sensor.configure({ enabled: true, since: 'week' });
  a.sensor.ingestHistory(history);
  await settle(a.sensor);
  a.sensor.stop();
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, STATE_FILE), 'utf8')).refusedCmdrs, ['Testeur']);
  const b = makeSensor({ dir, token: null });
  b.sensor.ingestHistory(history);
  await settle(b.sensor);
  assert.equal(b.net.calls.length, 0);
  assert.equal(b.sensor.view().blocked, 3);
  b.sensor.retryNow();
  await settle(b.sensor);
  assert.deepEqual(b.net.calls.map((c) => c.body.merits), [100, 200, 300]);
  assert.equal(b.sensor.view().counts.sent, 3);
});

test('autre commandant : après un envoi accepté, ses gains ne partent plus', async () => {
  const { sensor, net } = makeSensor();
  sensor.configure({ enabled: true, since: 'week' });
  sensor.ingestHistory([...start, merit('2026-11-07T10:00:00Z', 100, 1000)]);
  await settle(sensor);
  assert.equal(sensor.view().tokenCmdr, 'Testeur');
  sensor.live(login('2026-11-07T15:00:00Z', 'Alt'));
  sensor.live(merit('2026-11-07T15:10:00Z', 9, 9));
  await settle(sensor);
  assert.equal(net.calls.length, 1);
  assert.equal(sensor.view().tally.autreCommandant, 1);
});

// --- Rattrapage ---

test('rattrapage au démarrage : les gains restés dans les journaux, sans renvoyer ceux déjà confirmés', async () => {
  const dir = tmp();
  const day1 = [...start, merit('2026-11-06T10:00:00Z', 100, 1000), merit('2026-11-06T11:00:00Z', 50, 1050), merit('2026-11-06T12:00:00Z', 7, 1057)];
  const a = makeSensor({ dir });
  a.sensor.configure({ enabled: true, since: 'week' });
  a.sensor.ingestHistory(day1);
  await settle(a.sensor);
  assert.equal(a.net.calls.length, 3);
  a.sensor.stop();
  // L'app est fermée ; le joueur gagne des mérites ; au redémarrage, les journaux sont relus
  const b = makeSensor({ dir, token: null });
  b.sensor.ingestHistory([...day1, header('2026-11-07T08:13:00Z'), login(), merit('2026-11-07T09:00:00Z', 33, 1090), merit('2026-11-07T09:30:00Z', 12, 1102)]);
  await settle(b.sensor);
  assert.deepEqual(b.net.calls.map((c) => [c.body.at, c.body.merits]), [['2026-11-07T09:00:00Z', 33], ['2026-11-07T09:30:00Z', 12]]);
  assert.equal(b.sensor.view().lastConfirmedAt, '2026-11-07T09:30:00Z');
  assert.equal(b.sensor.view().counts.sent, 5);
});

test('la file survit à un redémarrage, même si les journaux ont disparu', async () => {
  const dir = tmp();
  const a = makeSensor({ dir, replies: [503] });
  a.sensor.configure({ enabled: true, since: 'week' });
  a.sensor.ingestHistory([...start, merit('2026-11-07T10:00:00Z', 100, 1000)]);
  await settle(a.sensor);
  a.sensor.stop();
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, STATE_FILE), 'utf8')).pending.length, 1);
  const b = makeSensor({ dir, token: null });
  b.sensor.ingestHistory([]);
  await settle(b.sensor);
  assert.deepEqual(b.net.calls.map((c) => c.body), [{ cmdr: 'Testeur', system: 'Synuefe OU-E c28-2', merits: 100, at: '2026-11-07T10:00:00Z' }]);
});

test('point de départ : maintenant, semaine Powerplay (jeudi 7 h UTC) ou 30 jours ; jamais plus vieux que le serveur accepte', async () => {
  assert.equal(new Date(weekStart(NOW)).toISOString(), '2026-11-05T07:00:00.000Z'); // samedi → jeudi
  assert.equal(new Date(weekStart(Date.parse('2026-11-05T06:59:00Z'))).toISOString(), '2026-10-29T07:00:00.000Z');
  assert.equal(new Date(weekStart(Date.parse('2026-11-05T07:00:00Z'))).toISOString(), '2026-11-05T07:00:00.000Z');
  assert.equal(sinceFor('now', NOW), NOW);
  assert.ok(NOW - sinceFor('max', NOW) < WORKER_MAX_AGE_MS);
  const history = [
    ...start,
    merit('2026-10-01T10:00:00Z', 1, 1), // plus de 30 jours : refusé par le Worker, jamais envoyé
    merit('2026-10-20T10:00:00Z', 2, 3),
    merit('2026-11-05T08:00:00Z', 3, 6),
    merit('2026-11-07T21:00:00Z', 4, 10),
  ];
  const sent = async (since) => {
    const { sensor, net } = makeSensor();
    sensor.configure({ enabled: true, since });
    sensor.ingestHistory(history);
    sensor.live(merit('2026-11-07T22:00:00Z', 5, 15));
    await settle(sensor);
    return net.calls.map((c) => c.body.merits);
  };
  assert.deepEqual(await sent('now'), [5]);
  assert.deepEqual(await sent('week'), [3, 4, 5]);
  assert.deepEqual(await sent('max'), [2, 3, 4, 5]);
  const { sensor } = makeSensor();
  assert.throws(() => sensor.configure({ since: 'toujours' }), (err) => err.status === 400);
});

test('activer sans choisir : départ au début de la semaine ; désactiver vide la file et coupe l\'envoi', async () => {
  const { sensor, net } = makeSensor({ replies: [503] });
  sensor.ingestHistory([...start, merit('2026-11-01T10:00:00Z', 1, 1), merit('2026-11-06T10:00:00Z', 2, 3)]);
  sensor.configure({ enabled: true });
  assert.equal(sensor.view().since, '2026-11-05T07:00:00Z');
  await settle(sensor);
  assert.equal(net.calls.length, 1);
  sensor.configure({ enabled: false });
  assert.equal(sensor.view().queue, 0);
  assert.equal(sensor.view().waitingRetry, false);
  sensor.live(merit('2026-11-07T21:00:00Z', 3, 6));
  await settle(sensor);
  assert.equal(net.calls.length, 1);
});

test('fichier d\'état abîmé ou modifié à la main : relu sans planter, entrées invalides ignorées', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, STATE_FILE), JSON.stringify({
    enabled: 'oui', since: 'hier', done: [42, 'x|2026-11-07T10:00:00Z|5'], pending: [{ cmdr: 'C', system: 'Sol', merits: -1, at: 'x' }, null],
    counts: { sent: 'beaucoup' }, status: { text: 3 }, __proto__: { enabled: true },
  }));
  const { sensor } = makeSensor({ dir });
  const view = sensor.view();
  assert.equal(view.enabled, false);
  assert.equal(view.since, null);
  assert.equal(view.queue, 0);
  assert.equal(view.counts.sent, 0);
  assert.equal(sensor.done.size, 1);
  fs.writeFileSync(path.join(dir, STATE_FILE), '{ pas du json');
  assert.equal(makeSensor({ dir }).sensor.view().enabled, false);
});

test('aucun envoi réseau pendant les tests : le réseau du module est coupé sous node --test', async () => {
  assert.ok(process.env.NODE_TEST_CONTEXT, 'ce test doit tourner sous node --test');
  await assert.rejects(moduleFetch()('https://exemple.invalid', {}), /interdit pendant les tests/);
  assert.equal(typeof moduleFetch({}), 'function'); // en dehors des tests (jamais appelé ici)
});

// --- Module : journal et routes, avec un faux routeur ---

function fakeRouter() {
  const routes = new Map();
  const add = (method) => (p, handler) => routes.set(`${method} ${p}`, handler);
  const call = (method, p, { body, query = {} } = {}) => new Promise((resolve, reject) => {
    const res = { json: (data) => resolve({ status: 200, data }) };
    routes.get(`${method} ${p}`)({ body, query }, res, (err) => (err ? resolve({ status: err.status || 500, error: err.publicMessage }) : reject(new Error('next sans erreur'))));
  });
  return { router: { get: add('GET'), put: add('PUT'), post: add('POST'), delete: add('DELETE') }, call };
}

test('module : opt-in par l\'API, rattrapage à la lecture des journaux, jeton jamais renvoyé', async () => {
  const dir = tmp();
  const journal = new EventEmitter();
  journal.addInterest = (names) => (journal.interest = names);
  const sent = [];
  const net = fakeNet();
  const { router, call } = fakeRouter();
  const { sensor } = setup({
    router, journal, broadcast: (type, data) => sent.push(type), dataDir: dir, fetch: net.fetch,
    sensorOptions: { gapMs: 0, saveDelayMs: 0, now: () => NOW, url: `${WORKER_URL}/v1/merits` },
  });
  assert.ok(journal.interest.includes('PowerplayMerits') && journal.interest.includes('Statistics'));
  assert.equal((await call('PUT', '/token', { body: { token: 'faux' } })).status, 400);
  const saved = await call('PUT', '/token', { body: { token: TOKEN } });
  assert.ok(!JSON.stringify(saved).includes(TOKEN));
  assert.equal(saved.data.token, `••••••••${TOKEN.slice(-4)}`);
  assert.equal((await call('PUT', '/config', { body: { since: 'jamais' } })).status, 400);
  await call('PUT', '/config', { body: { enabled: true, since: 'week' } });
  journal.emit('ready', { history: [...start, merit('2026-11-07T10:00:00Z', 100, 1000), { event: 'Music', timestamp: '2026-11-07T10:00:01Z' }] });
  await settle(sensor);
  journal.emit('event', merit('2026-11-07T21:00:00Z', 20, 1020));
  await settle(sensor);
  assert.deepEqual(net.calls.map((c) => c.body.merits), [100, 20]);
  const status = await call('GET', '/status');
  assert.equal(status.data.counts.sent, 2);
  assert.ok(!JSON.stringify(status).includes(TOKEN));
  assert.equal((await call('DELETE', '/token')).data.hasToken, false);
  assert.ok(sent.includes('escadron:stats'));
  sensor.stop();
});

test('module : commandant du jeton choisi par l’API, seulement parmi ceux des journaux', async () => {
  const journal = new EventEmitter();
  journal.addInterest = () => {};
  const net = fakeNet();
  const { router, call } = fakeRouter();
  const { sensor } = setup({ router, journal, broadcast: () => {}, dataDir: tmp(), fetch: net.fetch, sensorOptions: { gapMs: 0, saveDelayMs: 0, now: () => NOW, url: `${WORKER_URL}/v1/merits` } });
  await call('PUT', '/config', { body: { enabled: true, since: 'week' } });
  journal.emit('ready', { history: [
    header(), login('2026-11-06T20:00:00Z', 'Autre Joueur'), merit('2026-11-06T20:30:00Z', 30, 30),
    header('2026-11-07T08:00:00Z'), login('2026-11-07T08:01:00Z', 'Testeur'), merit('2026-11-07T09:00:00Z', 12, 1012),
  ] });
  assert.equal((await call('PUT', '/token', { body: { token: TOKEN, cmdr: 'Inconnu' } })).status, 400);
  assert.equal((await call('PUT', '/token', { body: { token: TOKEN } })).data.needsChoice, true);
  await settle(sensor);
  assert.equal(net.calls.length, 0);
  for (const body of [{}, { cmdr: 'Inconnu' }, { cmdr: 42 }, { cmdr: { toString: () => 'Testeur' } }]) {
    assert.equal((await call('PUT', '/cmdr', { body })).status, 400, JSON.stringify(body));
  }
  const chosen = await call('PUT', '/cmdr', { body: { cmdr: 'Testeur' } });
  assert.equal(chosen.data.chosenCmdr, 'Testeur');
  await settle(sensor);
  assert.deepEqual(net.calls.map((c) => c.body.cmdr), ['Testeur']);
  sensor.stop();
});

// --- Mon apport à l'escadron (Statistics) ---

const squadron = (over = {}) => ({
  Squadron_Bank_Credits_Deposited: 0,
  Squadron_Leaderboard_aegis_highestcontribution: 613288,
  Squadron_Leaderboard_bounty_highestcontribution: 143825544,
  Squadron_Leaderboard_combat_highestcontribution: 15789,
  Squadron_Leaderboard_mining_highestcontribution: 3091172155,
  Squadron_Leaderboard_powerplay_highestcontribution: 1248766,
  Squadron_Leaderboard_podiums: 0,
  ...over,
});
const statsEvent = (timestamp, over) => ({ event: 'Statistics', timestamp, Squadron: squadron(over) });

function journalStats() {
  const s = new SquadronStats();
  const events = [
    { event: 'JoinedSquadron', timestamp: '2026-10-24T13:08:07Z', SquadronID: 4242, SquadronName: 'ESCADRON TEST' },
    statsEvent('2026-10-24T14:50:57Z', { Squadron_Leaderboard_powerplay_highestcontribution: 0, Squadron_Leaderboard_mining_highestcontribution: 0 }),
    statsEvent('2026-11-04T18:52:44Z', { Squadron_Leaderboard_powerplay_highestcontribution: 1171400, Squadron_Leaderboard_mining_highestcontribution: 2935144440 }),
    // Séance du 4 nov. au soir (semaine précédente) : 6 096 mérites, visibles seulement au relevé du 5 nov.
    { event: 'Powerplay', timestamp: '2026-11-04T18:53:00Z', Merits: 1171400 },
    merit('2026-11-04T20:11:58Z', 6096, 1177496),
    statsEvent('2026-11-05T12:16:00Z', { Squadron_Leaderboard_powerplay_highestcontribution: 1177496, Squadron_Leaderboard_mining_highestcontribution: 2935144440 }),
    statsEvent('2026-11-07T08:14:19Z'),
    { event: 'SquadronStartup', timestamp: '2026-11-07T08:15:52Z', SquadronName: 'ESCADRON TEST', CurrentRankName: 'PILOTE' },
    statsEvent('2026-11-07T08:16:05Z'), // deux connexions à 2 min d'écart : mêmes valeurs
    { event: 'LoadGame', timestamp: '2026-11-07T08:16:00Z' },
    { event: 'Powerplay', timestamp: '2026-11-07T08:16:10Z', Merits: 1248766 },
    // Entre les deux relevés : 49 266 mérites écrits, 47 251 réellement crédités (une ligne en double à 2 015)
    merit('2026-11-07T10:00:00Z', 45236, 1294002),
    merit('2026-11-07T10:00:05Z', 2015, 1294002),
    merit('2026-11-07T13:50:22Z', 2015, 1296017),
    statsEvent('2026-11-07T21:15:22Z', { Squadron_Leaderboard_powerplay_highestcontribution: 1296017, Squadron_Leaderboard_mining_highestcontribution: 3202321549, Squadron_Leaderboard_new_thing_highestcontribution: 5 }),
  ];
  for (const ev of events) s.apply(ev);
  return s;
}

test('Mon apport : écart entre deux Statistics pour chaque classement, recoupé avec les mérites du journal', () => {
  const view = journalStats().compare(undefined, undefined, weekStart);
  assert.equal(view.from, '2026-11-07T08:16:05Z'); // la série d'avant, au plus près de la séance
  assert.equal(view.to, '2026-11-07T21:15:22Z');
  assert.deepEqual(view.squadron, { name: 'ESCADRON TEST', rank: 'PILOTE', at: '2026-11-07T08:15:52Z' });
  const row = (id) => view.rows.find((r) => r.id === id);
  assert.equal(row('powerplay').delta, 47251);
  assert.equal(row('powerplay').unit, 'mérites');
  assert.equal(row('powerplay').status, 'mesurée');
  assert.deepEqual(row('powerplay').journal, { real: 47251, listed: 49266, doubled: 2015, lines: 3 });
  assert.equal(row('mining').delta, 111149394);
  assert.equal(row('bounty').delta, 0);
  assert.equal(row('new_thing').status, 'inconnue'); // classement ajouté par une mise à jour du jeu : affiché quand même
  assert.equal(row('Credits_Deposited'), undefined); // banque vide : rien à montrer
  assert.deepEqual(view.rows.slice(0, 2).map((r) => r.id), ['powerplay', 'mining']);
});

test('Mon apport : semaine Powerplay, depuis l\'arrivée, et choix libre des deux relevés', () => {
  const s = journalStats();
  // Semaine : le premier relevé après le passage (jeudi 5 nov. 7 h UTC), pas le dernier d'avant. Celui du 4 nov. à
  // 18:52 précède la séance du soir même, qui compterait à tort dans la semaine (+6 096, vrais journaux de référence).
  assert.deepEqual(s.presets(weekStart), { last: '2026-11-07T08:16:05Z', week: '2026-11-05T12:16:00Z', all: '2026-10-24T14:50:57Z' });
  const week = s.compare(s.presets(weekStart).week, undefined, weekStart);
  assert.equal(week.rows.find((r) => r.id === 'powerplay').delta, 118521); // 1 296 017 − 1 177 496
  assert.equal(week.rows.find((r) => r.id === 'powerplay').journal.real, 47251); // le 4 nov. n'y est pas
  assert.deepEqual(week.week, { start: '2026-11-05T07:00:00Z', spill: null });
  assert.deepEqual(s.compare(undefined, undefined, weekStart).snapshots, ['2026-10-24T14:50:57Z', '2026-11-04T18:52:44Z', '2026-11-05T12:16:00Z', '2026-11-07T08:16:05Z', '2026-11-07T21:15:22Z']);
  const all = s.compare('2026-10-24T14:50:57Z', undefined, weekStart);
  assert.equal(all.rows.find((r) => r.id === 'powerplay').delta, 1296017);
  // Relevés donnés à l'envers : remis dans l'ordre
  const swapped = s.compare('2026-11-07T21:15:22Z', '2026-11-04T18:52:44Z', weekStart);
  assert.equal(swapped.from, '2026-11-04T18:52:44Z');
  assert.equal(swapped.rows.find((r) => r.id === 'powerplay').delta, 1296017 - 1171400);
  // Même valeurs avant et après le passage de semaine : le relevé proposé est le dernier de la série
  const spans = new SquadronStats();
  for (const ev of [statsEvent('2026-11-04T20:00:00Z'), statsEvent('2026-11-05T09:00:00Z'), statsEvent('2026-11-06T09:00:00Z', { Squadron_Leaderboard_powerplay_highestcontribution: 1248800 })]) spans.apply(ev);
  assert.equal(spans.presets(weekStart).week, '2026-11-05T09:00:00Z');
  assert.ok(spans.compare(undefined, undefined, weekStart).snapshots.includes(spans.presets(weekStart).week));
  // Séance à cheval sur le passage : les mérites gagnés après jeudi 7 h sont déjà dans le relevé de départ, signalés
  const straddle = new SquadronStats();
  for (const ev of [
    statsEvent('2026-11-04T20:00:00Z', { Squadron_Leaderboard_powerplay_highestcontribution: 1000 }),
    { event: 'Powerplay', timestamp: '2026-11-05T06:00:00Z', Merits: 1000 },
    merit('2026-11-05T06:30:00Z', 40, 1040), // semaine précédente
    merit('2026-11-05T07:30:00Z', 60, 1100), // nouvelle semaine, même séance
    statsEvent('2026-11-05T12:00:00Z', { Squadron_Leaderboard_powerplay_highestcontribution: 1100 }),
    merit('2026-11-06T10:00:00Z', 25, 1125),
    statsEvent('2026-11-06T12:00:00Z', { Squadron_Leaderboard_powerplay_highestcontribution: 1125 }),
  ]) straddle.apply(ev);
  const sw = straddle.compare(straddle.presets(weekStart).week, undefined, weekStart);
  assert.equal(sw.from, '2026-11-05T12:00:00Z');
  assert.equal(sw.rows.find((r) => r.id === 'powerplay').delta, 25);
  assert.deepEqual(sw.week, { start: '2026-11-05T07:00:00Z', spill: { merits: 60, lines: 1 } });
  // Aucun Statistics encore : vue vide, sans erreur
  assert.deepEqual(new SquadronStats().compare(undefined, undefined, weekStart).rows, []);
});

test('Statistics : clés du jeu rangées dans une Map, sans toucher aux objets de l\'app', () => {
  const values = readSquadron(JSON.parse('{"__proto__": 7, "constructor": 3, "Squadron_Leaderboard_mining_highestcontribution": 12, "texte": "x"}'));
  assert.equal(values.get('__proto__'), 7);
  assert.equal(values.size, 3);
  assert.equal({}.polluted, undefined);
  assert.equal(readSquadron(null).size, 0);
  assert.equal(readSquadron([1, 2]).size, 0);
  assert.equal(describeKey('Squadron_Leaderboard_mining_highestcontribution').label, 'Minage');
  assert.equal(describeKey('Squadron_Bank_Ships_Deposited_Num').label, 'Vaisseaux déposés');
  assert.equal(describeKey('toString').group, 'autre');
});

test('règles : chaque valeur a un statut, une source et une date', () => {
  for (const [name, r] of Object.entries(RULES)) {
    assert.ok(['mesurée', 'publiée', 'à vérifier'].includes(r.status), name);
    assert.ok(typeof r.source === 'string' && r.source.length > 10, name);
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, name);
  }
  assert.equal(payloadKey({ cmdr: 'TesTeur', at: '2026-11-07T10:00:00Z', merits: 5 }), 'testeur|2026-11-07T10:00:00Z|5');
});

// --- Inscription avec le mot de passe du chef (POST /v1/join du Worker) ---

/** Faux réseau de l'inscription : une seule réponse, avec un corps JSON. */
function joinNet(status, body = {}) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    if (status instanceof Error) throw status;
    return { status, json: async () => body };
  };
  return { calls, fetch };
}

test('rejoindre : le mot de passe part une fois vers /v1/join du serveur réglé, le jeton reçu est enregistré', async () => {
  const { sensor, store, dir } = makeSensor({ token: null });
  sensor.ingestHistory([...start]);
  sensor.setWorker('https://mon-escadron.workers.dev');
  const net = joinNet(200, { cmdr: 'Testeur', token: OTHER_TOKEN });
  sensor.fetch = net.fetch;
  await sensor.join('mot de passe du chef');
  assert.equal(net.calls.length, 1);
  assert.equal(net.calls[0].url, 'https://mon-escadron.workers.dev/v1/join');
  assert.deepEqual(net.calls[0].body, { cmdr: 'Testeur', password: 'mot de passe du chef' });
  assert.equal(net.calls[0].options.redirect, 'manual');
  assert.equal(store.readToken(), OTHER_TOKEN);
  const view = sensor.view();
  assert.equal(view.hasToken, true);
  assert.equal(view.enabled, false); // s'inscrire n'active pas l'envoi : ça reste le choix du joueur
  assert.equal(view.chosenCmdr, 'Testeur');
  // Le mot de passe n'est écrit nulle part
  sensor.save?.();
  const disque = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join(' ');
  assert.doesNotMatch(JSON.stringify(view) + disque, /mot de passe du chef/);
});

test('rejoindre : refus du serveur expliqués, rien d\'enregistré', async () => {
  for (const [status, mot] of [[401, 'Code de l’escadron refusé'], [404, 'inscription'], [403, 'fermé les inscriptions'], [409, 'ancienne version'], [429, 'Trop d’essais'], [500, 'indisponible']]) {
    const { sensor, store } = makeSensor({ token: null });
    sensor.setWorker('https://mon-escadron.workers.dev');
    sensor.ingestHistory([...start]);
    sensor.fetch = joinNet(status).fetch;
    await assert.rejects(sensor.join('x'), (e) => e.publicMessage.includes(mot) && e.status >= 400);
    assert.equal(store.readToken(), null);
  }
  const { sensor } = makeSensor({ token: null });
  sensor.setWorker('https://mon-escadron.workers.dev');
  sensor.ingestHistory([...start]);
  sensor.fetch = joinNet(new Error('hors ligne')).fetch;
  await assert.rejects(sensor.join('x'), (e) => e.status === 502);
  sensor.fetch = joinNet(200, { token: 'court' }).fetch;
  await assert.rejects(sensor.join('x'), (e) => e.status === 502);
});

test('rejoindre : sans mot de passe ou sans commandant connu, rien ne part ; plusieurs commandants, il faut choisir', async () => {
  const { sensor } = makeSensor({ token: null });
  sensor.setWorker('https://mon-escadron.workers.dev');
  const net = joinNet(200, { token: OTHER_TOKEN });
  sensor.fetch = net.fetch;
  await assert.rejects(sensor.join(''), (e) => e.status === 400);
  await assert.rejects(sensor.join('x'), (e) => /lance le jeu/.test(e.publicMessage));
  sensor.ingestHistory([...start, merit('2026-11-07T08:50:00Z', 100, 1000), login('2026-11-07T09:00:00Z', 'Second'), merit('2026-11-07T09:10:00Z', 50, 50)]);
  await assert.rejects(sensor.join('x'), (e) => /choisis/.test(e.publicMessage));
  await assert.rejects(sensor.join('x', 'Inconnu'), (e) => e.status === 400);
  assert.equal(net.calls.length, 0);
  await sensor.join('x', 'second');
  assert.equal(net.calls[0].body.cmdr, 'Second');
  assert.equal(sensor.view().chosenCmdr, 'Second');
});

test('rejoindre avec le code de l\'escadron : le serveur du code est réglé, puis le mot de passe part vers lui seul', async () => {
  const { codeEscadron } = await import('./code.js');
  const { sensor, store } = makeSensor({ token: null });
  sensor.ingestHistory([...start]);
  const net = joinNet(200, { cmdr: 'Testeur', token: OTHER_TOKEN });
  sensor.fetch = net.fetch;
  await sensor.join(codeEscadron('https://escadron-chef.workers.dev', 'mot de passe du chef'));
  assert.equal(net.calls[0].url, 'https://escadron-chef.workers.dev/v1/join');
  assert.deepEqual(net.calls[0].body, { cmdr: 'Testeur', password: 'mot de passe du chef' });
  assert.equal(sensor.view().worker, 'https://escadron-chef.workers.dev');
  assert.equal(store.readToken(), OTHER_TOKEN);
  // Mot de passe seul : le serveur déjà réglé
  await sensor.join('autre mot de passe');
  assert.equal(net.calls[1].url, 'https://escadron-chef.workers.dev/v1/join');
  // Code illisible ou serveur interdit : rien ne part
  await assert.rejects(sensor.join('ESC1.%%%'), (e) => e.status === 400 && /illisible/.test(e.publicMessage));
  await assert.rejects(sensor.join(codeEscadron('https://192.168.1.10', 'x')), (e) => e.status === 400);
  assert.equal(net.calls.length, 2);
});

test('rejoindre : code de gestion refusé, mot de passe seul refusé sans serveur choisi, rien ne part', async () => {
  const { codeGestion } = await import('./code.js');
  const { sensor } = makeSensor({ token: null });
  sensor.defaultUrl = null; // app neuve : aucun serveur réglé (il n'y en a pas par défaut)
  sensor.useWorker(null);
  sensor.ingestHistory([...start]);
  const net = joinNet(200, { token: OTHER_TOKEN });
  sensor.fetch = net.fetch;
  await assert.rejects(sensor.join(codeGestion({ url: 'https://a.workers.dev', adminToken: 'a'.repeat(43) })), (e) => /code de gestion/.test(e.publicMessage));
  await assert.rejects(sensor.join('mot de passe seul'), (e) => /code complet/.test(e.publicMessage));
  assert.equal(net.calls.length, 0);
});

test('rejoindre un autre serveur quand on est déjà inscrit : confirmation de l\'hôte, et échec sans rien perdre', async () => {
  const { codeEscadron } = await import('./code.js');
  const hosts = [];
  const { sensor, store } = makeSensor({ token: null, allowHost: (h) => hosts.push(h) });
  sensor.setWorker('https://ancien.workers.dev');
  sensor.ingestHistory([...start]);
  sensor.fetch = joinNet(200, { token: TOKEN }).fetch;
  await sensor.join('mot de passe');
  assert.equal(store.readToken(), TOKEN);
  const code = codeEscadron('https://piege.workers.dev', 'x'.repeat(10));
  assert.deepEqual((({ hote, change, confirmer }) => ({ hote, change, confirmer }))(sensor.apercuCode(code)), { hote: 'piege.workers.dev', change: true, confirmer: true });
  const net = joinNet(401);
  sensor.fetch = net.fetch;
  await assert.rejects(sensor.join(code), (e) => e.status === 409 && /piege\.workers\.dev/.test(e.publicMessage));
  assert.equal(net.calls.length, 0, 'rien ne part sans confirmation');
  // Confirmé, mais refusé (401) : l'ancien serveur et l'ancien jeton restent
  await assert.rejects(sensor.join(code, undefined, { confirmerServeur: 'piege.workers.dev' }), (e) => e.status === 400);
  assert.equal(net.calls[0].url, 'https://piege.workers.dev/v1/join');
  assert.equal(store.readToken(), TOKEN);
  assert.equal(sensor.view().worker, 'https://ancien.workers.dev');
  assert.equal(hosts.at(-1), 'ancien.workers.dev', 'la liste blanche revient à l’ancien serveur');
  // Confirmé et accepté : serveur et jeton changent ensemble
  sensor.fetch = joinNet(200, { token: OTHER_TOKEN }).fetch;
  await sensor.join(code, undefined, { confirmerServeur: 'piege.workers.dev' });
  assert.equal(sensor.view().worker, 'https://piege.workers.dev');
  assert.equal(store.readToken(), OTHER_TOKEN);
});

test('app neuve, publique : aucun serveur par défaut, rien ne part tant que l’escadron n’a pas réglé le sien', async () => {
  const net = fakeNet();
  const dir = tmp();
  const sensor = new SquadronSensor({ store: fileStore(dir), fetch: net.fetch, now: () => NOW, gapMs: 0, saveDelayMs: 0, setTimer: () => 0, clearTimer: () => {} });
  sensor.load();
  const v = sensor.view();
  assert.equal(v.destination, null);
  assert.equal(v.worker, null);
  assert.equal(JSON.stringify(v).includes('workers.dev'), false, 'aucune adresse de serveur dans l’état d’une app neuve');
  // Un jeton sans serveur est refusé : il ne vaut que pour le serveur qui l'a donné
  assert.throws(() => sensor.setToken(TOKEN), (e) => e.status === 409 && /serveur de ton escadron/.test(e.publicMessage));
  sensor.configure({ enabled: true, since: 'week' });
  sensor.ingestHistory([...start, merit('2026-11-07T13:50:22Z', 1773, 1296017)]);
  await sensor.run();
  assert.equal(net.calls.length, 0);
  // Une fois le serveur de l'escadron réglé et le jeton posé, les gains partent chez lui, et nulle part ailleurs
  sensor.setWorker('https://autre-escadron.workers.dev');
  sensor.setToken(TOKEN);
  await sensor.run();
  assert.ok(net.calls.length >= 1);
  assert.ok(net.calls.every((c) => c.url === 'https://autre-escadron.workers.dev/v1/merits'));
  sensor.stop?.();
});
