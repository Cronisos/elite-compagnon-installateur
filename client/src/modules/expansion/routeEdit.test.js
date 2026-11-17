// Éditeur de route d'extension : lignes, déplacements, contrôle de portée en direct, sauts calculés, corps envoyé.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addRow, applyJumps, checkDraft, draftFrom, emptyDraft, moveRow, parseJump, payload, removeRow, setRow } from './routeEdit.js';

const REACH = { 'held-stronghold': 30, 'held-fortified': 20, stronghold: 30, fortified: 20 };
const PROJECT = {
  id: 3, name: 'Route Test', description: '',
  steps: [
    { name: 'Système Test Départ', role: 'held-stronghold', jump: 0 },
    { name: 'Système Test A', role: 'fortified', jump: 29.87 },
    { name: 'Système Test B', role: 'target', jump: 12.5 },
  ],
};

test('saut tapé : virgule acceptée, vide et illisible repérés', () => {
  assert.equal(parseJump('25,4'), 25.4);
  assert.equal(parseJump(''), null);
  assert.ok(Number.isNaN(parseJump('-40')));
  assert.ok(Number.isNaN(parseJump('douze')));
});

test('route enregistrée reprise dans l’éditeur, sans erreur, corps identique', () => {
  const d = draftFrom(PROJECT);
  assert.deepEqual(d.rows.map((r) => r.jump), ['', '29,87', '12,5']);
  const c = checkDraft(d, REACH);
  assert.deepEqual(c.errors, []);
  assert.equal(c.distance, 42.37);
  assert.equal(c.longest, 29.87);
  assert.deepEqual(payload(d).steps, [
    { name: 'Système Test Départ', role: 'held-stronghold', jump: '' },
    { name: 'Système Test A', role: 'fortified', jump: '29,87' },
    { name: 'Système Test B', role: 'target', jump: '12,5' },
  ]);
});

test('contrôle en direct : portée, arrivée en appui, doublon, nom et saut', () => {
  const d = draftFrom(PROJECT);
  // 12,5 AL depuis un Consolidé : bon ; 25 AL : hors de portée
  let rows = setRow(d.rows, 2, { jump: '25' });
  let c = checkDraft({ ...d, rows }, REACH);
  assert.match(c.rows[2].error, /hors de portée : 25 AL depuis Système Test A, 20 AL au plus depuis un système Consolidé/);
  assert.equal(c.errors.length, 1);
  // Sans la portée du serveur (pas encore reçue) : rien de bloqué sur la portée
  assert.deepEqual(checkDraft({ ...d, rows }, null).errors, []);
  // Une arrivée au milieu ne porte pas plus loin
  rows = [...d.rows, { ...d.rows[1], key: 'x', name: 'Système Test C', jump: '3' }];
  assert.match(checkDraft({ ...d, rows }, REACH).rows[3].error, /est une arrivée/);
  // Doublon sans tenir compte de la casse, nom vide, saut illisible
  rows = setRow(d.rows, 2, { name: 'système test a' });
  assert.match(checkDraft({ ...d, rows }, REACH).rows[2].error, /déjà sur la route \(n° 1\)/, 'numéro de la colonne # : 0 pour le départ');
  rows = setRow(d.rows, 2, { name: 'SYSTÈME TEST DÉPART' });
  assert.match(checkDraft({ ...d, rows }, REACH).rows[2].error, /déjà sur la route \(c’est le départ\)/);
  rows = setRow(d.rows, 1, { name: ' ' });
  assert.match(checkDraft({ ...d, rows }, REACH).errors[0], /Système n° 1 : nom manquant/);
  rows = setRow(d.rows, 0, { name: '' });
  assert.match(checkDraft({ ...d, rows }, REACH).errors[0], /^Départ : nom manquant/);
  rows = setRow(d.rows, 1, { jump: '-3' });
  assert.match(checkDraft({ ...d, rows }, REACH).rows[1].error, /saut illisible/);
  // Saut vide : averti, pas bloqué (le serveur le calcule depuis les journaux)
  rows = setRow(d.rows, 1, { jump: '' });
  c = checkDraft({ ...d, rows }, REACH);
  assert.deepEqual(c.errors, []);
  assert.match(c.rows[1].warn, /saut vide/);
  // Moins de deux systèmes
  assert.match(checkDraft({ ...d, rows: d.rows.slice(0, 1) }, REACH).errors[0], /au moins deux/);
});

test('monter, descendre, retirer, ajouter : le saut d’un système déplacé est à revoir', () => {
  const d = draftFrom(PROJECT);
  const up = moveRow(d.rows, 2, -1);
  assert.deepEqual(up.map((r) => r.name), ['Système Test Départ', 'Système Test B', 'Système Test A']);
  assert.equal(moveRow(d.rows, 0, -1), d.rows, 'déjà en haut');
  assert.equal(moveRow(d.rows, 2, 1), d.rows, 'déjà en bas');
  const c = checkDraft({ ...d, rows: up }, REACH);
  assert.match(c.rows[1].warn, /saut mesuré depuis Système Test A/);
  assert.match(c.rows[2].error, /Système Test B est une arrivée/, 'l’arrivée remontée ne porte pas plus loin');
  // Retaper le saut efface l'avertissement
  assert.equal(checkDraft({ ...d, rows: setRow(up, 1, { jump: '10' }) }, REACH).rows[1].warn, null);
  assert.deepEqual(removeRow(d.rows, 1).map((r) => r.name), ['Système Test Départ', 'Système Test B']);
  const added = addRow(d.rows);
  assert.equal(added.length, 4);
  assert.equal(added[3].name, '');
  assert.notEqual(added[3].key, added[2].key);
  // Nouvelle route : départ tenu et arrivée ; un nom tapé après le saut ne déclenche pas d'avertissement
  const n = emptyDraft();
  assert.deepEqual(n.rows.map((r) => r.role), ['held-stronghold', 'target']);
  let rows = setRow(n.rows, 1, { jump: '8', name: 'Système Test B' });
  rows = setRow(rows, 0, { name: 'Système Test Départ' });
  assert.equal(checkDraft({ ...n, rows }, REACH).rows[1].warn, null);
});

test('sauts calculés depuis les journaux : remplis là où ils sont connus', () => {
  const d = draftFrom(PROJECT);
  const { rows, missing } = applyJumps(d.rows, [{ jump: null }, { jump: 29.871 }, { jump: null }]);
  assert.deepEqual(rows.map((r) => r.jump), ['', '29,87', '12,5']);
  assert.equal(missing, 1);
});
