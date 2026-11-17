// Node du PC pour le serveur et l'interface (noeud.js).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { NODE_LIVRE, pistesNode, trouverNode, versionMajeure } = require('./noeud.js');

const env = { PATH: ['C:\\a', '"C:\\b"', ''].join(path.delimiter), ProgramFiles: 'C:\\PF' };

test('pistes : PATH puis l’installation standard', () => {
  assert.deepEqual(pistesNode(env, null), [path.join('C:\\a', 'node.exe'), path.join('C:\\b', 'node.exe'), path.join('C:\\PF', 'nodejs', 'node.exe')]);
  assert.equal(versionMajeure('v24.11.0\n'), 24);
  assert.equal(versionMajeure('rien'), null);
});

test('premier Node assez récent ; sinon un message qui dit quoi faire', () => {
  const versions = { [path.join('C:\\a', 'node.exe')]: 'v22.1.0', [path.join('C:\\PF', 'nodejs', 'node.exe')]: 'v24.2.0' };
  assert.equal(trouverNode(env, { existe: (f) => f in versions, version: (f) => versions[f] }), path.join('C:\\PF', 'nodejs', 'node.exe'));
  assert.throws(() => trouverNode(env, { existe: (f) => f.startsWith('C:\\a'), version: () => 'v22.1.0' }), /Node\.js 22 trouvé.*24 ou plus/);
  assert.throws(() => trouverNode(env, { existe: () => false, version: () => '' }), /Node\.js introuvable/);
  assert.throws(() => trouverNode(env, { existe: () => true, version: () => { throw new Error('x'); } }), /introuvable/);
});

test('app installée : le Node livré avec elle passe en premier', () => {
  assert.equal(pistesNode(env)[0], NODE_LIVRE);
  assert.match(NODE_LIVRE, /runtime[\\/]node[\\/]node\.exe$/);
  const versions = { [NODE_LIVRE]: 'v24.22.1', [path.join('C:\\a', 'node.exe')]: 'v24.1.0' };
  assert.equal(trouverNode(env, { existe: (f) => f in versions, version: (f) => versions[f] }), NODE_LIVRE);
});
