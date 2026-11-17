// Lecteur de journaux, cas anormaux (audit du 15 nov. 2026) :
//   - B29 : une partie Legacy ou bêta ne touche plus à l'état Live (historique, direct, fichiers d'état) ;
//   - B31 : un journal illisible au démarrage est réessayé, tout l'historique relu dès qu'il se lit, et le message part ;
//   - B32 : un journal déjà lu qui redevient le plus récent (journal actif déplacé), ou un journal raccourci, n'est
//     jamais republié comme nouveau ;
//   - B40 : un journal vide n'est plus rouvert deux fois par seconde.
// Journaux factices dans des dossiers temporaires : ni les fichiers du jeu ni server/data ne sont touchés.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JournalService } from './journalService.js';
import { listJournals } from './journalFiles.js';
import { LEGACY_SPLIT_AT, galaxyOf } from './galaxy.js';
import { fiche } from '../regles/index.js';

const line = (o) => `${JSON.stringify(o)}\r\n`;
const dossier = () => fs.mkdtempSync(path.join(os.tmpdir(), 'elite-robustesse-'));
const header = (timestamp, gameversion) => line({ timestamp, event: 'Fileheader', part: 1, gameversion });
const jump = (timestamp, StarSystem) => line({ timestamp, event: 'FSDJump', StarSystem });

test('galaxie : Live 4.x, Legacy 3.8 après la séparation, bêta ; version inconnue ou 3.8 d’avant 2022 : Live', () => {
  assert.equal(galaxyOf('4.4.2.1', '2026-11-07T10:00:00Z'), 'live');
  assert.equal(galaxyOf('3.8.0.407', '2026-11-07T10:00:00Z'), 'legacy');
  assert.equal(galaxyOf('3.8.0.407', '2021-05-01T10:00:00Z'), 'live', 'avant la séparation, une seule galaxie');
  assert.equal(galaxyOf('4.5.0.100 Beta', '2026-11-07T10:00:00Z'), 'beta');
  assert.equal(galaxyOf('4.5.0.100 alpha', '2026-11-07T10:00:00Z'), 'beta');
  assert.equal(galaxyOf(undefined, '2026-11-07T10:00:00Z'), 'live');
  assert.equal(galaxyOf('', null), 'live');
  // Date de séparation : celle de la fiche du dépôt des règles (une seule source, suivie par la Vigie)
  assert.equal(LEGACY_SPLIT_AT, Date.parse(fiche('escadron.galaxie.separation').valeur));
  assert.equal(galaxyOf('3.8.0.407', new Date(LEGACY_SPLIT_AT - 1).toISOString()), 'live');
  assert.equal(galaxyOf('3.8.0.407', LEGACY_SPLIT_AT), 'legacy');
});

test('B29 : séance Legacy ignorée dans l’historique, en direct et dans les fichiers d’état ; Live reprise ensuite', async () => {
  const dir = dossier();
  const svc = new JournalService();
  try {
    fs.writeFileSync(path.join(dir, 'Journal.2026-11-07T100000.01.log'), header('2026-11-07T09:00:00Z', '4.4.2.1') + jump('2026-11-07T09:05:00Z', 'Système Test Live'));
    const legacy = path.join(dir, 'Journal.2026-11-08T100000.01.log');
    fs.writeFileSync(legacy, header('2026-11-08T09:00:00Z', '3.8.0.407') + line({ timestamp: '2026-11-08T09:01:00Z', event: 'LoadGame', Commander: 'Testeur' }) + jump('2026-11-08T09:05:00Z', 'Système Test Legacy'));
    fs.writeFileSync(path.join(dir, 'Status.json'), JSON.stringify({ timestamp: '2026-11-08T09:06:00Z', event: 'Status', Flags: 1 }));
    svc.addInterest(['Fileheader', 'LoadGame', 'FSDJump']);
    let historique = null;
    svc.on('ready', ({ history }) => (historique = history.map((ev) => ev.StarSystem ?? ev.event)));
    const direct = [];
    svc.on('event', (ev) => direct.push(ev.StarSystem ?? ev.event));
    const statuts = [];
    svc.on('status', (s) => statuts.push(s.Flags));
    await svc.start(dir);
    svc.stop();
    assert.deepEqual(historique, ['Fileheader', 'Système Test Live'], 'rien de la séance Legacy');
    assert.equal(svc.info().galaxy, 'legacy');
    assert.deepEqual(statuts, [], 'Status.json écrit par la partie Legacy : pas publié');

    fs.appendFileSync(legacy, jump('2026-11-08T09:10:00Z', 'Système Test Legacy 2'));
    fs.writeFileSync(path.join(dir, 'Status.json'), JSON.stringify({ timestamp: '2026-11-08T09:11:00Z', event: 'Status', Flags: 2 }));
    svc.tick();
    assert.deepEqual(direct, [], 'en direct non plus');
    assert.deepEqual(statuts, []);

    // Retour en Live : nouvelle séance, publiée ; le Status.json Legacy déjà vu n'est pas republié
    fs.writeFileSync(path.join(dir, 'Journal.2026-11-09T100000.01.log'), header('2026-11-09T09:00:00Z', '4.4.2.1') + jump('2026-11-09T09:05:00Z', 'Système Test Live 2'));
    svc.tick();
    assert.equal(svc.info().galaxy, 'live');
    assert.deepEqual(direct, ['Fileheader', 'Système Test Live 2']);
    assert.deepEqual(statuts, []);
    fs.writeFileSync(path.join(dir, 'Status.json'), JSON.stringify({ timestamp: '2026-11-09T09:06:00Z', event: 'Status', Flags: 3, Pips: [4, 4, 4] }));
    svc.tick();
    assert.deepEqual(statuts, [3]);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B29 : un vieux journal 3.8 d’avant la séparation des galaxies reste dans l’historique', async () => {
  const dir = dossier();
  const svc = new JournalService();
  try {
    fs.writeFileSync(path.join(dir, 'Journal.210501100000.01.log'), header('2021-05-01T08:00:00Z', '3.8.0.300') + jump('2021-05-01T08:05:00Z', 'Système Test 2021'));
    svc.addInterest(['FSDJump']);
    let historique = null;
    svc.on('ready', ({ history }) => (historique = history.map((ev) => ev.StarSystem)));
    await svc.start(dir);
    svc.stop();
    assert.deepEqual(historique, ['Système Test 2021']);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B31 : journal verrouillé au démarrage : signalé, réessayé, tout l’historique relu puis le message disparaît', async (t) => {
  const dir = dossier();
  const svc = new JournalService();
  const verrouille = path.join(dir, 'Journal.2026-11-07T100000.01.log');
  try {
    fs.writeFileSync(verrouille, header('2026-11-07T09:00:00Z', '4.4.2.1') + jump('2026-11-07T09:05:00Z', 'Système Test A'));
    fs.writeFileSync(path.join(dir, 'Journal.2026-11-08T100000.01.log'), header('2026-11-08T09:00:00Z', '4.4.2.1') + jump('2026-11-08T09:05:00Z', 'Système Test B'));
    svc.addInterest(['FSDJump']);
    const historiques = [];
    svc.on('ready', ({ history }) => historiques.push(history.map((ev) => ev.StarSystem)));
    const lire = fs.readFileSync;
    const mock = t.mock.method(fs, 'readFileSync', function (file, ...rest) {
      if (String(file) === verrouille) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      return lire.call(this, file, ...rest);
    });
    await svc.start(dir);
    svc.stop();
    assert.deepEqual(historiques, [['Système Test B']]);
    assert.equal(svc.skipped.size, 1);
    assert.deepEqual(svc.info().skipped, ['Journal.2026-11-07T100000.01.log']);
    assert.match(svc.info().error, /Journal illisible pour l'instant : Journal\.2026-11-07T100000\.01\.log, il est bloqué par un autre programme \(antivirus, sauvegarde, synchronisation\) \(code EBUSY\)/);

    // Pas avant 10 s, puis lisible : tout est relu, une fois
    assert.equal(svc.retrySkipped(Date.now()), false);
    mock.mock.restore();
    assert.equal(svc.retrySkipped(Date.now() + 60_000), true);
    await svc.relecture;
    svc.stop();
    assert.deepEqual(historiques.at(-1), ['Système Test A', 'Système Test B']);
    assert.equal(svc.skipped.size, 0);
    assert.equal(svc.info().error, null);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B31 : journal qui s’ouvre mais ne se lit pas (verrou de plage) : aucune relecture tant que la lecture échoue', async (t) => {
  const dir = dossier();
  const svc = new JournalService();
  const verrouille = path.join(dir, 'Journal.2026-11-07T100000.01.log');
  try {
    fs.writeFileSync(verrouille, header('2026-11-07T09:00:00Z', '4.4.2.1') + jump('2026-11-07T09:05:00Z', 'Système Test A'));
    fs.writeFileSync(path.join(dir, 'Journal.2026-11-08T100000.01.log'), header('2026-11-08T09:00:00Z', '4.4.2.1'));
    svc.addInterest(['FSDJump']);
    let prets = 0;
    svc.on('ready', () => prets++);
    const lire = fs.readFileSync;
    // openSync reste normal : seul readFileSync échoue, comme avec un verrou LockFileEx
    t.mock.method(fs, 'readFileSync', function (file, ...rest) {
      if (String(file) === verrouille) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      return lire.call(this, file, ...rest);
    });
    await svc.start(dir);
    svc.stop();
    assert.equal(prets, 1);
    const debut = Date.now();
    for (let i = 1; i <= 5; i++) assert.equal(svc.retrySkipped(debut + i * 60_000), false);
    assert.equal(prets, 1, 'avant : « ready » réémis (tout relu) à chaque essai');
    assert.equal(svc.skipped.size, 1, 'toujours signalé');
    assert.match(svc.info().error, /Journal illisible/);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B31 : journal sauté qui disparaît ensuite : oublié, le message part sans relecture', async (t) => {
  const dir = dossier();
  const svc = new JournalService();
  const verrouille = path.join(dir, 'Journal.2026-11-07T100000.01.log');
  try {
    fs.writeFileSync(verrouille, header('2026-11-07T09:00:00Z', '4.4.2.1'));
    fs.writeFileSync(path.join(dir, 'Journal.2026-11-08T100000.01.log'), header('2026-11-08T09:00:00Z', '4.4.2.1'));
    const lire = fs.readFileSync;
    t.mock.method(fs, 'readFileSync', function (file, ...rest) {
      // Verrouillé tant qu'il existe ; supprimé, la vraie lecture répond ENOENT
      if (String(file) === verrouille && fs.existsSync(verrouille)) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
      return lire.call(this, file, ...rest);
    });
    let prets = 0;
    svc.on('ready', () => prets++);
    await svc.start(dir);
    svc.stop();
    fs.rmSync(verrouille);
    assert.equal(svc.retrySkipped(Date.now() + 60_000), false);
    assert.equal(prets, 1);
    assert.equal(svc.skipped.size, 0);
    assert.equal(svc.error, null);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B32 : journal actif supprimé : le précédent, déjà lu, n’est pas republié ; ses nouvelles lignes, si', async () => {
  const dir = dossier();
  const svc = new JournalService();
  const ancien = path.join(dir, 'Journal.2026-11-07T100000.01.log');
  const actif = path.join(dir, 'Journal.2026-11-08T100000.01.log');
  try {
    fs.writeFileSync(ancien, header('2026-11-07T09:00:00Z', '4.4.2.1') + jump('2026-11-07T09:05:00Z', 'Système Test A') + line({ timestamp: '2026-11-07T09:06:00Z', event: 'PowerplayMerits', MeritsGained: 100 }));
    fs.writeFileSync(actif, header('2026-11-08T09:00:00Z', '4.4.2.1'));
    const direct = [];
    const bascules = [];
    svc.on('event', (ev) => direct.push(ev.event));
    svc.on('switch', (n) => bascules.push(n));
    await svc.start(dir);
    svc.stop();
    fs.rmSync(actif);
    svc.tick();
    assert.equal(path.basename(svc.file), path.basename(ancien), 'bascule faite (avant : bloquée par l’erreur du fichier disparu)');
    assert.deepEqual(bascules, [path.basename(ancien)]);
    assert.deepEqual(direct, [], 'rien de republié');
    assert.equal(svc.error, null);
    fs.appendFileSync(ancien, jump('2026-11-08T10:00:00Z', 'Système Test C'));
    svc.tick();
    assert.deepEqual(direct, ['FSDJump']);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B32 : journal raccourci : rien de republié, la suite est lue', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const dir = dossier();
  const svc = new JournalService();
  const actif = path.join(dir, 'Journal.2026-11-08T100000.01.log');
  try {
    fs.writeFileSync(actif, header('2026-11-08T09:00:00Z', '4.4.2.1') + jump('2026-11-08T09:05:00Z', 'Système Test A') + jump('2026-11-08T09:06:00Z', 'Système Test B'));
    const direct = [];
    svc.on('event', (ev) => direct.push(ev.StarSystem ?? ev.event));
    await svc.start(dir);
    svc.stop();
    fs.writeFileSync(actif, header('2026-11-08T09:00:00Z', '4.4.2.1'));
    svc.tick();
    assert.deepEqual(direct, [], 'avant : tout le fichier relu et republié');
    assert.equal(warn.mock.callCount(), 1);
    fs.appendFileSync(actif, jump('2026-11-08T09:10:00Z', 'Système Test C'));
    svc.tick();
    assert.deepEqual(direct, ['Système Test C']);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B40 : journal vide : ouvert une fois, puis seulement quand il change', async (t) => {
  const dir = dossier();
  const vide = path.join(dir, 'Journal.2026-11-08T100000.01.log');
  try {
    fs.writeFileSync(path.join(dir, 'Journal.2026-11-07T100000.01.log'), header('2026-11-07T09:00:00Z', '4.4.2.1'));
    fs.writeFileSync(vide, '');
    const ouvrir = fs.openSync;
    let ouvertures = 0;
    t.mock.method(fs, 'openSync', function (file, ...rest) {
      if (String(file) === vide) ouvertures++;
      return ouvrir.call(this, file, ...rest);
    });
    const starts = new Map();
    const misses = new Map();
    for (let i = 0; i < 5; i++) listJournals(dir, { starts, misses });
    assert.equal(ouvertures, 1, 'avant : rouvert à chaque tour');
    assert.equal(misses.size, 1);
    fs.writeFileSync(vide, header('2026-11-08T09:00:00Z', '4.4.2.1'));
    const liste = listJournals(dir, { starts, misses });
    assert.equal(ouvertures, 2, 'il a changé : relu');
    assert.equal(starts.get(vide), Date.parse('2026-11-08T09:00:00Z'));
    assert.equal(misses.size, 0);
    assert.equal(path.basename(liste.at(-1)), path.basename(vide));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
