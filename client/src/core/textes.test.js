// Textes montrés au joueur : tutoiement partout, nom de l'app à l'endroit (« Enova »), onglets en français.
// Lus dans l'interface (client/src) ET dans le serveur (server/src : ses messages d'erreur s'affichent tels quels dans
// les pages), l'app de bureau et l'overlay. Tous les modules, escadron compris.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '../../..');
const DOSSIERS = ['client/src', 'server/src', 'desktop', 'overlay'];
const HORS = new Set(['node_modules', '__golden__', 'dist']);

function sources(dossier) {
  const out = [];
  if (!fs.existsSync(dossier)) return out;
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) {
      if (!HORS.has(e.name)) out.push(...sources(p));
    } else if (/\.(jsx?|mjs|html)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

const FICHIERS = [...DOSSIERS.flatMap((d) => sources(path.join(RACINE, d))), path.join(RACINE, 'client/index.html')];

/**
 * Passages des lignes de code (commentaires exclus) qui correspondent à `motif` (drapeau g) : « fichier:ligne : mot ».
 * `garder(mot)` écarte un passage ; `sauf` : lignes permises ({ fichier, motif }).
 */
function trouver(motif, { garder = () => true, sauf = [] } = {}) {
  const g = new RegExp(motif.source, motif.flags.includes('g') ? motif.flags : `${motif.flags}g`);
  const out = [];
  for (const f of FICHIERS) {
    const rel = path.relative(RACINE, f).replace(/\\/g, '/');
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((ligne, i) => {
      const code = ligne.trim();
      if (/^(\/\/|\*|\/\*|\{\/\*)/.test(code)) return;
      const sansCommentaire = code.replace(/\s\/\/ .*$/, '');
      if (sauf.some((s) => s.fichier === rel && s.motif.test(sansCommentaire))) return;
      for (const m of sansCommentaire.matchAll(g)) if (garder(m[0])) out.push(`${rel}:${i + 1} : ${m[0]}`);
    });
  }
  return out;
}

// Impératif ou présent en -ez (lancez, saisissez-la, collez-le, réessayez…), sans la casse, et vous / votre / vos.
// « Faites » seulement avec sa majuscule (tête de phrase) : « les applications faites » est un participe.
const LETTRE = 'a-zàâäçéèêëîïôöûùüÿœæ';
const VOUS = new RegExp(`(?<![${LETTRE}])(?:[${LETTRE}]+ez(?:-(?:le|la|les|moi|en|y|lui|leur))?|vous|votre|vos)(?![${LETTRE}])|\\bFaites\\b`, 'giu');
// Mots en -ez qui ne vouvoient personne
const MOTS_EN_EZ = new Set(['chez', 'assez', 'nez', 'rez']);
const vouvoie = (mot) => (mot.toLowerCase() === 'faites' ? mot === 'Faites' : !MOTS_EN_EZ.has(mot.toLowerCase()));
// Ancien texte relu en base pour être remplacé, jamais affiché (server/src/modules/links/index.js)
const EXCEPTIONS = [{ fichier: 'server/src/modules/links/index.js', motif: /^const ANCIENNE_SOURCE = / }];

test('le motif voit les formes vouvoyées, avec ou sans majuscule, et laisse « chez », « assez », « faites »', () => {
  const vus = (t) => [...t.matchAll(VOUS)].map((m) => m[0]).filter(vouvoie);
  assert.deepEqual(vus('Position inconnue : lancez le jeu.'), ['lancez']);
  assert.deepEqual(vus('Message copié : collez-le dans Discord.'), ['collez-le']);
  assert.deepEqual(vus('saisissez-la dans les réglages'), ['saisissez-la']);
  assert.deepEqual(vus('Faites une boucle, puis réessayez.'), ['Faites', 'réessayez']);
  assert.deepEqual(vus('Revendez-la ici. Ouvrez le marché (ou vérifiez sur Inara).'), ['Revendez-la', 'Ouvrez', 'vérifiez']);
  assert.deepEqual(vus('ajouté par vous, à vos boucles, Votre vaisseau'), ['vous', 'vos', 'Votre']);
  assert.deepEqual(vus('Chez toi, assez de stock, le nez du vaisseau, les applications faites'), []);
});

test('tutoiement : ni « vous », ni « votre », ni impératif en -ez (interface, serveur, bureau, overlay)', () => {
  assert.ok(FICHIERS.some((f) => f.includes(`${path.sep}server${path.sep}src${path.sep}`)), 'le serveur est bien relu');
  assert.deepEqual(trouver(VOUS, { garder: vouvoie, sauf: EXCEPTIONS }), []);
});

test('nom de l’app : « Enova », jamais à l’envers', () => {
  assert.deepEqual(trouver(/Compagnon Elite/), []);
});

test('onglets en français : pas de « Dashboard » affiché', () => {
  assert.deepEqual(trouver(/>\s*Dashboard\s*</), []);
});
