// Avis « overlay quitté » envoyé au serveur de l'app (closed.js), sans Electron : un petit serveur HTTP local tient lieu
// de celui de l'app. Fermeture gardée quand le serveur ne répond pas, et transmise au lancement suivant.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { notifyClosed, readPending, sendPending, serverPort, startArgs } = require('./closed.js');

/**
 * Serveur local sur un port libre ; `repond` : false pour ne jamais répondre (serveur bloqué) ; `statut` et `corps` :
 * la réponse.
 */
async function serveur({ repond = true, statut = 200, corps: reponse = '{}' } = {}) {
  const recus = [];
  const srv = http.createServer((req, res) => {
    let corps = '';
    req.on('data', (c) => (corps += c));
    req.on('end', () => {
      recus.push({ method: req.method, url: req.url, headers: req.headers, corps });
      if (repond) {
        res.statusCode = statut;
        res.end(reponse);
      }
    });
  });
  srv.listen(0, '127.0.0.1');
  await once(srv, 'listening');
  return { recus, port: srv.address().port, fermer: () => { srv.closeAllConnections(); srv.close(); } };
}

/** Port où personne n'écoute. */
async function portLibre() {
  const s = await serveur();
  const { port } = s;
  s.fermer();
  return port;
}

function dossier(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-overlay-closed-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}

const attendreFin = (o) => new Promise((resolve) => {
  let n = 0;
  notifyClosed(() => {
    n += 1;
    setTimeout(() => resolve(n), 50); // un second appel arriverait ici
  }, o);
});

const transmettre = (file, o) => new Promise((resolve) => {
  let n = 0;
  let premier;
  sendPending(file, (r) => {
    n += 1;
    if (n === 1) premier = r;
    setTimeout(() => resolve({ r: premier, n }), 50);
  }, o);
});

test('Alt+Maj+Q : POST /api/overlay/closed sur 127.0.0.1, avec l’en-tête des écritures, puis on quitte (une fois)', async () => {
  const s = await serveur();
  try {
    assert.equal(await attendreFin({ port: s.port }), 1);
    assert.equal(s.recus.length, 1);
    const [r] = s.recus;
    assert.equal(r.method, 'POST');
    assert.equal(r.url, '/api/overlay/closed');
    assert.equal(r.headers['x-elite-compagnon'], '1');
    assert.equal(r.headers.host, `127.0.0.1:${s.port}`, 'adresse acceptée par la garde de l’API locale');
    assert.equal(r.headers.origin, undefined);
    assert.equal(r.corps, '{}');
  } finally {
    s.fermer();
  }
});

test('serveur absent ou bloqué : on quitte quand même, sans attendre plus que le délai', async () => {
  assert.equal(await attendreFin({ port: await portLibre() }), 1, 'personne n’écoute');
  const b = await serveur({ repond: false });
  try {
    const t0 = Date.now();
    assert.equal(await attendreFin({ port: b.port, timeoutMs: 150 }), 1);
    assert.ok(Date.now() - t0 < 1500);
  } finally {
    b.fermer();
  }
});

test('port du serveur : ELITE_PORT (1024 à 65535), sinon 3001', () => {
  assert.equal(serverPort({}), 3001);
  assert.equal(serverPort({ ELITE_PORT: '41234' }), 41234);
  for (const v of ['', '80', '70000', 'abc', '3001; x', '-1']) assert.equal(serverPort({ ELITE_PORT: v }), 3001, v);
});

// --- Constat du 9 nov. : Alt+Maj+Q pressé pendant que le serveur était arrêté ---

test('serveur arrêté, bloqué ou qui refuse : la fermeture est gardée avec son heure (écrite d’un coup) ; reçue, elle est effacée', async (t) => {
  const d = dossier(t);
  const pendingFile = path.join(d, 'sous', 'fermeture-a-transmettre.json');
  const t0 = Date.now();
  assert.equal(await attendreFin({ port: await portLibre(), pendingFile }), 1, 'on quitte quand même');
  const garde = readPending(pendingFile);
  assert.ok(garde && Date.parse(garde.at) >= t0 - 5 && Date.parse(garde.at) <= Date.now(), JSON.stringify(garde));
  assert.deepEqual(fs.readdirSync(path.dirname(pendingFile)), ['fermeture-a-transmettre.json'], 'aucun fichier temporaire laissé');
  // Bloqué (délai dépassé), ou refus (403) : gardée aussi, à l'heure la plus récente
  const b = await serveur({ repond: false });
  try {
    await attendreFin({ port: b.port, timeoutMs: 100, pendingFile });
  } finally {
    b.fermer();
  }
  const refus = await serveur({ statut: 403, corps: '{"error":"refusé"}' });
  try {
    await attendreFin({ port: refus.port, pendingFile });
  } finally {
    refus.fermer();
  }
  assert.ok(Date.parse(readPending(pendingFile).at) >= Date.parse(garde.at));
  // Le serveur répond : la fermeture est arrivée, la plus ancienne gardée n'a plus lieu d'être
  const s = await serveur();
  try {
    await attendreFin({ port: s.port, pendingFile });
  } finally {
    s.fermer();
  }
  assert.equal(fs.existsSync(pendingFile), false);
});

test('lancement suivant : la fermeture gardée part d’abord, avec son heure ; le serveur dit quoi ouvrir ; injoignable, elle reste', async (t) => {
  const d = dossier(t);
  const pendingFile = path.join(d, 'fermeture-a-transmettre.json');
  // Rien de gardé : rien n'est envoyé, on ouvre ce qui est demandé
  const vide = await serveur();
  try {
    assert.deepEqual(await transmettre(pendingFile, { port: vide.port }), { r: null, n: 1 });
    assert.equal(vide.recus.length, 0);
  } finally {
    vide.fermer();
  }
  fs.writeFileSync(pendingFile, JSON.stringify({ version: 1, at: '2026-11-07T21:30:00.000Z' }));
  // Serveur injoignable : on ouvrira ce qui est demandé, la fermeture reste gardée
  assert.deepEqual(await transmettre(pendingFile, { port: await portLibre() }), { r: undefined, n: 1 });
  assert.equal(readPending(pendingFile).at, '2026-11-07T21:30:00.000Z');
  // Le serveur répond : rien à ouvrir (open vide), la fermeture est effacée
  const s = await serveur({ corps: JSON.stringify({ mode: 'waypoints', glance: false, pages: [], installed: true, open: [] }) });
  try {
    assert.deepEqual(await transmettre(pendingFile, { port: s.port }), { r: { open: [] }, n: 1 });
    const [r] = s.recus;
    assert.equal(r.method, 'POST');
    assert.equal(r.url, '/api/overlay/closed');
    assert.equal(r.headers['x-elite-compagnon'], '1');
    assert.deepEqual(JSON.parse(r.corps), { at: '2026-11-07T21:30:00.000Z' });
  } finally {
    s.fermer();
  }
  assert.equal(fs.existsSync(pendingFile), false);
  // Un changement voulu depuis prime : le serveur rend ce qu'il faut ouvrir (seuls les textes sont gardés)
  fs.writeFileSync(pendingFile, JSON.stringify({ version: 1, at: '2026-11-07T21:30:00.000Z' }));
  const c = await serveur({ corps: JSON.stringify({ mode: 'combat', pages: ['combat'], open: ['combat', 'carrier', 3, null] }) });
  try {
    assert.deepEqual((await transmettre(pendingFile, { port: c.port })).r, { open: ['combat', 'carrier'] });
  } finally {
    c.fermer();
  }
});

test('fermeture gardée illisible : effacée, rien n’est envoyé', async (t) => {
  const d = dossier(t);
  const pendingFile = path.join(d, 'fermeture-a-transmettre.json');
  const s = await serveur();
  try {
    for (const contenu of ['{ cassé', '[]', '{"version":2,"at":"2026-11-07T21:30:00.000Z"}', '{"version":1,"at":"hier"}', '{"version":1,"at":12}']) {
      fs.writeFileSync(pendingFile, contenu);
      assert.deepEqual(await transmettre(pendingFile, { port: s.port }), { r: null, n: 1 }, contenu);
      assert.equal(fs.existsSync(pendingFile), false, contenu);
    }
    assert.equal(s.recus.length, 0);
  } finally {
    s.fermer();
  }
});

test('au lancement : la liste du serveur pour un lancement par le serveur (--only) ; sinon ce qui est demandé', () => {
  const parServeur = { only: ['waypoints', 'waypoints-list'] };
  assert.deepEqual(startArgs(parServeur, { open: [] }), { only: [] }, 'rien à ouvrir : l’overlay se ferme');
  assert.deepEqual(startArgs(parServeur, { open: ['combat'] }), { only: ['combat'] });
  assert.equal(startArgs(parServeur, null), parServeur, 'rien de gardé');
  assert.equal(startArgs(parServeur, undefined), parServeur, 'serveur injoignable');
  const aLaMain = { add: ['combat'] };
  assert.equal(startArgs(aLaMain, { open: [] }), aLaMain, 'npm run overlay : ce qui est demandé');
});

test('Alt+Maj+K, tout caché : demande de réaffichage envoyée au serveur, avec l’en-tête de l’app', async () => {
  const { demanderDemasque } = require('./closed.js');
  const recu = await new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      res.end('{"ok":true}');
      srv.close();
      resolve({ methode: req.method, chemin: req.url, entete: req.headers['x-elite-compagnon'] });
    }).listen(0, '127.0.0.1', () => demanderDemasque({ port: srv.address().port }));
  });
  assert.deepEqual(recu, { methode: 'POST', chemin: '/api/overlay/demasque', entete: '1' });
});
