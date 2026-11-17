// Garde des commandes : noms tirés des fichiers du jeu nettoyés (core/text.js, idée 7), lignes du rapport brutes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devicesInBinds, parseErrorLog, presetNameOf } from './parse.js';

test('attributs XML du .binds décodés ; rapport : noms nettoyés, lignes gardées telles quelles', () => {
  assert.equal(presetNameOf('<Root PresetName="Joueur&apos;s X52 &amp; pédales" MajorVersion="4">', 'Custom.4.2.binds'), "Joueur's X52 & pédales");
  assert.equal(presetNameOf('<Root PresetName="  " MajorVersion="4">', 'Custom.4.2.binds'), 'Custom'); // vide : tiré du nom du fichier
  assert.deepEqual(devicesInBinds('<A Device="Saitek&amp;X52" Key="a"/><B Device=" Saitek&amp;X52 " Key="b"/><C Device="Keyboard" Key="c"/>'), [{ id: 'Saitek&X52', count: 2 }]);
  const log = parseErrorLog('Missing devices: SaitekX52\nThere are multiple entries of binding "MouseGUI"\n');
  assert.deepEqual(log.missingDevices, ['SaitekX52']);
  assert.deepEqual(log.duplicates, ['MouseGUI']);
  assert.equal(log.lines[0], 'Missing devices: SaitekX52');
});
