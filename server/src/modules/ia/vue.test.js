// Vue du jeu : une demande à la fois, image JPEG seulement, coupée par défaut, outil absent quand elle est coupée.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { DemandesVue, estJpegB64 } from './vue.js';
import { REGLAGES_DEFAUT, nettoyerReglages } from './reglages.js';
import ia from './index.js';

const JPEG = `/9j/${'A'.repeat(200)}`;

test('vue : une demande à la fois, rendue par son numéro, ou expirée', async () => {
  const d = new DemandesVue({ attenteMs: 30 });
  const p = d.demander();
  const id = d.enAttente();
  assert.match(id, /^v/);
  assert.deepEqual(await d.demander(), { erreur: 'Je regarde déjà.' });
  assert.equal(d.rendre('autre', { jpeg: JPEG }), false);
  assert.equal(d.rendre(id, { jpeg: JPEG }), true);
  assert.deepEqual(await p, { jpeg: JPEG });
  assert.equal(d.enAttente(), null);
  assert.match((await d.demander()).erreur, /n'a pas pris d'image/);
  assert.equal(estJpegB64(JPEG), true);
  assert.equal(estJpegB64(`iVBOR${'A'.repeat(200)}`), false); // un PNG
  assert.equal(estJpegB64('/9j/<script>'), false);
});

test('vue : coupée par défaut ; l’overlay ne reçoit ni jauge ni demande tant qu’elle est coupée', async () => {
  assert.equal(REGLAGES_DEFAUT.vision, false);
  assert.equal(REGLAGES_DEFAUT.visionBouclier, false);
  assert.equal(nettoyerReglages({ vision: 'oui' }).erreurs.length, 1);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-vue-'));
  fs.writeFileSync(path.join(dir, 'ia.json'), JSON.stringify({ actif: true })); // IA allumée (coupée par défaut)
  const extras = [];
  const router = express.Router();
  await ia.register({ router, broadcast: () => {}, game: { snapshot: () => ({}) }, overlay: { setExtra: (p, on) => extras.push([p, on]) } }, {
    fichierReglages: path.join(dir, 'ia.json'),
    fichierHistorique: path.join(dir, 'h.json'),
    paroleOk: () => false, // voix de Windows : les tests ne lancent pas la voix naturelle installée sur le PC
    ollama: { installes: async () => [], charges: async () => [] },
    lireMemoire: async () => null,
    fetchImpl: async () => Response.json({}),
  });
  const app = express();
  app.use(express.json());
  app.use('/ia', router);
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const url = (c) => `http://127.0.0.1:${server.address().port}/ia${c}`;
  const json = (c, body, method = 'POST') => fetch(url(c), { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.deepEqual(await (await fetch(url('/vision'))).json(), { actif: false, bouclier: false, demande: null });
    assert.match((await (await fetch(url('/vision/regarder'))).json()).erreur, /coupée/);
    await json('/reglages', { vision: true, visionBouclier: true }, 'PUT');
    assert.deepEqual(await (await fetch(url('/vision'))).json(), { actif: true, bouclier: true, demande: null });
    assert.equal((await fetch(url('/vision/regarder'))).status, 409); // hors d'une question : non
    assert.equal((await json('/vision/image', { id: 'v1', jpeg: JPEG })).status, 404); // aucune demande
    await json('/vision/cadre', { on: true });
    assert.deepEqual(extras, [['bouclier', true]]);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('vue : outil « regarder l’écran » décrit comme limité à la fenêtre du jeu', async () => {
  const { OUTILS } = await import('./outils.js');
  const o = OUTILS.find((x) => x.nom === 'regarder_ecran');
  assert.match(o.description, /fenêtre d'Elite Dangerous, rien d'autre/);
  let appel = null;
  await o.lire(async (chemin, opts) => { appel = [chemin, opts]; return {}; });
  assert.deepEqual(appel, ['/api/modules/ia/vision/regarder', { timeoutMs: 30_000 }]);
});

test('vue : allumée, la consigne lui dit qu’elle peut regarder ; coupée, rien', async () => {
  const { consigne } = await import('./conversation.js');
  assert.match(consigne({ vue: true }), /appelle l’outil regarder_ecran/);
  assert.doesNotMatch(consigne({}), /regarder_ecran/);
});
