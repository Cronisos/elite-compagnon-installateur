// Lecteur de journaux : l'erreur d'UN module ne coupe plus les autres. Avant, une exception dans un écouteur faisait
// perdre l'événement aux modules suivants et les lignes suivantes du même lot à tout le monde, sans rien dans la
// console ; dans un écouteur « ready », le serveur ne démarrait plus. Journaux factices dans un dossier temporaire.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JournalService } from './journalService.js';
import { parseLines } from './journalFiles.js';
import { buildFleet } from '../modules/engineering/services/fleet.js';

const line = (o) => `${JSON.stringify(o)}\r\n`;
const T = (s) => `2026-11-08T12:00:${String(s).padStart(2, '0')}Z`;

function dossier(lignes = [line({ timestamp: T(0), event: 'Fileheader', part: 1 })]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-isolation-'));
  const file = path.join(dir, 'Journal.2026-11-08T120000.01.log');
  fs.writeFileSync(file, lignes.join(''));
  return { dir, file };
}

test('un écouteur qui lève : les autres reçoivent l’événement, et les lignes suivantes du lot sont publiées', async (t) => {
  const err = t.mock.method(console, 'error', () => {});
  const { dir, file } = dossier();
  const svc = new JournalService();
  try {
    await svc.start(dir);
    svc.stop();
    const vusA = [];
    const vusB = [];
    svc.on('event', (ev) => {
      vusA.push(ev.event);
      if (ev.event === 'Piege') throw new Error('bogue dans le module A');
    });
    svc.on('event', (ev) => vusB.push(ev.event));
    fs.appendFileSync(file, [line({ timestamp: T(1), event: 'MarketSell' }), line({ timestamp: T(2), event: 'Piege' }), line({ timestamp: T(3), event: 'MarketBuy' })].join(''));
    svc.tick();
    assert.deepEqual(vusA, ['MarketSell', 'Piege', 'MarketBuy']);
    assert.deepEqual(vusB, ['MarketSell', 'Piege', 'MarketBuy'], 'B reçoit tout, y compris l’événement qui a fait planter A');
    assert.deepEqual(svc.recent.map((e) => e.event), ['MarketSell', 'Piege', 'MarketBuy']);
    assert.equal(svc.error, null, 'pas une erreur de lecture du journal');
    assert.equal(err.mock.callCount(), 1, 'écrit dans la console');
    assert.match(String(err.mock.calls[0].arguments[0]), /l'événement Piege/);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('un module qui échoue à chaque événement : une ligne par minute au plus, avec le nombre de répétitions', async (t) => {
  const err = t.mock.method(console, 'error', () => {});
  let now = Date.UTC(2026, 10, 8, 12);
  t.mock.method(Date, 'now', () => now);
  const svc = new JournalService();
  const vus = [];
  svc.on('status', () => {
    throw new Error('bogue sur Status.json');
  });
  svc.on('status', (s) => vus.push(s.n));
  for (let n = 0; n < 50; n++) svc.emit('status', { n });
  assert.equal(vus.length, 50, 'le module suivant reçoit tout');
  assert.equal(err.mock.callCount(), 1, 'une seule pile pour 50 échecs identiques');
  svc.on('event', () => {
    throw new Error('autre bogue');
  });
  svc.emit('event', { event: 'Music' });
  assert.equal(err.mock.callCount(), 2, 'une autre erreur est écrite tout de suite');
  now += 61_000;
  svc.emit('status', { n: 50 });
  assert.equal(err.mock.callCount(), 3);
  assert.match(String(err.mock.calls[2].arguments[0]), /« status », 49 fois de plus depuis la ligne précédente/);
});

test('un écouteur de « ready » qui lève : le démarrage aboutit et le suivi en direct tourne', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { dir } = dossier([line({ timestamp: T(0), event: 'Fileheader', part: 1 }), line({ timestamp: T(1), event: 'Loadout' })]);
  const svc = new JournalService();
  svc.addInterest(['Loadout']);
  try {
    let recu = null;
    svc.on('ready', () => {
      throw new Error('bogue au démarrage');
    });
    svc.on('ready', ({ history }) => (recu = history.map((e) => e.event)));
    await assert.doesNotReject(svc.start(dir));
    assert.deepEqual(recu, ['Loadout']);
    assert.ok(svc.timer, 'minuterie du suivi posée');
    assert.equal(svc.ready, true);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('erreur de lecture d’un tour : effacée au tour réussi suivant (elle restait affichée sans fin)', async () => {
  const { dir, file } = dossier();
  const svc = new JournalService();
  try {
    await svc.start(dir);
    svc.stop();
    const vraie = svc.readNewLines;
    svc.readNewLines = () => {
      throw new Error('EBUSY: fichier verrouillé');
    };
    svc.tick();
    assert.match(svc.error, /EBUSY/);
    svc.readNewLines = vraie;
    fs.appendFileSync(file, line({ timestamp: T(1), event: 'Music' }));
    svc.tick();
    assert.equal(svc.error, null);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('lignes JSON qui ne sont pas des objets (null, nombre, tableau, texte) : ignorées sans casser le lot', async () => {
  const evs = parseLines(['null', '42', '[1,2]', '"texte"', '{"event":"Docked","timestamp":"x"}', 'true', '{"event":"Undocked"}'].join('\n'));
  assert.deepEqual(evs.map((e) => e.event), ['Docked', 'Undocked']);
  const { dir, file } = dossier();
  const svc = new JournalService();
  try {
    await svc.start(dir);
    svc.stop();
    const vus = [];
    svc.on('event', (ev) => vus.push(ev.event));
    fs.appendFileSync(file, `null\r\n${line({ timestamp: T(2), event: 'Docked' })}`);
    svc.tick();
    assert.deepEqual(vus, ['Docked']);
    assert.equal(svc.error, null);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('flotte : un Loadout ou un vaisseau stocké sans ShipID est ignoré, sans exception (le serveur ne démarrait plus)', async () => {
  const evs = [
    { event: 'Loadout', ShipID: 3, Ship: 'Python', ShipName: 'Un', ShipIdent: 'AB-01', Modules: [], timestamp: T(1) },
    { event: 'Loadout', Ship: 'Cutter', ShipName: 'Sans id', Modules: [], timestamp: T(2) },
    { event: 'Loadout', ShipID: '7', Ship: 'Cutter', timestamp: T(3) },
    { event: 'Loadout', ShipID: 4, Ship: 'Mamba', ShipName: 42, ShipIdent: null, timestamp: T(4) },
    { event: 'StoredShips', ShipsHere: [null, { ShipType: 'cobra' }, { ShipID: 5, ShipType: 'Krait', Name: 7 }], ShipsRemote: { pas: 'un tableau' } },
    { event: 'ShipyardSwap', ShipType: 'Anaconda' },
    { event: 'LoadGame', ShipID: 'abc', Ship: 'Cutter' }, // ShipID qui n'est pas un entier : aucun vaisseau actuel nouveau
    { event: 'EngineerProgress', Engineers: [null, { Engineer: 3 }, { Engineer: 'Felicity Farseer', EngineerID: 300100, Rank: 5 }] },
    { event: 'EngineerCraft', Slot: null, Module: 'x' },
    null,
  ];
  let f;
  assert.doesNotThrow(() => (f = buildFleet(evs)));
  assert.deepEqual([...f.ships.keys()].sort(), [3, 4, 5]);
  assert.equal(f.currentShipId, 4, 'le dernier Loadout valide');
  assert.equal(f.ships.get(4).name, '', 'nom qui n’est pas un texte : vide');
  assert.equal(f.engineers.get('Felicity Farseer').rank, 5);
});

test('flotte : un Loadout sans ShipID dans l’historique ne casse plus le démarrage du serveur (bout en bout du lecteur)', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { dir } = dossier([line({ timestamp: T(0), event: 'Fileheader', part: 1 }), line({ timestamp: T(1), event: 'Loadout', Ship: 'Cutter' }), line({ timestamp: T(2), event: 'Loadout', ShipID: 3, Ship: 'Python' })]);
  const svc = new JournalService();
  svc.addInterest(['Loadout']);
  try {
    let flotte = null;
    svc.on('ready', ({ history }) => (flotte = buildFleet(history)));
    await svc.start(dir);
    assert.deepEqual([...flotte.ships.keys()], [3]);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
