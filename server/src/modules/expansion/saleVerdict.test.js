// Tests des verdicts Powerplay d'un lot vendu : mode de la vente, règles de lieu, portée, marge, rares.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describePlace, distanceLy, labelOf, lotVerdict, modeAt, STATE_LABELS } from './saleVerdict.js';

const AD = 'Aisling Duval';
const place = (system, power, state, starPos = [0, 0, 0], powers = power ? [power] : []) => ({ system, power, state, powers, starPos });
const mined = (p) => ({ kind: 'mined', system: p.system, place: p });

const target = place('Cible', null, 'Unoccupied', [0, 0, 0], [AD]);
const fortress = place('Fort', AD, 'Stronghold', [29, 0, 0]);
const far = place('Loin', AD, 'Stronghold', [31, 0, 0]);
const consolidated = place('Conso', AD, 'Fortified', [19, 0, 0]);
const consolidatedFar = place('ConsoLoin', AD, 'Fortified', [25, 0, 0]);
const enemy = place('Vequess', 'A. Lavigny-Duval', 'Stronghold');
const empty = place('HIP 8060', null, null, [0, 0, 0], []);

test('mode : renforcement, acquisition, ennemi, sans puissance, sans engagement', () => {
  assert.equal(modeAt(fortress, AD), 'reinforcement');
  assert.equal(modeAt(target, AD), 'acquisition');
  assert.equal(modeAt(enemy, AD), 'enemy');
  assert.equal(modeAt(empty, AD), 'empty');
  assert.equal(modeAt(place('X', null, 'Unoccupied', [0, 0, 0], ['Yuri Grom']), AD), 'empty');
  assert.equal(modeAt(fortress, null), 'unpledged');
  assert.equal(modeAt({ system: 'X', unknown: true }, AD), null);
});

test('acquisition : minerai d\'une Forteresse à 30 AL, d\'un Consolidé à 20 AL', () => {
  assert.equal(lotVerdict(mined(fortress), target, AD).ok, true);
  assert.equal(lotVerdict(mined(consolidated), target, AD).ok, true);
  const tooFar = lotVerdict(mined(far), target, AD);
  // Portée publiée, jamais mesurée : « on ne sait pas », jamais présenté comme sûr (audit du 9 nov. 2026)
  assert.deepEqual([tooFar.ok, tooFar.cause, tooFar.unverified], [null, 'acq-out-of-range', true]);
  assert.match(tooFar.text, /31 AL : la portée d'un système Forteresse serait de 30 AL \(règle publiée, jamais mesurée : à vérifier\)/);
  assert.equal(lotVerdict(mined(consolidatedFar), target, AD).cause, 'acq-out-of-range');
});

test('acquisition : minerai d\'un système inoccupé ou ennemi, 0 (mesuré) ; d\'un Exploité de ta puissance, à vérifier', () => {
  for (const src of [target, enemy]) {
    const v = lotVerdict(mined(src), target, AD);
    assert.deepEqual([v.ok, v.cause, v.unverified], [false, 'acq-mined-unsupported', undefined]);
  }
  const exploite = lotVerdict(mined(place('E', AD, 'Exploited')), target, AD);
  assert.deepEqual([exploite.ok, exploite.cause, exploite.unverified], [null, 'acq-mined-unsupported', true]);
  assert.match(exploite.text, /règle publiée, jamais mesurée : à vérifier/);
});

test('acquisition : commerce sous 40 % de bénéfice, 0 probable (règle à vérifier)', () => {
  const lot = { kind: 'bought', system: 'Fort', place: fortress, buyPrice: 1000 };
  assert.equal(lotVerdict(lot, target, AD, 1500).ok, true);
  const v = lotVerdict(lot, target, AD, 1300);
  assert.deepEqual([v.ok, v.cause], [false, 'acq-low-margin']);
  assert.match(v.text, /30 %/);
});

test('acquisition : « compte » d’après une règle jamais vue créditée, marqué à vérifier ; règles mesurées : non', () => {
  for (const lot of [mined(fortress), mined(consolidated), { kind: 'bought', system: 'Fort', place: fortress, buyPrice: 1000 }]) {
    const v = lotVerdict(lot, target, AD, 1500);
    assert.deepEqual([v.ok, v.unverified], [true, true]);
    assert.match(v.text, /jamais vue créditée \(à vérifier\)/);
  }
  // Cas positifs déjà vus dans les journaux (saleRules.js) : pas de réserve
  for (const [lot, here] of [[mined(fortress), fortress], [{ kind: 'bought', system: 'Cemiess', place: enemy }, fortress], [{ kind: 'rare', system: 'Ngurii', place: enemy }, target], [{ kind: 'rare', system: 'Ngurii', place: enemy }, fortress]]) {
    const v = lotVerdict(lot, here, AD);
    assert.equal(v.ok, true);
    assert.equal(v.unverified, undefined, v.text);
  }
});

test('renforcement : minerai miné sur place seulement ; achat accepté', () => {
  assert.equal(lotVerdict(mined(fortress), fortress, AD).ok, true);
  const v = lotVerdict(mined(consolidated), fortress, AD);
  assert.deepEqual([v.ok, v.cause], [false, 'reinf-mined-elsewhere']);
  assert.equal(lotVerdict({ kind: 'bought', system: 'Cemiess', place: enemy }, fortress, AD).ok, true);
});

test('ennemi ou sans puissance : 0 ; minerai miné dans ce système ennemi : sabotage incertain', () => {
  assert.equal(lotVerdict(mined(fortress), enemy, AD).cause, 'enemy');
  const here = lotVerdict(mined(enemy), enemy, AD);
  assert.deepEqual([here.ok, here.cause], [null, 'undermining']);
  assert.equal(lotVerdict(mined(fortress), empty, AD).cause, 'empty');
});

test('rares : ailleurs que le système d\'achat ; inconnu et ramassé restent incertains ; porteur signalé', () => {
  assert.equal(lotVerdict({ kind: 'rare', system: 'Ngurii', place: enemy }, target, AD).ok, true);
  assert.equal(lotVerdict({ kind: 'rare', system: 'Cible', place: target }, target, AD).cause, 'rare-same-system');
  assert.equal(lotVerdict({ kind: 'unknown' }, target, AD).ok, null);
  assert.equal(lotVerdict({ kind: 'collected', system: 'Cible' }, target, AD).ok, null);
  assert.match(lotVerdict({ ...mined(fortress), viaCarrier: true }, fortress, AD).text, /porteur/);
});

test('textes : état d\'un système et distance', () => {
  assert.equal(describePlace(fortress), "Forteresse d'Aisling Duval");
  assert.equal(describePlace(place('R', 'Jerome Archer', 'Exploited')), 'Exploité de Jerome Archer');
  assert.equal(describePlace(target), 'Inoccupé');
  assert.equal(describePlace(empty), 'sans puissance');
  assert.equal(distanceLy(fortress, target), 29);
  assert.equal(distanceLy({ starPos: null }, target), null);
});

test('libellés : seulement les clés propres aux tables, jamais un nom hérité d\'Object', () => {
  assert.equal(labelOf(STATE_LABELS, 'Stronghold'), 'Forteresse');
  assert.equal(labelOf(STATE_LABELS, 'constructor'), null);
  assert.equal(labelOf(STATE_LABELS, null), null);
  assert.equal(describePlace(place('R', null, 'toString')), 'toString');
  assert.equal(describePlace(place('R', 'X', 'constructor')), 'constructor de X');
});
