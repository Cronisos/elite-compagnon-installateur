// Mémoire du lecteur de journaux : l'historique lu au démarrage est remis aux modules puis libéré, et il peut être
// réduit pendant la lecture (règles « le dernier » et « depuis le dernier saut » demandées par les modules). Avant, la
// minuterie du suivi gardait tout l'historique jusqu'à l'arrêt du serveur (environ 1 Mo de mémoire par Mo de journaux,
// sans plafond). Journaux factices dans un dossier temporaire.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';
import { JournalService } from './journalService.js';

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');

const line = (o) => `${JSON.stringify(o)}\r\n`;
const T = (s) => `2026-11-08T12:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}Z`;

function dossier(lignes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-memoire-'));
  fs.writeFileSync(path.join(dir, 'Journal.2026-11-08T120000.01.log'), lignes.map(line).join(''));
  return dir;
}

async function libere(ref) {
  for (let i = 0; i < 5 && ref.deref(); i++) {
    await new Promise((r) => setImmediate(r));
    gc();
  }
  return ref.deref() === undefined;
}

test('l’historique remis aux modules n’est plus gardé par le lecteur une fois « ready » passé', async () => {
  const dir = dossier([{ timestamp: T(0), event: 'Fileheader', part: 1 }, ...Array.from({ length: 200 }, (_, i) => ({ timestamp: T(i + 1), event: 'Docked', StarSystem: `Sys ${i}` }))]);
  const svc = new JournalService();
  svc.addInterest(['Docked']);
  let ref = null;
  const ecoute = ({ history }) => {
    ref = new WeakRef(history);
  };
  svc.on('ready', ecoute);
  try {
    await svc.start(dir);
    assert.ok(svc.timer, 'le suivi en direct tourne (sa minuterie ne doit pas garder l’historique)');
    svc.off('ready', ecoute);
    assert.ok(ref.deref()?.length === 200, 'les modules ont bien reçu tout l’historique');
    assert.equal(await libere(ref), true, 'historique libéré après « ready »');
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('règle « le dernier utile » : seul le dernier événement utile du type reste, à sa place', async () => {
  const dir = dossier([
    { timestamp: T(0), event: 'Fileheader', part: 1 },
    { timestamp: T(1), event: 'ShipLocker', Items: [1] },
    { timestamp: T(2), event: 'Docked' },
    { timestamp: T(3), event: 'ShipLocker', Items: [2] },
    { timestamp: T(4), event: 'ShipLocker' }, // sans liste : rien à garder
    { timestamp: T(5), event: 'Undocked' },
  ]);
  const svc = new JournalService();
  const regle = { last: true, useful: (ev) => Array.isArray(ev.Items) };
  svc.addInterest(['Docked', 'Undocked']);
  svc.addInterest(['ShipLocker'], { history: regle });
  let vus = null;
  svc.on('ready', ({ history }) => (vus = history.map((e) => `${e.event}${e.Items ? e.Items[0] : ''}`)));
  try {
    await svc.start(dir);
    assert.deepEqual(vus, ['Docked', 'ShipLocker2', 'Undocked']);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('règle « depuis le dernier saut » : seuls les signaux du dernier système restent ; en direct, tout arrive', async () => {
  const dir = dossier([
    { timestamp: T(0), event: 'Fileheader', part: 1 },
    { timestamp: T(1), event: 'FSDJump', StarSystem: 'A' },
    { timestamp: T(2), event: 'FSSSignalDiscovered', SignalName: 'a1' },
    { timestamp: T(3), event: 'FSSSignalDiscovered', SignalName: 'a2' },
    { timestamp: T(4), event: 'Location', StarSystem: 'B' },
    { timestamp: T(5), event: 'FSSSignalDiscovered', SignalName: 'b1' },
  ]);
  const svc = new JournalService();
  const regle = { since: ['FSDJump', 'Location', 'CarrierJump'] };
  svc.addInterest(['FSSSignalDiscovered'], { history: regle });
  let vus = null;
  svc.on('ready', ({ history }) => (vus = history.map((e) => e.SignalName || e.event)));
  try {
    await svc.start(dir);
    assert.deepEqual(vus, ['FSDJump', 'Location', 'b1'], 'les remises à zéro sont lues et restent dans l’historique');
    svc.stop();
    const direct = [];
    svc.on('event', (ev) => direct.push(ev.SignalName || ev.event));
    fs.appendFileSync(path.join(dir, 'Journal.2026-11-08T120000.01.log'), [line({ timestamp: T(6), event: 'FSSSignalDiscovered', SignalName: 'b2' }), line({ timestamp: T(7), event: 'FSSSignalDiscovered', SignalName: 'b3' })].join(''));
    svc.tick();
    assert.deepEqual(direct, ['b2', 'b3']);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deux modules qui ne demandent pas la même chose d’un type : tous les événements restent', async () => {
  const lignes = [{ timestamp: T(0), event: 'Fileheader', part: 1 }, { timestamp: T(1), event: 'ShipLocker', Items: [1] }, { timestamp: T(2), event: 'ShipLocker', Items: [2] }];
  for (const [nom, declarer] of [
    ['règle puis rien', (s) => { s.addInterest(['ShipLocker'], { history: { last: true } }); s.addInterest(['ShipLocker']); }],
    ['rien puis règle', (s) => { s.addInterest(['ShipLocker']); s.addInterest(['ShipLocker'], { history: { last: true } }); }],
    ['deux règles différentes', (s) => { s.addInterest(['ShipLocker'], { history: { last: true } }); s.addInterest(['ShipLocker'], { history: { last: true } }); }],
    ['règle inconnue', (s) => s.addInterest(['ShipLocker'], { history: { autre: 1 } })],
  ]) {
    const dir = dossier(lignes);
    const svc = new JournalService();
    declarer(svc);
    let n = null;
    svc.on('ready', ({ history }) => (n = history.length));
    try {
      await svc.start(dir);
      assert.equal(n, 2, nom);
    } finally {
      svc.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  // La même règle (même objet) partagée : appliquée
  const regle = { last: true };
  const dir = dossier(lignes);
  const svc = new JournalService();
  svc.addInterest(['ShipLocker'], { history: regle });
  svc.addInterest(['ShipLocker'], { history: regle });
  let n = null;
  svc.on('ready', ({ history }) => (n = history.length));
  try {
    await svc.start(dir);
    assert.equal(n, 1);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('tri d’un module qui lève une exception : l’événement est gardé (jamais perdu à cause d’un bogue)', async () => {
  const dir = dossier([{ timestamp: T(0), event: 'Fileheader', part: 1 }, { timestamp: T(1), event: 'ShipLocker', Items: [1] }]);
  const svc = new JournalService();
  svc.addInterest(['ShipLocker'], { history: { last: true, useful: () => { throw new Error('bogue'); } } });
  let n = null;
  svc.on('ready', ({ history }) => (n = history.length));
  try {
    await svc.start(dir);
    assert.equal(n, 1);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
