// Mode de jeu de l'overlay (core/overlay.js), sans jamais lancer Electron (ELITE_NO_OVERLAY) : remise à zéro des
// sessions au changement de mode, remise d'un état d'avant sans remise à zéro (Annuler une bascule), choix noté.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-overlay-'));
process.env.ELITE_DATA_DIR = DATA;
process.env.ELITE_NO_OVERLAY = '1';
process.on('exit', () => fs.rmSync(DATA, { recursive: true, force: true }));
// Choix enregistré par une version précédente, avec des valeurs à écarter (et `session`, champ abandonné : aucune
// décision ne le lisait)
fs.writeFileSync(path.join(DATA, 'overlay.json'), JSON.stringify({
  mode: 'combat', glance: true, pages: ['combat', 'glance', 'constructor', '../x'], activity: 'combat',
  choice: { shipId: 43, session: '2026-11-07T08:14:17Z', kind: 'menu', at: '2026-11-07T08:20:00.000Z' },
}));
const o = await import('./overlay.js');
const { MAX_SHIP_ID } = await import('./shipRoles.js');

test('relu au démarrage : mode, fenêtres valides seulement, choix', () => {
  assert.deepEqual(o.overlayState(), { mode: 'combat', glance: true, pages: ['combat', 'glance'], installed: false, disabled: true });
  assert.deepEqual(o.overlayChoice(), { shipId: 43, kind: 'menu', at: '2026-11-07T08:20:00.000Z' });
});

test('choix : seulement une forme connue (vaisseau, sorte, heure) ; numéro borné comme les rôles (MAX_SHIP_ID)', () => {
  assert.deepEqual(o.cleanChoice({ shipId: 9, session: '2026-11-07T08:14:17Z', kind: 'bascule', at: '2026-11-07T08:15:00.000Z' }), { shipId: 9, kind: 'bascule', at: '2026-11-07T08:15:00.000Z' }, 'la partie n’est plus notée');
  assert.deepEqual(o.cleanChoice({ shipId: 4293000002, kind: 'annuler', at: 12 }), { shipId: null, kind: 'annuler', at: null });
  assert.equal(o.cleanChoice({ shipId: MAX_SHIP_ID, kind: 'menu' }).shipId, MAX_SHIP_ID);
  assert.equal(o.cleanChoice({ shipId: MAX_SHIP_ID + 1, kind: 'menu' }).shipId, null);
  assert.equal(o.cleanChoice({ shipId: 9, kind: 'menu' }).at, null, 'ancien fichier, sans heure');
  for (const c of [null, [], 'menu', { kind: 'autre' }, { kind: '__proto__' }, { shipId: 1 }]) assert.equal(o.cleanChoice(c), null);
  // Commandant du vaisseau (audit M7) : gardé s'il est lisible, sinon le choix reste sans commandant
  assert.deepEqual(o.cleanChoice({ shipId: 1, commander: 'F0000002', kind: 'menu', at: '2026-11-07T08:15:00.000Z' }), { shipId: 1, commander: 'F0000002', kind: 'menu', at: '2026-11-07T08:15:00.000Z' });
  assert.deepEqual(o.cleanChoice({ shipId: 1, commander: 'nom:Testeur 2', kind: 'menu' }).commander, 'nom:Testeur 2');
  for (const commander of ['../x', 42, { a: 1 }, '']) assert.equal(Object.hasOwn(o.cleanChoice({ shipId: 1, commander, kind: 'menu' }), 'commander'), false, String(commander));
});

test('changer de mode remet la session du nouveau à zéro ; remettre l’état d’avant, non', () => {
  const resets = [];
  o.onOverlayMode((m) => resets.push(m));
  const avant = o.overlaySnapshot();
  o.showOverlay({ mode: 'waypoints', glance: true, pages: ['waypoints', 'glance'] }, { choice: { shipId: 43, kind: 'bascule' } });
  assert.deepEqual(resets, ['waypoints']);
  assert.equal(o.overlayChoice().kind, 'bascule');
  o.restoreOverlay(avant, { choice: { shipId: 43, kind: 'annuler' } });
  assert.deepEqual(resets, ['waypoints'], 'Combat retrouvé sans remise à zéro');
  assert.equal(o.overlayMode(), 'combat');
  assert.equal(o.overlayChoice().kind, 'annuler');
  // L'activité est bien celle d'avant : rouvrir Minage Rhino est de nouveau un changement
  o.showOverlay({ mode: 'waypoints', glance: false, pages: ['waypoints'] });
  assert.deepEqual(resets, ['waypoints', 'waypoints']);
  // Sans choix donné, le dernier reste
  assert.equal(o.overlayChoice().kind, 'annuler');
  // Masquer puis réafficher le même mode : pas un changement
  o.showOverlay({ mode: null, glance: false, pages: [] });
  o.showOverlay({ mode: 'waypoints', glance: false, pages: ['waypoints'] });
  assert.deepEqual(resets, ['waypoints', 'waypoints']);
  assert.equal(fs.readFileSync(path.join(DATA, 'overlay.json'), 'utf8').includes('"pages": ['), false, 'overlay coupé : rien d’écrit');
});

test('overlay quitté par le joueur (Alt+Maj+Q) : plus aucune fenêtre, le mode et l’activité restent, choix noté', () => {
  o.showOverlay({ mode: 'waypoints', glance: true, pages: ['waypoints', 'waypoints-list', 'glance'] });
  const resets = [];
  o.onOverlayMode((m) => resets.push(m));
  const etat = o.overlayClosed({ choice: { shipId: 43, kind: 'fermeture', at: '2026-11-08T09:10:00.000Z' } });
  assert.deepEqual(etat, { mode: 'waypoints', glance: false, pages: [], installed: false, disabled: true });
  const { since, ...instantane } = o.overlaySnapshot();
  assert.deepEqual(instantane, { mode: 'waypoints', glance: false, pages: [], activity: 'waypoints' }, 'Annuler ne rouvrira rien');
  assert.equal(since, o.overlayChangedAt(), 'depuis la fermeture : l’heure du dernier changement voulu');
  assert.equal(o.overlayChoice().kind, 'fermeture');
  assert.deepEqual(o.cleanChoice({ shipId: 5, kind: 'fermeture' }), { shipId: 5, kind: 'fermeture', at: null });
  assert.deepEqual(resets, [], 'aucune session remise à zéro');
  // Rouvrir le même mode n'est pas un changement d'activité
  o.showOverlay({ mode: 'waypoints', glance: false, pages: ['waypoints'] });
  assert.deepEqual(resets, []);
});
