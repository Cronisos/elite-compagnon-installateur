// Écoute : WAV attendu, texte nettoyé, chemins par défaut, route /ecoute avec un faux Whisper.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { cheminsWhisper, estWavAttendu, nettoyerTranscription, MAX_AUDIO_OCTETS } from './ecoute.js';
import ia from './index.js';

function wav(secondes = 1, frequence = 16000) {
  const n = Math.round(secondes * frequence);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(frequence, 24);
  b.writeUInt32LE(frequence * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(n * 2, 40);
  return b;
}

test('écoute : WAV 16 kHz mono 16 bits seulement, 60 s au plus', () => {
  assert.equal(estWavAttendu(wav(1)), true);
  assert.equal(estWavAttendu(wav(1, 44100)), false);
  assert.equal(estWavAttendu(Buffer.from('pas un wav du tout, vraiment pas du tout, non non non')), false);
  assert.equal(estWavAttendu(Buffer.alloc(MAX_AUDIO_OCTETS + 2)), false);
  assert.equal(estWavAttendu('RIFF'), false);
});

test('écoute : texte de Whisper recollé, sans marques de silence ni de bruit', () => {
  assert.equal(nettoyerTranscription(' Combien j\'ai de crédits ?\r\n'), 'Combien j\'ai de crédits ?');
  assert.equal(nettoyerTranscription('[BLANK_AUDIO]\n'), '');
  assert.equal(nettoyerTranscription('(musique)\n Il me reste\n combien de place ?'), 'Il me reste combien de place ?');
  assert.equal(nettoyerTranscription('[00:00:00.000 --> 00:00:02.000]  Salut Alicia.'), 'Salut Alicia.');
});

test('écoute : installation par défaut dans LOCALAPPDATA, chemins des réglages sinon', () => {
  const c = cheminsWhisper({}, { LOCALAPPDATA: 'C:\\L' });
  assert.equal(c.exe, path.join('C:\\L', 'Programs', 'whisper-cpp', 'bin', 'Release', 'whisper-cli.exe'));
  assert.match(c.modele, /ggml-small-q5_1\.bin$/);
  assert.match(cheminsWhisper({ modeleEcoute: 'precis' }, { LOCALAPPDATA: 'C:\\L' }).modele, /ggml-large-v3-turbo-q5_0\.bin$/);
  assert.equal(cheminsWhisper({ whisperExe: 'D:\\w\\whisper-cli.exe' }).exe, 'D:\\w\\whisper-cli.exe');
});

test('écoute : la route transcrit un WAV, refuse le reste ; réglages : jamais un autre programme que whisper…exe', async () => {
  const { nettoyerReglages } = await import('./reglages.js');
  assert.equal(nettoyerReglages({ whisperExe: 'C:\\Windows\\System32\\cmd.exe' }).erreurs.length, 1);
  assert.equal(nettoyerReglages({ whisperExe: 'D:\\outils\\whisper-cli.exe', whisperModele: 'D:\\m\\ggml-small.bin', langueEcoute: 'fr' }).erreurs.length, 0);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-ecoute-'));
  const recus = [];
  const router = express.Router();
  await ia.register({ router, broadcast: () => {}, game: { snapshot: () => ({}) } }, {
    fichierReglages: path.join(dir, 'ia.json'),
    fichierHistorique: path.join(dir, 'h.json'),
    paroleOk: () => false, // voix de Windows : les tests ne lancent pas la voix naturelle installée sur le PC
    ollama: { installes: async () => [], charges: async () => [] },
    lireMemoire: async () => null,
    transcrireImpl: async (buf, o) => { recus.push([buf.length, o.langue]); return 'Combien j’ai de crédits ?'; },
    whisperPret: () => true,
    fetchImpl: async () => Response.json({}),
  });
  const app = express();
  app.use('/ia', router);
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const url = `http://127.0.0.1:${server.address().port}/ia/ecoute`;
  try {
    const ok = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav(1) });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).texte, 'Combien j’ai de crédits ?');
    assert.deepEqual(recus, [[44 + 32000, 'fr']]);
    const mauvais = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav(1, 44100) });
    assert.equal(mauvais.status, 400);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
