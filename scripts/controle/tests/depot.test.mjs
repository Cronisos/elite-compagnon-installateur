// Réglages du dépôt qui protègent le lancement et l'installation : aucune télémétrie de Prisma ni vérification de
// version de npm au lancement ni à l'installation (rien ne part hors de la passerelle réseau de l'app), interface sur
// 127.0.0.1, aucun script d'installation d'un paquet qui ne soit pas décidé un par un (allowScripts, appliqué par
// .npmrc), et un npm trop ancien (qui ignorerait allowScripts) refusé avant tout script.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { RACINE } from '../banc/chemins.mjs';
import { copierSchema } from '../banc/base.mjs';

const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const json = (rel) => JSON.parse(lire(rel));
const npmrc = () => lire('.npmrc').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

test('Prisma : aucun script des package.json ne lance la CLI sans couper sa télémétrie', async () => {
  const fautifs = [];
  for (const rel of ['package.json', 'server/package.json', 'client/package.json', 'overlay/package.json']) {
    for (const [nom, script] of Object.entries(json(rel).scripts || {})) {
      if (/\bprisma\b/.test(script) && !/CHECKPOINT_DISABLE/.test(script)) fautifs.push(`${rel} : ${nom} = ${script}`);
    }
  }
  assert.deepEqual(fautifs, [], 'passer par server/dbPush.mjs (CHECKPOINT_DISABLE=1)');
  assert.equal(json('server/package.json').scripts.predev, 'node dbPush.mjs');
  const { PRISMA_ENV } = await import(new URL('../../../server/dbPush.mjs', import.meta.url));
  assert.equal(PRISMA_ENV.CHECKPOINT_DISABLE, '1');
  assert.equal(PRISMA_ENV.PRISMA_HIDE_UPDATE_MESSAGE, '1');
});

test('Prisma : tout code du dépôt qui lance la CLI (banc, future version Electron…) coupe sa télémétrie', () => {
  const suivis = execFileSync('git', ['-C', RACINE, 'ls-files', '-z', '--', '*.js', '*.mjs', '*.cjs'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const lanceurs = [];
  const fautifs = [];
  for (const rel of suivis) {
    const texte = lire(rel);
    if (!/prisma\/build\/index\.js|['"`]prisma['"`]\s*,\s*\[|npx\s+prisma/.test(texte)) continue;
    if (rel.endsWith('.test.mjs') || rel.endsWith('.test.js')) continue; // les tests lancent la CLI exprès (témoin)
    lanceurs.push(rel);
    if (!/CHECKPOINT_DISABLE|PRISMA_ENV/.test(texte)) fautifs.push(rel);
  }
  // Le banc (scripts/controle/banc/base.mjs) passe par server/dbPush.mjs, comme l'app : un seul lanceur de la CLI
  assert.ok(lanceurs.includes('server/dbPush.mjs'), `lanceurs trouvés : ${lanceurs.join(', ')}`);
  assert.deepEqual(fautifs, [], 'lancer la CLI avec PRISMA_ENV de server/dbPush.mjs (CHECKPOINT_DISABLE=1)');
});

/** Récepteur local : note chaque requête reçue. */
async function recepteur(t) {
  const recues = [];
  const srv = http.createServer((req, res) => {
    recues.push(req.url);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(() => srv.close());
  return { url: `http://127.0.0.1:${srv.address().port}`, recues };
}

/** Lance node avec ses arguments ; rend le code de sortie et la sortie. */
function lancer(args, { cwd, env }) {
  return new Promise((resolve) => {
    const enfant = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let sortie = '';
    enfant.stdout.on('data', (d) => { sortie += d; });
    enfant.stderr.on('data', (d) => { sortie += d; });
    const minuterie = setTimeout(() => enfant.kill(), 120_000);
    enfant.on('close', (code) => {
      clearTimeout(minuterie);
      resolve({ code, sortie });
    });
  });
}

test('Prisma : « prisma db push » par server/dbPush.mjs n’envoie rien ; la CLI telle quelle, si (témoin)', { timeout: 240_000 }, async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-controle-checkpoint-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { prismaCli } = await import(new URL('../../../server/dbPush.mjs', import.meta.url));
  const garde = path.join(RACINE, 'scripts', 'controle', 'banc', 'reseauLocal.cjs').replace(/\\/g, '/');
  const journal = path.join(tmp, 'reseau.jsonl');
  /** Environnement d'un essai : dossiers du PC redirigés, télémétrie vers un récepteur local, rien d'autre ne sort. */
  const env = (dossier, telemetrie) => {
    const e = {
      ...process.env,
      LOCALAPPDATA: path.join(tmp, dossier, 'local'),
      APPDATA: path.join(tmp, dossier, 'roaming'),
      PRISMA_TELEMETRY_ENDPOINT: telemetrie,
      PRISMA_ENGINES_MIRROR: 'http://127.0.0.1:9',
      HTTP_PROXY: 'http://127.0.0.1:9',
      HTTPS_PROXY: 'http://127.0.0.1:9',
      NODE_OPTIONS: `--require "${garde}"`,
      CONTROLE_RESEAU_JOURNAL: journal,
      NO_COLOR: '1',
      DATABASE_URL: '',
    };
    delete e.CHECKPOINT_DISABLE; // posé par le banc pour ses propres commandes : jamais ici
    delete e.PRISMA_HIDE_UPDATE_MESSAGE;
    fs.mkdirSync(e.LOCALAPPDATA, { recursive: true });
    fs.mkdirSync(e.APPDATA, { recursive: true });
    return e;
  };

  // 1. Le vrai predev (node dbPush.mjs), sur une base temporaire, sans génération du client (jamais dans node_modules)
  const app = await recepteur(t);
  const configApp = copierSchema(path.join(tmp, 'app', 'elite.db'), path.join(tmp, 'app'));
  const r1 = await lancer([path.join(RACINE, 'server', 'dbPush.mjs'), '--config', configApp, '--sans-generate'], { cwd: path.join(tmp, 'app'), env: env('app', app.url) });
  assert.equal(r1.code, 0, r1.sortie);
  assert.ok(fs.existsSync(path.join(tmp, 'app', 'elite.db')), 'base temporaire créée');

  // 2. Témoin : la même commande par la CLI telle quelle ; sa télémétrie doit arriver au récepteur local
  const temoin = await recepteur(t);
  const configTemoin = copierSchema(path.join(tmp, 'temoin', 'elite.db'), path.join(tmp, 'temoin'));
  const r2 = await lancer([prismaCli(), 'db', 'push', '--config', configTemoin], { cwd: path.join(tmp, 'temoin'), env: env('temoin', temoin.url) });
  assert.equal(r2.code, 0, r2.sortie);
  // Envoyée par un processus détaché, après la fin de la commande
  for (let i = 0; i < 150 && !temoin.recues.length; i++) await new Promise((r) => setTimeout(r, 100));
  assert.ok(temoin.recues.some((u) => u.startsWith('/v1/check/prisma')), `témoin : la CLI telle quelle aurait dû envoyer sa télémétrie (reçu : ${JSON.stringify(temoin.recues)}) ; si Prisma a changé, revoir la coupure`);
  assert.match(temoin.recues[0], /signature=/, 'témoin : identifiant du PC dans la requête');

  // Le témoin est arrivé : celle du vrai predev aurait eu le temps d'arriver aussi
  await new Promise((r) => setTimeout(r, 500));
  assert.deepEqual(app.recues, [], 'dbPush.mjs : aucune requête de télémétrie');
  assert.ok(!fs.existsSync(path.join(tmp, 'app', 'local', 'checkpoint-nodejs')), 'dbPush.mjs : aucun identifiant du PC créé');
  const tentatives = fs.existsSync(journal) ? fs.readFileSync(journal, 'utf8').trim().split('\n').filter(Boolean) : [];
  assert.deepEqual(tentatives, [], 'aucune connexion vers l’extérieur, ni par le predev ni par le témoin');
});

test('lanceur : télémétrie et vérification de version coupées, app de bureau, jamais « localhost »', () => {
  const cmd = lire('Lancer EliteApp.cmd');
  assert.match(cmd, /^set "CHECKPOINT_DISABLE=1"/m);
  assert.match(cmd, /^set "npm_config_update_notifier=false"/m);
  assert.ok(!/localhost/i.test(cmd.split(/\r?\n/).filter((l) => !/^rem /i.test(l)).join('\n')), 'aucune adresse « localhost »');
  assert.match(cmd, /^start "" "node_modules\\electron\\dist\\electron\.exe" "%~dp0desktop"/m);
});

test('npm : .npmrc impose allowScripts et les versions minimales, coupe la vérification de version en ligne', () => {
  const rc = npmrc();
  assert.ok(rc.includes('strict-allow-scripts=true'), 'sans lui, un paquet absent de allowScripts exécute quand même son script');
  assert.ok(rc.includes('engine-strict=true'), 'sans lui, un npm trop ancien (qui ignore allowScripts) installerait en lançant tous les scripts');
  assert.ok(rc.includes('update-notifier=false'));
});

test('npm : npm 11.19 et Node 24 au moins exigés (package.json et lockfile), comme le dit le README', () => {
  const engines = json('package.json').engines;
  assert.deepEqual(engines, { node: '>=24', npm: '>=11.19.0' }, 'allowScripts et strict-allow-scripts : npm 11.19 ou plus récent');
  assert.deepEqual(json('package-lock.json').packages[''].engines, engines, 'lockfile à jour (npm ci le relit)');
  const readme = lire('README.md');
  const install = readme.slice(readme.indexOf('## Installation'), readme.indexOf('## Lancement'));
  assert.match(install, /Node\.js\]\(https:\/\/nodejs\.org\) 24/);
  assert.match(install, /npm 11\.19/);
  assert.doesNotMatch(install, /Node\.js\]\(https:\/\/nodejs\.org\) 20/);
});

test('installation : npm run installer lance npm ci sans télémétrie, et refuse une worktree aux node_modules liés', async () => {
  assert.equal(json('package.json').scripts.installer, 'node scripts/installer.mjs');
  const { INSTALL_ENV, refusInstallation, npmCli } = await import(new URL('../../installer.mjs', import.meta.url));
  assert.equal(INSTALL_ENV.CHECKPOINT_DISABLE, '1');
  assert.equal(INSTALL_ENV.npm_config_update_notifier, 'false');
  assert.match(npmCli({ npm_execpath: 'C:/x/npm-cli.js' }), /npm-cli\.js$/);
  assert.match(npmCli({}), /node_modules[\\/]npm[\\/]bin[\\/]npm-cli\.js$/);
  // Dossier temporaire : node_modules réel accepté, jonction vers un autre dossier refusée
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-controle-installer-'));
  try {
    fs.mkdirSync(path.join(tmp, 'node_modules'));
    assert.equal(refusInstallation(tmp), null);
    fs.rmSync(path.join(tmp, 'node_modules'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'ailleurs'));
    fs.symlinkSync(path.join(tmp, 'ailleurs'), path.join(tmp, 'node_modules'), 'junction');
    assert.match(refusInstallation(tmp), /lien vers un autre dossier/);
    assert.ok(fs.existsSync(path.join(tmp, 'ailleurs')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const readme = lire('README.md');
  const install = readme.slice(readme.indexOf('## Installation'), readme.indexOf('## Lancement'));
  assert.match(install, /npm run installer/);
  assert.match(install, /CHECKPOINT_DISABLE/);
});

test('allowScripts : chaque paquet du lockfile qui a un script d’installation a une décision explicite', () => {
  const allow = json('package.json').allowScripts || {};
  const lock = json('package-lock.json');
  const sans = [];
  for (const [chemin, p] of Object.entries(lock.packages || {})) {
    if (!p.hasInstallScript) continue;
    const nom = p.name || chemin.replace(/^.*node_modules\//, '');
    const cle = `${nom}@${p.version}`;
    if (typeof allow[cle] !== 'boolean') sans.push(cle);
  }
  assert.deepEqual(sans, [], 'ajouter « nom@version »: true (script utile) ou false (inutile) dans allowScripts');
  assert.equal(allow['tesseract.js@7.0.0'], false, 'son postinstall (opencollective) ne sert à rien');
});
