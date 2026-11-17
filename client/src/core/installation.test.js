// Aucun texte montré au joueur ne lui demande « npm install » : un membre de l'escadron n'a pas de terminal, et un
// npm install lancé à la main laisse partir la télémétrie de Prisma (pas de CHECKPOINT_DISABLE). Il relance l'installateur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { texteOverlayAbsent, texteOverlayAbsentCourt } from './installation.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.resolve(ICI, '..');
const SERVEUR = path.resolve(ICI, '../../../server/src');

function sources(dossier) {
  const out = [];
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') out.push(...sources(p));
    } else if (/\.(jsx?|mjs)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

/** Lignes de code (pas les commentaires) qui contiennent « npm install ». */
function conseilsNpm(fichiers) {
  const trouves = [];
  for (const f of fichiers) {
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((ligne, i) => {
      const code = ligne.trim();
      if (/^(\/\/|\*|\/\*)/.test(code)) return;
      if (/npm i(nstall)?\b/.test(code.replace(/\/\/.*$/, ''))) trouves.push(`${path.relative(CLIENT, f)}:${i + 1}`);
    });
  }
  return trouves;
}

test('textes visibles du client : jamais « npm install »', () => {
  assert.deepEqual(conseilsNpm(sources(CLIENT)), []);
});

test('messages d’erreur du serveur : jamais « npm install »', () => {
  assert.deepEqual(conseilsNpm(sources(SERVEUR)), []);
});

test('overlay absent : l’installateur pour un joueur, la commande du projet pour qui développe', () => {
  assert.match(texteOverlayAbsent({}, false), /relance l'installateur d'Elite Compagnon/);
  assert.match(texteOverlayAbsent(undefined, false), /relance l'installateur d'Elite Compagnon/);
  assert.doesNotMatch(texteOverlayAbsent({}, false), /npm/);
  assert.doesNotMatch(texteOverlayAbsentCourt({}, false), /npm/);
  assert.match(texteOverlayAbsent({}, true), /npm run installer/);
});

test('overlay coupé exprès (ELITE_NO_OVERLAY) : on le dit, sans conseiller de réinstaller', () => {
  for (const dev of [false, true]) {
    for (const t of [texteOverlayAbsent({ coupe: true }, dev), texteOverlayAbsentCourt({ coupe: true }, dev)]) {
      assert.match(t, /coupées \(ELITE_NO_OVERLAY\)/);
      assert.doesNotMatch(t, /installateur|npm/);
    }
  }
});
