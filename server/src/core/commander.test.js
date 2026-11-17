// Plusieurs commandants sur le même PC (audit du 15 nov. 2026, M7) : le commandant chargé, noté sur chaque événement par
// le lecteur des journaux, et ce que le cœur en expose. Noms et FID fictifs : « Testeur » (F0000001) et « Testeur 2 »
// (F0000002), qui ont tous deux un vaisseau n° 1. Journaux factices dans un dossier temporaire.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { belongsTo, COMMANDER, commanderIdOf, commanderOf, CommanderTracker, isCommanderId, keepCommander, mostSeen, shipKey } from './commander.js';
import { JournalService } from './journalService.js';
import { GameState } from './gameState.js';

const UN = { FID: 'F0000001', Commander: 'Testeur' };
const DEUX = { FID: 'F0000002', Commander: 'Testeur 2' };
const loadGame = (who, extra = {}) => ({ event: 'LoadGame', ...who, Ship: 'Anaconda', ShipID: 1, GameMode: 'Solo', ...extra });
const line = (o) => `${JSON.stringify(o)}\r\n`;

test('identifiant : le FID du LoadGame ou du Commander, sinon le nom préfixé ; rien pour un autre événement', () => {
  assert.equal(commanderIdOf(loadGame(UN)), 'F0000001');
  assert.equal(commanderIdOf({ event: 'Commander', FID: 'F0000002', Name: 'Testeur 2' }), 'F0000002');
  assert.equal(commanderIdOf({ event: 'LoadGame', Commander: 'Testeur 2' }), 'nom:Testeur 2', 'sans FID : le nom');
  assert.equal(commanderIdOf({ event: 'Commander', Name: ' Testeur ' }), 'nom:Testeur');
  assert.equal(commanderIdOf({ event: 'LoadGame', FID: '../x', Commander: 'Testeur' }), 'nom:Testeur', 'FID illisible : le nom');
  assert.equal(commanderIdOf({ event: 'LoadGame' }), null);
  assert.equal(commanderIdOf({ event: 'Loadout', FID: 'F0000001' }), null, 'seuls LoadGame et Commander disent le commandant');
  for (const ok of ['F0000001', 'nom:Testeur 2']) assert.equal(isCommanderId(ok), true, ok);
  for (const ko of [null, '', 'nom:', '../x', 'nom:a\nb', 42, `nom:${'x'.repeat(61)}`]) assert.equal(isCommanderId(ko), false, String(ko));
});

test('suivi : chaque événement a le commandant chargé à ce moment-là ; le plus vu, puis le dernier à égalité', () => {
  const tr = new CommanderTracker();
  assert.equal(tr.see({ event: 'Fileheader' }), null);
  assert.equal(tr.single(), true, 'aucun commandant : seul');
  assert.equal(tr.see(loadGame(UN)), 'F0000001');
  assert.equal(tr.see({ event: 'Loadout', ShipID: 1 }), 'F0000001');
  assert.equal(tr.single(), true);
  tr.see(loadGame(UN));
  assert.equal(tr.see({ event: 'Commander', FID: 'F0000002', Name: 'Testeur 2' }), 'F0000002');
  assert.equal(tr.see(loadGame(DEUX)), 'F0000002');
  assert.equal(tr.single(), false);
  assert.deepEqual(tr.known().sort(), ['F0000001', 'F0000002']);
  assert.equal(tr.mostSeen(), 'F0000001', 'deux lancements contre un');
  tr.see(loadGame(DEUX));
  assert.equal(tr.mostSeen(), 'F0000002', 'à égalité : le dernier lancé');
  // Note du lecteur des journaux : elle prime
  const noted = { event: 'Loadout', [COMMANDER]: 'F0000001' };
  assert.equal(tr.see(noted), 'F0000001');
  assert.equal(mostSeen(new Map()), null);
});

test('note du commandant : invisible pour JSON et Object.keys, gardée sur une copie réduite', () => {
  const ev = { event: 'Loadout', ShipID: 1 };
  ev[COMMANDER] = 'F0000002';
  assert.equal(commanderOf(ev), 'F0000002');
  assert.equal(JSON.stringify(ev).includes('F0000002'), false, 'le FID ne part jamais avec un événement écrit ou envoyé');
  assert.deepEqual(Object.keys(ev), ['event', 'ShipID']);
  assert.equal(commanderOf(keepCommander(ev, { event: 'Loadout' })), 'F0000002');
  assert.equal(commanderOf({ event: 'Loadout' }), null);
  assert.equal(shipKey('F0000001', 1) === shipKey('F0000002', 1), false, 'même numéro, deux vaisseaux');
});

test('donnée d’avant les commandants (sans commandant) : à lui tant qu’un seul commandant est connu, sinon à personne', () => {
  assert.equal(belongsTo('F0000001', 'F0000001', false), true);
  assert.equal(belongsTo('F0000001', 'F0000002', true), false, 'la donnée d’un autre commandant, jamais');
  assert.equal(belongsTo(null, 'F0000001', true), true, 'un seul commandant : elle est la sienne');
  assert.equal(belongsTo(null, 'F0000001', false), false, 'deux commandants : pas encore rattachée, à personne');
  assert.equal(belongsTo(null, null, false), true, 'commandant inconnu');
});

test('lecteur des journaux : historique et direct notés du commandant chargé ; le plus vu exposé', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-cmdr-'));
  const svc = new JournalService();
  svc.addInterest(['Loadout']);
  try {
    // Deux séances du compte principal, puis une du second compte, sur le même dossier
    fs.writeFileSync(path.join(dir, 'Journal.2026-11-07T100000.01.log'), [
      line({ timestamp: '2026-11-07T10:00:00Z', event: 'Fileheader', part: 1, gameversion: '4.1.0.100', build: 'r1' }),
      line({ timestamp: '2026-11-07T10:00:01Z', event: 'Commander', FID: 'F0000001', Name: 'Testeur' }),
      line({ timestamp: '2026-11-07T10:00:02Z', ...loadGame(UN), gameversion: '4.1.0.100' }),
      line({ timestamp: '2026-11-07T10:00:03Z', event: 'Loadout', Ship: 'anaconda', ShipID: 1, Modules: [] }),
    ].join(''));
    fs.writeFileSync(path.join(dir, 'Journal.2026-11-07T110000.01.log'), [
      line({ timestamp: '2026-11-07T11:00:00Z', event: 'Fileheader', part: 1, gameversion: '4.1.0.100', build: 'r1' }),
      line({ timestamp: '2026-11-07T11:00:01Z', event: 'Commander', FID: 'F0000001', Name: 'Testeur' }),
      line({ timestamp: '2026-11-07T11:00:02Z', ...loadGame(UN), gameversion: '4.1.0.100' }),
    ].join(''));
    const actif = path.join(dir, 'Journal.2026-11-07T120000.01.log');
    fs.writeFileSync(actif, [
      line({ timestamp: '2026-11-07T12:00:00Z', event: 'Fileheader', part: 1, gameversion: '4.1.0.100', build: 'r1' }),
      line({ timestamp: '2026-11-07T12:00:01Z', event: 'Commander', FID: 'F0000002', Name: 'Testeur 2' }),
      line({ timestamp: '2026-11-07T12:00:02Z', ...loadGame(DEUX, { Ship: 'CobraMkIII' }), gameversion: '4.1.0.100' }),
      line({ timestamp: '2026-11-07T12:00:03Z', event: 'Loadout', Ship: 'cobramkiii', ShipID: 1, Modules: [] }),
    ].join(''));
    let history = null;
    svc.on('ready', (r) => { history = r.history; });
    await svc.start(dir);
    svc.stop();
    const loadouts = history.filter((ev) => ev.event === 'Loadout');
    assert.deepEqual(loadouts.map((ev) => [ev.Ship, commanderOf(ev)]), [['anaconda', 'F0000001'], ['cobramkiii', 'F0000002']]);
    assert.equal(svc.commander(), 'F0000002');
    assert.equal(svc.mostSeenCommander(), 'F0000001', 'deux lancements contre un');
    assert.equal(svc.singleCommander(), false);
    // En direct : le compte principal revient
    const live = [];
    svc.on('event', (ev) => live.push(ev));
    fs.appendFileSync(actif, [
      line({ timestamp: '2026-11-07T12:30:00Z', event: 'Commander', FID: 'F0000001', Name: 'Testeur' }),
      line({ timestamp: '2026-11-07T12:30:01Z', ...loadGame(UN) }),
      line({ timestamp: '2026-11-07T12:30:02Z', event: 'Loadout', Ship: 'anaconda', ShipID: 1, Modules: [] }),
    ].join(''));
    svc.readNewLines();
    assert.deepEqual(live.map((ev) => commanderOf(ev)), ['F0000001', 'F0000001', 'F0000001']);
    assert.equal(svc.commander(), 'F0000001');
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('état du jeu : commandant chargé exposé (FID, sinon nom), jamais dans l’état envoyé à l’interface', () => {
  const g = new GameState();
  assert.equal(g.commanderId, null);
  g.applyEvent(loadGame(UN));
  assert.equal(g.commanderId, 'F0000001');
  assert.equal(g.snapshot().commander, 'Testeur');
  g.applyEvent({ event: 'Commander', Name: 'Testeur 2' });
  assert.equal(g.commanderId, 'nom:Testeur 2', 'sans FID : le nom');
  g.applyEvent({ event: 'Loadout', Ship: 'cobramkiii', ShipID: 1, [COMMANDER]: 'F0000002' });
  assert.equal(g.commanderId, 'F0000002', 'note du lecteur des journaux');
  assert.equal(JSON.stringify(g.snapshot()).includes('F000000'), false, 'aucun FID dans l’état diffusé');
  clearTimeout(g.changeTimer);
});
