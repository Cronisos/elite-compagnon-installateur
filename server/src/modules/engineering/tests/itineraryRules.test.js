// Table des règles de l'itinéraire : statuts cohérents avec les observations, motifs, renvois vers la table des rangs
// (rien de recopié), et phrases pour l'escadron (« journaux de référence », jamais « tes journaux »).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITINERARY_RULES, RULES_BY_ID, STATUS, MEASURED_MIN, SIGNALE, weakestRule, PROGRESS_STATES, ROUTE_SETTINGS, JOURNAUX_ITIN } from '../services/itineraryRules.js';
import { RANK_RULES, STATUS as RANK_STATUS } from '../services/rankRules.js';

test('règles : identifiants uniques, chaque ligne de jeu a un statut connu, les règles de l’app et réglages n’en ont pas', () => {
  assert.equal(RULES_BY_ID.size, ITINERARY_RULES.length);
  for (const r of ITINERARY_RULES) {
    assert.ok(['jeu', 'app', 'réglage', 'jeu + app'].includes(r.kind), r.id);
    assert.ok(r.text && r.source && r.check, r.id);
    if (r.kind === 'app' || r.kind === 'réglage') assert.equal(r.status, undefined, r.id);
    else assert.ok(Object.values(STATUS).includes(r.status), r.id);
  }
  for (const id of ['R1', 'R2a', 'R2b', 'R2c', 'R2d', 'R3a', 'R3b', 'R3c', 'R3d', 'R3e', 'R3f', 'R3g', 'R4a', 'R4b', 'R5a', 'R5b', 'R5c', 'R6a', 'R6b', 'R6c', 'R7a', 'R7b', 'R7c', 'R8a', 'R8b', 'R9', 'R10', 'R11', 'R12', 'R12b', 'R13', 'R14', 'R15', 'R16', 'R16b', 'R17', 'W']) {
    assert.ok(RULES_BY_ID.has(id), id);
  }
});

test('règles : statut cohérent avec les observations (MEASURED_MIN), motif hors « mesurée »', () => {
  for (const r of ITINERARY_RULES) {
    if (!r.status) continue;
    if (r.status === STATUS.MEASURED) {
      // Mesurée : au moins MEASURED_MIN observations, ou au moins une observation confirmée par une source publique
      assert.ok(r.observations >= MEASURED_MIN || (r.observations >= 1 && r.basis.includes('wiki')), `${r.id} : ${r.observations}`);
    } else {
      assert.ok(r.why, `${r.id} : motif manquant`);
      if (r.status === STATUS.CHECK) assert.ok(r.observations == null || r.observations < MEASURED_MIN || !r.basis.every((b) => b === 'journaux') || r.id === 'R13', r.id);
    }
  }
  // Dites par l’auteur, à vérifier
  for (const id of ['R5b', 'R5c', 'R6c']) {
    assert.equal(RULES_BY_ID.get(id).also, SIGNALE, id);
    assert.equal(RULES_BY_ID.get(id).status, STATUS.CHECK, id);
  }
  assert.equal(RULES_BY_ID.get('R5a').observations, 8);
  assert.equal(RULES_BY_ID.get('R6b').observations, 164);
  assert.match(RULES_BY_ID.get('R6b').source, /61 chez un autre ingénieur/);
  assert.equal(RULES_BY_ID.get('R12b').observations, 0);
  assert.equal(RULES_BY_ID.get('R17').observations, 3);
  assert.equal(PROGRESS_STATES.Acquainted.status, STATUS.CHECK);
  assert.equal(RULES_BY_ID.get('R15').status, STATUS.CHECK);
});

test('règles : R1, R4b et R7a renvoient à rankRules (rien de recopié)', () => {
  assert.equal(RULES_BY_ID.get('R1').ref.file, 'rankRules.js');
  assert.equal(RULES_BY_ID.get('R1').value, null, 'la valeur de R1 reste dans RANK_TABLE');
  assert.equal(RULES_BY_ID.get('R4b').status, RANK_RULES.REMOTE_RANK_GAIN.status);
  assert.equal(RULES_BY_ID.get('R4b').observations, RANK_RULES.REMOTE_RANK_GAIN.observations);
  assert.equal(RULES_BY_ID.get('R7a').status, RANK_RULES.NEW_BLUEPRINT_RESTARTS.status);
  assert.equal(RULES_BY_ID.get('R7a').observations, RANK_RULES.NEW_BLUEPRINT_RESTARTS.observations);
  assert.equal(STATUS.MEASURED, RANK_STATUS.MEASURED);
});

test('weakestRule : inconnue < à vérifier < publiée < mesurée', () => {
  assert.equal(weakestRule(), STATUS.MEASURED);
  assert.equal(weakestRule(STATUS.MEASURED, STATUS.PUBLISHED), STATUS.PUBLISHED);
  assert.equal(weakestRule([STATUS.PUBLISHED, STATUS.CHECK]), STATUS.CHECK);
  assert.equal(weakestRule(STATUS.CHECK, STATUS.UNKNOWN, STATUS.MEASURED), STATUS.UNKNOWN);
});

test('phrases : une règle tirée des journaux dit « journaux de référence », jamais « tes journaux » ni « que tu as visité »', () => {
  for (const r of ITINERARY_RULES) {
    for (const t of [r.text, r.source, r.why || '', r.check]) {
      assert.doesNotMatch(t, /tes journaux/i, r.id);
      assert.doesNotMatch(t, /que tu as visit/i, r.id);
    }
    if (r.basis.includes('journaux') && !r.ref) assert.match(r.source, /journaux de référence/, r.id);
  }
  assert.match(JOURNAUX_ITIN, /^journaux de référence/);
  assert.deepEqual(Object.keys(ROUTE_SETTINGS).sort(), ['EXACT_MAX_CANDIDATES', 'MAX_EVALUATIONS', 'MAX_EXCLUDE', 'MAX_PLANS', 'MAX_REFERRAL_DEPTH', 'REFERRAL_PROGRESS', 'ROLL_AL', 'SHIP_SWAP_AL', 'STOP_AL', 'SUPERCRUISE_FACTOR', 'WHY_MAX_OPTIONS'].sort());
  assert.ok(Object.isFrozen(ITINERARY_RULES) && Object.isFrozen(ITINERARY_RULES[0]));
});
