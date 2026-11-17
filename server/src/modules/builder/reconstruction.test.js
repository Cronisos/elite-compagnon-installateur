// Temps de reconstruction du bouclier effondré (stats.js, tempsReconstruction) : sans données de référence.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempsReconstruction } from './stats.js';

const proche = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);

test('0 pip SYS, condensateur qui suffit : temps calculé, pas « — » (0 ÷ 0)', () => {
  // 200 MJ à reconstruire (moitié de 400) à 4 MJ/s : 50 s ; le condensateur (60 MJ) tient 60 / (4 × 0,25) = 60 s
  const t = tempsReconstruction({ half: 200, brokenRegen: 4, draw: 0.25, sysCap: 60, sysChg: 0 });
  proche(t, 16 + 50);
});

test('0 pip SYS, condensateur trop petit : le bouclier ne revient jamais à 50 %', () => {
  // le condensateur (10 MJ) ne tient que 10 s : 40 MJ reconstruits, puis plus rien sans recharge SYS
  assert.equal(tempsReconstruction({ half: 200, brokenRegen: 4, draw: 0.25, sysCap: 10, sysChg: 0 }), null);
});

test('condensateur vidé puis recharge : phase rapide, puis au rythme de la recharge', () => {
  // consommation 4 × 0,5 − 1 = 1 MJ/s : vide en 20 s (80 MJ faits) ; reste 120 MJ à 1 / 0,5 = 2 MJ/s → 60 s
  const t = tempsReconstruction({ half: 200, brokenRegen: 4, draw: 0.5, sysCap: 20, sysChg: 1 });
  proche(t, 16 + 20 + 60);
});

test('recharge SYS suffisante, sans distributeur ou sans consommation : pleine vitesse', () => {
  proche(tempsReconstruction({ half: 200, brokenRegen: 4, draw: 0.5, sysCap: 20, sysChg: 5 }), 66);
  proche(tempsReconstruction({ half: 200, brokenRegen: 4, draw: 0.5, sysCap: 0, sysChg: 0, distributor: false }), 66);
  proche(tempsReconstruction({ half: 200, brokenRegen: 4, draw: 0, sysCap: 0, sysChg: 0 }), 66);
});

test('pas de régénération après effondrement : null', () => {
  assert.equal(tempsReconstruction({ half: 200, brokenRegen: 0 }), null);
  assert.equal(tempsReconstruction({ half: 200, brokenRegen: undefined }), null);
});
