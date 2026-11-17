// Compagnon : noms venus du jeu nettoyés dans ses phrases (core/text.js, idée 7).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Triggers, goodsName } from './triggers.js';

const T0 = new Date(2026, 10, 7, 21, 15, 18).getTime();
const ev = (o) => ({ timestamp: new Date(T0).toISOString(), ...o });

test('station, PNJ et marchandise : entités décodées et espaces retirées, la clé brute d’un PNJ toujours tue', () => {
  const t = new Triggers();
  t.prime([]);
  const [ok] = t.event(ev({ event: 'DockingGranted', LandingPad: 4, MarketID: 1, StationName: ' Prix &amp; Fils ', StationType: 'Outpost' }), T0);
  assert.equal(ok.ctx.station, 'Prix & Fils');
  // Station du vaisseau de colonisation : le nom traduit par le jeu d'abord, s'il l'écrit
  const [ship] = t.event(ev({ event: 'DockingGranted', LandingPad: 1, MarketID: 2, StationName: '$EXT_PANEL_ColonisationShip; Judson Depot', StationName_Localised: 'Vaisseau de colonisation' }), T0);
  assert.equal(ship.ctx.station, 'Vaisseau de colonisation');
  const [inter] = t.event(ev({ event: 'Interdicted', Submitted: true, Interdictor: 'Bob &amp; Alice', IsPlayer: false }), T0);
  assert.equal(inter.ctx.interdicteur, 'Bob & Alice');
  const [raw] = t.event(ev({ event: 'Interdicted', Submitted: true, Interdictor: '$npc_name_decorate:#name=Bob;', IsPlayer: false }), T0);
  assert.equal(raw.ctx.interdicteur, null);
  assert.equal(goodsName({ Type: 'gold', Type_Localised: ' Or&nbsp; ' }), 'Or');
});
