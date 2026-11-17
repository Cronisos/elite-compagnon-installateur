// Règles de la distribution (scripts/distribution.mjs) : noms de fichiers personnels et secrets reconnus.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lireJetons, nomsPersonnels, secretsDans } from '../../distribution.mjs';

test('distribution : jeton cherché là où l’app de bureau range ses données (%APPDATA%, ou %LOCALAPPDATA% si réseau)', () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'distribution-jetons-'));
  try {
    const racine = path.join(t, 'depot');
    fs.mkdirSync(path.join(racine, 'server', 'data'), { recursive: true });
    const poser = (base, jeton) => {
      const d = path.join(base, 'Elite Compagnon', 'donnees');
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'escadron-jeton.json'), JSON.stringify({ token: jeton }));
    };
    poser(path.join(t, 'Roaming'), 'jeton-roaming');
    poser(path.join(t, 'Local'), 'jeton-local');
    assert.deepEqual(lireJetons(racine, { APPDATA: path.join(t, 'Roaming'), LOCALAPPDATA: path.join(t, 'Local') }), ['jeton-roaming']);
    assert.deepEqual(lireJetons(racine, { APPDATA: '\\\\serveur\\profils\\Testeur', LOCALAPPDATA: path.join(t, 'Local') }), ['jeton-local'], 'repli réseau suivi');
    assert.deepEqual(lireJetons(racine, {}), [], 'sans APPDATA : rien, sans erreur');
  } finally {
    fs.rmSync(t, { recursive: true, force: true });
  }
});

test('distribution : les fichiers du joueur sont reconnus à leur nom, le code et les fixtures passent', () => {
  const refuses = [
    'server/data/elite.db', 'server/data/escadron.json', 'server/data/captures/a.png', 'autre/elite.db-wal',
    'x/elite.db.avant-eep', 'config/route.local.json', '.env', 'api/.env.local', 'secrets.env', 'tools/secret.json',
    'server/data/ia-historique.json', 'quelque/part/escadron-jeton.json', 'bureau.json',
  ];
  assert.deepEqual(nomsPersonnels(refuses).map((t) => t.fichier), refuses);
  const permis = [
    'server/data/.gitkeep', 'server/src/modules/escadron/store.js', 'scripts/controle/attendu/escadron.json',
    'desktop/donnees.js', 'server/src/core/reference/vaisseaux/adder.svg', 'client/src/modules/ia/Personnalite.jsx',
    'server/src/modules/escadron/sensor.js', 'scripts/controle/anonymat/secrets.mjs', 'README.md',
    'server/src/modules/escadron/fixtures/escadron.json',
  ];
  assert.deepEqual(nomsPersonnels(permis), []);
  assert.deepEqual(nomsPersonnels(['server\\data\\elite.db']).map((t) => t.fichier), ['server/data/elite.db']);
});

test('distribution : webhook Discord et jeton d’escadron trouvés dans un texte, sans rendre leur valeur', () => {
  const webhook = `https://discord.com/api/webhooks/123456789012345678/${'a'.repeat(30)}`;
  assert.deepEqual(secretsDans(`const W = '${webhook}';`), ['webhook Discord']);
  assert.deepEqual(secretsDans('voir https://discord.com/api/webhooks/… dans la notice'), []);
  const jeton = `${'Ab3_'.repeat(10)}x-Z`;
  assert.deepEqual(secretsDans(`jeton = ${jeton}`, [jeton]), ['ton jeton d’escadron']);
  assert.deepEqual(secretsDans('rien ici', [jeton]), []);
  assert.deepEqual(secretsDans('court', ['abc']), [], 'un jeton trop court n’est jamais cherché (faux positifs)');
  for (const r of secretsDans(`${webhook} ${jeton}`, [jeton])) assert.ok(!r.includes(jeton) && !r.includes('webhooks/1'));
});

test('distribution : codes d’escadron et de gestion, clés GitHub trouvés dans un texte', () => {
  const suite = 'Q'.repeat(30);
  assert.deepEqual(secretsDans(`code = 'EGC1.${suite}'`), ['code de gestion d’escadron']);
  assert.deepEqual(secretsDans(`code = 'ESC1.${suite}'`), ['code d’escadron']);
  assert.deepEqual(secretsDans(`cle = ghp_${'a1'.repeat(18)}`), ['clé GitHub']);
  assert.deepEqual(secretsDans(`cle = github_pat_${'B_'.repeat(25)}`), ['clé GitHub']);
  assert.deepEqual(secretsDans("le code commence par « ESC1. » ou « EGC1. »"), [], 'la simple mention du préfixe n’est pas un secret');
});
