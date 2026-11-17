// Flotte tenue au fil du journal (Fleet) : seul le dernier Loadout de chaque vaisseau reste en mémoire. Avant, le
// module gardait tous les événements de flotte depuis le premier journal (un Loadout pèse plusieurs Ko) et refaisait
// toute la flotte à chaque événement. Événements factices.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import v8 from 'node:v8';
import vm from 'node:vm';
import { Fleet, buildFleet } from '../services/fleet.js';

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');

const T = (i) => new Date(Date.UTC(2026, 10, 8, 12) + i * 60_000).toISOString();
function suite(n) {
  const evs = [];
  for (let i = 0; i < n; i++) {
    const ship = 1 + (i % 3);
    if (i % 7 === 0) evs.push({ event: 'ShipyardSwap', ShipID: ship, ShipType: 'python', timestamp: T(i) });
    evs.push({ event: 'Loadout', ShipID: ship, Ship: 'python', ShipName: `Nef ${i}`, ShipIdent: 'AB-01', Modules: [{ Slot: 'Slot01', Item: 'int_x', Engineering: { Level: i % 5 } }], timestamp: T(i) });
    if (i % 5 === 0) evs.push({ event: 'EngineerCraft', Slot: 'Slot01', Module: 'int_x', Engineer: 'Felicity Farseer', Level: 3, timestamp: T(i) });
    if (i % 11 === 0) evs.push({ event: 'EngineerProgress', Engineers: [{ Engineer: 'Felicity Farseer', EngineerID: 300100, Rank: i % 6 }], timestamp: T(i) });
    if (i % 13 === 0) evs.push({ event: 'StoredShips', ShipsHere: [{ ShipID: 4, ShipType: 'krait', Name: 'Garage' }], ShipsRemote: [], timestamp: T(i) });
  }
  return evs;
}

test('flotte au fil du journal : la même que celle refaite d’un coup, à chaque événement', () => {
  const evs = suite(60);
  const fleet = new Fleet();
  evs.forEach((ev, i) => {
    fleet.apply(ev);
    const ref = buildFleet(evs.slice(0, i + 1));
    assert.deepEqual([...fleet.ships], [...ref.ships], `après ${i + 1} événements`);
    assert.equal(fleet.currentShipId, ref.currentShipId);
    assert.deepEqual([...fleet.engineers], [...ref.engineers]);
  });
});

test('seul le dernier Loadout de chaque vaisseau reste en mémoire', async () => {
  const fleet = new Fleet();
  const refs = [];
  const appliquer = () => {
    for (const ev of suite(300)) {
      if (ev.event === 'Loadout') refs.push({ ship: ev.ShipID, ref: new WeakRef(ev) });
      fleet.apply(ev);
    }
  };
  appliquer();
  await new Promise((r) => setImmediate(r)); // une WeakRef garde sa cible jusqu'à la fin de la tâche en cours
  gc();
  gc();
  const gardes = refs.filter((r) => r.ref.deref());
  assert.equal(gardes.length, 3, `${gardes.length} Loadout gardés sur ${refs.length} (un par vaisseau attendu)`);
  for (const r of gardes) assert.equal(fleet.ships.get(r.ship).loadout.timestamp, r.ref.deref().timestamp);
});

test('le service d’ingénierie tient sa flotte avec Fleet, sans liste d’événements', () => {
  const src = fs.readFileSync(new URL('../services/service.js', import.meta.url), 'utf8');
  assert.ok(!/fleetEvents/.test(src), 'plus de fleetEvents');
  assert.ok(!/buildFleet\(/.test(src), 'plus de reconstruction complète à chaque événement');
  assert.match(src, /this\.fleet\.apply\(ev\)/);
});
