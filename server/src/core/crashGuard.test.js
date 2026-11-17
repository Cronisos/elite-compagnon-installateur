// Erreur imprévue hors d'une requête (core/crashGuard.js) : une ligne en français, la pile, puis l'arrêt (que
// server/dev.js relance). Vérifié sur de vrais processus Node : une erreur levée dans une minuterie (comme l'écriture
// ratée du balayage de l'EEP), une promesse rejetée sans traitement, chacun avec un serveur encore à l'écoute qui ne
// laisserait pas le processus s'arrêter tout seul.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describeError, installCrashGuard } from './crashGuard.js';

const GUARD_URL = pathToFileURL(fileURLToPath(new URL('./crashGuard.js', import.meta.url))).href;

/** Lance un petit script Node (module) ; rend { code, stderr } à sa fin, ou échoue au bout de 10 s. */
function run(body) {
  const script = `import { installCrashGuard } from ${JSON.stringify(GUARD_URL)};\ninstallCrashGuard();\n${body}\n`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => { stderr += d; });
    child.stdout.resume();
    const limit = setTimeout(() => {
      child.kill();
      reject(new Error(`toujours en vie après 10 s (aucun arrêt) :\n${stderr}`));
    }, 10_000);
    child.on('exit', (code) => {
      clearTimeout(limit);
      resolve({ code, stderr });
    });
  });
}

// Un serveur à l'écoute garde le processus en vie : sans l'arrêt de la garde, il ne finirait jamais
const LISTENING = "import net from 'node:net';\nnet.createServer().listen(0, '127.0.0.1');";

test('erreur levée dans une minuterie : message en français, pile, arrêt avec le code 1', async () => {
  const r = await run(`${LISTENING}\nsetTimeout(() => { throw new Error('EPERM simulé : sweep.json en lecture seule'); }, 30);`);
  assert.equal(r.code, 1, r.stderr);
  assert.match(r.stderr, /Erreur imprévue : le serveur s'arrête \(avec « npm run dev » ou « Lancer EliteApp\.cmd », il redémarre de lui-même dans 2 s\)\./);
  assert.match(r.stderr, /EPERM simulé : sweep\.json en lecture seule/);
  assert.match(r.stderr, /at Timeout\./, 'la pile suit');
});

test('promesse rejetée sans traitement : message en français, arrêt avec le code 1', async () => {
  const r = await run(`${LISTENING}\nsetTimeout(() => { Promise.reject(new Error('lecture ratée')); }, 30);`);
  assert.equal(r.code, 1, r.stderr);
  assert.match(r.stderr, /Promesse rejetée sans traitement : le serveur s'arrête/);
  assert.match(r.stderr, /lecture ratée/);
});

test('garde : un écouteur par événement, arrêt après le message, valeur rejetée quelconque décrite', () => {
  const proc = new EventEmitter();
  const logs = [];
  const exits = [];
  installCrashGuard({ proc, log: (t) => logs.push(t), exit: (c) => exits.push(c) });
  assert.equal(proc.listenerCount('uncaughtException'), 1);
  assert.equal(proc.listenerCount('unhandledRejection'), 1);
  proc.emit('unhandledRejection', { code: 'EBUSY', fichier: 'drills.json' });
  assert.deepEqual(exits, [1]);
  assert.match(logs[0], /^Promesse rejetée sans traitement : le serveur s'arrête/);
  assert.match(logs[0], /EBUSY/);
  assert.match(describeError('texte'), /'texte'/);
  assert.match(describeError(new Error('panne')), /^Error: panne\n\s+at /);
});

test('le serveur (src/index.js) branche la garde avant tout le reste', () => {
  const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(src, /^import \{ installCrashGuard \} from '\.\/core\/crashGuard\.js';$/m);
  const call = src.search(/^installCrashGuard\(\);$/m);
  assert.ok(call > 0, 'installCrashGuard() appelé au premier niveau');
  for (const later of ['removeStaleTemps(dataDir())', 'new PrismaClient', 'journal.start(', 'app.listen(']) {
    const at = src.indexOf(later);
    assert.ok(at > call, `${later} après la garde`);
  }
  assert.doesNotMatch(src, /process\.on\('(uncaughtException|unhandledRejection)'/, 'une seule garde, celle de core/crashGuard.js');
});
