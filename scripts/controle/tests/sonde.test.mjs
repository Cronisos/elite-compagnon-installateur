// Sonde du serveur isolé (banc/sonde.mjs) : elle relève ET refuse ce qu'un serveur isolé n'a pas à faire. Vérifiée sur
// un petit programme chargé avec elle, comme le serveur : connexion vers une adresse de documentation (192.0.2.1, jamais
// joignable, refusée avant toute connexion), nom à résoudre en « .invalid », lecture et écriture hors des dossiers
// permis, programme lancé, prototype pollué, tentative annoncée par la passerelle réseau du serveur. Rien ne sort de ce PC.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONTROLE } from '../banc/chemins.mjs';

const SONDE = path.join(CONTROLE, 'banc', 'sonde.mjs');

const ESSAI = `
import fs from 'node:fs';
import net from 'node:net';
import dns from 'node:dns';
import childProcess from 'node:child_process';
import diagnostics from 'node:diagnostics_channel';
import { readFileSync } from 'node:fs';
const [permis, horsLecture, horsEcriture] = process.argv.slice(2);
const res = {};
const essai = (nom, fn) => { try { fn(); res[nom] = 'ok'; } catch (e) { res[nom] = e.code || e.message; } };
essai('lirePermis', () => fs.readFileSync(permis));
essai('lireDehors', () => readFileSync(horsLecture));
essai('ecrireDehors', () => fs.writeFileSync(horsEcriture, 'x'));
essai('programme', () => childProcess.spawn('cmd.exe', ['/c', 'exit']));
res.connexion = await new Promise((r) => { const s = net.connect({ host: '192.0.2.1', port: 9 }); s.on('connect', () => r('connecté')); s.on('error', (e) => r(e.code)); });
res.dns = await new Promise((r) => dns.lookup('exemple.invalid', (e) => r(e ? e.code : 'résolu')));
const local = net.createServer().listen(0, '127.0.0.1');
await new Promise((r) => local.once('listening', r));
res.local = await new Promise((r) => { const s = net.connect(local.address().port, '127.0.0.1'); s.on('connect', () => { s.destroy(); r('ok'); }); s.on('error', (e) => r(e.code)); });
local.close();
// Ce qu'annonce la passerelle réseau du serveur (core/net.js) : relevé tel quel, sans rien refuser
diagnostics.channel('elite-compagnon:net').publish({ url: 'https://spansh.co.uk/api/dump/633943823090', refused: 'NET_OFF' });
process.send({ type: 'resultats', res });
process.on('message', (m) => {
  if (m.type === 'polluer') { Object.prototype.pollue = 1; process.send({ type: 'pollue' }); }
  if (m.type === 'fin') process.exit(0);
});
`;

test('sonde : réseau, programmes et disque hors du banc relevés et refusés ; prototypes surveillés', { timeout: 60_000 }, async () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-controle-'));
  const ailleurs = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-controle-'));
  try {
    const script = path.join(racine, 'essai.mjs');
    fs.writeFileSync(script, ESSAI);
    const permis = path.join(racine, 'permis.txt');
    fs.writeFileSync(permis, 'ok');
    const horsLecture = path.join(ailleurs, 'hors.txt');
    fs.writeFileSync(horsLecture, 'secret');
    const horsEcriture = path.join(ailleurs, 'ecrit.txt');
    const enfant = fork(script, [permis, horsLecture, horsEcriture], {
      execArgv: ['--import', pathToFileURL(SONDE).href],
      env: { ...process.env, CONTROLE_SONDE: JSON.stringify({ lire: [path.dirname(process.execPath)], ecrire: [racine], interdits: [] }) },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const message = (type) => new Promise((resolve) => enfant.on('message', (m) => m?.type === type && resolve(m)));
    const { res } = await message('resultats');
    assert.equal(res.lirePermis, 'ok', 'lecture dans le dossier du banc');
    assert.equal(res.lireDehors, 'EACCES', 'lecture hors des dossiers permis');
    assert.equal(res.ecrireDehors, 'EACCES', 'écriture hors du dossier du banc');
    assert.equal(res.programme, 'EACCES', 'programme refusé');
    assert.equal(res.connexion, 'ECONNREFUSED', 'connexion vers l’extérieur refusée');
    assert.equal(res.dns, 'ENOTFOUND', 'résolution DNS refusée');
    assert.equal(res.local, 'ok', 'connexion à ce PC permise');
    assert.equal(fs.existsSync(horsEcriture), false, 'rien écrit dehors');

    const demander = (type) => {
      const id = `t-${type}-${Math.random()}`;
      const r = new Promise((resolve) => enfant.on('message', (m) => m?.id === id && resolve(m)));
      enfant.send({ type, id });
      return r;
    };
    await demander('sonde:repere');
    enfant.send({ type: 'polluer' });
    await message('pollue');
    const releves = await demander('sonde');
    assert.deepEqual(releves.reseau.map((x) => x.op).sort(), ['dns lookup', 'tcp']);
    assert.match(releves.reseau.find((x) => x.op === 'tcp').cible, /^192\.0\.2\.1:9$/);
    assert.deepEqual(releves.programmes.map((x) => x.op), ['spawn']);
    assert.deepEqual(releves.disque.map((x) => x.raison).sort(), ['lecture hors des dossiers permis', 'écriture hors du dossier du banc']);
    assert.deepEqual(releves.prototypes, ['Object.prototype.pollue ajouté']);
    assert.deepEqual(releves.sorties, [{ url: 'https://spansh.co.uk/api/dump/633943823090', refus: 'NET_OFF' }], 'tentatives de la passerelle relevées');
    assert.equal(releves.sortiesPerdues, 0);
    enfant.send({ type: 'fin' });
    await new Promise((r) => enfant.once('exit', r));
  } finally {
    fs.rmSync(racine, { recursive: true, force: true });
    fs.rmSync(ailleurs, { recursive: true, force: true });
  }
});
