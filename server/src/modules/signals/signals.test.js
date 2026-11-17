// Tests du module Signaux : tri des signaux (exemples réels des journaux de référence), regroupement, expiration.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSignals, classify } from './state.js';

const ADDR = 633943823090;
const jump = { event: 'FSDJump', timestamp: '2026-11-04T20:00:00Z', StarSystem: 'Synuefe OU-E c28-2', SystemAddress: ADDR };
const sig = (fields) => ({ event: 'FSSSignalDiscovered', timestamp: '2026-11-04T20:00:05Z', SystemAddress: ADDR, ...fields });

test('stations, porteurs et balises ignorés ; zones de conflit et sites gardés', () => {
  assert.equal(classify(sig({ SignalName: 'PORTEUR FICTIF ZQX-7W2', SignalType: 'FleetCarrier', IsStation: true })), null);
  assert.equal(classify(sig({ SignalName: '$MULTIPLAYER_SCENARIO42_TITLE;', SignalName_Localised: 'Balise de navigation', SignalType: 'NavBeacon' })), null);
  assert.equal(classify(sig({ SignalName: 'Rivers Depot', SignalType: 'StationAsteroid', IsStation: true })), null);
  assert.equal(classify(sig({ SignalName_Localised: 'Zone de conflit [forte intensité]', SignalType: 'Combat' })).group, 'combat');
  assert.equal(classify(sig({ SignalName_Localised: 'Dépôt de cargaison compromis', SignalType: 'Generic' })).group, 'site');
});

test('source non identifiée : affichée par son type, avec sa menace et son expiration', () => {
  const s = classify(sig({
    SignalName_Localised: 'Source du signal non identifiée', SignalType: 'USS', USSType: '$USS_Type_Salvage;',
    USSType_Localised: 'Émissions de mauvaise qualité', ThreatLevel: 0, TimeRemaining: 600,
  }));
  assert.deepEqual(s, { group: 'uss', label: 'Émissions de mauvaise qualité', threat: 0, expires: '2026-11-04T20:10:05.000Z' });
});

test('regroupés par type, expirés retirés, remis à zéro au saut suivant', () => {
  const uss = { SignalName_Localised: 'Source', SignalType: 'USS', USSType_Localised: 'Émissions de mauvaise qualité', ThreatLevel: 0 };
  const s = buildSignals([
    jump,
    sig({ ...uss, TimeRemaining: 600 }),
    sig({ ...uss, TimeRemaining: 900 }),
    sig({ ...uss, USSType_Localised: 'Émissions encodées', TimeRemaining: 60 }),
    sig({ SignalName_Localised: "Site d'extraction de ressources [Danger]", SignalType: 'ResourceExtraction' }),
  ]);
  const at = Date.parse('2026-11-04T20:05:00Z');
  const sum = s.summary(at);
  assert.equal(sum.count, 3);
  assert.deepEqual(sum.groups.map((g) => g.group), ['uss', 'res']);
  assert.equal(sum.groups[0].items[0].count, 2);
  s.apply({ ...jump, StarSystem: 'Ailleurs', SystemAddress: 1 });
  assert.equal(s.summary(at).count, 0);
});

test('signal d\'un autre système : ignoré', () => {
  const s = buildSignals([jump, sig({ SystemAddress: 999, SignalName_Localised: 'Zone', SignalType: 'Combat' })]);
  assert.equal(s.summary().count, 0);
});
