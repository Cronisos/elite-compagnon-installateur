// Tests du module Sauvetage : récupérations, livraisons, mérites et soute (séquence réelle du 25 octobre).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RescueState, buildRescue } from './state.js';

const T = (sec) => new Date(Date.UTC(2026, 9, 25, 22, 30, sec)).toISOString();

const october25 = [
  { event: 'LoadGame', timestamp: T(0) },
  { event: 'CollectCargo', timestamp: T(1), Type: 'USSCargoBlackBox', Type_Localised: 'Boîte noire' },
  { event: 'CollectCargo', timestamp: T(2), Type: 'WreckageComponents', Type_Localised: "Débris d'épave" },
  { event: 'CollectCargo', timestamp: T(3), Type: 'gold' },
  { event: 'SearchAndRescue', timestamp: T(13), Name: 'usscargoblackbox', Name_Localised: 'Boîte noire', Count: 2, Reward: 59954 },
  { event: 'PowerplayMerits', timestamp: T(14), MeritsGained: 260 },
  { event: 'SearchAndRescue', timestamp: T(24), Name: 'wreckagecomponents', Name_Localised: "Débris d'épave", Count: 8, Reward: 71206 },
  { event: 'PowerplayMerits', timestamp: T(25), MeritsGained: 2800 },
  { event: 'PowerplayMerits', timestamp: T(26), MeritsGained: 309 },
];

test('livraisons : nombre, récompenses et mérites qui suivent', () => {
  const r = buildRescue(october25).summary();
  assert.equal(r.delivered, 10);
  assert.equal(r.credits, 59954 + 71206);
  assert.equal(r.merits, 260 + 2800 + 309);
  assert.equal(r.recent[0].merits, 3109);
});

test('seules les marchandises de sauvetage comptent comme récupérées', () => {
  assert.equal(buildRescue(october25).summary().collected, 2);
});

test('mérites sans livraison récente : pas comptés ici', () => {
  const r = buildRescue([
    { event: 'SearchAndRescue', timestamp: T(0), Name: 'damagedescapepod', Count: 1, Reward: 8338 },
    { event: 'PowerplayMerits', timestamp: T(11), MeritsGained: 7 },
  ]).summary();
  assert.equal(r.merits, 0);
});

test('soute : seules les marchandises de sauvetage, y compris celles apprises à la livraison', () => {
  const r = buildRescue([{ event: 'SearchAndRescue', timestamp: T(0), Name: 'newrescueitem', Count: 1, Reward: 1 }]);
  const s = r.summary([
    { name: 'occupiedcryopod', label: "Nacelle d'évacuation occupée", count: 3 },
    { name: 'newrescueitem', label: 'X', count: 1 },
    { name: 'gold', label: 'Or', count: 20 },
  ]);
  assert.equal(s.hold.count, 4);
});

test('nacelles larguées : comptées comme perdues', () => {
  const r = buildRescue([{ event: 'EjectCargo', timestamp: T(0), Type: 'occupiedcryopod', Count: 1 }]).summary();
  assert.equal(r.lost, 1);
});

test('un nouveau lancement du jeu ouvre une nouvelle session', () => {
  const r = buildRescue([...october25, { event: 'LoadGame', timestamp: T(40) }]).summary();
  assert.equal(r.delivered, 0);
  assert.equal(r.startedAt, T(40));
});

test('récupérés par type : nacelles, boîtes noires, débris, et ce qui reste en soute', () => {
  const r = buildRescue([
    ...october25.slice(0, 3),
    { event: 'CollectCargo', timestamp: T(4), Type: 'OccupiedCryoPod' },
    { event: 'CollectCargo', timestamp: T(5), Type: 'DamagedEscapePod' },
  ]).summary([{ name: 'occupiedcryopod', label: 'Nacelle occupée', count: 1 }, { name: 'gold', label: 'Or', count: 4 }]);
  assert.deepEqual(r.types.map((t) => [t.key, t.collected, t.hold]), [['pods', 2, 1], ['blackBoxes', 1, 0], ['wreckage', 1, 0]]);
  assert.equal(r.hold.count, 1);
});

test('matériaux ramassés pendant la session : par grade, liste du plus haut grade au plus bas, remis à zéro au lancement', () => {
  const grades = { iron: 1, heatexchangers: 3, imperialshielding: 5 };
  const r = new RescueState((k) => grades[k] ?? null);
  for (const ev of [
    { event: 'LoadGame', timestamp: T(0) },
    { event: 'MaterialCollected', timestamp: T(1), Category: 'Raw', Name: 'iron', Name_Localised: 'Fer', Count: 3 },
    { event: 'MaterialCollected', timestamp: T(2), Category: 'Manufactured', Name: 'HeatExchangers', Name_Localised: 'Échangeurs thermiques', Count: 1 },
    { event: 'MaterialCollected', timestamp: T(3), Category: 'Raw', Name: 'iron', Count: 2 },
    { event: 'MaterialCollected', timestamp: T(4), Category: 'Manufactured', Name: 'imperialshielding', Name_Localised: 'Protection impériale', Count: 1 },
    { event: 'MaterialCollected', timestamp: T(5), Category: 'Encoded', Name: 'inconnu', Count: 2 },
    { event: 'MaterialCollected', timestamp: T(6), Category: 'Raw', Name: 'iron', Count: -4 },
    { event: 'MaterialCollected', timestamp: T(7), Category: 'Raw', Count: 1 },
  ]) r.apply(ev);
  const m = r.summary().materials;
  assert.deepEqual(m.byGrade, [5, 0, 1, 0, 1]);
  assert.equal(m.total, 9, 'le grade inconnu compte dans le total, pas dans une colonne');
  assert.deepEqual(m.items.map((x) => [x.label, x.grade, x.count]), [
    ['Protection impériale', 5, 1], ['Échangeurs thermiques', 3, 1], ['Fer', 1, 5], ['inconnu', null, 2],
  ]);
  r.apply({ event: 'LoadGame', timestamp: T(10) });
  assert.deepEqual(r.summary().materials, { total: 0, byGrade: [0, 0, 0, 0, 0], items: [] });
});
