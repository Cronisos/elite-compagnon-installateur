// Tests de la garde de l'API locale : petit serveur Express en mémoire, interrogé avec fetch
// (et node:http pour l'en-tête Host, que fetch ne laisse pas changer).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import express from 'express';
import { localGuard, refusal, allowedHosts, allowedOrigins, jsonBody, jsonLimitFor, bodyErrorMessage, errorReply, limitBytes, serverPort, uiPort } from './localGuard.js';

let server;
let base;

before(async () => {
  const app = express();
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
  app.use('/api', localGuard({ port }));
  app.use(jsonBody());
  app.get('/api/data', (req, res) => res.json({ ok: true }));
  app.post('/api/data', (req, res) => res.json({ got: req.body }));
  app.delete('/api/data', (req, res) => res.json({ deleted: true }));
  app.post('/api/modules/waypoints/captures', (req, res) => res.json({ size: req.body.image.length }));
  // Flux SSE comme /api/stream : un premier message, puis la connexion reste ouverte
  app.get('/api/stream', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write('retry: 2000\n\n');
  });
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: bodyErrorMessage(err) || 'Erreur' }));
});

after(() => {
  server.closeAllConnections();
  server.close();
});

const HEADER = { 'X-Elite-Compagnon': '1' };
const UI = 'http://localhost:5173';

/** Requête brute avec un Host choisi. */
function rawRequest(path, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${base}${path}`, { headers }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('Host étranger refusé (DNS rebinding)', async () => {
  const r = await rawRequest('/api/data', { Host: 'evil.example' });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /ne répond qu'à/);
  assert.match(r.body.error, /evil\.example/);
});

test('Host du serveur accepté, en majuscules aussi', async () => {
  const port = new URL(base).port;
  assert.equal((await rawRequest('/api/data', { Host: `LOCALHOST:${port}` })).status, 200);
  assert.equal((await rawRequest('/api/data', { Host: `127.0.0.1:${port}` })).status, 200);
});

test('Host du bon nom sur un autre port refusé', async () => {
  assert.equal((await rawRequest('/api/data', { Host: 'localhost:9999' })).status, 403);
});

test('Origin étranger refusé, même en GET', async () => {
  const r = await fetch(`${base}/api/data`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
  assert.match((await r.json()).error, /evil\.example/);
});

test("Origin étranger refusé en écriture, même avec l'en-tête maison", async () => {
  const r = await fetch(`${base}/api/data`, { method: 'POST', headers: { ...HEADER, Origin: 'http://localhost:8080', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);
});

test("Origin de l'interface accepté (localhost et 127.0.0.1)", async () => {
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
    const r = await fetch(`${base}/api/data`, { headers: { Origin: origin } });
    assert.equal(r.status, 200, origin);
  }
});

test('Origin « null » (fichier local, iframe isolée) refusé', async () => {
  const r = await fetch(`${base}/api/data`, { headers: { Origin: 'null' } });
  assert.equal(r.status, 403);
});

test('Requête lancée par un autre site (Sec-Fetch-Site: cross-site) refusée', async () => {
  const r = await fetch(`${base}/api/data`, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(r.status, 403);
  // Même origine (l'app elle-même) : accepté
  assert.equal((await fetch(`${base}/api/data`, { headers: { 'Sec-Fetch-Site': 'same-origin' } })).status, 200);
});

test('Page d’un autre programme de ce PC (Sec-Fetch-Site: same-site, sans Origin) refusée, en lecture comme en écriture', async () => {
  // <img src="http://127.0.0.1:3001/api/…"> dans une page servie sur http://127.0.0.1:<autre port> : Chrome envoie
  // same-site et aucun Origin. Avant, seul cross-site était refusé : la page faisait lancer des recherches en ligne.
  for (const [site, nom] of [['same-site', 'minuscules'], ['SAME-SITE', 'majuscules'], [' same-site ', 'espaces']]) {
    const r = await fetch(`${base}/api/data`, { headers: { 'Sec-Fetch-Site': site } });
    assert.equal(r.status, 403, nom);
    assert.match((await r.json()).error, /autre programme de ce PC/);
  }
  const ecrire = await fetch(`${base}/api/data`, { method: 'POST', headers: { ...HEADER, 'Sec-Fetch-Site': 'same-site', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(ecrire.status, 403);
  assert.equal((await fetch(`${base}/api/stream`, { headers: { 'Sec-Fetch-Site': 'same-site' } })).status, 403, 'flux temps réel compris');
  assert.match(refusal({ method: 'GET', headers: { host: 'localhost:3001', 'sec-fetch-site': 'same-site' } }, { hosts: allowedHosts(3001), origins: allowedOrigins(5173) }) || '', /autre programme/);
});

test('Adresse tapée ou lien ouvert depuis une autre application (Sec-Fetch-Site: none) : lecture acceptée, écriture sans en-tête refusée', async () => {
  assert.equal((await fetch(`${base}/api/data`, { headers: { 'Sec-Fetch-Site': 'none' } })).status, 200);
  const r = await fetch(`${base}/api/data`, { method: 'POST', headers: { 'Sec-Fetch-Site': 'none', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);
  assert.match((await r.json()).error, /X-Elite-Compagnon: 1/);
});

test('POST sans en-tête maison refusé', async () => {
  const r = await fetch(`${base}/api/data`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: UI }, body: '{"a":1}' });
  assert.equal(r.status, 403);
  assert.match((await r.json()).error, /X-Elite-Compagnon: 1/);
});

test('POST avec une mauvaise valeur d\'en-tête refusé', async () => {
  const r = await fetch(`${base}/api/data`, { method: 'POST', headers: { 'X-Elite-Compagnon': 'oui' } });
  assert.equal(r.status, 403);
});

test('DELETE sans en-tête refusé, avec en-tête accepté', async () => {
  assert.equal((await fetch(`${base}/api/data`, { method: 'DELETE' })).status, 403);
  assert.equal((await fetch(`${base}/api/data`, { method: 'DELETE', headers: HEADER })).status, 200);
});

test('POST avec en-tête maison accepté (interface et curl sans Origin)', async () => {
  for (const extra of [{ Origin: UI }, {}]) {
    const r = await fetch(`${base}/api/data`, { method: 'POST', headers: { ...HEADER, ...extra, 'Content-Type': 'application/json' }, body: '{"a":1}' });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { got: { a: 1 } });
  }
});

test('GET sans en-tête accepté (curl, appel serveur à serveur entre modules)', async () => {
  const r = await fetch(`${base}/api/data`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});

test('Flux SSE /api/stream non bloqué (GET sans en-tête, comme EventSource)', async () => {
  const ac = new AbortController();
  const r = await fetch(`${base}/api/stream`, { headers: { Accept: 'text/event-stream', Origin: UI }, signal: ac.signal });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/event-stream/);
  const reader = r.body.getReader();
  const { value } = await reader.read();
  assert.match(Buffer.from(value).toString(), /retry: 2000/);
  ac.abort();
  await reader.cancel().catch(() => {});
});

test('Requête refusée : le corps n\'est pas lu (la garde passe avant)', async () => {
  const big = JSON.stringify({ x: 'a'.repeat(2 * 1024 * 1024) });
  const r = await fetch(`${base}/api/data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: big });
  assert.equal(r.status, 403);
});

test('Corps JSON au-delà de 1 Mo refusé (413) sur une route ordinaire', async () => {
  const big = JSON.stringify({ x: 'a'.repeat(1100 * 1024) });
  const r = await fetch(`${base}/api/data`, { method: 'POST', headers: { ...HEADER, 'Content-Type': 'application/json' }, body: big });
  assert.equal(r.status, 413);
  assert.equal((await r.json()).error, 'Requête trop volumineuse.');
});

test('Encodage ou jeu de caractères inconnus : refus 415 avec la raison, jamais « Erreur interne »', async () => {
  const send = (headers) => fetch(`${base}/api/data`, { method: 'POST', headers: { ...HEADER, 'Content-Type': 'application/json', ...headers }, body: '{}' });
  let r = await send({ 'Content-Encoding': 'x-inconnu' });
  assert.equal(r.status, 415);
  assert.match((await r.json()).error, /^Encodage du corps non pris en charge/);
  r = await send({ 'Content-Type': 'application/json; charset=iso-8859-1' });
  assert.equal(r.status, 415);
  assert.match((await r.json()).error, /^Jeu de caractères non pris en charge/);
  for (const type of ['request.aborted', 'request.size.invalid']) assert.ok(bodyErrorMessage({ type }), type);
  assert.equal(bodyErrorMessage({ type: 'toString' }), null);
  assert.equal(bodyErrorMessage(new Error('autre')), null);
});

test("Route d'image : un corps de 2 Mo est accepté", async () => {
  const image = 'a'.repeat(2 * 1024 * 1024);
  const r = await fetch(`${base}/api/modules/waypoints/captures`, { method: 'POST', headers: { ...HEADER, 'Content-Type': 'application/json' }, body: JSON.stringify({ image }) });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { size: image.length });
});

test('Limites de taille par chemin : 12 Mo pour les images, 1 Mo ailleurs', () => {
  assert.equal(jsonLimitFor('/api/modules/engineering/ships/anaconda/image'), '12mb');
  assert.equal(jsonLimitFor('/api/modules/engineering/ships/federation_corvette/image/'), '12mb');
  assert.equal(jsonLimitFor('/api/modules/waypoints/captures'), '12mb');
  assert.equal(jsonLimitFor('/api/modules/builder/inara/import'), '4mb');
  assert.equal(jsonLimitFor('/api/modules/waypoints/captures/12'), '1mb');
  assert.equal(jsonLimitFor('/api/modules/engineering/ships/a/b/image'), '1mb');
  assert.equal(jsonLimitFor('/api/settings'), '1mb');
  assert.equal(jsonLimitFor('/api/modules/routes/routes'), '1mb');
});

test('refusal : règles pures (HEAD et OPTIONS sans en-tête acceptés)', () => {
  const rules = { hosts: allowedHosts(3001), origins: allowedOrigins(5173) };
  const ok = { host: '127.0.0.1:3001' };
  assert.equal(refusal({ method: 'HEAD', headers: ok }, rules), null);
  assert.equal(refusal({ method: 'OPTIONS', headers: ok }, rules), null);
  assert.equal(refusal({ method: 'GET', headers: { host: 'localhost:3001' } }, rules), null);
  assert.match(refusal({ method: 'PUT', headers: ok }, rules), /X-Elite-Compagnon/);
  assert.match(refusal({ method: 'PATCH', headers: ok }, rules), /X-Elite-Compagnon/);
  assert.equal(refusal({ method: 'PATCH', headers: { ...ok, 'x-elite-compagnon': '1' } }, rules), null);
  assert.match(refusal({ method: 'GET', headers: {} }, rules), /aucune/);
});

test('ports : 3001 et 5173 par défaut, ELITE_PORT et ELITE_UI_PORT pour le banc de contrôle, valeur douteuse refusée', () => {
  assert.equal(serverPort({}), 3001);
  assert.equal(uiPort({}), 5173);
  assert.equal(serverPort({ ELITE_PORT: ' ' }), 3001, 'vide : défaut');
  assert.equal(serverPort({ ELITE_PORT: '41234' }), 41234);
  assert.equal(uiPort({ ELITE_UI_PORT: '41235' }), 41235);
  assert.equal(uiPort({ ELITE_PORT: '41234' }), 5173, 'chacun sa variable');
  for (const raw of ['80', '1023', '65536', '3001x', '-4000', '4e4', '0x1000']) {
    assert.throws(() => serverPort({ ELITE_PORT: raw }), /ELITE_PORT refusé/, raw);
    assert.throws(() => uiPort({ ELITE_UI_PORT: raw }), /ELITE_UI_PORT refusé/, raw);
  }
  // Interface du banc : son origine seulement, plus celle du port 5173
  const rules = { hosts: allowedHosts(41234), origins: allowedOrigins(uiPort({ ELITE_UI_PORT: '41235' })) };
  const write = (origin) => refusal({ method: 'POST', headers: { host: '127.0.0.1:41234', origin, 'x-elite-compagnon': '1' } }, rules);
  assert.equal(write('http://127.0.0.1:41235'), null);
  assert.match(write('http://localhost:5173'), /un site web/);
});

test('Corps annoncé plus gros que la limite : 413 tout de suite, sans attendre l’envoi', async () => {
  const { port } = server.address();
  const r = await new Promise((resolve, reject) => {
    // 100 Go annoncés, 2 octets envoyés : la réponse doit venir quand même
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/data', headers: { ...HEADER, Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json', 'Content-Length': '100000000000' } }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        req.destroy();
        resolve({ status: res.statusCode, body: JSON.parse(body) });
      });
    });
    req.setTimeout(5000, () => req.destroy(new Error('pas de réponse en 5 s')));
    req.on('error', reject);
    req.write('{}');
  });
  assert.equal(r.status, 413);
  assert.equal(r.body.error, 'Requête trop volumineuse.');
  assert.equal(limitBytes('12mb'), 12 * 1024 * 1024);
});

test('errorReply : chaque refus a sa raison, seule une erreur imprévue est « interne »', () => {
  assert.deepEqual(errorReply({ type: 'entity.too.large', status: 413 }), { status: 413, message: 'Requête trop volumineuse.', level: 'warn' });
  assert.deepEqual(errorReply(Object.assign(new Error('x'), { status: 404, publicMessage: 'Build introuvable.' })), { status: 404, message: 'Build introuvable.', level: 'warn' });
  assert.deepEqual(errorReply(Object.assign(new URIError("Failed to decode param '%'"), { status: 400 })), { status: 400, message: 'Adresse mal encodée (caractère « % » invalide).', level: 'warn' });
  assert.deepEqual(errorReply(Object.assign(new Error('x'), { status: 405 })), { status: 405, message: 'Requête refusée (erreur 405).', level: 'warn' });
  assert.deepEqual(errorReply(Object.assign(new Error('x'), { status: 503, publicMessage: 'Ardent ne répond pas.' })), { status: 503, message: 'Ardent ne répond pas.', level: 'warn' });
  assert.deepEqual(errorReply(new Error('panne')), { status: 500, message: 'Erreur interne du serveur.', level: 'error' });
  assert.deepEqual(errorReply(Object.assign(new Error('x'), { status: 'toString' })), { status: 500, message: 'Erreur interne du serveur.', level: 'error' });
  assert.equal(errorReply('texte').status, 500);
});

test('corps compressé en Brotli (br) ou autre encodage inconnu : 415, jamais décompressé (Express 5 le ferait)', async () => {
  const { jsonBody, bodyErrorMessage } = await import('./localGuard.js');
  const mw = jsonBody();
  for (const enc of ['br', 'zstd', 'gzip, br']) {
    const req = { path: '/api/settings', headers: { 'content-encoding': enc, 'content-type': 'application/json' }, is: () => true };
    const err = await new Promise((resolve) => mw(req, {}, resolve));
    assert.equal(err?.status, 415, enc);
    assert.equal(bodyErrorMessage(err), 'Encodage du corps non pris en charge (Content-Encoding : gzip, deflate ou aucun).');
  }
});
