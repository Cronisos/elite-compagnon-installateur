// Canal des ordres du serveur vers l'overlay (canal.js), contre un petit serveur local : ordres reçus dans l'ordre,
// découpés n'importe où, messages mal formés ignorés, rebranché après une coupure, plus rien une fois fermé.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { lecteurFlux, ordreValide, ouvrirCanal } = require('./canal.js');

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
async function jusqua(cond, ms = 2000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (cond()) return true;
    await attendre(10);
  }
  return cond();
}

test('lecteur du flux : ordres complets seulement, coupés n’importe où ; commentaires et messages mal formés ignorés', () => {
  const lire = lecteurFlux();
  assert.deepEqual(lire(': canal\n\n'), []);
  assert.deepEqual(lire('data: {"args":["--only=com'), []);
  assert.deepEqual(lire('bat"]}\n\ndata: {"args":["--only=,"]}\n\n'), [['--only=combat'], ['--only=,']]);
  assert.deepEqual(lire('data: pas du json\n\ndata: {"args":[1]}\n\ndata: {"autre":true}\n\n: ping\n\n'), []);
  assert.equal(ordreValide({ args: Array(21).fill('x') }), null, 'trop d’arguments');
  assert.equal(ordreValide({ args: ['x'.repeat(2001)] }), null, 'argument trop long');
  assert.throws(() => lecteurFlux()('x'.repeat(70 * 1024)), /trop long/);
});

test('branché sur le serveur : ordres reçus dans l’ordre ; rebranché après une coupure ; plus rien une fois fermé', async () => {
  const branches = [];
  const serveur = http.createServer((req, res) => {
    assert.equal(req.url, '/api/overlay/stream');
    assert.equal(req.headers.host, `127.0.0.1:${serveur.address().port}`);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(': canal\n\n');
    branches.push(res);
  });
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  const recus = [];
  const c = ouvrirCanal({ onOrdre: (a) => recus.push(a.join(' ')), port: serveur.address().port, reessaiMs: 50 });
  try {
    assert.ok(await jusqua(() => branches.length === 1 && c.branche()));
    branches[0].write('data: {"args":["--only=combat"]}\n\n');
    branches[0].write('data: {"args":["--only=combat,glance","--at=5"]}\n\n');
    assert.ok(await jusqua(() => recus.length === 2));
    assert.deepEqual(recus, ['--only=combat', '--only=combat,glance --at=5']);
    branches[0].destroy(); // serveur relancé
    assert.ok(await jusqua(() => branches.length === 2), 'rebranché tout seul');
    branches[1].write('data: {"args":["--only=,"]}\n\n');
    assert.ok(await jusqua(() => recus.length === 3));
    c.fermer();
    assert.equal(c.branche(), false);
    await attendre(200);
    assert.equal(branches.length, 2, 'fermé : plus aucune tentative');
  } finally {
    c.fermer();
    for (const r of branches) r.destroy();
    await new Promise((r) => serveur.close(r));
  }
});

test('serveur sans canal (404) ou arrêté : nouvel essai plus tard, jamais une erreur', async () => {
  let essais = 0;
  const serveur = http.createServer((req, res) => {
    essais += 1;
    res.writeHead(404);
    res.end('{}');
  });
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  const port = serveur.address().port;
  const c = ouvrirCanal({ onOrdre: () => assert.fail('aucun ordre'), port, reessaiMs: 30 });
  try {
    assert.ok(await jusqua(() => essais >= 3), 'réessaie');
    assert.equal(c.branche(), false);
    await new Promise((r) => serveur.close(r));
    await attendre(100); // connexion refusée : pas d'exception
  } finally {
    c.fermer();
  }
});
