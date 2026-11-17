// Hôte d'une application et atelier à distance (R3, R3g, R8).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dockOf, hostOf, craftPlace, remoteWorkshopHere, authorIdOf } from '../services/workshop.js';
import { idx, id } from './helpers/itinerary.js';

const BROO = idx.byId.get(id('Broo Tarquin'));
const docked = (extra = {}) => ({ timestamp: '2026-11-05T12:32:49Z', event: 'Docked', StationName: "Broo's Legacy", StationType: 'CraterOutpost', Taxi: false, Multicrew: false, StarSystem: 'Muang', SystemAddress: 4481966019282, MarketID: BROO.marketId, StationServices: ['dock', 'outfitting', 'engineer'], ...extra });
const orbis = (extra = {}) => ({ timestamp: '2026-11-05T12:16:06Z', event: 'Docked', StationName: 'Station Test', StationType: 'Orbis', Taxi: false, Multicrew: false, StarSystem: 'Achenar', SystemAddress: 164098653, MarketID: 3220000001, StationServices: ['dock', 'engineer', 'shipyard', 'outfitting'], ...extra });
const craft = (extra = {}) => ({ timestamp: '2026-11-05T12:34:06Z', event: 'EngineerCraft', Slot: 'SmallHardpoint1', Module: 'hpt_beamlaser_gimbal_small', Engineer: 'Broo Tarquin', EngineerID: BROO.id, BlueprintName: 'Weapon_LightWeight', Level: 1, Quality: 0.2, ...extra });

test('amarrage : Docked, ou Location à quai (copie complète ou réduite) ; autre chose → null', () => {
  const d = dockOf(docked());
  assert.deepEqual(d, { marketId: BROO.marketId, station: "Broo's Legacy", stationType: 'CraterOutpost', system: 'Muang', systemAddress: 4481966019282, taxi: false, multicrew: false, services: { engineer: true, outfitting: true, shipyard: false }, at: '2026-11-05T12:32:49Z' });
  assert.equal(dockOf({ event: 'Location', Docked: false, MarketID: 1 }), null);
  assert.equal(dockOf({ event: 'Undocked', MarketID: 1 }), null);
  const reduced = { event: 'Location', Docked: true, MarketID: 5, StationName: 'X', services: { engineer: true, outfitting: false, shipyard: false } };
  assert.deepEqual(dockOf(reduced).services, { engineer: true, outfitting: false, shipyard: false });
});

test('hôte : par le MarketID ; repli par le nom et le système (Cinder Dock) ; jamais un porte-vaisseaux par le nom', () => {
  assert.deepEqual(hostOf(dockOf(docked()), idx), { id: BROO.id, name: 'Broo Tarquin', by: 'marketId' });
  const cinder = { marketId: 128952752, station: 'Cinder Dock', stationType: 'CraterPort', systemAddress: 594676730147 };
  assert.deepEqual(hostOf(cinder, idx), { id: id('Chloe Sedesi'), name: 'Chloe Sedesi', by: 'nom' });
  assert.equal(hostOf({ ...cinder, stationType: 'FleetCarrier' }, idx), null);
  assert.equal(hostOf({ ...cinder, systemAddress: 1 }, idx), null);
  assert.equal(hostOf(dockOf(orbis()), idx), null);
  assert.equal(hostOf(null, idx), null);
});

test('lieu d’une application : atelier, distance, effet, effet hors atelier, inconnu', () => {
  const atBroo = dockOf(docked());
  const away = dockOf(orbis());
  assert.equal(craftPlace(craft(), atBroo, idx).kind, 'atelier');
  assert.equal(craftPlace(craft(), away, idx).kind, 'distance');
  // Effet posé chez Broo Tarquin sur la modification de The Dweller (Muang, 5 nov.) : l'hôte est Broo, l'auteur The Dweller
  const effect = craft({ Engineer: 'The Dweller', EngineerID: id('The Dweller'), BlueprintName: 'Weapon_Efficient', Level: 3, Quality: 1, ApplyExperimentalEffect: 'special_weapon_lightweight' });
  assert.deepEqual(craftPlace(effect, atBroo, idx), { kind: 'effet', hostId: BROO.id, hostBy: 'marketId', authorId: id('The Dweller') });
  assert.equal(craftPlace(effect, away, idx).kind, 'effet hors atelier');
  // Application de The Dweller faite à quai chez Broo, sans effet : à distance
  assert.equal(craftPlace(craft({ Engineer: 'The Dweller', EngineerID: id('The Dweller') }), atBroo, idx).kind, 'distance');
  assert.equal(craftPlace(craft(), null, idx).kind, 'inconnu', 'pas à quai');
  assert.equal(craftPlace(craft({ Engineer: 'Personne', EngineerID: 1 }), atBroo, idx).kind, 'inconnu', 'auteur inconnu');
  assert.equal(authorIdOf({ Engineer: "Tod 'The Blaster' McQuinn" }, idx), id("Tod 'The Blaster' McQuinn"));
  assert.equal(authorIdOf({ Engineer: 'Tod "The Blaster" McQuinn' }, idx), id("Tod 'The Blaster' McQuinn"));
});

test('atelier à distance ici : Orbis et porte-vaisseaux oui ; installation au sol, base d’ingénieur, taxi, équipage non ; à pied : remonter à bord', () => {
  assert.deepEqual(remoteWorkshopHere(dockOf(orbis()), idx), { ok: true, why: null, onFoot: false, station: 'Station Test' });
  assert.equal(remoteWorkshopHere(dockOf(orbis({ StationType: 'FleetCarrier', StationServices: ['dock'] })), idx).ok, true);
  assert.equal(remoteWorkshopHere(dockOf(orbis({ StationType: 'SurfaceStation' })), idx).why, 'installation au sol');
  assert.equal(remoteWorkshopHere(dockOf(docked()), idx).why, 'base d’ingénieur');
  assert.equal(remoteWorkshopHere(dockOf(orbis({ Taxi: true })), idx).why, 'taxi');
  assert.equal(remoteWorkshopHere(dockOf(orbis({ Multicrew: true })), idx).why, 'équipage');
  assert.equal(remoteWorkshopHere(dockOf(orbis({ StationServices: ['dock'] })), idx).why, 'pas de service');
  assert.equal(remoteWorkshopHere(null, idx).why, 'pas à quai');
  assert.deepEqual(remoteWorkshopHere(dockOf(orbis()), idx, { onFoot: true }), { ok: true, why: null, onFoot: true, station: 'Station Test' });
});
