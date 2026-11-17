// Colonisation : textes du jeu nettoyés comme partout ailleurs (core/text.js, idée 7).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStationName, readContext, readEvent } from './events.js';
import { parseLines } from '../../core/journalFiles.js';

const NBSP = ' ';

test('marchandises du dépôt : Name_Localised nettoyé à la lecture du journal, sinon le nom interne lisible', () => {
  const [depot] = parseLines(
    '{ "timestamp":"2026-01-01T00:00:00Z", "event":"ColonisationConstructionDepot", "MarketID":3963439106, "ConstructionProgress":0.5, "ConstructionComplete":false, "ConstructionFailed":false, ' +
      '"ResourcesRequired":[ { "Name":"$cmmcomposite_name;", "Name_Localised":" Composite&nbsp;CMM ", "RequiredAmount":10, "ProvidedAmount":2, "Payment":6788 }, ' +
      '{ "Name":"$liquidoxygen_name;", "RequiredAmount":5, "ProvidedAmount":0, "Payment":1 } ] }',
  );
  const d = readEvent(depot);
  assert.equal(d.resources[0].name, `Composite${NBSP}CMM`);
  assert.equal(d.resources[1].name, 'Liquidoxygen'); // pas de Name_Localised : la clé rendue lisible, plus « liquidoxygen »
  assert.equal(d.resources[1].symbol, 'liquidoxygen');
  const [delivery] = parseLines(
    '{ "timestamp":"2026-01-01T00:01:00Z", "event":"ColonisationContribution", "MarketID":3963439106, "Contributions":[ { "Name":"$CMMComposite_name;", "Name_Localised":"Composite CMM&amp;", "Amount":4 } ] }',
  );
  assert.equal(readEvent(delivery).items[0].name, 'Composite CMM&');
});

test('noms de station : entités décodées, clé du vaisseau de colonisation toujours reconnue', () => {
  const c = readContext({ event: 'Docked', timestamp: '2026-01-01T00:00:00Z', MarketID: 1, StationName: ' Orbital Construction Site: Smith &amp; Fils ', StarSystem: 'X' });
  assert.equal(c.station, 'Orbital Construction Site: Smith & Fils');
  assert.deepEqual(parseStationName(c.station), { kind: 'orbital', name: 'Smith & Fils', label: 'Chantier orbital · Smith & Fils' });
  const ship = readContext({ event: 'Docked', timestamp: '2026-01-01T00:00:00Z', MarketID: 2, StationName: '$EXT_PANEL_ColonisationShip:#index=1;' });
  assert.equal(parseStationName(ship.station).kind, 'ship'); // cleanText l'aurait réécrite en mots
  const drop = readContext({ event: 'SupercruiseDestinationDrop', timestamp: '2026-01-01T00:00:00Z', MarketID: 3, Type: '$EXT_PANEL_ColonisationShip; Judson&nbsp;Depot' });
  assert.equal(parseStationName(drop.station).name, `Judson${NBSP}Depot`);
});
