// Tests du lecteur de journaux, partie « derniers événements » : nom et heure seulement.
// Journal factice dans un dossier temporaire : ni les fichiers du jeu ni server/data ne sont touchés.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JournalService, recentEntry } from './journalService.js';

const line = (o) => `${JSON.stringify(o)}\r\n`;

test('recentEntry ne garde que le nom et l\'heure', async () => {
  const ev = { timestamp: '2026-11-07T12:00:00Z', event: 'ReceiveText', From: 'CMDR Inconnu', Message: 'salut', Channel: 'player' };
  assert.deepEqual(recentEntry(ev), { event: 'ReceiveText', timestamp: '2026-11-07T12:00:00Z' });
});

test('les événements suivis en direct ne gardent ni chat, ni FID, ni noms d\'autres CMDR', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-journal-'));
  const svc = new JournalService();
  try {
    const file = path.join(dir, 'Journal.2026-11-07T120000.01.log');
    fs.writeFileSync(file, line({ timestamp: '2026-11-07T12:00:00Z', event: 'Fileheader', part: 1 }));
    await svc.start(dir);
    svc.stop(); // lecture faite à la main ci-dessous, sans minuterie
    fs.appendFileSync(file, [
      line({ timestamp: '2026-11-07T12:00:01Z', event: 'Commander', FID: 'F1234567', Name: 'Moi' }),
      line({ timestamp: '2026-11-07T12:00:02Z', event: 'ReceiveText', From: 'Autre CMDR', Message: 'message privé', Channel: 'player' }),
      line({ timestamp: '2026-11-07T12:00:03Z', event: 'WingJoin', Others: ['Ailier Un', 'Ailier Deux'] }),
    ].join(''));
    svc.readNewLines();
    assert.deepEqual(svc.recent, [
      { event: 'Commander', timestamp: '2026-11-07T12:00:01Z' },
      { event: 'ReceiveText', timestamp: '2026-11-07T12:00:02Z' },
      { event: 'WingJoin', timestamp: '2026-11-07T12:00:03Z' },
    ]);
    const text = JSON.stringify(svc.recent);
    for (const secret of ['F1234567', 'message privé', 'Autre CMDR', 'Ailier']) assert.ok(!text.includes(secret), secret);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('la liste des derniers événements reste limitée à 50', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-journal-'));
  const svc = new JournalService();
  try {
    const file = path.join(dir, 'Journal.2026-11-07T120000.01.log');
    fs.writeFileSync(file, '');
    await svc.start(dir);
    svc.stop();
    const lines = [];
    for (let i = 0; i < 60; i++) lines.push(line({ timestamp: `2026-11-07T12:${String(i).padStart(2, '0')}:00Z`, event: `E${i}` }));
    fs.appendFileSync(file, lines.join(''));
    svc.readNewLines();
    assert.equal(svc.recent.length, 50);
    assert.equal(svc.recent[0].event, 'E10');
    assert.equal(svc.recent.at(-1).event, 'E59');
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
