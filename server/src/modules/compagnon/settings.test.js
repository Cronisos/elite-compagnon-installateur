// Tests des réglages du compagnon : validation et écriture atomique (dossier temporaire).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULTS, cleanSettings, loadSettings, saveSettings } from './settings.js';

test('valeurs par défaut : Copilote, bavardage normal, toutes les catégories actives', () => {
  const s = cleanSettings({});
  assert.equal(s.name, 'Copilote');
  assert.equal(s.level, 'normal');
  assert.equal(s.pack, 'defaut');
  assert.deepEqual(s.categories, {});
  assert.equal(s.overlay, false);
});

test('validation : champs inconnus ignorés, valeurs invalides remplacées, catégories coupées seulement', () => {
  const s = cleanSettings({
    name: '  Nova\u0000  ', level: 'hurleur', pack: '../x', side: 'haut', enabled: 'oui', overlay: true,
    minProfit: '250000', bigProfit: -5, inconnu: 1,
    categories: { vente: false, mort: true, inconnue: false, constructor: false, perte: 'non' },
  });
  assert.equal(s.name, 'Nova');
  assert.equal(s.level, 'normal');
  assert.equal(s.pack, 'defaut');
  assert.equal(s.side, 'left');
  assert.equal(s.enabled, true);
  assert.equal(s.overlay, true);
  assert.equal(s.minProfit, 250000);
  assert.equal(s.bigProfit, DEFAULTS.bigProfit);
  assert.deepEqual(s.categories, { vente: false });
  assert.equal(Object.hasOwn(s, 'inconnu'), false);
  // Réactiver une catégorie la retire de la liste des coupées
  assert.deepEqual(cleanSettings({ categories: { vente: true } }, s).categories, {});
  assert.equal(cleanSettings({ name: 'x'.repeat(31) }).name, 'Copilote', 'nom trop long');
});

test('écriture atomique, relecture ; fichier abîmé : réglages par défaut', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compagnon-reglages-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'sous-dossier', 'compagnon.json');
  saveSettings(file, cleanSettings({ name: 'Nova', level: 'bavard', categories: { amarrage: false } }));
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['compagnon.json'], 'aucun fichier temporaire laissé');
  const s = loadSettings(file);
  assert.equal(s.name, 'Nova');
  assert.equal(s.level, 'bavard');
  assert.deepEqual(s.categories, { amarrage: false });
  fs.writeFileSync(file, '{ abîmé');
  assert.deepEqual(loadSettings(file), cleanSettings({}));
});
