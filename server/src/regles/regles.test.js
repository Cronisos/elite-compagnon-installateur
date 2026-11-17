// Dépôt des règles : chaque fiche est complète, chaque identifiant et chaque nom est unique, et chaque constante
// exportée vaut sa fiche (une règle ne se change qu'à un endroit).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMAINES, TOUTES, fiche } from './index.js';
import { domaine, problemesFiche } from './fiche.js';
import * as powerplay from './powerplay.js';
import * as supercroisiere from './supercroisiere.js';
import * as rachat from './rachat.js';
import * as objectifs from './objectifs.js';
import * as foreuses from './foreuses.js';
import * as textes from './textes.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));

test('fiches complètes, identifiants et noms uniques dans tout le dépôt', () => {
  assert.ok(TOUTES.length >= 25);
  for (const d of DOMAINES) for (const f of d.fiches) assert.deepEqual(problemesFiche(f, d.nom), [], f.id);
  assert.equal(new Set(TOUTES.map((f) => f.id)).size, TOUTES.length);
  assert.equal(new Set(TOUTES.map((f) => f.nom)).size, TOUTES.length);
  assert.equal(fiche('powerplay.prise.points').valeur, 120_000);
  assert.equal(fiche('inconnue.x'), null);
  assert.equal(fiche('__proto__'), null);
});

test('chaque constante exportée d’un domaine vaut sa fiche', () => {
  const modules = { powerplay, supercroisiere, rachat, objectifs, foreuses, textes };
  const forme = (v) => (v instanceof Set ? [...v] : v instanceof Map ? [...v] : v);
  for (const d of DOMAINES) {
    const mod = modules[d.nom];
    if (!mod) continue; // ingénierie : fiches vues depuis ses tables (ingenierie/), sans constantes à part
    for (const f of d.fiches) {
      // RATIOS_SINCE : la date de la fiche, en ms ; PRICE_EVENTS : la fiche en table, le code en Map d'objets
      if (!Object.hasOwn(mod, f.nom) || ['RATIOS_SINCE', 'PRICE_EVENTS', 'TIER_NUMBER', 'RAW_KEY_RE', 'KEY_NAMES'].includes(f.nom)) continue;
      assert.deepEqual(forme(mod[f.nom]), f.valeur, `${d.nom}.${f.nom}`);
    }
  }
  assert.equal(powerplay.RATIOS_SINCE, Date.parse('2025-11-11T00:00:00Z'));
});

test('une fiche invalide ou en double fait échouer le chargement, jamais une valeur fausse en silence', () => {
  const ok = { id: 'essai.a.b', nom: 'A', titre: 'Une règle', valeur: 1, statut: 'mesurée', date: '2026-11-09', source: 'x', controle: 'manuel' };
  assert.throws(() => domaine('essai', 'Essai', [{ ...ok, statut: 'vraie' }]), /statut/);
  assert.throws(() => domaine('essai', 'Essai', [{ ...ok, id: 'autre.a.b' }]), /commencer par « essai\. »/);
  assert.throws(() => domaine('essai', 'Essai', [ok, { ...ok, nom: 'B' }]), /identifiant en double/);
  assert.throws(() => domaine('essai', 'Essai', [ok, { ...ok, id: 'essai.a.c' }]), /nom en double/);
  assert.throws(() => domaine('essai', 'Essai', [ok]).v('INCONNUE'), /aucune fiche INCONNUE/);
});

test('semaine Powerplay : jeudi 7 h UTC, d’après les fiches', () => {
  assert.equal(new Date(powerplay.weekStart(Date.parse('2026-11-09T12:00:00Z'))).toISOString(), '2026-11-05T07:00:00.000Z');
  assert.equal(new Date(powerplay.weekStart(Date.parse('2026-11-05T06:59:59Z'))).toISOString(), '2026-10-29T07:00:00.000Z');
  assert.equal(powerplay.pointsOf(400, 'mining'), 100);
  assert.equal(powerplay.pointsOf(600, 'exploration'), 100);
  assert.equal(powerplay.pointsOf(400, 'defaut'), 100, '« defaut » n’est pas une activité');
});

test('aucun module ne réécrit en dur une règle du dépôt (120 000 points, portée 20/30 al, jeudi 7 h)', () => {
  const modules = path.join(ICI, '..', 'modules');
  const fichiers = fs.readdirSync(modules, { recursive: true }).filter((f) => /\.js$/.test(f) && !/\.test\.js$/.test(f));
  const trouves = [];
  for (const rel of fichiers) {
    const texte = fs.readFileSync(path.join(modules, rel), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    if (/\b120_?000\b/.test(texte)) trouves.push(`${rel} : 120 000`);
    if (/\b(?:350_?000|650_?000)\b/.test(texte)) trouves.push(`${rel} : palier`);
    if (/BAND\s*=\s*\{[^}]*\d_?000/.test(texte)) trouves.push(`${rel} : jauge d'un niveau`);
    if (/TICK_HOUR_UTC\s*=\s*\d/.test(texte)) trouves.push(`${rel} : heure du passage de semaine`);
  }
  assert.deepEqual(trouves, [], 'importer la fiche depuis server/src/regles/');
});
