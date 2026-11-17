// Tests du module Règles du jeu : forme du référentiel livré, contrôle des données, filtres et routes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadReferential, checkReferential, filterRules, ruleErrors, STATUSES } from './referential.js';
import regles from './index.js';

const ref = loadReferential();

test('le référentiel livré est complet et sans erreur', () => {
  assert.deepEqual(ref.errors, []);
  assert.deepEqual(ref.sheets.map((s) => s.id), ['powerplay', 'merites-vente', 'colonisation', 'escadrons']);
  for (const s of ref.sheets) assert.ok(ref.rules.some((r) => r.sheet === s.id), `fiche vide : ${s.id}`);
  for (const st of STATUSES) assert.ok(ref.rules.some((r) => r.status === st.id), `aucune règle « ${st.id} »`);
});

test('identifiants stables : uniques, en minuscules, préfixés par leur fiche', () => {
  const prefix = { powerplay: 'pp-', 'merites-vente': 'mv-', colonisation: 'colo-', escadrons: 'esc-' };
  const ids = ref.rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const r of ref.rules) {
    assert.ok(r.id.startsWith(prefix[r.sheet]), r.id);
    assert.equal(r.link, `/regles#${r.id}`);
  }
});

test('identifiants dont dépendent déjà les liens « pourquoi ? »', () => {
  // Retirer ou renommer l'un d'eux casse les liens des autres modules : garder l'ancien identifiant.
  for (const id of ['pp-merites-points', 'pp-prise-seuil', 'pp-surplus-perdu', 'pp-portee', 'mv-acquisition-lieu', 'mv-ennemi', 'mv-demande', 'mv-renfort-sur-place']) {
    assert.ok(ref.rules.some((r) => r.id === id), id);
  }
});

test("chaque règle a sa source : mesure de l'escadron ou adresse, et une date", () => {
  for (const r of ref.rules) {
    const types = new Set(r.sources.map((s) => s.type));
    if (r.status === 'mesuree') assert.ok(types.has('escadron'), r.id);
    if (r.status === 'publiee') assert.ok(r.sources.some((s) => /^https?:\/\//.test(s.url)), r.id);
    if (r.status !== 'a-verifier') assert.match(r.checkedAt, /^\d{4}-\d{2}-\d{2}$/, r.id);
  }
});

test("valeurs mesurées de l'escadron (mesures Powerplay de l’auteur, 1er-6 nov. 2026)", () => {
  const val = (id, key) => ref.rules.find((r) => r.id === id).values.find((v) => v.key === key).value;
  assert.equal(val('pp-merites-points', 'merites-par-point'), 4);
  assert.equal(val('pp-merites-points-exploration', 'merites-par-point'), 6);
  assert.equal(val('pp-prise-seuil', 'points'), 120_000);
  assert.equal(val('pp-prise-conflit', 'points'), 36_000);
  assert.equal(val('pp-palier-consolide', 'points'), 350_000);
  assert.equal(val('pp-palier-forteresse', 'points'), 650_000);
  assert.equal(val('pp-palier-forteresse', 'total'), 120_000 + 350_000 + 650_000);
  assert.equal(val('pp-jauge-forteresse', 'points'), 1_000_000);
  assert.equal(val('pp-portee', 'consolide'), 20);
  assert.equal(val('pp-portee', 'forteresse'), 30);
  assert.equal(val('mv-demande', 'ratio'), 4);
  assert.equal(val('pp-prise-seuil', 'merites'), val('pp-prise-seuil', 'points') * val('pp-merites-points', 'merites-par-point'));
  // Recoupements sur les journaux (relecture du 8 nov. 2026).
  assert.equal(val('pp-sape', 'points-retires'), 1);
  assert.equal(val('pp-total-merites', 'surestimation'), 0.52);
  assert.equal(val('mv-rares', 'merites-par-million'), 1500);
  assert.equal(val('mv-rares', 'renforcement'), 520);
  assert.equal(val('mv-renfort-mine-ailleurs', 'merites'), 0);
});

test("statuts : ce qui n'est mesuré qu'en prise ne passe pas pour une règle de renforcement", () => {
  const rule = (id) => ref.rules.find((r) => r.id === id);
  // Surplus perdu : mesuré en prise seulement (Col 285, Kuwemaki) ; aucun passage de palier en renforcement relevé.
  assert.equal(rule('pp-surplus-perdu').status, 'mesuree');
  assert.match(rule('pp-surplus-perdu').statement, /^En prise/);
  assert.equal(rule('pp-surplus-renforcement').status, 'a-verifier');
  assert.ok(rule('pp-surplus-perdu').related.includes('pp-surplus-renforcement'));
  // La somme des gains : chiffre mesuré par l'escadron, celui d'EliteMeritTracker n'est qu'une réserve.
  assert.equal(rule('pp-total-merites').status, 'mesuree');
  assert.equal(rule('mv-palladium').status, 'a-verifier');
  assert.ok(rule('mv-palladium').related.includes('mv-acquisition-lieu'));
});

test('relevés de système : lus aussi à la connexion et après un saut de porteur', () => {
  // Le jeu écrit PowerplayState, les jauges, StarPos… dans FSDJump, Location et CarrierJump : la vigie doit lire les trois.
  for (const r of ref.rules) {
    for (const j of r.journal) {
      const m = /^FSDJump\.(.+)$/.exec(j);
      if (!m) continue;
      assert.ok(r.journal.includes(`Location.${m[1]}`), `${r.id} : Location.${m[1]}`);
      assert.ok(r.journal.includes(`CarrierJump.${m[1]}`), `${r.id} : CarrierJump.${m[1]}`);
    }
  }
});

test('sources web : une adresse précise, pas un flux qui change', () => {
  for (const r of ref.rules) {
    for (const s of r.sources.filter((x) => x.type === 'web')) {
      assert.doesNotMatch(s.url, /GetNewsForApp/, `${r.id} : ${s.url}`);
    }
  }
});

test('colonisation : seulement des règles vérifiées', () => {
  assert.ok(ref.rules.filter((r) => r.sheet === 'colonisation').every((r) => r.status !== 'a-verifier'));
});

test('lexique : chaque terme a son français et son anglais', () => {
  const pairs = new Map(ref.rules.flatMap((r) => r.terms).map((t) => [t.en, t.fr]));
  assert.equal(pairs.get('Fortified'), 'Consolidé');
  assert.equal(pairs.get('Stronghold'), 'Forteresse');
  assert.equal(pairs.get('Exploited'), 'Exploité');
  assert.equal(pairs.get('Undermining'), 'Sape');
  assert.equal(pairs.get('Reinforcement'), 'Renforcement');
});

test('contrôle : une règle mal formée est écartée, avec la raison', () => {
  const sheets = [{ id: 'powerplay', title: 'Powerplay' }];
  const good = { id: 'pp-a', sheet: 'powerplay', title: 'A', statement: 'A.', status: 'mesuree', checkedAt: '2026-11-07', sources: [{ type: 'escadron', label: 'Mesure' }] };
  const out = checkReferential({
    sheets,
    rules: [
      good,
      { ...good, id: 'pp-b', status: 'publiee' }, // publiée sans adresse
      { ...good, id: 'pp-c', checkedAt: '2026-02-30' }, // date impossible
      { ...good, id: 'PP D' }, // identifiant invalide
      { ...good, id: 'pp-e', values: [{ key: 'x', label: 'X', value: '4', unit: 'u' }] }, // valeur en texte
      { ...good, id: 'pp-f', sources: [{ type: 'web', label: 'site', url: 'javascript:alert(1)' }], status: 'publiee' },
      { ...good, id: 'pp-a' }, // doublon
      { ...good, id: 'pp-g', related: ['pp-a', 'pp-inconnue'] },
    ],
  });
  assert.deepEqual(out.rules.map((r) => r.id), ['pp-a', 'pp-g']);
  assert.deepEqual(out.rules[1].related, ['pp-a']);
  assert.equal(out.errors.length, 7);
  assert.ok(out.errors.some((e) => e.includes('pp-b') && e.includes('adresse')));
  assert.ok(out.errors.some((e) => e.includes('pp-inconnue')));
});

test('contrôle : à vérifier sans date ni source est permis', () => {
  const r = { id: 'mv-x', sheet: 'm', title: 'X', statement: 'X.', status: 'a-verifier', sources: [] };
  assert.deepEqual(ruleErrors(r, new Set(['m'])), []);
});

test('fichier illisible : référentiel vide, sans plantage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regles-'));
  try {
    const file = path.join(dir, 'regles.json');
    fs.writeFileSync(file, '{ pas du json');
    const out = loadReferential(file);
    assert.deepEqual(out.rules, []);
    assert.equal(out.errors.length, 1);
    assert.deepEqual(loadReferential(path.join(dir, 'absent.json')).rules, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('filtres : statut, fiche, identifiants ; valeurs inconnues ignorées', () => {
  const measured = filterRules(ref, { statut: 'mesuree' });
  assert.ok(measured.length > 0 && measured.every((r) => r.status === 'mesuree'));
  const two = filterRules(ref, { statut: 'publiee,a-verifier', fiche: 'merites-vente' });
  assert.ok(two.every((r) => r.sheet === 'merites-vente' && r.status !== 'mesuree'));
  assert.deepEqual(filterRules(ref, { ids: 'pp-portee,mv-demande' }).map((r) => r.id).sort(), ['mv-demande', 'pp-portee']);
  assert.equal(filterRules(ref, {}).length, ref.rules.length);
  assert.deepEqual(filterRules(ref, { statut: '__proto__' }), []);
  assert.deepEqual(filterRules(ref, { ids: 'constructor' }), []);
});

/** Routeur minimal : garde les gestionnaires GET pour les appeler sans serveur. */
function fakeRouter() {
  const routes = new Map();
  return { routes, get: (p, fn) => routes.set(p, fn) };
}
function call(router, p, { params = {}, query = {} } = {}) {
  let body = null;
  let error = null;
  const res = { json: (b) => (body = b) };
  router.routes.get(p)({ params, query }, res, (e) => (error = e));
  return { body, error };
}

test('routes : référentiel, liste filtrée, règle par identifiant, 404 en français', async () => {
  const router = fakeRouter();
  await regles.register({ router });
  const all = call(router, '/').body;
  assert.equal(all.rules.length, ref.rules.length);
  assert.equal(all.errors, 0);
  assert.equal(call(router, '/rules', { query: { fiche: 'colonisation' } }).body.every((r) => r.sheet === 'colonisation'), true);
  assert.equal(call(router, '/rules/:id', { params: { id: 'pp-portee' } }).body.id, 'pp-portee');
  const missing = call(router, '/rules/:id', { params: { id: 'hasOwnProperty' } });
  assert.equal(missing.body, null);
  assert.equal(missing.error.status, 404);
  assert.match(missing.error.publicMessage, /Règle inconnue/);
});
