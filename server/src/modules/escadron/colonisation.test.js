// Projet de colonisation de l'escadron, de bout en bout : le chef (chef.js) et les apps des membres (colonisation.js)
// face au vrai Worker (la copie que l'app met en ligne chez le chef), sur une base SQLite en mémoire avec son schéma.
// Aucun réseau.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { colonisationCard, handle, validColonisation, validReleve } from './chef/worker/squadron-worker.js';
import { ColonisationEscadron, releveDe } from './colonisation.js';
import { Chef, colonisationValide } from './chef/chef.js';

const BASE = 'https://escadron-test.workers.dev';
const SYSTEME = 'Bleae Thua ED-D c12-5';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'colonisation-escadron-'));
const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
const ilYa = (min) => iso(Date.now() - min * 60_000);

/** Un chantier tel que le module Colonisation le rend (GET /sites/:id?local=1). */
const chantier = (over = {}) => ({
  marketId: 3963439106, system: SYSTEME, station: '$EXT_PANEL_ColonisationShip; Judson Depot',
  progress: 0.25, complete: false, failed: false, completedAt: null, provisional: false, updatedAt: ilYa(10),
  resources: [{ symbol: 'steel', name: 'Acier', required: 1000, provided: 250, remaining: 750 }, { symbol: 'aluminium', name: 'Aluminium', required: 500, provided: 125, remaining: 375 }],
  ...over,
});

function escadron() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(new URL('./chef/worker/schema.sql', import.meta.url), 'utf8'));
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    run: async () => sqlite.prepare(sql).run(...args),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
  });
  // Discord simulé (webhook) : POST ?wait=true rend le message, PATCH le modifie ; `discordRefuse` : lien supprimé
  const discord = { appels: [], refuse: false };
  const DISCORD_FETCH = async (url, options) => {
    discord.appels.push({ url, method: options.method, body: JSON.parse(options.body) });
    if (discord.refuse) return new Response('{"message":"Unknown Webhook"}', { status: 404 });
    return new Response(JSON.stringify({ id: '1300000000000000001' }), { status: 200 });
  };
  const env = { DB: { prepare: (sql) => statement(sql), batch: async (l) => { for (const s of l) await s.run(); } }, ADMIN_TOKEN: 'chef', TRACKER_TOKEN: 'suivi', JOIN_PASSWORD: 'code', DISCORD_FETCH };
  const appels = [];
  let ip = 0;
  const horloge = { decalage: 0 }; // le temps du serveur, avancé par les tests (une modification de carte par minute)
  const fetch = async (url, options = {}) => {
    appels.push({ url, method: options.method || 'GET', body: typeof options.body === 'string' ? options.body : null });
    const { signal: _, ...reste } = options;
    return handle(new Request(url, { ...reste, headers: { ...reste.headers, 'cf-connecting-ip': `203.0.113.${(ip += 1) % 250}` } }), env, Date.now() + horloge.decalage);
  };
  const rejoindre = async (cmdr) => (await (await fetch(`${BASE}/v1/join`, { method: 'POST', body: JSON.stringify({ cmdr, password: 'code' }) })).json()).token;
  const chef = new Chef({ dir: tmp(), fetch });
  chef.etat = { url: BASE, adminToken: 'chef' };
  /** L'app d'un membre : son jeton, ses chantiers suivis (modifiables), le projet activé ou non. */
  const app = async (cmdr, { actif = true, chantiers = [] } = {}) => {
    const token = await rejoindre(cmdr);
    const ici = { chantiers };
    const c = new ColonisationEscadron({ dir: tmp(), fetch, acces: () => ({ base: BASE, token }), source: async () => ici.chantiers });
    if (actif) c.activer(true);
    return Object.assign(c, { ici, token });
  };
  const envois = () => appels.filter((a) => a.url.endsWith('/v1/colonisation/releve')).length;
  return { fetch, appels, envois, chef, app, discord, horloge };
}

// Assemblé ici, comme dans chef.test.js : aucun lien de webhook entier dans le code (scripts/distribution.mjs)
const WEBHOOK = ['https://discord.com/api/webhooks', '123456789012345678', 'abcdefghijklmnopqrstuvwxyz_ABCDEF-123'].join('/');

const PROJET = { systems: [SYSTEME, 'Autre Système'], sites: [{ marketId: 2, system: 'autre système', name: 'Port de l’escadron' }, { marketId: 3963439106, system: SYSTEME }] };

test('rien ne part tant que le projet n’est pas activé, ni sans escadron rejoint', async () => {
  const e = escadron();
  const a = await e.app('Testeur', { actif: false });
  const avant = e.appels.length;
  await assert.rejects(a.passage(), (err) => err.status === 409 && /Active/.test(err.publicMessage));
  assert.equal(await a.enFond(), null);
  assert.equal(e.appels.length, avant);
  const seul = new ColonisationEscadron({ dir: tmp(), fetch: e.fetch, acces: () => ({ base: null, token: null }) });
  seul.activer(true);
  await assert.rejects(seul.passage(), (err) => err.status === 409 && /Rejoins/.test(err.publicMessage));
  assert.equal(seul.view().pret, false);
  assert.equal(e.appels.length, avant);
});

test('le chef publie le projet : les membres le lisent dans son ordre, chaque envoi monte la version', async () => {
  const e = escadron();
  const a = await e.app('Testeur');
  assert.equal((await a.passage()).projet, null); // pas encore de projet
  const r = await e.chef.envoyerColonisation(PROJET);
  assert.equal(r.version, 1);
  assert.deepEqual(e.chef.view().colonisation, { systemes: 2, chantiers: 2, version: 1, le: r.updatedAt });
  const vue = await a.passage();
  assert.deepEqual(vue.projet.sites.map((s) => [s.marketId, s.system]), [[2, 'Autre Système'], [3963439106, SYSTEME]]);
  assert.equal(vue.projet.sites[0].name, 'Port de l’escadron');
  assert.equal((await e.chef.envoyerColonisation({ ...PROJET, sites: [...PROJET.sites].reverse() })).version, 2);
  assert.deepEqual((await a.lire({ force: true })).projet.sites.map((s) => s.marketId), [3963439106, 2]);
  // Un membre ne peut pas publier : la route du chef demande sa clé
  const refus = await e.fetch(`${BASE}/admin/colonisation`, { method: 'PUT', headers: { authorization: `Bearer ${a.token}` }, body: JSON.stringify(PROJET) });
  assert.equal(refus.status, 401);
});

test('projet saisi par le chef : refusé avant tout envoi s’il ne tient pas debout', () => {
  const refuse = (p, re) => assert.throws(() => colonisationValide(p), (err) => err.status === 400 && re.test(err.publicMessage));
  refuse(null, /illisible/);
  refuse({ systems: [] }, /de 1 à 10 systèmes/);
  refuse({ systems: Array.from({ length: 11 }, (_, i) => `S${i}`) }, /de 1 à 10 systèmes/);
  refuse({ systems: ['A', 'a'] }, /deux fois/);
  refuse({ systems: ['A'], sites: [{ marketId: 1, system: 'B' }] }, /aucun système du projet/);
  refuse({ systems: ['A'], sites: [{ marketId: 1, system: 'A' }, { marketId: 1, system: 'A' }] }, /deux fois dans les priorités/);
  refuse({ systems: ['A'], sites: [{ marketId: -3, system: 'A' }] }, /sans MarketID/);
  assert.deepEqual(colonisationValide({ systems: [' A '], sites: [{ marketId: 7, system: 'a', name: '  ' }] }), { systems: ['A'], sites: [{ marketId: 7, system: 'A' }] });
  // Le serveur vérifie de son côté, sans faire confiance à l'app
  assert.equal(validColonisation({ systems: ['A'], sites: [{ marketId: 7, system: 'B' }] }), null);
  assert.equal(validColonisation({ systems: ['A', 'A'] }), null);
  assert.deepEqual(validColonisation({ systems: ['A'] }), { systems: ['A'], sites: [] });
});

test('un membre envoie son relevé, les autres le voient ; un plus ancien ne le remplace pas', async () => {
  const e = escadron();
  await e.chef.envoyerColonisation(PROJET);
  const a = await e.app('Testeur', { chantiers: [chantier()] });
  const b = await e.app('Testeur 2');
  const vueA = await a.passage();
  assert.equal(vueA.envoyes, 1);
  assert.equal(e.envois(), 1);
  const vueB = await b.passage();
  assert.equal(vueB.releves.length, 1);
  assert.equal(vueB.releves[0].cmdr, 'Testeur');
  assert.deepEqual(vueB.releves[0].resources.map((r) => [r.symbol, r.required, r.provided]), [['steel', 1000, 250], ['aluminium', 500, 125]]);
  assert.equal(vueB.releves[0].station, '$EXT_PANEL_ColonisationShip; Judson Depot');
  // Le relevé de C est plus ancien que celui du serveur : il ne part pas
  const c = await e.app('Testeur 3', { chantiers: [chantier({ updatedAt: ilYa(20), resources: [{ symbol: 'steel', required: 1000, provided: 0 }] })] });
  await c.passage();
  assert.equal(e.envois(), 1);
  // Et même envoyé à la main, le serveur garde le plus récent
  const vieux = await e.fetch(`${BASE}/v1/colonisation/releve`, { method: 'PUT', headers: { authorization: `Bearer ${c.token}` }, body: JSON.stringify(releveDe(c.ici.chantiers[0])) });
  assert.equal((await vieux.json()).cmdr, 'Testeur');
  // B passe au chantier plus tard : son relevé remplace celui de A pour tout le monde
  b.ici.chantiers = [chantier({ updatedAt: ilYa(1), progress: 0.5, resources: [{ symbol: 'steel', required: 1000, provided: 1000 }, { symbol: 'aluminium', required: 500, provided: 0 }] })];
  await b.passage();
  const relu = (await a.lire({ force: true })).releves[0];
  assert.equal(relu.cmdr, 'Testeur 2');
  assert.equal(relu.progress, 0.5);
});

test('rien de neuf : pas renvoyé ; lecture provisoire ou chantier hors projet : rien ne part', async () => {
  const e = escadron();
  await e.chef.envoyerColonisation(PROJET);
  const a = await e.app('Testeur', { chantiers: [chantier()] });
  await a.passage();
  await a.lire({ force: true });
  assert.equal(e.envois(), 1);
  // Lecture plus récente, même contenu, moins de 30 min après : rien à apprendre aux autres
  a.ici.chantiers = [chantier({ updatedAt: ilYa(5) })];
  await a.lire({ force: true });
  assert.equal(e.envois(), 1);
  // Tes livraisons ajoutées en attendant le dépôt : jamais envoyées (seulement ce que le jeu a écrit)
  a.ici.chantiers = [chantier({ updatedAt: ilYa(2), provisional: true, progress: 0.9 })];
  await a.lire({ force: true });
  assert.equal(e.envois(), 1);
  // Chantier d'un système hors du projet : jamais envoyé, et le serveur le refuserait
  a.ici.chantiers = [chantier({ marketId: 99, system: 'Ailleurs', updatedAt: ilYa(1) })];
  await a.lire({ force: true });
  assert.equal(e.envois(), 1);
  const hors = await e.fetch(`${BASE}/v1/colonisation/releve`, { method: 'PUT', headers: { authorization: `Bearer ${a.token}` }, body: JSON.stringify(releveDe(chantier({ marketId: 99, system: 'Ailleurs' }))) });
  assert.equal(hors.status, 409);
});

test('système retiré du projet : ses relevés sont effacés ; projet arrêté : plus rien', async () => {
  const e = escadron();
  await e.chef.envoyerColonisation(PROJET);
  const a = await e.app('Testeur', { chantiers: [chantier()] });
  await a.passage();
  assert.equal((await e.chef.colonisationServeur()).releves.length, 1);
  await e.chef.envoyerColonisation({ systems: ['Autre Système'], sites: [] });
  assert.equal((await a.lire({ force: true })).releves.length, 0);
  // Remis dans le projet : le relevé d'avant ne revient pas, le prochain passage le renvoie
  await e.chef.envoyerColonisation(PROJET);
  a.ici.chantiers = [chantier({ updatedAt: ilYa(3) })];
  assert.equal((await a.lire({ force: true })).releves.length, 1);
  await e.chef.arreterColonisation();
  assert.equal(e.chef.view().colonisation, null);
  const fin = await a.lire({ force: true });
  assert.equal(fin.projet, null);
  assert.equal(fin.releves.length, 0);
});

test('page ouverte : relecture en arrière-plan seulement si le projet est suivi et la dernière lecture vieille de 30 s', async () => {
  const e = escadron();
  await e.chef.envoyerColonisation(PROJET);
  const coupe = await e.app('Testeur', { actif: false });
  const avant = e.appels.length;
  coupe.rafraichirSiVieux();
  assert.equal(e.appels.length, avant);
  const a = await e.app('Testeur 2');
  a.rafraichirSiVieux();
  await a.enCours;
  assert.ok(a.view().projet);
  const lus = e.appels.length;
  a.rafraichirSiVieux(); // lu à l'instant : rien
  assert.equal(e.appels.length, lus);
});

test('carte Discord : postée à l’installation, dans l’ordre du chef, sans nom de commandant ; lien refusé : rien de gardé', async () => {
  const e = escadron();
  await e.chef.envoyerColonisation(PROJET);
  const a = await e.app('Testeur', { chantiers: [chantier({ station: 'Orbital Construction Site: *Gras* @everyone' })] });
  await a.passage();
  e.discord.refuse = true;
  await assert.rejects(e.chef.carteColonisation(WEBHOOK), (err) => err.status === 400 && /Discord refuse/.test(err.publicMessage));
  assert.equal((await e.chef.colonisationServeur()).discord, false);
  await assert.rejects(e.chef.carteColonisation('https://exemple.org/hook'), (err) => err.status === 400);
  e.discord.refuse = false;
  assert.equal((await e.chef.carteColonisation(WEBHOOK)).discord, true);
  const poste = e.discord.appels.at(-1);
  assert.equal(poste.method, 'POST');
  assert.equal(poste.url, `${WEBHOOK}?wait=true`);
  assert.deepEqual(poste.body.allowed_mentions, { parse: [] });
  const [carte] = poste.body.embeds;
  assert.deepEqual(carte.fields.map((f) => f.name.split(' — ')[0]), ['1. Port de l’escadron', '2. Chantier orbital · \\*Gras\\* \\@everyone']);
  assert.match(carte.fields[0].value, /Pas encore relevé/);
  assert.match(carte.fields[1].value, /▰▰▰▱▱▱▱▱▱▱ 25 %/);
  assert.match(carte.fields[1].value, /Reste 1 125 t/);
  assert.match(carte.fields[1].value, /Manque surtout : Acier 750 t · Aluminium 375 t/);
  assert.doesNotMatch(JSON.stringify(poste.body), /Testeur/);
  assert.equal((await e.chef.colonisationServeur()).discord, true);
});

test('carte Discord : un relevé la modifie, au plus une fois par minute ; projet arrêté : elle le dit', async () => {
  const e = escadron();
  await e.chef.envoyerColonisation(PROJET);
  await e.chef.carteColonisation(WEBHOOK);
  const a = await e.app('Testeur', { chantiers: [chantier()] });
  const b = await e.app('Testeur 2');
  await a.passage(); // relevé gardé moins d'une minute après l'installation : modification retenue
  assert.equal(e.discord.appels.length, 1);
  e.horloge.decalage = 61_000;
  await b.lire({ force: true }); // lecture d'un membre une minute plus tard : la modification part
  assert.equal(e.discord.appels.length, 2);
  const modif = e.discord.appels.at(-1);
  assert.equal(modif.method, 'PATCH');
  assert.equal(modif.url, `${WEBHOOK}/messages/1300000000000000001`);
  assert.match(modif.body.embeds[0].fields[1].value, /25 %/);
  await b.lire({ force: true }); // rien de neuf : rien ne part
  assert.equal(e.discord.appels.length, 2);
  // Nouveau projet : tout de suite, sans attendre la minute
  await e.chef.envoyerColonisation({ ...PROJET, sites: [...PROJET.sites].reverse() });
  assert.equal(e.discord.appels.length, 3);
  assert.match(e.discord.appels.at(-1).body.embeds[0].fields[0].name, /^1\. Vaisseau de colonisation · Judson Depot/);
  await e.chef.arreterColonisation();
  assert.equal(e.discord.appels.at(-1).body.embeds[0].description, 'Projet terminé.');
  // Retirée : plus rien ne part
  assert.equal((await e.chef.carteColonisation(null)).discord, false);
  await e.chef.envoyerColonisation(PROJET);
  assert.equal(e.discord.appels.length, 4);
});

test('carte Discord : 10 chantiers au plus, un chantier terminé coché', () => {
  const sites = Array.from({ length: 12 }, (_, i) => ({ marketId: i + 1, system: 'A', name: `Chantier ${i + 1}` }));
  const at = '2026-11-19T20:00:00Z';
  const carte = colonisationCard({ projet: { systems: ['A'], sites }, version: 3 }, [{ marketId: 1, system: 'A', at, complete: true, resources: [] }], Date.parse(at));
  const champs = carte.embeds[0].fields;
  assert.equal(champs.length, 11);
  assert.match(champs[0].value, /^✅ Terminé/);
  assert.match(champs.at(-1).value, /et 2 autre\(s\) chantier\(s\)/);
  assert.match(carte.embeds[0].footer.text, /Version 3/);
});

test('installation à confirmer : ni lecture ni relevé', async () => {
  const e = escadron();
  await e.chef.envoyerColonisation(PROJET);
  await e.app('Testeur');
  const seconde = await e.app('Testeur', { chantiers: [chantier()] }); // même nom : en attente
  await assert.rejects(seconde.passage(), (err) => err.status === 409 && /confirmée/.test(err.publicMessage));
  assert.equal(seconde.view().attente, true);
  assert.equal(e.envois(), 0);
});

test('serveur d’avant le projet, ou injoignable : message clair, rien de cassé', async () => {
  const vieux = new ColonisationEscadron({ dir: tmp(), fetch: async () => new Response('{}', { status: 404 }), acces: () => ({ base: BASE, token: 'x' }) });
  vieux.activer(true);
  await assert.rejects(vieux.passage(), (err) => err.status === 409 && /date d’avant le projet de colonisation/.test(err.publicMessage));
  assert.match(vieux.view().erreur, /mettre à jour/);
  const coupe = new ColonisationEscadron({ dir: tmp(), fetch: async () => { throw new Error('réseau'); }, acces: () => ({ base: BASE, token: 'x' }) });
  coupe.activer(true);
  assert.equal(await coupe.enFond(), null);
  assert.match(coupe.view().erreur, /injoignable/);
});

test('changer d’escadron : le projet de l’ancien ne reste pas', async () => {
  const e = escadron();
  await e.chef.envoyerColonisation(PROJET);
  const dir = tmp();
  const token = (await (await e.fetch(`${BASE}/v1/join`, { method: 'POST', body: JSON.stringify({ cmdr: 'Testeur', password: 'code' }) })).json()).token;
  let base = BASE;
  const c = new ColonisationEscadron({ dir, fetch: e.fetch, acces: () => ({ base, token }) });
  c.activer(true);
  assert.ok((await c.passage()).projet);
  base = 'https://autre-escadron.workers.dev';
  assert.equal(c.view().projet, null);
  // Relu du disque : toujours rien de l'ancien
  assert.equal(new ColonisationEscadron({ dir, fetch: e.fetch, acces: () => ({ base, token }) }).view().projet, null);
});

test('relevé d’un chantier suivi ici : seulement ce que le jeu a écrit', () => {
  assert.equal(releveDe(chantier({ updatedAt: null })), null); // jamais lu
  assert.equal(releveDe(chantier({ provisional: true })), null);
  assert.equal(releveDe(chantier({ system: null })), null);
  assert.equal(releveDe(chantier({ resources: [] })), null);
  // Fin déduite de l'amarrage, plus récente que la dernière lecture : c'est elle qui date le relevé
  const fin = ilYa(1);
  const r = releveDe(chantier({ complete: true, provisional: true, completedAt: fin }));
  assert.equal(r.at, fin);
  assert.equal(r.complete, true);
  // Le serveur refuse un relevé du futur, trop vieux (plus de 30 jours) ou mal formé
  const now = Date.now();
  assert.ok(validReleve(r, now));
  assert.equal(validReleve({ ...r, at: iso(now + 3600_000) }, now), null);
  assert.equal(validReleve({ ...r, at: iso(now - 31 * 86_400_000) }, now), null);
  assert.equal(validReleve({ ...r, resources: [{ symbol: 'Steel!', required: 1, provided: 0 }] }, now), null);
  assert.equal(validReleve({ ...r, resources: [{ symbol: 'steel', required: 1, provided: 0 }, { symbol: 'steel', required: 1, provided: 0 }] }, now), null);
  assert.equal(validReleve({ ...r, progress: 1.5 }, now), null);
});
