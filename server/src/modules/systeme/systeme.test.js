// Moniteur PC : lecture de nvidia-smi et de tasklist, charge du processeur, relevé complet, fenêtre en jeu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { ELITE_MO_MS, chargeCpu, lireGpu, lireTasklist, releve, sources } from './mesures.js';
import systeme from './index.js';

test('nvidia-smi : nom, charge, mémoire vidéo, température, puissance', () => {
  assert.deepEqual(lireGpu('NVIDIA GeForce RTX 4090, 24, 1841, 23028, 41.08, 23.21\r\n'), {
    nom: 'NVIDIA GeForce RTX 4090', chargePct: 24, vramUtiliseeMo: 1841, vramTotaleMo: 23028, tempC: 41.08, watts: 23.21,
  });
  // Puissance non lue par le pilote : le reste suffit
  assert.equal(lireGpu('Carte, 5, 100, 8192, 50, [N/A]').watts, null);
  for (const mauvais of ['', 'No devices were found', 'a, b', null]) assert.equal(lireGpu(mauvais), null, String(mauvais));
});

test('tasklist : mémoire d’Elite (Ko avec espaces insécables, en Mo), absent → null', () => {
  assert.equal(lireTasklist('"EliteDangerous64.exe","3292","Console","1","2 280 988 Ko"\r\n'), 2228);
  assert.equal(lireTasklist('"EliteDangerous64.exe","3292","Console","1","2,280,988 K"'), 2228);
  assert.equal(lireTasklist('Information : aucune tâche en service ne correspond aux critères spécifiés.'), null);
  assert.equal(lireTasklist(null), null);
});

test('processeur : part du temps hors repos entre deux relevés', () => {
  const t = (user, idle) => ({ times: { user, nice: 0, sys: 0, idle, irq: 0 } });
  assert.equal(chargeCpu([t(0, 0), t(0, 0)], [t(25, 75), t(75, 25)]), 50);
  assert.equal(chargeCpu([t(10, 10)], [t(10, 10)]), null);
});

const faux = (o = {}) => ({
  gpu: async () => ('gpu' in o ? o.gpu : { nom: 'Carte', chargePct: 80, vramUtiliseeMo: 20000, vramTotaleMo: 23028, tempC: 70, watts: 300 }),
  eliteMo: async () => o.eliteMo ?? 2200,
  ia: async () => ('ia' in o ? o.ia : [{ nom: 'qwen3.8:27b', vramMo: 17800 }]),
  cpu: () => 23.4,
  ram: () => ({ utiliseeMo: 20000, totaleMo: 65000 }),
});

test('relevé : mémoire vidéo de l’IA à part du reste, pic gardé, sources absentes sans exception', async () => {
  const r = await releve(faux(), 21000);
  assert.deepEqual(r.vram, { utiliseeMo: 20000, totaleMo: 23028, libreMo: 3028, iaMo: 17800, autresMo: 2200, picMo: 21000 });
  assert.equal(r.eliteMo, 2200);
  const sans = await releve(faux({ gpu: null, ia: null }));
  assert.equal(sans.vram, null);
  assert.equal(sans.gpu, null);
  assert.equal(sans.ia, null);
  assert.equal(sans.cpuPct, 23.4);
});

test('API : mesure, fenêtre en jeu ouverte et fermée, réglage gardé', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'systeme-'));
  const fichier = path.join(dir, 'systeme.json');
  const extras = [];
  const router = express.Router();
  await systeme.register({ router, broadcast: () => {}, overlay: { setExtra: (p, on) => extras.push([p, on]) } }, { fichier, src: faux() });
  const app = express();
  app.use(express.json());
  app.use('/s', router);
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/s`;
  const put = (body) => fetch(`${base}/reglages`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const m = await (await fetch(`${base}/mesure`)).json();
    assert.equal(m.vram.iaMo, 17800);
    assert.equal((await put({ fenetre: 'oui' })).status, 400);
    assert.deepEqual(await (await put({ fenetre: true })).json(), { fenetre: true });
    assert.deepEqual(extras, [['systeme', true]]);
    assert.deepEqual(JSON.parse(fs.readFileSync(fichier, 'utf8')), { fenetre: true });
    await put({ fenetre: false });
    assert.deepEqual(extras.at(-1), ['systeme', false]);
  } finally {
    await new Promise((r) => server.close(r));
  }
  // Relancé avec la fenêtre voulue : rouverte au démarrage
  fs.writeFileSync(fichier, '{"fenetre":true}');
  const rouverts = [];
  await systeme.register({ router: express.Router(), broadcast: () => {}, overlay: { setExtra: (p, on) => rouverts.push([p, on]) } }, { fichier, src: faux() });
  assert.deepEqual(rouverts, [['systeme', true]]);
});

test('mémoire du jeu : tasklist relancé toutes les 20 s au plus, nvidia-smi à chaque relevé', async () => {
  const lances = [];
  let t = 1_000_000;
  const executer = (cmd, args, opts, cb) => {
    lances.push(cmd);
    cb(null, cmd === 'tasklist' ? '"EliteDangerous64.exe","1234","Console","1","2 252 800 Ko"' : 'RTX Test, 40, 8000, 16000, 60, 200');
  };
  const src = sources({ executer, now: () => t, fetchImpl: async () => { throw new Error('pas d’Ollama'); } });
  for (let i = 0; i < 5; i++) {
    assert.equal(await src.eliteMo(), 2200);
    await src.gpu();
    t += 2_000;
  }
  assert.deepEqual([lances.filter((c) => c === 'tasklist').length, lances.filter((c) => c === 'nvidia-smi').length], [1, 5]);
  t += ELITE_MO_MS;
  await src.eliteMo();
  assert.equal(lances.filter((c) => c === 'tasklist').length, 2, 'relu passé le délai');
});
