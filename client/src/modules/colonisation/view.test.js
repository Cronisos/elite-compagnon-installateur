// Tests de mise en forme du module Colonisation (HUD, liste de courses), sur un chantier d'exemple : pas un vrai
// chantier de l’auteur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deadlineText, etaText, hudCells, hudLine, statusOf, toBuyList, toLocalInput } from './view.js';

const item = (symbol, name, remaining, inHold = 0) => ({ symbol, name, remaining, inHold, toBuy: Math.max(0, remaining - inHold), done: remaining === 0 });
const active = (over = {}) => ({
  reason: 'docked',
  site: {
    label: 'Vaisseau de colonisation · Judson Depot', progress: 0.033023, complete: false, provisional: false, updatedAt: '2026-11-01T20:00:05Z',
    plan: {
      known: true,
      items: [item('steel', 'Acier', 5960, 720), item('titanium', 'Titane', 5471), item('water', 'Eau', 717, 717), item('copper', 'Cuivre', 0)],
      totals: { required: 21803, remaining: 21083, toBuy: 19646, inHold: 1437 },
      trips: 30,
      capacity: 720,
    },
    ...over,
  },
});

test('HUD : avancement, reste, à acheter, trajets ; cases vides sans chantier', () => {
  const cells = hudCells(active());
  assert.deepEqual(cells.map((c) => c.label), ['Avancement', 'Reste', 'À acheter', 'Trajets']);
  assert.equal(cells[0].value, '3,3 %');
  assert.equal(cells[0].sub, 'lu au dépôt');
  assert.equal(cells[1].value, '21 083 t');
  assert.equal(cells[1].sub, 'sur 21 803 t');
  assert.equal(cells[2].sub, '1 437 t en soute');
  assert.equal(cells[3].value, '30');
  assert.ok(hudCells(null).every((c) => c.value === '—'));
});

test('ligne du bas et liste de courses : le plus à acheter d’abord, la soute déduite', () => {
  assert.equal(hudLine(active()), 'Titane 5 471 t · Acier 5 240 t');
  assert.deepEqual(toBuyList(active().site.plan.items).map((i) => i.symbol), ['titanium', 'steel']);
  assert.equal(hudLine(null), 'aucun chantier suivi : amarre-toi à un dépôt de construction');
  // Le HUD met déjà le nom du chantier devant cette ligne : il n'y est pas répété
  assert.equal(hudLine(active({ complete: true })), 'chantier terminé');
  assert.equal(hudLine(active({ plan: { known: false, items: [], totals: {} } })), 'besoins pas encore lus');
});

test('HUD au premier amarrage, besoins pas encore lus : ni « lu au dépôt » ni « rien en soute »', () => {
  const first = active({ progress: null, updatedAt: null, plan: { known: false, items: [], totals: { required: null, remaining: null, toBuy: null, inHold: null }, trips: null, capacity: 720 } });
  const cells = hudCells(first);
  assert.equal(cells[0].sub, 'pas encore lu');
  assert.equal(cells[1].value, '?');
  assert.equal(cells[2].value, '?');
  assert.equal(cells[2].sub, 'besoins inconnus');
  assert.ok(!hudLine(first).includes('Judson Depot'));
});

test('statut, échéance, temps restant, champ de date', () => {
  assert.equal(statusOf({ complete: true }).label, 'Terminé');
  assert.equal(statusOf({ failed: true }).tone, 'bad');
  assert.equal(statusOf({ known: false }).label, 'Besoins inconnus');
  assert.equal(statusOf({ known: true, provisional: true }).label, 'En cours · estimé');
  assert.equal(deadlineText({ daysLeft: 6.5, verdict: 'serré' }), 'dans 6,5 j · serré');
  assert.equal(deadlineText({ daysLeft: 3, verdict: null }), 'dans 3 j · durée de boucle inconnue');
  assert.equal(deadlineText({ daysLeft: -1, verdict: 'dépassée' }), 'échéance dépassée');
  assert.equal(etaText({ playMinutes: 600, evenings: 3.3, hoursPerEvening: 3 }), '10 h 00 de jeu, 3,3 soirées de 3 h');
  assert.equal(etaText(null), null);
  assert.match(toLocalInput('2026-11-21T20:00:00.000Z'), /^2026-11-2\dT\d\d:00$/);
  assert.equal(toLocalInput(null), '');
  assert.equal(toLocalInput('pas une date'), '');
});
