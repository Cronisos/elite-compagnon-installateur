// Tests des textes de la Garde des commandes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupState, commands, concernsLabel, entryLabel, gameLabel, restoreSteps } from './labels.js';

test('lancement du rapport : en cours, dernier (jeu fermé), précédent, inconnu', () => {
  assert.equal(concernsLabel({ concerns: 'current' }, { running: true }), 'lancement en cours');
  assert.equal(concernsLabel({ concerns: 'current' }, { running: false }), 'dernier lancement du jeu');
  assert.equal(concernsLabel({ concerns: 'previous' }, { running: true }), "lancement précédent : rien n'a été écrit depuis le lancement en cours");
  // Jeu relancé sans nouveau rapport, puis refermé : plus de « lancement en cours » à côté de « fermé »
  assert.equal(concernsLabel({ concerns: 'previous' }, { running: false }), "lancement précédent : rien n'a été écrit depuis le dernier lancement du jeu");
  assert.match(concernsLabel({ concerns: 'unknown' }, { running: null }), /aucun lancement/);
  assert.equal(concernsLabel(null), '');
});

test('lancement du jeu : en cours, fermé, ou sans nouvelles (journal sans Shutdown)', () => {
  const fmt = (iso) => iso.slice(11, 16);
  const launchedAt = '2026-11-07T21:13:43.000Z';
  assert.equal(gameLabel({ launchedAt, running: true }, fmt), 'jeu lancé le 21:13');
  assert.equal(gameLabel({ launchedAt, running: false, ended: 'shutdown', endedAt: '2026-11-07T21:25:00.000Z' }, fmt), 'jeu lancé le 21:13, fermé le 21:25');
  assert.equal(
    gameLabel({ launchedAt, running: false, ended: 'silence', endedAt: '2026-11-07T21:21:41.652Z' }, fmt),
    'jeu lancé le 21:13, sans nouvelles depuis le 21:21 (fermé ou planté)',
  );
  assert.equal(gameLabel({ launchedAt: null, running: null }, fmt), '');
});

test('lignes du rapport : nature connue, sinon « Inconnu » (jamais une propriété d\'objet)', () => {
  assert.equal(entryLabel('missing-devices').label, 'Manette absente');
  assert.equal(entryLabel('constructor').label, 'Inconnu');
  assert.equal(entryLabel('toString').label, 'Inconnu');
});

test('sauvegarde : identique, différente, profil disparu ; marche à suivre pour la remettre', () => {
  const b = { file: 'Custom.4.2.binds.1451070215.backup', profile: 'Custom.4.2.binds', profileExists: true, sameAsProfile: true };
  assert.equal(backupState(b).tone, 'good');
  assert.equal(backupState({ ...b, sameAsProfile: false }).tone, 'warn');
  assert.match(backupState({ ...b, profileExists: false, sameAsProfile: null }).text, /seule copie/);
  const steps = restoreSteps(b, '%LOCALAPPDATA%\\Frontier Developments\\Elite Dangerous\\Options\\Bindings');
  assert.equal(steps[0], 'Ferme le jeu.');
  assert.ok(steps.some((s) => s.includes('renomme la copie en Custom.4.2.binds')));
  assert.equal(commands(1), '1 commande');
  assert.equal(commands(142), '142 commandes');
});
