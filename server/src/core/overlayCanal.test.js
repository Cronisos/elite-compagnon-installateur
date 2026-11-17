// Canal permanent vers l'overlay (audit M16, core/overlay.js overlayStream et overlay/canal.js) : overlay branché, les
// ordres passent par le flux et AUCUN processus n'est lancé ; liste vide (l'overlay peut s'arrêter) : canal fermé, et
// l'ordre suivant relance l'overlay, sauf s'il est resté lancé et s'est rebranché. Le vrai client de l'overlay (overlay/canal.js) est branché sur un serveur local ;
// dossier de données temporaire, lancement simulé.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-overlay-canal-'));
process.env.ELITE_DATA_DIR = DIR;
delete process.env.ELITE_NO_OVERLAY;
delete process.env.ELITE_OVERLAY_TOUJOURS;
const overlay = await import('./overlay.js');
const { ouvrirCanal } = createRequire(import.meta.url)('../../../overlay/canal.js');

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
async function jusqua(cond, ms = 2000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (cond()) return true;
    await attendre(10);
  }
  return cond();
}
const pagesDe = (args) => args.find((a) => a.startsWith('--only=')).slice(7);

test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));

test('overlay branché : ordres par le canal, aucun processus ; liste vide : canal oublié, l’ordre suivant relance', async () => {
  assert.equal(overlay.overlayState().installed, true, 'Electron installé (sinon aucun ordre ne part)');
  const serveur = http.createServer((req, res) => overlay.overlayStream(req, res));
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  const lancements = [];
  overlay.setOverlayLauncher((args) => lancements.push(args));
  const recus = [];
  const canal = ouvrirCanal({ onOrdre: (a) => recus.push(a), port: serveur.address().port, reessaiMs: 50 });
  try {
    assert.ok(await jusqua(() => overlay.overlayCanalCount() === 1 && canal.branche()), 'overlay branché');
    overlay.setOverlayExtra('signals', true); // arrivée dans un système
    assert.ok(await jusqua(() => recus.length === 1));
    assert.equal(pagesDe(recus[0]), 'signals');
    assert.ok(recus[0].some((a) => /^--at=\d+$/.test(a)), 'avec son heure');
    overlay.setOverlayExtra('signals', false); // départ : liste vide, l'overlay va s'arrêter
    assert.ok(await jusqua(() => recus.length === 2));
    assert.equal(pagesDe(recus[1]), ',');
    assert.ok(recus[1].includes('--if-running'));
    assert.equal(lancements.length, 0, 'aucun processus lancé tant que l’overlay est branché');
    assert.equal(overlay.overlayCanalCount(), 0, 'canal oublié : l’overlay s’arrête');
    canal.fermer(); // ce que fait l'overlay en quittant
    overlay.setOverlayExtra('navroute', true);
    assert.ok(await jusqua(() => lancements.length === 1), 'plus d’overlay branché : relancé');
    assert.equal(pagesDe(lancements[0]), 'navroute');
    assert.ok(!lancements[0].includes('--if-running'));
    assert.equal(recus.length, 2, 'rien par le canal fermé');
    overlay.setOverlayExtra('navroute', false);
    await attendre(overlay.LAUNCH_DELAY_MS + 60);
  } finally {
    canal.fermer();
    overlay.setOverlayLauncher(null);
    serveur.closeAllConnections?.();
    await new Promise((r) => serveur.close(r));
  }
});

test('liste vide, mais l’overlay reste lancé (fenêtre rangée, ordre écarté…) : le canal est fermé, il se rebranche, et l’ordre suivant passe par lui sans aucun lancement', async () => {
  const serveur = http.createServer((req, res) => overlay.overlayStream(req, res));
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  const lancements = [];
  overlay.setOverlayLauncher((args) => lancements.push(args));
  const recus = [];
  const canal = ouvrirCanal({ onOrdre: (a) => recus.push(a), port: serveur.address().port, reessaiMs: 50 });
  try {
    assert.ok(await jusqua(() => overlay.overlayCanalCount() === 1 && canal.branche()));
    overlay.setOverlayExtra('fsdcool', true);
    assert.ok(await jusqua(() => recus.length === 1));
    overlay.setOverlayExtra('fsdcool', false); // liste vide ; l'overlay n'appelle PAS fermer() : il reste lancé
    assert.ok(await jusqua(() => recus.length === 2));
    assert.equal(pagesDe(recus[1]), ',');
    assert.ok(await jusqua(() => !canal.branche()), 'connexion terminée par le serveur, pas seulement oubliée');
    assert.ok(await jusqua(() => overlay.overlayCanalCount() === 1 && canal.branche()), 'l’overlay resté lancé se rebranche');
    overlay.setOverlayExtra('fsdcool', true); // saut suivant
    assert.ok(await jusqua(() => recus.length === 3));
    assert.equal(pagesDe(recus[2]), 'fsdcool');
    assert.equal(lancements.length, 0, 'aucun processus lancé');
    overlay.setOverlayExtra('fsdcool', false);
    assert.ok(await jusqua(() => recus.length === 4));
  } finally {
    canal.fermer();
    overlay.setOverlayLauncher(null);
    serveur.closeAllConnections?.();
    await new Promise((r) => serveur.close(r));
  }
});

test('canal : au plus MAX_CANAL branchés, les suivants refusés (503) ; une connexion coupée est oubliée', async () => {
  const serveur = http.createServer((req, res) => overlay.overlayStream(req, res));
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  const port = serveur.address().port;
  const ouvertes = [];
  const brancher = () => new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/overlay/stream' }, (res) => {
      ouvertes.push(req);
      resolve(res.statusCode);
      res.resume();
    });
    req.on('error', () => resolve(null));
  });
  try {
    for (let i = 0; i < overlay.MAX_CANAL; i++) assert.equal(await brancher(), 200);
    assert.equal(overlay.overlayCanalCount(), overlay.MAX_CANAL);
    assert.equal(await brancher(), 503);
    for (const req of ouvertes) req.destroy();
    assert.ok(await jusqua(() => overlay.overlayCanalCount() === 0), 'connexions coupées : oubliées');
  } finally {
    for (const req of ouvertes) req.destroy();
    serveur.closeAllConnections?.();
    await new Promise((r) => serveur.close(r));
  }
});

test('l’app de bureau quitte : l’overlay branché reçoit « --quitter », puis le canal est fermé', async () => {
  const serveur = http.createServer((req, res) => overlay.overlayStream(req, res));
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  const recus = [];
  const canal = ouvrirCanal({ onOrdre: (a) => recus.push(a), port: serveur.address().port, reessaiMs: 60_000 });
  try {
    assert.equal(overlay.quitterOverlay(), false, 'aucun overlay branché : rien à prévenir');
    assert.ok(await jusqua(() => overlay.overlayCanalCount() === 1 && canal.branche()), 'overlay branché');
    assert.equal(overlay.quitterOverlay(), true);
    assert.ok(await jusqua(() => recus.length === 1));
    assert.deepEqual(recus[0], ['--quitter']);
    assert.equal(overlay.overlayCanalCount(), 0, 'canal fermé');
  } finally {
    canal.fermer();
    serveur.closeAllConnections?.();
    await new Promise((r) => serveur.close(r));
  }
});
