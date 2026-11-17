// Surveillance du serveur en développement (core/devSupervisor.js) : relance après un plantage, sans boucle sans fin,
// et la relance voulue (code modifié) n'est pas un plantage. Processus simulés : rien n'est lancé. Puis le vrai
// server/dev.js, copié dans un dossier temporaire avec un faux serveur qui plante dans une minuterie : il doit le
// relancer (avant, il ne relançait qu'après un changement du code, et l'app restait morte).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CRASH_DELAY_MS, superviseServer } from './devSupervisor.js';

const SERVER_DIR = fileURLToPath(new URL('../../', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Faux serveur : kill() le termine tout de suite, sauf `slowKill` (il s'arrête quand le test appelle end()) et
 * `killFails` (arrêt refusé, comme Node : « error » émis tout de suite, et le processus continue).
 */
function fakeChild(n, { slowKill = false, noPid = false, killFails = false } = {}) {
  const c = new EventEmitter();
  c.pid = noPid ? undefined : 1000 + n;
  c.exitCode = null;
  c.signalCode = null;
  c.kills = 0;
  c.end = (code = null, signal = 'SIGTERM') => {
    c.exitCode = code;
    c.signalCode = code === null ? signal : null;
    c.emit('exit', code, code === null ? signal : null);
  };
  c.killFails = killFails;
  c.kill = () => {
    c.kills += 1;
    if (c.killFails) {
      c.emit('error', Object.assign(new Error('kill EPERM'), { code: 'EPERM' }));
      return false;
    }
    if (!slowKill) c.end();
    return true;
  };
  c.crash = (code = 1) => c.end(code);
  return c;
}

function banc(options = {}) {
  const enfants = [];
  const minuteries = [];
  let t = 0;
  const logs = [];
  const sup = superviseServer({
    spawnChild: () => {
      const c = fakeChild(enfants.length, typeof options.child === 'function' ? options.child(enfants.length) : options.child);
      enfants.push(c);
      return c;
    },
    log: (m) => logs.push(m),
    now: () => t,
    setTimer: (fn, ms) => minuteries.push({ fn, ms }),
  });
  const avancer = (ms) => {
    t += ms;
    for (const m of minuteries.splice(0)) m.fn();
  };
  return { sup, enfants, minuteries, logs, avancer };
}

test('plantage : relancé au bout de 2 s, avec un message', () => {
  const b = banc();
  b.sup.start();
  b.enfants[0].crash(1);
  assert.equal(b.minuteries.length, 1);
  assert.equal(b.minuteries[0].ms, 2000);
  assert.match(b.logs[0], /arrêté \(code 1\) : relance dans 2 s/);
  b.avancer(2000);
  assert.equal(b.enfants.length, 2, 'relancé');
});

test('plantages en boucle : plus de relance après 5 en une minute', () => {
  const b = banc();
  b.sup.start();
  for (let i = 0; i < 6; i++) {
    b.enfants.at(-1).crash(1);
    b.avancer(2000);
  }
  assert.equal(b.enfants.length, 6, '5 relances, pas une de plus');
  assert.equal(b.sup.gaveUp(), true);
  assert.match(b.logs.at(-1), /plus de relance automatique/);
  // Le code change ensuite : relance normale, compteur remis à zéro
  b.sup.restart();
  assert.equal(b.enfants.length, 7);
  assert.equal(b.sup.gaveUp(), false);
});

test('plantages espacés de plus d’une minute : toujours relancé', () => {
  const b = banc();
  b.sup.start();
  for (let i = 0; i < 10; i++) {
    b.enfants.at(-1).crash(1);
    b.avancer(61_000);
  }
  assert.equal(b.enfants.length, 11);
  assert.equal(b.sup.gaveUp(), false);
});

test('code modifié : arrêt voulu puis une seule relance, sans compter un plantage', () => {
  const b = banc();
  b.sup.start();
  b.sup.restart();
  assert.equal(b.enfants.length, 2, 'relancé tout de suite');
  assert.equal(b.minuteries.length, 0, 'aucune relance de plantage en plus');
  assert.deepEqual(b.logs, []);
});

test('code modifié deux fois avant la fin de l’arrêt : un seul nouveau serveur (jamais deux sur le même port)', () => {
  const b = banc({ child: { slowKill: true } });
  b.sup.start();
  b.sup.restart();
  b.sup.restart();
  assert.equal(b.enfants[0].kills, 1, 'un seul arrêt demandé');
  b.enfants[0].end();
  assert.equal(b.enfants.length, 2, 'une seule relance');
  assert.equal(b.minuteries.length, 0);
  // Le nouveau plante ensuite : relancé comme un plantage ordinaire
  b.enfants[1].crash(1);
  b.avancer(2000);
  assert.equal(b.enfants.length, 3);
});

test('code modifié pendant l’attente d’une relance : relancé une fois, la minuterie ne relance pas en plus', () => {
  const b = banc();
  b.sup.start();
  b.enfants[0].crash(1);
  b.sup.restart();
  assert.equal(b.enfants.length, 2);
  b.avancer(2000);
  assert.equal(b.enfants.length, 2, 'pas de second serveur');
});

test('lancement impossible (erreur, pas de « exit ») : compté comme un plantage, dev.js reste en vie', () => {
  const b = banc({ child: (n) => ({ noPid: n === 0 }) });
  b.sup.start();
  b.enfants[0].emit('error', new Error('spawn EMFILE'));
  assert.match(b.logs[0], /lancement impossible : spawn EMFILE\) : relance dans 2 s/);
  b.avancer(2000);
  assert.equal(b.enfants.length, 2);
  // Une erreur d'un serveur qui tourne (arrêt refusé) : signalée, sans relance
  b.enfants[1].emit('error', new Error('kill EPERM'));
  assert.match(b.logs.at(-1), /^Serveur : kill EPERM$/);
  assert.equal(b.minuteries.length, 0);
});

test('arrêt refusé au changement du code : signalé, et le changement suivant réessaie (jamais bloqué)', () => {
  const b = banc({ child: { killFails: true } });
  b.sup.start();
  b.sup.restart();
  assert.equal(b.enfants.length, 1, 'pas de second serveur sur le même port tant que le premier tourne');
  assert.match(b.logs.at(-1), /^Serveur : arrêt refusé \(kill EPERM\), il tourne toujours/);
  b.sup.restart();
  assert.equal(b.enfants[0].kills, 2, 'nouvel essai d’arrêt au changement suivant');
  // L'arrêt passe enfin : relance tout de suite, comptée comme un arrêt voulu (pas un plantage)
  b.enfants[0].killFails = false;
  b.sup.restart();
  assert.equal(b.enfants[0].kills, 3);
  assert.equal(b.enfants.length, 2, 'relancé après son arrêt');
  assert.equal(b.minuteries.length, 0, 'aucune relance de plantage en plus');
});

test('le message d’arrêt du serveur (core/crashGuard.js) annonce l’attente réelle de la relance', async () => {
  const { RELAUNCH_NOTE } = await import('./crashGuard.js');
  assert.ok(RELAUNCH_NOTE.endsWith(`dans ${CRASH_DELAY_MS / 1000} s`), RELAUNCH_NOTE);
  const b = banc();
  b.sup.start();
  b.enfants[0].crash(1);
  assert.equal(b.minuteries[0].ms, CRASH_DELAY_MS);
});

test('vrai server/dev.js : un serveur planté dans une minuterie est relancé de lui-même', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-dev-relance-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));
  fs.mkdirSync(path.join(dir, 'src', 'core'), { recursive: true });
  fs.copyFileSync(path.join(SERVER_DIR, 'dev.js'), path.join(dir, 'dev.js'));
  for (const f of ['fingerprint.js', 'devSupervisor.js']) fs.copyFileSync(path.join(SERVER_DIR, 'src', 'core', f), path.join(dir, 'src', 'core', f));
  fs.writeFileSync(path.join(dir, 'package.json'), '{ "type": "module" }\n');
  // Faux serveur : note son lancement (hors de src, que dev.js surveille), puis plante dans une minuterie, comme
  // l'écriture ratée du balayage de l'EEP
  fs.writeFileSync(path.join(dir, 'src', 'index.js'), [
    "import fs from 'node:fs';",
    "fs.appendFileSync(new URL('../lancements.txt', import.meta.url), `${process.pid}\\n`);",
    "setTimeout(() => { throw new Error('EPERM simulé dans une minuterie'); }, 50);",
    '',
  ].join('\n'));
  const lancements = () => {
    try {
      return fs.readFileSync(path.join(dir, 'lancements.txt'), 'utf8').split('\n').filter(Boolean).length;
    } catch {
      return 0;
    }
  };
  const dev = spawn(process.execPath, ['dev.js'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let sortie = '';
  for (const s of [dev.stdout, dev.stderr]) {
    s.setEncoding('utf8');
    s.on('data', (d) => { sortie += d; });
  }
  const fin = new Promise((r) => dev.once('exit', r));
  try {
    const limite = Date.now() + 15_000;
    while (lancements() < 2 && dev.exitCode === null && Date.now() < limite) await sleep(100);
    assert.equal(dev.exitCode, null, `dev.js toujours en vie\n${sortie}`);
    assert.ok(lancements() >= 2, `serveur relancé après son plantage : ${lancements()} lancement(s)\n${sortie}`);
    assert.match(sortie, /EPERM simulé dans une minuterie/);
    assert.match(sortie, /Le serveur s'est arrêté \(code 1\) : relance dans 2 s\./);
  } finally {
    dev.kill();
    let limite;
    await Promise.race([fin, new Promise((r) => { limite = setTimeout(r, 5000); })]);
    clearTimeout(limite);
    await sleep(300); // le dernier faux serveur plante de lui-même 50 ms après son lancement
  }
});
