// Bilans de session (bilanVue.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chiffres, credits, ecart, nomMode } from './bilanVue.js';

test('crédits signés, écart à la moyenne, nom du mode', () => {
  assert.equal(credits(3_000_000), '+3,0 M cr');
  assert.equal(credits(-120_000), '−120 k cr');
  assert.equal(credits(null), '—');
  assert.equal(ecart(125, 100), '+25 %');
  assert.equal(ecart(90, 100), '−10 %');
  assert.equal(ecart(90, 0), null);
  assert.match(nomMode('rescue'), /Sauvetage/);
  assert.equal(nomMode('inconnu'), 'inconnu');
});

test('chiffres d’un bilan, avec la comparaison aux sessions passées', () => {
  const c = chiffres({ duree: 7_200_000, gain: 3_000_000, gainHeure: 1_500_000, merites: 70, meritesHeure: 35, materiauxTotal: 4, materiaux: [3, 0, 0, 0, 1], morts: 1, sauts: 2, distance: 25 }, { gainHeure: 1_000_000, meritesHeure: 35 });
  assert.deepEqual(c.map((x) => x.label), ['Durée', 'Crédits', 'Mérites', 'Matériaux', 'Morts', 'Sauts']);
  assert.equal(c[0].valeur, '2 h 00');
  assert.equal(c[1].sous, "+1,5 M cr/h · +50 % vs d'habitude");
  assert.equal(c[3].sous, 'G1 3 · G5 1');
});
