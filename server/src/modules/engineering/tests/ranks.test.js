// Tests des rangs d'ingénieur : table des règles (et sa déduction), mesures lues dans le journal, calcul (montée de
// rang partagée, applications en plus sur un module neuf, ingénieur pas encore débloqué, choix de l'ingénieur) et API
// (y compris un vrai plan et le Dashboard). Les séquences d'événements sont écrites à la main sur le modèle des
// journaux de référence (Tiana Fortune, Lei Cheung, Broo Tarquin), sans commandant ni vaisseau nommé.
// Le calcul est testé sur des données de référence simulées (aucun téléchargement) ; l'API, sur les vraies
// données de référence si elles sont là.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EventEmitter, once } from 'node:events';
import express from 'express';
import { RANK_TABLE, RANK_RULES, STATUS, CARRY_RATIO, JOURNAUX, JOURNAUX_PERIOD, UPDATE_18_08, DEDUCED_WHY, rankRow, rollsFor, rankGain, rowStatus, rowReasons, weakest, climbCounts, prudentModel } from '../services/rankRules.js';
import { buildRankLog, rankView, currentProgress, engineerStates, checkSequence } from '../services/ranks.js';
import { deduceRankModel, tableFromModel, buildSystem, feasible, worstCaseModel } from '../services/rankModel.js';
import { planNeeds, simulateEngineer, moduleNeeds, qualityUnits, rollsToFinish, remainingSteps } from '../services/calc.js';
import { Inventory } from '../services/inventory.js';
import { loadReference } from '../../../core/reference/refdata.js';
import engineering from '../index.js';
import { EngineeringService } from '../services/service.js';

const VERSIONED = JSON.parse(fs.readFileSync(new URL('../../../regles/ingenierie/rankSequences.json', import.meta.url), 'utf8'));
const SEQUENCES = VERSIONED.sequences;
const JOURNAL = VERSIONED.journal;

// --- Table des règles ---

test('table : 15 couples rang × grade, applications pour finir = grade + 5 − rang, statut et source', () => {
  assert.equal(RANK_TABLE.length, 15);
  for (const row of RANK_TABLE) {
    assert.ok(row.grade <= row.rank, `${row.rank}/${row.grade}`);
    assert.equal(row.finish.value, row.grade + 5 - row.rank);
    assert.ok([STATUS.MEASURED, STATUS.CHECK].includes(row.finish.status));
    assert.ok(row.finish.source && row.finish.observations > 0);
    // « à vérifier » pour finir un grade : jamais une hypothèse, seulement trop peu de mesures, et le motif le dit
    if (row.finish.status === STATUS.CHECK) {
      assert.ok(row.finish.observations < 3);
      assert.equal(row.finish.why, `mesurée ${row.finish.observations} fois seulement (il en faut 3 pour la dire mesurée), sans hypothèse`);
    } else assert.equal(row.finish.why, undefined, `${row.rank}/${row.grade} : mesurée, pas de motif`);
    if (row.rank === 5) assert.equal(row.climb, null);
    else {
      assert.ok(row.climb.gainMin >= 0 && row.climb.gainMin <= row.climb.gainMax);
      // Borne basse que les séquences ne fixent pas : 0, statut « inconnue » et son motif, en mots de joueur (rien du
      // modèle : ni « p4 », ni « seuil », ni « borne ») ; sinon « à vérifier »
      if (row.climb.gainMin === 0) {
        assert.equal(row.climb.status, STATUS.UNKNOWN);
        assert.match(row.climb.why, /rien ne dit combien un G1, un G2 ou un G3 y fait monter le rang/);
        assert.doesNotMatch(row.climb.why, /\bp4\b|seuil|born/);
        assert.equal(row.climb.max, null, 'au plus : non chiffré (« au moins … »)');
      } else assert.equal(row.climb.status, STATUS.CHECK, 'progression de rang déduite : à vérifier');
      assert.deepEqual([row.climb.min, row.climb.max], [climbCounts(row.climb.gainMin, row.climb.gainMax).min, climbCounts(row.climb.gainMin, row.climb.gainMax).max]);
      assert.match(row.climb.source, /rankModel\.js/);
    }
  }
  // Exemple de l’auteur : rang 3, G3 → 5 applications au lieu de 3 ; mesuré, et dit par l’auteur
  assert.equal(rollsFor(3, 3), 5);
  assert.equal(rankRow(3, 3).finish.status, STATUS.MEASURED);
  assert.match(rankRow(3, 3).finish.also, /^signalé par un joueur le 8 nov\. 2026$/);
  // Au rang 1, 3 applications de G1 suffisent depuis 0 % (3 fois sur 3) : ni plus, ni moins
  assert.deepEqual([rankRow(1, 1).climb.min, rankRow(1, 1).climb.max], [3, 3]);
  // Rang 4, G4 : moins de 50 % par application (2 G4 n'ont jamais suffi) : au moins 3
  assert.equal(rankRow(4, 4).climb.min, 3);
  // Grade au-dessus du rang : pas dans la table, aucun gain
  assert.equal(rankRow(2, 3), null);
  assert.equal(rankGain(2, 3), 0);
  assert.equal(rankGain(5, 5), 0);
  assert.equal(rowStatus(5, 5, { climbs: true }), STATUS.MEASURED);
  assert.equal(rowStatus(3, 3), STATUS.MEASURED, 'finir le G3 au rang 3 : mesuré');
  assert.equal(rowStatus(3, 3, { climbs: true }), STATUS.CHECK, 'avec la progression de rang : à vérifier');
  assert.equal(rowStatus(4, 2, { climbs: true }), STATUS.UNKNOWN);
  // Motifs : rang 4 en G1, mesuré 2 fois (à vérifier sans hypothèse) ; progression de rang déduite ; hors table
  assert.deepEqual(rowReasons(4, 1), [{ status: STATUS.CHECK, why: 'finir le G1 au rang 4 : mesurée 2 fois seulement (il en faut 3 pour la dire mesurée), sans hypothèse' }]);
  assert.deepEqual(rowReasons(3, 3), []);
  assert.deepEqual(rowReasons(3, 3, { climbs: true }), [{ status: STATUS.CHECK, why: `progression de rang : ${DEDUCED_WHY}` }]);
  assert.equal(rowReasons(4, 2, { climbs: true })[0].status, STATUS.UNKNOWN);
  assert.deepEqual(rowReasons(2, 3).map((r) => r.status), [STATUS.UNKNOWN]);
  assert.equal(weakest(STATUS.MEASURED, STATUS.CHECK, STATUS.MEASURED), STATUS.CHECK);
  assert.equal(weakest(), STATUS.MEASURED);
  assert.equal(RANK_RULES.REMOTE_RANK_GAIN.value, 0);
  assert.equal(RANK_RULES.REROLL_FULL_GRADE.status, STATUS.UNKNOWN);
  // Départ au déblocage : le rang 1 est lu (3 déblocages sur 3), pas le 0 % (le déblocage n'écrit pas de progression :
  // hypothèse H6, appuyée par Juri Ishmaak, rang 1 à 0 % à chaque relevé sans aucune application)
  assert.deepEqual(RANK_RULES.UNLOCK_START.value, { rank: 1, progress: 0 });
  assert.deepEqual([RANK_RULES.UNLOCK_RANK.value, RANK_RULES.UNLOCK_RANK.status, RANK_RULES.UNLOCK_RANK.observations], [1, STATUS.MEASURED, 3]);
  assert.deepEqual([RANK_RULES.UNLOCK_PROGRESS.value, RANK_RULES.UNLOCK_PROGRESS.status, RANK_RULES.UNLOCK_PROGRESS.observations], [0, STATUS.CHECK, 1]);
  assert.match(RANK_RULES.UNLOCK_PROGRESS.why, /pas le 0 % : le déblocage n’écrit pas de progression/);
  assert.match(RANK_RULES.UNLOCK_PROGRESS.source, /Juri Ishmaak, rang 1 à 0 % aux \d+ relevés, sans aucune application ; hypothèse H6/);
  assert.equal(RANK_RULES.UNLOCK_START.status, STATUS.CHECK, 'le plus faible des deux : « à vérifier », pas « mesurée »');
  assert.equal(RANK_RULES.UNLOCK_START.why, RANK_RULES.UNLOCK_PROGRESS.why);
  assert.equal(RANK_RULES.CARRY_OVER.value, CARRY_RATIO);
});

test('table : la progression de rang et le report sont la sortie de la déduction (rankModel.js) sur les séquences versionnées', () => {
  assert.equal(SEQUENCES.length, 17);
  const model = deduceRankModel(SEQUENCES);
  assert.equal(model.feasible, true, 'les hypothèses H1 à H6 s’accordent avec les 17 séquences');
  assert.equal(model.used, 17);
  const t = tableFromModel(model);
  for (const g of t.gains) {
    const c = rankRow(g.rank, g.grade).climb;
    assert.deepEqual([c.gainMin, c.gainMax], [g.gainMin, g.gainMax], `rang ${g.rank} G${g.grade}`);
    assert.equal(c.status === STATUS.UNKNOWN, g.lowerUnbounded, `rang ${g.rank} G${g.grade} : borne basse`);
    const seqs = SEQUENCES.filter((s) => s.rank === g.rank && s.applications.split(' ').includes(`G${g.grade}`)).length;
    assert.equal(c.sequences, seqs, `rang ${g.rank} G${g.grade} : séquences`);
  }
  for (const c of t.carry) assert.equal(CARRY_RATIO[c.from], c.ratioMax, `report ${c.from} → ${c.to}`);
  // Ce que l'ancienne table disait sans que l'hypothèse le permette : rang 2 en G2 au moins 31,3 % (la déduction
  // descend à 28,93 %), rang 4 en G1 à G3 bornés par le bas (rien ne les borne)
  assert.ok(rankRow(2, 2).climb.gainMin < 29);
  assert.ok(rankRow(2, 2).climb.gainMax < 37.5, 'Broo : 3 G1 + 2 G2 n’ont pas suffi');
  for (const g of [1, 2, 3]) assert.equal(rankRow(4, g).climb.gainMin, 0);
  // Le système des séquences est faisable (aucun écart avec les hypothèses)
  const sys = buildSystem(SEQUENCES);
  assert.equal(feasible(sys.vars.length, sys.cons), true);
});

test('table : les comptes d’observations tirés des journaux sont ceux de la période déclarée (JOURNAUX_PERIOD)', () => {
  // Comptes jour par jour versionnés avec les séquences (scripts/regles/deduire-rangs.mjs) : dates et nombres seulement
  const days = Object.entries(JOURNAL).filter(([d]) => d >= JOURNAUX_PERIOD.first && d <= JOURNAUX_PERIOD.last).map(([, x]) => x);
  const sum = (k) => days.reduce((a, x) => a + x[k], 0);
  assert.equal(sum('crafts'), JOURNAUX_PERIOD.applications);
  assert.match(JOURNAUX, new RegExp(`24 oct\\.–5 nov\\. 2026 \\(${JOURNAUX_PERIOD.applications} applications`));
  const r = RANK_RULES.PROGRESS_AT_LOAD_ONLY;
  assert.deepEqual([r.counts.full, r.counts.single], [sum('full'), sum('single')]);
  assert.equal(sum('singleWithProgress'), 0, 'aucun événement unitaire ne porte RankProgress');
  assert.equal(r.observations, r.counts.full + r.counts.single);
  assert.match(r.source, new RegExp(`${r.counts.full} relevés complets, ${r.counts.single} événements unitaires`));
  // Juri Ishmaak (appui du 0 % au déblocage) est dans chacun des relevés complets de la période ; aucun événement
  // unitaire, déblocages compris, ne porte de progression
  assert.ok(RANK_RULES.UNLOCK_PROGRESS.source.includes(`aux ${r.counts.full} relevés`));
  // Les journaux hors période ne sont pas dans le compte (ils le confirment : aucun unitaire avec RankProgress)
  assert.ok(Object.entries(JOURNAL).some(([d, x]) => (d < JOURNAUX_PERIOD.first || d > JOURNAUX_PERIOD.last) && x.full > 0));
  assert.equal(Object.values(JOURNAL).reduce((a, x) => a + x.singleWithProgress, 0), 0);
});

test('table : la mise à jour 18.08 est sourcée par l’annonce officielle qui porte son numéro, sa date et la règle', () => {
  assert.equal(UPDATE_18_08.name, '18.08');
  assert.ok(UPDATE_18_08.title.includes(`(${UPDATE_18_08.name})`), 'le numéro est dans le titre de l’annonce');
  assert.match(UPDATE_18_08.title, /7th August 2024/);
  assert.equal(UPDATE_18_08.date, '2024-08-07');
  assert.equal(UPDATE_18_08.author, 'Frontier Developments');
  assert.match(UPDATE_18_08.quote, /fixed roll depending on the grade of the recipe and the commander rank/);
  assert.match(UPDATE_18_08.url, /^https:\/\/api\.steampowered\.com\/ISteamNews\/GetNewsForApp\/v2\/\?appid=359320/);
  // La notice (docs/ingenierie.md) et CREDITS.md citent cette annonce, pas une discussion qui ne nomme pas 18.08
  const root = new URL('../../../../../', import.meta.url);
  for (const file of ['docs/ingenierie.md', 'CREDITS.md']) {
    const text = fs.readFileSync(new URL(file, root), 'utf8');
    assert.ok(text.includes(UPDATE_18_08.page), `${file} : lien de l’annonce`);
    assert.ok(text.includes(UPDATE_18_08.title), `${file} : titre de l’annonce`);
  }
});

test('table : chaque séquence des journaux est conforme à la table (aucun écart), report compris', () => {
  const byEngineer = new Map();
  let checked = 0;
  for (const s of SEQUENCES) {
    const seq = { ...s, applications: s.applications.split(' ').map((tok) => ({ grade: Number(tok[1]), place: tok.endsWith('d') ? 'distance' : 'atelier', experimental: tok.endsWith('x') })) };
    const prev = byEngineer.get(s.engineer);
    byEngineer.set(s.engineer, seq);
    if (seq.end.kind === 'en cours') continue;
    const r = checkSequence(seq, prev?.end?.kind === 'montée' ? prev : null);
    assert.equal(r.ok, true, `${s.engineer} rang ${s.rank} : ${r.message}`);
    checked++;
  }
  assert.equal(checked, 17);
});

// --- Mesures lues dans le journal ---

const SHOP = 128680839; // atelier simulé de l'ingénieur
const AWAY = 3228000001; // une autre station (atelier à distance)
const ENG = 'Tiana Fortune';
const t = (n) => `2026-11-09T10:${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}Z`;
const craft = (n, grade, quality, extra = {}) => ({ timestamp: t(n), event: 'EngineerCraft', Slot: 'Radar', Module: 'int_sensors_size5_class2', Engineer: ENG, EngineerID: 300270, BlueprintName: 'Sensor_WideAngle', Level: grade, Quality: quality, Ingredients: [{ Name: 'mechanicalscrap', Count: 1 }], ...extra });
const progress = (n, rank, extra = {}) => ({ timestamp: t(n), event: 'EngineerProgress', Engineer: ENG, EngineerID: 300270, Rank: rank, ...extra });
const snapshot = (n, rank, rp) => ({ timestamp: t(n), event: 'EngineerProgress', Engineers: [{ Engineer: ENG, EngineerID: 300270, Progress: 'Unlocked', Rank: rank, RankProgress: rp }] });
const docked = (n, market) => ({ timestamp: t(n), event: 'Docked', MarketID: market, StationName: 'Station' });
const workshopOf = (name) => (name === ENG ? SHOP : null);

/** Déblocage puis montée du rang 1 au rang 3, comme Tiana Fortune le 28 oct. (pas de qualité de la table). */
function unlockSequence() {
  return [
    { timestamp: t(0), event: 'Loadout', ShipID: 7, Ship: 'cutter', Modules: [{ Slot: 'Radar', Item: 'int_sensors_size5_class2' }] },
    docked(1, SHOP),
    progress(2, 1, { Progress: 'Unlocked' }),
    craft(3, 1, 0.2), craft(4, 1, 0.4), craft(5, 1, 0.6), progress(5, 2),
    craft(6, 1, 0.85), craft(7, 1, 1),
    craft(8, 2, 0.2), craft(9, 2, 0.4), craft(10, 2, 0.6), progress(10, 3),
    craft(11, 2, 0.85), craft(12, 2, 1),
  ];
}

test('mesures : qualité par application et par rang, montées de rang, lieu de chaque application', () => {
  const log = buildRankLog(unlockSequence(), { workshopOf });
  const v = rankView(log);
  const cell = (r, g) => v.measures.find((m) => m.rank === r && m.grade === g);
  assert.deepEqual([cell(1, 1).step, cell(1, 1).rolls, cell(1, 1).informative, cell(1, 1).maxGrade], [0.2, 5, 3, true]);
  assert.deepEqual([cell(2, 1).step, cell(2, 1).rolls, cell(2, 1).maxGrade], [0.25, 4, false]);
  assert.equal(cell(2, 1).informative, 1, 'la dernière application (0,85 → 1 : +15 %) est plafonnée : elle ne mesure pas le pas');
  assert.equal(cell(2, 1).contradictions, 0, 'un pas plafonné plus petit que prévu ne contredit rien');
  assert.deepEqual([cell(2, 2).step, cell(2, 2).rolls], [0.2, 5]);
  assert.deepEqual([cell(3, 2).step, cell(3, 2).rolls], [0.25, 4]);
  assert.equal(cell(1, 1).places.atelier, 3);
  // Séquences : déblocage → rang 2 (3 applications de G1), rang 2 → 3 (2 G1 + 3 G2), rang 3 en cours
  const seq = v.sequences.slice().reverse();
  assert.deepEqual(seq.map((s) => [s.rank, s.start.kind, s.end.kind, s.applications]), [[1, 'déblocage', 'montée', 3], [2, 'montée', 'montée', 5], [3, 'montée', 'en cours', 2]]);
  assert.ok(seq.every((s) => s.ok), 'conforme à la table');
  assert.deepEqual(v.contradictions, []);
  // État pour le calcul : rang 3, progression estimée depuis la montée (report : 0 en prudent, au plus le report
  // déduit du dernier G2 en favorable)
  const e = engineerStates(log).get(ENG);
  assert.equal(e.rank, 3);
  assert.equal(e.progress, 'Unlocked');
  assert.equal(e.rankProgress.known, 'estimé');
  assert.deepEqual(e.rankProgress.basis, { kind: 'montée', at: t(10), rank: 3, from: 2 });
  assert.ok(Math.abs(e.rankProgress.min - 2 * rankGain(3, 2, 'prudent')) < 1e-9);
  assert.ok(Math.abs(e.rankProgress.max - (rankGain(2, 2, 'favorable') * CARRY_RATIO[2] + 2 * rankGain(3, 2, 'favorable'))) < 1e-9);
});

test('mesures : relevé au chargement (RankProgress), puis applications : progression estimée ; à distance : 0', () => {
  const events = [
    snapshot(0, 3, 24),
    docked(1, AWAY),
    { timestamp: t(1), event: 'Loadout', ShipID: 7, Ship: 'cutter', Modules: [{ Slot: 'Radar', Item: 'int_sensors_size5_class2', Engineering: { BlueprintName: 'Sensor_WideAngle', Level: 2, Quality: 1 } }] },
    craft(2, 3, 0.2), craft(3, 3, 0.4),
  ];
  const log = buildRankLog(events, { workshopOf });
  const before = currentProgress(log.engineers.get(ENG));
  assert.equal(before.min, 24, 'applications à distance : le rang ne bouge pas (mesuré le 5 nov.)');
  assert.equal(before.known, 'estimé');
  assert.deepEqual(before.basis, { kind: 'relevé', at: t(0), rank: 3 });
  assert.equal(rankView(log).measures.find((m) => m.rank === 3 && m.grade === 3).places.distance, 2);
  const at = buildRankLog([...events, docked(4, SHOP), craft(5, 3, 0.6)], { workshopOf });
  const p = currentProgress(at.engineers.get(ENG));
  assert.ok(Math.abs(p.min - (24 + rankGain(3, 3, 'prudent'))) < 1e-9);
  assert.ok(Math.abs(p.max - (24.99 + rankGain(3, 3, 'favorable'))) < 1e-9);
  // Location au chargement de la partie, amarré : le lieu est connu sans nouveau Docked
  const loaded = buildRankLog([snapshot(0, 3, 0), { timestamp: t(1), event: 'Location', Docked: true, MarketID: SHOP }, craft(2, 1, 0.3333)], { workshopOf });
  assert.equal(loaded.applications[0].place, 'atelier');
  // Ateliers inconnus (données de référence absentes) : lieu inconnu, compté comme à l'atelier pour l'estimation
  assert.equal(buildRankLog(events).applications[0].place, 'inconnu');
  // Rang connu, progression jamais lue : de 0 à 99,99 % (le scénario favorable ne la suppose pas nulle)
  const unread = currentProgress(buildRankLog([{ timestamp: t(0), event: 'EngineerProgress', Engineers: [{ Engineer: ENG, Progress: 'Unlocked', Rank: 2 }] }]).engineers.get(ENG));
  assert.deepEqual([unread.min, unread.max, unread.known, unread.basis], [0, 99.99, 'inconnu', null]);
});

test('mesures : une mesure qui contredit la table est signalée, la table ne change pas', () => {
  const events = [docked(0, SHOP), progress(1, 1, { Progress: 'Unlocked' }), craft(2, 1, 0.25), progress(2, 2)];
  const v = rankView(buildRankLog(events, { workshopOf }));
  assert.deepEqual(v.contradictions.map((c) => c.kind).sort(), ['qualité', 'rang']);
  assert.match(v.contradictions.find((c) => c.kind === 'qualité').message, /\+25 % de qualité au lieu de \+20 %/);
  assert.match(v.contradictions.find((c) => c.kind === 'rang').message, /plus tôt/);
  assert.equal(rollsFor(1, 1), 5, 'la table reste celle déclarée');
  // Montée bien plus tard que prévu (10 applications de G1 au rang 1, depuis 0 %)
  const late = { rank: 1, start: { kind: 'déblocage', progress: 0 }, end: { kind: 'montée' }, applications: Array.from({ length: 10 }, () => ({ grade: 1, place: 'atelier' })) };
  assert.match(checkSequence(late).message, /plus tard/);
});

test('mesures : un grade fini d’un coup plus vite que la table est un écart (au rang 4, G1 : 2 applications prévues)', () => {
  const at4 = [docked(0, SHOP), snapshot(1, 4, 0)];
  const one = rankView(buildRankLog([...at4, craft(2, 1, 1)], { workshopOf }));
  const cell = one.measures.find((m) => m.rank === 4 && m.grade === 1);
  assert.deepEqual([cell.informative, cell.rolls, cell.contradictions, cell.faster], [0, null, 1, 1]);
  assert.equal(one.contradictions.length, 1);
  assert.match(one.contradictions[0].message, /grade fini d'un coup : au moins \+100 % de qualité au lieu de \+50 %/);
  // Pas plafonné égal au pas prévu (G1 : +50 %), ou plus petit (G2 de 80 à 100 % : +20 % au lieu de +33 %) : rien
  const fine = rankView(buildRankLog([...at4, craft(2, 1, 0.5), craft(3, 1, 1)], { workshopOf }));
  assert.deepEqual(fine.contradictions, []);
  const started = { timestamp: t(1), event: 'Loadout', ShipID: 7, Ship: 'cutter', Modules: [{ Slot: 'Radar', Item: 'int_sensors_size5_class2', Engineering: { BlueprintName: 'Sensor_WideAngle', Level: 2, Quality: 0.8 } }] };
  const capped = rankView(buildRankLog([...at4, started, craft(2, 2, 1)], { workshopOf }));
  assert.deepEqual(capped.contradictions, []);
});

test('mesures : séquence en cours vérifiée elle aussi : montée en retard sur la table signalée sans attendre la fin', () => {
  // Rang 3 relevé à 0 %, module en G2 (100 %), amarré à l'atelier : chaque G3 fait au moins 26,65 % du rang
  const start = [
    snapshot(0, 3, 0),
    { timestamp: t(1), event: 'Loadout', ShipID: 7, Ship: 'cutter', Modules: [{ Slot: 'Radar', Item: 'int_sensors_size5_class2', Engineering: { BlueprintName: 'Sensor_WideAngle', Level: 2, Quality: 1 } }] },
  ];
  const g3 = (n, at) => [docked(1, at), ...Array.from({ length: n }, (_, i) => craft(2 + i, 3, +(0.2 * (i + 1)).toFixed(2)))];
  const view = (events, opts = { workshopOf }) => {
    const log = buildRankLog(events, opts);
    return { v: rankView(log), p: currentProgress(log.engineers.get(ENG)), seq: rankView(log).sequences.find((s) => s.end.kind === 'en cours') };
  };
  // 3 G3 : au moins 79,96 %, rien d'anormal ; la pastille dit « en cours », pas « conforme » (rien n'est encore vérifié
  // à la fin de la séquence)
  const three = view([...start, ...g3(3, SHOP)]);
  assert.deepEqual([three.seq.ok, three.seq.note, three.v.contradictions], [true, undefined, []]);
  assert.equal(three.p.known, 'estimé');
  // 4 G3 : la table prévoit la montée à la 4e (au moins 106,6 %) ; le jeu l'écrit dans la seconde : pas encore d'écart
  const four = view([...start, ...g3(4, SHOP)]);
  assert.deepEqual([four.seq.ok, four.v.contradictions], [true, []]);
  assert.match(four.seq.note, /prévoit la montée à la dernière application/);
  assert.deepEqual([four.p.due, four.p.min], [true, 99.9]);
  // 5 G3 sans montée : la table la prévoyait au plus tard à la 4e : écart, et la progression n'est plus estimée
  const five = view([...start, ...g3(5, SHOP)]);
  assert.equal(five.seq.ok, false);
  assert.match(five.seq.message, /pas de montée écrite alors que la table la prévoit au plus tard à la 4e application \(au moins 106 % avant la dernière\)/);
  assert.deepEqual(five.v.contradictions.map((c) => [c.kind, c.rank, c.at]), [['rang', 3, t(6)]]);
  assert.deepEqual([five.p.known, five.p.min, five.p.max], ['contredit', 0, 99.99], 'le prudent repart du relevé');
  assert.ok(Math.abs(five.p.expectedMin - 5 * rankGain(3, 3, 'prudent')) < 1e-9);
  assert.equal(engineerStates(buildRankLog([...start, ...g3(5, SHOP)], { workshopOf })).get(ENG).rankProgress.min, 0, 'le calcul du plan ne compte plus une montée à la prochaine application');
  // À distance, ou au lieu inconnu (ateliers inconnus) : le rang a pu ne rien gagner, aucun écart
  assert.deepEqual(view([...start, ...g3(5, AWAY)]).v.contradictions, []);
  assert.deepEqual(view([...start, ...g3(5, SHOP)], {}).v.contradictions, []);
  // Rang 1 : 3 G1 suffisent depuis le déblocage (mesuré 3 fois sur 3, 3 × 33,3333 %) : une 4e sans montée est un écart
  const unlock = [docked(0, SHOP), progress(1, 1, { Progress: 'Unlocked' }), ...[0.2, 0.4, 0.6, 0.8].map((q, i) => craft(2 + i, 1, q))];
  const r1 = view(unlock);
  assert.match(r1.seq.message, /au plus tard à la 3e application/);
  assert.equal(r1.p.known, 'contredit');
});

test('mesures : relevé au chargement hors de la fourchette de la table : écart, trop bas comme trop haut', () => {
  // Rang 3 relevé à 0 %, module en G2 (100 %), amarré à l'atelier, 2 G3, puis un relevé au même rang. La table
  // prévoit au moins 2 × 26,6532 = 53,3 % et au plus 0,99 + 2 × 39,2257 = 79,4 % (RankProgress tronqué : un relevé
  // à 53 % peut valoir 53,99 %)
  const events = (rp) => [
    snapshot(0, 3, 0),
    { timestamp: t(1), event: 'Loadout', ShipID: 7, Ship: 'cutter', Modules: [{ Slot: 'Radar', Item: 'int_sensors_size5_class2', Engineering: { BlueprintName: 'Sensor_WideAngle', Level: 2, Quality: 1 } }] },
    docked(1, SHOP),
    craft(2, 3, 0.2), craft(3, 3, 0.4),
    snapshot(4, 3, rp),
  ];
  const at = (rp, opts = { workshopOf }) => {
    const v = rankView(buildRankLog(events(rp), opts));
    return { v, seq: v.sequences.find((s) => s.end.kind === 'relevé') };
  };
  for (const rp of [53, 60, 70, 79]) {
    const r = at(rp);
    assert.deepEqual([r.seq.ok, r.v.contradictions], [true, []], `relevé à ${rp} % : conforme`);
  }
  for (const rp of [10, 52]) {
    const r = at(rp);
    assert.equal(r.seq.ok, false, `relevé à ${rp} % : trop bas`);
    assert.equal(r.seq.message, `relevé à ${rp} % alors que la table prévoit 53 à 79 %`);
    assert.deepEqual(r.v.contradictions.map((c) => [c.kind, c.engineer, c.rank, c.at, c.message]), [['rang', ENG, 3, t(4), r.seq.message]]);
  }
  for (const rp of [80, 99]) {
    const r = at(rp);
    assert.equal(r.seq.ok, false, `relevé à ${rp} % : trop haut`);
    assert.equal(r.seq.message, `relevé à ${rp} % alors que la table prévoit 53 à 79 %`);
  }
  // Ateliers inconnus : le rang a pu ne rien gagner (le plus bas est 0 %), un relevé à 10 % reste possible
  assert.equal(at(10, {}).seq.ok, true);
  // Montée de rang au relevé (rang 4) : comparée à la table autrement (fin de séquence « relevé au rang 4 »)
  assert.equal(rankView(buildRankLog([...events(0).slice(0, -1), { timestamp: t(4), event: 'EngineerProgress', Engineers: [{ Engineer: ENG, EngineerID: 300270, Progress: 'Unlocked', Rank: 4, RankProgress: 5 }] }], { workshopOf })).sequences.find((s) => s.end.kind === 'relevé').ok, true);
});

test('mesures : grade refait alors qu’il était déjà à 100 % : relevé, montré à côté de la règle « inconnue », jamais compté comme une montée sûre', () => {
  // Rang 3 relevé à 10 %, module déjà en G3 à 100 %, amarré à l'atelier, puis le même G3 refait deux fois (qualité 1
  // avant et après). C'est la mesure qui tranchera REROLL_FULL_GRADE (« inconnue », 0 cas dans les journaux de référence)
  const g3full = { timestamp: t(1), event: 'Loadout', ShipID: 7, Ship: 'cutter', Modules: [{ Slot: 'Radar', Item: 'int_sensors_size5_class2', Engineering: { BlueprintName: 'Sensor_WideAngle', Level: 3, Quality: 1 } }] };
  const events = (n) => [snapshot(0, 3, 10), g3full, docked(1, SHOP), ...Array.from({ length: n }, (_, i) => craft(2 + i, 3, 1))];
  const log = buildRankLog(events(2), { workshopOf });
  assert.deepEqual(log.applications.map((a) => [a.grade, a.reroll, a.step, a.informative, a.faster]), [[3, true, null, false, false], [3, true, null, false, false]]);
  const v = rankView(log);
  assert.deepEqual(v.rerolls.map((x) => [x.engineer, x.rank, x.grade, x.place, x.at]), [[ENG, 3, 3, 'atelier', t(3)], [ENG, 3, 3, 'atelier', t(2)]], 'le plus récent d’abord');
  const cell = v.measures.find((m) => m.rank === 3 && m.grade === 3);
  assert.deepEqual([cell.applications, cell.informative, cell.rerolls, cell.contradictions], [2, 0, 2, 0], 'pas une mesure du pas de qualité');
  // Signalé comme un écart à relire, la table ne change pas
  const rule = v.contradictions.filter((c) => c.kind === 'règle');
  assert.equal(rule.length, 2);
  assert.match(rule[0].message, /^G3 refait alors qu'il était déjà à 100 % : la table dit encore « inconnue » pour refaire un grade déjà fini \(0 cas dans les journaux de référence\)/);
  assert.equal(RANK_RULES.REROLL_FULL_GRADE.status, STATUS.UNKNOWN);
  assert.deepEqual(v.sequences[0].order.map((o) => o.reroll), [true, true]);
  // Progression : un grade refait peut n'avoir rien fait monter (inconnu) : 0 au plus bas, la table au plus haut ; le
  // pire cas du modèle ne le compte pas
  const e = engineerStates(log).get(ENG);
  assert.equal(e.rankProgress.min, 10);
  assert.ok(Math.abs(e.rankProgress.max - (10.99 + 2 * rankGain(3, 3, 'favorable'))) < 1e-9);
  assert.deepEqual(e.climbBasis.counts, [0, 0, 0, 0, 0, 0]);
  // 5 grades refaits sans montée écrite : ce n'est pas un « retard sur la table » (la table ne dit pas qu'ils comptent)
  const five = rankView(buildRankLog(events(5), { workshopOf }));
  assert.deepEqual(five.contradictions.map((c) => c.kind), ['règle', 'règle', 'règle', 'règle', 'règle']);
  assert.equal(five.sequences[0].ok, true);
  // Un G3 commencé (qualité 0,6) puis fini : une mesure ordinaire, pas un grade refait
  const started = { ...g3full, Modules: [{ ...g3full.Modules[0], Engineering: { ...g3full.Modules[0].Engineering, Quality: 0.6 } }] };
  const normal = buildRankLog([snapshot(0, 3, 10), started, docked(1, SHOP), craft(2, 3, 0.8)], { workshopOf });
  assert.deepEqual([normal.applications[0].reroll, normal.applications[0].step], [false, 0.2]);
  assert.deepEqual(rankView(normal).rerolls, []);
});

test('mesures : des valeurs que le jeu n’écrit jamais ne deviennent ni des mesures ni des écarts, et ne cassent pas la vue', () => {
  const base = [snapshot(0, 3, 0), docked(1, SHOP)];
  const view = (events) => {
    const log = buildRankLog(events, { workshopOf });
    return { log, v: rankView(log), e: engineerStates(log).get(ENG) };
  };
  // (a) Qualité 7 : illisible, aucune mesure ni « grade fini d'un coup »
  const a = view([...base, craft(2, 1, 7)]);
  assert.deepEqual([a.v.contradictions, a.v.unreadable], [[], 1]);
  assert.equal(a.v.measures.find((m) => m.rank === 3 && m.grade === 1).informative, 0);
  assert.equal(a.log.applications[0].step, null);
  // (b) Qualité -3 puis 0,2 : la suivante part d'une qualité inconnue, elle ne mesure rien non plus
  const b = view([...base, craft(2, 1, -3), craft(3, 1, 0.2)]);
  assert.deepEqual([b.v.contradictions, b.v.unreadable, b.log.applications.map((x) => x.step)], [[], 1, [null, null]]);
  // (c) Rang 9 : pas lu (aucune mesure « 9|1 », rang inconnu) ; une montée unitaire au rang 9 ne change pas le rang 3
  const c = view([{ ...snapshot(0, 9, 0) }, docked(1, SHOP), craft(2, 1, 0.3333)]);
  assert.deepEqual([c.v.measures.filter((m) => m.rank === 9), c.v.contradictions, c.e.rank], [[], [], null]);
  const c2 = view([...base, progress(2, 9), craft(3, 1, 0.3333)]);
  assert.deepEqual([c2.e.rank, c2.v.contradictions], [3, []]);
  // (d) RankProgress 1e12 : progression non lue, pas « contredit », aucun « au moins 1000000000000 % »
  const d = view([{ timestamp: t(0), event: 'EngineerProgress', Engineers: [{ Engineer: ENG, EngineerID: 300270, Progress: 'Unlocked', Rank: 3, RankProgress: 1e12 }] }, docked(1, SHOP), craft(2, 1, 0.3333), craft(3, 1, 0.6666)]);
  assert.notEqual(d.e.rankProgress.known, 'contredit');
  assert.ok(d.e.rankProgress.min < 100 && d.e.rankProgress.max <= 99.99);
  assert.deepEqual(d.v.contradictions, []);
  assert.doesNotMatch(JSON.stringify(d.v), /1000000000000/);
  // (e) Nom d'ingénieur qui n'est pas un nom : ignoré, la vue se construit (pas de « localeCompare is not a function »)
  const e = view([
    { timestamp: t(0), event: 'EngineerProgress', Engineers: [{ Engineer: 42, Progress: 'Unlocked', Rank: 3, RankProgress: 0 }, { Engineer: ENG, EngineerID: 300270, Progress: 'Unlocked', Rank: 3, RankProgress: 0 }] },
    docked(1, SHOP),
    { ...craft(2, 1, 0.3333), Engineer: 42 },
  ]);
  assert.deepEqual(e.v.engineers.map((x) => x.name), [ENG]);
  assert.deepEqual([e.v.unreadable, e.v.applications, e.v.contradictions], [1, 0, []]);
  // Grade 9 : illisible ; la séquence ne se vérifie plus (il a pu faire monter le rang), et le plus haut de la
  // progression n'est plus borné
  const g = view([...base, craft(2, 9, 0.5), ...[0.2, 0.4, 0.6, 0.8, 1].map((q, i) => craft(3 + i, 3, q))]);
  const seq = g.v.sequences.find((s) => s.end.kind === 'en cours');
  assert.deepEqual([seq.ok, seq.unreadable, g.v.unreadable], [true, 1, 1]);
  assert.match(seq.note, /1 application illisible \(valeur que le jeu n’écrit pas\) : séquence non vérifiée/);
  assert.equal(g.e.rankProgress.max, 99.99);
  // Rien de cela dans les vrais journaux : 863 applications, Quality de 0,2 à 1, Level de 1 à 5, Engineer toujours un nom
  assert.equal(view(unlockSequence()).v.unreadable, 0);
});

// --- Calcul ---

/** Données de référence simulées : chaque grade d'une modification coûte 1 matériau « <modif>-g<grade> ». */
function fakeRef(offers) {
  return {
    materials: new Map(),
    materialLabel: (k) => k,
    engineersFor: (grp, bp, g) => offers[bp]?.[g] || [],
    gradeComponents: (bp, g) => [{ key: `${bp}-g${g}`, count: 1 }],
    specialComponents: () => [{ key: 'effet', count: 1 }],
  };
}
const ALL = (names) => ({ 1: names, 2: names, 3: names, 4: names, 5: names });
const eng = (rank, min = 0, extra = {}) => ({ progress: 'Unlocked', rank, rankProgress: { min, max: min + 0.99, known: 'relevé' }, ...extra });
const mod = (slot, blueprint, grade, current = null) => ({ slot, label: slot, grp: 'g', target: { module: 'm', blueprint, grade }, current });
const needOf = (res, key) => res.materials.find((m) => m.key === key)?.need || 0;
const gradesOf = (x) => x.grades.map((y) => [y.grade, y.count]);

test('calcul : au rang 5, rien ne change (1 + 2 + 3 + 4 + 5 applications, besoins de base)', () => {
  const ref = fakeRef({ A: ALL(['Felicity Farseer']) });
  const res = planNeeds(ref, { modules: [mod('fsd', 'A', 5)], inventory: new Inventory(), engineers: new Map([['Felicity Farseer', eng(5)]]) });
  assert.deepEqual([res.rolls, res.rollsBase, res.rollsFavorable], [15, 15, 15]);
  assert.deepEqual(res.modules[0].steps.map((s) => s.rolls), [1, 2, 3, 4, 5]);
  assert.equal(res.modules[0].estimate, false);
  assert.equal(res.modules[0].engineerRanks[0].status, STATUS.MEASURED);
  assert.deepEqual(res.rankExtra.materials, []);
  assert.equal(needOf(res, 'A-g5'), 5);
  assert.deepEqual(res.engineers[0].extras, []);
});

test('calcul : rang 3 → G5 de zéro : 3 + 4 + 5 + 5 + 5 applications, montées pendant les G3 et G4 (comme Lei Cheung)', () => {
  const ref = fakeRef({ A: ALL(['Felicity Farseer']) });
  const res = planNeeds(ref, { modules: [mod('fsd', 'A', 5)], inventory: new Inventory(), engineers: new Map([['Felicity Farseer', eng(3)]]) });
  assert.deepEqual(res.modules[0].steps.map((s) => s.rolls), [3, 4, 5, 5, 5]);
  assert.deepEqual(res.modules[0].steps.map((s) => s.rollsBase), [1, 2, 3, 4, 5]);
  assert.deepEqual(res.modules[0].steps[2].ranks, [3, 4], 'G3 commencé au rang 3, fini au rang 4');
  assert.equal(res.rolls, 22);
  assert.equal(res.rankExtra.rolls, 7);
  assert.equal(res.modules[0].estimate, true, 'progression de rang à vérifier');
  assert.equal(res.modules[0].engineerRanks[0].status, STATUS.CHECK, 'G3 au rang 4 : sa part de la montée n’est pas chiffrée, mais elle ne change aucun compte');
  assert.deepEqual(res.modules[0].extras, [], 'les applications du plan suffisent pour monter');
  assert.deepEqual(res.engineers[0].ups.map((u) => [u.from, u.to, u.extra]), [[3, 4, false], [4, 5, false]]);
  // Matériaux en plus dus aux rangs, séparés : G1 ×2, G2 ×2, G3 ×2, G4 ×1
  assert.deepEqual(Object.fromEntries(res.rankExtra.materials.map((m) => [m.key, m.extra])), { 'A-g1': 2, 'A-g2': 2, 'A-g3': 2, 'A-g4': 1 });
  const row = res.materials.find((m) => m.key === 'A-g1');
  assert.deepEqual([row.need, row.base, row.rankExtra], [3, 1, 2]);
});

test('calcul : rang 3 et G2 visé, sans montée dans aucun scénario : chiffres mesurés, sans « ≈ »', () => {
  const ref = fakeRef({ A: ALL(['Liz Ryder']) });
  const res = planNeeds(ref, { modules: [mod('a', 'A', 2)], inventory: new Inventory(), engineers: new Map([['Liz Ryder', eng(3)]]) });
  assert.deepEqual(res.modules[0].steps.map((s) => [s.grade, s.rolls, s.rollsBase, s.rollsFavorable]), [[1, 3, 1, 3], [2, 4, 2, 4]]);
  assert.equal(res.modules[0].engineerRanks[0].status, STATUS.MEASURED, '3 G1 et 4 G2 au rang 3 : mesurés (22 et 15 fois)');
  assert.equal(res.modules[0].estimate, false);
  assert.deepEqual([res.engineers[0].ups, res.engineers[0].upsFavorable], [[], 0]);
});

test('calcul : rang 3 et G2 visé, progression jamais lue ou proche de la montée : « ≈ » gardé (le cas favorable peut monter en cours de plan)', () => {
  const ref = fakeRef({ A: ALL(['Liz Ryder']) });
  const at = (rankProgress) => planNeeds(ref, { modules: [mod('a', 'A', 2)], inventory: new Inventory(), engineers: new Map([['Liz Ryder', { progress: 'Unlocked', rank: 3, rankProgress }]]) });
  // Jamais lue (0 à 99,99 %) : aucune montée en prudent, mais le cas favorable monte au rang 4 dès le premier G1
  const unread = at({ min: 0, max: 99.99, known: 'inconnu', basis: null });
  assert.deepEqual([unread.engineers[0].ups.length, unread.engineers[0].upsFavorable], [0, 1]);
  // « à vérifier » : les G1 au rang 3 fixent le moment de la montée ; les G2 au rang 4 (rang final), aucune montée
  assert.equal(unread.modules[0].engineerRanks[0].status, STATUS.CHECK);
  assert.equal(unread.modules[0].estimate, true);
  assert.deepEqual(unread.modules[0].steps.map((s) => [s.grade, s.rolls, s.rollsFavorable]), [[1, 3, 3], [2, 4, 3]], 'G2 au rang 4 : 3 au lieu de 4');
  // Relevée à 60 % : le cas favorable (60,99 + 3 G1 + 4 G2) dépasse 100 % ; le pire cas du modèle monte aussi, à la
  // dernière application (Broo Tarquin, 5 nov. : 16 G1 et 5 G2 depuis 24 % ont fait le rang, donc 3 G1 et 4 G2 font
  // plus de 40 %), sans rien changer aux comptes. Relevée à 59 % : le prudent ne monte pas. À vérifier dans les deux cas
  const near = at({ min: 60, max: 60.99, known: 'relevé' });
  assert.deepEqual([near.engineers[0].ups.length, near.engineers[0].upsFavorable], [1, 1]);
  assert.deepEqual(near.modules[0].steps.map((s) => [s.grade, s.rolls, s.rollsFavorable]), [[1, 3, 3], [2, 4, 4]]);
  assert.deepEqual([at({ min: 59, max: 59.99, known: 'relevé' }).engineers[0].ups.length, at({ min: 59, max: 59.99, known: 'relevé' }).engineers[0].upsFavorable], [0, 1]);
  assert.equal(near.modules[0].engineerRanks[0].status, STATUS.CHECK);
  assert.equal(near.modules[0].estimate, true);
});

test('calcul : ingénieur pas encore débloqué retenu pour tout le module, plutôt qu’un débloqué qui ne fait que les premiers grades', () => {
  // Liz Ryder (rang 1) propose G1 à G3 ; Ram Tah, seulement invité, G1 à G5 : tout chez Ram Tah après son déblocage
  // (5 × 5 = 25 applications) coûte moins que Liz Ryder pour les premiers grades puis Ram Tah monté à part
  const three = ['Liz Ryder', 'Ram Tah'];
  const ref = fakeRef({ A: { 1: three, 2: three, 3: three, 4: ['Ram Tah'], 5: ['Ram Tah'] } });
  const at = (rank) => planNeeds(ref, { modules: [mod('a', 'A', 5)], inventory: new Inventory(), engineers: new Map([['Liz Ryder', eng(rank)], ['Ram Tah', { progress: 'Invited' }]]) });
  const res = at(1);
  const [g1] = res.modules[0].steps;
  assert.equal(g1.status.best, null);
  assert.deepEqual(g1.status.afterUnlock, { name: 'Ram Tah', rank: 1 });
  assert.deepEqual(g1.status.list.map((e) => [e.name, e.unlocked, e.rank]), [['Liz Ryder', true, 1], ['Ram Tah', false, null]], 'Liz Ryder, débloquée, reste listée pour ce grade');
  assert.equal(res.rolls, 25);
  assert.equal(res.modules[0].blocked, true);
  // Liz Ryder au rang 5 : le G1 chez elle (1 application), puis Ram Tah, monté au rang 2 par 3 G1 sur un module neuf :
  // 24 applications, une de moins que tout chez Ram Tah (5 G1)
  const five = at(5);
  assert.deepEqual(five.modules[0].steps.map((s) => [s.grade, s.rolls, s.status.best?.name ?? s.status.afterUnlock?.name]), [[1, 1, 'Liz Ryder'], [2, 5, 'Ram Tah'], [3, 5, 'Ram Tah'], [4, 5, 'Ram Tah'], [5, 5, 'Ram Tah']]);
  assert.deepEqual(five.modules[0].extras.map((x) => [x.engineer, x.rank, gradesOf(x)]), [['Ram Tah', 1, [[1, 3]]]]);
  assert.equal(five.rolls, 24);
});

test('calcul : module déjà en G3 (100 %), cible G5, rang 3 : la montée se fait sur un module neuf (G1, G2, G3), pas en refaisant le G3', () => {
  const ref = fakeRef({ A: ALL(['Felicity Farseer']) });
  const current = { module: 'm', blueprint: 'A', grade: 3, quality: 1 };
  const res = planNeeds(ref, { modules: [mod('fsd', 'A', 5, current)], inventory: new Inventory(), engineers: new Map([['Felicity Farseer', eng(3)]]) });
  const [x] = res.modules[0].extras;
  assert.equal(res.modules[0].extras.length, 1);
  assert.deepEqual([x.rank, x.kind, x.count, gradesOf(x)], [3, 'module neuf', 10, [[1, 3], [2, 4], [3, 3]]], 'G1 et G2 d’abord : le G3 ne s’applique qu’après un G2 à 100 %');
  assert.deepEqual([needOf(res, 'A-g1'), needOf(res, 'A-g2'), needOf(res, 'A-g3')], [3, 4, 3], 'matériaux des G1, G2 et G3 de la même modification');
  assert.deepEqual(res.modules[0].steps.map((s) => [s.grade, s.rolls, s.rollsBase]), [[4, 5, 4], [5, 5, 5]]);
  // Le cas favorable seulement suppose qu'on peut refaire le G3 (inconnu)
  const e = res.engineers[0];
  assert.deepEqual([e.extraCount, e.extraCountFavorable, e.extraFavorableReroll], [10, 3, true]);
  assert.equal(res.rules.reroll.status, STATUS.UNKNOWN);
  // Progression de rang déjà à 80 % : le manque seulement (3 G1 obligatoires, puis 2 G2)
  const near = planNeeds(ref, { modules: [mod('fsd', 'A', 5, current)], inventory: new Inventory(), engineers: new Map([['Felicity Farseer', eng(3, 80)]]) });
  assert.deepEqual(gradesOf(near.modules[0].extras[0]), [[1, 3], [2, 2]]);
  assert.equal(near.engineers[0].extraCountFavorable, 1);
});

test('calcul : lance-missiles déjà en G3, visé G5, chez Liz Ryder (rang 3, 49 %) : 3 G1 + 4 G2 + 1 G3 en plus, pas 2 G3', () => {
  const ref = fakeRef({ HC: ALL(['Liz Ryder']) });
  const current = { module: 'm', blueprint: 'HC', grade: 3, quality: 1 };
  const res = planNeeds(ref, { modules: [mod('lance-missiles', 'HC', 5, current)], inventory: new Inventory(), engineers: new Map([['Liz Ryder', eng(3, 49)]]) });
  assert.deepEqual(gradesOf(res.modules[0].extras[0]), [[1, 3], [2, 4], [3, 1]]);
  assert.deepEqual(Object.fromEntries(res.rankExtra.materials.map((m) => [m.key, m.extra])), { 'HC-g1': 3, 'HC-g2': 4, 'HC-g3': 1, 'HC-g4': 1 });
});

test('calcul : matériau que le cas favorable demande plus que le prudent (grade refait) : donné à part, jamais caché', () => {
  // Même plan : le favorable refait 2 fois le G3 (2 « HC-g3 ») au lieu de 3 G1, 4 G2 et 1 G3 (1 « HC-g3 ») ; à 70 %, le
  // prudent n'atteint plus le G3 (3 G1, 3 G2) mais le favorable en refait un : le matériau doit rester listé
  const ref = fakeRef({ HC: ALL(['Liz Ryder']) });
  const current = { module: 'm', blueprint: 'HC', grade: 3, quality: 1 };
  const at = (p) => planNeeds(ref, { modules: [mod('lance-missiles', 'HC', 5, current)], inventory: new Inventory(), engineers: new Map([['Liz Ryder', eng(3, p)]]) });
  const row = (res, key) => res.rankExtra.materials.find((m) => m.key === key);
  const g3 = row(at(49), 'HC-g3');
  assert.deepEqual([g3.extra, g3.extraFavorable, g3.favorableMore, g3.missing, g3.missingFavorable], [1, 2, 1, 1, 2]);
  assert.equal(row(at(49), 'HC-g1').favorableMore, 0, 'le favorable demande moins de G1 : rien à part');
  const late = row(at(70), 'HC-g3');
  assert.ok(late, 'matériau du seul cas favorable : listé quand même');
  assert.deepEqual([late.extra, late.extraFavorable, late.favorableMore, late.missing, late.missingFavorable], [0, 1, 1, 0, 1]);
  assert.equal(at(70).materials.find((m) => m.key === 'HC-g3'), undefined, '« Nécessaire » reste le prudent');
});

test('calcul : un grade mis en pause pendant qu’un autre module fait monter le rang est compté rang par rang (byRank)', () => {
  // Deux lance-missiles chez Liz Ryder (rang 3, 49 %) : le n°1 déjà en G3 (100 %), le n°2 neuf, tous deux visés G5.
  // Le G3 du n°2 la fait monter au rang 4 dès sa 1re application ; les G4 du n°1 la font monter au rang 5 ; le reste du
  // G3 du n°2 se fait alors au rang 5 (3 applications) : 4 en tout, pas 5 comme au rang 4
  const ref = fakeRef({ HC: ALL(['Liz Ryder']) });
  const res = planNeeds(ref, {
    modules: [mod('mr1', 'HC', 5, { module: 'm', blueprint: 'HC', grade: 3, quality: 1 }), mod('mr2', 'HC', 5)],
    inventory: new Inventory(),
    engineers: new Map([['Liz Ryder', eng(3, 49)]]),
  });
  const step = (slot, g) => res.modules.find((m) => m.slot === slot).steps.find((s) => s.grade === g);
  assert.deepEqual(step('mr2', 3).byRank, [{ rank: 3, rolls: 1 }, { rank: 5, rolls: 3 }]);
  assert.equal(step('mr2', 3).rolls, 4);
  assert.deepEqual(step('mr2', 3).ranks, [3, 5]);
  assert.deepEqual(step('mr1', 4).byRank, [{ rank: 4, rolls: 4 }, { rank: 5, rolls: 1 }]);
  assert.deepEqual(step('mr2', 1).byRank, [{ rank: 3, rolls: 3 }]);
  assert.deepEqual(res.engineers[0].ups.map((u) => [u.from, u.to, u.slot, u.grade]), [[3, 4, 'mr2', 3], [4, 5, 'mr1', 4]]);
  assert.deepEqual(res.modules[0].extras, [], 'le n°2 fait la montée : pas de module neuf');
  // Au rang 4, ce G3 repris à 20 % (12/60) demanderait 4 applications de plus (5 en tout) : seul le rang 5 en donne 3
  assert.equal(rollsToFinish(4, 3, 12), 4);
  assert.equal(rollsToFinish(5, 3, 12), 3);
  // Sans ingénieur choisi (aucun ne propose ce grade) : compté au rang 5
  const none = planNeeds(fakeRef({}), { modules: [mod('x', 'HC', 2)], inventory: new Inventory(), engineers: new Map() });
  assert.deepEqual(none.modules[0].steps.map((s) => s.byRank), [[{ rank: 5, rolls: 1 }], [{ rank: 5, rolls: 2 }]]);
});

test('calcul : badge de l’exemple de l’auteur (rang 3, G3 de zéro) : « à vérifier », pas « inconnue » (les G3 faits au rang final ne fixent aucune montée)', () => {
  const ref = fakeRef({ HC: ALL(['Liz Ryder']) });
  for (const p of [0, 49]) {
    const res = planNeeds(ref, { modules: [mod('mr', 'HC', 3)], inventory: new Inventory(), engineers: new Map([['Liz Ryder', eng(3, p)]]) });
    assert.deepEqual([res.rolls, res.rollsFavorable], [12, 12], `${p} % : 3 + 4 + 5 dans les deux scénarios`);
    assert.deepEqual([res.engineers[0].rankAfter, res.engineers[0].rankAfterFavorable], [4, 4]);
    assert.equal(res.engineers[0].status, STATUS.CHECK, `${p} % : seule la progression au rang 3 (à vérifier) fixe le moment de la montée`);
    assert.equal(res.modules[0].engineerRanks[0].status, STATUS.CHECK);
    assert.equal(res.modules[0].estimate, true, '« ≈ » : une règle à vérifier');
  }
  // Rang 4 → G5 de zéro : les G1 à G3 au rang 4 viennent avant la montée au rang 5, mais leur part (inconnue) ne
  // change aucun compte : 2 + 3 + 4 + 5 + 5 dans les deux scénarios, « à vérifier »
  const r4 = planNeeds(ref, { modules: [mod('mr', 'HC', 5)], inventory: new Inventory(), engineers: new Map([['Liz Ryder', eng(4)]]) });
  assert.deepEqual([r4.rolls, r4.rollsFavorable], [19, 19]);
  assert.equal(r4.engineers[0].status, STATUS.CHECK);
  assert.ok(!r4.engineers[0].statusWhy.includes(rankRow(4, 1).climb.why), 'la part inconnue n’est pas le motif');
  assert.ok(r4.engineers[0].statusWhy.includes(`progression de rang : ${DEDUCED_WHY}`));
  // Relevée à 50 % : selon cette part, la montée vient pendant les G3 (G4 au rang 5 : 4) ou pendant les G4 (5) : elle
  // change un compte, « inconnue »
  const half = planNeeds(ref, { modules: [mod('mr', 'HC', 5)], inventory: new Inventory(), engineers: new Map([['Liz Ryder', eng(4, 50)]]) });
  assert.deepEqual([half.rolls, half.rollsFavorable], [19, 18]);
  assert.equal(half.engineers[0].status, STATUS.UNKNOWN);
  assert.deepEqual(half.engineers[0].statusWhy, [rankRow(4, 1).climb.why], 'motif : la part des G1 à G3 au rang 4');
});

test('calcul : motif du badge (statusWhy) : mesuré trop peu de fois n’est pas « déduit avec une hypothèse »', () => {
  // Selene Jean au rang 4, relevée à 10 %, module visé en G1 : 2 applications au lieu de 1, mesurées 2 fois ; aucune
  // montée en jeu. « à vérifier » vient de là seulement
  const ref = fakeRef({ A: ALL(['Selene Jean']) });
  const res = planNeeds(ref, { modules: [mod('x', 'A', 1)], inventory: new Inventory(), engineers: new Map([['Selene Jean', eng(4, 10)]]) });
  assert.equal(res.rolls, 2);
  const why = ['finir le G1 au rang 4 : mesurée 2 fois seulement (il en faut 3 pour la dire mesurée), sans hypothèse'];
  assert.deepEqual([res.engineers[0].status, res.engineers[0].statusWhy], [STATUS.CHECK, why]);
  assert.deepEqual([res.modules[0].engineerRanks[0].status, res.modules[0].engineerRanks[0].statusWhy], [STATUS.CHECK, why]);
  // Exemple de l’auteur (rang 3, G3 de zéro) : là, c'est la progression de rang, déduite
  const liz = planNeeds(fakeRef({ HC: ALL(['Liz Ryder']) }), { modules: [mod('mr', 'HC', 3)], inventory: new Inventory(), engineers: new Map([['Liz Ryder', eng(3)]]) });
  assert.deepEqual(liz.engineers[0].statusWhy, [`progression de rang : ${DEDUCED_WHY}`]);
  // Rang non lu : inconnue, et pourquoi ; tout mesuré (rang 5) : aucun motif
  const unread = planNeeds(ref, { modules: [mod('x', 'A', 2)], inventory: new Inventory(), engineers: new Map([['Selene Jean', { progress: 'Unlocked', rank: null }]]) });
  assert.equal(unread.engineers[0].status, STATUS.UNKNOWN);
  assert.ok(unread.engineers[0].statusWhy.includes('rang non lu dans le journal : compté au rang 1 en prudent, au rang 5 en favorable'));
  assert.ok(unread.engineers[0].statusWhy.every((w) => !/mesurée \d fois/.test(w)), 'seuls les motifs du statut retenu (inconnue)');
  const five = planNeeds(ref, { modules: [mod('x', 'A', 5)], inventory: new Inventory(), engineers: new Map([['Selene Jean', eng(5)]]) });
  assert.deepEqual([five.engineers[0].status, five.engineers[0].statusWhy], [STATUS.MEASURED, []]);
});

test('calcul : au rang 1, module en G4 visé G5 : le même module neuf sert à chaque montée (5 G1, 5 G2, 5 G3, 4 G4)', () => {
  const ref = fakeRef({ A: ALL(['Lei Cheung']) });
  const res = planNeeds(ref, { modules: [mod('x', 'A', 5, { module: 'm', blueprint: 'A', grade: 4, quality: 1 })], inventory: new Inventory(), engineers: new Map([['Lei Cheung', eng(1)]]) });
  const x = res.modules[0].extras;
  assert.deepEqual(x.map((e) => [e.rank, e.spare]), [[1, 1], [2, 1], [3, 1], [4, 1]], 'un seul module de montée, repris d’un rang à l’autre');
  const per = {};
  for (const e of x) for (const [g, n] of gradesOf(e)) per[g] = (per[g] || 0) + n;
  assert.deepEqual(per, { 1: 5, 2: 5, 3: 5, 4: 4 });
  assert.equal(res.rankExtra.rolls, 19);
});

test('calcul : la montée de rang est partagée entre les modules faits chez le même ingénieur', () => {
  const ref = fakeRef({ A: ALL(['Broo Tarquin']), B: ALL(['Broo Tarquin']) });
  const engineers = new Map([['Broo Tarquin', eng(3)]]);
  const one = planNeeds(ref, { modules: [mod('laser1', 'A', 5)], inventory: new Inventory(), engineers });
  const two = planNeeds(ref, { modules: [mod('laser1', 'A', 5), mod('laser2', 'B', 5)], inventory: new Inventory(), engineers });
  assert.equal(two.rankExtra.rolls, one.rankExtra.rolls, 'la montée n’est payée qu’une fois');
  assert.equal(two.modules[1].rolls, 15, 'le deuxième module est fait au rang 5');
  // Deux modules déjà en G3 : les applications en plus ne sont comptées qu'une fois
  const cur = (bp) => ({ module: 'm', blueprint: bp, grade: 3, quality: 1 });
  const both = planNeeds(ref, { modules: [mod('laser1', 'A', 5, cur('A')), mod('laser2', 'B', 5, cur('B'))], inventory: new Inventory(), engineers });
  assert.equal(both.modules[0].extras[0].count, 10);
  assert.deepEqual(both.modules[1].extras, []);
  assert.equal(both.engineers.length, 1);
});

test('calcul : valeur inconnue (rang non lu) : calcul prudent depuis le rang 1, signalé « inconnue »', () => {
  const ref = fakeRef({ A: ALL(['Juri Ishmaak']) });
  const res = planNeeds(ref, { modules: [mod('pp', 'A', 2)], inventory: new Inventory(), engineers: new Map([['Juri Ishmaak', { progress: 'Unlocked', rank: null }]]) });
  assert.equal(res.engineers[0].rankKnown, false);
  assert.equal(res.engineers[0].status, STATUS.UNKNOWN);
  assert.equal(res.modules[0].estimate, true);
  assert.ok(res.rolls > res.rollsFavorable, 'fourchette : prudent (rang 1) ≠ favorable (rang 5)');
  assert.equal(res.rollsFavorable, res.rollsBase);
});

test('calcul : un ingénieur au rang 5 coûte moins qu’un rang 2 listé avant lui ; la montée partagée peut renverser le choix', () => {
  const ref = fakeRef({ A: ALL(['Liz Ryder', 'Selene Jean']), X: ALL(['Liz Ryder']) });
  const solo = planNeeds(ref, { modules: [mod('armure', 'A', 5)], inventory: new Inventory(), engineers: new Map([['Liz Ryder', eng(2)], ['Selene Jean', eng(5)]]) });
  assert.equal(solo.modules[0].engineer, 'Selene Jean');
  assert.equal(solo.rolls, 15);
  // X ne se fait que chez Liz Ryder (rang 3) : elle montera au rang 5 de toute façon ; A, faisable chez Selene Jean
  // (rang 4), coûte alors moins chez Liz Ryder, après sa montée
  const engineers = new Map([['Liz Ryder', eng(3)], ['Selene Jean', eng(4)]]);
  const mixed = planNeeds(ref, { modules: [mod('cloisons', 'X', 5), mod('armure', 'A', 5)], inventory: new Inventory(), engineers });
  assert.equal(mixed.modules[0].engineer, 'Liz Ryder');
  // Armure : G1 et G2 chez Selene Jean (2 + 3), puis G3 à G5 chez Liz Ryder, que ses G3 font monter (35 applications en
  // tout) ; tout chez Liz Ryder en coûterait 37 (les cloisons font alors la montée), l'armure chez Selene Jean 41
  assert.equal(mixed.modules[1].engineer, null, 'deux ingénieurs pour l’armure');
  assert.deepEqual(mixed.modules[1].steps.map((s) => [s.grade, s.rolls, s.status.best.name]), [[1, 2, 'Selene Jean'], [2, 3, 'Selene Jean'], [3, 5, 'Liz Ryder'], [4, 5, 'Liz Ryder'], [5, 5, 'Liz Ryder']]);
  assert.equal(mixed.rolls, 35);
  assert.deepEqual(mixed.engineers.find((e) => e.name === 'Liz Ryder').ups.map((u) => [u.from, u.to, u.slot]), [[3, 4, 'armure'], [4, 5, 'armure']]);
  const lizOnly = planNeeds(fakeRef({ A: ALL(['Liz Ryder']), X: ALL(['Liz Ryder']) }), { modules: [mod('cloisons', 'X', 5), mod('armure', 'A', 5)], inventory: new Inventory(), engineers });
  assert.equal(lizOnly.rolls, 37);
  const alone = planNeeds(ref, { modules: [mod('armure', 'A', 5)], inventory: new Inventory(), engineers });
  assert.equal(alone.modules[0].engineer, 'Selene Jean', 'seul, le rang 4 est moins cher que le rang 3');
});

test('calcul : choix de l’ingénieur au coût réel de la montée (module neuf compris) : garder un module « moteur » chez le rang 3', () => {
  // A : déjà en G3, visé G5, chez Liz Ryder seule (rang 3, 49 %) ; B : neuf, visé G3, chez Liz Ryder ou Juri Ishmaak (rang 5)
  const ref = fakeRef({ A: ALL(['Liz Ryder']), B: { 1: ['Liz Ryder', 'Juri Ishmaak'], 2: ['Liz Ryder', 'Juri Ishmaak'], 3: ['Liz Ryder', 'Juri Ishmaak'] } });
  const res = planNeeds(ref, {
    modules: [mod('a', 'A', 5, { module: 'm', blueprint: 'A', grade: 3, quality: 1 }), mod('b', 'B', 3)],
    inventory: new Inventory(),
    engineers: new Map([['Liz Ryder', eng(3, 49)], ['Juri Ishmaak', eng(5)]]),
  });
  // B : G1 et G2 chez Juri Ishmaak (rang 5 : 1 + 2), puis le G3 chez Liz Ryder, qu'il fait monter : pas de module neuf
  assert.deepEqual(res.modules[1].steps.map((s) => [s.grade, s.rolls, s.status.best.name]), [[1, 1, 'Juri Ishmaak'], [2, 2, 'Juri Ishmaak'], [3, 4, 'Liz Ryder']]);
  assert.deepEqual(res.modules[0].extras, []);
  assert.equal(res.rolls, 17, 'au lieu de 21 (B tout chez Liz Ryder) ou 24 (B tout chez Juri Ishmaak, 8 applications sur un module neuf pour la montée)');
});

test('calcul : simulation pas à pas (rang 1 → 5, comme Tiana Fortune) et grade commencé', () => {
  const s = simulateEngineer({ rank: 1, progress: 0 }, [{ key: 'a', blueprint: 'A', grades: [1, 2, 3, 4, 5], startUnits: 0 }]);
  assert.deepEqual(s.tasks.get('a').per.map((p) => p.rolls), [5, 5, 5, 5, 5]);
  assert.deepEqual(s.ups.map((u) => u.to), [2, 3, 4, 5]);
  assert.equal(s.rank, 5);
  // G4 à 50 % au rang 5 : 2 applications pour le finir
  assert.equal(qualityUnits(0.5), 30);
  assert.equal(rollsToFinish(5, 4, qualityUnits(0.5)), 2);
  assert.equal(qualityUnits(0.995), 60);
  // Au rang 5, les besoins de base comptent aussi la fin du grade commencé
  const ref = fakeRef({ A: ALL(['Felicity Farseer']) });
  const n = moduleNeeds(ref, { module: 'm', blueprint: 'A', grade: 5 }, { module: 'm', blueprint: 'A', grade: 4, quality: 0.5 }, 'g');
  assert.equal(n.rolls, 7);
  assert.deepEqual(remainingSteps({ module: 'm', blueprint: 'A', grade: 5 }, { module: 'm', blueprint: 'A', grade: 4, quality: 0.5 }).grades, [4, 5]);
});

test('calcul : ingénieur pas encore débloqué → module bloqué, mais compté comme après déblocage (rang 1, 0 %) : 25 applications pour un G5', () => {
  const ref = fakeRef({ A: ALL(['Ram Tah']) });
  const res = planNeeds(ref, { modules: [mod('x', 'A', 5)], inventory: new Inventory(), engineers: new Map([['Ram Tah', { progress: 'Invited' }]]) });
  const m = res.modules[0];
  assert.equal(m.blocked, true);
  assert.deepEqual(m.steps.map((s) => s.rolls), [5, 5, 5, 5, 5]);
  assert.equal(res.rolls, 25);
  assert.equal(res.rankExtra.rolls, 10, 'dans « dont rangs »');
  assert.deepEqual(m.steps.map((s) => [s.status.best, s.status.afterUnlock?.name]), Array.from({ length: 5 }, () => [null, 'Ram Tah']));
  assert.deepEqual([res.engineers[0].name, res.engineers[0].locked, res.engineers[0].startRank, res.engineers[0].lockedProgress], ['Ram Tah', true, 1, 'Invited']);
  // Absent du journal (jamais rencontré) : pareil
  assert.equal(planNeeds(ref, { modules: [mod('x', 'A', 5)], inventory: new Inventory(), engineers: new Map() }).rolls, 25);
  // Effet expérimental : 1 application
  const exp = planNeeds(ref, { modules: [{ ...mod('x', 'A', 2), target: { module: 'm', blueprint: 'A', grade: 2, experimental: 'special_x' } }], inventory: new Inventory(), engineers: new Map([['Ram Tah', { progress: 'Invited' }]]) });
  assert.equal(needOf(exp, 'effet'), 1);
  assert.equal(exp.rolls, 5 + 5 + 1);
  // Seulement les G4 et G5 chez un ingénieur verrouillé : le moins cher, après déblocage (lui pour tout le module ici)
  const mixed = fakeRef({ A: { 1: ['Selene Jean', 'Ram Tah'], 2: ['Selene Jean', 'Ram Tah'], 3: ['Selene Jean', 'Ram Tah'], 4: ['Ram Tah', 'Marsha Hicks'], 5: ['Ram Tah', 'Marsha Hicks'] } });
  const r2 = planNeeds(mixed, { modules: [mod('x', 'A', 5)], inventory: new Inventory(), engineers: new Map([['Selene Jean', eng(5)]]) });
  assert.equal(r2.modules[0].blocked, true);
  assert.ok(r2.rolls > 15, `montée comptée (${r2.rolls})`);
  // G1 chez Selene Jean (1), puis Ram Tah, monté au rang 2 par 3 G1 sur un module neuf : 24 (tout chez lui : 25)
  assert.equal(r2.rolls, 24);
  assert.deepEqual(r2.modules[0].steps.map((s) => s.status.best?.name ?? s.status.afterUnlock?.name), ['Selene Jean', 'Ram Tah', 'Ram Tah', 'Ram Tah', 'Ram Tah']);
});

// --- Calcul : pire cas du modèle, découpage d'un module, choix sans optimum local, badges, déblocage ---

test('calcul prudent : le pire cas des séquences des journaux, pas les bornes basses de la table prises chacune à part', () => {
  const ref = fakeRef({ A: ALL(['Selene Jean']) });
  const extras = (rank, p, grade) => {
    const res = planNeeds(ref, { modules: [mod('x', 'A', 5, { module: 'm', blueprint: 'A', grade, quality: 1 })], inventory: new Inventory(), engineers: new Map([['Selene Jean', eng(rank, p)]]) });
    return res.engineers[0].extras.filter((x) => x.rank === rank).map(gradesOf);
  };
  // Comme Selene Jean le 1er nov. : rang 4, relevé à 0 %, module en G4 visé G5. Ses journaux : 2 G1, 3 G2, 4 G3 et 2 G4
  // depuis ce relevé (moins de 1 %) ont suffi ; depuis 0 % tout juste, au pire 3 G4. Les bornes basses additionnées en
  // demandaient 4 (13 applications en plus)
  assert.deepEqual(extras(4, 0, 4), [[[1, 2], [2, 3], [3, 4], [4, 3]]], 'au plus 12 applications en plus');
  assert.deepEqual(extras(4, 5, 4), [[[1, 2], [2, 3], [3, 4], [4, 2]]], 'relevé à 5 % : 11');
  // Comme Lei Cheung : rang 3, relevé à 4 %, module en G3 visé G5 (elle est montée avec 2 G1, 4 G2 et 2 G3) : au plus 9
  assert.deepEqual(extras(3, 4, 3), [[[1, 3], [2, 4], [3, 2]]]);
  // Le modèle ne monte jamais avant ce que montrent les journaux : dans chaque séquence finie par une montée, avec
  // toutes ses applications à l'atelier, le rang peut encore être sous le seuil juste avant la dernière application
  const model = prudentModel();
  assert.equal(model.feasible, true);
  let checked = 0;
  for (const s of SEQUENCES) {
    if (s.end.kind !== 'montée' || /[dx?]/.test(s.applications)) continue;
    const counts = [0, 0, 0, 0, 0, 0];
    for (const tok of s.applications.split(' ').slice(0, -1)) counts[Number(tok[1])]++;
    const from = s.start.kind === 'relevé' ? s.start.progress : 0;
    assert.equal(model.canStayBelow(s.rank, from, counts), true, `${s.engineer} rang ${s.rank}`);
    checked++;
  }
  assert.ok(checked >= 13, `${checked} séquences`);
  // Jamais plus prudent que la table seule (bornes basses à part), jamais moins que le cas favorable
  for (let rank = 1; rank <= 4; rank++) {
    for (let p = 0; p < 100; p += 3) {
      const tasks = [{ key: 'm', blueprint: 'A', grades: [rank + 1], startUnits: 0 }];
      const n = (sim) => sim.extras.reduce((a, x) => a + x.count, 0);
      const worst = n(simulateEngineer({ rank, progress: p }, tasks, 'prudent'));
      const table = n(simulateEngineer({ rank, progress: p }, tasks, 'prudent', { model: null }));
      const best = n(simulateEngineer({ rank, progress: p + 0.99 }, tasks, 'favorable'));
      assert.ok(worst <= table && worst >= best, `rang ${rank} à ${p} % : ${best} ≤ ${worst} ≤ ${table}`);
    }
  }
});

test('calcul prudent : séquences qui se contredisent (modèle infaisable) : la table seule, rien de plus optimiste', () => {
  // Un G1 qui fait le rang 1 depuis le déblocage, et deux G1 qui ne le font pas : aucun seuil ne va
  const broken = worstCaseModel([
    { engineer: 'A', rank: 1, start: { kind: 'déblocage', at: '2026-01-01T00:00:00Z', progress: 0 }, end: { kind: 'montée', at: '2026-01-01T00:01:00Z', toRank: 2 }, applications: 'G1' },
    { engineer: 'B', rank: 1, start: { kind: 'déblocage', at: '2026-01-01T00:00:00Z', progress: 0 }, end: { kind: 'relevé', at: '2026-01-01T00:01:00Z', progress: 66 }, applications: 'G1 G1' },
  ]);
  assert.equal(broken.feasible, false);
  assert.equal(broken.canStayBelow(1, 0, [0, 50]), true);
  const tasks = [{ key: 'm', blueprint: 'A', grades: [1, 2, 3, 4, 5], startUnits: 0 }];
  const per = (sim) => sim.tasks.get('m').per.map((p) => p.rolls);
  assert.deepEqual(per(simulateEngineer({ rank: 1, progress: 0 }, tasks, 'prudent', { model: broken })), per(simulateEngineer({ rank: 1, progress: 0 }, tasks, 'prudent', { model: null })));
});

test('calcul prudent : progression estimée depuis un relevé, le pire cas compte les applications faites depuis', () => {
  // Rang 3 relevé à 4 %, puis 2 G1, 4 G2 et 1 G3 à l'atelier (Lei Cheung le 1er nov., juste avant sa montée) : le modèle
  // part du relevé avec ces 7 applications, pas de la progression la plus basse (4 + 2 × 2 + 4 × 8,4444 + 26,6532 %)
  const armour = (n, grade, quality) => ({ ...craft(n, grade, quality), Slot: 'Armour' });
  const events = [
    snapshot(0, 3, 4),
    docked(1, SHOP),
    craft(2, 1, 0.3333), craft(3, 1, 0.6666),
    armour(4, 2, 0.25), armour(5, 2, 0.5), armour(6, 2, 0.75), armour(7, 2, 1), armour(8, 3, 0.2),
  ];
  const state = engineerStates(buildRankLog(events, { workshopOf })).get(ENG);
  assert.deepEqual(state.climbBasis, { from: 4, counts: [0, 2, 4, 1, 0, 0] });
  assert.ok(Math.abs(state.rankProgress.min - (4 + 2 * rankGain(3, 1) + 4 * rankGain(3, 2) + rankGain(3, 3))) < 1e-9);
  // Après une montée : départ 0, et les applications depuis (ici 2 G2 au rang 3)
  assert.deepEqual(engineerStates(buildRankLog(unlockSequence(), { workshopOf })).get(ENG).climbBasis, { from: 0, counts: [0, 0, 2, 0, 0, 0] });
  // Un module en G3 visé G5 : 3 G1 et 3 G2 en plus suffisent au pire ; depuis la progression la plus basse seule, 3 G1 et
  // 4 G2
  const ref = fakeRef({ A: ALL([ENG]) });
  const plan = (s) => planNeeds(ref, { modules: [mod('x', 'A', 5, { module: 'm', blueprint: 'A', grade: 3, quality: 1 })], inventory: new Inventory(), engineers: new Map([[ENG, s]]) });
  assert.deepEqual(plan(state).engineers[0].extras.map(gradesOf), [[[1, 3], [2, 3]]]);
  assert.deepEqual(plan({ ...state, climbBasis: null }).engineers[0].extras.map(gradesOf), [[[1, 3], [2, 4]]]);
});

test('calcul : les premiers grades chez un rang 5, la suite chez l’ingénieur qui fait tout (pas de module de montée)', () => {
  // A (rang 5) fait G1 à G3, B tous les grades : comme Tod McQuinn et Marsha Hicks pour le fragmenteur
  const ref = fakeRef({ X: { 1: ['A', 'B'], 2: ['A', 'B'], 3: ['A', 'B'], 4: ['B'], 5: ['B'] } });
  const at = (rankB) => planNeeds(ref, { modules: [mod('frag', 'X', 5)], inventory: new Inventory(), engineers: new Map([['A', eng(5)], ['B', eng(rankB)]]) });
  const who = (res) => res.modules[0].steps.map((s) => s.status.best.name).join('');
  // B au rang 3 : G1 et G2 chez A (1 + 2), puis G3 à G5 chez B, que ses G3 font monter : 18, pas 22 tout chez B
  const r3 = at(3);
  assert.deepEqual([who(r3), r3.rolls, r3.modules[0].extras.length, r3.modules[0].engineer], ['AABBB', 18, 0, null]);
  // B au rang 4 : G1 à G3 chez A : 16, pas 19 ; au rang 2 : G1 chez A : 21, pas 24
  assert.deepEqual([who(at(4)), at(4).rolls], ['AAABB', 16]);
  assert.deepEqual([who(at(2)), at(2).rolls], ['ABBBB', 21]);
  // B au rang 5 : tout chez lui (un seul ingénieur à coût égal)
  assert.deepEqual([at(5).modules[0].engineer, at(5).rolls], ['B', 15]);
});

test('calcul : choix sans optimum local, et un rang ou une progression de plus ne renchérit jamais le plan', () => {
  // Plan Y G5, Y G1, Y G1 chez A, B ou C (B au rang 1, 71 % ; C au rang 2, 77 %) ; une application de G<g> coûte g
  // matériaux. Avec A au rang 1, tout chez C (74) ; A monté au rang 2, la recherche module par module restait tout chez A
  // (76) : il fallait déplacer les trois modules à la fois
  const costly = (offers) => ({ ...fakeRef(offers), gradeComponents: (bp, g) => [{ key: `${bp}-g${g}`, count: g }] });
  const ref = costly({ Y: { 1: ['A', 'B', 'C'], 2: ['B', 'C', 'A'], 3: ['A', 'C', 'B'], 4: ['A', 'B', 'C'], 5: ['A', 'C'] } });
  const mods = [mod('s0', 'Y', 5), mod('s1', 'Y', 1), mod('s2', 'Y', 1)];
  const units = (res) => res.materials.reduce((a, m) => a + m.need, 0);
  const plan = (a) => planNeeds(ref, { modules: mods, inventory: new Inventory(), engineers: new Map([['A', a], ['B', eng(1, 71)], ['C', eng(2, 77)]]) });
  assert.equal(units(plan(eng(1, 69))), 74);
  assert.ok(units(plan(eng(2, 69))) <= 74, `A au rang 2 : ${units(plan(eng(2, 69)))}`);
  assert.ok(units(plan(eng(2, 0))) <= 74);
  // Plans tirés au hasard (graine fixe) : 2 ou 3 ingénieurs, 1 à 3 modifications, 2 à 4 modules
  let seed = 20261109;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  for (let n = 0; n < 120; n++) {
    const names = ['A', 'B', 'C'].slice(0, 2 + Math.floor(rnd() * 2));
    const bps = ['X', 'Y', 'Z'].slice(0, 1 + Math.floor(rnd() * 3));
    const offers = {};
    const cost = {};
    for (const bp of bps) {
      offers[bp] = {};
      cost[bp] = {};
      for (let g = 1; g <= 5; g++) {
        offers[bp][g] = names.filter(() => rnd() < 0.6);
        if (!offers[bp][g].length) offers[bp][g] = [pick(names)];
        cost[bp][g] = 1 + Math.floor(rnd() * 3) + (g > 3 ? 1 : 0);
      }
    }
    const r = { ...fakeRef(offers), gradeComponents: (bp, g) => [{ key: `${bp}-g${g}`, count: cost[bp][g] }] };
    const modules = Array.from({ length: 2 + Math.floor(rnd() * 3) }, (_, i) => {
      const bp = pick(bps);
      const grade = 1 + Math.floor(rnd() * 5);
      const done = rnd() < 0.3 ? Math.floor(rnd() * grade) : 0;
      return mod(`s${i}`, bp, grade, done ? { module: 'm', blueprint: bp, grade: done, quality: 1 } : null);
    });
    const state = Object.fromEntries(names.map((x) => [x, { rank: 1 + Math.floor(rnd() * 5), p: Math.floor(rnd() * 90) }]));
    const total = (st) => units(planNeeds(r, { modules, inventory: new Inventory(), engineers: new Map(names.map((x) => [x, eng(st[x].rank, st[x].rank >= 5 ? 0 : st[x].p)])) }));
    const base = total(state);
    const who = pick(names);
    if (state[who].rank >= 5) continue;
    const up = total({ ...state, [who]: { rank: state[who].rank + 1, p: 0 } });
    const more = total({ ...state, [who]: { rank: state[who].rank, p: Math.min(99, state[who].p + 1 + Math.floor(rnd() * 30)) } });
    assert.ok(up <= base && more <= base, `plan ${n} : ${who} ${JSON.stringify(state[who])} : ${base} → rang + 1 : ${up}, progression + : ${more}`);
  }
});

test('calcul : un module visé sous le rang compte pour la montée : fait d’abord au rang actuel quand c’est moins cher (1 G1 en plus, pas 8)', () => {
  // Rang 3 à 60 % : A déjà en G3, visé G5 ; B neuf, visé G2. Gardé pour le rang 5, B laisse la montée au manque : 3 G1,
  // 4 G2 et 1 G3 sur un A neuf (table seule). Fait d'abord au rang 3 (3 G1 + 4 G2 : au moins 39,8 %), il amène le rang
  // à 99,8 % : il ne manque qu'1 G1 en plus
  const tasks = [{ key: 'A', blueprint: 'A', grades: [4, 5], startUnits: 0 }, { key: 'B', blueprint: 'B', grades: [1, 2], startUnits: 0 }];
  const table = simulateEngineer({ rank: 3, progress: 60 }, tasks, 'prudent', { model: null });
  assert.deepEqual(table.extras.map((x) => [x.rank, gradesOf(x)]), [[3, [[1, 1]]]]);
  assert.deepEqual(table.tasks.get('B').per.map((p) => [p.grade, p.rolls, p.byRank]), [[1, 3, [{ rank: 3, rolls: 3 }]], [2, 4, [{ rank: 3, rolls: 4 }]]]);
  assert.equal(table.tasks.get('B').early, 3);
  assert.equal(table.applications, 3 + 4 + 1 + 5 + 5, '18, pas 21');
  // Pire cas des journaux (prudent du calcul) : 3 G1 et 4 G2 depuis 60 % suffisent déjà (Broo Tarquin, 5 nov.)
  assert.deepEqual(simulateEngineer({ rank: 3, progress: 60 }, tasks, 'prudent').extras, []);
  // Plus cher ainsi (une application de B coûte 10 matériaux, de A 1) : B reste pour le rang 5, et la montée au manque
  const dear = simulateEngineer({ rank: 3, progress: 60 }, tasks, 'prudent', { model: null, unitCost: (bp) => (bp === 'B' ? 10 : 1) });
  assert.deepEqual([dear.tasks.get('B').early, dear.tasks.get('B').per.map((p) => p.rolls), dear.extras[0].count], [null, [1, 2], 8]);
  // Dans le plan : les propulseurs (B) au rang 3, le détail le dit (early), et moins de matériaux qu'avant
  const ref = fakeRef({ A: ALL(['Felicity Farseer']), B: { 1: ['Felicity Farseer'], 2: ['Felicity Farseer'], 3: ['Felicity Farseer'] } });
  const res = planNeeds(ref, {
    modules: [mod('fsd', 'A', 5, { module: 'm', blueprint: 'A', grade: 3, quality: 1 }), mod('thr', 'B', 2)],
    inventory: new Inventory(),
    engineers: new Map([['Felicity Farseer', eng(3, 60)]]),
  });
  const thr = res.modules.find((m) => m.slot === 'thr');
  assert.deepEqual(thr.steps.map((s) => [s.grade, s.rolls, s.early]), [[1, 3, 3], [2, 4, 3]]);
  assert.ok(res.engineers[0].extraCount <= 1, `${res.engineers[0].extraCount} application(s) en plus`);
  assert.ok(res.rolls <= 18, `${res.rolls} applications`);
  assert.deepEqual(res.engineers[0].ups.map((u) => [u.from, u.to, u.slot ?? 'en plus']).slice(0, 1), [[3, 4, 'thr']]);
});

test('calcul : badge « inconnue » seulement si la part inconnue change un compte (déblocage → G5 : 25, à vérifier)', () => {
  const ref = fakeRef({ A: ALL(['Ram Tah']) });
  const plan = (state) => planNeeds(ref, { modules: [mod('x', 'A', 5)], inventory: new Inventory(), engineers: new Map([['Ram Tah', state]]) });
  // Pas encore débloqué (ou rang 1 à 0 %) → G5 : 5 applications par grade dans les deux scénarios ; la part des G3 faits
  // au rang 4 n'y change rien (le rang ne monte qu'une fois pendant le G3, puis le G4)
  for (const [label, state] of [['pas encore débloqué', { progress: 'Invited' }], ['rang 1 à 0 %', eng(1)]]) {
    const res = plan(state);
    assert.deepEqual([res.rolls, res.rollsFavorable, res.modules[0].steps.map((s) => s.rolls)], [25, 25, [5, 5, 5, 5, 5]], label);
    assert.equal(res.engineers[0].status, STATUS.CHECK, label);
    assert.ok(!res.engineers[0].statusWhy.includes(rankRow(4, 1).climb.why), `${label} : la part inconnue n’est pas un motif`);
    assert.ok(res.engineers[0].statusWhy.includes(`progression de rang : ${DEDUCED_WHY}`), label);
  }
  // Pas encore débloqué : le 0 % de départ est à vérifier, et il le dit
  assert.ok(plan({ progress: 'Invited' }).engineers[0].statusWhy.some((w) => /départ après déblocage, rang 1 à 0 % : .*n’écrit pas de progression/.test(w)));
  assert.equal(plan({ progress: 'Invited' }).rules.unlockRank.status, STATUS.MEASURED);
  assert.equal(plan({ progress: 'Invited' }).rules.unlockProgress.status, STATUS.CHECK);
  // Un module en G4 visé G5 au rang 4 : les applications en plus (G1 à G3 sur un module neuf) dépendent de la part
  // inconnue : « inconnue »
  const extra = planNeeds(ref, { modules: [mod('x', 'A', 5, { module: 'm', blueprint: 'A', grade: 4, quality: 1 })], inventory: new Inventory(), engineers: new Map([['Ram Tah', eng(4)]]) });
  assert.equal(extra.engineers[0].status, STATUS.UNKNOWN);
});

test('calcul : une montée d’un rang au milieu d’un grade ne change pas son nombre d’applications (README juste)', () => {
  // k applications au rang r (sur n), puis la suite au rang r + 1 : n − k, donc n en tout (mesuré : G3 commencé au rang
  // 3 et fini au rang 4 : 3 + 2, 2 + 3, 1 + 4) ; repris deux rangs plus haut, il en coûte moins
  for (let r = 1; r <= 4; r++) {
    for (let g = 1; g <= r; g++) {
      const n = rollsFor(r, g);
      for (let k = 1; k < n; k++) {
        assert.equal(k + rollsToFinish(r + 1, g, (60 * k) / n), n, `rang ${r}, G${g}, ${k} avant la montée`);
        if (r <= 3) assert.ok(k + rollsToFinish(r + 2, g, (60 * k) / n) <= n);
      }
    }
  }
  assert.equal(1 + rollsToFinish(5, 3, 12), 4, 'G3 commencé au rang 3, repris au rang 5 : 4 au lieu de 5');
  const readme = fs.readFileSync(new URL('../../../../../docs/ingenierie.md', import.meta.url), 'utf8');
  const flat = readme.replace(/\s+/g, ' ');
  assert.doesNotMatch(flat, /rend la suite de ce grade moins chère/);
  assert.match(flat, /Une montée d'un rang au milieu d'un grade ne change pas son nombre d'applications/);
});

// --- Données de référence réelles : noms d'ingénieurs ---

const ref = loadReference();
const withData = ref ? test : test.skip;

withData('données : chaque ingénieur des modifications porte le nom du journal (FDevIDs) — Tod McQuinn, Felicity Farseer', () => {
  for (const [grp, e] of Object.entries(ref.modMods)) {
    for (const bp of Object.keys(e.blueprints || {})) {
      for (const g of [1, 2, 3, 4, 5]) for (const n of ref.engineersFor(grp, bp, g)) assert.ok(ref.engineerBases.has(n), `${grp} ${bp} G${g} : ${n}`);
    }
  }
  assert.ok(ref.engineersFor('t', 'Engine_Dirty', 1).includes('Felicity Farseer'), 'coquille « Felicty » de coriolis corrigée');
  assert.ok(ref.engineersFor('mc', 'Weapon_Overcharged', 5).includes("Tod 'The Blaster' McQuinn"), 'guillemets de coriolis ramenés à ceux du journal');
  // Le multicanon G5 de Tod McQuinn (rang 5 dans le journal) n'est plus « bloqué »
  const res = planNeeds(ref, {
    modules: [{ slot: 'hp-0', label: 'Multicanon', grp: 'mc', target: { module: 'hpt_multicannon_fixed_medium', blueprint: 'Weapon_Overcharged', grade: 5 }, current: null }],
    inventory: new Inventory(),
    engineers: new Map([["Tod 'The Blaster' McQuinn", eng(5)]]),
  });
  assert.equal(res.modules[0].blocked, false);
  assert.equal(res.modules[0].engineer, "Tod 'The Blaster' McQuinn");
  assert.equal(res.rolls, 15);
});

withData('données : fragmenteur à grande capacité G5, Tod McQuinn (rang 5, G1 à G3) puis Marsha Hicks : moins de matériaux qu’elle seule', () => {
  const TOD = "Tod 'The Blaster' McQuinn";
  assert.deepEqual([1, 2, 3, 4, 5].map((g) => ref.engineersFor('fc', 'Weapon_HighCapacity', g).includes(TOD)), [true, true, true, false, false]);
  const at = (rank) => {
    const res = planNeeds(ref, {
      modules: [{ slot: 'hp-0', label: 'Fragmenteur', grp: 'fc', target: { module: 'hpt_slugshot_fixed_medium', blueprint: 'Weapon_HighCapacity', grade: 5 }, current: null }],
      inventory: new Inventory(),
      engineers: new Map([[TOD, eng(5)], ['Marsha Hicks', eng(rank)]]),
    });
    return { res, units: res.materials.reduce((x, m) => x + m.need, 0), at: res.modules[0].steps.map((s) => (s.status.best.name === TOD ? 'T' : 'M')).join('') };
  };
  // Marsha Hicks au rang 3 : tout chez elle, 56 matériaux et 22 applications ; G1 et G2 chez Tod McQuinn : 50 et 18,
  // sans module de montée (ses G3 la font monter). Au rang 4 : 50 et 19 ; G1 à G3 chez Tod McQuinn : 44 et 16
  const r3 = at(3);
  assert.deepEqual([r3.at, r3.units, r3.res.rolls, r3.res.modules[0].extras.length], ['TTMMM', 50, 18, 0]);
  const r4 = at(4);
  assert.deepEqual([r4.at, r4.units, r4.res.rolls], ['TTTMM', 44, 16]);
});

withData('données : FSD à longue portée G5, Felicity Farseer au rang 4 et Professor Palin au rang 5 : G1 à G3 chez Palin, pas tout chez Felicity', () => {
  // Felicity Farseer fait G1 à G5, Professor Palin G1 à G3. Au rang 4, les G1 à G3 ne font pas monter le rang en
  // prudent : chez elle, ils coûtent 2 + 3 + 4 applications pour rien. Tout chez elle : 19 applications, 50 matériaux ;
  // G1 à G3 chez Palin, G4 et G5 chez elle : 16 et 44
  assert.deepEqual([1, 2, 3, 4, 5].map((g) => ref.engineersFor('fsd', 'FSD_LongRange', g).includes('Professor Palin')), [true, true, true, false, false]);
  assert.ok([1, 2, 3, 4, 5].every((g) => ref.engineersFor('fsd', 'FSD_LongRange', g).includes('Felicity Farseer')));
  const res = planNeeds(ref, {
    modules: [{ slot: 'fsd', label: 'FSD', grp: 'fsd', target: { module: 'int_hyperdrive_size5_class5', blueprint: 'FSD_LongRange', grade: 5 }, current: null }],
    inventory: new Inventory(),
    engineers: new Map([['Felicity Farseer', eng(4)], ['Professor Palin', eng(5)]]),
  });
  assert.deepEqual(res.modules[0].steps.map((s) => [s.grade, s.rolls, s.status.best.name]), [[1, 1, 'Professor Palin'], [2, 2, 'Professor Palin'], [3, 3, 'Professor Palin'], [4, 5, 'Felicity Farseer'], [5, 5, 'Felicity Farseer']]);
  assert.deepEqual([res.rolls, res.materials.reduce((x, m) => x + m.need, 0)], [16, 44]);
});

// --- API ---

let server;
let base;
const journal = Object.assign(new EventEmitter(), { addInterest() {} });

/** Base simulée en mémoire : plans et modules (ce dont le module a besoin, rien de plus). */
function memoryPrisma() {
  const plans = [];
  let planId = 0;
  let moduleId = 0;
  const withModules = (p, include) => (p ? { ...p, ...(include?.modules ? { modules: p.modules.map((m) => ({ ...m })) } : {}) } : null);
  const newModule = (planIdOf, m) => ({ id: ++moduleId, planId: planIdOf, module: null, blueprint: null, grade: 0, experimental: null, currentModule: null, currentBlueprint: null, currentGrade: 0, currentQuality: 0, currentExperimental: null, ...m });
  const strip = ({ modules, ...p }) => p;
  return {
    $transaction: async () => [],
    materialInventory: { deleteMany: () => ({}), createMany: () => ({}) },
    referenceData: { upsert: async () => ({}) },
    engineeringPlan: {
      findFirst: async ({ where }) => { const p = plans.find((x) => x.shipId === where.shipId); return p ? strip(p) : null; },
      findUnique: async ({ where, include }) => withModules(plans.find((x) => x.id === where.id), include),
      findMany: async () => plans.map(strip),
      create: async ({ data }) => {
        const { modules, ...rest } = data;
        const p = { id: ++planId, selected: true, createdAt: new Date(), updatedAt: new Date(), shipId: null, ...rest, modules: [] };
        p.modules = (modules?.create || []).map((m) => newModule(p.id, m));
        plans.push(p);
        return strip(p);
      },
      update: async ({ where, data }) => { const p = plans.find((x) => x.id === where.id); Object.assign(p, data); return strip(p); },
      delete: async ({ where }) => { plans.splice(plans.findIndex((x) => x.id === where.id), 1); return {}; },
    },
    planModule: {
      upsert: async ({ where, create, update }) => {
        const p = plans.find((x) => x.id === where.planId_slot.planId);
        const m = p.modules.find((x) => x.slot === where.planId_slot.slot);
        if (m) Object.assign(m, update);
        else p.modules.push(newModule(p.id, create));
        return {};
      },
      deleteMany: async ({ where }) => { const p = plans.find((x) => x.id === where.planId); if (p) p.modules = []; return {}; },
      createMany: async ({ data }) => { for (const m of data) plans.find((x) => x.id === m.planId).modules.push(newModule(m.planId, m)); return {}; },
    },
  };
}

before(async () => {
  if (!ref) return;
  const app = express();
  app.use(express.json());
  const router = express.Router();
  await engineering.register({ router, journal, prisma: memoryPrisma(), broadcast: () => {} });
  app.use('/api/modules/engineering', router);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api/modules/engineering`;
});
after(() => {
  if (!server) return;
  server.closeAllConnections();
  server.close();
});

const call = async (method, path, body) => {
  const r = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Elite-Compagnon': '1' }, body: body ? JSON.stringify(body) : undefined });
  assert.ok(r.ok, `${method} ${path} : ${r.status} ${await r.clone().text()}`);
  return r.json();
};

withData('API : GET /ranks donne la table, les mesures et les séquences, et suit les nouvelles applications', async () => {
  const shop = Number(ref.engineerBases.get(ENG).marketId);
  const history = unlockSequence().map((e) => (e.event === 'Docked' ? { ...e, MarketID: shop } : e));
  journal.emit('ready', { history });
  const rules = await call('GET', '/ranks/rules');
  assert.equal(rules.table.length, 15);
  assert.equal(rules.general.REMOTE_RANK_GAIN.value, 0);
  assert.equal(rules.table.find((x) => x.rank === 3 && x.grade === 3).finish.value, 5);
  // Ce que la vigie des règles relira pour comparer : la période des mesures et la source de 18.08
  assert.deepEqual(rules.period, { first: '2026-10-24', last: '2026-11-05', applications: 808 });
  assert.equal(rules.update.name, '18.08');
  assert.deepEqual([rules.general.PROGRESS_AT_LOAD_ONLY.observations, rules.general.PROGRESS_AT_LOAD_ONLY.counts], [71, { full: 52, single: 19 }]);
  const r1 = await call('GET', '/ranks');
  assert.equal(r1.measures.find((m) => m.rank === 1 && m.grade === 1).rolls, 5);
  assert.equal(r1.measures.find((m) => m.rank === 1 && m.grade === 1).places.atelier, 3);
  assert.equal(r1.sequences.length, 3);
  assert.deepEqual(r1.engineers.map((e) => [e.name, e.rank]), [[ENG, 3]]);
  // Nouvelle application en direct : ses mesures s'ajoutent
  journal.emit('event', craft(20, 3, 0.2));
  const r2 = await call('GET', '/ranks');
  assert.equal(r2.measures.find((m) => m.rank === 3 && m.grade === 3).informative, 1);
  assert.equal(r2.applications, r1.applications + 1);
  // Montées lues, par rang, à côté de la table : déblocage → rang 2 par 3 G1, rang 2 → 3 par 2 G1 et 3 G2
  assert.deepEqual(r2.climbs.map((c) => [c.rank, c.toRank, c.start.kind, c.grades.map((g) => [g.grade, g.atelier]), c.count, c.ok]), [
    [1, 2, 'déblocage', [[1, 3]]],
    [2, 3, 'montée', [[1, 2], [2, 3]]],
  ].map((x) => [...x, 1, true]));
  assert.deepEqual([r2.rerolls, r2.unreadable], [[], 0]);
  // Le G3 fini, puis refait en direct : signalé à côté de la règle, et dans les écarts à relire
  journal.emit('event', craft(21, 3, 0.4));
  journal.emit('event', craft(22, 3, 0.6));
  journal.emit('event', craft(23, 3, 0.8));
  journal.emit('event', craft(24, 3, 1));
  journal.emit('event', craft(25, 3, 1));
  const r3 = await call('GET', '/ranks');
  assert.deepEqual(r3.rerolls.map((x) => [x.rank, x.grade, x.at]), [[3, 3, t(25)]]);
  assert.equal(r3.contradictions.filter((c) => c.kind === 'règle').length, 1);
});

withData('API : GET /ranks répond même avec des valeurs que le jeu n’écrit pas (nom d’ingénieur numérique, rang 9, qualité 7)', async () => {
  journal.emit('ready', {
    history: [
      { timestamp: t(0), event: 'EngineerProgress', Engineers: [{ Engineer: 42, Progress: 'Unlocked', Rank: 3, RankProgress: 0 }, { Engineer: ENG, EngineerID: 300270, Progress: 'Unlocked', Rank: 3, RankProgress: 1e12 }, { Engineer: 'Liz Ryder', Progress: 'Unlocked', Rank: 9 }] },
      { ...craft(1, 1, 0.3333), Engineer: 42 },
      craft(2, 1, 7),
    ],
  });
  const v = await call('GET', '/ranks');
  assert.deepEqual([v.engineers.map((e) => e.name), v.unreadable, v.contradictions], [[ENG], 2, []]);
  assert.deepEqual(v.measures.map((m) => [m.rank, m.grade, m.informative]), [[3, 1, 0]]);
});

withData('API : un vrai plan et le Dashboard tiennent compte du rang lu dans le journal, montée partagée entre plans', async () => {
  // Deux Cobra Mk III, chacune avec un lance-missiles déjà en Weapon_HighCapacity G3 (100 %) ; Liz Ryder au rang 3,
  // relevée à 49 % ; Petra Olmanova (l'autre ingénieure des G4 et G5) pas débloquée
  const LIZ = 'Liz Ryder';
  const rack = { Slot: 'MediumHardpoint1', Item: 'hpt_dumbfiremissilerack_fixed_medium', On: true, Priority: 0, Health: 1, Engineering: { Engineer: LIZ, EngineerID: 300080, BlueprintName: 'Weapon_HighCapacity', Level: 3, Quality: 1 } };
  const loadout = (n, shipId) => ({ timestamp: t(n), event: 'Loadout', Ship: 'cobramkiii', ShipID: shipId, ShipName: '', ShipIdent: '', Modules: [rack] });
  journal.emit('ready', {
    history: [
      loadout(0, 21),
      loadout(1, 22),
      { timestamp: t(2), event: 'EngineerProgress', Engineers: [{ Engineer: LIZ, EngineerID: 300080, Progress: 'Unlocked', Rank: 3, RankProgress: 49 }] },
    ],
  });
  const plan = async (shipId) => {
    const p = await call('POST', '/plans', { shipId });
    const slot = (await call('GET', `/plans/${p.id}`)).slots.find((s) => s.current?.module === rack.Item).key;
    return { id: p.id, slot, view: await call('PUT', `/plans/${p.id}/modules/${slot}`, { grade: 5 }) };
  };
  const a = await plan(21);
  const b = await plan(22);
  const c = a.view.calc;
  const m = c.modules.find((x) => x.slot === a.slot);
  assert.equal(m.engineer, LIZ);
  assert.deepEqual(m.extras.map((x) => [x.rank, x.kind, x.grades.map((y) => [y.grade, y.count])]), [[3, 'module neuf', [[1, 3], [2, 4], [3, 1]]]], '3 G1 + 4 G2 + 1 G3 depuis 49 %, sur un module neuf');
  const liz = c.engineers.find((e) => e.name === LIZ);
  assert.deepEqual([liz.rank, liz.progress.min, liz.progress.known], [3, 49, 'relevé'], 'progression lue dans le journal, pas 0 %');
  const extra = Object.fromEntries(c.rankExtra.materials.map((x) => [x.key, x.extra]));
  assert.deepEqual([extra.mechanicalscrap, extra.vanadium, extra.niobium], [8, 5, 1]);
  assert.equal(c.rankExtra.rolls, 9, '8 applications de montée + 1 G4 de plus au rang 4');
  // Dashboard : les deux plans chez Liz Ryder ; une seule montée
  assert.equal(b.view.calc.rankExtra.rolls, 9);
  const d = await call('GET', '/dashboard');
  assert.equal(d.perPlan.length, 2);
  assert.equal(d.global.rankExtra.rolls, 9, 'montée comptée une fois, pas 18');
  assert.equal(d.global.materials.find((x) => x.key === 'mechanicalscrap').need, 8);
  assert.deepEqual(d.global.engineers.map((e) => [e.name, e.rank, e.progress.min]), [[LIZ, 3, 49]]);
  // Ce qu'il faut au Dashboard pour la fourchette et le badge (mêmes champs que le plan)
  const dl = d.global.engineers[0];
  assert.deepEqual([dl.status, dl.extraCount, dl.extraCountFavorable < dl.extraCount, dl.extraFavorableReroll], [STATUS.CHECK, 8, true, true]);
});

withData('API : Dashboard, un ingénieur débloqué de rang inconnu reste listé (ses applications en plus sont dans le total)', async () => {
  for (const p of await call('GET', '/plans')) await call('DELETE', `/plans/${p.id}`);
  // Liz Ryder débloquée, rang absent du relevé : compté prudemment au rang 1 (0 %), favorablement au rang 5
  const LIZ = 'Liz Ryder';
  const rack = { Slot: 'MediumHardpoint1', Item: 'hpt_dumbfiremissilerack_fixed_medium', On: true, Priority: 0, Health: 1, Engineering: { Engineer: LIZ, EngineerID: 300080, BlueprintName: 'Weapon_HighCapacity', Level: 3, Quality: 1 } };
  journal.emit('ready', {
    history: [
      { timestamp: t(0), event: 'Loadout', Ship: 'cobramkiii', ShipID: 31, ShipName: '', ShipIdent: '', Modules: [rack] },
      { timestamp: t(1), event: 'EngineerProgress', Engineers: [{ Engineer: LIZ, EngineerID: 300080, Progress: 'Unlocked' }] },
    ],
  });
  const p = await call('POST', '/plans', { shipId: 31 });
  const slot = (await call('GET', `/plans/${p.id}`)).slots.find((s) => s.current?.module === rack.Item).key;
  const c = (await call('PUT', `/plans/${p.id}/modules/${slot}`, { grade: 5 })).calc;
  const liz = c.engineers.find((e) => e.name === LIZ);
  assert.deepEqual([liz.rank, liz.rankKnown, liz.status], [null, false, STATUS.UNKNOWN]);
  // Prudent, rang 1 → 4 sur un module neuf : 3 G1 ; 2 G1 + 3 G2 ; 2 G2 + 4 G3 (14), puis 1 G4 de plus au rang 4 ;
  // favorable : déjà au rang 5, rien en plus
  assert.deepEqual(liz.extras.map((x) => [x.rank, gradesOf(x)]), [[1, [[1, 3]]], [2, [[1, 2], [2, 3]]], [3, [[2, 2], [3, 4]]]]);
  assert.deepEqual([c.rankExtra.rolls, c.rankExtra.rollsFavorable], [15, 0], 'fourchette : 0 à 15 applications en plus');
  const d = await call('GET', '/dashboard');
  assert.deepEqual([d.global.rankExtra.rolls, d.global.rankExtra.rollsFavorable], [15, 0]);
  assert.deepEqual(d.global.engineers.map((e) => [e.name, e.rank, e.status]), [[LIZ, null, STATUS.UNKNOWN]], 'listé : « rang inconnu », badge « inconnue »');
});

// --- Service : lieu des applications ---

withData('service : un amarrage, un décollage ou un chargement ne reconstruit ni ne diffuse rien ; la prochaine application lit le lieu', () => {
  const j = Object.assign(new EventEmitter(), { addInterest() {} });
  const sent = [];
  const s = new EngineeringService({ prisma: memoryPrisma(), journal: j, broadcast: (name) => sent.push(name) });
  let rebuilds = 0;
  let notifies = 0;
  const rebuild = s.rebuild.bind(s);
  const notify = s.notify.bind(s);
  s.rebuild = () => { rebuilds++; rebuild(); };
  s.notify = () => { notifies++; notify(); };
  try {
    const shop = Number(ref.engineerBases.get(ENG).marketId);
    // Un Docked tel que le jeu l'écrit : factions, services… dont le calcul n'a pas besoin
    const fullDocked = (n, market) => ({ ...docked(n, market), StationType: 'Coriolis', StarSystem: 'Système', SystemAddress: 1, StationFaction: { Name: 'Faction' }, StationServices: ['dock', 'engineer'], StationEconomies: [{ Name: '$economy_HighTech;', Proportion: 1 }], DistFromStarLS: 12.5 });
    j.emit('ready', { history: [snapshot(0, 3, 0), fullDocked(1, shop)] });
    assert.deepEqual([rebuilds, notifies], [1, 1], 'chargement de l’historique : une reconstruction, une diffusion');
    // Copie réduite dès l'historique : ni factions, ni économies, ni la liste des services ; seulement ce que lisent le
    // lieu des applications et l'hôte (R8 : nom et type de la station, système, trois services ; itinéraire, feat/16)
    const SHOP_COPY = { StationName: 'Station', StationType: 'Coriolis', StarSystem: 'Système', SystemAddress: 1, services: { engineer: true, outfitting: false, shipyard: false } };
    assert.deepEqual(s.rankEvents.at(-1), { event: 'Docked', timestamp: t(1), MarketID: shop, ...SHOP_COPY }, 'copie réduite dès l’historique');
    rebuilds = 0;
    notifies = 0;
    j.emit('event', { timestamp: t(2), event: 'Undocked', StationName: 'Station', StationType: 'Coriolis', MarketID: shop });
    j.emit('event', { timestamp: t(3), event: 'Location', Docked: true, MarketID: AWAY, StarSystem: 'Ailleurs', Factions: [{ Name: 'Faction' }] });
    j.emit('event', fullDocked(4, shop));
    assert.deepEqual([rebuilds, notifies], [0, 0], 'rien de ce qu’affichent les pages ne change');
    assert.deepEqual(s.rankEvents.slice(-3), [
      { event: 'Undocked', timestamp: t(2), MarketID: shop, StationName: 'Station', StationType: 'Coriolis' },
      { event: 'Location', timestamp: t(3), MarketID: AWAY, Docked: true, StarSystem: 'Ailleurs' },
      { event: 'Docked', timestamp: t(4), MarketID: shop, ...SHOP_COPY },
    ]);
    // La prochaine application, elle, reconstruit, diffuse, et sait qu'elle est faite à l'atelier
    j.emit('event', { ...craft(5, 1, 0.3333), Engineer: ENG });
    assert.deepEqual([rebuilds, notifies], [1, 1]);
    assert.equal(s.ranks.applications.at(-1).place, 'atelier');
    // Location amarré ailleurs, puis une application : à distance
    j.emit('event', { timestamp: t(6), event: 'Location', Docked: true, MarketID: AWAY });
    j.emit('event', craft(7, 1, 0.6666));
    assert.equal(s.ranks.applications.at(-1).place, 'distance');
  } finally {
    clearTimeout(s.notifyTimer);
  }
});
