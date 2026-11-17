// Coup d'œil : l'historique ne garde que le dernier inventaire complet du casier (LOCKER_HISTORY, lu par
// core/journalService.js), avec le même casier qu'en relisant tout. Chaque ShipLocker pèse plusieurs Ko et le jeu en
// écrit à chaque embarquement. Journal factice dans un dossier temporaire.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JournalService } from '../../core/journalService.js';
import { GlanceState, GLANCE_EVENTS, LOCKER_HISTORY } from './state.js';

const T = (i) => new Date(Date.UTC(2026, 10, 8, 12) + i * 1000).toISOString();

async function historique(declarer) {
  const lignes = [{ timestamp: T(0), event: 'Fileheader', part: 1 }];
  for (let i = 1; i <= 50; i++) {
    lignes.push({ timestamp: T(i), event: 'ShipLocker', Items: [{ Name: 'x', Count: i }], Components: [], Consumables: [], Data: [] });
    lignes.push({ timestamp: T(i), event: 'ShipLocker' }); // sans liste (détail dans ShipLocker.json)
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-casier-'));
  fs.writeFileSync(path.join(dir, 'Journal.2026-11-08T120000.01.log'), lignes.map((l) => `${JSON.stringify(l)}\r\n`).join(''));
  const svc = new JournalService();
  declarer(svc);
  let history = null;
  svc.on('ready', (r) => (history = r.history));
  try {
    await svc.start(dir);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return history;
}

test('historique réduit au dernier casier complet : même casier qu’en relisant tout', async () => {
  const tout = await historique((svc) => svc.addInterest(GLANCE_EVENTS));
  const reduit = await historique((svc) => {
    svc.addInterest(GLANCE_EVENTS.filter((n) => n !== 'ShipLocker'));
    svc.addInterest(['ShipLocker'], { history: LOCKER_HISTORY });
  });
  assert.equal(tout.length, 100);
  assert.equal(reduit.length, 1);
  const casier = (h) => {
    const s = new GlanceState();
    for (const ev of h) s.apply(ev);
    return s.locker;
  };
  assert.deepEqual(casier(reduit), casier(tout));
  assert.equal(casier(reduit).Items[0].Count, 50);
});

test('le Coup d’œil déclare bien cette règle pour ShipLocker', async () => {
  const src = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  assert.match(src, /addInterest\(\['ShipLocker'\], \{ history: LOCKER_HISTORY \}\)/);
  assert.match(src, /GLANCE_EVENTS\.filter\(\(n\) => n !== 'ShipLocker'\)/);
});
