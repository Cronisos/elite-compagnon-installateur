// Côté chef : Cloudflare, GitHub et le serveur de l'escadron sont simulés (aucun réseau) ; les fichiers vont dans un
// dossier temporaire.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { instructions, monterServeur, sourcesWorker } from './cloudflare.js';
import { installerSuivi } from './github.js';
import { Chef, FICHIER_CHEF, routeValide, webhookValide } from './chef.js';
import { lireCodeEscadron, lireCodeGestion } from '../code.js';

const CLE_CF = 'cf_'.padEnd(40, 'x');
const CLE_GH = 'ghp_'.padEnd(40, 'y');
// Faux webhook, assemblé en morceaux : un vrai lien écrit en entier serait refusé à la distribution (scripts/distribution.mjs)
const HOOK = ['https://discord.com/api/webhooks', '123456789012345678', 'abcdefghijklmnopqrstuvwxyz_ABCDEFGH-123'].join('/');
const ROUTE = {
  title: 'ROUTE TEST', power: 'Aisling Duval', since: '2026-11-13T07:00:00Z',
  stops: [{ name: 'Système Test', goal: 'Consolidé' }, { name: 'Système Test 2', goal: 'Prise', merits: 500000 }],
};

const dirs = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-chef-'));
  dirs.push(d);
  return d;
};
after(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

/** Faux réseau : [méthode, motif d'adresse, réponse(url, options, appel)] ; chaque appel est noté. */
function faux(regles) {
  const appels = [];
  const fetch = async (url, options = {}) => {
    const appel = { url, method: options.method ?? 'GET', options, json: typeof options.body === 'string' ? JSON.parse(options.body) : null };
    appels.push(appel);
    const r = regles.find(([m, re]) => m === appel.method && re.test(url));
    if (!r) throw new Error(`inattendu : ${appel.method} ${url}`);
    const { status = 200, body = null } = (await r[2](url, options, appel)) ?? {};
    return { status, ok: status >= 200 && status < 300, json: async () => body, body: { cancel: async () => {} } };
  };
  return { appels, fetch };
}
const cfOk = (result) => ({ body: { success: true, result } });

/** Faux Cloudflare : un compte, sous-domaine présent ou non, base absente. */
function fauxCloudflare({ sousDomaine = 'chef-test', existant = null } = {}) {
  let sd = sousDomaine;
  return faux([
    ['GET', /\/workers\/scripts\/squadron-tracker-api\/settings$/, () => (existant ? cfOk(existant) : { status: 404, body: { success: false, errors: [{ code: 10007, message: 'This Worker does not exist' }] } })],
    ['GET', /\/accounts\?per_page/, () => cfOk([{ id: 'acc1', name: 'Compte du chef' }])],
    ['GET', /\/workers\/subdomain$/, () => (sd ? cfOk({ subdomain: sd }) : { status: 404, body: { success: false, errors: [{ code: 10007, message: 'no subdomain' }] } })],
    ['PUT', /\/workers\/subdomain$/, (u, o, a) => { sd = a.json.subdomain; return cfOk({ subdomain: sd }); }],
    ['GET', /\/d1\/database\?name=/, () => cfOk([])],
    ['POST', /\/d1\/database$/, () => cfOk({ uuid: 'base-1', name: 'squadron-tracker' })],
    ['POST', /\/d1\/database\/base-1\/query$/, () => cfOk([{ success: true }])],
    ['PUT', /\/workers\/scripts\/squadron-tracker-api$/, () => cfOk({ id: 'squadron-tracker-api' })],
    ['POST', /\/workers\/scripts\/squadron-tracker-api\/subdomain$/, () => cfOk({ enabled: true })],
    ['PUT', /\/workers\/scripts\/squadron-tracker-api\/secrets$/, () => cfOk({ name: 'JOIN_PASSWORD' })],
  ]);
}

const SECRETS = { ADMIN_TOKEN: 'a'.repeat(43), TRACKER_TOKEN: 't'.repeat(43), JOIN_PASSWORD: 'mot de passe du chef' };

test('Cloudflare : base, tables, serveur avec ses trois secrets, adresse workers.dev ; la clé seulement en en-tête', async () => {
  const net = fauxCloudflare();
  const r = await monterServeur({ fetch: net.fetch, token: CLE_CF, secrets: SECRETS });
  assert.equal(r.url, 'https://squadron-tracker-api.chef-test.workers.dev');
  assert.equal(r.compte, 'Compte du chef');
  const requetes = net.appels.filter((a) => /query$/.test(a.url));
  assert.equal(requetes.length, instructions(sourcesWorker().schema).length);
  assert.ok(requetes.every((a) => /^CREATE (TABLE|INDEX) IF NOT EXISTS/.test(a.json.sql)));
  const envoi = net.appels.find((a) => a.method === 'PUT' && /scripts\/squadron-tracker-api$/.test(a.url));
  const meta = JSON.parse(await envoi.options.body.get('metadata').text());
  assert.deepEqual(meta.bindings.map((b) => `${b.type}:${b.name}`), ['d1:DB', 'secret_text:ADMIN_TOKEN', 'secret_text:TRACKER_TOKEN', 'secret_text:JOIN_PASSWORD']);
  assert.equal(meta.bindings[0].id, 'base-1');
  assert.match(await envoi.options.body.get('squadron-worker.js').text(), /\/v1\/join/);
  for (const a of net.appels) {
    assert.equal(a.options.headers.authorization, `Bearer ${CLE_CF}`);
    assert.equal(a.options.redirect, 'error');
    assert.ok(!a.url.includes(CLE_CF));
  }
});

test('Cloudflare : sans adresse workers.dev, il faut en choisir une ; clé refusée expliquée', async () => {
  let net = fauxCloudflare({ sousDomaine: null });
  await assert.rejects(monterServeur({ fetch: net.fetch, token: CLE_CF, secrets: SECRETS }), (e) => e.code === 'sous-domaine' && e.status === 409);
  assert.ok(!net.appels.some((a) => /scripts/.test(a.url)), 'rien envoyé avant le choix');
  net = fauxCloudflare({ sousDomaine: null });
  const r = await monterServeur({ fetch: net.fetch, token: CLE_CF, secrets: SECRETS, sousDomaine: 'mon-escadron' });
  assert.equal(r.url, 'https://squadron-tracker-api.mon-escadron.workers.dev');
  const refus = faux([['GET', /accounts/, () => ({ status: 403, body: { success: false, errors: [{ code: 10000, message: 'Authentication error' }] } })]]);
  await assert.rejects(monterServeur({ fetch: refus.fetch, token: CLE_CF, secrets: SECRETS }), (e) => e.code === 'cle' && /permissions/.test(e.publicMessage));
  await assert.rejects(monterServeur({ fetch: refus.fetch, token: 'court', secrets: SECRETS }), (e) => e.status === 400);
});

test('chef : monter garde les clés de chef et du suivi sur ce PC, jamais dans la vue ; remonter les réutilise', async () => {
  const dir = tmp();
  const hosts = [];
  const net = fauxCloudflare();
  const chef = new Chef({ dir, fetch: net.fetch, allowHost: (h) => hosts.push(h) });
  await assert.rejects(chef.monter({ cloudflare: CLE_CF, motDePasse: 'court' }), (e) => e.status === 400);
  const vue = await chef.monter({ cloudflare: CLE_CF, motDePasse: 'mot de passe du chef' });
  assert.equal(vue.serveur.url, 'https://squadron-tracker-api.chef-test.workers.dev');
  assert.deepEqual(hosts, ['squadron-tracker-api.chef-test.workers.dev']);
  const fichier = JSON.parse(fs.readFileSync(path.join(dir, FICHIER_CHEF), 'utf8'));
  assert.match(fichier.adminToken, /^[\w-]{43}$/);
  assert.doesNotMatch(JSON.stringify(vue), new RegExp(fichier.adminToken));
  assert.ok(!JSON.stringify(fichier).includes(CLE_CF), 'la clé Cloudflare n’est pas gardée');
  // Le mot de passe, lui, est gardé : il est dans le code de l'escadron, posté pour tous
  assert.equal(fichier.motDePasse, 'mot de passe du chef');
  await chef.monter({ cloudflare: CLE_CF, motDePasse: 'autre mot de passe' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, FICHIER_CHEF), 'utf8')).adminToken, fichier.adminToken);
  // Rechargé depuis le disque : le serveur est de nouveau autorisé dans la passerelle
  new Chef({ dir, fetch: net.fetch, allowHost: (h) => hosts.push(h) });
  assert.equal(hosts.length, 3);
});

test('chef : membres, nouveau jeton et retrait passent par le serveur avec la clé de chef', async () => {
  const dir = tmp();
  const cf = fauxCloudflare();
  const chef = new Chef({ dir, fetch: cf.fetch });
  await chef.monter({ cloudflare: CLE_CF, motDePasse: 'mot de passe du chef' });
  const admin = JSON.parse(fs.readFileSync(path.join(dir, FICHIER_CHEF), 'utf8')).adminToken;
  const serveur = faux([
    ['GET', /\/admin\/members$/, () => ({ body: { members: [{ cmdr: 'Testeur', created_at: '2026-11-15T10:00:00Z' }] } })],
    ['POST', /\/admin\/members$/, (u, o, a) => ({ body: { cmdr: a.json.cmdr, token: 'j'.repeat(43) } })],
    ['DELETE', /\/admin\/members\/Testeur%202$/, () => ({ body: { ok: true } })],
  ]);
  chef.fetch = serveur.fetch;
  assert.deepEqual(await chef.membres(), [{ cmdr: 'Testeur', depuis: '2026-11-15T10:00:00Z', installations: null, attente: 0, role: null }]);
  assert.deepEqual(await chef.nouveauJeton(' Testeur 2 '), { cmdr: 'Testeur 2', jeton: 'j'.repeat(43) });
  await chef.retirer('Testeur 2');
  assert.ok(serveur.appels.every((a) => a.options.headers.authorization === `Bearer ${admin}` && a.url.startsWith('https://squadron-tracker-api.chef-test.workers.dev/admin/')));
  await assert.rejects(chef.nouveauJeton(''), (e) => e.status === 400);
  await assert.rejects(new Chef({ dir: tmp(), fetch: serveur.fetch }).membres(), (e) => e.status === 409);
});

test('webhook et route : vérifiés et nettoyés', () => {
  assert.equal(webhookValide(HOOK.replace('discord.com', 'discordapp.com') + '/'), HOOK);
  for (const bad of ['', 'https://evil.example/api/webhooks/1/abc', 'http://discord.com/api/webhooks/123456/abcdefghijklmnopqrstuvwxyz']) {
    assert.throws(() => webhookValide(bad), (e) => e.status === 400);
  }
  const r = routeValide({ ...ROUTE, extra: 'non' });
  assert.equal(r.meritsPerPoint, 4);
  assert.equal(r.theme, 'orange');
  assert.deepEqual(r.stops, [{ name: 'Système Test', goal: 'Consolidé', merits: 1_880_000 }, { name: 'Système Test 2', goal: 'Prise', merits: 500000 }]);
  assert.ok(!('extra' in r));
  assert.throws(() => routeValide({ ...ROUTE, stops: [{ name: 'X', goal: 'Domination' }] }), (e) => /objectif/.test(e.publicMessage));
  assert.throws(() => routeValide({ ...ROUTE, since: 'jeudi' }), (e) => e.status === 400);
});

/** Faux GitHub : copie absente au début, prête au deuxième regard ; variable déjà là (409). */
function fauxGithub() {
  let regards = 0;
  return faux([
    ['GET', /\/user$/, () => ({ body: { login: 'chef-test' } })],
    ['GET', /\/repos\/chef-test\/squadron-tracker$/, () => (++regards < 3 ? { status: 404, body: { message: 'Not Found' } } : { body: { default_branch: 'main', fork: true, parent: { full_name: 'Cronisos/squadron-tracker' }, html_url: 'https://github.com/chef-test/squadron-tracker' } })],
    ['POST', /\/repos\/Cronisos\/squadron-tracker\/forks$/, () => ({ status: 202, body: {} })],
    ['GET', /\/actions\/secrets\/public-key$/, () => ({ body: { key_id: 'k1', key: 'E75P6uryBMf9M1j8nAByGIHRdCeBKCJ+xnTzf3/pe20=' } })],
    ['PUT', /\/actions\/secrets\/[A-Z_]+$/, () => ({ status: 201 })],
    ['POST', /\/actions\/variables$/, () => ({ status: 409, body: { message: 'Already exists' } })],
    ['PATCH', /\/actions\/variables\/TRACKER_ENABLED$/, () => ({ status: 204 })],
    ['PUT', /\/actions\/permissions$/, () => ({ status: 204 })],
    ['PUT', /\/workflows\/tracker\.yml\/enable$/, () => ({ status: 204 })],
    ['POST', /\/workflows\/tracker\.yml\/dispatches$/, () => ({ status: 204 })],
  ]);
}

test('GitHub : copie du projet, quatre secrets scellés, suivi allumé et lancé ; la clé seulement en en-tête', async () => {
  const net = fauxGithub();
  const secrets = { ROUTE_JSON: '{"stops":[]}', DISCORD_WEBHOOK_URL: HOOK, API_URL: 'https://x.workers.dev', TRACKER_TOKEN: 't'.repeat(43) };
  const r = await installerSuivi({ fetch: net.fetch, token: CLE_GH, secrets, attendre: async () => {} });
  assert.deepEqual(r, { depot: 'chef-test/squadron-tracker', adresse: 'https://github.com/chef-test/squadron-tracker' });
  const poses = net.appels.filter((a) => a.method === 'PUT' && /secrets\/[A-Z_]+$/.test(a.url));
  assert.deepEqual(poses.map((a) => a.url.split('/').at(-1)), Object.keys(secrets));
  for (const a of poses) {
    const nom = a.url.split('/').at(-1);
    assert.equal(a.json.key_id, 'k1');
    assert.equal(Buffer.from(a.json.encrypted_value, 'base64').length, 48 + Buffer.byteLength(secrets[nom]));
    assert.ok(!a.options.body.includes(secrets[nom]), `${nom} ne part jamais en clair`);
  }
  assert.ok(net.appels.some((a) => a.method === 'PATCH' && a.json.value === 'true'));
  assert.deepEqual(net.appels.at(-1).json, { ref: 'main' });
  for (const a of net.appels) {
    assert.equal(a.options.headers.authorization, `Bearer ${CLE_GH}`);
    assert.equal(a.options.redirect, 'error');
  }
});

test('GitHub : clé refusée ou sans droits, expliqué', async () => {
  const refus = faux([['GET', /\/user$/, () => ({ status: 401, body: { message: 'Bad credentials' } })]]);
  await assert.rejects(installerSuivi({ fetch: refus.fetch, token: CLE_GH, secrets: { A: 'b' } }), (e) => e.code === 'cle');
  const droits = faux([
    ['GET', /\/user$/, () => ({ body: { login: 'chef-test' } })],
    ['GET', /\/repos\/chef-test\/squadron-tracker$/, () => ({ body: { default_branch: 'main', fork: true, parent: { full_name: 'Cronisos/squadron-tracker' } } })],
    ['GET', /public-key$/, () => ({ status: 403, body: { message: 'Resource not accessible' } })],
  ]);
  await assert.rejects(installerSuivi({ fetch: droits.fetch, token: CLE_GH, secrets: { A: 'b' } }), (e) => /« repo » et « workflow »/.test(e.publicMessage));
});

/** Chef avec un serveur monté (faux Cloudflare), et sa clé de chef lue sur le disque. */
async function chefMonte() {
  const dir = tmp();
  const chef = new Chef({ dir, fetch: fauxCloudflare().fetch });
  chef.pauseSpansh = 0;
  await chef.monter({ cloudflare: CLE_CF, motDePasse: 'mot de passe du chef' });
  const fichier = JSON.parse(fs.readFileSync(path.join(dir, FICHIER_CHEF), 'utf8'));
  return { dir, chef, fichier };
}

test('le code de l\'escadron est dans la vue (serveur + mot de passe), jamais les clés', async () => {
  const { chef, fichier } = await chefMonte();
  const vue = chef.view();
  assert.deepEqual(lireCodeEscadron(vue.code), { serveur: 'https://squadron-tracker-api.chef-test.workers.dev', motDePasse: 'mot de passe du chef' });
  assert.ok(!JSON.stringify(vue).includes(fichier.adminToken));
  assert.ok(!JSON.stringify(vue).includes(fichier.trackerToken));
});

test('code de gestion : un autre PC reprend le serveur, après vérification de la clé de chef', async () => {
  const { chef, fichier } = await chefMonte();
  const code = chef.codeGestion();
  assert.deepEqual(lireCodeGestion(code), { url: fichier.url, adminToken: fichier.adminToken, trackerToken: fichier.trackerToken, motDePasse: 'mot de passe du chef' });
  const hosts = [];
  const serveur = faux([['GET', /\/admin\/members$/, (u, o) => (o.headers.authorization === `Bearer ${fichier.adminToken}` ? { body: { members: [] } } : { status: 401 })]]);
  const autre = new Chef({ dir: tmp(), fetch: serveur.fetch, allowHost: (h) => hosts.push(h) });
  const vue = await autre.relier({ code });
  assert.equal(vue.serveur.url, fichier.url);
  assert.equal(vue.serveur.monteIci, false);
  assert.equal(vue.code, chef.view().code);
  assert.deepEqual(hosts, ['squadron-tracker-api.chef-test.workers.dev']);
  // Mauvaise clé : refusée, rien n'est gardé
  const vide = new Chef({ dir: tmp(), fetch: serveur.fetch });
  await assert.rejects(vide.relier({ url: fichier.url, cleChef: 'x'.repeat(43) }), (e) => e.status === 400);
  assert.equal(vide.view().serveur, null);
  await assert.rejects(vide.relier({ code: 'EGC1.nimporte' }), (e) => e.status === 400);
  await assert.rejects(vide.relier({ url: 'https://192.168.1.2', cleChef: 'x'.repeat(43) }), (e) => e.status === 400);
  // Serveur d'avant cette version (il ne sait pas lister les membres) : clés gardées, marquées « ancien »
  const vieux = new Chef({ dir: tmp(), fetch: faux([['GET', /\/admin\/members$/, () => ({ status: 404 })]]).fetch });
  const vueVieux = await vieux.relier({ url: fichier.url, cleChef: fichier.adminToken, cleSuivi: fichier.trackerToken });
  assert.equal(vueVieux.serveur.ancien, true);
  assert.equal(vueVieux.cleSuivi, true);
  // Reprise à la main sans mot de passe : pas de code tant qu'il n'est pas noté
  const main = new Chef({ dir: tmp(), fetch: serveur.fetch });
  await main.relier({ url: fichier.url, cleChef: fichier.adminToken });
  assert.equal(main.view().code, null);
  assert.ok(main.noterMotDePasse('mot de passe du chef').code);
  assert.equal(main.oublier().serveur, null);
});

test('route : systèmes vérifiés sur Spansh, envoyée au serveur avec la clé de chef', async () => {
  const { chef, fichier } = await chefMonte();
  const envois = [];
  const net = faux([
    ['GET', /spansh\.co\.uk\/api\/search\?q=/, (u) => {
      const nom = decodeURIComponent(u.split('q=')[1]);
      return { body: { results: nom === 'Système Inconnu' ? [{ record: { name: 'Systeme Inconnu' } }] : [{ record: { name: nom } }] } };
    }],
    ['PUT', /\/admin\/route$/, (u, o, a) => { envois.push({ auth: o.headers.authorization, route: a.json }); return { body: { route: a.json, version: 4, updatedAt: '2026-11-15T20:00:00Z' } }; }],
  ]);
  chef.fetch = net.fetch;
  const vue = await chef.envoyerRoute(ROUTE);
  assert.deepEqual(vue.route, { titre: 'ROUTE TEST', systemes: 2, version: 4, le: '2026-11-15T20:00:00Z' });
  assert.equal(envois[0].auth, `Bearer ${fichier.adminToken}`);
  assert.equal(envois[0].route.stops[0].merits, 1_880_000);
  await assert.rejects(chef.envoyerRoute({ ...ROUTE, stops: [...ROUTE.stops, { name: 'Système Inconnu', goal: 'Prise' }] }), (e) => /Système Inconnu/.test(e.publicMessage));
  assert.equal(envois.length, 1, 'rien n’est envoyé avec un système inconnu');
  await assert.rejects(chef.envoyerRoute({ ...ROUTE, stops: [ROUTE.stops[0], ROUTE.stops[0]] }), (e) => /deux fois/.test(e.publicMessage));
});

test('serveur d\'avant cette version (sans route) : message clair', async () => {
  const { chef } = await chefMonte();
  chef.fetch = faux([['GET', /\/v1\/route$/, () => ({ status: 404, body: { error: 404 } })]]).fetch;
  await assert.rejects(chef.routeServeur(), (e) => e.status === 409 && /remonte-le/.test(e.publicMessage));
});

test('suivi GitHub : route envoyée au serveur, puis le suivi installé avec la clé du suivi gardée ici', async () => {
  const { chef, fichier } = await chefMonte();
  const gh = fauxGithub();
  const routeOk = faux([
    ['GET', /spansh/, (u) => ({ body: { results: [{ record: { name: decodeURIComponent(u.split('q=')[1]) } }] } })],
    ['PUT', /\/admin\/route$/, (u, o, a) => ({ body: { route: a.json, version: 1 } })],
  ]);
  chef.fetch = async (url, o) => (/api\.github\.com/.test(url) ? gh.fetch(url, o) : routeOk.fetch(url, o));
  // La copie du projet est prête tout de suite pour ce test (pas d'attente)
  gh.appels.length = 0;
  const vue = await chef.suiviGithub({ github: CLE_GH, webhook: HOOK, route: ROUTE }).catch((e) => e);
  // fauxGithub fait attendre la copie deux fois (3 s chacune) : on accepte l'attente réelle courte, ou on vérifie l'appel
  if (vue instanceof Error) throw vue;
  assert.equal(vue.suivi.depot, 'chef-test/squadron-tracker');
  const tracker = gh.appels.find((a) => /secrets\/TRACKER_TOKEN$/.test(a.url));
  assert.ok(tracker, 'TRACKER_TOKEN posé');
  assert.ok(routeOk.appels.some((a) => a.method === 'PUT'), 'route envoyée au serveur');
  const sans = new Chef({ dir: tmp(), fetch: faux([['GET', /\/admin\/members$/, () => ({ body: { members: [] } })]]).fetch });
  await sans.relier({ url: fichier.url, cleChef: fichier.adminToken });
  await assert.rejects(sans.suiviGithub({ github: CLE_GH, webhook: HOOK, route: ROUTE }), (e) => /clé du suivi/.test(e.publicMessage));
});

test('le Worker embarqué est celui du code d\'escadron et de la route', () => {
  const { source, schema } = sourcesWorker();
  assert.match(source, /\/v1\/join/);
  assert.match(source, /\/admin\/route/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS tokens/);
});

test('nom de commandant : refusé avant tout appel s’il ressemble à un chemin, à un nom réservé ou porte un caractère de contrôle', async () => {
  const { nomCommandant } = await import('./chef.js');
  assert.equal(nomCommandant('  Testeur 2 '), 'Testeur 2');
  assert.equal(nomCommandant("O'Neil-Été_3.b"), "O'Neil-Été_3.b");
  for (const faux of ['', ' ', '..', '../x', 'a/b', 'a\b', 'C:\Windows\win.ini', 'CON', 'nul', 'COM1', 'lpt1', 'AUX.png', 'con.json', 'a\u0000.png', 'a::$DATA', '．．／x', 'a..b', 'x'.repeat(65), null, 12, {}]) {
    assert.throws(() => nomCommandant(faux), (e) => e.status === 400 || e.statut === 400 || /Nom du commandant/.test(e.message), JSON.stringify(faux));
  }
});
