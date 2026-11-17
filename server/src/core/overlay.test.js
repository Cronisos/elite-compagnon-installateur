// Ouverture des fenêtres de l'overlay (core/overlay.js) : les ordres du même instant partent en UN lancement, avec le
// dernier état complet (deux lancements à quelques ms se croisaient dans l'overlay et laissaient une fenêtre orpheline),
// chaque lancement porte son heure, toujours croissante (--at : l'overlay écarte un ordre plus ancien arrivé en dernier),
// un lancement impossible n'arrête pas le serveur, et le choix enregistré illisible est mis de côté. Dossier de données
// temporaire, lancement simulé : rien n'est lancé.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-overlay-'));
process.env.ELITE_DATA_DIR = DIR;
delete process.env.ELITE_NO_OVERLAY;
fs.writeFileSync(path.join(DIR, 'overlay.json'), '{"mode":"comb'); // coupé par une ancienne version
const warn = console.warn;
const warns = [];
console.warn = (m) => warns.push(String(m));
const overlay = await import('./overlay.js');
console.warn = warn;

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

test('choix enregistré illisible : mis de côté au démarrage, état vide', () => {
  assert.deepEqual({ mode: overlay.overlayMode() }, { mode: null });
  assert.ok(fs.readdirSync(DIR).some((n) => n.startsWith('overlay.json.illisible-')));
  assert.ok(warns.some((m) => /Overlay : fichier illisible, mis de côté/.test(m)));
});

test('trois ordres du même instant : un seul lancement, avec le dernier état et son heure', async () => {
  const lancements = [];
  overlay.setOverlaySpawnForTest((exe, args) => {
    lancements.push(args.slice(1));
    const c = new EventEmitter();
    c.unref = () => {};
    return c;
  });
  try {
    const avant = Date.now();
    overlay.showOverlay({ mode: 'combat', glance: false, pages: ['combat'] });
    overlay.showOverlay({ mode: 'combat', glance: true, pages: ['combat', 'glance'] });
    overlay.showOverlay({ mode: 'combat', glance: false, pages: ['combat'] });
    assert.equal(lancements.length, 0, 'rien tout de suite');
    await attendre(overlay.LAUNCH_DELAY_MS + 80);
    assert.equal(lancements.length, 1);
    assert.equal(lancements[0][0], '--only=combat');
    const at1 = Number(/^--at=(\d+)$/.exec(lancements[0][1])?.[1]);
    assert.ok(at1 >= avant && at1 <= Date.now(), `heure de l'ordre : ${lancements[0][1]}`);
    // Le choix est enregistré à chaque ordre, d'un coup (core/atomic.js)
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(DIR, 'overlay.json'), 'utf8')).pages, ['combat']);
    overlay.showOverlay({ mode: null, glance: false, pages: [] });
    await attendre(overlay.LAUNCH_DELAY_MS + 80);
    assert.equal(lancements.length, 2);
    assert.equal(lancements[1][0], '--only=,', 'tout masquer : liste vide, envoyée en « , »');
    assert.ok(Number(lancements[1][1].slice(5)) > at1, 'heure strictement croissante');
  } finally {
    overlay.setOverlaySpawnForTest();
  }
});

test('lancement impossible (exception de spawn) : écrit dans la console, le serveur continue', async () => {
  const erreurs = [];
  const error = console.error;
  console.error = (m) => erreurs.push(String(m));
  overlay.setOverlaySpawnForTest(() => {
    throw new Error('EPERM simulé');
  });
  try {
    overlay.showOverlay({ mode: 'combat', glance: false, pages: ['combat'] });
    await attendre(overlay.LAUNCH_DELAY_MS + 80); // une exception dans la minuterie ferait échouer ce test (processus)
    assert.ok(erreurs.some((m) => /Overlay : lancement impossible \(EPERM simulé\)/.test(m)), erreurs.join('\n'));
  } finally {
    console.error = error;
    overlay.setOverlaySpawnForTest();
    fs.rmSync(DIR, { recursive: true, force: true });
  }
});

test('disposer les fenêtres : toutes ouvertes en plus, --disposer=1 puis --disposer=0 une fois, rien d’enregistré', async () => {
  const o = await import('./overlay.js');
  const ordres = [];
  o.setOverlayLauncher((args) => ordres.push(args));
  assert.throws(() => o.disposerOverlay('oui'), /on/);
  assert.throws(() => o.disposerOverlay(true, []), /Pages/);
  assert.throws(() => o.disposerOverlay(true, ['../x']), /invalide/);
  const avant = o.overlaySnapshot();
  o.disposerOverlay(true, ['fsdcool', 'carrier', 'glance']);
  assert.equal(o.overlayState().disposition, true);
  assert.ok(o.overlayLaunchPages().includes('fsdcool'));
  assert.deepEqual(o.overlaySnapshot().pages, avant.pages, 'le mode et ses fenêtres ne changent pas');
  await new Promise((r) => setTimeout(r, 400));
  assert.ok(ordres.at(-1).includes('--disposer=1'));
  o.disposerOverlay(false);
  await new Promise((r) => setTimeout(r, 400));
  assert.ok(ordres.at(-1).includes('--disposer=0'));
  assert.ok(!ordres.at(-1).some((a) => a.includes('fsdcool')));
  assert.equal(o.overlayState().disposition, undefined);
  o.setOverlayLauncher(null);
});
