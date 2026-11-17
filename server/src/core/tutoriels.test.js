// Tutoriels : ce qui est retenu sur ce PC (vus, lancement à la première visite), et les demandes refusées.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FICHIER_TUTORIELS, Tutoriels } from './tutoriels.js';

const dossier = () => fs.mkdtempSync(path.join(os.tmpdir(), 'elite-tutoriels-'));

test('par défaut : actifs, rien de vu ; un tutoriel vu est gardé d’un lancement à l’autre', () => {
  const fichier = path.join(dossier(), FICHIER_TUTORIELS);
  const t = new Tutoriels({ fichier });
  assert.deepEqual(t.etat(), { actifs: true, vus: [] });
  assert.deepEqual(t.regler({ vu: { id: 'reperes', vu: true } }).vus, ['reperes']);
  t.regler({ vu: { id: 'accueil', vu: true } });
  assert.deepEqual(new Tutoriels({ fichier }).etat(), { actifs: true, vus: ['accueil', 'reperes'] });
});

test('revoir un tutoriel, tout revoir, couper le lancement automatique', () => {
  const fichier = path.join(dossier(), FICHIER_TUTORIELS);
  const t = new Tutoriels({ fichier });
  t.regler({ vu: { id: 'accueil', vu: true } });
  t.regler({ vu: { id: 'reperes', vu: true } });
  assert.deepEqual(t.regler({ vu: { id: 'accueil', vu: false } }).vus, ['reperes']);
  assert.deepEqual(t.regler({ reinitialiser: true }).vus, []);
  assert.equal(t.regler({ actifs: false }).actifs, false);
  assert.equal(new Tutoriels({ fichier }).etat().actifs, false);
});

test('demande mal formée : refusée (400), rien n’est changé', () => {
  const t = new Tutoriels({ fichier: path.join(dossier(), FICHIER_TUTORIELS) });
  for (const mauvais of [null, [], { actifs: 'oui' }, { vu: { id: '../x', vu: true } }, { vu: { id: 'accueil' } }, { vu: 'accueil' }]) {
    assert.throws(() => t.regler(mauvais), (e) => e.status === 400, JSON.stringify(mauvais));
  }
  assert.deepEqual(t.etat(), { actifs: true, vus: [] });
});

test('fichier abîmé : on repart des valeurs par défaut', () => {
  const fichier = path.join(dossier(), FICHIER_TUTORIELS);
  fs.writeFileSync(fichier, '{ pas du json');
  assert.deepEqual(new Tutoriels({ fichier, }).etat(), { actifs: true, vus: [] });
});

test('banc de contrôle : jamais lancés d’eux-mêmes, sans changer le réglage du joueur', () => {
  const fichier = path.join(dossier(), FICHIER_TUTORIELS);
  const t = new Tutoriels({ fichier, force: false });
  assert.equal(t.etat().actifs, false);
  t.regler({ vu: { id: 'accueil', vu: true } });
  assert.equal(new Tutoriels({ fichier }).etat().actifs, true, 'le fichier garde « actifs »');
});

test('passer tous les tutoriels : une liste d’identifiants, tous marqués vus ; liste mal formée refusée', () => {
  const t = new Tutoriels({ fichier: path.join(dossier(), FICHIER_TUTORIELS) });
  assert.deepEqual(t.regler({ vus: ['accueil', 'reperes', 'jeu-waypoints'] }).vus, ['accueil', 'jeu-waypoints', 'reperes']);
  assert.deepEqual(t.regler({ vus: ['accueil', 'builds-liste'] }).vus, ['accueil', 'builds-liste', 'jeu-waypoints', 'reperes']);
  for (const mauvais of ['accueil', [1], ['../x'], [null]]) assert.throws(() => t.regler({ vus: mauvais }), (e) => e.status === 400);
  assert.equal(t.etat().vus.length, 4);
});
