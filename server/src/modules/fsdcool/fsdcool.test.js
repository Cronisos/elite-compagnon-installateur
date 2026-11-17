// Tests du module Refroidissement FSD : début et fin d'après Status.json, refroidissement d'un saut ignoré,
// durée attendue d'après les mesures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FLAG, FsdCooldown } from './state.js';
import { releve } from './index.js';

const SC = FLAG.supercruise;

test('fsd-status.log : en ajout, dans l’ordre, et il tourne au-delà de sa taille maximale (une copie gardée)', async (t) => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-fsdcool-'));
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));
  const fichier = path.join(dossier, 'fsd-status.log');
  fs.writeFileSync(fichier, 'x'.repeat(150));
  const note = releve(fichier, { max: 100, now: () => new Date('2026-11-15T12:00:00Z') });
  note('un');
  note('deux');
  await note.attendre();
  assert.equal(fs.readFileSync(path.join(dossier, 'fsd-status.1.log'), 'utf8'), 'x'.repeat(150), 'trop gros : mis de côté');
  assert.equal(fs.readFileSync(fichier, 'utf8'), '2026-11-15T12:00:00.000Z un\n2026-11-15T12:00:00.000Z deux\n');
  for (let i = 0; i < 4; i++) note(`ligne ${i}`);
  await note.attendre();
  const tailles = ['fsd-status.log', 'fsd-status.1.log'].map((n) => fs.statSync(path.join(dossier, n)).size);
  assert.ok(tailles.every((s) => s <= 100 + 40), `jamais bien plus que la taille maximale : ${tailles}`);
  assert.deepEqual(fs.readdirSync(dossier).sort(), ['fsd-status.1.log', 'fsd-status.log'], 'une seule copie gardée');
});

test('refroidissement hors saut : début, fin, durée mesurée puis attendue', () => {
  const f = new FsdCooldown();
  assert.equal(f.status(SC, 0), null);
  assert.equal(f.status(SC | FLAG.cooldown, 1000), 'start');
  assert.equal(f.summary().expectedMs, null);
  assert.equal(f.status(SC, 31_000), 'end');
  assert.equal(f.summary().expectedMs, 30_000);
  assert.equal(f.summary().active, null);
});

test('refroidissement juste après un saut hyperespace : pas suivi', () => {
  const f = new FsdCooldown();
  f.status(0, 0);
  f.jumped(10_000);
  assert.equal(f.status(FLAG.cooldown, 15_000), null);
  assert.equal(f.status(0, 25_000), null);
  assert.equal(f.summary().measured, 0);
});

test('durée attendue : médiane des dernières mesures', () => {
  const f = new FsdCooldown();
  f.durations = [20_000, 30_000, 31_000];
  assert.equal(f.expected(), 30_000);
});
