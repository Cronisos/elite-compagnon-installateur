// Portraits des ingénieurs fournis par le joueur (services/portraits.js) : trouvés par nom ou par identifiant, reconnus
// à leur contenu ; un faux PNG, un dossier ou un fichier trop gros sont ignorés.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleNom, portraitDe } from '../services/portraits.js';

// PNG 1 × 1 valide
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('portraits : par nom (casse, accents, ponctuation), par identifiant, jamais un faux', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portraits-'));
  fs.writeFileSync(path.join(dir, 'bill turner.PNG'), PNG);
  fs.writeFileSync(path.join(dir, '300050.png'), PNG);
  fs.writeFileSync(path.join(dir, 'Tod The Blaster McQuinn.png'), 'pas une image');
  fs.mkdirSync(path.join(dir, 'Broo Tarquin.png'));
  fs.writeFileSync(path.join(dir, 'Elvira Martuuk.png'), Buffer.concat([PNG, Buffer.alloc(9 * 1024 * 1024)]));
  assert.equal(portraitDe({ id: 1, name: 'Bill Turner' }, dir).mime, 'image/png');
  assert.ok(portraitDe({ id: 300050, name: 'Zacariah Nemo' }, dir));
  assert.equal(portraitDe({ id: 2, name: "Tod 'The Blaster' McQuinn" }, dir), null, 'faux PNG');
  assert.equal(portraitDe({ id: 3, name: 'Broo Tarquin' }, dir), null, 'dossier');
  assert.equal(portraitDe({ id: 4, name: 'Elvira Martuuk' }, dir), null, 'trop gros');
  assert.equal(portraitDe({ id: 5, name: 'Lei Cheung' }, dir), null, 'absent');
  assert.equal(portraitDe({ id: 5, name: 'Lei Cheung' }, path.join(dir, 'nulle-part')), null, 'pas de dossier');
  assert.equal(portraitDe(null, dir), null);
  assert.equal(cleNom("Tod 'The Blaster' McQuinn"), 'tod the blaster mcquinn');
  assert.equal(cleNom('Élvira'), 'elvira');
  fs.rmSync(dir, { recursive: true, force: true });
});
