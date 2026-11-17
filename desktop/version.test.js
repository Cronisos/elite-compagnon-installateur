// Version de l'app et son empreinte (version.js) : un fichier changé, ajouté au manifeste ou manquant se voit.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { courte, empreinteManifeste, manifeste, verifierPaquet } = require('./version.js');

test('paquet vérifié : conforme tel que fabriqué, un fichier changé ou retiré se voit', async () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'bureau-version-'));
  fs.mkdirSync(path.join(t, 'server'));
  fs.writeFileSync(path.join(t, 'server', 'index.js'), 'code');
  fs.writeFileSync(path.join(t, 'README.md'), 'lis-moi');
  assert.deepEqual(await verifierPaquet(t), { version: null }, 'dossier de développement : pas de paquet.json');
  const m = manifeste(t, ['server/index.js', 'README.md']);
  const empreinte = empreinteManifeste(m);
  fs.writeFileSync(path.join(t, 'paquet.json'), JSON.stringify({ version: '2026.11.15-abc1234', empreinte, fichiers: m }));
  let v = await verifierPaquet(t);
  assert.equal(v.version, '2026.11.15-abc1234');
  assert.equal(v.conforme, true);
  assert.equal(v.empreinte, empreinte);
  assert.match(v.courte, /^[0-9a-f]{4} [0-9a-f]{4} [0-9a-f]{4} [0-9a-f]{4}$/);
  // Quelqu'un poste une « version corrigée »
  fs.writeFileSync(path.join(t, 'server', 'index.js'), 'code modifié');
  v = await verifierPaquet(t);
  assert.equal(v.conforme, false);
  assert.deepEqual(v.changes, ['server/index.js']);
  fs.writeFileSync(path.join(t, 'server', 'index.js'), 'code');
  fs.rmSync(path.join(t, 'README.md'));
  assert.deepEqual((await verifierPaquet(t)).changes, ['README.md'], 'fichier manquant');
  // Manifeste réécrit pour coller aux fichiers changés : l'empreinte n'est plus l'officielle
  const m2 = manifeste(t, ['server/index.js']);
  fs.writeFileSync(path.join(t, 'paquet.json'), JSON.stringify({ version: '2026.11.15-abc1234', empreinte: empreinteManifeste(m2), fichiers: m2 }));
  v = await verifierPaquet(t);
  assert.equal(v.conforme, true);
  assert.notEqual(v.empreinte, empreinte, 'à comparer à l’empreinte publiée');
  // Un manifeste qui pointe hors du dossier est ignoré
  fs.writeFileSync(path.join(t, 'paquet.json'), JSON.stringify({ version: 'x', empreinte: 'y', fichiers: { '../dehors.txt': 'z' } }));
  assert.equal((await verifierPaquet(t)).nbChanges, 0);
  assert.equal(courte(''), '');
  fs.rmSync(t, { recursive: true, force: true });
});
