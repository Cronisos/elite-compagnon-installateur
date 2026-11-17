// Tests des phrases : celles par défaut (complètes et valides) et la validation de celles d'un pack.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CATEGORIES, MOODS } from './categories.js';
import { MAX_TEXT, cleanPhrases, mergePhrases, placeholders } from './phrases.js';
import { render } from './engine.js';

const raw = JSON.parse(fs.readFileSync(new URL('./phrases.json', import.meta.url), 'utf8'));

test('phrases par défaut : toutes valides, au moins 5 variantes par catégorie, chacune avec son humeur', () => {
  const { phrases, errors } = cleanPhrases(raw);
  assert.deepEqual(errors, []);
  for (const c of CATEGORIES) {
    assert.ok((phrases[c.id] || []).length >= 5, `${c.id} : ${phrases[c.id]?.length || 0} variantes`);
    for (const p of raw[c.id]) assert.ok(MOODS.includes(p.humeur), `${c.id} : humeur « ${p.humeur} »`);
  }
  assert.deepEqual(Object.keys(raw).sort(), CATEGORIES.map((c) => c.id).sort());
});

test('phrases par défaut : chacune se remplit avec l’exemple de sa catégorie, et chaque cas a ses phrases', () => {
  const { phrases } = cleanPhrases(raw);
  for (const c of CATEGORIES) {
    const ctx = { cmdr: 'Testeur', nom: 'Copilote', ...c.sample };
    for (const p of phrases[c.id]) assert.ok(render(p.texte, ctx), `${c.id} : « ${p.texte} »`);
    // Toujours au moins une phrase sans variable propre à la catégorie hors exemple : le compagnon trouve quoi dire
    for (const cas of c.cases || []) {
      const usable = phrases[c.id].filter((p) => !p.cas || p.cas === cas);
      assert.ok(usable.length >= 3, `${c.id}/${cas} : ${usable.length} phrases utilisables`);
    }
  }
});

test('phrases par défaut sans accord forcé du joueur ou du personnage (« prêt », « fatigué »…)', () => {
  const all = Object.values(raw).flat().map((p) => p.texte);
  for (const t of all) assert.doesNotMatch(t, /\b(prêt|prête|fatigué|fatiguée|content de|contente de)\b/i, t);
});

test('validation d’un pack : catégorie, texte, variables, humeur, cas', () => {
  const { phrases, errors, count } = cleanPhrases({
    vente: [
      'Texte seul, humeur neutre',
      { texte: '  Espaces\u0000 et\u202e contrôle  ', humeur: 'ravi' },
      { texte: 'x'.repeat(MAX_TEXT + 1) },
      { texte: 'Variable {inconnue}' },
      { texte: 'Humeur bizarre', humeur: 'furieux' },
      { texte: '<b>du HTML reste du texte</b>', humeur: 'content' },
      { texte: 'Mauvais cas', cas: 'soir' },
      42,
    ],
    inconnue: ['x'],
    bonjour: 'pas une liste',
  });
  assert.equal(count, 4);
  assert.deepEqual(phrases.vente.map((p) => p.texte), [
    'Texte seul, humeur neutre',
    'Espaces et contrôle',
    'Humeur bizarre',
    '<b>du HTML reste du texte</b>',
  ]);
  assert.equal(phrases.vente[0].humeur, 'neutre');
  assert.equal(phrases.vente[2].humeur, 'neutre');
  assert.ok(errors.some((e) => e.includes('inconnue')));
  assert.ok(errors.some((e) => e.includes('furieux')));
  assert.ok(errors.some((e) => e.includes('cas « soir »')));
  assert.ok(errors.some((e) => e.startsWith('bonjour')));
  assert.deepEqual(cleanPhrases([]).errors.length, 1);
});

test('pack.json avec « __proto__ » ou « constructor » : catégories inconnues, rien de pollué', () => {
  const parsed = JSON.parse('{"__proto__": ["x"], "constructor": ["y"], "vente": ["ok"]}');
  const { phrases, errors } = cleanPhrases(parsed);
  assert.deepEqual(Object.keys(phrases), ['vente']);
  assert.equal(errors.length, 2);
  assert.equal(Object.getPrototypeOf(phrases), Object.prototype);
  assert.equal(({}).vente, undefined);
});

test('variables d’un texte', () => {
  assert.deepEqual(placeholders('{a} et {b} puis {}'), ['a', 'b', '']);
});

test('fusion : phrases du pack ajoutées, ou à la place de celles par défaut', () => {
  const base = { vente: [{ texte: 'a', humeur: 'neutre' }], perte: [{ texte: 'p', humeur: 'triste' }] };
  const extra = { vente: [{ texte: 'b', humeur: 'ravi' }] };
  assert.deepEqual(mergePhrases(base, extra).vente.map((p) => p.texte), ['a', 'b']);
  const replaced = mergePhrases(base, extra, true);
  assert.deepEqual(replaced.vente.map((p) => p.texte), ['b']);
  assert.deepEqual(replaced.perte.map((p) => p.texte), ['p'], 'catégorie absente du pack : celles par défaut');
});
