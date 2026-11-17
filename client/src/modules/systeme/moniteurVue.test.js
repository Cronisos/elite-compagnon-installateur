import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AMBRE, ROUGE, VERT, couleurCharge, couleurTemp, couleurVram, fraction, go, ligneIa } from './moniteurVue.js';

test('moniteur : Go, couleurs des seuils, ligne de l’IA', () => {
  assert.equal(go(20275), '19,8');
  assert.equal(go(null), '—');
  assert.equal(couleurCharge(50), VERT);
  assert.equal(couleurCharge(80), AMBRE);
  assert.equal(couleurCharge(95), ROUGE);
  assert.equal(couleurVram(900), ROUGE);
  assert.equal(couleurVram(2048), AMBRE);
  assert.equal(couleurVram(8000), VERT);
  assert.equal(couleurTemp(41.05), VERT);
  assert.equal(couleurTemp(86), ROUGE);
  assert.equal(fraction(5, 10), 0.5);
  assert.equal(fraction(15, 10), 1);
  assert.equal(fraction(null, 10), 0);
  assert.equal(ligneIa(null), null);
  assert.equal(ligneIa([]), 'rien de chargé');
  assert.equal(ligneIa([{ nom: 'qwen3.8:27b', vramMo: 17818 }]), 'qwen3.8:27b · 17,4 Go');
});
