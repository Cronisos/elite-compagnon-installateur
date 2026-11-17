// Place du vaisseau sur la carte de la route : attente du jeudi, avancée au fil de la semaine, jamais de recul.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRANSIT, partSemaine, placesFleches, positionVaisseau } from './routeTransit.js';

const JEUDI = Date.parse('2026-11-19T07:00:00Z');
const proche = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('part de la semaine : 0 au passage précédent, 1 au suivant, bornée', () => {
  assert.equal(partSemaine(JEUDI, Date.parse('2026-11-12T07:00:00Z')), 0);
  assert.equal(partSemaine(JEUDI, Date.parse('2026-11-15T19:00:00Z')), 0.5);
  assert.equal(partSemaine(JEUDI, JEUDI), 1);
  assert.equal(partSemaine(JEUDI, JEUDI + 1e9), 1);
  assert.equal(partSemaine(JEUDI, 0), 0);
  assert.equal(partSemaine(null, JEUDI), 0);
});

test('en attente du jeudi : le vaisseau a quitté le système complet, sans être arrivé au suivant', () => {
  const last = 11;
  const debut = positionVaisseau({ index: 1, frac: 0, last, enAttente: true, semaine: 0 });
  const milieu = positionVaisseau({ index: 1, frac: 0, last, enAttente: true, semaine: 0.5 });
  const fin = positionVaisseau({ index: 1, frac: 0, last, enAttente: true, semaine: 1 });
  proche(debut, 0);
  proche(milieu, (TRANSIT * 0.5) / last);
  proche(fin, TRANSIT / last);
  assert.ok(fin < 1 / last, 'jamais sur le système suivant avant le passage');
});

test('le passage de semaine ne fait pas reculer le vaisseau ; ensuite il avance avec les mérites', () => {
  const last = 11;
  const veille = positionVaisseau({ index: 1, frac: 0, last, enAttente: true, semaine: 1 });
  const lendemain = positionVaisseau({ index: 1, frac: 0, last, enAttente: false });
  proche(veille, lendemain);
  proche(positionVaisseau({ index: 1, frac: 0.5, last }), (TRANSIT + (1 - TRANSIT) * 0.5) / last);
  proche(positionVaisseau({ index: 1, frac: 1, last }), 1 / last);
  proche(positionVaisseau({ index: 4, frac: 1, last }), 4 / last);
});

test('bords : premier système, route finie, route d’un seul système', () => {
  assert.equal(positionVaisseau({ index: 0, frac: 0.7, last: 11 }), 0);
  assert.equal(positionVaisseau({ index: 12, frac: 0, last: 11 }), 1);
  assert.equal(positionVaisseau({ index: 0, frac: 0.5, last: 0 }), 0);
  assert.equal(positionVaisseau({ index: 3, frac: 9, last: 11 }), 3 / 11, 'avancement borné');
});

test('flèches : entre les deux systèmes, jamais dessus, dans l’ordre', () => {
  const f = placesFleches(1 / 11, 2 / 11);
  assert.equal(f.length, 6);
  assert.ok(f[0] > 1 / 11 && f.at(-1) < 2 / 11);
  assert.deepEqual([...f].sort((a, b) => a - b), f);
});
