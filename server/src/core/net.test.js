// Passerelle réseau (core/net.js) : liste blanche, réseau coupé, délai, taille bornée, redirections, et aucun appel
// sortant qui la contourne dans le code du serveur. Aucun octet ne part : chaque test passe son propre faux fetch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import diagnostics from 'node:diagnostics_channel';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_MAX_BYTES, MAX_REDIRECTS, MAX_TIMEOUT_MS, NET_CHANNEL, NETWORK_HOSTS, NetworkError, checkLocalUrl, checkUrl, localFetch,
  netFetch, networkDisabled, setUserHost, userHostError, userHosts,
} from './net.js';
import { rawUrl } from './reference/download.js';
// Adresses exportées par les modules (un test du cœur peut les lire ; un module, jamais le code d'un autre)
import { API as SPANSH_SYSTEMS, NAMES_API as SPANSH_NAMES } from '../modules/whereto/spansh.js';

const ON = {}; // réseau permis (env vide)
const code = (c) => (err) => err instanceof NetworkError && err.code === c && err.status === 503 && err.publicMessage === err.message;

/** Faux fetch qui note les appels et répond par la fonction donnée. */
function fake(reply) {
  const calls = [];
  const fn = async (url, options) => {
    calls.push({ url, options });
    return reply(url, options, calls.length);
  };
  fn.calls = calls;
  return fn;
}

test('réseau : chaque adresse sortante connue des modules est dans la liste blanche', () => {
  const used = [
    'https://api.ardent-insight.com/v2/system/name/Sol/commodities', // Calculateur, Repères, Colonisation
    'https://spansh.co.uk/api/bodies/search', // Systèmes importants
    'https://spansh.co.uk/api/dump/10477373803', // Repères : prospection
    'https://spansh.co.uk/api/systems/search', // Où agir
    'https://spansh.co.uk/api/systems/field_values/system_names?q=Sol',
    'https://api.github.com/repos/EDCD/coriolis-data/git/trees/0db9234b5b9ce8c939ea84133d7ce336eea88e27?recursive=1',
    rawUrl('EDCD/FDevIDs', 'c7c29f7a13df543d4bc8b947eab29f88e06100fa', 'material.csv'),
    'https://api.cloudflare.com/client/v4/accounts', // Escadron, côté chef : monter le serveur
    'https://discord.com/api/webhooks/1/x', // Escadron, côté chef : carte publiée par l'app
  ];
  for (const u of used) assert.equal(checkUrl(u, ON).href, new URL(u).href, u);
  assert.equal(NETWORK_HOSTS.size, 6, 'un hôte de plus : à justifier ici et dans le README');
  for (const [host, why] of NETWORK_HOSTS) {
    assert.equal(host, host.toLowerCase());
    assert.ok(why.length > 10, `raison de ${host}`);
  }
});

test('réseau : hôte hors liste, http, port, identifiant ou adresse illisible refusés avec un message clair', async () => {
  const refused = [
    ['https://evil.example/x', 'NET_HOST', /l'hôte « evil\.example » n'est pas dans la liste blanche/],
    ['https://spansh.co.uk.evil.example/', 'NET_HOST', /spansh\.co\.uk\.evil\.example/],
    ['https://evil.example/?u=https://spansh.co.uk', 'NET_HOST', /evil\.example/],
    ['https://127.0.0.1/', 'NET_HOST', /127\.0\.0\.1/],
    ['https://www.spansh.co.uk/', 'NET_HOST', /www\.spansh\.co\.uk/],
    ['https://spansh.co.uk./', 'NET_HOST', /spansh\.co\.uk\./],
    ['http://spansh.co.uk/api', 'NET_NOT_HTTPS', /n'est pas en https/],
    ['ftp://spansh.co.uk/', 'NET_NOT_HTTPS', /https/],
    ['https://spansh.co.uk:8443/', 'NET_PORT', /port 8443/],
    ['https://moi:secret@spansh.co.uk/', 'NET_CREDENTIALS', /identifiant/],
    ['pas une adresse', 'NET_BAD_URL', /illisible/],
  ];
  for (const [u, c, message] of refused) {
    assert.throws(() => checkUrl(u, ON), (err) => code(c)(err) && message.test(err.message), u);
    const f = fake(() => new Response('ne doit pas partir'));
    await assert.rejects(netFetch(u, {}, { fetchImpl: f, env: ON }), code(c), u);
    assert.equal(f.calls.length, 0, `${u} : rien ne part`);
  }
  // Majuscules : le nom d'hôte est comparé en minuscules
  assert.equal(checkUrl('https://SPANSH.co.uk/api', ON).hostname, 'spansh.co.uk');
  assert.ok(checkUrl('https://spansh.co.uk:443/api', ON));
});

test('réseau : hôte réglé par le joueur (Worker de son escadron) permis, jamais une IP ni un nom local', () => {
  assert.throws(() => checkUrl('https://mon-escadron.workers.dev/v1/merits', ON), code('NET_HOST'));
  setUserHost('escadron', 'Mon-Escadron.workers.dev');
  assert.equal(checkUrl('https://mon-escadron.workers.dev/v1/merits', ON).hostname, 'mon-escadron.workers.dev');
  assert.throws(() => checkUrl('http://mon-escadron.workers.dev/v1/merits', ON), code('NET_NOT_HTTPS'));
  assert.equal(userHosts().get('escadron'), 'mon-escadron.workers.dev');
  // Un autre hôte pour le même réglage remplace l'ancien
  setUserHost('escadron', 'autre.workers.dev');
  assert.throws(() => checkUrl('https://mon-escadron.workers.dev/v1/merits', ON), code('NET_HOST'));
  for (const h of ['192.168.1.10', '10.0.0.1', 'localhost', 'nas.lan', 'box.home', 'pc.local', '[::1]', 'x.test', '']) {
    assert.throws(() => setUserHost('escadron', h), code('NET_USER_HOST'), h);
    assert.ok(userHostError(h), h);
  }
  setUserHost('escadron', null);
  assert.equal(userHosts().size, 0);
  assert.throws(() => checkUrl('https://autre.workers.dev/v1/merits', ON), code('NET_HOST'));
});

test('réseau : ELITE_NO_NETWORK refuse tout, même un hôte permis', async () => {
  for (const v of ['1', 'oui', 'true', ' 1 ']) {
    assert.equal(networkDisabled({ ELITE_NO_NETWORK: v }), true, v);
    const f = fake(() => new Response('{}'));
    await assert.rejects(netFetch('https://spansh.co.uk/api/systems/search', { method: 'POST' }, { fetchImpl: f, env: { ELITE_NO_NETWORK: v } }),
      (err) => code('NET_OFF')(err) && /Réseau coupé \(ELITE_NO_NETWORK\) : requête vers spansh\.co\.uk refusée/.test(err.message));
    assert.equal(f.calls.length, 0);
  }
  for (const v of [undefined, '', '0', 'false', 'FALSE']) assert.equal(networkDisabled({ ELITE_NO_NETWORK: v }), false, String(v));
});

test('réseau : chaque tentative est annoncée sur le canal de diagnostic (adresse normalisée), même réseau coupé', async () => {
  const vues = [];
  const noter = (m) => vues.push(m);
  diagnostics.subscribe(NET_CHANNEL, noter);
  try {
    const f = fake(() => new Response('{}'));
    // Réseau coupé : refusée, mais l'adresse qui serait partie est connue (« ../ » déjà résolu par l'analyse de l'URL)
    await assert.rejects(netFetch('https://spansh.co.uk/api/dump/../../api/search/save?x=', {}, { fetchImpl: f, env: { ELITE_NO_NETWORK: '1' } }), code('NET_OFF'));
    await assert.rejects(netFetch('https://evil.example/x', {}, { fetchImpl: f, env: ON }), code('NET_HOST'));
    await netFetch('https://spansh.co.uk/api/dump/633943823090', {}, { fetchImpl: f, env: ON });
    assert.deepEqual(vues, [
      { url: 'https://spansh.co.uk/api/search/save?x=', refused: 'NET_OFF' },
      { url: 'https://evil.example/x', refused: 'NET_HOST' },
      { url: 'https://spansh.co.uk/api/dump/633943823090', refused: null },
    ]);
    assert.equal(f.calls.length, 1, 'le canal ne change rien à la requête');
  } finally {
    diagnostics.unsubscribe(NET_CHANNEL, noter);
  }
});

test('réseau : réponse permise rendue comme fetch (statut, en-têtes, json, adresse)', async () => {
  const f = fake(() => new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { 'content-type': 'application/json', 'x-a': 'b' } }));
  const res = await netFetch('https://api.ardent-insight.com/v2/x', { headers: { Accept: 'application/json' } }, { fetchImpl: f, env: ON });
  assert.equal(res.status, 200);
  assert.equal(res.ok, true);
  assert.equal(res.headers.get('x-a'), 'b');
  assert.deepEqual(await res.json(), { ok: 1 });
  assert.equal(res.url, 'https://api.ardent-insight.com/v2/x');
  assert.equal(f.calls[0].options.redirect, 'manual', 'redirections suivies par la passerelle elle-même');
  assert.ok(f.calls[0].options.signal instanceof AbortSignal, 'délai maximal toujours posé');
  assert.equal(new Headers(f.calls[0].options.headers).get('accept'), 'application/json');
  // Erreur HTTP : rendue telle quelle (le module décide)
  const g = fake(() => new Response('non', { status: 404 }));
  const r404 = await netFetch('https://spansh.co.uk/x', {}, { fetchImpl: g, env: ON });
  assert.equal(r404.status, 404);
  assert.equal(await r404.text(), 'non');
  // Sans corps (204)
  const h = fake(() => new Response(null, { status: 204 }));
  assert.equal((await netFetch('https://spansh.co.uk/x', {}, { fetchImpl: h, env: ON })).status, 204);
});

test('réseau : taille bornée, annoncée ou lue (corps décompressé compté)', async () => {
  const limit = 1024;
  // Annoncée trop grosse : refus sans lire
  let cancelled = false;
  const announced = fake(() => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-length': String(limit + 1) } }));
  await assert.rejects(netFetch('https://spansh.co.uk/x', {}, { fetchImpl: announced, env: ON, maxBytes: limit }),
    (err) => code('NET_TOO_BIG')(err) && /Réponse trop grosse de spansh\.co\.uk/.test(err.message));
  assert.equal(cancelled, true, 'connexion libérée');
  // Sans longueur annoncée : lecture arrêtée au dépassement
  let pulled = 0;
  const stream = () => new ReadableStream({
    pull(c) {
      pulled += 1;
      c.enqueue(new Uint8Array(300));
      if (pulled > 50) c.close();
    },
  });
  const endless = fake(() => new Response(stream()));
  await assert.rejects(netFetch('https://spansh.co.uk/x', {}, { fetchImpl: endless, env: ON, maxBytes: limit }), code('NET_TOO_BIG'));
  assert.ok(pulled <= 6, `lecture arrêtée tôt (${pulled} morceaux)`);
  // Juste à la limite : accepté
  const exact = fake(() => new Response(new Uint8Array(limit)));
  assert.equal((await (await netFetch('https://spansh.co.uk/x', {}, { fetchImpl: exact, env: ON, maxBytes: limit })).arrayBuffer()).byteLength, limit);
  // Une limite demandée plus grande que la limite générale est ramenée à celle-ci
  const big = fake(() => new Response(null, { headers: { 'content-length': String(DEFAULT_MAX_BYTES + 1) } }));
  await assert.rejects(netFetch('https://spansh.co.uk/x', {}, { fetchImpl: big, env: ON, maxBytes: DEFAULT_MAX_BYTES * 10 }), code('NET_TOO_BIG'));
});

test('réseau : délai maximal posé même si l’appelant n’en donne pas, et celui de l’appelant respecté', async () => {
  assert.equal(MAX_TIMEOUT_MS, 60_000);
  const hang = fake((url, options) => new Promise((resolve, reject) => {
    if (options.signal.aborted) return reject(options.signal.reason);
    options.signal.addEventListener('abort', () => reject(options.signal.reason));
  }));
  const t0 = Date.now();
  await assert.rejects(netFetch('https://spansh.co.uk/x', {}, { fetchImpl: hang, env: ON, timeoutMs: 30 }), (err) => err.name === 'TimeoutError');
  assert.ok(Date.now() - t0 < 5000);
  // Signal de l'appelant (déjà annulé) : transmis
  const ctrl = new AbortController();
  ctrl.abort(new Error('annulé par le module'));
  await assert.rejects(netFetch('https://spansh.co.uk/x', { signal: ctrl.signal }, { fetchImpl: hang, env: ON }), /annulé par le module/);
  // Un délai demandé plus long que le maximum est ramené au maximum (on ne l'attend pas : on lit le signal)
  const seen = fake((url, options) => new Response(String(options.signal.aborted)));
  assert.equal(await (await netFetch('https://spansh.co.uk/x', {}, { fetchImpl: seen, env: ON, timeoutMs: 10 * MAX_TIMEOUT_MS })).text(), 'false');
});

test('réseau : redirections suivies une à une, chacune par la liste blanche', async () => {
  // Vers un hôte permis : suivie, Authorization retiré au changement d'hôte
  const ok = fake((url, options, n) => (n === 1
    ? new Response(null, { status: 302, headers: { location: 'https://raw.githubusercontent.com/a/b/c' } })
    : new Response('fichier')));
  const res = await netFetch('https://api.github.com/x', { headers: { authorization: 'Bearer secret' } }, { fetchImpl: ok, env: ON });
  assert.equal(await res.text(), 'fichier');
  assert.equal(res.url, 'https://raw.githubusercontent.com/a/b/c');
  assert.equal(ok.calls[1].url, 'https://raw.githubusercontent.com/a/b/c');
  assert.equal(new Headers(ok.calls[1].options.headers).get('authorization'), null, 'le jeton ne suit pas vers un autre hôte');
  // Même hôte : l'en-tête reste ; 303 après un POST : GET sans corps
  const same = fake((url, options, n) => (n === 1 ? new Response(null, { status: 303, headers: { location: '/fin' } }) : new Response('fin')));
  await netFetch('https://spansh.co.uk/api', { method: 'POST', body: '{}', headers: { authorization: 'a', 'content-type': 'application/json' } }, { fetchImpl: same, env: ON });
  assert.equal(same.calls[1].url, 'https://spansh.co.uk/fin');
  assert.equal(same.calls[1].options.method, 'GET');
  assert.equal(same.calls[1].options.body, undefined);
  assert.equal(new Headers(same.calls[1].options.headers).get('authorization'), 'a');
  // Vers un hôte hors liste : refusée, rien n'y part
  const evil = fake((url, options, n) => (n === 1 ? new Response(null, { status: 301, headers: { location: 'https://evil.example/vol' } }) : new Response('x')));
  await assert.rejects(netFetch('https://spansh.co.uk/x', {}, { fetchImpl: evil, env: ON }), code('NET_HOST'));
  assert.equal(evil.calls.length, 1);
  // Vers http : refusée
  const plain = fake(() => new Response(null, { status: 307, headers: { location: 'http://spansh.co.uk/x' } }));
  await assert.rejects(netFetch('https://spansh.co.uk/x', {}, { fetchImpl: plain, env: ON }), code('NET_NOT_HTTPS'));
  // Boucle : arrêtée
  const loop = fake(() => new Response(null, { status: 302, headers: { location: 'https://spansh.co.uk/encore' } }));
  await assert.rejects(netFetch('https://spansh.co.uk/x', {}, { fetchImpl: loop, env: ON }), code('NET_REDIRECTS'));
  assert.equal(loop.calls.length, MAX_REDIRECTS + 1);
  // Sans adresse : refusée
  const none = fake(() => new Response(null, { status: 302 }));
  await assert.rejects(netFetch('https://spansh.co.uk/x', {}, { fetchImpl: none, env: ON }), code('NET_REDIRECT'));
  // redirect: 'manual' (Escadron) : la réponse 3xx est rendue, rien n'est suivi
  const manual = fake(() => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }));
  const r = await netFetch('https://api.cloudflare.com/api', { method: 'POST', redirect: 'manual' }, { fetchImpl: manual, env: ON });
  assert.equal(r.status, 302);
  assert.equal(manual.calls.length, 1);
  // redirect: 'error' : refusée
  const strict = fake(() => new Response(null, { status: 302, headers: { location: '/y' } }));
  await assert.rejects(netFetch('https://spansh.co.uk/x', { redirect: 'error' }, { fetchImpl: strict, env: ON }), code('NET_REDIRECT'));
});

test('réseau : appel du serveur à lui-même, en http sur 127.0.0.1 seulement, même réseau coupé', async () => {
  assert.equal(checkLocalUrl('http://127.0.0.1:3001/api/modules/routes/markets?system=Sol').port, '3001');
  assert.ok(checkLocalUrl('http://localhost:3001/api'));
  for (const bad of ['https://127.0.0.1:3001/', 'http://192.168.1.2:3001/', 'http://evil.example/', 'http://a:b@127.0.0.1:3001/', 'http://127.0.0.1.evil.example/']) {
    assert.throws(() => checkLocalUrl(bad), code('NET_NOT_LOCAL'), bad);
  }
  const f = fake(() => new Response('[]'));
  const before = process.env.ELITE_NO_NETWORK;
  process.env.ELITE_NO_NETWORK = '1'; // le serveur isolé du banc tourne ainsi : l'appel à lui-même doit marcher
  try {
    const res = await localFetch('http://127.0.0.1:4321/api/x', {}, { fetchImpl: f });
    assert.deepEqual(await res.json(), []);
    await assert.rejects(netFetch('https://spansh.co.uk/x', {}, { fetchImpl: f }), code('NET_OFF'), 'netFetch lit process.env par défaut');
  } finally {
    if (before === undefined) delete process.env.ELITE_NO_NETWORK;
    else process.env.ELITE_NO_NETWORK = before;
  }
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].options.redirect, 'error');
  const big = fake(() => new Response(new Uint8Array(2048)));
  await assert.rejects(localFetch('http://127.0.0.1:4321/api/x', {}, { fetchImpl: big, maxBytes: 1024 }), code('NET_TOO_BIG'));
});

// --- Aucun appel sortant hors de la passerelle ---
const SRC = fileURLToPath(new URL('../', import.meta.url));
function sources(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== 'fixtures') sources(p, out);
    } else if (e.name.endsWith('.js') && !e.name.endsWith('.test.js') && !p.includes('__golden__')) out.push(p);
  }
  return out;
}

test('réseau : aucun module ni le cœur n’appelle fetch, http ou https sans la passerelle', () => {
  const found = [];
  for (const file of sources(SRC)) {
    const rel = path.relative(SRC, file).replace(/\\/g, '/');
    if (rel === 'core/net.js') continue;
    const text = fs.readFileSync(file, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    const checks = [
      [/globalThis\.fetch\b/, 'globalThis.fetch'],
      [/(?<![.\w])fetch\s*\(/, 'fetch( direct'],
      [/=\s*fetch\s*[,)}]/, 'fetch par défaut'],
      [/from\s+['"](node:)?(https?|http2|net|tls|dgram|undici)['"]/, 'module réseau de Node'],
      [/require\(\s*['"](node:)?(https?|http2|net|tls|dgram|undici)['"]\s*\)/, 'module réseau de Node'],
      [/new\s+WebSocket\b|\bXMLHttpRequest\b|\bEventSource\s*\(/, 'autre accès réseau'],
    ];
    for (const [re, what] of checks) if (re.test(text)) found.push(`${rel} : ${what}`);
  }
  assert.deepEqual(found, [], 'passer par core/net.js (netFetch, ou localFetch pour le serveur lui-même)');
});

test('réseau : les adresses écrites dans le code qui passe par la passerelle sont toutes dans la liste blanche', () => {
  const hosts = new Map();
  for (const file of sources(SRC)) {
    const rel = path.relative(SRC, file).replace(/\\/g, '/');
    if (rel === 'core/net.js') continue;
    const text = fs.readFileSync(file, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    // Seulement les fichiers qui appellent le réseau (ou leurs règles) : les autres adresses sont des liens à ouvrir
    if (!/\bfrom\s+['"][./]*(?:core\/)?net\.js['"]/.test(text)) continue;
    for (const m of text.matchAll(/['"`](https:\/\/[^'"`$\s]+)/g)) {
      const host = new URL(m[1]).hostname;
      if (!hosts.has(host)) hosts.set(host, rel);
    }
  }
  assert.ok(hosts.size >= 4, `adresses trouvées : ${[...hosts.keys()].join(', ')}`);
  for (const [host, rel] of hosts) assert.ok(NETWORK_HOSTS.has(host), `${rel} vise ${host}, absent de NETWORK_HOSTS`);
  // Aucun serveur d'escadron dans la liste : chaque escadron a le sien, ajouté par le joueur (setUserHost)
  assert.ok(![...NETWORK_HOSTS.keys()].some((h) => /workers\.dev$/.test(h)), 'aucun serveur d’escadron par défaut');
  assert.ok(NETWORK_HOSTS.has(new URL(SPANSH_SYSTEMS).hostname) && NETWORK_HOSTS.has(new URL(SPANSH_NAMES).hostname));
});
