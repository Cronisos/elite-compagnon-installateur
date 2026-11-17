// R17 : un vaisseau vendu à l'achat d'un autre lui laisse son numéro ; son Loadout n'est jamais appliqué au neuf.
// Formes des événements : celles du journal (ShipyardBuy avec SellOldShip / SellShipID / SellPrice, ShipyardNew).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { buildFleet } from '../services/fleet.js';
import { EngineeringService } from '../services/service.js';
import { snapshot, validationState } from '../services/validation.js';
import { ref, memoryPrisma, tempDir } from './helpers/itinerary.js';

const withRef = ref ? test : test.skip;
const t = (n) => `2026-11-02T10:${String(n).padStart(2, '0')}:00Z`;
const kraitLoadout = { timestamp: t(0), event: 'Loadout', Ship: 'krait_mkii', ShipID: 37, ShipName: '', ShipIdent: '', Modules: [{ Slot: 'FrameShiftDrive', Item: 'int_hyperdrive_size5_class5', Engineering: { Engineer: 'Felicity Farseer', EngineerID: 300100, BlueprintName: 'FSD_LongRange', Level: 5, Quality: 1 } }] };
const sellBuy = [
  { timestamp: t(1), event: 'ShipyardBuy', ShipType: 'python_nx', ShipType_Localised: 'Python Mk II', ShipPrice: 1000, SellOldShip: 'krait_mkii', SellShipID: 37, SellPrice: 900, MarketID: 3220000001 },
  { timestamp: t(2), event: 'ShipyardNew', ShipType: 'python_nx', ShipType_Localised: 'Python Mk II', NewShipID: 37 },
];

test('flotte : ShipyardBuy avec SellShipID retire le vaisseau vendu ; le neuf reprend le numéro sans son Loadout', () => {
  const before = buildFleet([kraitLoadout]);
  assert.equal(before.ships.get(37).type, 'krait_mkii');
  const after = buildFleet([kraitLoadout, ...sellBuy]);
  assert.equal(after.ships.get(37).type, 'python_nx');
  assert.equal(after.ships.get(37).loadout, null, 'aucun Loadout hérité');
  // Gardé à l'achat (StoreOldShip) : rien ne bouge
  const kept = buildFleet([kraitLoadout, { timestamp: t(1), event: 'ShipyardBuy', ShipType: 'python_nx', ShipPrice: 1000, StoreOldShip: 'krait_mkii', StoreShipID: 37, MarketID: 3220000001 }, { timestamp: t(2), event: 'ShipyardNew', ShipType: 'python_nx', NewShipID: 38 }]);
  assert.equal(kept.ships.get(37).loadout, kraitLoadout);
  assert.equal(kept.ships.get(38).type, 'python_nx');
});

withRef('service : shipSlots ne reprend jamais le Loadout d’un autre type ; photo d’un plan → current null, vaisseau « remplacé »', () => {
  const dir = tempDir();
  const j = Object.assign(new EventEmitter(), { addInterest() {} });
  const s = new EngineeringService({ prisma: memoryPrisma(), journal: j, broadcast: () => {} }, { files: { validated: `${dir}/v.json`, pins: `${dir}/p.json`, route: `${dir}/r.json` } });
  try {
    j.emit('ready', { history: [kraitLoadout] });
    assert.equal(s.shipSlots('krait_mkii', 37).find((x) => x.key === 'std-fsd').current.grade, 5);
    j.emit('ready', { history: [kraitLoadout, ...sellBuy] });
    // Un Loadout du Krait relu après coup (ou gardé à tort) ne s'applique pas à un Python Mk II, et inversement
    s.fleet.ships.get(37).loadout = kraitLoadout;
    assert.ok(s.shipSlots('python_nx', 37).every((x) => x.current === null));
    assert.equal(s.loadoutOf('python_nx', 37), null);
    const plan = { id: 1, shipId: 37, shipType: 'krait_mkii', modules: [{ slot: 'std-fsd', module: 'int_hyperdrive_size5_class5', blueprint: 'FSD_LongRange', grade: 5, experimental: null }] };
    s.fleet.ships.get(37).loadout = null;
    const snap = snapshot(plan, s.shipSlots(plan.shipType, plan.shipId), s.loadoutOf(plan.shipType, plan.shipId));
    assert.equal(snap.bind[0].current, null);
    assert.equal(validationState(snap, plan, { shipKeyNow: 'python_nx' }).ship, 'remplace');
  } finally {
    clearTimeout(s.notifyTimer);
    import('node:fs').then((fs) => fs.rmSync(dir, { recursive: true, force: true }));
  }
});
