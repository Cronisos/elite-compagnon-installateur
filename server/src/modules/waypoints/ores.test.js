import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTRES_MINERAIS, nomMinerai, oreOf } from './ores.js';

const ORES = ['Iridium', 'Platine', 'Or', 'Rhodplumsite', 'Palladium', 'Osmium', 'Argent', 'Uranium', 'Titane', 'Hématite', 'Magnésite'];
const ore = (label, notes = '') => oreOf({ label, notes }, ORES);

test('minerai d’un repère : le nom d’abord, fautes de frappe comprises', () => {
  assert.equal(ore('Iridium'), 'Iridium');
  assert.equal(ore('iridium'), 'Iridium');
  assert.equal(ore('Iridiul + 3 or', 'raffiné : Iridium, Or'), 'Iridium');
  assert.equal(ore('Rhodplumsite'), 'Rhodplumsite');
  assert.equal(ore('Synuefe GA-I b57-6 3 · 31 oct., 16:10 rho', '7 emplacements'), 'Rhodplumsite');
  assert.equal(ore('3 or'), 'Or');
  assert.equal(ore('hematite riche'), 'Hématite');
});

test('autre minerai (« Autre… » du tiroir) : reconnu à son nom entier, sans le confondre avec un courant', () => {
  const autre = (label) => oreOf({ label, notes: '' }, ORES, AUTRES_MINERAIS);
  assert.equal(autre('Tritium'), 'Tritium');
  assert.equal(autre('tritium'), 'Tritium');
  assert.equal(autre('Uraninite'), 'Uraninite'); // pas Uranium
  assert.equal(autre('Opales du vide'), 'Opales du Vide');
  assert.equal(autre('Platine'), 'Platine');
  assert.equal(autre('3 or'), 'Or');
  assert.equal(autre('trit'), null); // un bout de nom ne suffit pas pour les autres
});

test('minerai d’un repère : sinon le premier raffiné des notes, jamais le reste des notes', () => {
  assert.equal(ore('Iniirum', '7 emplacements sur la planète · raffiné : Iridium'), 'Iridium');
  assert.equal(ore('pas rentable le 12', '25 emplacements sur la planète · raffiné : Hématite, Titane'), 'Hématite');
  assert.equal(ore('Bon coin', '25 emplacements sur la planète'), null);
  assert.equal(ore('⛏ Fin du dernier minage', 'Repère automatique : ta dernière tonne raffinée sur cette planète'), null);
});

test('minerais planétaires du Rhino (marché du jeu, 12 nov. 2026) : proposés et reconnus par leur nom exact', () => {
  for (const n of ['Dunite de périclase', 'Thortveitite', 'Diamant', 'Saphir', 'Rubis', 'Hélium 3', 'Bastanäsite', 'Opale du vide']) {
    assert.ok(AUTRES_MINERAIS.includes(n), n);
  }
  assert.equal(oreOf({ label: 'dunite de périclase' }, ORES, AUTRES_MINERAIS), 'Dunite de périclase');
});

test('nom de minerai tapé à la main : nettoyé, ou refusé si ce n’en est pas un', () => {
  assert.equal(nomMinerai('  dunite   de périclase '), 'Dunite de périclase');
  assert.equal(nomMinerai('Hélium 3'), 'Hélium 3');
  assert.equal(nomMinerai('Peroxyde d’hydrogène'), 'Peroxyde d’hydrogène');
  for (const t of ['Iridiul + 3 or', '3 or', 'x', '', null, 'a'.repeat(41)]) assert.equal(nomMinerai(t), null, String(t));
});
