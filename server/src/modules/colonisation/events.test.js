// Tests de lecture des événements de colonisation, sur les exemples documentés (fixtures/examples.js) :
// pas de vrai journal de colonisation de l’auteur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isConstructionStation, parseStationName, readContext, readEvent, symbolOf } from './events.js';
import { BEACON, CLAIM, COMPLETE_CONSTRUCTION, CONTRIBUTION, DEPOT, DOCKED_SHIP, RELEASE, SETTLEMENT_WITH_SERVICE } from './fixtures/examples.js';

test('symbole : dépôt en minuscules, livraison en PascalCase et Cargo.json donnent le même', () => {
  assert.equal(symbolOf('$cmmcomposite_name;'), 'cmmcomposite');
  assert.equal(symbolOf('$CMMComposite_name;'), 'cmmcomposite');
  assert.equal(symbolOf('cmmcomposite'), 'cmmcomposite');
  assert.equal(symbolOf('$LiquidOxygen_name;'), 'liquidoxygen');
  assert.equal(symbolOf('hesuits'), 'hazardousenvironmentsuits'); // alias connu (EDCT)
  for (const bad of [null, undefined, 42, {}, '', '$_name;']) assert.equal(symbolOf(bad), null);
});

test('dépôt : instantané complet de l’exemple EDDI', () => {
  const d = readEvent(DEPOT);
  assert.equal(d.type, 'depot');
  assert.equal(d.at, '2025-04-08T23:47:39Z');
  assert.equal(d.marketId, 3951663874);
  assert.equal(d.progress, 0.033023);
  assert.equal(d.complete, false);
  assert.equal(d.failed, false);
  assert.equal(d.resources.length, 19);
  const steel = d.resources.find((r) => r.symbol === 'steel');
  assert.deepEqual(steel, { symbol: 'steel', rawName: '$steel_name;', name: 'Steel', required: 6680, provided: 720, payment: 5057 });
  assert.equal(d.resources.find((r) => r.symbol === 'liquidoxygen').name, 'Liquid oxygen');
  assert.deepEqual(d.issues, []);
});

test('livraison, revendication, abandon, balise : exemples documentés lus sans écart', () => {
  const c = readEvent(CONTRIBUTION);
  assert.equal(c.type, 'contribution');
  assert.equal(c.marketId, 3950995714);
  assert.deepEqual(c.items.map((i) => [i.symbol, i.amount]), [['ceramiccomposites', 513], ['insulatingmembrane', 263], ['liquidoxygen', 8]]);
  assert.deepEqual(c.issues, []);
  assert.deepEqual(readEvent(CLAIM), { type: 'claim', system: 'North America Sector PI-T c3-4', systemAddress: 1180210008826, event: CLAIM.event, at: CLAIM.timestamp, issues: [] });
  assert.equal(readEvent(RELEASE).type, 'release');
  assert.deepEqual(readEvent(BEACON), { type: 'beacon', event: BEACON.event, at: BEACON.timestamp, issues: [] });
  assert.equal(readEvent(COMPLETE_CONSTRUCTION).type, 'complete');
});

test('tolérance : champ absent → null, champ inconnu ou mal typé noté, jamais d’exception', () => {
  const d = readEvent({ timestamp: '2026-01-01T00:00:00Z', event: 'ColonisationConstructionDepot', MarketID: '123', ConstructionProgress: 'x', Nouveau: 1,
    ResourcesRequired: [{ Name: '$steel_name;', RequiredAmount: 10, ProvidedAmount: 2.5, Payment: 1, Bonus: 3 }, 'texte', { Name: 7 }] });
  assert.equal(d.marketId, null);
  assert.equal(d.progress, null);
  assert.equal(d.complete, null);
  assert.equal(d.resources.length, 1);
  assert.equal(d.resources[0].provided, null); // pas un entier
  assert.equal(d.resources[0].name, 'Steel'); // Name_Localised absent : le nom interne rendu lisible (core/text.js)
  assert.equal(d.resources[0].symbol, 'steel');
  const paths = d.issues.map((i) => `${i.kind}:${i.path}`);
  for (const p of ['unexpected:Nouveau', 'missing:ConstructionComplete', 'type:MarketID', 'type:ConstructionProgress', 'unexpected:ResourcesRequired[].Bonus', 'type:ResourcesRequired[]', 'type:ResourcesRequired[].ProvidedAmount']) {
    assert.ok(paths.includes(p), `${p} attendu dans ${paths.join(', ')}`);
  }
  // Lignes absurdes : null ou une forme vide, sans lever d'exception
  for (const ev of [null, [], 'x', {}, { event: 'constructor' }, { event: 'toString' }, { event: '__proto__' }, { event: 'Docked' }]) assert.equal(readEvent(ev), null);
  const odd = readEvent(JSON.parse('{"event":"ColonisationContribution","MarketID":5,"Contributions":[{"__proto__":{"x":1},"Name":"$Steel_name;","Amount":-3}],"__proto__":{"y":2}}'));
  assert.equal(odd.items.length, 0);
  assert.equal(({}).x, undefined);
  assert.ok(odd.issues.some((i) => i.path === '__proto__' && i.kind === 'unexpected'));
  assert.ok(readEvent({ event: 'ColonisationContribution', Contributions: 'pas une liste' }).issues.some((i) => i.kind === 'type' && i.path === 'Contributions'));
});

test('noms de chantier : vaisseau de colonisation, orbital, planétaire', () => {
  assert.deepEqual(parseStationName('$EXT_PANEL_ColonisationShip; Judson Depot'), { kind: 'ship', name: 'Judson Depot', label: 'Vaisseau de colonisation · Judson Depot' });
  assert.equal(parseStationName('$EXT_PANEL_ColonisationShip:#index=1;').label, 'Vaisseau de colonisation · n° 1');
  assert.equal(parseStationName('Orbital Construction Site: Smith Ring').kind, 'orbital');
  // Préfixe vu dans un vrai FSSSignalDiscovered du journal de référence (2 nov. 2026)
  assert.deepEqual(parseStationName('Planetary Construction Site: Polak Relay'), { kind: 'planetary', name: 'Polak Relay', label: 'Chantier planétaire · Polak Relay' });
  assert.equal(parseStationName('Gibbs Hydroponics Site').kind, null);
  assert.equal(parseStationName(null).kind, null);
});

test('chantier = nom de chantier ET service de livraison (le service seul ne suffit pas)', () => {
  const dock = readContext(DOCKED_SHIP);
  assert.equal(dock.type, 'dock');
  assert.equal(dock.system, 'Bleae Thua ED-D c12-5');
  assert.equal(isConstructionStation(dock), true);
  const settlement = readContext(SETTLEMENT_WITH_SERVICE); // vraie ligne de l’auteur : établissement terminé
  assert.equal(settlement.type, 'approach');
  assert.equal(settlement.body, 'Synuefe OU-E c28-2 11 a');
  assert.equal(isConstructionStation(settlement), false);
  assert.equal(isConstructionStation({ station: 'Orbital Construction Site: X', services: ['dock'] }), false);
  assert.equal(isConstructionStation({ station: 'Orbital Construction Site: X', services: null }), true); // DockingGranted : pas de services
  assert.equal(readContext({ event: 'Location', Docked: false, StarSystem: 'Sol', MarketID: 1 }).marketId, null);
  assert.equal(readContext({ event: 'FSSSignalDiscovered' }), null);
});
