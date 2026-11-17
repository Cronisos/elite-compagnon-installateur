// Nuit du passage à l'heure d'hiver : le jeu nomme ses journaux à l'heure LOCALE (Journal.2026-10-23T212917 pour un
// premier événement à 19:29:12Z). Le 25 oct. 2026, de 3 h (été) on revient à 2 h (hiver) : une séance lancée à 2 h 30
// (heure d'été, 00:30Z), puis une autre lancée vingt minutes plus tard, à 2 h 10 (heure d'hiver, 01:10Z), donnent un
// second journal au nom plus « ancien ». Avant, trié par le nom, il n'était jamais suivi (ni HUD, ni mérites, ni
// ventes), même après un redémarrage, et l'historique était relu dans le désordre. Ordre attendu : l'heure UTC de la
// première ligne (Fileheader), le nom seulement pour départager. Dossiers temporaires, rien d'autre n'est lu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { journalNameTime, journalStartTime, listJournals } from './journalFiles.js';
import { JournalService } from './journalService.js';

const line = (o) => `${JSON.stringify(o)}\r\n`;
const ETE = 'Journal.2026-10-25T023000.01.log'; // lancé à 2 h 30, heure d'été (00:30Z)
const HIVER = 'Journal.2026-10-25T021000.01.log'; // lancé vingt minutes plus tard : 2 h 10, heure d'hiver (01:10Z)

function dossier() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'elite-heure-hiver-'));
}

test('ordre des journaux : heure UTC de la première ligne, pas le nom écrit à l’heure locale', async () => {
  const dir = dossier();
  try {
    fs.writeFileSync(path.join(dir, ETE), line({ timestamp: '2026-10-25T00:30:00Z', event: 'Fileheader', part: 1 }) + line({ timestamp: '2026-10-25T00:50:00Z', event: 'Shutdown' }));
    fs.writeFileSync(path.join(dir, HIVER), line({ timestamp: '2026-10-25T01:10:00Z', event: 'Fileheader', part: 1 }));
    fs.writeFileSync(path.join(dir, 'Journal.2026-10-24T164832.01.log'), line({ timestamp: '2026-10-24T14:48:29Z', event: 'Fileheader', part: 1 }));
    fs.writeFileSync(path.join(dir, 'Journal.2026-10-25T120851.01.log'), line({ timestamp: '2026-10-25T11:08:48Z', event: 'Fileheader', part: 1 }));
    fs.writeFileSync(path.join(dir, 'Status.json'), '{}');
    const noms = listJournals(dir).map((f) => path.basename(f));
    assert.deepEqual(noms, ['Journal.2026-10-24T164832.01.log', ETE, HIVER, 'Journal.2026-10-25T120851.01.log']);
    assert.equal(journalStartTime(path.join(dir, HIVER)), Date.parse('2026-10-25T01:10:00Z'));
    // Le cache des heures de début : lu une fois, puis resservi (la première ligne d'un journal ne change plus)
    const starts = new Map();
    listJournals(dir, { starts });
    assert.equal(starts.size, 4);
    assert.equal(starts.get(path.join(dir, HIVER)), Date.parse('2026-10-25T01:10:00Z'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('journal sans première ligne (créé à l’instant), illisible ou étrange : placé d’après son nom, jamais une erreur', async () => {
  const dir = dossier();
  try {
    fs.writeFileSync(path.join(dir, 'Journal.2026-11-01T100000.01.log'), line({ timestamp: '2026-11-01T09:00:00Z', event: 'Fileheader' }));
    fs.writeFileSync(path.join(dir, 'Journal.2026-11-02T100000.01.log'), ''); // vide : d'après son nom
    fs.writeFileSync(path.join(dir, 'Journal.2026-11-03T100000.01.log'), '{"timestamp":"2026-11-03T09:00:00Z","ev'); // ligne pas finie
    fs.writeFileSync(path.join(dir, 'Journal.2026-11-04T100000.01.log'), 'null\r\n'); // pas un objet
    fs.writeFileSync(path.join(dir, 'Journal.2026-11-05T100000.01.log'), line({ timestamp: 'hier', event: 'Fileheader' }));
    fs.writeFileSync(path.join(dir, 'Journal.221027181355.01.log'), line({ timestamp: '2022-10-27T16:13:55Z', event: 'Fileheader' })); // ancien format
    for (const n of ['Journal.2026-11-02T100000.01.log', 'Journal.2026-11-03T100000.01.log', 'Journal.2026-11-04T100000.01.log', 'Journal.2026-11-05T100000.01.log']) {
      assert.equal(journalStartTime(path.join(dir, n)), null, n);
    }
    assert.equal(journalStartTime(path.join(dir, 'absent.log')), null);
    assert.deepEqual(listJournals(dir).map((f) => path.basename(f)), [
      'Journal.221027181355.01.log',
      'Journal.2026-11-01T100000.01.log',
      'Journal.2026-11-02T100000.01.log',
      'Journal.2026-11-03T100000.01.log',
      'Journal.2026-11-04T100000.01.log',
      'Journal.2026-11-05T100000.01.log',
    ]);
    assert.equal(journalNameTime('Journal.2026-11-02T100000.01.log'), new Date(2026, 10, 2, 10, 0, 0).getTime());
    assert.equal(journalNameTime('pas un journal'), null);
    // Deux parties d'une même séance (.01, .02) de même heure : le nom départage
    fs.writeFileSync(path.join(dir, 'Journal.2026-11-06T100000.02.log'), line({ timestamp: '2026-11-06T09:00:00Z', event: 'Fileheader', part: 2 }));
    fs.writeFileSync(path.join(dir, 'Journal.2026-11-06T100000.01.log'), line({ timestamp: '2026-11-06T09:00:00Z', event: 'Fileheader', part: 1 }));
    assert.deepEqual(listJournals(dir).slice(-2).map((f) => path.basename(f)), ['Journal.2026-11-06T100000.01.log', 'Journal.2026-11-06T100000.02.log']);
    assert.deepEqual(listJournals(path.join(dir, 'absent')), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('nuit du passage à l’heure d’hiver : la nouvelle séance est suivie en direct, et après un redémarrage', async () => {
  const dir = dossier();
  const svc = new JournalService();
  const direct = [];
  const bascules = [];
  svc.on('event', (ev) => direct.push(ev.event));
  svc.on('switch', (nom) => bascules.push(nom));
  let svc2 = null;
  try {
    fs.writeFileSync(path.join(dir, ETE), line({ timestamp: '2026-10-25T00:30:00Z', event: 'Fileheader', part: 1 }));
    svc.addInterest(['Fileheader', 'FSDJump', 'Shutdown']);
    await svc.start(dir);
    svc.stop(); // tours du lecteur faits à la main ci-dessous
    assert.equal(path.basename(svc.file), ETE);
    fs.appendFileSync(path.join(dir, ETE), line({ timestamp: '2026-10-25T00:50:00Z', event: 'Shutdown' }));
    svc.tick();
    // Nouvelle séance, vingt minutes plus tard : nom plus « ancien », première ligne plus récente
    fs.writeFileSync(path.join(dir, HIVER), line({ timestamp: '2026-10-25T01:10:00Z', event: 'Fileheader', part: 1 }));
    svc.tick();
    assert.equal(path.basename(svc.file), HIVER, 'la nouvelle séance est suivie');
    assert.deepEqual(bascules, [HIVER]);
    fs.appendFileSync(path.join(dir, HIVER), line({ timestamp: '2026-10-25T01:12:00Z', event: 'FSDJump', StarSystem: 'Banc Hiver' }));
    svc.tick();
    assert.deepEqual(direct, ['Shutdown', 'Fileheader', 'FSDJump'], 'reçus en direct, dans l’ordre');
    svc.stop();

    // Redémarrage de l'app : historique dans l'ordre, et le journal suivi est la nouvelle séance
    svc2 = new JournalService();
    svc2.addInterest(['Fileheader', 'FSDJump', 'Shutdown']);
    let historique = null;
    svc2.on('ready', ({ history }) => (historique = history.map((ev) => ev.timestamp)));
    const direct2 = [];
    svc2.on('event', (ev) => direct2.push(ev.event));
    await svc2.start(dir);
    svc2.stop();
    assert.deepEqual(historique, ['2026-10-25T00:30:00Z', '2026-10-25T00:50:00Z', '2026-10-25T01:10:00Z', '2026-10-25T01:12:00Z']);
    assert.equal(path.basename(svc2.file), HIVER);
    fs.appendFileSync(path.join(dir, HIVER), line({ timestamp: '2026-10-25T01:20:00Z', event: 'FSDJump', StarSystem: 'Banc Hiver 2' }));
    svc2.tick();
    assert.deepEqual(direct2, ['FSDJump']);
  } finally {
    svc.stop();
    svc2?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('nouveau journal créé vide, puis sa première ligne : suivi dès qu’elle est écrite, rien de perdu', async () => {
  const dir = dossier();
  const svc = new JournalService();
  const direct = [];
  svc.on('event', (ev) => direct.push(ev.event));
  try {
    fs.writeFileSync(path.join(dir, ETE), line({ timestamp: '2026-10-25T00:30:00Z', event: 'Fileheader', part: 1 }));
    await svc.start(dir);
    svc.stop();
    fs.writeFileSync(path.join(dir, HIVER), ''); // créé par le jeu, pas encore écrit
    svc.tick();
    fs.appendFileSync(path.join(dir, HIVER), line({ timestamp: '2026-10-25T01:10:00Z', event: 'Fileheader', part: 1 }) + line({ timestamp: '2026-10-25T01:11:00Z', event: 'LoadGame' }));
    svc.tick();
    assert.equal(path.basename(svc.file), HIVER);
    assert.deepEqual(direct.filter((e) => e !== 'Shutdown'), ['Fileheader', 'LoadGame']);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
