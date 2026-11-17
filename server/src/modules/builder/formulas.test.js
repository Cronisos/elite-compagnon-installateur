// Tests des formules physiques du constructeur (formulas.js) : saut, portée d'un plein, courbe de masse,
// résistances avec rendements décroissants. Valeurs vérifiées à la main ; aucune donnée de référence nécessaire.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jumpLength, rangeOnFullTank, massCurve, effectiveResistance } from './formulas.js';

const close = (actual, expected, eps = 1e-9) => assert.ok(Math.abs(actual - expected) <= eps * Math.max(1, Math.abs(expected)), `${actual} ≠ ${expected}`);

// Réacteur fictif : masse optimale 1000 t, 8 t par saut au plus, coefficients d'une FSD de note A
const FSD = { optmass: 1000, maxfuel: 8, fuelmul: 0.012, fuelpower: 2.45 };

test('saut : formule du FSD (masse optimale / masse totale × (carburant / coefficient) ^ (1 / exposant))', () => {
  // (8 / 0,012)^(1/2,45) ≈ 14,2107 ; × 1000 / (400 + 16) ≈ 34,16 al
  assert.equal(jumpLength(FSD, 400, 16, 0).toFixed(2), '34.16');
  // Le carburant du saut est plafonné par le réacteur ; celui du réservoir compte dans la masse
  close(jumpLength(FSD, 400, 16, 0), jumpLength(FSD, 408, 8, 0));
  assert.ok(jumpLength(FSD, 400, 4, 0) < jumpLength(FSD, 400, 8, 0));
  // Booster guardian : distance ajoutée telle quelle ; masse optimale doublée : distance doublée
  close(jumpLength(FSD, 400, 16, 10.5) - jumpLength(FSD, 400, 16, 0), 10.5);
  close(jumpLength({ ...FSD, optmass: 2000 }, 400, 16, 0), 2 * jumpLength(FSD, 400, 16, 0));
});

test('portée d\'un plein : sauts successifs, le vaisseau s\'allège', () => {
  close(rangeOnFullTank(FSD, 400, 16, 0), jumpLength(FSD, 400, 16, 0) + jumpLength(FSD, 400, 8, 0));
  // Dernier saut avec le reste du réservoir
  close(rangeOnFullTank(FSD, 400, 20, 1), jumpLength(FSD, 400, 20, 1) + jumpLength(FSD, 400, 12, 1) + jumpLength(FSD, 400, 4, 1));
  assert.equal(rangeOnFullTank(FSD, 400, 0, 0), 0);
  assert.equal(rangeOnFullTank(null, 400, 16, 0), 0);
  // Réacteur qui ne consomme rien : arrêt au bout de 1000 sauts
  assert.ok(Number.isFinite(rangeOnFullTank({ ...FSD, maxfuel: 0 }, 400, 16, 1)));
});

test('courbe de masse : maximum à la masse mini, optimum à la masse optimale, minimum à la masse maxi', () => {
  close(massCurve(1060, 530, 1060, 2650, 70, 120, 170), 120);
  close(massCurve(530, 530, 1060, 2650, 70, 120, 170), 170);
  close(massCurve(100, 530, 1060, 2650, 70, 120, 170), 170); // en dessous de la masse mini : plafonné
  close(massCurve(2650, 530, 1060, 2650, 70, 120, 170), 70);
  const a = massCurve(800, 530, 1060, 2650, 70, 120, 170);
  const b = massCurve(1500, 530, 1060, 2650, 70, 120, 170);
  assert.ok(a > 120 && a < 170 && b > 70 && b < 120);
  assert.ok(Number.isNaN(massCurve(3000, 530, 1060, 2650, 70, 120, 170))); // module trop faible pour la masse
  close(massCurve(800, 800, 800, 2000, 50, 100, 150), 150); // masse optimale = masse mini : pas de division par zéro
});

test('résistances : cumul multiplicatif, rendements décroissants au-delà de 30 %, résistance exemptée', () => {
  close(effectiveResistance(0, 20), 20); // sous le seuil : inchangée
  close(effectiveResistance(0, 80), 30 + (50 / 70) * 35); // [30, 100] ramené sur [30, 65] : 55 %
  close(effectiveResistance(0, 0, 50), 50);
  close(effectiveResistance(0, 80, 50), 100 - 0.5 * (100 - 55)); // générateur appliqué après : 77,5 %
  close(effectiveResistance(50, 0), 50); // blindage seul : seuil = sa résistance, rien à réduire
  close(effectiveResistance(-20, 50), 30 + (10 / 70) * 35); // −20 % puis +50 % : 40 % attendus, ramenés à 35 %
  close(effectiveResistance(0, 60, 0, 40), 40 + ((60 - 40) / 60) * 25); // meilleur renfort : seuil relevé à 40 %
  close(effectiveResistance(), 0);
});
