// Flux temps réel (core/realtime.js) : un client qui ne lit plus est coupé (retard de plus de 1 Mo, ou bloqué plus de
// 30 s), au lieu de faire garder au serveur tous ses messages en mémoire ; le nombre de connexions est plafonné (503
// avec la raison). Faux clients d'abord, puis un vrai client TCP qui ne lit plus, sur un serveur en mémoire.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import { broadcast, MAX_BACKLOG_BYTES, MAX_CLIENTS, setRealtimeClockForTest, sseHandler, STALL_MS, streamClientCount } from './realtime.js';

/** Faux client : `accepte` décide ce que write() rend ; `retard` : octets en attente (writableLength). */
function fauxClient({ accepte = true, retard = 0 } = {}) {
  const req = new EventEmitter();
  const res = new EventEmitter();
  Object.assign(res, {
    statut: null,
    corps: '',
    recus: [],
    detruit: false,
    writableLength: retard,
    writeHead(statut) {
      this.statut = statut;
    },
    write(m) {
      this.recus.push(m);
      return accepte;
    },
    end(m) {
      this.corps = String(m ?? '');
    },
    destroy() {
      this.detruit = true;
      this.emit('close');
    },
  });
  sseHandler(req, res);
  return { req, res, fermer: () => req.emit('close') };
}

const avertissements = [];
const warn = console.warn;
test.before(() => {
  console.warn = (m) => avertissements.push(String(m));
});
test.after(() => {
  console.warn = warn;
  setRealtimeClockForTest();
});

test('client qui lit : gardé, reçoit tout', () => {
  const c = fauxClient();
  for (let i = 0; i < 1000; i++) broadcast('state', { i });
  assert.equal(c.res.detruit, false);
  assert.equal(c.res.recus.length, 1001); // « retry » puis les 1000 messages
  assert.equal(streamClientCount(), 1);
  c.fermer();
  assert.equal(streamClientCount(), 0);
});

test('client qui ne lit plus : coupé dès que son retard dépasse 1 Mo, plus rien ne lui est gardé', () => {
  const lent = fauxClient({ accepte: false });
  const sain = fauxClient();
  broadcast('state', { a: 1 });
  assert.equal(lent.res.detruit, false, 'un petit retard est permis');
  lent.res.writableLength = MAX_BACKLOG_BYTES + 1;
  const recus = lent.res.recus.length;
  broadcast('state', { a: 2 });
  assert.equal(lent.res.detruit, true);
  assert.equal(lent.res.recus.length, recus, 'le message suivant ne lui est plus écrit');
  assert.equal(sain.res.detruit, false);
  assert.equal(streamClientCount(), 1, 'oublié');
  assert.ok(avertissements.some((m) => /Flux temps réel : un client ne lit plus \(1024 Ko en attente\)/.test(m)), avertissements.join('\n'));
  sain.fermer();
});

test('client bloqué (write() refusé, sans « drain ») : coupé au-delà de 30 s, pas avant ; un « drain » le remet à zéro', () => {
  let t = 1_000_000;
  setRealtimeClockForTest(() => t);
  try {
    const bloque = fauxClient({ accepte: false }); // le « retry » du début est déjà refusé : bloqué depuis t
    const repris = fauxClient({ accepte: false });
    t += STALL_MS - 1000;
    broadcast('ping');
    assert.equal(bloque.res.detruit, false);
    repris.res.emit('drain'); // il a lu : plus bloqué
    t += 2000;
    broadcast('ping');
    assert.equal(bloque.res.detruit, true, 'bloqué depuis plus de 30 s');
    assert.equal(repris.res.detruit, false, 'bloqué depuis 2 s seulement (après son « drain »)');
    t += STALL_MS + 1;
    broadcast('ping');
    assert.equal(repris.res.detruit, true);
    assert.equal(streamClientCount(), 0);
  } finally {
    setRealtimeClockForTest();
  }
});

test(`au plus ${MAX_CLIENTS} connexions : la suivante est refusée (503, raison en français), une place libérée resert`, () => {
  const ouverts = Array.from({ length: MAX_CLIENTS }, () => fauxClient());
  assert.ok(ouverts.every((c) => c.res.statut === 200));
  const refuse = fauxClient();
  assert.equal(refuse.res.statut, 503);
  assert.match(JSON.parse(refuse.res.corps).error, /Trop de connexions au flux temps réel \(32\)/);
  assert.equal(streamClientCount(), MAX_CLIENTS);
  ouverts[0].fermer();
  const encore = fauxClient();
  assert.equal(encore.res.statut, 200);
  for (const c of [...ouverts.slice(1), encore]) c.fermer();
  assert.equal(streamClientCount(), 0);
});

test('vrai client TCP qui ne lit plus : le serveur le coupe, sa mémoire en attente reste bornée', { timeout: 60_000 }, async () => {
  const serveur = http.createServer((req, res) => sseHandler(req, res));
  serveur.listen(0, '127.0.0.1');
  await once(serveur, 'listening');
  const { port } = serveur.address();
  const lecteur = net.connect(port, '127.0.0.1');
  const muet = net.connect(port, '127.0.0.1');
  try {
    await Promise.all([once(lecteur, 'connect'), once(muet, 'connect')]);
    let lu = 0;
    lecteur.on('data', (d) => (lu += d.length));
    for (const s of [lecteur, muet]) s.write(`GET /api/stream HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`);
    muet.pause(); // ne lit plus rien
    for (let i = 0; i < 100 && streamClientCount() < 2; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(streamClientCount(), 2);
    // Jusqu'à 64 Mo de messages : bien plus que les tampons du système ; le client muet doit être coupé en route
    const gros = 'x'.repeat(64 * 1024);
    let envoye = 0;
    while (streamClientCount() === 2 && envoye < 64 * 1024 * 1024) {
      broadcast('test', gros);
      envoye += gros.length;
      await new Promise((r) => setImmediate(r));
    }
    assert.equal(streamClientCount(), 1, `client muet toujours servi après ${Math.round(envoye / 1048576)} Mo`);
    assert.ok(lu > 0, 'le client qui lit reçoit toujours');
    // Le muet, relu : il reçoit ce qui était déjà parti, puis la fin de la connexion
    const fin = once(muet, 'close');
    muet.resume();
    await fin;
  } finally {
    lecteur.destroy();
    muet.destroy();
    serveur.closeAllConnections();
    serveur.close();
  }
});
