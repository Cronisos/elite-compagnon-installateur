// Sauvegarde différée de Mes repères (deferredSave.js) : une écriture ratée dans sa minuterie (sweep.json en lecture
// seule, verrou d'un antivirus, disque plein) est dite dans la console et n'arrête jamais le serveur ; demandée tout de
// suite (route), elle laisse remonter son erreur. Vraie minuterie et vrai fichier en lecture seule à la fin.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeFileAtomicSync, writeJsonAtomicSync } from '../../core/atomic.js';
import { deferredSave, ecritureSiChange } from './deferredSave.js';
import { EepLibrary } from './eeps.js';

function banc(write) {
  const timers = [];
  const logs = [];
  const save = deferredSave({
    write,
    delayMs: 10000,
    label: 'Balayage',
    log: (m) => logs.push(m),
    setTimer: (fn, ms) => {
      const t = { fn, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimer: (t) => {
      if (t) t.cleared = true;
    },
  });
  const fire = () => {
    for (const t of timers.splice(0)) if (!t.cleared) t.fn();
  };
  return { save, timers, logs, fire };
}

test('plusieurs changements : une seule écriture, 10 s plus tard', () => {
  let writes = 0;
  const b = banc(() => { writes += 1; });
  b.save.soon();
  b.save.soon();
  b.save.soon();
  assert.equal(b.timers.length, 1);
  assert.equal(b.timers[0].ms, 10000);
  assert.equal(b.save.pending(), true);
  b.fire();
  assert.equal(writes, 1);
  assert.equal(b.save.pending(), false);
  b.save.soon(); // un changement après l'écriture : une nouvelle minuterie
  assert.equal(b.timers.length, 1);
});

test('écriture ratée dans la minuterie : dite dans la console, jamais levée ; la suivante réessaie', () => {
  let fail = true;
  let writes = 0;
  const b = banc(() => {
    writes += 1;
    if (fail) throw Object.assign(new Error("EPERM: operation not permitted, open 'sweep.json'"), { code: 'EPERM' });
  });
  b.save.soon();
  assert.doesNotThrow(() => b.fire());
  assert.deepEqual(b.logs, ["Balayage : non enregistré (EPERM: operation not permitted, open 'sweep.json')"]);
  assert.equal(b.save.pending(), false, 'pas bloquée après l’échec');
  fail = false;
  b.save.soon();
  b.fire();
  assert.equal(writes, 2);
  assert.equal(b.logs.length, 1);
});

test('tout de suite (route) : écrit, annule l’écriture prévue, et laisse remonter l’erreur', () => {
  let writes = 0;
  let fail = false;
  const b = banc(() => {
    writes += 1;
    if (fail) throw new Error('ENOSPC: no space left on device');
  });
  b.save.soon();
  b.save.now();
  assert.equal(writes, 1);
  assert.equal(b.timers[0].cleared, true);
  assert.equal(b.save.pending(), false);
  b.fire();
  assert.equal(writes, 1, 'l’écriture prévue n’a pas lieu en plus');
  fail = true;
  assert.throws(() => b.save.now(), /ENOSPC/);
  assert.deepEqual(b.logs, [], 'rien dans la console : la route répond 500 avec l’erreur');
});

test('eeps.json : deux positions du SRV qui n’apprennent rien → une seule écriture ; un vrai changement réécrit', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-eeps-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'eeps.json');
  const R = 2957164.25;
  const ici = (lat, lon) => ({ latitude: lat, longitude: lon, body: 'Planète Test 4', system: 'Système Test', planetRadius: R, vehicle: 'srv', heading: 0 });
  const lib = new EepLibrary();
  lib.marquerCentre(ici(0, 0));
  lib.sweep.setEdge(ici((3000 / R) * (180 / Math.PI), 0));
  let ecritures = 0;
  let rate = false;
  const ecrire = ecritureSiChange((texte) => {
    ecritures += 1;
    if (rate) throw new Error('EPERM: operation not permitted');
    writeFileAtomicSync(file, texte);
  });
  const b = banc(() => ecrire(lib));
  // Comme index.js : chaque position du SRV demande une sauvegarde (regroupée en une par minuterie)
  for (const p of [ici(0, 0), ici(0, 0)]) {
    lib.follow(p);
    b.save.soon();
    b.fire();
  }
  assert.equal(ecritures, 1, 'la seconde position n’a rien appris : pas de nouvelle écriture');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), JSON.parse(JSON.stringify(lib)));
  lib.renommer(lib.actif.id, 'Le bon coin');
  rate = true;
  b.save.soon();
  b.fire();
  assert.equal(ecritures, 2);
  assert.equal(b.logs.length, 1, 'échec dit dans la console');
  rate = false;
  b.save.now();
  assert.equal(ecritures, 3, 'après un échec, le même contenu est réessayé');
  assert.match(fs.readFileSync(file, 'utf8'), /Le bon coin/);
  b.save.now();
  assert.equal(ecritures, 3);
});

// Sous Windows, un fichier en lecture seule ne peut pas être remplacé (EPERM) ; ailleurs, seul le dossier compte
const WINDOWS = process.platform === 'win32' ? {} : { skip: 'lecture seule d’un fichier : propre à Windows' };

test('vrai fichier en lecture seule, vraie minuterie : le processus continue, le fichier est intact', WINDOWS, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-sauvegarde-differee-'));
  const file = path.join(dir, 'sweep.json');
  t.after(() => {
    try {
      fs.chmodSync(file, 0o644);
    } catch {
      // déjà parti
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  fs.writeFileSync(file, '{"avant":true}');
  fs.chmodSync(file, 0o444);
  const logs = [];
  const save = deferredSave({ write: () => writeJsonAtomicSync(file, { apres: true }), delayMs: 5, label: 'Balayage', log: (m) => logs.push(m) });
  save.soon();
  await new Promise((r) => setTimeout(r, 1000)); // renommage réessayé (core/atomic.js), puis abandon
  assert.equal(logs.length, 1, 'échec dit une fois');
  assert.match(logs[0], /^Balayage : non enregistré \((EPERM|EACCES)/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"avant":true}');
  assert.deepEqual(fs.readdirSync(dir), ['sweep.json'], 'aucun fichier temporaire laissé');
});
