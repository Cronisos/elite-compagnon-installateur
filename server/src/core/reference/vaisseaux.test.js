// Dessins des vaisseaux livrés avec l'app (core/reference/vaisseaux/, Qohen Leth, CC BY-NC-SA 4.0) : rien d'actif dans
// les SVG (ni script, ni attribut d'événement, ni lien vers l'extérieur), un fichier par clé de vaisseau connue.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESSINS_VAISSEAUX, IMAGES_VAISSEAUX, dessinRecadre, dessinVaisseau } from './vaisseaux.js';
import { decodeImageDataUrl } from '../imageCheck.js';

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

test('dessins : chacun est recadré sur son vaisseau, sans rien changer d’autre au fichier', () => {
  for (const cle of Object.keys(DESSINS_VAISSEAUX)) {
    const chemin = dessinVaisseau(cle);
    const origine = fs.readFileSync(chemin, 'utf8');
    const svg = dessinRecadre(chemin);
    assert.ok(svg, `${cle} : pas de cadre`);
    const m = svg.slice(0, 400).match(/width="(\d+)" height="(\d+)" viewBox="(\d+) (\d+) (\d+) (\d+)"/);
    assert.ok(m, `${cle} : en-tête`);
    const [l, h, x, y, vl, vh] = m.slice(1).map(Number);
    assert.deepEqual([l, h], [vl, vh], cle);
    assert.ok(x + vl <= 1500 && y + vh <= 1500, `${cle} : cadre hors du dessin`);
    assert.ok(vl >= 600 && vh >= 400, `${cle} : cadre trop petit (${vl} × ${vh})`);
    assert.ok(vl * vh < 1500 * 1500 * 0.85, `${cle} : cadre à peine resserré`);
    // Tout le reste du fichier est identique à celui du pack
    const retour = ['width="1500" height="1500"', 'width="100%" height="100%"'].map((t) => svg.replace(m[0], `${t} viewBox="0 0 1500 1500"`));
    assert.ok(retour.includes(origine), cle);
  }
  // Une image, un fichier d'ailleurs ou n'importe quoi : servi tel quel
  for (const non of [dessinVaisseau('kestrel'), path.join(DIR, '..', 'vaisseaux.js'), path.join(DIR, 'absent.svg'), '', null]) {
    assert.equal(dessinRecadre(non), null, String(non));
  }
});

test('dessins : une clé de vaisseau par fichier, aucune clé piégée', () => {
  for (const [cle, fichier] of Object.entries(DESSINS_VAISSEAUX)) {
    assert.equal(fichier, `${cle}.svg`);
    assert.ok(fs.existsSync(path.join(DIR, fichier)), fichier);
    assert.equal(dessinVaisseau(cle), path.join(DIR, fichier));
  }
  // Clés des données de référence, pas un nom « lisible » : sous un autre nom, l'app ne trouve pas le dessin
  for (const cle of ['cobramkv', 'panthermkii', 'type_11_prospector']) assert.ok(dessinVaisseau(cle), cle);
  // Images (vaisseaux sans dessin dans le pack) : une vraie image WebP, légère, jamais à la place d'un dessin
  assert.deepEqual(Object.keys(IMAGES_VAISSEAUX).sort(), ['anacondamkii', 'explorer_nx', 'kestrel', 'mediumtransport01']);
  for (const [cle, fichier] of Object.entries(IMAGES_VAISSEAUX)) {
    assert.equal(DESSINS_VAISSEAUX[cle], undefined, cle);
    assert.equal(dessinVaisseau(cle), path.join(DIR, fichier));
    const buf = fs.readFileSync(path.join(DIR, fichier));
    assert.ok(buf.length < 100 * 1024, `${fichier} : ${buf.length} octets`);
    const img = decodeImageDataUrl(`data:image/webp;base64,${buf.toString('base64')}`, ['webp']);
    assert.equal(img.error, undefined, fichier);
    assert.equal(img.ext, 'webp');
  }
  for (const non of ['smallcombat01_nx', 'cobra_mk_v', 'panther_clipper', 'constructor', '__proto__', '../x', '', null]) assert.equal(dessinVaisseau(non), null, String(non));
});
