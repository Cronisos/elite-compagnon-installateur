// Golden du constructeur de builds : les sorties du code des builds (statistiques, liens EDSY, import du journal,
// règles d'installation, moteur des modifications, DPS de toutes les armes) sur le corpus de builds réels de corpus.json.
// Historique (7 nov. 2026) : photo prise avec l'ancien code dérivé d'EDSY (étiquette git web-final), redonnée au bit
// près par la réécriture indépendante (adapter.js la vise) ; puis reprise après la vérification contre edsy.org
// (edsy.test.js), qui a corrigé des erreurs de l'ancien code : trappe de soute dans l'énergie, rotation des
// propulseurs modifiés, armes à charge facultative, Rechargement automatique, chargeur arrondi à la rafale, dernière
// rafale incomplète, durée du condensateur WEP, Longue portée (baisse des dégâts, vitesse des projectiles).
//
// Lancer :     node --test server/src/modules/builder/__golden__/golden.test.js
// Tolérance :  GOLDEN_TOL=1e-6 (relative, 1e-9 par défaut)
// Données :    GOLDEN_REF_DIR=<dossier contenant edsy/eddb.js, coriolis/ et meta.json> (défaut : server/data/reference)
// Regénérer :  GOLDEN_UPDATE=1 … — seulement quand chaque différence est expliquée et vérifiée (contre EDSY ou le
//              jeu) : la photo est la référence de toute modification du code des builds.
// Sans données de référence, ou avec un eddb.js d'une autre version que celle de la photo, le test est ignoré :
// les chiffres dépendent des données d'EDSY.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { api } from './adapter.js';
import { snapshot, compare, format } from './snapshot.js';

const HERE = fileURLToPath(new URL('./', import.meta.url));
const GOLDEN = path.join(HERE, 'golden.json');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const corpus = readJson(path.join(HERE, 'corpus.json'));
const golden = fs.existsSync(GOLDEN) ? readJson(GOLDEN) : null;
const update = !!process.env.GOLDEN_UPDATE;
const tol = Number(process.env.GOLDEN_TOL) || 1e-9;
const refDir = process.env.GOLDEN_REF_DIR || api.REF_DIR;
const data = api.loadData(refDir);

let skip = false;
if (!data) skip = 'données de référence absentes (server/data/reference)';
else if (!update && !golden) skip = 'golden.json absent : GOLDEN_UPDATE=1 pour le créer';
else if (!update && golden.meta.data.eddbSha256 !== data.version.eddbSha256) {
  skip = `eddb.js différent de celui de la photo (version ${data.version.eddb}, photo : ${golden.meta.data.eddb}, empreinte ${golden.meta.data.eddbSha256.slice(0, 12)})`;
} else if (!update && data.ref && !data.ref.integrity?.pinned) {
  // Toutes les données, pas seulement eddb.js : tables FDevIDs et coriolis-data aussi (core/reference/download.js)
  skip = `données de référence pas aux versions figées (${(data.ref.integrity?.problems || []).join(' ; ')}) : « Mettre à jour les données », ou npm run controle:reference`;
}

// GOLDEN_REQUIRED=1 (avant un installeur, sur un autre PC) : une photo ignorée est un échec, pas un succès muet
test('golden : photo vérifiée (GOLDEN_REQUIRED)', { skip: !process.env.GOLDEN_REQUIRED }, () => assert.ok(!skip, String(skip)));

const current = skip ? null : snapshot(api, data, corpus);

if (!skip && update) {
  const quiet = (fn) => {
    try {
      return fn();
    } catch {
      return null;
    }
  };
  const git = (args) => quiet(() => execSync(`git ${args}`, { cwd: HERE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  // Fichiers photographiés : modifiés ou non par rapport au dernier commit
  const sources = [
    '../../../core/reference/edsy.js', '../../../core/reference/edsyBuild.js', '../../../core/reference/edsyLink.js',
    '../../../core/reference/eddbData.js', '../../../core/reference/jsLiteral.js', '../stats.js', '../attributes.js', '../formulas.js',
  ];
  const meta = {
    about: 'Sorties du code des builds pour les entrées de corpus.json ; Infinity et NaN écrits en texte. Voir golden.test.js.',
    generatedAt: new Date().toISOString().slice(0, 10),
    code: { commit: git('describe --tags --always'), modified: git(`status --porcelain -- ${sources.join(' ')}`)?.split('\n').filter(Boolean) ?? null },
    data: { ...data.version, coriolis: quiet(() => readJson(path.join(refDir, 'meta.json')).version) },
  };
  fs.writeFileSync(GOLDEN, format({ meta, ...current }));
}

const SECTIONS = ['constants', 'cases', 'links', 'hash', 'loadoutEdges', 'ships', 'allowedSets', 'modifiers', 'weapons', 'formulas'];

for (const section of SECTIONS) {
  test(`golden : ${section}`, { skip }, () => {
    if (update) return; // photo regénérée à l'instant
    const diffs = compare(golden[section], current[section], { tol });
    const show = (v) => JSON.stringify(v)?.slice(0, 120);
    const lines = diffs.map((d) => `  ${section}${d.path} : attendu ${show(d.expected)}, obtenu ${show(d.actual)}`);
    assert.equal(diffs.length, 0, `${diffs.length >= 30 ? '30 premières différences' : `${diffs.length} différence(s)`} :\n${lines.join('\n')}`);
  });
}

test('golden : corpus anonyme et de taille raisonnable', () => {
  const text = JSON.stringify(corpus);
  // Ni nom ni immatriculation de vaisseau, ni ShipID, ni identifiant ou nom de commandant
  for (const key of ['ShipName', 'ShipIdent', 'ShipID', 'FID', 'Commander']) assert.ok(!text.includes(`"${key}"`), key);
  assert.ok(corpus.cases.length >= 10 && corpus.cases.length <= 25);
  for (const c of corpus.cases) assert.ok(c.id && c.label && c.build?.shipId, c.id);
});
