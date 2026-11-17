import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from './gameState.js';

test('vaisseau courant : le récapitulatif fait foi, avec le nom en clair appris au lancement ou au chantier', () => {
  const g = new GameState();
  g.applyEvent({ event: 'LoadGame', Ship: 'LakonMiner', Ship_Localised: 'Type-11 Prospector', Credits: 1 });
  assert.equal(g.snapshot().ship, 'Type-11 Prospector');
  // Échange au chantier (mesuré : Loadout sans Ship_Localised) : avant, l'état gardait « Type-11 Prospector »
  g.applyEvent({ event: 'ShipyardSwap', ShipType: 'panthermkii', ShipType_Localised: 'Panther Clipper Mk II', ShipID: 31 });
  g.applyEvent({ event: 'Loadout', Ship: 'panthermkii', ShipID: 31, Modules: [] });
  assert.equal(g.snapshot().ship, 'Panther Clipper Mk II');
  assert.equal(g.snapshot().loadout.ship, 'panthermkii');
  // Modèle jamais nommé par le journal : son nom connu (core/ship.js) plutôt que l'ancien vaisseau ou le nom interne
  g.applyEvent({ event: 'ShipyardSwap', ShipType: 'cutter', ShipID: 7 });
  g.applyEvent({ event: 'Loadout', Ship: 'cutter', ShipID: 7, Modules: [] });
  assert.equal(g.snapshot().ship, 'Imperial Cutter');
  // Modèle inconnu de l'app (vaisseau sorti depuis) : le nom du journal, faute de mieux
  g.applyEvent({ event: 'Loadout', Ship: 'vaisseau_futur', ShipID: 8, Modules: [] });
  assert.equal(g.snapshot().ship, 'vaisseau_futur');
  // Retour au Type-11 : son nom est connu depuis le lancement
  g.applyEvent({ event: 'Loadout', Ship: 'lakonminer', ShipID: 29, Modules: [] });
  assert.equal(g.snapshot().ship, 'Type-11 Prospector');
  // Jeu lancé dans le Rhino : le vaisseau n'est pas le SRV
  g.applyEvent({ event: 'LoadGame', Ship: 'MEV_Rhino', Ship_Localised: 'VRS Rhino', Credits: 1 });
  assert.equal(g.snapshot().ship, 'Type-11 Prospector');
  // Les noms appris survivent à la remise à zéro
  g.reset();
  g.applyEvent({ event: 'Loadout', Ship: 'panthermkii', ShipID: 31, Modules: [] });
  assert.equal(g.snapshot().ship, 'Panther Clipper Mk II');
  clearTimeout(g.changeTimer);
});

test('soute du vaisseau : les transferts du SRV comptent, le jeu ne l\'écrivant pas en SRV', () => {
  const g = new GameState();
  g.applyEvent({ event: 'Cargo', Vessel: 'Ship', Count: 0 });
  g.applyEvent({ event: 'Cargo', Vessel: 'SRV', Count: 68 }); // soute du SRV : ignorée ici
  g.applyEvent({ event: 'CargoTransfer', Transfers: [{ Type: 'iridium', Type_Localised: 'Iridium', Count: 68, Direction: 'toship' }] });
  let s = g.snapshot();
  assert.equal(s.cargoCount, 68);
  assert.deepEqual(s.cargo, [{ name: 'iridium', label: 'Iridium', count: 68 }]);
  g.applyEvent({ event: 'CargoTransfer', Transfers: [{ Type: 'iridium', Count: 68, Direction: 'tosrv' }] });
  s = g.snapshot();
  assert.equal(s.cargoCount, 0);
  assert.deepEqual(s.cargo, []);
  clearTimeout(g.changeTimer);
});

test('Loadout abîmé (modules ou modificateurs qui ne sont pas des listes) : lu sans exception, sans FSD', async () => {
  const { parseLoadout } = await import('./gameState.js');
  for (const Modules of ['pas une liste', { Slot: 'FrameShiftDrive' }, [null, 7, 'x'], undefined]) {
    assert.equal(parseLoadout({ event: 'Loadout', Ship: 'cutter', Modules }).fsd, null, JSON.stringify(Modules));
  }
  const fsd = parseLoadout({ Modules: [null, { Slot: 'FrameShiftDrive', Item: 'Int_Hyperdrive_Size5_Class5', Engineering: { Modifiers: 'abîmé' } }] }).fsd;
  assert.deepEqual([fsd.size, fsd.cls, fsd.optimalMass], [5, 5, null]);
  const g = new GameState();
  assert.doesNotThrow(() => g.applyEvent({ event: 'Loadout', Ship: 'cutter', ShipID: 'pas un nombre', Modules: 'pas une liste' }));
  clearTimeout(g.changeTimer);
});
