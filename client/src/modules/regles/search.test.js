// Tests de la recherche, des filtres, du lexique et des liens profonds de la page Règles du jeu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, ruleMatches, visibleRules, countByStatus, glossary, findTarget, formatDay, formatNumber } from './search.js';

const rules = [
  {
    id: 'pp-portee',
    sheet: 'powerplay',
    title: 'Portée : 20 al d’un Consolidé, 30 al d’une Forteresse',
    statement: 'Ta puissance ne peut prendre un système qu’à portée.',
    terms: [{ fr: 'Consolidé', en: 'Fortified' }, { fr: 'Forteresse', en: 'Stronghold' }],
    values: [{ key: 'consolide', label: 'Depuis un Consolidé', value: 20, unit: 'al' }],
    status: 'publiee',
    sources: [{ type: 'web', label: 'Guide herzbube', url: 'https://wiki.herzbube.ch/wiki/EDPowerPlay' }],
  },
  {
    id: 'pp-prise-seuil',
    sheet: 'powerplay',
    title: 'Prise : 120 000 points',
    statement: 'En prise, 1,0 vaut 120 000 points.',
    terms: [{ fr: 'Prise', en: 'Acquisition', note: 'libellé à vérifier' }],
    values: [{ key: 'points', label: 'Points', value: 120000, unit: 'points de contrôle' }],
    status: 'mesuree',
    sources: [{ type: 'escadron', label: "Mesure de l'escadron" }],
  },
  {
    id: 'mv-porteur',
    sheet: 'merites-vente',
    title: 'Marchandise passée par un porteur',
    statement: 'Effet inconnu.',
    terms: [{ fr: 'Consolidé', en: 'Fortified' }],
    values: [],
    status: 'a-verifier',
    sources: [],
  },
];
const ref = { rules, sheets: [{ id: 'powerplay' }, { id: 'merites-vente' }] };

test('normalisation : accents, majuscules, apostrophes, ligatures', () => {
  assert.equal(normalize('  Consolidé  D’EXTRACTION '), "consolide d'extraction");
  assert.equal(normalize('Cœur'), 'coeur');
});

test('recherche en français ou en anglais, sans accents', () => {
  assert.ok(ruleMatches(rules[0], 'consolide'));
  assert.ok(ruleMatches(rules[0], 'Stronghold'));
  assert.ok(ruleMatches(rules[0], 'herzbube'));
  assert.ok(!ruleMatches(rules[1], 'Fortified'));
  assert.ok(ruleMatches(rules[0], ''));
});

test('recherche : tous les mots doivent y être, nombres écrits avec ou sans espace', () => {
  assert.ok(ruleMatches(rules[1], 'prise 120000'));
  assert.ok(ruleMatches(rules[1], '120 000'));
  assert.ok(!ruleMatches(rules[1], 'prise forteresse'));
});

test('filtres par statut et par fiche, et compteurs', () => {
  assert.deepEqual(visibleRules(rules, { status: 'mesuree' }).map((r) => r.id), ['pp-prise-seuil']);
  assert.deepEqual(visibleRules(rules, { sheet: 'merites-vente' }).map((r) => r.id), ['mv-porteur']);
  assert.deepEqual(visibleRules(rules, { q: 'fortified', status: 'all' }).map((r) => r.id), ['pp-portee', 'mv-porteur']);
  const counts = countByStatus(rules, { sheet: 'powerplay' });
  assert.equal(counts.get('mesuree'), 1);
  assert.equal(counts.get('publiee'), 1);
  assert.equal(counts.get('a-verifier'), undefined);
});

test('lexique : une paire une seule fois, avec ses règles, triée en français', () => {
  const g = glossary(rules);
  assert.deepEqual(g.map((e) => e.fr), ['Consolidé', 'Forteresse', 'Prise']);
  assert.deepEqual(g[0].rules, ['pp-portee', 'mv-porteur']);
  assert.equal(g[2].note, 'libellé à vérifier');
  assert.deepEqual(glossary(rules, 'strong').map((e) => e.en), ['Stronghold']);
});

test('liens profonds : règle, fiche, lexique ; inconnu ou mal formé ignoré', () => {
  assert.deepEqual(findTarget('#pp-portee', ref), { kind: 'rule', id: 'pp-portee', sheet: 'powerplay' });
  assert.deepEqual(findTarget('#merites-vente', ref), { kind: 'sheet', id: 'merites-vente' });
  assert.deepEqual(findTarget('#lexique', ref), { kind: 'glossary', id: 'lexique' });
  assert.equal(findTarget('#inconnue', ref), null);
  assert.equal(findTarget('#%E0%A4%A', ref), null);
  assert.equal(findTarget('', ref), null);
  assert.equal(findTarget('#constructor', ref), null);
});

test('dates et nombres en français', () => {
  assert.equal(formatDay('2026-11-01'), '1er nov. 2026');
  assert.equal(formatDay('2026-11-07'), '7 nov. 2026');
  assert.equal(formatDay('2026-04'), 'avril 2026');
  assert.equal(formatDay('n’importe quoi'), '');
  assert.equal(formatNumber(120000).replace(/\s/g, ' '), '120 000');
  assert.equal(formatNumber(0.3), '0,3');
});
