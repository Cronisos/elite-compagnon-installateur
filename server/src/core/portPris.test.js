// Port du serveur déjà pris (core/portPris.js) : qui le tient, lu dans netstat et tasklist, et un message pour un joueur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messagePortPris, nomDansTasklist, pidSurPort, quiTientLePort } from './portPris.js';

// Sortie de « netstat -ano -p TCP » d'un Windows en français (l'état garde son nom anglais, mais il n'est pas lu)
const NETSTAT = [
  '',
  'Connexions actives',
  '',
  '  Proto  Adresse locale         Adresse distante       État',
  '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       2760',
  '  TCP    127.0.0.1:13001        0.0.0.0:0              LISTENING       77',
  '  TCP    127.0.0.1:3001         127.0.0.1:52000        ESTABLISHED     9999',
  '  TCP    127.0.0.1:3001         0.0.0.0:0              ABHÖREN         4321',
  '  TCP    [::]:5173              [::]:0                 LISTENING       555',
].join('\r\n');

test('port pris : PID de l’écoute sur le port exact (ni une connexion établie, ni 13001)', () => {
  assert.equal(pidSurPort(NETSTAT, 3001), 4321);
  assert.equal(pidSurPort(NETSTAT, 5173), 555);
  assert.equal(pidSurPort(NETSTAT, 8080), null);
  assert.equal(pidSurPort('', 3001), null);
  assert.equal(nomDansTasklist('"node.exe","4321","Console","1","45 000 Ko"\r\n'), 'node.exe');
  assert.equal(nomDansTasklist('INFO : aucune tâche en service ne correspond aux critères spécifiés.'), null);
});

test('port pris : netstat puis tasklist ; outils absents ou hors de Windows : null, jamais d’erreur', () => {
  const appels = [];
  const exec = (cmd, args) => {
    appels.push(cmd);
    return cmd === 'netstat' ? NETSTAT : '"Elite Compagnon.exe","4321","Console","1","1 Ko"';
  };
  assert.deepEqual(quiTientLePort(3001, { exec, platform: 'win32' }), { pid: 4321, nom: 'Elite Compagnon.exe' });
  assert.deepEqual(appels, ['netstat', 'tasklist']);
  assert.equal(quiTientLePort(3001, { exec: () => { throw new Error('ENOENT'); }, platform: 'win32' }), null);
  assert.deepEqual(quiTientLePort(3001, { exec: (cmd) => { if (cmd === 'tasklist') throw new Error('refus'); return NETSTAT; }, platform: 'win32' }), { pid: 4321, nom: null });
  assert.equal(quiTientLePort(3001, { exec: () => assert.fail('aucun outil lancé'), platform: 'linux' }), null);
});

test('port pris : message en français, sans « npm run dev », qui nomme le programme et dit quoi faire', () => {
  const nous = messagePortPris(3001, { pid: 4321, nom: 'node.exe' });
  assert.match(nous, /port 3001 de ce PC est déjà pris par « node\.exe » \(PID 4321\)/);
  assert.match(nous, /autre copie d'Elite Compagnon/);
  const autre = messagePortPris(3001, { pid: 12, nom: 'serveur-photo.exe' });
  assert.match(autre, /« serveur-photo\.exe » \(PID 12\)/);
  assert.match(autre, /gestionnaire des tâches/);
  assert.match(messagePortPris(3001, null), /déjà pris par un autre programme\./);
  for (const m of [nous, autre, messagePortPris(3001, null)]) assert.doesNotMatch(m, /npm/);
});
