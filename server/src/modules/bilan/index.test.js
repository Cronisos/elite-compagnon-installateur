// Module Bilans (index.js) en direct : changements de mode, fenêtre « bilan du mode », abandon d'une session plantée.
// Horloge simulée (mock.timers) ; données dans un dossier temporaire (ELITE_DATA_DIR), jamais celles du joueur.

import { test, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'bilan-test-'));
process.env.ELITE_DATA_DIR = dossier;
const { default: bilanModule } = await import('./index.js');
after(() => fs.rmSync(dossier, { recursive: true, force: true }));

const T = (h, m = 0) => Date.UTC(2026, 10, 10, h, m);
const iso = (t) => new Date(t).toISOString();
const lireReperes = () => JSON.parse(fs.readFileSync(path.join(dossier, 'bilan-modes.json'), 'utf8'));

async function monter() {
  const routes = {};
  const journal = new EventEmitter();
  journal.addInterest = () => {};
  const fenetres = [];
  let changer = null;
  const overlay = { mode: () => null, onMode: (fn) => { changer = fn; }, setExtra() {} };
  const router = { get: (p, fn) => { routes[p] = fn; }, post: (p, fn) => { routes[p] = fn; } };
  const broadcast = (type, data) => { if (type === 'bilan:fenetre') fenetres.push(data); };
  await bilanModule.register({ router, journal, broadcast, overlay });
  const sessions = () => {
    let corps;
    routes['/sessions']({}, { json: (x) => { corps = x; } });
    return corps.sessions;
  };
  return { journal, fenetres, sessions, mode: (m) => changer(m) };
}

test('2 h 30 de minage sans événement compté : le changement de mode donne son bilan, et survit au redémarrage', async (t) => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: T(20) });
  t.after(() => mock.timers.reset());
  const app = await monter();
  const historique = [{ event: 'LoadGame', timestamp: iso(T(20)), Credits: 1_000_000 }];
  app.journal.emit('ready', { history: historique });
  app.journal.emit('event', { event: 'FSDJump', timestamp: iso(T(20, 10)), JumpDist: 8 });
  mock.timers.setTime(T(20, 15));
  app.mode('shipmining');
  // Du minage (événements non comptés) jusqu'à 20 h 40, puis seulement Status.json (le jeu tourne, le journal se tait) :
  // 2 h 10 sans journal au changement de mode, plus que ABANDON_MS ; seul Status.json dit que le jeu tourne
  for (let m = 20; m <= 165; m += 5) {
    mock.timers.setTime(T(20) + m * 60_000);
    if (m <= 40) app.journal.emit('event', { event: m % 10 ? 'ProspectedAsteroid' : 'MiningRefined', timestamp: iso(Date.now()) });
    app.journal.emit('status', { timestamp: iso(Date.now()), Flags: 0 });
  }
  mock.timers.setTime(T(22, 50));
  app.mode('commerce');
  assert.equal(app.fenetres.length, 1, 'bilan du mode de minage montré');
  assert.equal(app.fenetres[0].mode, 'shipmining');
  assert.equal(app.fenetres[0].duree, 155 * 60_000);
  const [courante] = app.sessions();
  assert.equal(courante.enCours, true);
  assert.deepEqual(courante.modes.map((m) => m.mode), ['shipmining', 'commerce']);
  assert.equal(courante.fin, iso(T(22, 50)));

  // Redémarrage du serveur : l'historique ne contient que LoadGame et FSDJump, le repère garde le signe de vie
  assert.equal(lireReperes().at(-1).vu, iso(T(22, 45)));
  const relance = await monter();
  relance.journal.emit('ready', { history: [...historique, { event: 'FSDJump', timestamp: iso(T(20, 10)), JumpDist: 8 }] });
  assert.deepEqual(relance.sessions()[0].modes.map((m) => m.mode), ['shipmining', 'commerce']);
});

test('jeu planté hier soir : la session n’est plus « en cours », un mode choisi aujourd’hui ne lui va pas', async (t) => {
  fs.rmSync(path.join(dossier, 'bilan-modes.json'), { force: true });
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: T(20) });
  t.after(() => mock.timers.reset());
  const app = await monter();
  app.journal.emit('ready', { history: [{ event: 'LoadGame', timestamp: iso(T(20)), Credits: 1_000_000 }, { event: 'FSDJump', timestamp: iso(T(21)), JumpDist: 8 }] });
  mock.timers.setTime(T(21, 10));
  assert.equal(app.sessions()[0].enCours, true);
  mock.timers.setTime(T(40)); // le lendemain, 16 h, jeu pas encore lancé
  assert.equal(app.sessions()[0].enCours, false, 'interrompue');
  app.mode('combat');
  assert.deepEqual(app.sessions()[0].modes, []);
  assert.equal(app.fenetres.length, 0);
  assert.equal(lireReperes().at(-1).vu, undefined, 'pas de signe de vie pour une session abandonnée');
});
