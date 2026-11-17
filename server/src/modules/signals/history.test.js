// Signaux : l'historique ne garde que les signaux du dernier système (SIGNAL_HISTORY, lu par core/journalService.js),
// avec le même état qu'en relisant tout. Les signaux des systèmes d'avant (des dizaines de milliers en exploration)
// pesaient sur la mémoire du démarrage sans servir. Journal factice dans un dossier temporaire.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JournalService } from '../../core/journalService.js';
import { SignalState, SIGNAL_EVENTS, SIGNAL_HISTORY } from './state.js';

const T = (i) => new Date(Date.UTC(2026, 10, 8, 12) + i * 1000).toISOString();

function lignes() {
  const out = [{ timestamp: T(0), event: 'Fileheader', part: 1 }];
  let i = 1;
  for (let s = 0; s < 30; s++) {
    out.push({ timestamp: T(i++), event: s % 2 ? 'FSDJump' : 'Location', StarSystem: `Sys ${s}`, SystemAddress: 1000 + s });
    for (let k = 0; k < 20; k++) out.push({ timestamp: T(i++), event: 'FSSSignalDiscovered', SystemAddress: 1000 + s, SignalName: '$USS;', SignalType: 'USS', USSType: '$USS_Type_Salvage;', USSType_Localised: `Épave ${k}`, TimeRemaining: 3000 + k });
  }
  out.push({ timestamp: T(i++), event: 'StartJump', JumpType: 'Hyperspace' });
  out.push({ timestamp: T(i++), event: 'FSSSignalDiscovered', SystemAddress: 1029, SignalName: '$USS;', SignalType: 'USS', USSType: '$USS_Type_Salvage;', USSType_Localised: 'Après départ', TimeRemaining: 3000 });
  return out;
}

async function historique(declarer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-signaux-'));
  fs.writeFileSync(path.join(dir, 'Journal.2026-11-08T120000.01.log'), lignes().map((l) => `${JSON.stringify(l)}\r\n`).join(''));
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

const etat = (history) => {
  const s = new SignalState();
  for (const ev of history) s.apply(ev);
  return { system: s.system, away: s.away, signals: s.signals, summary: s.summary(Date.parse(T(0))) };
};

test('historique réduit aux signaux du dernier système : même état qu’en relisant tout', async () => {
  const tout = await historique((svc) => svc.addInterest(SIGNAL_EVENTS));
  const reduit = await historique((svc) => {
    svc.addInterest(SIGNAL_EVENTS.filter((n) => n !== 'FSSSignalDiscovered'));
    svc.addInterest(['FSSSignalDiscovered'], { history: SIGNAL_HISTORY });
  });
  assert.equal(tout.filter((e) => e.event === 'FSSSignalDiscovered').length, 601);
  assert.equal(reduit.filter((e) => e.event === 'FSSSignalDiscovered').length, 21, 'ceux du dernier système seulement');
  assert.deepEqual(etat(reduit), etat(tout));
  assert.equal(etat(reduit).signals.length, 21);
});

test('le module Signaux déclare bien cette règle pour FSSSignalDiscovered', async () => {
  const src = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  assert.match(src, /addInterest\(\['FSSSignalDiscovered'\], \{ history: SIGNAL_HISTORY \}\)/);
  assert.match(src, /SIGNAL_EVENTS\.filter\(\(n\) => n !== 'FSSSignalDiscovered'\)/);
});
