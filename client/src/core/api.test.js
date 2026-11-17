// Tests des appels au serveur : l'en-tête X-Elite-Compagnon accompagne toutes les requêtes
// (le serveur l'exige pour les écritures, voir server/src/core/localGuard.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, apiBrut, API_HEADERS, MESSAGE_SANS_REPONSE, MESSAGE_SERVEUR_INJOIGNABLE, messageStatut } from './api.js';

function mockFetch(t, reply = { ok: true, status: 200, json: async () => ({ ok: 1 }) }) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return reply;
  });
  return calls;
}

test('écriture : en-tête maison et JSON envoyés', async (t) => {
  const calls = mockFetch(t);
  await api('/ships/1/nickname', { method: 'PUT', body: { nickname: 'Rosie' } });
  const { url, init } = calls[0];
  assert.equal(url, '/api/ships/1/nickname');
  assert.equal(init.method, 'PUT');
  assert.equal(init.headers['X-Elite-Compagnon'], '1');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.equal(init.body, '{"nickname":"Rosie"}');
});

test('écriture sans corps (POST, DELETE) : en-tête maison quand même', async (t) => {
  const calls = mockFetch(t);
  await api('/modules/waypoints/session/end', { method: 'POST' });
  await api('/modules/waypoints/waypoints/3', { method: 'DELETE' });
  for (const { init } of calls) {
    assert.equal(init.headers['X-Elite-Compagnon'], '1');
    assert.equal(init.body, undefined);
  }
});

test('lecture : en-tête maison aussi (sans effet, mais uniforme)', async (t) => {
  const calls = mockFetch(t);
  assert.deepEqual(await api('/state'), { ok: 1 });
  assert.deepEqual(calls[0].init.headers, API_HEADERS);
  assert.equal(calls[0].init.method, 'GET');
});

test('refus du serveur : son message en français est remonté', async (t) => {
  mockFetch(t, { ok: false, status: 403, json: async () => ({ error: 'Requête refusée : test' }) });
  await assert.rejects(api('/settings', { method: 'PUT', body: {} }), (err) => {
    assert.match(err.message, /Requête refusée : test/);
    assert.equal(err.status, 403);
    return true;
  });
});

test('serveur arrêté ou relancé : message en français, pas « Failed to fetch »', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('Failed to fetch');
  });
  await assert.rejects(api('/state'), (err) => {
    assert.equal(err.message, MESSAGE_SANS_REPONSE);
    assert.equal(err.status, 0);
    assert.doesNotMatch(err.message, /fetch/i);
    return true;
  });
});

test('requête annulée par la page : l’annulation remonte telle quelle', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new DOMException('annulée', 'AbortError');
  });
  await assert.rejects(api('/state', { signal: new AbortController().signal }), { name: 'AbortError' });
});

test('signal transmis à fetch', async (t) => {
  const calls = mockFetch(t);
  const ctrl = new AbortController();
  await api('/state', { signal: ctrl.signal });
  assert.equal(calls[0].init.signal, ctrl.signal);
});

test('erreur 5xx sans JSON (proxy, serveur en train de redémarrer) : message clair, pas « Erreur 502 »', async (t) => {
  mockFetch(t, { ok: false, status: 502, json: async () => { throw new SyntaxError('pas du JSON'); } });
  await assert.rejects(api('/state'), (err) => {
    assert.equal(err.message, MESSAGE_SERVEUR_INJOIGNABLE);
    assert.equal(err.status, 502);
    return true;
  });
});

test('messages par code : tous en français, sans « Erreur 404 » brut', () => {
  assert.match(messageStatut(404), /Introuvable/);
  assert.match(messageStatut(400), /refusé la demande \(erreur 400\)/);
  assert.equal(messageStatut(503), MESSAGE_SERVEUR_INJOIGNABLE);
});

test('corps brut (micro de l’IA) : en-tête maison, type du contenu, corps tel quel, réponse en JSON', async (t) => {
  const calls = mockFetch(t, { ok: true, status: 200, json: async () => ({ texte: 'bonjour' }) });
  const wav = new Uint8Array([82, 73, 70, 70]);
  assert.deepEqual(await apiBrut('/modules/ia/ecoute', wav, { type: 'audio/wav' }), { texte: 'bonjour' });
  const { url, init } = calls[0];
  assert.equal(url, '/api/modules/ia/ecoute');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['X-Elite-Compagnon'], '1');
  assert.equal(init.headers['Content-Type'], 'audio/wav');
  assert.equal(init.body, wav);
});

test('corps brut : mêmes messages que api() (serveur arrêté, 5xx sans JSON)', async (t) => {
  const panne = t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('Failed to fetch');
  });
  await assert.rejects(apiBrut('/modules/ia/ecoute', new Uint8Array(1), { type: 'audio/wav' }), { message: MESSAGE_SANS_REPONSE, status: 0 });
  panne.mock.restore();
  mockFetch(t, { ok: false, status: 502, json: async () => { throw new SyntaxError('pas du JSON'); } });
  await assert.rejects(apiBrut('/modules/ia/ecoute', new Uint8Array(1), { type: 'audio/wav' }), { message: MESSAGE_SERVEUR_INJOIGNABLE, status: 502 });
});
