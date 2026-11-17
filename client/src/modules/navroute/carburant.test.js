// Carburant de l'itinéraire dans la fenêtre en jeu (carburant.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carburantCellule, carburantLigne, etoileSous } from './carburant.js';

test('alerte : le saut qui ne passe pas, ce qui reste, ce qu’il faut', () => {
  const fuel = { level: 2, capacity: 8, scoop: false, known: true, jumps: 1, all: false, alerte: { in: 2, name: 'C', need: 1.15, fuel: 0.85, raison: 'pas de récupérateur de carburant' } };
  const l = carburantLigne(fuel);
  assert.equal(l.alerte, true);
  assert.equal(l.texte, '⚠ Carburant : Le saut 2 (C) ne passe pas : il resterait 0,9 t, il en faut environ 1,2 t (pas de récupérateur de carburant). Fais le plein avant de continuer.');
  assert.equal(carburantCellule(fuel).color, '#ff6b6b');
  assert.equal(carburantCellule(fuel).value, '2 t');
  assert.match(carburantLigne({ ...fuel, alerte: { ...fuel.alerte, in: 1 } }).texte, /^⚠ Carburant : Le prochain saut/);
});

test('sans récupérateur : rappel, étoile récupérable sans effet', () => {
  assert.equal(carburantLigne({ scoop: false, known: true, jumps: 3, all: false, alerte: null }).texte, 'Pas de récupérateur : réservoir pour 3 sauts, ravitaille en station.');
  assert.equal(carburantLigne({ scoop: false, known: true, jumps: 3, all: false, alerte: null }).rouge, true);
  assert.equal(carburantLigne({ scoop: false, known: false, alerte: null }).texte, 'Pas de récupérateur de carburant : ravitaille en station.');
  assert.equal(etoileSous(true, { scoop: false }), 'récupérable, mais pas de récupérateur');
  assert.equal(etoileSous(true, { scoop: true }), 'récupérable');
  assert.equal(etoileSous(false, null), 'non récupérable');
});

test('avec récupérateur et assez de carburant : rien à dire ; portée dans la case', () => {
  assert.equal(carburantLigne({ scoop: true, known: true, jumps: 5, all: true, alerte: null }), null);
  assert.equal(carburantLigne(null), null);
  assert.equal(carburantCellule({ level: 7.94, known: true, all: true }).sub, 'jusqu’au bout');
  assert.equal(carburantCellule({ level: 7.94, known: true, all: false, jumps: 3 }).color, '#ffd24a');
  assert.equal(carburantCellule({ level: null, known: false }).sub, 'conso. connue au 1er saut');
});
