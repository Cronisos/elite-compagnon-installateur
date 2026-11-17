// Tests du moteur des attributs (attributes.js) sur des tables fictives : valeur d'origine et par défaut,
// modification au grade, effet expérimental, modes remplacement / addition / échelle / relatif, attributs liés,
// pas et bornes, chargeur arrondi à la rafale, baisse des dégâts bornée par la portée, cadences et DPS des armes
// (arme à charge, Rechargement automatique, dernière rafale incomplète). Aucune donnée de référence nécessaire.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitModule, firingProfile } from './attributes.js';

const eddb = {
  attributes: [
    { attr: 'mass', min: 0, default: 0 },
    { attr: 'integ', min: 0, default: 0 },
    { attr: 'pwrdraw', min: 0, default: 0 },
    { attr: 'damage', min: 0, default: 0 },
    { attr: 'rounds', modadd: 1, step: 1, min: 1, default: 1 },
    { attr: 'bstsize', modset: 1, step: 1, min: 1, default: 1 },
    { attr: 'bstrof', modset: 1, min: 0, default: 1 },
    { attr: 'bstint', min: 0, default: 1 },
    { attr: 'duration', min: 0, default: 0 },
    { attr: 'ammoclip', step: 1, min: 1, default: 0 },
    { attr: 'rldtime', min: 0, default: 0 },
    { attr: 'kinres', modmod: -100, min: -1000, max: 100, default: 0 },
    { attr: 'hullbst', modmod: 100, min: -100, default: 0 },
    { attr: 'genminmass', min: 0, default: 0 },
    { attr: 'genoptmass', min: 0, default: 0 },
    { attr: 'genmaxmass', min: 0, default: 0 },
    { attr: 'engminmul', min: 0, default: 0 },
    { attr: 'engoptmul', min: 0, default: 0 },
    { attr: 'minmulspd', min: 0, default: 'engminmul' },
    { attr: 'minmulrot', min: 0, default: 'engminmul' },
    { attr: 'optmulrot', min: 0, default: 'engoptmul' },
    { attr: 'maximumrng', min: 0, default: 0 },
    { attr: 'dmgfall', min: 0, default: 0 },
    { attr: 'shotspd', min: 0, default: 0 },
    { attr: 'dmgmul', min: 0, default: 0 },
    { attr: 'boucle', default: 'boucle' },
  ],
  mtype: {
    gun: {
      modifiable: ['damage', 'mass', 'pwrdraw', 'rounds', 'ammoclip', 'bstsize', 'maximumrng', 'dmgfall'],
      blueprints: ['dead', 'gun_dmg', 'gun_short', 'gun_range', 'gun_near', 'gun_double', 'gun_clip'],
      expeffects: ['gunx_burst', 'gunx_more', 'gunx_less', 'gunx_auto'],
    },
    arm: { modifiable: ['kinres', 'hullbst', 'mass'], blueprints: ['arm_hd'] },
    sg: { modifiable: ['genminmass', 'genoptmass', 'genmaxmass'], blueprints: ['sg_light', 'sg_heavy'] },
    eng: { modifiable: ['engminmul', 'engoptmul'], blueprints: ['eng_dirty'] },
  },
  blueprint: {
    gun_dmg: { maxgrade: 3, damage: [10, 20, 50], mass: [10, 20, 30], pwrdraw: [5, 5, 5], integ: [100, 100, 100], ammoclip: [15, 15, 15] },
    gun_short: { maxgrade: 5, damage: [10] },
    arm_hd: { maxgrade: 5, kinres: [10, 20, 30, 40, 50], hullbst: [20, 20, 20, 20, 20] },
    sg_light: { maxgrade: 5, genoptmass: [-10, -20, -30, -40, -50] },
    sg_heavy: { maxgrade: 5, genoptmass: [10, 20, 30, 40, 50] },
    eng_dirty: { maxgrade: 5, engoptmul: [10, 20, 30, 40, 50] },
    gun_range: { maxgrade: 5, maximumrng: [20, 40, 60, 80, 100], dmgfall: [9999, 9999, 9999, 9999, 9999] },
    gun_near: { maxgrade: 1, maximumrng: [-50] },
    gun_double: { maxgrade: 1, bstsize: [2], ammoclip: [35] },
    gun_clip: { maxgrade: 1, ammoclip: [10] },
  },
  expeffect: {
    gunx_burst: { bstsize: 3, bstrof: 10 },
    gunx_more: { rounds: 1, damage: -10, pwrdraw: 50, integ: 50 },
    gunx_less: { rounds: -5 },
    gunx_auto: { fdname: 'special_auto_loader' }, // effet sans attribut chiffré
  },
  module: {
    1: { mtype: 'gun', mass: 2, damage: 10, pwrdraw: 1, integ: 40, bstint: 0.5 },
    2: { mtype: 'arm', kinres: 40, hullbst: 80, mass: 0 },
    3: { mtype: 'sg', genminmass: 100, genoptmass: 200, genmaxmass: 500 },
    4: { mtype: 'eng', engminmul: 80, engoptmul: 100 },
    5: { mtype: 'gun', damage: 5, bstint: 1, ammoclip: 10, rldtime: 5 },
    6: { mtype: 'gun', damage: 8, bstint: 0 }, // rayon : dégâts par seconde, tir continu
    7: { mtype: 'gun', damage: 10, bstint: 1, ammoclip: 3, rldtime: 5, maximumrng: 3000, dmgfall: 1000, shotspd: 1000 },
    8: { mtype: 'gun', damage: 6, dmgmul: 17, duration: 1.8, bstint: 0.2, ammoclip: 15, rldtime: 3 }, // charge facultative
    9: { mtype: 'gun', damage: 40, duration: 1.2, bstint: 0.8, ammoclip: 1, rldtime: 1 }, // charge obligatoire
    10: { mtype: 'gun', damage: 2, bstsize: 4, bstrof: 10, bstint: 0.5, ammoclip: 18, rldtime: 2 }, // rafales de 4, chargeur de 18
    11: { mtype: 'gun', damage: 1, bstint: 0.1, ammoclip: 90, rldtime: 5 },
  },
  ship: {},
};

const value = (entry, attr) => fitModule(eddb, null, entry).value(attr);

test('valeur d\'origine : fiche du module, sinon valeur par défaut (qui peut renvoyer à un autre attribut)', () => {
  assert.equal(value({ modid: 1 }, 'damage'), 10);
  assert.equal(value({ modid: 1 }, 'rounds'), 1); // défaut de l'attribut
  assert.equal(value({ modid: 1 }, 'inconnu'), 0);
  assert.equal(fitModule(eddb, null, { modid: 4 }).stock('minmulspd'), 80); // → engminmul
  assert.equal(fitModule(eddb, null, { modid: 4 }).stock('boucle'), 'boucle'); // renvoi circulaire : pas de boucle infinie
  const unknown = fitModule(eddb, null, { modid: 999 });
  assert.equal(unknown.sheet, null);
  assert.equal(unknown.value('bstint'), 1);
});

test('modification : variation en % au grade choisi, borné à [1, grade maximal]', () => {
  assert.equal(value({ modid: 1, bpid: 'gun_dmg', grade: 3 }, 'damage'), 15);
  assert.equal(value({ modid: 1, bpid: 'gun_dmg', grade: 1 }, 'damage'), 11);
  assert.equal(value({ modid: 1, bpid: 'gun_dmg', grade: 9 }, 'damage'), 15);
  assert.equal(value({ modid: 1, bpid: 'gun_dmg', grade: 0 }, 'damage'), 10);
  assert.equal(value({ modid: 1, bpid: 'inconnue', grade: 3 }, 'damage'), 10);
  // Attribut non modifiable pour ce type de module : la modification ne le touche pas
  assert.equal(value({ modid: 1, bpid: 'gun_dmg', grade: 3 }, 'integ'), 40);
  // Variation relative d'une valeur nulle : rien
  assert.equal(value({ modid: 6, bpid: 'gun_dmg', grade: 3 }, 'mass'), 0);
  // Grade sans valeur dans la table : aucun effet
  assert.equal(value({ modid: 1, bpid: 'gun_short', grade: 3 }, 'damage'), 10);
});

test('effet expérimental, modes addition et remplacement, cumul avec la modification', () => {
  const more = { modid: 1, expid: 'gunx_more' };
  assert.equal(value(more, 'rounds'), 2); // addition
  assert.equal(value(more, 'damage'), 9); // −10 %
  assert.equal(value(more, 'integ'), 60); // un effet touche aussi les attributs non modifiables
  assert.equal(value({ modid: 1, expid: 'gunx_burst' }, 'bstsize'), 3); // remplacement
  assert.equal(value({ modid: 1, expid: 'gunx_burst' }, 'bstrof'), 10);
  // Les variations relatives se multiplient : (1 + 50 %)(1 − 10 %) − 1 = +35 %
  const both = { modid: 1, bpid: 'gun_dmg', grade: 3, expid: 'gunx_more' };
  assert.ok(Math.abs(value(both, 'damage') - 13.5) < 1e-12);
  assert.ok(Math.abs(value(both, 'pwrdraw') - 1.5 * 1.05) < 1e-12);
});

test('mode échelle : bonus en % et résistances', () => {
  // Résistance de 40 % : la part qui passe (60 %) est réduite de moitié → 70 %
  assert.ok(Math.abs(value({ modid: 2, bpid: 'arm_hd', grade: 5 }, 'kinres') - 70) < 1e-12);
  // Bonus de coque de +80 % augmenté de 20 % : multiplicateur 1,8 × 1,2 = 2,16 → +116 %
  assert.ok(Math.abs(value({ modid: 2, bpid: 'arm_hd', grade: 5 }, 'hullbst') - 116) < 1e-12);
});

test('attributs liés : mini et maxi suivent l\'optimal (la masse maxi ne baisse jamais)', () => {
  const light = { modid: 3, bpid: 'sg_light', grade: 5 };
  assert.deepEqual(['genminmass', 'genoptmass', 'genmaxmass'].map((a) => value(light, a)), [50, 100, 500]);
  const heavy = { modid: 3, bpid: 'sg_heavy', grade: 5 };
  assert.deepEqual(['genminmass', 'genoptmass', 'genmaxmass'].map((a) => value(heavy, a)), [150, 300, 750]);
  const dirty = { modid: 4, bpid: 'eng_dirty', grade: 5 };
  assert.deepEqual(['engminmul', 'engoptmul', 'minmulspd'].map((a) => value(dirty, a)), [120, 150, 120]);
});

test('pas et bornes appliqués après la modification', () => {
  assert.equal(value({ modid: 5, bpid: 'gun_dmg', grade: 3 }, 'ammoclip'), 12); // 11,5 arrondi au pas de 1
  assert.equal(value({ modid: 1, expid: 'gunx_less' }, 'rounds'), 1); // 1 − 5, borné à 1
});

test('armes : cadence soutenue (rafales, chargeur, rechargement), cadence en rafale, DPS', () => {
  const profile = (entry) => firingProfile(fitModule(eddb, null, entry));
  const simple = profile({ modid: 1 }); // un coup toutes les 0,5 s
  assert.deepEqual([simple.sustainedRate, simple.burstRate, simple.shotDamage, simple.sustainedDps, simple.burstDps], [2, 2, 10, 20, 20]);
  const burst = profile({ modid: 1, expid: 'gunx_burst' }); // rafales de 3 coups à 10 coups/s, puis 0,5 s
  assert.ok(Math.abs(burst.sustainedRate - 3 / 0.7) < 1e-12 && Math.abs(burst.burstRate - 3 / 0.7) < 1e-12);
  const clip = profile({ modid: 5 }); // 10 coups à 1 s d'intervalle, puis 5 s de rechargement dont 1 s déjà écoulée
  assert.ok(Math.abs(clip.sustainedRate - 10 / 14) < 1e-12);
  assert.equal(clip.burstRate, 1);
  assert.equal(clip.burstDps, 5);
  const beam = profile({ modid: 6 }); // tir continu : cadence infinie, DPS = dégâts par seconde
  assert.equal(beam.sustainedRate, Infinity);
  assert.deepEqual([beam.burstRate, beam.sustainedDps, beam.burstDps], [1, 8, 8]);
});

test('propulseurs : la rotation suit le multiplicateur optimal comme la vitesse', () => {
  const dirty = { modid: 4, bpid: 'eng_dirty', grade: 5 };
  assert.deepEqual(['minmulrot', 'optmulrot'].map((a) => value(dirty, a)), [120, 150]);
  assert.equal(value({ modid: 4 }, 'optmulrot'), 100); // sans modification : la valeur par défaut (engoptmul)
});

test('Longue portée : baisse des dégâts bornée par la portée, projectiles plus rapides (jamais plus lents)', () => {
  const far = { modid: 7, bpid: 'gun_range', grade: 5 };
  assert.equal(value(far, 'maximumrng'), 6000);
  assert.equal(value(far, 'dmgfall'), 6000); // 1 000 × (1 + 99,99) ramené à la portée
  assert.equal(value(far, 'shotspd'), 2000);
  const near = { modid: 7, bpid: 'gun_near', grade: 1 };
  assert.equal(value(near, 'maximumrng'), 1500);
  assert.equal(value(near, 'shotspd'), 1000);
  assert.equal(value({ modid: 7 }, 'dmgfall'), 1000); // non modifiée : inchangée
});

test('chargeur modifié : multiple supérieur de la taille de rafale, sans saut dû aux arrondis', () => {
  const double = { modid: 7, bpid: 'gun_double', grade: 1 };
  assert.equal(value(double, 'bstsize'), 2);
  assert.equal(value(double, 'ammoclip'), 6); // 3 × 1,35 = 4,05 → 3 rafales de 2
  assert.equal(value({ modid: 7, bpid: 'gun_dmg', grade: 1 }, 'ammoclip'), 4); // 3,45 → 4 (rafales de 1 : arrondi au-dessus)
  assert.equal(value({ modid: 11, bpid: 'gun_clip', grade: 1 }, 'ammoclip'), 99); // 90 × 1,1 = 99,000…01 en flottants
});

test('armes : charge facultative non comptée, charge obligatoire comptée', () => {
  const profile = (entry) => firingProfile(fitModule(eddb, null, entry));
  const charger = profile({ modid: 8 }); // tirs sans charge : un coup toutes les 0,2 s
  assert.ok(Math.abs(charger.burstRate - 5) < 1e-12);
  assert.ok(Math.abs(charger.burstDps - 30) < 1e-12); // dégâts d'un tir simple, sans le multiplicateur
  assert.ok(Math.abs(charger.sustainedRate - 15 / (15 * 0.2 + 2.8)) < 1e-12);
  const rail = profile({ modid: 9 }); // 1,2 s de charge + 0,8 s : un coup toutes les 2 s, rechargement couvert
  assert.equal(rail.burstRate, 0.5);
  assert.equal(rail.sustainedRate, 0.5);
  assert.equal(rail.clipTime, 2);
});

test('armes : Rechargement automatique (2 × chargeur − 1 coups) et dernière rafale incomplète', () => {
  const profile = (entry) => firingProfile(fitModule(eddb, null, entry));
  const auto = profile({ modid: 5, expid: 'gunx_auto' }); // 19 coups en 19 s, puis 4 s de rechargement
  assert.ok(Math.abs(auto.sustainedRate - 19 / 23) < 1e-12);
  assert.equal(auto.burstRate, 1);
  assert.equal(profile({ modid: 5 }).clipTime, 10);
  const bursts = profile({ modid: 10 }); // 18 coups = 4 rafales de 4 + 1 de 2, chacune 0,3 + 0,5 s
  assert.ok(Math.abs(bursts.clipTime - 4) < 1e-12);
  assert.ok(Math.abs(bursts.burstRate - 18 / 4) < 1e-12);
  assert.ok(Math.abs(bursts.sustainedRate - 18 / 5.5) < 1e-12);
});
