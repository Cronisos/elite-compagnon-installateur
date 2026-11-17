// Tests de la Garde des commandes, sur une copie des vrais fichiers du joueur (7 nov. 2026) :
//   fixtures/BindingLoadingErrors.2026-11-07.txt : copie exacte de BindingLoadingErrors.log (« Missing devices:
//     SaitekX52 », écrit à 22:13:47,829), en .txt car le dépôt ignore les *.log ;
//   fixtures/StartPreset.4.start      : copie exacte (« Custom / Custom / Custom / SaitekX52 ») ;
//   fixtures/Custom.4.2.binds         : extrait du vrai profil (début, et le second <MouseGUI> du rapport).
// Chaque test les recopie dans un dossier temporaire du système, avec les dates du jeu ; rien d'autre n'est lu.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeText, devicesInBinds, frenchList, parseErrorLog, parseStartPreset, presetNameOf } from './parse.js';
import { BindingsGuard, LaunchTracker, concernsLaunch, lastWriteMs } from './guard.js';
import { createBindingsModule, defaultBindingsDir, journalSignOfLife } from './index.js';
import { GAME_SILENT_MS } from './rules.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name));
const REAL_LOG = 'BindingLoadingErrors.2026-11-07.txt'; // recopié sous son vrai nom dans le dossier temporaire

// Journal du 7 nov. 2026 (Journal.2026-11-07T221347.01.log) : lancement, chargement
const FILEHEADER = { timestamp: '2026-11-07T21:13:43Z', event: 'Fileheader', part: 1, language: 'French/FR', Odyssey: true, gameversion: '4.4.2.1' };
const LOADGAME = { timestamp: '2026-11-07T21:15:18Z', event: 'LoadGame', Commander: 'Testeur', Ship: 'LakonMiner' };
// Lancement précédent de la soirée (Journal.2026-11-07T213632.01.log), fermé 20 s après
const EARLIER = [
  { timestamp: '2026-11-07T20:36:28Z', event: 'Fileheader', part: 1 },
  { timestamp: '2026-11-07T20:36:48Z', event: 'Shutdown' },
];
const LOG_WRITTEN = new Date('2026-11-07T21:13:47.829Z'); // date du vrai rapport (22:13:47,829 à Paris)
const PROFILE_WRITTEN = new Date('2026-11-06T09:31:28.132Z');
// Horloge des tests : 42 s après le LoadGame, le jeu tourne
const NOW = Date.parse('2026-11-07T21:16:00Z');
// Fin réelle de ce lancement : pas de Shutdown ; dernier événement à 21:21:42, journal daté de 21:21:41,652
const JOURNAL_LAST_WRITE = Date.parse('2026-11-07T21:21:41.652Z');
const STATUS_LAST_WRITE = Date.parse('2026-11-07T21:15:29.276Z'); // Status.json, même soirée

const REAL_MESSAGE = 'Profil de commandes ignoré : manette SaitekX52 absente. Ne réassigne rien : rebranche-la et relance le jeu.';

const roots = [];
after(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

/** Dossier des commandes du jeu reconstitué dans un dossier temporaire, comme chez le joueur le 7 nov. 2026. */
function gameDir({ log = fixture(REAL_LOG), backup = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-commandes-'));
  roots.push(root);
  const dir = path.join(root, 'Bindings');
  fs.mkdirSync(dir);
  const put = (name, content, when) => {
    fs.writeFileSync(path.join(dir, name), content);
    fs.utimesSync(path.join(dir, name), when, when);
  };
  put('Custom.4.2.binds', fixture('Custom.4.2.binds'), PROFILE_WRITTEN);
  put('StartPreset.4.start', fixture('StartPreset.4.start'), PROFILE_WRITTEN);
  if (backup) put('Custom.4.2.binds.1451070215.backup', fixture('Custom.4.2.binds'), LOG_WRITTEN);
  if (log != null) put('BindingLoadingErrors.log', log, LOG_WRITTEN);
  return { root, dir, dataFile: path.join(root, 'data', 'bindings-guard.json') };
}

/** Empreinte complète du dossier du jeu : noms, contenus et dates. Sert à vérifier qu'il n'est jamais modifié. */
function snapshot(dir) {
  return fs.readdirSync(dir).sort().map((name) => {
    const file = path.join(dir, name);
    const st = fs.statSync(file);
    return `${name}:${st.mtimeMs}:${st.size}:${crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex')}`;
  });
}

function fakeOverlay() {
  const calls = [];
  return { calls, setExtra: (page, on) => calls.push([page, on]), get open() { return calls.at(-1)?.[1] ?? false; } };
}

function guardFor(env, extra = {}) {
  const overlay = fakeOverlay();
  const sent = [];
  const guard = new BindingsGuard({ dir: env.dir, dataFile: env.dataFile, overlay, broadcast: (type, data) => sent.push([type, data]), now: () => NOW, ...extra });
  return { guard, overlay, sent };
}

// --- Lecture des fichiers ---

test('rapport réel du 7 nov. 2026 : profil cité, manette manquante, doublon sans gravité', () => {
  const log = parseErrorLog(decodeText(fixture(REAL_LOG)));
  assert.deepEqual(log.presetFiles, ['Custom.4.2.binds']);
  assert.deepEqual(log.missingDevices, ['SaitekX52']);
  assert.deepEqual(log.duplicates, ['MouseGUI']); // écrit deux fois par le jeu, compté une fois
  assert.deepEqual(log.other, []);
  assert.deepEqual(log.entries.map((e) => e.kind), ['preset-errors', 'duplicate', 'duplicate', 'missing-devices']);
  assert.equal(log.lines.length, 4);
});

test('plusieurs manettes manquantes, et identifiants qui ressemblent à des propriétés d\'objet', () => {
  assert.deepEqual(parseErrorLog('Missing devices: SaitekX52, ThrustMasterWarthogThrottle').missingDevices, ['SaitekX52', 'ThrustMasterWarthogThrottle']);
  assert.deepEqual(parseErrorLog('Missing devices: constructor __proto__').missingDevices, ['constructor', '__proto__']);
  assert.deepEqual(devicesInBinds('<a Device="constructor" /><b Device="__proto__" /><c Device="constructor" />'), [
    { id: 'constructor', count: 2 }, { id: '__proto__', count: 1 },
  ]);
});

test('rapport en UTF-16 avec BOM : lu comme le texte', () => {
  const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Missing devices: SaitekX52\r\n', 'utf16le')]);
  assert.deepEqual(parseErrorLog(decodeText(buf)).missingDevices, ['SaitekX52']);
});

test('profils choisis au démarrage (StartPreset.4.start) et manettes d\'un profil', () => {
  assert.deepEqual(parseStartPreset(decodeText(fixture('StartPreset.4.start'))), [
    { label: 'Commandes générales', preset: 'Custom' },
    { label: 'Vaisseau', preset: 'Custom' },
    { label: 'SRV', preset: 'Custom' },
    { label: 'À pied', preset: 'SaitekX52' },
  ]);
  const xml = decodeText(fixture('Custom.4.2.binds'));
  assert.equal(presetNameOf(xml, 'Custom.4.2.binds'), 'Custom');
  assert.deepEqual(devicesInBinds(xml), [{ id: 'SaitekX52', count: 6 }]); // clavier, souris et {NoDevice} exclus
  assert.equal(frenchList(['A', 'B', 'C']), 'A, B et C');
});

// --- Date du rapport par rapport au lancement du jeu ---

test('lancement : Fileheader en partie 1 seulement ; le rapport écrit 4 s après compte pour ce lancement', () => {
  const t = new LaunchTracker();
  for (const ev of [...EARLIER, FILEHEADER, LOADGAME]) t.apply(ev);
  assert.equal(t.apply({ timestamp: '2026-11-07T23:00:00Z', event: 'Fileheader', part: 2 }), false);
  assert.equal(t.current().at, Date.parse(FILEHEADER.timestamp));
  assert.equal(concernsLaunch(LOG_WRITTEN.getTime(), t), 'current');
  // Écrit pendant le lancement de 21:36 (fermé à 21:36:48) : lancement précédent, même s'il est récent
  assert.equal(concernsLaunch(Date.parse('2026-11-07T20:36:32Z'), t), 'previous');
  assert.equal(concernsLaunch(LOG_WRITTEN.getTime(), new LaunchTracker()), 'unknown');
});

// --- Garde complète, sur le dossier reconstitué ---

test('cas réel : manette SaitekX52 absente au lancement en cours → bandeau et fenêtre en jeu', () => {
  const env = gameDir();
  const { guard, overlay, sent } = guardFor(env);
  const s = guard.setHistory([...EARLIER, FILEHEADER, LOADGAME]);
  assert.equal(s.level, 'alert');
  assert.equal(s.log.concerns, 'current');
  assert.equal(s.alert.kind, 'missing-devices');
  assert.equal(s.alert.message, REAL_MESSAGE);
  assert.equal(s.alert.backup, 'Custom.4.2.binds.1451070215.backup');
  assert.match(s.alert.backupsHint, /Custom\.4\.2\.binds\.1451070215\.backup/);
  assert.equal(s.banner, true);
  assert.equal(s.overlay, true);
  assert.deepEqual(overlay.calls.at(-1), ['bindings', true]);
  assert.equal(sent.at(-1)[0], 'bindings:update');
  // Sauvegarde identique au profil ; le profil utilise la manette manquante
  assert.equal(s.backups[0].sameAsProfile, true);
  assert.deepEqual(s.profiles[0].devices, [{ id: 'SaitekX52', count: 6, missing: true }]);
  assert.deepEqual(s.startPresets.categories.map((c) => c.builtin), [false, false, false, true]);
});

test('jeu fermé depuis : plus de fenêtre en jeu, le bandeau dit « au dernier lancement »', () => {
  const env = gameDir();
  const { guard, overlay } = guardFor(env);
  guard.setHistory([FILEHEADER, LOADGAME]);
  const s = guard.event({ timestamp: '2026-11-07T22:21:41Z', event: 'Shutdown' });
  assert.equal(s.game.running, false);
  assert.equal(s.overlay, false);
  assert.equal(overlay.open, false);
  assert.equal(s.banner, true);
  assert.match(s.alert.message, /^Au dernier lancement du jeu, profil de commandes ignoré : manette SaitekX52 absente\. Rebranche-la/);
});

test('journal sans Shutdown, plus écrit depuis longtemps (état réel du 7 nov.) : bandeau, mais pas de fenêtre en jeu', () => {
  const env = gameDir();
  // L'app démarre à 23:17 (heure de Paris), jeu fermé sans Shutdown une heure plus tôt
  const { guard, overlay } = guardFor(env, { now: () => Date.parse('2026-11-07T22:17:00Z'), lastSignOfLife: () => JOURNAL_LAST_WRITE });
  const s = guard.setHistory([...EARLIER, FILEHEADER, LOADGAME]);
  assert.equal(s.log.concerns, 'current'); // le rapport est bien celui du dernier lancement
  assert.deepEqual(s.game, { launchedAt: '2026-11-07T21:13:43.000Z', running: false, endedAt: '2026-11-07T21:21:41.652Z', ended: 'silence' });
  assert.equal(s.banner, true);
  assert.equal(s.overlay, false);
  assert.deepEqual(overlay.calls, [['bindings', false]]); // jamais ouverte, même un instant
  assert.match(s.alert.message, /^Au dernier lancement du jeu, profil de commandes ignoré : manette SaitekX52 absente./);
});

test("jeu planté pendant que l'app tourne : fenêtre fermée après le silence, rouverte au signe de vie suivant", () => {
  const env = gameDir();
  let now = NOW;
  let sign = null;
  const { guard, overlay, sent } = guardFor(env, { now: () => now, lastSignOfLife: () => sign });
  assert.equal(guard.setHistory([FILEHEADER, LOADGAME]).overlay, true);
  const loaded = Date.parse(LOADGAME.timestamp);

  now = loaded + GAME_SILENT_MS; // tout juste dans le délai : rien ne change
  guard.poll();
  assert.equal(overlay.open, true);

  now = loaded + GAME_SILENT_MS + 1000;
  const updates = sent.length;
  guard.poll();
  assert.equal(overlay.open, false);
  assert.equal(guard.status.game.ended, 'silence');
  assert.equal(guard.status.game.endedAt, LOADGAME.timestamp.replace('Z', '.000Z'));
  assert.equal(guard.status.banner, true);
  assert.equal(sent.length, updates + 1); // l'interface est prévenue

  sign = now; // le journal est réécrit : le jeu tournait encore
  guard.poll();
  assert.equal(overlay.open, true);
  assert.equal(guard.status.game.running, true);
  guard.poll(); // rien de neuf : pas de nouvel envoi
  assert.equal(sent.length, updates + 2);
});

test('signe de vie du jeu : journal actif, Status.json ou dernier événement lu, le plus récent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-journal-'));
  roots.push(root);
  const file = path.join(root, 'Journal.2026-11-07T221347.01.log');
  fs.writeFileSync(file, '');
  fs.utimesSync(file, new Date(JOURNAL_LAST_WRITE), new Date(JOURNAL_LAST_WRITE));
  fs.writeFileSync(path.join(root, 'Status.json'), '{}');
  fs.utimesSync(path.join(root, 'Status.json'), new Date(STATUS_LAST_WRITE), new Date(STATUS_LAST_WRITE));

  assert.equal(journalSignOfLife({ file, dir: root, lastEventAt: null }), JOURNAL_LAST_WRITE);
  const later = new Date(JOURNAL_LAST_WRITE + 5000);
  assert.equal(journalSignOfLife({ file, dir: root, lastEventAt: later }), later.getTime());
  assert.equal(journalSignOfLife({ file: null, dir: path.join(root, 'absent'), lastEventAt: null }), null);
  assert.equal(lastWriteMs([null, path.join(root, 'Status.json'), path.join(root, 'absent.json')]), STATUS_LAST_WRITE);
});

test('nouveau lancement sans nouveau rapport : l\'erreur appartient au lancement précédent, plus d\'alerte', () => {
  const env = gameDir();
  const { guard, overlay } = guardFor(env);
  guard.setHistory([FILEHEADER, LOADGAME]);
  assert.equal(overlay.open, true);
  guard.event({ timestamp: '2026-11-07T22:21:41Z', event: 'Shutdown' });
  const s = guard.event({ timestamp: '2026-11-08T10:00:00Z', event: 'Fileheader', part: 1 });
  assert.equal(s.log.concerns, 'previous');
  assert.equal(s.level, 'ok');
  assert.equal(s.alert, null);
  assert.equal(s.profiles[0].devices[0].missing, false); // l'ancien rapport ne dit rien de ce lancement
  assert.equal(s.banner, false);
  assert.equal(overlay.open, false);
});

test('le jeu réécrit le rapport : vu au sondage suivant', () => {
  const env = gameDir({ log: null });
  const { guard, overlay } = guardFor(env);
  assert.equal(guard.setHistory([FILEHEADER]).level, 'ok');
  fs.writeFileSync(path.join(env.dir, 'BindingLoadingErrors.log'), fixture(REAL_LOG));
  fs.utimesSync(path.join(env.dir, 'BindingLoadingErrors.log'), LOG_WRITTEN, LOG_WRITTEN);
  guard.poll();
  assert.equal(guard.status.level, 'alert');
  assert.equal(overlay.open, true);
});

test('fermer la fenêtre en jeu : gardé après un redémarrage de l\'app ; un nouveau rapport la rouvre', () => {
  const env = gameDir();
  const first = guardFor(env);
  const s0 = first.guard.setHistory([FILEHEADER, LOADGAME]);
  assert.equal(first.guard.dismiss('overlay', 'ffffffffffff').overlay, true); // une autre alerte : rien n'est fermé
  const s1 = first.guard.dismiss('overlay', s0.alert.id);
  assert.equal(s1.overlay, false);
  assert.equal(s1.banner, true); // le bandeau de l'app se ferme à part
  assert.equal(first.overlay.open, false);
  assert.equal(first.guard.dismiss('ailleurs'), null);

  const saved = JSON.parse(fs.readFileSync(env.dataFile, 'utf8'));
  assert.deepEqual(saved.dismissed.overlay, [s0.alert.id]);
  assert.deepEqual(fs.readdirSync(path.dirname(env.dataFile)), ['bindings-guard.json']); // pas de fichier temporaire oublié

  const again = guardFor(env);
  assert.equal(again.guard.setHistory([FILEHEADER, LOADGAME]).overlay, false);

  // Lancement suivant, toujours sans la manette : nouveau rapport, nouvelle alerte
  const next = new Date('2026-11-08T10:00:05Z');
  fs.utimesSync(path.join(env.dir, 'BindingLoadingErrors.log'), next, next);
  const s2 = again.guard.setHistory([FILEHEADER, { timestamp: '2026-11-07T22:21:41Z', event: 'Shutdown' }, { timestamp: '2026-11-08T10:00:00Z', event: 'Fileheader', part: 1 }]);
  assert.notEqual(s2.alert.id, s0.alert.id);
  assert.equal(s2.overlay, true);
});

test('doublons seuls : signalés sur la page, sans bandeau ni fenêtre', () => {
  const env = gameDir({ log: 'There where errors when loading preset file: Custom.4.2.binds\r\nThere are multiple entries of binding "MouseGUI" Only the first will be used\r\n' });
  const { guard, overlay } = guardFor(env);
  const s = guard.setHistory([FILEHEADER]);
  assert.equal(s.level, 'info');
  assert.equal(s.alert.kind, 'duplicates');
  assert.equal(s.banner, false);
  assert.equal(s.overlay, false);
  assert.equal(overlay.open, false);
});

test('erreur inconnue : prise au sérieux (bandeau et fenêtre), lignes gardées telles quelles', () => {
  const env = gameDir({ log: 'There where errors when loading preset file: Custom.4.2.binds\r\nSomething unexpected happened\r\n' });
  const { guard } = guardFor(env);
  const s = guard.setHistory([FILEHEADER]);
  assert.equal(s.level, 'warning');
  assert.deepEqual(s.log.other, ['Something unexpected happened']);
  assert.match(s.alert.message, /Custom\.4\.2\.binds/);
  assert.equal(s.overlay, true);
});

test('sans journal du jeu : bandeau, mais pas de fenêtre en jeu (on ne sait pas s\'il tourne)', () => {
  const env = gameDir();
  const { guard } = guardFor(env);
  const s = guard.setHistory([]);
  assert.equal(s.log.concerns, 'unknown');
  assert.equal(s.banner, true);
  assert.equal(s.overlay, false);
});

test('profil réécrit depuis la sauvegarde : signalé ; dossier absent : rien ne casse', () => {
  const env = gameDir();
  fs.appendFileSync(path.join(env.dir, 'Custom.4.2.binds'), '<!-- réassigné -->');
  const { guard } = guardFor(env);
  assert.equal(guard.setHistory([FILEHEADER]).backups[0].sameAsProfile, false);

  const missing = guardFor({ dir: path.join(env.root, 'absent'), dataFile: env.dataFile });
  const s = missing.guard.setHistory([FILEHEADER]);
  assert.equal(s.dirFound, false);
  assert.equal(s.level, 'ok');
  assert.equal(missing.overlay.open, false);
});

test('le dossier du jeu n\'est jamais modifié (lecture, sondage, fermeture d\'alerte)', () => {
  const env = gameDir();
  const before = snapshot(env.dir);
  const { guard } = guardFor(env);
  const s = guard.setHistory([...EARLIER, FILEHEADER, LOADGAME]);
  guard.poll();
  guard.dismiss('overlay', s.alert.id);
  guard.dismiss('banner', s.alert.id);
  guard.event({ timestamp: '2026-11-07T22:21:41Z', event: 'Shutdown' });
  assert.deepEqual(snapshot(env.dir), before);
});

// --- Module : routes et événements du journal ---

test('module : historique, routes /status et /dismiss, en-tête du jeu en direct', async () => {
  const env = gameDir();
  const routes = {};
  const router = { get: (p, h) => (routes[`GET ${p}`] = h), post: (p, h) => (routes[`POST ${p}`] = h) };
  const handlers = {};
  const journal = { addInterest: () => {}, on: (name, h) => (handlers[name] = h) };
  const overlay = fakeOverlay();
  const mod = createBindingsModule({ dir: env.dir, dataFile: env.dataFile, pollMs: 0, now: () => NOW });
  await mod.register({ router, journal, broadcast: () => {}, overlay });

  handlers.ready({ history: [FILEHEADER, LOADGAME, { event: 'Docked', timestamp: '2026-11-07T21:20:00Z' }] });
  assert.equal(overlay.open, true);
  /** Appelle une route avec une fausse réponse Express, et rend { code, body }. */
  const call = (route, req = {}) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    routes[route](req, res);
    return res;
  };
  const status = call('GET /status').body;
  assert.equal(status.alert.message, REAL_MESSAGE);

  assert.equal(call('POST /dismiss', { body: { where: 'overlay', id: 'pas-un-id' } }).code, 400);
  assert.equal(call('POST /dismiss', { body: { where: 'constructor' } }).code, 400);
  const closed = call('POST /dismiss', { body: { where: 'overlay', id: status.alert.id } });
  assert.equal(closed.code, 200);
  assert.equal(closed.body.overlay, false);
  assert.equal(overlay.open, false);

  handlers.event({ timestamp: '2026-11-07T22:21:41Z', event: 'Shutdown' });
  assert.equal(call('GET /status').body.game.running, false);
});

test('dossier par défaut : %LOCALAPPDATA%\\Frontier Developments\\Elite Dangerous\\Options\\Bindings', () => {
  const { dir, displayDir } = defaultBindingsDir({ LOCALAPPDATA: 'C:\\Users\\<toi>\\AppData\\Local' });
  assert.equal(path.basename(dir), 'Bindings');
  assert.ok(dir.includes(path.join('Frontier Developments', 'Elite Dangerous', 'Options')));
  assert.equal(displayDir, '%LOCALAPPDATA%\\Frontier Developments\\Elite Dangerous\\Options\\Bindings');
});

test("module : démarrage de l'app, jeu fermé sans Shutdown (journal ancien) : pas de fenêtre en jeu", async () => {
  const env = gameDir();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-journal-'));
  roots.push(root);
  const file = path.join(root, 'Journal.2026-11-07T221347.01.log');
  fs.writeFileSync(file, '');
  fs.utimesSync(file, new Date(JOURNAL_LAST_WRITE), new Date(JOURNAL_LAST_WRITE));
  const handlers = {};
  const journal = { file, dir: root, lastEventAt: null, addInterest: () => {}, on: (name, h) => (handlers[name] = h) };
  const overlay = fakeOverlay();
  const mod = createBindingsModule({ dir: env.dir, dataFile: env.dataFile, pollMs: 0, now: () => Date.parse('2026-11-07T22:17:00Z') });
  const guard = await mod.register({ router: { get() {}, post() {} }, journal, broadcast: () => {}, overlay });

  handlers.ready({ history: [FILEHEADER, LOADGAME] });
  assert.equal(overlay.open, false);
  assert.equal(guard.status.banner, true);
  assert.equal(guard.status.game.ended, 'silence');
});
