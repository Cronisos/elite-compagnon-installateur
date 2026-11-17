// Avis de nouvelle version : coupé par défaut, aucune demande sans version installée, comparaison, panne de réseau.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ADRESSE_VERSIONS, FICHIER_MISE_A_JOUR, MiseAJour, PAGE_VERSIONS, dernierePubliee, plusRecente, versionInstallee } from './miseAJour.js';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'elite-maj-'));
function appInstallee(version = '2026.11.16-bf45faf', fabrique = '2026-11-16T16:38:00.000Z') {
  const racine = temp();
  fs.writeFileSync(path.join(racine, 'paquet.json'), JSON.stringify({ nom: 'Elite Compagnon', version, fabrique }));
  return racine;
}
const publication = (extra = {}) => ({
  tag_name: 'v2', published_at: '2026-11-20T10:00:00Z', draft: false, prerelease: false,
  html_url: 'https://evil.example/piege', assets: [{ name: 'Installer Elite Compagnon 2026.11.20-ab12cd3.exe', browser_download_url: 'https://evil.example/x.exe' }], ...extra,
});

test('version installée : lue dans paquet.json ; version de travail (sans paquet) : null', () => {
  assert.deepEqual(versionInstallee(appInstallee()), { version: '2026.11.16-bf45faf', fabrique: '2026-11-16T16:38:00.000Z' });
  assert.equal(versionInstallee(temp()), null);
  const abime = temp();
  fs.writeFileSync(path.join(abime, 'paquet.json'), '{ pas du json');
  assert.equal(versionInstallee(abime), null);
});

test('dernière version publiée : version lue dans le nom de l’installateur, lien toujours celui du dépôt', () => {
  assert.deepEqual(dernierePubliee(publication()), { version: '2026.11.20-ab12cd3', publieeLe: '2026-11-20T10:00:00Z', page: PAGE_VERSIONS });
  assert.equal(dernierePubliee(publication({ assets: [], tag_name: '2026.11.21-0a1b2c3' })).version, '2026.11.21-0a1b2c3');
  assert.equal(dernierePubliee(publication({ assets: [], tag_name: 'v2' })).version, null, 'sans numéro lisible : la date suffit');
  for (const mauvais of [null, [], 'texte', publication({ draft: true }), publication({ prerelease: true }), publication({ published_at: 'hier' }), publication({ published_at: undefined })]) {
    assert.equal(dernierePubliee(mauvais), null);
  }
});

test('plus récente : publiée nettement après la fabrication de la version installée, et pas la même', () => {
  const installee = { version: '2026.11.16-bf45faf', fabrique: '2026-11-16T16:38:00.000Z' };
  assert.equal(plusRecente({ version: '2026.11.20-ab12cd3', publieeLe: '2026-11-20T10:00:00Z' }, installee), true);
  assert.equal(plusRecente({ version: '2026.11.16-bf45faf', publieeLe: '2026-11-20T10:00:00Z' }, installee), false, 'la même version, publiée plus tard');
  assert.equal(plusRecente({ version: null, publieeLe: '2026-11-16T16:50:00Z' }, installee), false, 'publiée juste après sa fabrication : c’est elle');
  assert.equal(plusRecente({ version: '2026.11.10-aaaaaaa', publieeLe: '2026-11-10T10:00:00Z' }, installee), false, 'plus ancienne');
  assert.equal(plusRecente(null, installee), false);
  assert.equal(plusRecente({ version: 'x', publieeLe: '2026-11-20T10:00:00Z' }, null), false);
});

test('coupé par défaut : aucune demande ; activé : une demande, puis plus rien pendant douze heures', async () => {
  const appels = [];
  let maintenant = Date.parse('2026-11-21T08:00:00Z');
  const m = new MiseAJour({ fichier: path.join(temp(), FICHIER_MISE_A_JOUR), racine: appInstallee(), lire: async (url) => { appels.push(url); return publication(); }, now: () => maintenant });
  assert.equal((await m.verifier()).nouvelle, null);
  assert.equal(appels.length, 0, 'rien ne part tant que ce n’est pas activé');
  m.regler({ actif: true });
  const etat = await m.verifier();
  assert.deepEqual(appels, [ADRESSE_VERSIONS]);
  assert.equal(etat.nouvelle.version, '2026.11.20-ab12cd3');
  assert.equal(etat.nouvelle.page, PAGE_VERSIONS);
  await m.verifier();
  assert.equal(appels.length, 1, 'pas deux demandes en moins de douze heures');
  maintenant += 13 * 3600 * 1000;
  await m.verifier();
  assert.equal(appels.length, 2);
  await m.verifier({ force: true });
  assert.equal(appels.length, 3, '« Vérifier maintenant »');
});

test('« ne plus me le dire » pour cette version ; la couper oublie tout ; gardé d’un lancement à l’autre', async () => {
  const fichier = path.join(temp(), FICHIER_MISE_A_JOUR);
  const racine = appInstallee();
  const m = new MiseAJour({ fichier, racine, lire: async () => publication(), now: () => Date.parse('2026-11-21T08:00:00Z') });
  m.regler({ actif: true });
  await m.verifier();
  assert.ok(new MiseAJour({ fichier, racine, lire: async () => publication() }).etat().nouvelle, 'relue au lancement suivant');
  assert.equal(m.regler({ ignorer: true }).nouvelle, null);
  assert.equal(new MiseAJour({ fichier, racine, lire: async () => publication() }).etat().nouvelle, null);
  const etat = m.regler({ actif: false });
  assert.deepEqual([etat.actif, etat.nouvelle, etat.vueLe], [false, null, null]);
  assert.throws(() => m.regler({ actif: 'oui' }), (e) => e.status === 400);
});

test('version de travail : rien à comparer, aucune demande ; panne de réseau : rien ne casse', async () => {
  let appels = 0;
  const travail = new MiseAJour({ fichier: path.join(temp(), FICHIER_MISE_A_JOUR), racine: temp(), lire: async () => { appels += 1; return publication(); } });
  travail.regler({ actif: true });
  assert.equal((await travail.verifier({ force: true })).verifiable, false);
  assert.equal(appels, 0);
  const panne = new MiseAJour({ fichier: path.join(temp(), FICHIER_MISE_A_JOUR), racine: appInstallee(), lire: async () => { throw new Error('réseau coupé'); } });
  panne.regler({ actif: true });
  const etat = await panne.verifier();
  assert.equal(etat.nouvelle, null);
  assert.equal(etat.vueLe, null, 'on réessaiera');
});
