// Tests de l'analyseur de littéraux (lecture d'eddb.js sans exécution) : valeurs acceptées, enveloppe du script,
// et surtout entrées piégées, qui doivent être refusées sans que rien ne s'exécute.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLiteral, parseDataScript, LiteralSyntaxError } from './jsLiteral.js';

// Dans les textes à analyser, « § » tient lieu de barre oblique inverse (plus lisible qu'un double échappement)
const BS = String.fromCharCode(92);
const src = (s) => s.replaceAll('§', BS);
const lit = (s) => parseLiteral(src(s));
const refused = (s, pattern) => assert.throws(() => lit(s), (err) => err instanceof LiteralSyntaxError && (!pattern || pattern.test(err.message)), s);

test('littéraux : nombres sous toutes leurs formes, signes et quotients', () => {
  assert.deepEqual(lit('[1, -2, +3, 1.5, .5, 5., 1e4, 2.5E-3, 0x1F, 0o17, 0b101, 0]'), [1, -2, 3, 1.5, 0.5, 5, 10000, 0.0025, 31, 15, 5, 0]);
  assert.ok(Object.is(lit('-0'), -0));
  assert.equal(lit('1/0'), Infinity);
  assert.equal(lit('-1/0'), -Infinity);
  assert.equal(lit('1/-0'), -Infinity);
  assert.ok(Number.isNaN(lit('0/0')));
  assert.equal(lit('50/.77'), 50 / 0.77);
  assert.equal(lit('3.000 / .06000'), 3 / 0.06);
  assert.equal(lit('1 /* commentaire */ / 4'), 0.25);
  assert.ok(Number.isNaN(lit('NaN')));
  assert.equal(lit('-Infinity'), -Infinity);
  assert.deepEqual(lit('[true, false, null, undefined]'), [true, false, null, undefined]);
});

test('littéraux : chaînes et échappements', () => {
  assert.equal(lit(`'a"b'`), 'a"b');
  assert.equal(lit(`"a'b"`), "a'b");
  assert.equal(lit("'§n§t§r§b§f§v'"), '\n\t\r\b\f\v');
  assert.equal(lit("'§'§\"§§'"), `'"${BS}`);
  assert.equal(lit("'§x41§u0042§u{1F680}'"), `AB${String.fromCodePoint(0x1f680)}`);
  assert.equal(lit("'§0'"), String.fromCharCode(0));
  assert.equal(lit("'§a§-'"), 'a-'); // échappement sans signification : le caractère lui-même
  assert.equal(lit("'un§\ndeux'"), 'undeux'); // fin de ligne échappée
  assert.equal(lit(`'Cutter « full déf » ${String.fromCharCode(0x2028)}'`), `Cutter « full déf » ${String.fromCharCode(0x2028)}`);
});

test('littéraux : objets et tableaux, clés, virgules finales, commentaires, ordre des clés', () => {
  const v = lit(`{
    // commentaire de ligne
    class: 1, default: 'x', 'Beam Laser': 2, "*": 3, 0x10: 'seize', 1.50: 'un et demi', /* bloc */ z: [1, [2, {}], ],
    10: 'dix', 2: 'deux', a: 1, a: 'dernier',
  }`);
  assert.deepEqual(v, { class: 1, default: 'x', 'Beam Laser': 2, '*': 3, 16: 'seize', '1.5': 'un et demi', z: [1, [2, {}]], 10: 'dix', 2: 'deux', a: 'dernier' });
  // Comme le moteur JavaScript : clés numériques d'abord, croissantes ; une clé répétée garde sa première place
  assert.deepEqual(Object.keys(v), ['2', '10', '16', 'class', 'default', 'Beam Laser', '*', '1.5', 'z', 'a']);
  // Tableaux et objets ordinaires de ce contexte
  assert.ok(Array.isArray(v.z) && v.z instanceof Array && Object.getPrototypeOf(v) === Object.prototype);
  assert.deepStrictEqual(lit('[[1, 2], { "a": [3] }]'), [[1, 2], { a: [3] }]);
  assert.deepEqual(lit('{}'), {});
  assert.deepEqual(lit('[]'), []);
});

test('pièges : appels, fonctions et variables refusés, et rien ne s\'exécute', () => {
  globalThis.__literalTrap = false;
  const traps = [
    "require('child_process')",
    "process.exit(1)",
    '{ a: (globalThis.__literalTrap = true) }',
    '{ a: globalThis.__literalTrap = true }',
    '[ (function () { globalThis.__literalTrap = true; })() ]',
    '[ (() => { globalThis.__literalTrap = true })() ]',
    '{ a: function () {} }',
    '{ a: () => 1 }',
    "{ a: import('node:fs') }",
    "{ a: eval('1') }",
    "{ a: new Function('return 1') }",
    '{ a: new Date() }',
    '{ a: `gabarit ${globalThis.__literalTrap = true}` }',
    '{ a: x }',
    '{ a: this }',
    '{ a: globalThis }',
    '{ a: constructor }',
    '{ a: void 0 }',
    '{ a: typeof x }',
    '{ a: Infinity() }',
    '{ a: NaN.constructor }',
    "{ a: 'x'.constructor }",
    '{ a: /regexp/ }',
    '{ a: (1, 2) }',
  ];
  for (const t of traps) refused(t);
  assert.equal(globalThis.__literalTrap, false);
  delete globalThis.__literalTrap;
});

test('pièges : opérateurs refusés (seul le quotient de deux nombres est calculé)', () => {
  for (const t of ['1+2', '2*3', '7%2', '1-1', '1/2/3', '2**3', '1<2', '1&&2', '!0', '~1', '--1', '- -1', "-'a'", "'a'+'b'", "'a'/2", '[1]/2', '1/x', '1/(2)', '1 ? 2 : 3', '{a: 1}.a', '[1][0]']) refused(t);
});

test('pièges : formes d\'objets et de tableaux refusées', () => {
  refused('{ get a() { return 1 } }');
  refused('{ m() {} }', /méthode/);
  refused('{ a }', /abrégée/);
  refused('{ a, b: 1 }', /abrégée/);
  refused("{ ['a' + 'b']: 1 }", /calculée/);
  refused('{ ...{ a: 1 } }', /\.\.\./);
  refused('[...[1, 2]]', /\.\.\./);
  refused('[1,,2]', /trou/);
  refused('[,]', /trou/);
  refused('{,}');
  refused('{ a: 1,, }');
  refused('{ -1: 1 }');
  refused('{ a: 1 } { b: 2 }');
});

test('pièges : __proto__ refusé, aucun prototype modifié', () => {
  refused('{ __proto__: { polluted: 1 } }', /__proto__/);
  refused('{ "__proto__": { polluted: 1 } }', /__proto__/);
  refused("{ a: { '__proto__': [] } }", /__proto__/);
  assert.equal({}.polluted, undefined);
  // Les autres noms hérités d'Object.prototype sont de simples données
  const v = lit('{ constructor: 1, toString: 2, hasOwnProperty: 3 }');
  assert.deepEqual(Object.keys(v), ['constructor', 'toString', 'hasOwnProperty']);
  assert.equal(Object.getPrototypeOf(v), Object.prototype);
});

test('pièges : nombres, chaînes et commentaires mal formés', () => {
  refused('012', /octale/);
  refused('08');
  refused("'§1'", /octal/);
  refused('10n');
  refused('1_000');
  refused('0x');
  refused('1.5.3');
  refused('3in');
  refused("'non refermée", /non refermée/);
  refused("'ligne\ncoupée'", /retour à la ligne/);
  refused("'§x4'", /§x|x mal formé/);
  refused("'§u12'", /u mal formé/);
  refused("'§u{110000}'");
  refused('[1] /* non refermé', /non refermé/);
  refused('', /fin du texte/);
  refused('[1, 2', /fin du texte/);
  refused(String.fromCharCode(92) + 'u0061');
});

test('limites : profondeur et taille', () => {
  const deep = (n) => '['.repeat(n) + ']'.repeat(n);
  assert.doesNotThrow(() => parseLiteral(deep(50)));
  assert.throws(() => parseLiteral(deep(101)), /imbrication trop profonde/);
  assert.throws(() => parseLiteral(deep(100000)), /imbrication trop profonde/); // pas de débordement de pile
  assert.throws(() => parseLiteral(deep(5), { maxDepth: 3 }), /imbrication/);
  assert.throws(() => parseLiteral('[1, 2, 3]', { maxLength: 4 }), /trop long/);
  assert.throws(() => parseLiteral(42), TypeError);
});

test('erreurs : position exacte (ligne, colonne)', () => {
  try {
    parseLiteral('{\n  a: 1,\n  b: foo(1)\n}');
    assert.fail('aurait dû échouer');
  } catch (err) {
    assert.ok(err instanceof LiteralSyntaxError && err instanceof SyntaxError);
    assert.equal(err.line, 3);
    assert.equal(err.column, 6);
    assert.match(err.message, /« foo » refusé.*\(ligne 3, colonne 6\)/);
  }
});

test('script de données : enveloppe d\'eddb.js acceptée', () => {
  const text = `${String.fromCharCode(0xfeff)}/*
Licence et attribution
*/
'use strict';
var eddb = {
	version : 424029902,
	edsy_versions_db : [424019901,424029902], /* HTML,CSS */
	ship : { 1 : { fdname:'SideWinder', mass:25, pitchacc:NaN, slots:{ hardpoint:[1,1], military :[], }, }, },
	module : { 11130 : { activerng: 1/0, axewgt:50/.77, kinres:-20.0 }, }, // eddb.module{}
}; // eddb{}
`;
  const eddb = parseDataScript(text, 'eddb');
  assert.equal(eddb.version, 424029902);
  assert.deepEqual(eddb.ship[1].slots, { hardpoint: [1, 1], military: [] });
  assert.ok(Number.isNaN(eddb.ship[1].pitchacc));
  assert.equal(eddb.module[11130].activerng, Infinity);
  assert.equal(eddb.module[11130].axewgt, 50 / 0.77);
  assert.equal(eddb.module[11130].kinres, -20);
  // let / const, plusieurs directives, sans point-virgule final
  assert.deepEqual(parseDataScript('"a"\n\'b\';\nconst eddb = [1]', 'eddb'), [1]);
  assert.deepEqual(parseDataScript('let eddb={}', 'eddb'), {});
});

test('script de données : toute autre instruction est refusée', () => {
  globalThis.__literalTrap = false;
  const bad = [
    'var eddb = {}; eddb.x = 1;',
    "var eddb = {}; require('child_process').exec('calc');",
    'var eddb = {}; var autre = 1;',
    "console.log(1); var eddb = {};",
    "'use strict'; globalThis.__literalTrap = true; var eddb = {};",
    'function f() {} var eddb = {};',
    'var autre = {};',
    'var eddb;',
    'var eddb == {};',
    'var eddb = {}, autre = 1;',
    'eddb = {};',
    'var eddb = (globalThis.__literalTrap = true, {});',
    "'use strict'.length; var eddb = {};",
  ];
  for (const t of bad) assert.throws(() => parseDataScript(t, 'eddb'), LiteralSyntaxError, t);
  assert.equal(globalThis.__literalTrap, false);
  delete globalThis.__literalTrap;
});
