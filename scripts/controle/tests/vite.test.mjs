// Version de Vite surveillée comme celle d'Electron (audit du 9 nov. 2026) : hors suivi, échec ; en attente déclarée,
// avertissement ; attente périmée, échec.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdictVite } from '../vite/version.mjs';

test('Vite : suivi, hors suivi, en attente, attente périmée, introuvable', () => {
  assert.equal(verdictVite('7.3.1', { attentes: [] }).niveau, 'ok');
  assert.equal(verdictVite('6.4.4', { attentes: [] }).niveau, 'ok');
  assert.equal(verdictVite('5.4.21', { attentes: [] }).niveau, 'echec');
  const a = verdictVite('5.4.21', { attentes: [{ version: '5.4.21', raison: 'prévu' }] });
  assert.deepEqual([a.niveau, /plus de correctifs de sécurité/.test(a.message)], ['avertissement', true]);
  assert.equal(verdictVite('6.4.4', { attentes: [{ version: '5.4.21', raison: 'prévu' }] }).niveau, 'echec', 'attente à retirer après la mise à jour');
  assert.equal(verdictVite(null).niveau, 'echec');
});
