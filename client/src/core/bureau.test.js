// App de bureau, côté interface (bureau.js) : fenêtre détachée seulement avec le pont d'Electron et ?fenetre=detachee.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bureau, estDetachee, texteVersion } from './bureau.js';

test('version de l’app : conforme au paquet, modifiée depuis, ou copie de développement', () => {
  assert.equal(texteVersion(null), null, 'navigateur : pas de ligne');
  assert.deepEqual(texteVersion({ version: null }), { texte: 'copie de développement (pas un paquet de l’escadron)', ok: null });
  const ok = texteVersion({ version: '2026.11.15-abc1234', courte: '1a2b 3c4d 5e6f 7a8b', conforme: true, nbChanges: 0, changes: [] });
  assert.equal(ok.texte, '2026.11.15-abc1234 · empreinte 1a2b 3c4d 5e6f 7a8b');
  assert.equal(ok.ok, true);
  const mod = texteVersion({ version: '2026.11.15-abc1234', courte: '1a2b', conforme: false, nbChanges: 7, changes: ['a.js', 'b.js'] });
  assert.equal(mod.ok, false);
  assert.match(mod.detail, /^7 fichiers modifiés ou manquants depuis le paquet \(a\.js, b\.js…\) : ce n’est plus la version distribuée$/);
  assert.match(texteVersion({ version: 'v', courte: 'x', conforme: false, nbChanges: 1, changes: ['a.js'] }).detail, /^1 fichier modifié ou manquant depuis le paquet \(a\.js\)/);
  assert.match(texteVersion({ version: 'v', courte: 'x', conforme: false, nbChanges: 0 }).detail, /liste des fichiers du paquet modifiée/);
});

test('fenêtre détachée', () => {
  assert.equal(bureau, null); // pas de pont hors d'Electron
  const pont = {};
  assert.equal(estDetachee('?fenetre=detachee', pont), true);
  assert.equal(estDetachee('?x=1&fenetre=detachee', pont), true);
  assert.equal(estDetachee('?fenetre=autre', pont), false);
  assert.equal(estDetachee('', pont), false);
  assert.equal(estDetachee('?fenetre=detachee', null), false); // dans un navigateur, l'adresse seule ne suffit pas
});
