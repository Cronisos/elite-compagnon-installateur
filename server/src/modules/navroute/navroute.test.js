// Tests du module Itinéraire : étoiles récupérables, avancement, sauts et distance restants.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RouteState, coefficient, exposantFsd, planCarburant, scoopable, vaisseauDe } from './state.js';
import { COMMANDER } from '../../core/commander.js';

const route = {
  event: 'NavRoute',
  Route: [
    { StarSystem: 'A', SystemAddress: 1, StarPos: [0, 0, 0], StarClass: 'K' },
    { StarSystem: 'B', SystemAddress: 2, StarPos: [10, 0, 0], StarClass: 'M_RedGiant' },
    { StarSystem: 'C', SystemAddress: 3, StarPos: [20, 0, 0], StarClass: 'TTS' },
    { StarSystem: 'D', SystemAddress: 4, StarPos: [30, 0, 0], StarClass: 'DA' },
    { StarSystem: 'E', SystemAddress: 5, StarPos: [40, 0, 0], StarClass: 'G' },
  ],
};

test('étoiles récupérables : KGBFOAM, géantes comprises ; pas T Tauri, naines blanches, neutrons', () => {
  for (const c of ['K', 'M', 'B_BlueWhiteSuperGiant', 'M_RedGiant', 'O']) assert.ok(scoopable(c), c);
  for (const c of ['TTS', 'DA', 'N', 'H', 'L', 'AeBe', '']) assert.ok(!scoopable(c), c);
});

test('avancement : sauts, distance et prochaine étoile non récupérable', () => {
  const r = new RouteState();
  r.apply({ event: 'Location', SystemAddress: 1 });
  r.setRoute(route);
  assert.deepEqual(r.summary(), {
    total: 4, jumpsLeft: 4, destination: 'E', distance: 40,
    next: { name: 'B', starClass: 'M_RedGiant', scoopable: true },
    unscoopable: 2, nextUnscoopable: { in: 2, name: 'C', starClass: 'TTS' },
  });
  r.apply({ event: 'FSDJump', SystemAddress: 3 });
  assert.equal(r.summary().jumpsLeft, 2);
  assert.equal(r.summary().nextUnscoopable.in, 1);
});

test('arrivé à destination, ou itinéraire effacé : plus rien', () => {
  const r = new RouteState();
  r.setRoute(route);
  r.apply({ event: 'FSDJump', SystemAddress: 5 });
  assert.equal(r.summary(), null);
  r.setRoute({ event: 'NavRouteClear', Route: [] });
  assert.equal(r.summary(), null);
});

// --- Carburant ---
// Vaisseau de 100 t à vide, FSD taille 5 (exposant 2,45), réservoir de 8 t. Ses 3 derniers sauts : 10 AL, 1 t,
// réservoir à 8 t avant le saut (masse 108 t). Un saut de 10 AL coûte donc 1 t à 108 t, un peu moins plus léger ;
// marge de 15 %.
const loadout = (o = {}) => ({
  event: 'Loadout', ShipID: 7, UnladenMass: 100, FuelCapacity: { Main: 8 },
  Modules: [{ Slot: 'FrameShiftDrive', Item: 'int_hyperdrive_size5_class5' }, ...(o.scoop ? [{ Slot: 'Slot01_Size4', Item: 'int_fuelscoop_size4_class5' }] : [])],
  ...o.ev,
});
const vaisseauSaute = (r, o) => {
  r.apply(loadout(o));
  for (let i = 0; i < 3; i++) r.apply({ event: 'FSDJump', SystemAddress: 99, JumpDist: 10, FuelUsed: 1, FuelLevel: 7 });
  r.apply({ event: 'Location', SystemAddress: 1 });
  r.setRoute(route);
};

test('carburant : sans récupérateur, alerte si les 2 sauts suivants ne passent pas', () => {
  const r = new RouteState();
  vaisseauSaute(r);
  const f = r.summary(1.8).fuel; // 1,8 t : un saut de 10 AL (~1 t avec la marge, plus léger qu'à 108 t), pas deux
  assert.equal(f.known, true);
  assert.equal(f.scoop, false);
  assert.equal(f.jumps, 1);
  assert.equal(f.alerte.in, 2);
  assert.equal(f.alerte.name, 'C');
  assert.equal(f.alerte.raison, 'pas de récupérateur de carburant');
  assert.ok(f.alerte.need > f.alerte.fuel);
  const g = r.summary(2.5).fuel; // 2,5 t : les 2 suivants passent, pas le 3e
  assert.equal(g.jumps, 2);
  assert.equal(g.alerte, null);
});

test('carburant : avec récupérateur, plein refait aux étoiles récupérables seulement', () => {
  const r = new RouteState();
  vaisseauSaute(r, { scoop: true });
  assert.equal(r.summary(1.5).fuel.alerte, null); // B (M géante rouge) : plein, puis 8 t pour C, D, E
  assert.equal(r.summary(1.5).fuel.all, true);
  const f = r.summary(0.5).fuel; // même le premier saut ne passe pas
  assert.equal(f.alerte.in, 1);
  assert.equal(f.alerte.raison, 'pas d’étoile récupérable d’ici là');
});

test('carburant : la soute alourdit le saut', () => {
  const r = new RouteState();
  vaisseauSaute(r);
  const vide = r.summary(8).fuel.nextNeed;
  r.apply({ event: 'Cargo', Vessel: 'Ship', Count: 100 });
  const plein = r.summary(8).fuel.nextNeed;
  assert.ok(plein > vide * 4, `${plein} contre ${vide}`); // masse presque doublée, exposant 2,45
  r.apply({ event: 'Cargo', Vessel: 'SRV', Count: 0 }); // soute du SRV : ignorée
  assert.equal(r.summary(8).fuel.nextNeed, plein);
});

test('carburant : autre vaisseau, autre FSD ou sauts boostés : consommation inconnue', () => {
  const r = new RouteState();
  vaisseauSaute(r);
  r.apply(loadout({ ev: { ShipID: 8 } }));
  assert.equal(r.summary(2).fuel.known, false, 'autre vaisseau : jamais sauté');
  r.apply({ event: 'FSDJump', SystemAddress: 1, JumpDist: 40, FuelUsed: 1, FuelLevel: 7, BoostUsed: 4 }); // neutron
  assert.equal(r.summary(2).fuel.known, false);
  r.apply(loadout({ ev: { Modules: [{ Slot: 'FrameShiftDrive', Item: 'int_hyperdrive_size5_class5', Engineering: { Modifiers: [{ Label: 'FSDOptimalMass', Value: 2000 }] } }] } }));
  assert.equal(r.summary(2).fuel.known, false, 'FSD modifié : nouvelle mesure');
  assert.equal(r.summary().fuel, undefined, 'sans carburant connu : pas de partie carburant');
});

test('exposant : selon la taille, Mk II à part ; coefficient : médiane', () => {
  assert.equal(exposantFsd('int_hyperdrive_size2_class5'), 2);
  assert.equal(exposantFsd('int_hyperdrive_overcharge_size7_class5'), 2.75);
  assert.equal(exposantFsd('int_hyperdrive_overcharge_size8_class5_overchargebooster_mkii'), 2.45);
  assert.equal(exposantFsd(''), 2.45);
  const s = [1, 2, 100].map((fuel) => ({ dist: 1, fuel, masse: 1, boost: false }));
  assert.equal(coefficient(s, 2), 2);
  assert.equal(coefficient([], 2), null);
  assert.equal(coefficient([{ dist: 10, fuel: 1, masse: null, boost: false }], 2), null);
  const v = vaisseauDe({ ShipID: 3, UnladenMass: 50, FuelCapacity: { Main: 16 }, Modules: [null, { Item: 'Int_FuelScoop_Size3_Class2' }] });
  assert.deepEqual([v.aVide, v.reservoir, v.recuperateur], [50, 16, true]);
});

test('consommation mesurée par vaisseau : le n° 1 du second compte (audit M7) n’est pas celui du compte principal', () => {
  const lo = (who) => ({ event: 'Loadout', ShipID: 1, Modules: [{ Slot: 'FrameShiftDrive', Item: 'int_hyperdrive_size5_class5' }], [COMMANDER]: who });
  assert.notEqual(vaisseauDe(lo('F0000001')).cle, vaisseauDe(lo('F0000002')).cle);
  assert.equal(vaisseauDe(lo('F0000001')).cle, vaisseauDe(lo('F0000001')).cle);
  assert.equal(vaisseauDe({ ShipID: 1, Modules: [] }).cle, '1||', 'sans commandant noté : comme avant');
});

test('plan : niveau inconnu, route vide, dernière étape seule', () => {
  const p0 = { capacity: 8, scoop: true, k: 1e-6, exposant: 2, sec: 100 };
  assert.equal(planCarburant({ ...p0, level: NaN, legs: [{ dist: 1 }] }).known, false);
  assert.equal(planCarburant({ ...p0, level: 5, legs: [] }).known, false);
  const p = planCarburant({ ...p0, scoop: false, level: 1.5, legs: [{ name: 'Z', starClass: 'K', dist: 10 }] });
  assert.equal(p.alerte, null);
  assert.equal(p.all, true);
});
