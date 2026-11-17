// overlay.json écrit pour de vrai (mode, fenêtres, activité, choix, heure du dernier changement voulu), puis relu par un
// second chargement du module, comme après un redémarrage du serveur. Constat du 9 nov. : overlay.test.js tourne overlay
// coupé (ELITE_NO_OVERLAY), où rien n'est écrit ; retirer le choix de l'écriture laissait tout au vert. Ici, overlay
// présent, mais sans jamais lancer Electron : le lancement est remplacé (setOverlayLauncher), et child_process.spawn
// est piégé par sécurité.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-overlay-persist-'));
process.env.ELITE_DATA_DIR = DATA;
delete process.env.ELITE_NO_OVERLAY; // l'écriture n'a lieu qu'overlay présent : c'est elle qu'on vérifie
process.on('exit', () => fs.rmSync(DATA, { recursive: true, force: true }));
// Aucun processus ne doit partir d'ici, même si le remplacement du lancement venait à manquer
childProcess.spawn = () => {
  throw new Error('overlay.persist.test.js : aucun overlay réel ne doit être lancé');
};
syncBuiltinESMExports();

const o = await import('./overlay.js');
const lances = [];
// Les ordres du même instant partent en un lancement, LAUNCH_DELAY_MS plus tard, avec leur heure (--at) : on attend, et
// on compare la liste des fenêtres (premier argument) ; --if-running dit un ordre qui ne fait que fermer
const attendre = () => new Promise((r) => setTimeout(r, o.LAUNCH_DELAY_MS + 60));
const sansHeure = (args) => args && args.filter((a) => !a.startsWith('--at='));
o.setOverlayLauncher((args) => lances.push(args));
const FICHIER = path.join(DATA, 'overlay.json');
const lu = () => JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
let n = 0;
/** Le module chargé de nouveau, à neuf : ce que trouve un serveur qui redémarre. */
const redemarrer = () => import(`./overlay.js?redemarrage=${(n += 1)}`);

test('mode, fenêtres, activité, choix et heure du changement : écrits, et relus après un redémarrage du serveur', async () => {
  const avant = Date.now();
  const choix = { shipId: 43, kind: 'bascule', at: '2026-11-08T10:00:00.000Z' };
  o.showOverlay({ mode: 'waypoints', glance: true, pages: ['waypoints', 'waypoints-list', 'glance'] }, { choice: choix });
  await attendre();
  assert.deepEqual(sansHeure(lances.at(-1)), ['--only=waypoints,waypoints-list,glance'], 'ce que l’overlay recevrait');
  const f = lu();
  assert.deepEqual({ mode: f.mode, glance: f.glance, pages: f.pages, activity: f.activity, choice: f.choice }, {
    mode: 'waypoints', glance: true, pages: ['waypoints', 'waypoints-list', 'glance'], activity: 'waypoints', choice: choix,
  });
  assert.ok(Date.parse(f.changedAt) >= avant, 'heure du changement voulu');
  const r = await redemarrer();
  assert.deepEqual(r.overlayState(), { ...o.overlayState() });
  assert.deepEqual(r.overlayChoice(), choix, 'le choix tient après un redémarrage : aucune bascule ne l’écrasera');
  assert.equal(r.overlaySnapshot().activity, 'waypoints');
  assert.equal(r.overlayChangedAt(), o.overlayChangedAt());
});

test('Annuler (restoreOverlay) : état d’avant, son activité et le choix « annuler » écrits et relus', async () => {
  const avant = o.overlaySnapshot();
  o.showOverlay({ mode: 'combat', glance: false, pages: ['combat'] }, { choice: { shipId: 26, kind: 'bascule', at: '2026-11-08T10:05:00.000Z' } });
  o.restoreOverlay(avant, { choice: { shipId: 26, kind: 'annuler', at: '2026-11-08T10:06:00.000Z' } });
  const r = await redemarrer();
  assert.deepEqual(r.overlayChoice(), { shipId: 26, kind: 'annuler', at: '2026-11-08T10:06:00.000Z' });
  assert.equal(r.overlayMode(), 'waypoints');
  assert.equal(r.overlaySnapshot().activity, 'waypoints');
});

test('overlay quitté (Alt+Maj+Q) : plus aucune fenêtre, le mode reste, choix « fermeture » et heure de la fermeture relus', async () => {
  o.showOverlay({ mode: 'waypoints', glance: true, pages: ['waypoints', 'glance'] }, { choice: { shipId: 43, kind: 'menu', at: '2026-11-08T10:10:00.000Z' } });
  await attendre();
  const lancesAvant = lances.length;
  const ferme = Date.parse('2026-11-08T10:20:00.000Z');
  o.overlayClosed({ choice: { shipId: 43, kind: 'fermeture', at: '2026-11-08T10:20:00.000Z' }, at: ferme });
  await attendre();
  assert.equal(lances.length, lancesAvant, 'rien n’est lancé');
  assert.deepEqual({ mode: lu().mode, pages: lu().pages, glance: lu().glance }, { mode: 'waypoints', pages: [], glance: false });
  const r = await redemarrer();
  assert.deepEqual(r.overlayState().pages, []);
  assert.equal(r.overlayMode(), 'waypoints');
  assert.equal(r.overlayChoice().kind, 'fermeture');
  assert.equal(r.overlayChangedAt(), ferme);
});

test('fenêtres redemandées telles quelles (reshow) : relancées, mais pas un changement voulu (heure et choix inchangés)', async () => {
  o.showOverlay({ mode: 'combat', glance: false, pages: ['combat'] }, { choice: { shipId: 26, kind: 'menu', at: '2026-11-08T10:30:00.000Z' } });
  const heure = o.overlayChangedAt();
  await attendre();
  const lancesAvant = lances.length;
  o.showOverlay({ mode: 'combat', glance: false, pages: ['combat'] }, { silent: true, reshow: true });
  await attendre();
  assert.deepEqual(sansHeure(lances.at(-1)), ['--only=combat'], 'sans --if-running : il peut relancer l’overlay');
  assert.equal(lances.length, lancesAvant + 1, 'l’overlay est relancé s’il s’était arrêté');
  assert.equal(o.overlayChangedAt(), heure);
  assert.equal((await redemarrer()).overlayChangedAt(), heure);
  assert.equal(o.overlayChoice().kind, 'menu');
  // Un changement voulu, lui, avance l'heure
  o.showOverlay({ mode: 'combat', glance: true, pages: ['combat', 'glance'] });
  assert.ok(o.overlayChangedAt() > heure);
});

test('fenêtres d’un module (setOverlayExtra) : demandées à l’overlay avec celles du mode, sans être un choix', async () => {
  o.showOverlay({ mode: 'combat', glance: false, pages: ['combat'] }, { choice: { shipId: 26, kind: 'menu', at: '2026-11-08T10:40:00.000Z' } });
  const heure = o.overlayChangedAt();
  o.setOverlayExtra('carrier', true);
  assert.deepEqual(o.overlayLaunchPages(), ['combat', 'carrier']);
  await attendre();
  assert.deepEqual(sansHeure(lances.at(-1)), ['--only=combat,carrier']);
  assert.equal(o.overlayChangedAt(), heure);
  o.setOverlayExtra('carrier', false);
  await attendre();
  assert.deepEqual(sansHeure(lances.at(-1)), ['--only=combat', '--if-running'], 'fermer : jamais un lancement de l’overlay');
});
