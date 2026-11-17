// Tests du module « Où agir cette semaine » : règle de portée, tâches saisies, relevés du journal, client Spansh
// (réseau simulé : aucun appel réel), recherche et confirmation à l'arrivée.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import express from 'express';
import {
  ACTIVITIES, RULES, bestAnchor, checkReading, cleanTask, matchingStations, readingOf, weekStart,
} from './rules.js';
import { SpanshClient, SpanshError, slimSystem, exactCase, NAMES_API, PAGE_SIZE } from './spansh.js';
import { findSystems, mergeAnchors } from './search.js';
import { TaskStore } from './store.js';
import { createModule, powerAfter } from './index.js';

const AISLING = 'Aisling Duval';
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'whereto-'));

// --- Règle de portée ---

test('portée : 20 al pile depuis un Consolidé, 30 al depuis une Forteresse, rien depuis un Exploité', () => {
  const target = { name: 'T', x: 0, y: 0, z: 0 };
  assert.equal(bestAnchor(target, [{ name: 'F', state: 'Fortified', x: 20, y: 0, z: 0 }])?.name, 'F');
  assert.equal(bestAnchor(target, [{ name: 'F', state: 'Fortified', x: 20.01, y: 0, z: 0 }]), null);
  assert.equal(bestAnchor(target, [{ name: 'S', state: 'Stronghold', x: 0, y: 30, z: 0 }])?.name, 'S');
  assert.equal(bestAnchor(target, [{ name: 'S', state: 'Stronghold', x: 0, y: 30.01, z: 0 }]), null);
  assert.equal(bestAnchor(target, [{ name: 'E', state: 'Exploited', x: 1, y: 0, z: 0 }]), null);
  // Le plus proche des appuis valides l'emporte
  const best = bestAnchor(target, [{ name: 'S', state: 'Stronghold', x: 25, y: 0, z: 0 }, { name: 'F', state: 'Fortified', x: 0, y: 0, z: 12 }]);
  assert.equal(best.name, 'F');
  assert.equal(best.distance, 12);
});

test('règles : chaque constante a un statut, une source et une date pour la vigie', () => {
  for (const r of RULES) {
    assert.ok(['mesurée', 'publiée', 'à vérifier'].includes(r.status), r.id);
    assert.ok(r.source && r.date, r.id);
  }
  const by = new Map(RULES.map((r) => [r.id, r]));
  assert.equal(by.get('ACQUISITION_POINTS')?.value, 120_000); // ratio affiché en points : surveillé lui aussi
  assert.equal(by.get('ACQUISITION_REACH_FORTIFIED_LY').status, 'mesurée');
  assert.equal(by.get('ACQUISITION_REACH_STRONGHOLD_LY').status, 'mesurée');
});

test('semaine Powerplay : du jeudi 7 h UTC au jeudi suivant', () => {
  assert.equal(weekStart(Date.UTC(2026, 10, 7, 12)), Date.UTC(2026, 10, 5, 7)); // samedi → jeudi 5 nov.
  assert.equal(weekStart(Date.UTC(2026, 10, 5, 6, 59)), Date.UTC(2026, 9, 29, 7)); // jeudi avant 7 h → semaine d'avant
  assert.equal(weekStart(Date.UTC(2026, 10, 5, 7)), Date.UTC(2026, 10, 5, 7));
});

// --- Tâches saisies ---

test('tâche : nom et type de système obligatoires, champs inconnus ignorés', () => {
  assert.equal(cleanTask({ relation: 'own' }), null);
  assert.equal(cleanTask({ name: 'x', relation: 'nimporte' }), null);
  const t = cleanTask({ name: '  Scanner des mégavaisseaux ', relation: 'enemy', states: ['Stronghold', 'Bidon', 'Unoccupied'], stationGroups: ['megaship', '__proto__'], enemy: 'Inconnu', largePad: 'oui' });
  assert.deepEqual(t.states, ['Stronghold']);
  assert.deepEqual(t.stationGroups, ['megaship']);
  assert.equal(t.enemy, null);
  assert.equal(t.largePad, false);
  assert.equal(t.name, 'Scanner des mégavaisseaux');
  // Une prise ne vise que des systèmes Inoccupés
  assert.deepEqual(cleanTask({ name: 'p', relation: 'acquisition', states: ['Stronghold'] }).states, ['Unoccupied']);
});

test('stations : type exigé, plateforme L, contact Powerplay ; chantiers et porte-vaisseaux exclus par défaut', () => {
  const stations = [
    { name: 'Rescue Ship', type: 'Mega ship', largePad: true, powerContact: false },
    { name: 'Port', type: 'Coriolis Starport', largePad: true, powerContact: true },
    { name: 'Petit', type: 'Outpost', largePad: false, powerContact: true },
    { name: 'Chantier', type: 'Space Construction Depot', largePad: false },
    { name: 'TST-001', type: 'Drake-Class Carrier', largePad: true },
  ];
  assert.deepEqual(matchingStations(stations, { stationGroups: ['megaship'] }).map((s) => s.name), ['Rescue Ship']);
  assert.deepEqual(matchingStations(stations, { stationGroups: [], powerContact: true, largePad: true }).map((s) => s.name), ['Port']);
  assert.deepEqual(matchingStations(stations, { stationGroups: [] }).map((s) => s.name), ['Rescue Ship', 'Port', 'Petit']);
});

// --- Relevés du journal (extraits réels, 5 nov. 2026) ---

const OU_E3 = {
  timestamp: '2026-11-05T16:00:41Z', event: 'FSDJump', StarSystem: 'Synuefe OU-E c28-3', StarPos: [204.15625, -86.09375, 155.5625],
  Powers: [AISLING], PowerplayState: 'Unoccupied', PowerplayConflictProgress: [{ Power: AISLING, ConflictProgress: 0.005925 }],
};
const MUANG = {
  timestamp: '2026-11-05T12:28:05Z', event: 'FSDJump', StarSystem: 'Muang', StarPos: [17.03125, -172.78125, -3.46875],
  ControllingPower: 'Archon Delaine', Powers: ['A. Lavigny-Duval', 'Archon Delaine', 'Denton Patreus'], PowerplayState: 'Stronghold',
  PowerplayStateControlProgress: 0.252805, PowerplayStateReinforcement: 0, PowerplayStateUndermining: 1195,
};

test("arrivée : le journal confirme une prise quand la puissance figure dans « Powers »", () => {
  const r = readingOf(OU_E3);
  assert.equal(r.state, 'Unoccupied');
  assert.deepEqual(r.conflict, [{ power: AISLING, progress: 0.005925 }]);
  assert.equal(checkReading(r, ACTIVITIES.acquisition, AISLING).valid, true);
  const out = checkReading({ ...r, powers: ['Yuri Grom'] }, ACTIVITIES.acquisition, AISLING);
  assert.equal(out.valid, false);
  assert.match(out.reasons.join(' '), /hors de portée/);
  // Puissance inconnue : à confirmer, sauf si l'état suffit à dire non
  assert.equal(checkReading(r, ACTIVITIES.acquisition, null).valid, null);
  assert.equal(checkReading(readingOf(MUANG), ACTIVITIES.acquisition, null).valid, false);
});

test('arrivée : Muang (Forteresse d’Archon Delaine) se sape, ne se renforce pas', () => {
  const r = readingOf(MUANG);
  assert.equal(checkReading(r, ACTIVITIES.undermining, AISLING).valid, true);
  assert.equal(checkReading(r, ACTIVITIES.reinforcement, AISLING).valid, false);
  assert.equal(checkReading(r, { ...ACTIVITIES.undermining, enemy: 'Yuri Grom' }, AISLING).valid, false);
});

test('arrivée : zones de conflit seulement pour une guerre active (pas une élection)', () => {
  const war = readingOf({ ...MUANG, Conflicts: [{ WarType: 'civilwar', Status: 'active' }] });
  const election = readingOf({ ...MUANG, Conflicts: [{ WarType: 'election', Status: 'active' }] });
  assert.equal(war.warZones, 1);
  assert.equal(election.warZones, 0);
  const task = cleanTask({ name: 'ZC', relation: 'enemy', conflictZone: true });
  assert.equal(checkReading(war, task, AISLING).valid, true);
  assert.equal(checkReading(election, task, AISLING).valid, false);
});

test('puissance du joueur : Powerplay, ralliement, changement et départ', () => {
  assert.equal(powerAfter({ event: 'Powerplay', Power: AISLING }, null), AISLING);
  assert.equal(powerAfter({ event: 'PowerplayDefect', FromPower: AISLING, ToPower: 'Yuri Grom' }, AISLING), 'Yuri Grom');
  assert.equal(powerAfter({ event: 'PowerplayLeave', Power: AISLING }, AISLING), null);
});

// --- Client Spansh (réseau simulé) ---

/** Système au format de la réponse Spansh (forme relevée le 7 nov. 2026). */
function sp(name, [x, y, z], extra = {}) {
  return { name, id64: name.length, x, y, z, distance: Math.hypot(x, y, z), updated_at: '2026-11-06T10:00:00Z', power: [], stations: [], ...extra };
}

/**
 * Réseau simulé. `handler` reçoit le corps des recherches ; `names` sert l'autocomplétion des noms (comme Spansh :
 * sans tenir compte des majuscules). `lookups` garde les noms demandés à l'autocomplétion.
 */
function fakeFetch(handler, names = []) {
  const calls = [];
  const lookups = [];
  const impl = async (url, opts) => {
    if (url.startsWith(NAMES_API)) {
      const q = new URL(url).searchParams.get('q');
      lookups.push(q);
      const values = names.filter((n) => n.toLowerCase().startsWith(q.toLowerCase()));
      return { ok: true, status: 200, json: async () => ({ min_max: values.map((name) => ({ name })), values }) };
    }
    const body = JSON.parse(opts.body);
    calls.push(body);
    const out = await handler(body);
    if (out instanceof Error) throw out;
    if (typeof out === 'number') return { ok: false, status: out, json: async () => ({ error: 'Invalid request' }) };
    return { ok: true, status: 200, json: async () => out };
  };
  return { impl, calls, lookups };
}

test('Spansh : forme réduite, avec les guerres en cours et le contact Powerplay', () => {
  const s = slimSystem(sp('A', [1, 2, 3], {
    power_state: 'Unoccupied', power: [AISLING], power_conflict_progress: [{ power: AISLING, progress: 0.0057 }],
    minor_faction_presences: [{ active_states: ['Civil War'] }, { active_states: ['Boom'] }],
    stations: [{ name: 'S', type: 'Outpost', has_large_pad: false, medium_pads: 1, services: ['Dock', 'Powerplay'], distance_to_arrival: 899 }],
    bodies: [{ name: 'gros' }],
  }));
  assert.equal(s.warZones, 1);
  assert.equal(s.stations[0].powerContact, true);
  assert.equal(s.bodies, undefined);
  assert.deepEqual(s.conflict, [{ power: AISLING, progress: 0.0057 }]);
});

test('Spansh : pages successives, puis cache sans nouvel appel', async () => {
  const all = Array.from({ length: PAGE_SIZE + 3 }, (_, i) => sp(`S${i}`, [i, 0, 0], { power_state: 'Exploited' }));
  const { impl, calls } = fakeFetch((b) => ({ count: all.length, results: all.slice(b.page * b.size, (b.page + 1) * b.size), reference: { name: 'Ref', x: 0, y: 0, z: 0 } }));
  const client = new SpanshClient({ fetchImpl: impl, wait: 0 });
  const r1 = await client.search('Ref', 30, { power_state: ['Exploited'] });
  assert.equal(r1.systems.length, all.length);
  assert.equal(r1.truncated, false);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].filters.power_state, { value: ['Exploited'] });
  assert.deepEqual(calls[0].filters.distance, { min: '0', max: '30' });
  assert.equal(calls[0].reference_system, 'Ref');
  const r2 = await client.search('Ref', 30, { power_state: ['Exploited'] });
  assert.equal(r2.cached, true);
  assert.equal(calls.length, 2);
});

test('Spansh : la casse du système compte, le nom exact est retrouvé puis retenu', async () => {
  // Comme le vrai Spansh (testé le 8 nov. 2026) : « synuefe ou-e c28-2 » répond 400, « Synuefe OU-E c28-2 » répond
  const exact = 'Synuefe OU-E c28-2';
  const { impl, calls, lookups } = fakeFetch(
    (b) => (b.reference_system === exact ? { count: 1, results: [sp(exact, [0, 0, 0])], reference: { name: exact, x: 0, y: 0, z: 0 } } : 400),
    [exact, 'Synuefe OU-E c28-25'],
  );
  const client = new SpanshClient({ fetchImpl: impl, wait: 0 });
  // Deux recherches en même temps (cas d'une prise) : une seule autocomplétion
  const [a, b] = await Promise.all([client.search('synuefe ou-e c28-2', 30), client.search('synuefe ou-e c28-2', 50)]);
  assert.equal(a.reference.name, exact);
  assert.equal(b.systems.length, 1);
  assert.deepEqual(lookups, ['synuefe ou-e c28-2']);
  assert.ok(calls.slice(-2).every((c) => c.reference_system === exact));
  // Ensuite le nom exact part directement, et le cache tient compte de la casse envoyée
  const before = calls.length;
  const again = await client.search('SYNUEFE OU-E C28-2', 30);
  assert.equal(again.cached, true);
  assert.equal(calls.length, before);
  // Introuvable même à la casse près : message qui parle d'orthographe et de majuscules
  await assert.rejects(client.search('Nulle Part', 30), (e) => e.status === 404 && /majuscules/.test(e.publicMessage));
  assert.equal(lookups.length, 2);
});

test('casse : un nom tapé à la main reprend celle d’un système déjà vu en jeu', () => {
  assert.equal(exactCase('synuefe ga-i b57-6', ['Muang', 'Synuefe GA-I b57-6']), 'Synuefe GA-I b57-6');
  assert.equal(exactCase('Inconnu', ['Muang', null]), 'Inconnu');
});

test('Spansh : erreurs lisibles, et une erreur ne reste pas en cache', async () => {
  let reply = 400;
  const { impl, calls } = fakeFetch(() => reply);
  const client = new SpanshClient({ fetchImpl: impl, wait: 0 });
  await assert.rejects(client.search('Nulle Part', 30), (e) => e instanceof SpanshError && e.status === 404 && /Nulle Part/.test(e.publicMessage));
  reply = new TypeError('fetch failed');
  await assert.rejects(client.search('Nulle Part', 30), /injoignable/);
  reply = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
  await assert.rejects(client.search('Nulle Part', 30), /ne répond pas/);
  reply = 503;
  await assert.rejects(client.search('Nulle Part', 30), /503/);
  reply = { count: 0, results: [] };
  assert.deepEqual((await client.search('Nulle Part', 30)).systems, []);
  assert.equal(calls.length, 5);
});

// --- Recherche ---

/** Spansh simulé : renvoie les systèmes qui passent les filtres, comme le vrai (référence à la casse exacte). */
function fakeSpansh(systems, refs = ['Ref']) {
  return fakeFetch((b) => {
    if (!refs.includes(b.reference_system)) return 400;
    const f = b.filters;
    const max = Number(f.distance.max);
    const rows = systems.filter((s) => s.distance <= max
      && (!f.power_state || f.power_state.value.includes(s.power_state))
      && (!f.controlling_power || f.controlling_power.value.includes(s.controlling_power)));
    return { count: rows.length, results: rows.slice(b.page * b.size, (b.page + 1) * b.size), reference: { name: b.reference_system, x: 0, y: 0, z: 0 } };
  }, refs);
}

const GALAXY = [
  sp('Appui Consolidé', [40, 0, 0], { power_state: 'Fortified', controlling_power: AISLING, power: [AISLING] }),
  sp('Forteresse loin', [0, 0, 55], { power_state: 'Stronghold', controlling_power: AISLING, power: [AISLING] }),
  // à 15 al du Consolidé : valide par la règle, et listé par Spansh
  sp('Cible A', [25, 0, 0], { power_state: 'Unoccupied', power: [AISLING], power_conflict_progress: [{ power: AISLING, progress: 0.25 }] }),
  // à 27 al de la Forteresse : valide par la règle, Spansh ne liste pas encore la puissance
  sp('Cible B', [0, 0, 28], { power_state: 'Unoccupied', power: [] }),
  // aucun appui connu, mais Spansh liste la puissance (appui absent des données)
  sp('Cible C', [-20, 0, 0], { power_state: 'Unoccupied', power: [AISLING], power_conflict_progress: [{ power: AISLING, progress: 0.01 }] }),
  // ni règle ni liste : exclue
  sp('Cible D', [0, -25, 0], { power_state: 'Unoccupied', power: ['Yuri Grom'] }),
  sp('Ennemi', [5, 5, 0], { power_state: 'Stronghold', controlling_power: 'Archon Delaine', power: ['Archon Delaine', AISLING],
    stations: [{ name: 'Rescue Ship', type: 'Mega ship', has_large_pad: true }] }),
  sp('Chez nous', [3, 0, 0], { power_state: 'Exploited', controlling_power: AISLING, power: [AISLING], power_state_reinforcement: 100, power_state_undermining: 5000 }),
  sp('Chez nous 2', [6, 0, 0], { power_state: 'Exploited', controlling_power: AISLING, power: [AISLING], power_state_reinforcement: 9000, power_state_undermining: 10 }),
];

test('prise : règle des 20/30 al, systèmes listés par Spansh sans appui connu, le reste exclu', async () => {
  const { impl } = fakeSpansh(GALAXY);
  const spansh = new SpanshClient({ fetchImpl: impl, wait: 0 });
  const r = await findSystems({ spansh, task: ACTIVITIES.acquisition, power: AISLING, reference: 'Ref', radius: 30, now: Date.UTC(2026, 10, 7, 12) });
  const by = new Map(r.results.map((x) => [x.name, x]));
  assert.deepEqual([...by.keys()].sort(), ['Cible A', 'Cible B', 'Cible C']);
  assert.equal(by.get('Cible A').reach.anchor.name, 'Appui Consolidé');
  assert.equal(by.get('Cible A').reach.listed, true);
  assert.equal(by.get('Cible A').points, 30_000);
  assert.equal(by.get('Cible B').reach.anchor.name, 'Forteresse loin');
  assert.equal(by.get('Cible B').reach.listed, false);
  assert.equal(by.get('Cible C').reach.anchor, null);
  assert.equal(by.get('Cible A').thisWeek, true); // relevé du 6 nov., après le passage du jeudi 5
  assert.equal(r.meta.anchors, 2);
});

test('prise : un passage du journal ajoute un appui, un passage plus récent en retire un', async () => {
  const readings = new Map([
    // Consolidé vu en jeu, absent de Spansh : Cible D devient prenable
    ['Vu en jeu', { name: 'Vu en jeu', at: '2026-11-07T08:00:00Z', state: 'Fortified', controllingPower: AISLING, x: 0, y: -40, z: 0 }],
    // L'appui Consolidé a été perdu depuis le relevé Spansh
    ['Appui Consolidé', { name: 'Appui Consolidé', at: '2026-11-07T09:00:00Z', state: 'Exploited', controllingPower: AISLING, x: 40, y: 0, z: 0 }],
  ]);
  const now = Date.UTC(2026, 10, 7, 12); // semaine du jeudi 5 nov.
  const anchors = mergeAnchors([slimSystem(GALAXY[0])], readings, AISLING, now);
  assert.deepEqual(anchors.map((a) => a.name), ['Vu en jeu']);

  const { impl } = fakeSpansh(GALAXY);
  const spansh = new SpanshClient({ fetchImpl: impl, wait: 0 });
  const r = await findSystems({ spansh, task: ACTIVITIES.acquisition, power: AISLING, reference: 'Ref', radius: 30, readings, now });
  const by = new Map(r.results.map((x) => [x.name, x]));
  assert.equal(by.get('Cible D').reach.anchor.source, 'journal');
  assert.equal(by.get('Cible A').reach.anchor, null); // toujours listé par Spansh, mais plus d'appui à portée
});

test('prise : un appui vu en jeu avant le passage de semaine, absent de Spansh, ne compte plus', async () => {
  // Cas de Khampti : vu Consolidé le 5 nov., puis peut-être déclassé au passage du 12 nov. (Spansh le sait, pas toi)
  const readings = new Map([
    ['Vu en jeu', { name: 'Vu en jeu', at: '2026-11-07T08:00:00Z', state: 'Fortified', controllingPower: AISLING, x: 0, y: -40, z: 0 }],
    // passage ancien mais plus récent que le relevé Spansh (6 nov.) : il retire toujours l'appui perdu
    ['Appui Consolidé', { name: 'Appui Consolidé', at: '2026-11-07T09:00:00Z', state: 'Exploited', controllingPower: AISLING, x: 40, y: 0, z: 0 }],
  ]);
  const later = Date.UTC(2026, 10, 20, 12); // semaine du jeudi 19 nov.
  assert.deepEqual(mergeAnchors([slimSystem(GALAXY[0])], readings, AISLING, later), []);
  const { impl } = fakeSpansh(GALAXY);
  const spansh = new SpanshClient({ fetchImpl: impl, wait: 0 });
  const r = await findSystems({ spansh, task: ACTIVITIES.acquisition, power: AISLING, reference: 'Ref', radius: 30, readings, now: later });
  assert.ok(!r.results.some((x) => x.name === 'Cible D'));
  // Un passage ancien qui confirme un appui que Spansh liste aussi le garde (plus récent que Spansh)
  const old = new Map([['Appui Consolidé', { ...readings.get('Appui Consolidé'), state: 'Fortified' }]]);
  assert.equal(mergeAnchors([slimSystem(GALAXY[0])], old, AISLING, later)[0].source, 'journal');
});

test('prise : le pied de tableau ne compte que les appuis à portée de la zone cherchée', async () => {
  const now = Date.UTC(2026, 10, 7, 12);
  const readings = new Map([
    // Consolidé vu cette semaine, mais à 200 al : il ne peut servir à aucun système de la zone
    ['Loin', { name: 'Loin', at: '2026-11-06T08:00:00Z', state: 'Fortified', controllingPower: AISLING, x: 200, y: 0, z: 0 }],
    ['Vu en jeu', { name: 'Vu en jeu', at: '2026-11-07T08:00:00Z', state: 'Fortified', controllingPower: AISLING, x: 0, y: -40, z: 0 }],
  ]);
  const { impl } = fakeSpansh(GALAXY);
  const spansh = new SpanshClient({ fetchImpl: impl, wait: 0 });
  const r = await findSystems({ spansh, task: ACTIVITIES.acquisition, power: AISLING, reference: 'Ref', radius: 30, readings, now });
  assert.equal(r.meta.anchors, 3); // Appui Consolidé, Forteresse loin (Spansh) et Vu en jeu
  assert.equal(r.meta.journalAnchors, 1);
});

test('sape : seulement les systèmes ennemis, avec le mégavaisseau exigé par la tâche', async () => {
  const { impl } = fakeSpansh(GALAXY);
  const spansh = new SpanshClient({ fetchImpl: impl, wait: 0 });
  const task = cleanTask({ name: 'Scanner des mégavaisseaux', relation: 'enemy', states: ['Stronghold'], stationGroups: ['megaship'] });
  const r = await findSystems({ spansh, task, power: AISLING, reference: 'Ref', radius: 30 });
  assert.deepEqual(r.results.map((x) => x.name), ['Ennemi']);
  assert.equal(r.results[0].stations[0].name, 'Rescue Ship');
});

test('renforcement : tri « le plus menacé », et un passage plus récent qui dément passe en fin de liste', async () => {
  const { impl } = fakeSpansh(GALAXY);
  const spansh = new SpanshClient({ fetchImpl: impl, wait: 0 });
  const r = await findSystems({ spansh, task: ACTIVITIES.reinforcement, power: AISLING, reference: 'Ref', radius: 30, sort: 'progress' });
  assert.deepEqual(r.results.map((x) => x.name), ['Chez nous', 'Chez nous 2']);

  const readings = new Map([['Chez nous', { name: 'Chez nous', at: '2026-11-07T10:00:00Z', state: 'Exploited', controllingPower: 'Yuri Grom', powers: [] }]]);
  const r2 = await findSystems({ spansh, task: ACTIVITIES.reinforcement, power: AISLING, reference: 'Ref', radius: 30, sort: 'progress', readings });
  assert.deepEqual(r2.results.map((x) => x.name), ['Chez nous 2', 'Chez nous']);
  assert.equal(r2.results[1].seen.valid, false);
  assert.equal(r2.results[1].seen.newer, true);
});

// --- Tâches enregistrées ---

test('tâches : enregistrées dans un fichier JSON, reconduites, supprimées', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'whereto.json');
  let t = Date.UTC(2026, 10, 7, 12);
  const store = new TaskStore(file, () => t);
  const task = store.add({ name: 'Sauver des capsules', relation: 'own', states: ['Exploited'] });
  assert.ok(task.id);
  assert.equal(store.add({ name: '' }), null);
  assert.deepEqual(fs.readdirSync(dir), ['whereto.json']); // pas de fichier temporaire laissé
  assert.equal(new TaskStore(file, () => t).list()[0].name, 'Sauver des capsules');

  t += 7 * 24 * 3600 * 1000; // semaine suivante
  assert.equal(store.list()[0].current, false);
  store.renew(task.id);
  assert.equal(store.list()[0].current, true);
  assert.equal(store.remove(task.id), true);
  assert.deepEqual(new TaskStore(file).list(), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- Module complet : API HTTP et confirmation à l'arrivée ---

test('module : recherche par l’API, puis l’arrivée dans un résultat est confirmée par le journal', async () => {
  const dir = tmpDir();
  const GA = 'Synuefe GA-I b57-6';
  const { impl, lookups } = fakeSpansh(GALAXY, ['Ref', GA]);
  const mod = createModule({ file: path.join(dir, 'whereto.json'), fetchImpl: impl });
  const journal = Object.assign(new EventEmitter(), { addInterest() {}, stateData: {} });
  const sent = [];
  const router = express.Router();
  await mod.register({ router, journal, game: { snapshot: () => ({ system: 'Ref' }) }, broadcast: (type, data) => sent.push({ type, data }) });
  journal.emit('ready', { history: [
    { event: 'Powerplay', Power: AISLING, timestamp: '2026-11-05T12:16:06Z' },
    { ...OU_E3, StarSystem: GA, timestamp: '2026-11-01T10:00:00Z' },
  ] });

  const app = express();
  app.use(express.json());
  app.use('/w', router);
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.publicMessage || err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/w`;
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const ctx = await (await fetch(`${base}/context`)).json();
    assert.equal(ctx.power, AISLING);
    assert.equal(ctx.system, 'Ref');

    const res = await post('/search', { activity: 'acquisition', radius: 30 });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.results.some((r) => r.name === 'Cible A'));

    const badRes = await post('/search', { activity: 'toString' });
    assert.equal(badRes.status, 400);

    journal.emit('event', { ...OU_E3, StarSystem: 'Cible A' });
    const arrival = sent.find((s) => s.type === 'whereto:arrival')?.data;
    assert.equal(arrival.system, 'Cible A');
    assert.equal(arrival.inResults, true);
    assert.equal(arrival.valid, true);
    assert.deepEqual(await (await fetch(`${base}/arrival`)).json(), arrival);

    // Saut de transit (hors de la liste, pas valide) : diffusé, mais le verdict de la cible reste
    journal.emit('event', MUANG);
    const transit = sent.filter((s) => s.type === 'whereto:arrival').at(-1).data;
    assert.equal(transit.system, 'Muang');
    assert.equal(transit.inResults, false);
    assert.equal(transit.valid, false);
    assert.equal((await (await fetch(`${base}/arrival`)).json()).system, 'Cible A');

    // Nom tapé en minuscules : la casse d'un système vu en jeu est reprise, sans autocomplétion
    const typed = await post('/search', { activity: 'reinforcement', system: 'synuefe ga-i b57-6', radius: 30 });
    assert.equal(typed.status, 200);
    assert.equal((await typed.json()).reference, GA);
    assert.deepEqual(lookups, []);

    const created = await post('/tasks', { name: 'Zones de conflit', relation: 'enemy', conflictZone: true });
    assert.equal(created.status, 201);
    const tasks = await (await fetch(`${base}/tasks`)).json();
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].conflictZone, true);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
