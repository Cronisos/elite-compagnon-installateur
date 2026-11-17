// Fenêtres de l'overlay sans connexion à l'app (core/hudConnection.js) : au bout de 10 s, la fenêtre dit que ses
// valeurs sont figées, au lieu de les présenter comme en direct. Le vrai comportement dans Chrome (serveur arrêté
// pendant que les fenêtres sont ouvertes) est vérifié par l'étape 75-pages de npm run controle.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OFFLINE_CLASS, OFFLINE_MS, OFFLINE_TEXT, offlineTimer } from './hudConnection.js';

/** Fausse minuterie : avancer(ms) déclenche ce qui est dû. */
function horloge() {
  let t = 0;
  const minuteries = new Map();
  let n = 0;
  return {
    setTimer: (fn, ms) => (minuteries.set(++n, { fn, at: t + ms }), n),
    clearTimer: (id) => minuteries.delete(id),
    avancer(ms) {
      t += ms;
      for (const [id, m] of [...minuteries]) if (m.at <= t) {
        minuteries.delete(id);
        m.fn();
      }
    },
  };
}

test('coupure : rien pendant 10 s (reconnexion ordinaire), puis le bandeau ; retour : il s’efface', () => {
  assert.equal(OFFLINE_MS, 10_000);
  assert.match(OFFLINE_TEXT, /Connexion à l'app perdue/);
  assert.equal(OFFLINE_CLASS, 'hud-offline');
  const h = horloge();
  const vus = [];
  const t = offlineTimer((v) => vus.push(v), h);
  t.connected(false); // pas encore connecté à l'ouverture
  h.avancer(9_999);
  assert.deepEqual(vus, []);
  t.connected(true); // connecté à temps : rien
  h.avancer(60_000);
  assert.deepEqual(vus, []);
  t.connected(false); // l'app s'arrête
  h.avancer(10_000);
  assert.deepEqual(vus, [true]);
  t.connected(false); // encore coupé : pas de nouvel avis
  h.avancer(60_000);
  assert.deepEqual(vus, [true]);
  t.connected(true);
  assert.deepEqual(vus, [true, false]);
  t.connected(false);
  t.stop(); // fenêtre fermée : plus rien
  h.avancer(60_000);
  assert.deepEqual(vus, [true, false]);
});

test('chaque fenêtre de l’overlay (/hud/…) passe par l’indicateur de connexion (App.jsx)', () => {
  const app = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  const hud = [...app.matchAll(/path=\{`\/hud\/[^`]*`\}\s+element=\{([^\n]*)\}\s*\/>/g)].map((m) => m[1]);
  assert.equal(hud.length, 2, 'les fenêtres des modules (Hud) et les pages en plus (hudPages)');
  for (const e of hud) assert.match(e, /<HudConnection>/);
});
