// Adresse de l'interface (client/vite.config.js) : 127.0.0.1 seulement, port 5173 strict. Avec « localhost », Vite
// n'écoutait que sur [::1]:5173 : un autre programme pouvait tenir 127.0.0.1:5173 sans que strictPort le voie, et
// l'overlay comme le navigateur tombaient chez lui dès que Vite ne répondait pas. L'essai réel (port déjà tenu, Vite
// qui refuse de démarrer) est dans l'étape 26-overlay de npm run controle.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../../vite.config.js';

test('serveur de développement : 127.0.0.1, port 5173, strict', () => {
  assert.equal(config.server.host, '127.0.0.1');
  assert.equal(config.server.port, 5173);
  assert.equal(config.server.strictPort, true);
});

test('vite preview : 127.0.0.1 aussi', () => {
  assert.equal(config.preview?.host, '127.0.0.1');
});
