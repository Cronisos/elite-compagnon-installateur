// Modes de jeu : une seule déclaration (server/src/core/modes.js), reprise par l'interface, et concordance avec les
// modules clients qui ont un mode. Ici, d'après le texte de leur index (sans charger les composants React) ; le banc de
// contrôle refait la vérification sur les modules tels que Vite les charge (étape 75-pages).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as client from './modes.js';
import * as server from '../../../server/src/core/modes.js';

const MODULES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'modules');

test("l'interface reprend la déclaration du serveur telle quelle", () => {
  assert.equal(client.MODES, server.MODES);
  assert.equal(client.ROLES, server.ROLES);
  assert.equal(client.checkRole, server.checkRole);
  assert.equal(client.windowsOf, server.windowsOf);
});

/** Index des modules clients : { dossier, fichier, id, modeInfo (id passé à modeInfo), hud, hudPages (clés) }. */
function indexes() {
  const out = [];
  for (const d of fs.readdirSync(MODULES_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const file = ['index.js', 'index.jsx'].map((f) => path.join(MODULES_DIR, d.name, f)).find((f) => fs.existsSync(f));
    if (!file) continue;
    const text = fs.readFileSync(file, 'utf8');
    const body = text.slice(text.indexOf('export default'));
    const id = /\bid:\s*'([^']+)'/.exec(body)?.[1] ?? null;
    const modeCall = /\bmode:\s*modeInfo\('([^']+)'\)/.exec(body);
    const literal = /\bmode:\s*\{/.test(body);
    const hudPagesBlock = /\bhudPages:\s*\{([^}]*)\}/s.exec(body)?.[1] ?? '';
    const hudPages = [...hudPagesBlock.matchAll(/(?:^|[,{\s])'?([a-z0-9-]+)'?\s*:/g)].map((m) => m[1]);
    out.push({ dossier: d.name, fichier: path.relative(MODULES_DIR, file), id, modeInfo: modeCall?.[1] ?? null, literal, hud: /\bHud:\s*[A-Za-z]/.test(body), hudPages });
  }
  return out;
}

test('chaque module à mode y renvoie par modeInfo, avec son propre identifiant', () => {
  const all = indexes();
  assert.ok(all.length > 10, 'modules clients trouvés');
  for (const m of all) {
    assert.equal(m.literal, false, `${m.fichier} : mode écrit en dur, utilise modeInfo('${m.id}') (core/modes.js)`);
    if (m.modeInfo) assert.equal(m.modeInfo, m.id, `${m.fichier} : modeInfo('${m.modeInfo}') dans le module ${m.id}`);
  }
  const avecMode = all.filter((m) => m.modeInfo).map((m) => m.modeInfo).sort();
  assert.deepEqual(avecMode, server.MODES.map((m) => m.id).sort(), 'un module par mode déclaré, et un mode par module qui en a un');
});

test('fenêtres de chaque mode = son HUD puis ses hudPages, dans le même ordre', () => {
  for (const m of indexes().filter((x) => x.modeInfo)) {
    const attendu = [...(m.hud ? [m.id] : []), ...m.hudPages];
    assert.deepEqual(server.windowsOf(m.id), attendu, `${m.fichier} : fenêtres du mode dans server/src/core/modes.js`);
  }
});

test('modeName et modeInfo', () => {
  assert.equal(client.modeName('waypoints'), '⛏ Minage Rhino');
  assert.equal(client.modeName('polyvalent'), '✦ Polyvalent');
  assert.equal(client.modeName('inconnu'), 'inconnu');
  assert.equal(client.modeInfo('combat').label, 'Combat');
  assert.throws(() => client.modeInfo('constructor'), /Mode de jeu inconnu/);
});
