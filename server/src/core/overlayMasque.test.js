// « Tout cacher » de l'app de bureau (core/overlay.js, masquerOverlay) : les ordres à l'overlay portent --masque=1
// tant que c'est caché, --masque=0 une seule fois au retour, rien sinon ; jamais un lancement pour cacher.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Dossier de données temporaire : sans lui, overlay.json était écrit dans server/data du dépôt à chaque essai
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-overlay-masque-'));
process.env.ELITE_DATA_DIR = DIR;
const { LAUNCH_DELAY_MS, masquerOverlay, overlayMasque, setOverlayExtra, setOverlayLauncher } = await import('./overlay.js');
test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));

const attendre = () => new Promise((r) => setTimeout(r, LAUNCH_DELAY_MS + 60));

test('tout cacher : --masque=1 tant que c’est caché, --masque=0 une fois au retour, jamais un lancement', async () => {
  const ordres = [];
  setOverlayLauncher((args) => ordres.push(args));
  try {
    masquerOverlay(true);
    await attendre();
    assert.equal(overlayMasque(), true);
    assert.ok(ordres.at(-1).includes('--masque=1'));
    assert.ok(ordres.at(-1).includes('--if-running'), 'cacher ne lance jamais l’overlay');
    setOverlayExtra('navroute', true); // une fenêtre qui s'ouvre pendant ce temps : demandée cachée
    await attendre();
    assert.ok(ordres.at(-1).includes('--masque=1'));
    masquerOverlay(false);
    await attendre();
    assert.ok(ordres.at(-1).includes('--masque=0'));
    setOverlayExtra('navroute', false);
    await attendre();
    assert.ok(!ordres.at(-1).some((a) => a.startsWith('--masque')), 'ordre habituel : rien sur le masque');
    const n = ordres.length;
    masquerOverlay(false); // déjà visible : rien à envoyer
    await attendre();
    assert.equal(ordres.length, n);
  } finally {
    setOverlayLauncher(null);
  }
});

test('overlay toujours actif : lancé au démarrage, ordres avec --rester et jamais --if-running', async () => {
  const { garderOverlayActif, overlayToujours } = await import('./overlay.js');
  assert.equal(overlayToujours({}), false);
  assert.equal(garderOverlayActif({}), false, 'npm run dev : pas lancé sans fenêtre');
  const ordres = [];
  setOverlayLauncher((args) => ordres.push(args));
  const avant = process.env.ELITE_OVERLAY_TOUJOURS;
  process.env.ELITE_OVERLAY_TOUJOURS = '1';
  try {
    assert.equal(garderOverlayActif(), true);
    await attendre();
    assert.ok(ordres.at(-1).includes('--rester'));
    assert.ok(!ordres.at(-1).includes('--if-running'));
    setOverlayExtra('navroute', false);
    await attendre();
    assert.ok(ordres.at(-1).includes('--rester'));
    assert.ok(!ordres.at(-1).includes('--if-running'), 'toujours actif : il doit tourner');
  } finally {
    if (avant === undefined) delete process.env.ELITE_OVERLAY_TOUJOURS;
    else process.env.ELITE_OVERLAY_TOUJOURS = avant;
    setOverlayLauncher(null);
  }
});
