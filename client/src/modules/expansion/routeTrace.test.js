// Tracé de la carte de la route : une vague jusqu'à 12 systèmes, sinueuse au-delà.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAR_LIGNE, W, poseVaisseau, trace } from './routeTrace.js';

test('jusqu’à 12 systèmes : la vague d’origine, de gauche à droite', () => {
  const g = trace(12);
  assert.equal(g.sinueux, false);
  assert.equal(g.H, 270);
  assert.deepEqual(g.curve(0).map(Math.round), [75, 148]);
  assert.equal(Math.round(g.curve(1)[0]), 1125);
  assert.equal(trace(1).sinueux, false);
});

test('route de 65 systèmes : 7 lignes, aller puis retour, tout dans la carte, sans saut', () => {
  const n = 65;
  const g = trace(n);
  assert.equal(g.sinueux, true);
  const at = (k) => g.curve(k / (n - 1));
  // Première ligne vers la droite, deuxième vers la gauche, juste en dessous
  assert.ok(at(1)[0] > at(0)[0] && at(9)[0] > at(8)[0]);
  assert.ok(at(11)[0] < at(10)[0], 'la deuxième ligne revient vers la gauche');
  assert.ok(Math.abs(at(10)[0] - at(9)[0]) < 1 && at(10)[1] > at(9)[1] + 100, 'le demi-tour descend d’une ligne au même bord');
  assert.ok(at(20)[0] < at(21)[0], 'la troisième repart vers la droite');
  // Systèmes voisins d'une même ligne : assez écartés pour leurs noms
  assert.ok(Math.abs(at(1)[0] - at(0)[0]) > 100);
  // Tout tient dans la carte, et la courbe est continue (pas de saut entre deux points voisins)
  let avant = g.curve(0);
  for (let i = 1; i <= 4000; i++) {
    const p = g.curve(i / 4000);
    assert.ok(p[0] >= 30 && p[0] <= W - 30 && p[1] >= 60 && p[1] <= g.H - 100, `point ${i} hors de la carte`);
    assert.ok(Math.hypot(p[0] - avant[0], p[1] - avant[1]) < 4, `saut au point ${i}`);
    avant = p;
  }
  assert.equal(Math.ceil(n / PAR_LIGNE), 7);
  assert.equal(g.H, 95 + 6 * 140 + 125);
  // Pente : vers la droite sur la première ligne, vers la gauche sur la deuxième, vers le bas au milieu du demi-tour
  assert.ok(Math.abs(g.slope(4.5 / (n - 1))) < 5);
  assert.ok(Math.abs(Math.abs(g.slope(14.5 / (n - 1))) - 180) < 5);
  assert.ok(Math.abs(g.slope(9.5 / (n - 1)) - 90) < 5);
});

test('vaisseau : retourné en miroir quand la route revient vers la gauche, jamais tête en bas', () => {
  assert.deepEqual(poseVaisseau(10), { miroir: false, angle: 10 });
  assert.deepEqual(poseVaisseau(-30), { miroir: false, angle: -30 });
  assert.deepEqual(poseVaisseau(180), { miroir: true, angle: 0 });
  assert.deepEqual(poseVaisseau(170), { miroir: true, angle: 10 });
  assert.deepEqual(poseVaisseau(-170), { miroir: true, angle: -10 });
  assert.deepEqual(poseVaisseau(90), { miroir: false, angle: 90 });
});
