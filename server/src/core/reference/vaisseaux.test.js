// Dessins des vaisseaux livrés avec l'app (core/reference/vaisseaux/, Qohen Leth, CC BY-NC-SA 4.0) : rien d'actif dans
// les SVG (ni script, ni attribut d'événement, ni lien vers l'extérieur), un fichier par clé de vaisseau connue.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESSINS_VAISSEAUX, dessinVaisseau } from './vaisseaux.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vaisseaux');

test('dessins : rien d’actif ni d’extérieur dans les SVG', () => {
  const fichiers = fs.readdirSync(DIR).filter((f) => f.endsWith('.svg'));
  assert.ok(fichiers.length >= 45, `${fichiers.length} dessins`);
  for (const f of fichiers) {
    const svg = fs.readFileSync(path.join(DIR, f), 'utf8');
    assert.doesNotMatch(svg, /<script/i, `${f} : script`);
    assert.doesNotMatch(svg, /<foreignObject/i, `${f} : foreignObject`);
    assert.doesNotMatch(svg, /\son[a-z]+\s*=/i, `${f} : attribut d'événement`);
    assert.doesNotMatch(svg, /javascript:/i, `${f} : javascript:`);
    // Liens : seulement vers un élément du même fichier (#…), jamais une adresse
    for (const m of svg.matchAll(/\shref\s*=\s*"([^"]*)"/gi)) assert.ok(m[1].startsWith('#'), `${f} : lien ${m[1].slice(0, 40)}`);
    assert.doesNotMatch(svg, /url\(\s*['"]?(?!#)/i, `${f} : url() extérieure`);
  }
});

test('dessins : une clé de vaisseau par fichier, aucune clé piégée', () => {
  for (const [cle, fichier] of Object.entries(DESSINS_VAISSEAUX)) {
    assert.equal(fichier, `${cle}.svg`);
    assert.ok(fs.existsSync(path.join(DIR, fichier)), fichier);
    assert.equal(dessinVaisseau(cle), path.join(DIR, fichier));
  }
  for (const non of ['explorer_nx', 'constructor', '__proto__', '../x', '', null]) assert.equal(dessinVaisseau(non), null, String(non));
});
