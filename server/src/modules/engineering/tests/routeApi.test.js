// API de l'itinéraire d'ingénierie (express + fetch, base en mémoire, fichiers dans un dossier temporaire) : garde de
// l'API locale (X-Elite-Compagnon), corps stricts, erreurs en français, rien d'écrit après un refus, calcul seulement
// à la demande (jamais par une lecture), un calcul au clic de validation, point de départ et position du calcul.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter, once } from 'node:events';
import express from 'express';
import engineering from '../index.js';
import { localGuard, jsonBody, bodyErrorMessage } from '../../../core/localGuard.js';
import { ref, memoryPrisma, tempDir, id } from './helpers/itinerary.js';

const withRef = ref ? test : test.skip;
let server;
let base;
let dir;
let guard = (req, res, next) => next();
const journal = Object.assign(new EventEmitter(), { addInterest() {} });
const game = { state: { cargo: [], balance: 2_000_000 } };
const prisma = memoryPrisma();
const files = () => ({ validated: path.join(dir, 'engineering-validated.json'), pins: path.join(dir, 'engineering-pins.json'), route: path.join(dir, 'engineering-route.json') });

before(async () => {
  if (!ref) return;
  dir = tempDir();
  const app = express();
  app.use('/api', (req, res, next) => guard(req, res, next));
  app.use(jsonBody());
  const router = express.Router();
  await engineering.register({ router, journal, prisma, game, broadcast: () => {} }, { files: files() });
  app.use('/api/modules/engineering', router);
  app.use((err, req, res, next) => {
    const bodyError = bodyErrorMessage(err);
    res.status(err.status || 500).json({ error: err.publicMessage || bodyError || 'Erreur interne du serveur.' });
  });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  guard = localGuard({ port: server.address().port });
  base = `http://127.0.0.1:${server.address().port}/api/modules/engineering`;
});
after(() => {
  if (!server) return;
  server.closeAllConnections();
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const send = async (method, p, body, { header = true, raw = null } = {}) => {
  const r = await fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'application/json', ...(header ? { 'X-Elite-Compagnon': '1' } : {}) }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = async (method, p, body) => {
  const r = await send(method, p, body);
  assert.ok(r.status < 300, `${method} ${p} : ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const t = (n) => `2026-11-08T10:${String(n).padStart(2, '0')}:00Z`;
const LOADOUT = { timestamp: t(1), event: 'Loadout', Ship: 'krait_mkii', ShipID: 7, ShipName: 'Banc', ShipIdent: 'BC-07', Modules: [{ Slot: 'FrameShiftDrive', Item: 'int_hyperdrive_size5_class5', Engineering: { Engineer: 'Felicity Farseer', EngineerID: 300100, BlueprintName: 'FSD_LongRange', Level: 2, Quality: 1 } }, { Slot: 'MainEngines', Item: 'int_engine_size6_class5' }] };
const SURVEY = { timestamp: t(0), event: 'EngineerProgress', Engineers: [{ Engineer: 'Felicity Farseer', EngineerID: 300100, Progress: 'Unlocked', Rank: 5, RankProgress: 0 }, { Engineer: 'Professor Palin', EngineerID: 300220, Progress: 'Unlocked', Rank: 5, RankProgress: 0 }, { Engineer: 'Elvira Martuuk', EngineerID: 300160, Progress: 'Unlocked', Rank: 5, RankProgress: 0 }, { Engineer: 'Lei Cheung', EngineerID: 300120, Progress: 'Known' }] };
const LOCATION = (n, sys, pos) => ({ timestamp: t(n), event: 'Location', Docked: false, StarSystem: sys, SystemAddress: 1000 + n, StarPos: pos });
const exists = (f) => fs.existsSync(files()[f]);
const read = (f) => fs.readFileSync(files()[f], 'utf8');

async function freshPlan(history) {
  for (const p of await ok('GET', '/plans')) await ok('DELETE', `/plans/${p.id}`);
  for (const f of Object.values(files())) fs.rmSync(f, { force: true });
  journal.emit('ready', { history });
  const p = await ok('POST', '/plans', { shipId: 7 });
  await ok('PUT', `/plans/${p.id}/modules/std-fsd`, { blueprint: 'FSD_LongRange', grade: 5, experimental: 'special_fsd_heavy' });
  await ok('PUT', `/plans/${p.id}/modules/std-t`, { blueprint: 'Engine_Dirty', grade: 5 });
  return p.id;
}

withRef('écritures sans X-Elite-Compagnon : 403, rien d’écrit', async () => {
  const pid = await freshPlan([SURVEY, LOADOUT, LOCATION(2, 'Sol', [0, 0, 0])]);
  for (const [m, p, body] of [['POST', `/plans/${pid}/validation`, {}], ['DELETE', `/plans/${pid}/validation`], ['PUT', '/engineers/300100/pin', { choice: 'none' }], ['DELETE', '/engineers/300100/pin'], ['POST', '/route', { planIds: [pid], from: 'sol' }]]) {
    const r = await send(m, p, body, { header: false });
    assert.equal(r.status, 403, `${m} ${p}`);
  }
  assert.deepEqual([exists('validated'), exists('pins'), exists('route')], [false, false, false]);
});

withRef('corps et identifiants piégés : erreurs 4xx en français, jamais 500, rien d’écrit', async () => {
  const pid = await freshPlan([SURVEY, LOADOUT]);
  const cases = [
    ['POST', '/route', {}, 400, 'Coche au moins un plan validé (10 au plus).'],
    ['POST', '/route', { planIds: [] }, 400, 'Coche au moins un plan validé (10 au plus).'],
    ['POST', '/route', { planIds: ['1.5'] }, 400, 'Coche au moins un plan validé (10 au plus).'],
    ['POST', '/route', { planIds: ['0x10'] }, 400, 'Coche au moins un plan validé (10 au plus).'],
    ['POST', '/route', { planIds: ['constructor'] }, 400, 'Coche au moins un plan validé (10 au plus).'],
    ['POST', '/route', { planIds: [1, 1] }, 400, 'Coche au moins un plan validé (10 au plus).'],
    ['POST', '/route', { planIds: Array.from({ length: 11 }, (_, i) => i + 1) }, 400, 'Coche au moins un plan validé (10 au plus).'],
    ['POST', '/route', { planIds: [99], from: 'sol' }, 400, 'Le plan 99 n’existe pas (ou plus).'],
    ['POST', '/route', { planIds: [pid], from: 'sol' }, 400, `Le plan « ${prisma.plans[0].name} » n’est pas validé : valide-le d’abord.`],
    ['POST', '/route', { planIds: [pid], from: 'mars' }, 400, 'Point de départ invalide : « position », « sol », « colonia » ou un ingénieur.'],
    ['POST', '/route', { planIds: [pid], from: { engineer: 1 } }, 400, 'Point de départ invalide : « position », « sol », « colonia » ou un ingénieur.'],
    ['POST', '/route', { planIds: [pid], from: { engineer: 300100, x: 1 } }, 400, 'Point de départ invalide : « position », « sol », « colonia » ou un ingénieur.'],
    ['POST', '/route', { planIds: [pid], from: 'position' }, 400, 'Ta position n’est pas connue (aucun saut ni arrivée dans tes journaux) : choisis un point de départ.'],
    ['POST', '/route', { planIds: [pid], from: 'sol', exclude: 'x' }, 400, 'Liste des ingénieurs écartés invalide (25 au plus).'],
    ['POST', '/route', { planIds: [pid], from: 'sol', exclude: [1] }, 400, 'Liste des ingénieurs écartés invalide (25 au plus).'],
    ['POST', '/route', { planIds: [pid], from: 'sol', vite: true }, 400, 'Champ inconnu : « vite ».'],
    ['POST', '/route', [1, 2], 400, 'Corps attendu : un objet JSON.'],
    ['PUT', '/engineers/300100/pin', { choice: 'peut-être' }, 400, 'Choisis « J’ai épinglé » avec un plan, « Aucun » ou « Je ne sais pas ».'],
    ['PUT', '/engineers/300100/pin', { choice: 'pinned' }, 400, 'Choisis « J’ai épinglé » avec un plan, « Aucun » ou « Je ne sais pas ».'],
    ['PUT', '/engineers/300100/pin', { choice: 'none', grp: 'fsd' }, 400, 'Choisis « J’ai épinglé » avec un plan, « Aucun » ou « Je ne sais pas ».'],
    ['PUT', '/engineers/300100/pin', { choice: 'pinned', grp: 'fsd', blueprint: 'Weapon_Efficient' }, 400, 'Felicity Farseer ne propose pas ce plan : choisis-en un dans la liste.'],
    ['PUT', '/engineers/300100/pin', { choice: 'pinned', grp: '__proto__', blueprint: 'FSD_LongRange' }, 400, 'Felicity Farseer ne propose pas ce plan : choisis-en un dans la liste.'],
    ['PUT', '/engineers/300120/pin', { choice: 'pinned', grp: 'sg', blueprint: 'ShieldGenerator_Thermic' }, 409, 'Lei Cheung n’est pas débloqué d’après tes journaux : on n’épingle qu’à son atelier, une fois débloqué.'],
    ['PUT', '/engineers/999999/pin', { choice: 'none' }, 404, 'Ingénieur introuvable.'],
    ['PUT', '/engineers/constructor/pin', { choice: 'none' }, 404, 'Ingénieur introuvable.'],
    ['DELETE', '/engineers/30010/pin', undefined, 404, 'Ingénieur introuvable.'],
    ['GET', '/engineers/999999', undefined, 404, 'Ingénieur introuvable.'],
    ['GET', '/engineers/0x1000', undefined, 404, 'Ingénieur introuvable.'],
    ['POST', '/plans/1.5/validation', {}, 404, 'Plan introuvable.'],
    ['POST', '/plans/0x10/validation', {}, 404, 'Plan introuvable.'],
    ['POST', '/plans/constructor/validation', {}, 404, 'Plan introuvable.'],
    ['POST', '/plans/999/validation', {}, 404, 'Plan introuvable.'],
    ['DELETE', '/plans/1.5/validation', undefined, 404, 'Plan introuvable.'],
    ['POST', `/plans/${pid}/validation`, { vite: 1 }, 400, 'Champ inconnu : « vite ».'],
  ];
  for (const [m, p, body, status, error] of cases) {
    const r = await send(m, p, body);
    assert.equal(r.status, status, `${m} ${p} ${JSON.stringify(body)} : ${JSON.stringify(r.body)}`);
    assert.equal(r.body.error, error, `${m} ${p}`);
  }
  // __proto__ dans un corps (clé propre, comme JSON.parse la crée)
  const proto = await send('POST', '/route', null, { raw: '{"__proto__":{"planIds":[1]},"planIds":[1]}' });
  assert.deepEqual([proto.status, proto.body.error], [400, 'Champ inconnu : « __proto__ ».']);
  // Un plan sans cible ne se valide pas
  const empty = await ok('POST', '/plans', { shipType: 'krait_mkii' });
  assert.deepEqual(await send('POST', `/plans/${empty.id}/validation`, {}), { status: 400, body: { error: 'Ce plan ne vise aucune modification : rien à valider.' } });
  assert.deepEqual([exists('validated'), exists('pins'), exists('route')], [false, false, false], 'rien d’écrit après un refus');
});

withRef('valider calcule une fois depuis ta position ; sans position, aucun calcul ; annuler ne calcule rien', async () => {
  // Sans position : validé, pas calculé, aucun fichier d'itinéraire
  const pid = await freshPlan([SURVEY, LOADOUT]);
  const v = await ok('POST', `/plans/${pid}/validation`);
  assert.deepEqual([v.stale, v.bound, v.ship, v.route.computed, v.route.reason], [false, true, 'ok', false, 'position inconnue']);
  assert.equal(exists('route'), false);
  assert.equal(exists('validated'), true);
  assert.deepEqual((await ok('GET', '/validations')).map((x) => [x.planId, x.stale]), [[pid, false]]);
  assert.ok((await ok('GET', `/plans/${pid}`)).validation.at);
  // Avec une position : un calcul, enregistré, que GET /route relit tel quel
  journal.emit('event', LOCATION(3, 'Wyrd', [-11.0625, 31.53125, -3.9375]));
  const v2 = await ok('POST', `/plans/${pid}/validation`, {});
  assert.equal(v2.route.computed, true);
  assert.deepEqual(v2.route.planIds, [pid]);
  const g1 = await ok('GET', '/route');
  assert.equal(g1.result.computedAt, v2.route.computedAt);
  assert.equal(g1.result.from.kind, 'position');
  assert.equal(g1.result.positionAtCompute.system, 'Wyrd');
  const routeFile = read('route');
  // GET ne recalcule jamais (même résultat, fichier inchangé)
  const g2 = await ok('GET', '/route');
  assert.deepEqual(g2.result, g1.result);
  assert.equal(read('route'), routeFile);
  // Annuler la validation : rien n'est calculé ; GET /route le signale
  assert.deepEqual(await ok('DELETE', `/plans/${pid}/validation`), { ok: true });
  assert.deepEqual(await ok('DELETE', `/plans/${pid}/validation`), { ok: true }, 'idempotent');
  assert.equal(read('route'), routeFile);
  assert.ok((await ok('GET', '/route')).changes.some((c) => c.kind === 'plan' && c.what === 'validation-annulee'));
  // Revalidé, puis un deuxième plan validé : le calcul reprend les plans du dernier calcul, plus celui-ci
  await ok('POST', `/plans/${pid}/validation`);
  const p2 = await ok('POST', '/plans', { shipType: 'python' });
  await ok('PUT', `/plans/${p2.id}/modules/std-fsd`, { module: 'int_hyperdrive_size5_class5', blueprint: 'FSD_LongRange', grade: 3 });
  const v3 = await ok('POST', `/plans/${p2.id}/validation`);
  assert.deepEqual(v3.route.planIds.sort((a, b) => a - b), [pid, p2.id].sort((a, b) => a - b));
  assert.equal(v3.bound, false);
  // POST puis GET : le même résultat
  const posted = await ok('POST', '/route', { planIds: [pid, p2.id], from: 'sol' });
  assert.deepEqual((await ok('GET', '/route')).result, posted);
  // Un plan modifié depuis sa validation est refusé au calcul (texte exact)
  await ok('PUT', `/plans/${pid}/modules/std-t`, { grade: 4 });
  const stale = await send('POST', '/route', { planIds: [pid], from: 'sol' });
  assert.equal(stale.status, 400);
  assert.match(stale.body.error, /^Le plan « .+ » a changé depuis sa validation du \d{2}\/\d{2} : revalide-le\.$/);
  assert.equal((await ok('GET', `/plans/${pid}`)).validation.stale, true);
  assert.ok((await ok('GET', '/route')).changes.some((c) => c.kind === 'plan' && c.what === 'modifie'));
});

withRef('point de départ et position du calcul ; écartés repris du dernier calcul ; « tu as bougé » seulement pour ta position', async () => {
  const pid = await freshPlan([SURVEY, LOADOUT, LOCATION(2, 'Wyrd', [-11.0625, 31.53125, -3.9375])]);
  await ok('POST', `/plans/${pid}/validation`);
  const fromPos = await ok('POST', '/route', { planIds: [pid], from: 'position', exclude: [300220] });
  assert.deepEqual([fromPos.from.kind, fromPos.positionAtCompute.system, fromPos.options.exclude], ['position', 'Wyrd', [300220]]);
  // exclude absent : celui du dernier calcul ; [] : aucun
  const again = await ok('POST', '/route', { planIds: [pid], from: 'sol' });
  assert.deepEqual(again.options.exclude, [300220]);
  assert.equal(again.from.kind, 'sol');
  assert.equal(again.positionAtCompute.system, 'Wyrd', 'la position du joueur au calcul, à part du départ choisi');
  const none = await ok('POST', '/route', { planIds: [pid], from: 'colonia', exclude: [] });
  assert.deepEqual([none.options.exclude, none.from.region], [[], 'Colonia']);
  const eng = await ok('POST', '/route', { planIds: [pid], from: { engineer: 300100 } });
  assert.deepEqual([eng.from.kind, eng.from.engineerId, eng.from.system], ['engineer', 300100, 'Deciat']);
  // Départ choisi : aucun « tu as bougé », même après un saut
  journal.emit('event', { ...LOCATION(5, 'Leesti', [72.75, 48.75, 68.25]), event: 'FSDJump' });
  assert.equal((await ok('GET', '/route')).changes.some((c) => c.kind === 'position'), false);
  // Départ « ma position » : la distance depuis la position du calcul
  const mine = await ok('POST', '/route', { planIds: [pid], from: 'position' });
  journal.emit('event', { ...LOCATION(6, 'Wyrd', [-11.0625, 31.53125, -3.9375]), event: 'FSDJump' });
  const moved = (await ok('GET', '/route')).changes.find((c) => c.kind === 'position');
  assert.deepEqual([moved.from, moved.to], [mine.positionAtCompute.system, 'Wyrd']);
  assert.ok(moved.distanceAl > 0);
  // Position inconnue : Sol marche, sans position du calcul
  journal.emit('ready', { history: [SURVEY, LOADOUT] });
  const sol = await ok('POST', '/route', { planIds: [pid], from: 'sol' });
  assert.equal(sol.positionAtCompute, null);
  assert.equal((await ok('GET', '/route')).position, null);
});

withRef('épingles : saisie, retour à la déduction, une seule par ingénieur ; GET /engineers et la fiche', async () => {
  await freshPlan([SURVEY, LOADOUT]);
  const s1 = await ok('PUT', '/engineers/300100/pin', { choice: 'pinned', grp: 'fsd', blueprint: 'FSD_LongRange' });
  assert.deepEqual([s1.effective.blueprint, s1.effective.source, s1.effective.remoteMax, s1.saisie.choice], ['FSD_LongRange', 'saisie', 5, 'pinned']);
  const s2 = await ok('PUT', '/engineers/300100/pin', { choice: 'unknown' });
  assert.deepEqual([s2.effective, s2.saisie.choice], [null, 'unknown']);
  assert.deepEqual(Object.keys(JSON.parse(read('pins')).pins), ['300100'], 'une seule épingle par ingénieur');
  const s3 = await ok('DELETE', '/engineers/300100/pin');
  assert.equal(s3.saisie, null);
  const list = await ok('GET', '/engineers');
  assert.equal(list.engineers.length, 25);
  const one = await ok('GET', `/engineers/${id('Broo Tarquin')}`);
  assert.deepEqual([one.name, one.base, one.referral.name, one.unlock.items[0].label], ['Broo Tarquin', "Broo's Legacy", 'Hera Tani', 'Thé de Fujin']);
  assert.ok(one.offers.some((o) => o.blueprint === 'Weapon_Efficient' && o.maxGrade === 5));
  const rules = await ok('GET', '/route/rules');
  assert.ok(rules.rules.some((r) => r.id === 'R5b') && rules.rank.R1.length === 15);
});

withRef('données des ingénieurs illisibles : le serveur continue, les rangs aussi ; liste, itinéraire et épingles répondent 503', async () => {
  const { EngineeringService } = await import('../services/service.js');
  const bad = path.join(dir, 'engineers-abime.json');
  fs.writeFileSync(bad, '{"meta":{"version":1}}');
  const j = Object.assign(new EventEmitter(), { addInterest() {} });
  const warn = console.warn;
  console.warn = () => {};
  let s;
  try {
    s = new EngineeringService({ prisma: memoryPrisma(), journal: j, broadcast: () => {} }, { files: { validated: path.join(dir, 'x1.json'), pins: path.join(dir, 'x2.json'), route: path.join(dir, 'x3.json') }, engineersFile: bad });
  } finally {
    console.warn = warn;
  }
  try {
    j.emit('ready', { history: [SURVEY, LOADOUT] });
    assert.ok(s.rankReport().engineers.length >= 1, 'les rangs restent lus');
    for (const call of [() => s.itin.engineers(), () => s.itin.view(), () => s.itin.setPin('300100', { choice: 'none' })]) {
      await assert.rejects(async () => call(), (err) => err.status === 503 && /^Données des ingénieurs illisibles \(.+\) : la liste des ingénieurs, l’itinéraire et la fiche chez l’ingénieur sont indisponibles\.$/.test(err.publicMessage));
    }
    assert.equal(s.itin.rules().rules.length > 0, true, 'la table des règles reste servie');
  } finally {
    clearTimeout(s.notifyTimer);
  }
});

withRef('plan supprimé : sa validation est ignorée, rien n’est réécrit tant que le joueur ne demande rien', async () => {
  const pid = await freshPlan([SURVEY, LOADOUT]);
  await ok('POST', `/plans/${pid}/validation`);
  const before = read('validated');
  await ok('DELETE', `/plans/${pid}`);
  assert.deepEqual(await ok('GET', '/validations'), []);
  await ok('GET', '/route');
  assert.equal(read('validated'), before, 'aucune écriture par une lecture');
  // À la prochaine écriture demandée, l'entrée orpheline disparaît
  const p2 = await ok('POST', '/plans', { shipId: 7 });
  await ok('PUT', `/plans/${p2.id}/modules/std-fsd`, { blueprint: 'FSD_LongRange', grade: 5 });
  await ok('POST', `/plans/${p2.id}/validation`);
  assert.deepEqual(Object.keys(JSON.parse(read('validated')).plans), [String(p2.id)]);
});
