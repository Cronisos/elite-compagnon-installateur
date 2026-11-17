// Textes visibles sans nom de joueur : l'app part chez des membres de l'escadron qui ne connaissent pas son auteur. Les
// sources des règles disent « journaux de référence », « signalé par un joueur »… jamais un pseudo. Les commentaires du
// code peuvent le nommer (ils ne s'affichent pas).
//
// Le module escadron (server/src/modules/escadron, client/src/modules/escadron) est en refonte à part : hors de ce
// contrôle pour l'instant (sa table de règles cite encore un pseudo et un chemin du PC de l'auteur).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOUTES } from '../regles/index.js';

const RACINE = fileURLToPath(new URL('../../../', import.meta.url));
const NOM = /\bCro\b/;
const ECARTES = [/[\\/]modules[\\/]escadron[\\/]/, /[\\/]__golden__[\\/]/, /[\\/]fixtures[\\/]/, /\.test\.js$/, /[\\/]node_modules[\\/]/];

function fichiers(dossier) {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : fichiers(p);
    return /\.(js|jsx|mjs|cjs|json|html)$/.test(e.name) ? [p] : [];
  });
}

/** Le nom est-il hors d'un commentaire sur cette ligne ? (ligne de commentaire, ou nom après « // » : toléré) */
function horsCommentaire(ligne) {
  const t = ligne.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--')) return false;
  const i = ligne.search(NOM);
  const c = ligne.indexOf(' //');
  return !(c >= 0 && c < i);
}

test('aucun pseudo de joueur dans les textes visibles du serveur, de l’interface, de l’overlay et de l’app de bureau', () => {
  const fautes = [];
  // overlay/ : fenêtres en jeu (vision.html, main.js) ; desktop/ : boîtes de dialogue d'Electron, pages locales
  for (const base of ['server/src', 'client/src', 'overlay', 'desktop']) {
    for (const f of fichiers(path.join(RACINE, base))) {
      if (ECARTES.some((re) => re.test(f))) continue;
      fs.readFileSync(f, 'utf8').split('\n').forEach((ligne, n) => {
        if (NOM.test(ligne) && horsCommentaire(ligne)) fautes.push(`${path.relative(RACINE, f)}:${n + 1}`);
      });
    }
  }
  assert.deepEqual(fautes, [], 'texte visible qui nomme un joueur : écrire « journaux de référence », « signalé par un joueur »…');
});

test('fiches des règles (page Règles du jeu, vigie) : sources et explications sans pseudo', () => {
  assert.doesNotMatch(JSON.stringify(TOUTES), NOM);
  const regles = fs.readFileSync(path.join(RACINE, 'server/src/modules/regles/regles.json'), 'utf8');
  assert.doesNotMatch(regles, NOM);
});

test('le contrôle repère bien un nom dans un texte, pas dans un commentaire', () => {
  assert.equal(horsCommentaire("const a = 'dit par Cro';"), true);
  assert.equal(horsCommentaire('  // vu par Cro'), false);
  assert.equal(horsCommentaire("const a = 1; // choix de Cro"), false);
  assert.equal(horsCommentaire(' * relevé de Cro'), false);
  assert.equal(horsCommentaire('  <!-- maquette de Cro -->'), false);
  assert.equal(horsCommentaire('  <p>Réglé par Cro</p>'), true);
});
