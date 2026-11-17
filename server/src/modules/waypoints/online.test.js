// Recherches en ligne de Mes repères : rien ne part du PC sans le choix du joueur. Réglage coupé par défaut (et
// après un fichier illisible) ; coupé, ni Spansh (prospection) ni Ardent (prix du système) ne sont interrogés, sauf
// au clic ; une réponse déjà reçue sert sans rien redemander. Faux fetch : rien ne part.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanOnline, OnlineSetting } from './online.js';
import { KNOWN_MAX, KnownBodies, LOAD_GAP_MS } from './survey.js';
import { SystemMarkets } from './markets.js';

const ADDR = '633943823090';
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'elite-online-'));

test('réglage : coupé et pas encore choisi par défaut ; seul un vrai « true » active', () => {
  assert.deepEqual(cleanOnline(undefined), { auto: false, asked: false, at: null });
  for (const v of [{ auto: 'true' }, { auto: 1 }, { auto: {} }, [true], null, 'true', { __proto__: { auto: true } }, JSON.parse('{"__proto__":{"auto":true}}')]) {
    assert.equal(cleanOnline(v).auto, false, JSON.stringify(v));
  }
  assert.deepEqual(cleanOnline({ auto: true, asked: true, at: '2026-11-08T12:00:00.000Z' }), { auto: true, asked: true, at: '2026-11-08T12:00:00.000Z' });
  assert.deepEqual(cleanOnline({ auto: false, asked: true, at: 'hier' }), { auto: false, asked: true, at: null });
});

test('réglage : choix enregistré d’un coup et relu ; fichier illisible mis de côté, retour à « coupé »', () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'waypoints-online.json');
    const s = new OnlineSetting(file);
    assert.equal(s.auto, false);
    assert.throws(() => s.choose('oui'), (err) => err.status === 400);
    assert.deepEqual(s.choose(true, new Date('2026-11-08T12:00:00Z')), { auto: true, asked: true, at: '2026-11-08T12:00:00.000Z' });
    assert.equal(new OnlineSetting(file).auto, true, 'relu au redémarrage');
    s.choose(false, new Date('2026-11-08T13:00:00Z'));
    assert.deepEqual(new OnlineSetting(file).view(), { auto: false, asked: true, at: '2026-11-08T13:00:00.000Z' });
    fs.writeFileSync(file, '{"auto":tr'); // coupé en pleine écriture par une ancienne version
    const warn = console.warn;
    console.warn = () => {};
    try {
      assert.deepEqual(new OnlineSetting(file).view(), { auto: false, asked: false, at: null });
    } finally {
      console.warn = warn;
    }
    assert.ok(fs.readdirSync(dir).some((n) => n.startsWith('waypoints-online.json.illisible-')), 'mis de côté, pas écrasé');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** Faux Spansh : note chaque système demandé. */
function fauxSpansh() {
  const vus = [];
  const fetchBodies = async (address) => {
    vus.push(address);
    return [{ body: `Sys ${address} 1`, subType: 'Icy body', distance: 10, gravity: 0.1, sites: 4 }];
  };
  return { vus, fetchBodies };
}

test('prospection : sans « online » (réglage coupé, pas de clic), Spansh n’est jamais interrogé', async () => {
  const s = fauxSpansh();
  const k = new KnownBodies({ fetchBodies: s.fetchBodies });
  for (let i = 0; i < 5; i++) assert.deepEqual(await k.get(ADDR), { bodies: [], loaded: false, at: null, error: null });
  assert.deepEqual(s.vus, []);
  // Clic : une requête ; ensuite la réponse gardée sert, même sans « online »
  const r = await k.get(ADDR, { online: true, force: true });
  assert.equal(r.loaded, true);
  assert.equal(r.bodies.length, 1);
  assert.deepEqual((await k.get(ADDR)).bodies, r.bodies);
  // Réglage activé : une requête par système, puis le cache d'une heure
  await k.get(ADDR, { online: true });
  assert.deepEqual(s.vus, [ADDR]);
  await k.get('359065916146', { online: true });
  assert.deepEqual(s.vus, [ADDR, '359065916146']);
});

test('prospection : adresse piégée jamais demandée ni gardée ; cache borné ; échec non réessayé à chaque appel', async () => {
  let t = 0;
  const s = fauxSpansh();
  const k = new KnownBodies({ fetchBodies: s.fetchBodies, now: () => t });
  for (const bad of ['../../api/search/save?x=', '1?jsonp=a#', '%2e%2e/%2e%2e/api', '', null, {}, ['1']]) {
    assert.equal((await k.get(bad, { online: true, force: true })).loaded, false);
  }
  assert.deepEqual(s.vus, []);
  assert.equal(k.cache.size, 0);
  for (let i = 0; i < KNOWN_MAX + 50; i++) await k.get(String(1000 + i), { online: true });
  assert.equal(k.cache.size, KNOWN_MAX, `${KNOWN_MAX} systèmes au plus`);
  assert.ok(!k.cache.has('1000') && k.cache.has(String(1000 + KNOWN_MAX + 49)));
  // Spansh injoignable : l'échec est dit, l'ancienne réponse reste, pas de nouvel essai automatique pendant 5 min
  let pannes = 0;
  const down = new KnownBodies({ fetchBodies: async () => { pannes += 1; throw new Error('Spansh a répondu 503'); }, now: () => t });
  assert.deepEqual(await down.get(ADDR, { online: true }), { bodies: [], loaded: false, at: null, error: 'Spansh a répondu 503' });
  await down.get(ADDR, { online: true });
  assert.equal(pannes, 1);
  t += LOAD_GAP_MS;
  await down.get(ADDR, { online: true, force: true }); // un clic réessaie, passé le délai entre deux demandes
  assert.equal(pannes, 2);
  t += 6 * 60_000;
  await down.get(ADDR, { online: true });
  assert.equal(pannes, 3);
});

test('prospection au clic : une seule demande à la fois par système, et 30 s au moins entre deux (sinon 429, rien demandé)', async () => {
  let t = 1_000_000;
  let liberer;
  const vus = [];
  const k = new KnownBodies({
    now: () => t,
    fetchBodies: (address) => {
      vus.push(address);
      return new Promise((r) => (liberer = () => r([{ body: `Sys ${address} 1`, subType: null, distance: 1, gravity: 0.1, sites: 2 }])));
    },
  });
  // Dix clics du même instant (double clic, plusieurs fenêtres, boucle d'une page) : une seule requête, la même réponse
  const clics = Array.from({ length: 10 }, () => k.get(ADDR, { online: true, force: true }));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(vus, [ADDR]);
  liberer();
  for (const r of await Promise.all(clics)) assert.equal(r.loaded, true);
  // Un clic de plus juste après : refus 429 avec le délai, sans requête
  t += 5_000;
  await assert.rejects(k.get(ADDR, { online: true, force: true }), (err) => err.status === 429 && /Spansh vient d’être interrogé pour ce système : réessaie dans 25 s\./.test(err.publicMessage));
  assert.deepEqual(vus, [ADDR]);
  // Un autre système n'attend pas ; le même, 30 s après la tentative : de nouveau permis
  const autre = k.get('359065916146', { online: true, force: true });
  await new Promise((r) => setImmediate(r));
  liberer();
  await autre;
  t += LOAD_GAP_MS - 5_000;
  const encore = k.get(ADDR, { online: true, force: true });
  await new Promise((r) => setImmediate(r));
  liberer();
  assert.equal((await encore).loaded, true);
  assert.deepEqual(vus, [ADDR, '359065916146', ADDR]);
  // Sans clic, la réponse gardée sert : aucun refus, aucune requête
  assert.equal((await k.get(ADDR)).loaded, true);
  assert.equal(vus.length, 3);
});

test('prix du système au clic : une seule demande à la fois par système, et 30 s au moins entre deux (sinon 429, rien demandé)', async () => {
  let t = 1_000_000;
  const urls = [];
  let liberer;
  const fetchImpl = (url) => {
    urls.push(url);
    return new Promise((r) => (liberer = () => r({ ok: true, status: 200, json: async () => [] })));
  };
  const m = new SystemMarkets({ fetchImpl, now: () => t });
  const clics = Array.from({ length: 10 }, () => m.forSystem('Synuefe OU-E c28-2', [], { online: true, force: true }));
  await new Promise((r) => setImmediate(r));
  assert.equal(urls.length, 1);
  liberer();
  for (const r of await Promise.all(clics)) assert.equal(r.ardent.loaded, true);
  t += 1_000;
  await assert.rejects(m.forSystem('Synuefe OU-E c28-2', [], { online: true, force: true }), (err) => err.status === 429 && /Ardent Insight vient d’être interrogé pour ce système : réessaie dans 29 s\./.test(err.publicMessage));
  assert.equal(urls.length, 1);
  // Ardent injoignable : l'échec compte aussi comme une tentative (pas de nouvel essai avant 30 s)
  const panne = new SystemMarkets({ fetchImpl: async () => { urls.push('panne'); throw new Error('Réseau coupé'); }, now: () => t });
  assert.equal((await panne.forSystem('S', [], { online: true, force: true })).error, 'Réseau coupé');
  await assert.rejects(panne.forSystem('S', [], { online: true, force: true }), (err) => err.status === 429);
  t += LOAD_GAP_MS;
  assert.equal((await panne.forSystem('S', [], { online: true, force: true })).error, 'Réseau coupé');
  assert.equal(urls.filter((u) => u === 'panne').length, 2);
});

test('prix du système (Ardent) : sans « online », aucun appel ; tes relevés seuls, puis la réponse gardée après un clic', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return { ok: true, status: 200, json: async () => [{ commodityName: 'gold', marketId: 1, stationName: 'Gare A', maxLandingPadSize: 3, sellPrice: 50000, demand: 900, updatedAt: '2026-11-08T10:00:00Z' }] };
  };
  const m = new SystemMarkets({ fetchImpl });
  const mine = [{ marketId: 2, station: 'Mon relevé', at: '2026-11-08T11:00:00Z', items: [{ commodity: 'iridium', sellPrice: 200000, demand: 40 }] }];
  const off = await m.forSystem('Synuefe OU-E c28-2', mine);
  assert.deepEqual(urls, [], 'réglage coupé : Ardent jamais interrogé');
  assert.deepEqual(Object.keys(off.ores), ['Iridium'], 'tes relevés seuls');
  assert.deepEqual(off.ardent, { loaded: false, at: null });
  const clic = await m.forSystem('Synuefe OU-E c28-2', mine, { online: true, force: true });
  assert.equal(urls.length, 1);
  assert.deepEqual(Object.keys(clic.ores).sort(), ['Iridium', 'Or']);
  assert.equal(clic.ardent.loaded, true);
  const ensuite = await m.forSystem('Synuefe OU-E c28-2', mine);
  assert.equal(urls.length, 1, 'la réponse gardée sert sans rien redemander');
  assert.deepEqual(Object.keys(ensuite.ores).sort(), ['Iridium', 'Or']);
  await m.forSystem('Autre système', []);
  assert.equal(urls.length, 1);
});

test('prix du système : réponse d’Ardent qui n’est pas une liste, lignes nulles ou prix non numériques : ignorées', async () => {
  const replies = [{ rows: { length: 2 } }, [null, 7, { commodityName: 'gold', marketId: 1, stationName: 'A', sellPrice: '9', demand: 5 }]];
  let n = 0;
  const m = new SystemMarkets({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => replies[n++] }), gapMs: 0 });
  assert.deepEqual((await m.forSystem('S', [], { online: true })).ores, {});
  assert.deepEqual((await m.forSystem('S', [], { online: true, force: true })).ores, {});
});
