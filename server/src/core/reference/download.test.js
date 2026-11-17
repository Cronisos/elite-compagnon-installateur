// Tests du téléchargement des données de référence : versions figées (commit précis, jamais master),
// empreintes SHA-256 vérifiées, données en place gardées si quelque chose ne va pas.
// Aucun accès réseau : fetch est simulé, et tout s'écrit dans un dossier temporaire du système
// (jamais server/data).

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { downloadReference, checkSources, IntegrityError, PINNED_ON, rawUrl, readMeta, setDigest, sha256, SHIP_IMAGES, SOURCES } from './download.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'compagnon-ref-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));
let n = 0;
/** Dossier cible neuf, avec un ancien contenu (marqueur) pour voir s'il est gardé ou remplacé. */
function target() {
  const dir = path.join(root, `t${++n}`, 'reference');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ancien.txt'), 'données du joueur');
  return dir;
}

const commit = (c) => c.repeat(40);
const CORIOLIS = { 'ships/anaconda.json': '{"ship":1}', 'modules/hardpoints/fsd.json': '{"fsd":1}', 'modifications/blueprints.json': '{}' };
const MATERIAL = 'id,symbol\n1,iron\n';
const EDDB = 'var eddb = { ship: {} };';

/** Faux GitHub : sources figées sur des commits factices, empreintes calculées sur le faux contenu. */
function world() {
  const sources = {
    coriolis: {
      repo: 'EDCD/coriolis-data',
      commit: commit('a'),
      digest: setDigest(new Map(Object.entries(CORIOLIS).map(([p, s]) => [p, Buffer.from(s)]))),
    },
    fdevids: { repo: 'EDCD/FDevIDs', commit: commit('b'), files: { 'material.csv': sha256(Buffer.from(MATERIAL)) } },
    edsy: { repo: 'taleden/EDSY', commit: commit('c'), files: { 'eddb.js': sha256(Buffer.from(EDDB)) } },
    images: { repo: 'ROMVoid95/EliteUIAssets', commit: commit('d'), dir: 'img/' },
  };
  const urls = {
    tree: `https://api.github.com/repos/EDCD/coriolis-data/git/trees/${commit('a')}?recursive=1`,
    coriolis: (p) => rawUrl('EDCD/coriolis-data', commit('a'), p),
    material: rawUrl('EDCD/FDevIDs', commit('b'), 'material.csv'),
    eddb: rawUrl('taleden/EDSY', commit('c'), 'eddb.js'),
    image: (name) => rawUrl('ROMVoid95/EliteUIAssets', commit('d'), `img/${name}.svg`),
  };
  const served = new Map();
  const tree = (paths) => JSON.stringify({ truncated: false, tree: [{ path: 'ships', type: 'tree' }, { path: 'README.md', type: 'blob' }, ...paths.map((p) => ({ path: p, type: 'blob' }))] });
  served.set(urls.tree, tree(Object.keys(CORIOLIS)));
  for (const [p, s] of Object.entries(CORIOLIS)) served.set(urls.coriolis(p), s);
  served.set(urls.material, MATERIAL);
  served.set(urls.eddb, EDDB);
  served.set(urls.image('anaconda'), '<svg/>'); // les autres dessins manquent (404) : toléré
  const requested = [];
  const fetch = async (url) => {
    requested.push(url);
    const body = served.get(url);
    if (body == null) return { ok: false, status: 404 };
    return { ok: true, status: 200, arrayBuffer: async () => Uint8Array.from(Buffer.from(body)).buffer };
  };
  return { sources, urls, served, tree, fetch, requested };
}

const exists = (dir, p) => fs.existsSync(path.join(dir, p));

test('versions figées : commit complet pour chaque source, empreinte pour eddb.js et chaque table FDevIDs lue', () => {
  checkSources(SOURCES);
  assert.equal(PINNED_ON, '2026-11-15');
  // eddb.js 424029903 (banc EDSY du 15 nov. 2026, famille 10) : celui d'edsy.org
  assert.equal(SOURCES.edsy.commit, '0f577f76e94d9c1aa06defdbb39ee92b249afa56');
  assert.equal(SOURCES.edsy.files['eddb.js'], '5bac16de91ab5a9812cd2e3cec08d078c47115f4f0765b91fad0db1ff0122f8a');
  for (const s of Object.values(SOURCES)) assert.match(s.commit, /^[0-9a-f]{40}$/);
  assert.match(SOURCES.coriolis.digest, /^[0-9a-f]{64}$/);
  assert.match(SOURCES.edsy.files['eddb.js'], /^[0-9a-f]{64}$/);
  // Les quatre tables lues par refdata.js
  assert.deepEqual(Object.keys(SOURCES.fdevids.files).sort(), ['engineers.csv', 'material.csv', 'outfitting.csv', 'shipyard.csv']);
  for (const h of Object.values(SOURCES.fdevids.files)) assert.match(h, /^[0-9a-f]{64}$/);
});

test('les adresses contiennent le commit figé, jamais master', () => {
  assert.equal(rawUrl(SOURCES.edsy.repo, SOURCES.edsy.commit, 'eddb.js'), `https://raw.githubusercontent.com/taleden/EDSY/${SOURCES.edsy.commit}/eddb.js`);
});

test('source sur une branche (« master ») : refusée avant tout téléchargement', async () => {
  const w = world();
  const dir = target();
  for (const name of ['coriolis', 'fdevids', 'edsy', 'images']) {
    const sources = { ...w.sources, [name]: { ...w.sources[name], commit: 'master' } };
    await assert.rejects(downloadReference(() => {}, { dir, fetch: w.fetch, sources }), /commit figé invalide/);
  }
  const sources = { ...w.sources, edsy: { ...w.sources.edsy, files: { 'eddb.js': '' } } };
  await assert.rejects(downloadReference(() => {}, { dir, fetch: w.fetch, sources }), /empreinte invalide/);
  assert.equal(w.requested.length, 0);
  assert.ok(exists(dir, 'ancien.txt'));
});

test('téléchargement complet : tout vient des commits figés, ancien dossier remplacé, versions notées', async () => {
  const w = world();
  const dir = target();
  const meta = await downloadReference(() => {}, { dir, fetch: w.fetch, sources: w.sources });
  for (const p of Object.keys(CORIOLIS)) assert.equal(fs.readFileSync(path.join(dir, 'coriolis', p), 'utf8'), CORIOLIS[p]);
  assert.ok(!exists(dir, 'coriolis/README.md')); // hors de ships/, modules/, modifications/
  assert.equal(fs.readFileSync(path.join(dir, 'fdevids', 'material.csv'), 'utf8'), MATERIAL);
  assert.equal(fs.readFileSync(path.join(dir, 'edsy', 'eddb.js'), 'utf8'), EDDB);
  assert.ok(exists(dir, 'images/anaconda.svg'));
  assert.ok(!exists(dir, 'ancien.txt'));
  assert.ok(!fs.existsSync(`${dir}.tmp`));
  assert.equal(meta.files, 3 + 1 + 1 + 1);
  assert.equal(meta.version, commit('a').slice(0, 10));
  assert.deepEqual(readMeta(dir).sources.edsy, { repo: 'taleden/EDSY', commit: commit('c') });
  assert.equal(readMeta(dir).pinnedOn, PINNED_ON);
  // Chaque requête porte un commit figé ; aucune ne suit une branche
  const commits = Object.values(w.sources).map((s) => s.commit);
  for (const url of w.requested) {
    assert.ok(commits.some((c) => url.includes(`/${c}`)), url);
    assert.doesNotMatch(url, /master/);
  }
  // Tous les dessins connus ont été demandés à ce commit
  for (const name of Object.values(SHIP_IMAGES)) assert.ok(w.requested.includes(w.urls.image(name)), name);
});

test('eddb.js modifié : tout est refusé, les données en place restent', async () => {
  const w = world();
  w.served.set(w.urls.eddb, `${EDDB}\nrequire('child_process');`);
  const dir = target();
  await assert.rejects(downloadReference(() => {}, { dir, fetch: w.fetch, sources: w.sources }), (err) => err instanceof IntegrityError && /edsy\/eddb\.js/.test(err.message));
  assert.ok(exists(dir, 'ancien.txt'));
  assert.ok(!exists(dir, 'meta.json'));
  assert.ok(!fs.existsSync(`${dir}.tmp`)); // dossier temporaire nettoyé
});

test('table FDevIDs modifiée : refusée', async () => {
  const w = world();
  w.served.set(w.urls.material, `${MATERIAL}2,gold\n`);
  const dir = target();
  await assert.rejects(downloadReference(() => {}, { dir, fetch: w.fetch, sources: w.sources }), (err) => err instanceof IntegrityError && /fdevids\/material\.csv/.test(err.message));
  assert.ok(exists(dir, 'ancien.txt'));
  assert.ok(!fs.existsSync(`${dir}.tmp`));
});

test('coriolis-data : fichier modifié, ou fichier en plus dans la liste → refusé, rien d\'écrit', async () => {
  const modified = world();
  modified.served.set(modified.urls.coriolis('ships/anaconda.json'), '{"ship":2}');
  const extra = world();
  extra.served.set(extra.urls.tree, extra.tree([...Object.keys(CORIOLIS), 'ships/intrus.json']));
  extra.served.set(extra.urls.coriolis('ships/intrus.json'), '{}');
  const fewer = world();
  fewer.served.set(fewer.urls.tree, fewer.tree(Object.keys(CORIOLIS).slice(1)));
  for (const w of [modified, extra, fewer]) {
    const dir = target();
    await assert.rejects(downloadReference(() => {}, { dir, fetch: w.fetch, sources: w.sources }), (err) => err instanceof IntegrityError && /coriolis-data/.test(err.message));
    assert.ok(exists(dir, 'ancien.txt'));
    assert.ok(!fs.existsSync(`${dir}.tmp`));
    // Refusé dès coriolis-data : les fichiers suivants ne sont même pas demandés
    assert.ok(!w.requested.includes(w.urls.eddb));
  }
});

test('liste coriolis-data tronquée ou illisible : refusée', async () => {
  const w = world();
  w.served.set(w.urls.tree, JSON.stringify({ truncated: true, tree: [] }));
  await assert.rejects(downloadReference(() => {}, { dir: target(), fetch: w.fetch, sources: w.sources }), /incomplète/);
  w.served.set(w.urls.tree, JSON.stringify({ message: 'API rate limit exceeded' }));
  await assert.rejects(downloadReference(() => {}, { dir: target(), fetch: w.fetch, sources: w.sources }), /incomplète/);
});

test('chemin dangereux dans la liste coriolis-data : jamais demandé ni écrit hors du dossier', async () => {
  const w = world();
  const evil = ['ships/../../../evil.json', 'modules/..\\..\\evil.json', 'ships/a b.json', 'ships/./x.json'];
  w.served.set(w.urls.tree, w.tree([...Object.keys(CORIOLIS), ...evil]));
  for (const p of evil) w.served.set(w.urls.coriolis(p), '{}');
  const dir = target();
  await downloadReference(() => {}, { dir, fetch: w.fetch, sources: w.sources });
  for (const p of evil) assert.ok(!w.requested.includes(w.urls.coriolis(p)), p);
  assert.ok(!fs.existsSync(path.join(root, 'evil.json')));
  assert.ok(!fs.existsSync(path.join(path.dirname(dir), 'evil.json')));
});

test('eddb.js injoignable (réseau) : le reste est mis à jour, sans import EDSY', async () => {
  const w = world();
  w.served.delete(w.urls.eddb);
  const dir = target();
  const meta = await downloadReference(() => {}, { dir, fetch: w.fetch, sources: w.sources });
  assert.ok(!exists(dir, 'edsy/eddb.js'));
  assert.ok(exists(dir, 'fdevids/material.csv'));
  assert.equal(meta.files, 3 + 1 + 1);
});

test('eddb.js injoignable, version figée déjà en place : gardée (le constructeur ne disparaît pas)', async () => {
  const w = world();
  w.served.delete(w.urls.eddb);
  const dir = target();
  fs.mkdirSync(path.join(dir, 'edsy'));
  fs.writeFileSync(path.join(dir, 'edsy', 'eddb.js'), EDDB);
  const meta = await downloadReference(() => {}, { dir, fetch: w.fetch, sources: w.sources });
  assert.equal(fs.readFileSync(path.join(dir, 'edsy', 'eddb.js'), 'utf8'), EDDB);
  assert.ok(!exists(dir, 'ancien.txt')); // le reste est bien mis à jour
  assert.equal(meta.files, 3 + 1 + 1 + 1);
});

test('eddb.js injoignable, autre version en place : tout est refusé, rien ne bouge', async () => {
  const w = world();
  w.served.delete(w.urls.eddb);
  const dir = target();
  fs.mkdirSync(path.join(dir, 'edsy'));
  fs.writeFileSync(path.join(dir, 'edsy', 'eddb.js'), 'var eddb = { ancienne: 1 };');
  await assert.rejects(downloadReference(() => {}, { dir, fetch: w.fetch, sources: w.sources }), /injoignable.*données en place gardées/);
  assert.ok(exists(dir, 'ancien.txt'));
  assert.ok(exists(dir, 'edsy/eddb.js'));
  assert.ok(!fs.existsSync(`${dir}.tmp`));
});

test('remplacement du dossier : pas de reste .old ni .tmp après un téléchargement réussi', async () => {
  const w = world();
  const dir = target();
  await downloadReference(() => {}, { dir, fetch: w.fetch, sources: w.sources });
  assert.ok(!fs.existsSync(`${dir}.old`));
  assert.ok(!fs.existsSync(`${dir}.tmp`));
  assert.ok(exists(dir, 'meta.json'));
});

test('table FDevIDs injoignable : refusée (ces tables sont indispensables)', async () => {
  const w = world();
  w.served.delete(w.urls.material);
  const dir = target();
  await assert.rejects(downloadReference(() => {}, { dir, fetch: w.fetch, sources: w.sources }), /HTTP 404/);
  assert.ok(exists(dir, 'ancien.txt'));
});

test('empreinte d\'un ensemble : indépendante de l\'ordre, sensible au contenu et aux noms', () => {
  const a = new Map([['ships/a.json', Buffer.from('1')], ['ships/b.json', Buffer.from('2')]]);
  const b = new Map([['ships/b.json', Buffer.from('2')], ['ships/a.json', Buffer.from('1')]]);
  assert.equal(setDigest(a), setDigest(b));
  assert.notEqual(setDigest(a), setDigest(new Map([['ships/a.json', Buffer.from('1')], ['ships/b.json', Buffer.from('3')]])));
  assert.notEqual(setDigest(a), setDigest(new Map([['ships/a.json', Buffer.from('1')], ['ships/c.json', Buffer.from('2')]])));
  assert.equal(sha256(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('SHIP_IMAGES : pas de prototype (« constructor », « __proto__ » ne donnent rien)', () => {
  assert.equal(SHIP_IMAGES.constructor, undefined);
  assert.equal(SHIP_IMAGES['__proto__'], undefined);
  assert.equal(SHIP_IMAGES.anaconda, 'anaconda');
  assert.ok(Object.isFrozen(SHIP_IMAGES));
});

// --- Données EN PLACE : sont-elles les versions figées ? (verifyReference, au chargement) ---

test('données en place : versions figées reconnues, et chaque écart dit en français', async () => {
  const { verifyReference } = await import('./download.js');
  const w = world();
  const dir = target();
  await downloadReference(() => {}, { dir, fetch: w.fetch, sources: w.sources });
  assert.deepEqual(verifyReference(dir, w.sources), { pinned: true, problems: [] });
  assert.deepEqual(verifyReference(`${dir}${path.sep}`, w.sources), { pinned: true, problems: [] }, 'barre finale comme REF_DIR');

  // Table FDevIDs d'une autre version (téléchargée depuis master avant le figeage)
  fs.writeFileSync(path.join(dir, 'fdevids', 'material.csv'), `${MATERIAL}2,nickel\n`);
  let v = verifyReference(dir, w.sources);
  assert.equal(v.pinned, false);
  assert.match(v.problems.join('\n'), /fdevids\/material\.csv : empreinte .* en place, .* attendue/);
  fs.writeFileSync(path.join(dir, 'fdevids', 'material.csv'), MATERIAL);

  // Fichier coriolis modifié, puis en plus
  fs.writeFileSync(path.join(dir, 'coriolis', 'ships', 'anaconda.json'), '{"ship":2}');
  assert.match(verifyReference(dir, w.sources).problems.join('\n'), /coriolis-data \(3 fichiers\) : empreinte/);
  fs.writeFileSync(path.join(dir, 'coriolis', 'ships', 'anaconda.json'), CORIOLIS['ships/anaconda.json']);
  fs.writeFileSync(path.join(dir, 'coriolis', 'ships', 'piege.json'), '{}');
  assert.match(verifyReference(dir, w.sources).problems.join('\n'), /coriolis-data \(4 fichiers\)/);
  fs.rmSync(path.join(dir, 'coriolis', 'ships', 'piege.json'));

  // eddb.js absent : toléré (l'app marche sans import EDSY) ; modifié : écart
  fs.rmSync(path.join(dir, 'edsy', 'eddb.js'));
  assert.equal(verifyReference(dir, w.sources).pinned, true);
  fs.writeFileSync(path.join(dir, 'edsy', 'eddb.js'), 'var eddb = { ship: { 1: {} } };');
  assert.match(verifyReference(dir, w.sources).problems.join('\n'), /edsy\/eddb\.js : empreinte/);
  fs.writeFileSync(path.join(dir, 'edsy', 'eddb.js'), EDDB);

  // meta.json d'avant le figeage (sans « sources »), ou d'un autre commit
  const meta = readMeta(dir);
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ version: meta.version, coriolisCommit: meta.coriolisCommit, downloadedAt: meta.downloadedAt, files: meta.files }));
  v = verifyReference(dir, w.sources);
  assert.deepEqual(v.problems, ['versions non notées dans meta.json : données téléchargées avant le figeage des versions']);
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ ...meta, sources: { ...meta.sources, fdevids: { repo: 'EDCD/FDevIDs', commit: commit('e') } } }));
  assert.match(verifyReference(dir, w.sources).problems.join('\n'), /fdevids : EDCD\/FDevIDs@eeeeeeeeee en place, EDCD\/FDevIDs@bbbbbbbbbb attendu/);

  // Rien de téléchargé
  assert.deepEqual(verifyReference(path.join(root, 'absent'), w.sources).pinned, false);
});

test('données d’avant le figeage (tables FDevIDs de master, meta.json sans « sources ») : signalées', async () => {
  const { verifyReference } = await import('./download.js');
  const w = world();
  const dir = target();
  await downloadReference(() => {}, { dir, fetch: w.fetch, sources: w.sources });
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ version: '0db9234b5b', coriolisCommit: commit('a'), downloadedAt: '2026-10-28T12:14:04.947Z', files: 183 }));
  fs.writeFileSync(path.join(dir, 'fdevids', 'material.csv'), 'id,symbol\n1,iron\n9,ancien\n');
  const v = verifyReference(dir, w.sources);
  assert.equal(v.pinned, false);
  assert.equal(v.problems.length, 2);
});
