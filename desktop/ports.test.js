const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { choisirPorts, portLibre, premierLibre } = require('./ports.js');

test('ports : ceux d’habitude s’ils sont libres', async () => {
  const r = await choisirPorts({ libre: async () => true });
  assert.deepEqual(r, { serveur: 3001, interface: 5173, changes: [] });
});

test('ports : un port pris (Discord sur 3001) → le suivant libre, et c’est noté', async () => {
  const pris = new Set([3001, 3002, 5173]);
  const r = await choisirPorts({ libre: async (p) => !pris.has(p) });
  assert.equal(r.serveur, 3003);
  assert.equal(r.interface, 5174);
  assert.deepEqual(r.changes.map((c) => c.quoi), ['serveur', 'interface']);
});

test('ports : l’interface ne prend jamais le port du serveur, et rien de libre donne une erreur claire', async () => {
  const r = await choisirPorts({ habitude: { serveur: 4000, interface: 4000 }, libre: async () => true });
  assert.equal(r.serveur, 4000);
  assert.equal(r.interface, 4001);
  await assert.rejects(choisirPorts({ libre: async () => false }), /Aucun port libre entre 3001 et 3050/);
  assert.equal(await premierLibre(65535, { libre: async () => false }), null);
});

test('ports : un vrai port tenu par un autre programme est vu pris, puis libre une fois rendu', async () => {
  const s = net.createServer();
  await new Promise((r) => s.listen({ port: 0, host: '127.0.0.1' }, r));
  const { port } = s.address();
  assert.equal(await portLibre(port), false);
  await new Promise((r) => s.close(r));
  assert.equal(await portLibre(port), true);
});
