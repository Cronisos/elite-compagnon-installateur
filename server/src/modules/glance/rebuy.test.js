// Tests du rachat couvert et du mode de jeu (Coup d'œil), sur des valeurs relevées dans les journaux de référence.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RebuyState, BANKRUPT_TEXT, REBUY_RATE, UNDOCK_ALERT_MS, RESURRECT_RECENT_MS, deathLoss, lossText, rebuyReminders, resurrectText,
  NO_REBUY_UNDOCK_FLAGS, REBUY_EVENTS, SHIP_KEPT_OPTIONS,
} from './rebuy.js';
import { buildGlance } from './state.js';

const fr = (n) => new Intl.NumberFormat('fr-FR').format(n);
const T0 = Date.parse('2026-11-07T21:15:27Z');
const at = (s) => new Date(T0 + s * 1000).toISOString();

// Type-11 Prospector du 7 nov. 2026 : rachat 4 498 040 cr
const loadout = (rebuy = 4_498_040) => ({
  event: 'Loadout', timestamp: at(0), Ship: 'lakonminer', ShipID: 43, ShipName: '', ShipIdent: '',
  HullValue: 64_687_569, ModulesValue: 26_311_397, Rebuy: rebuy,
});
const loadGame = (extra = {}) => ({
  event: 'LoadGame', timestamp: at(-9), Ship: 'LakonMiner', Ship_Localised: 'Type-11 Prospector', ShipID: 43,
  GameMode: 'Solo', Credits: 823_047_781, ...extra,
});
const build = (events, opts) => {
  const r = new RebuyState();
  for (const ev of events) r.apply(ev, opts);
  return r;
};

test('rachat couvert : crédits du 7 nov. (823 M) contre 4,5 M de rachat', () => {
  const v = build([loadGame(), loadout()]).view({ balance: 823_047_781 }, T0);
  assert.equal(v.rebuy, 4_498_040);
  assert.equal(v.covered, true);
  assert.equal(v.missing, 0);
  assert.equal(v.times, 182);
  assert.equal(v.ship.label, 'Type-11 Prospector');
  assert.equal(v.estimated, false);
  assert.deepEqual(rebuyReminders(v), []);
});

test('rachat NON COUVERT : il manque la différence, rappel en rouge', () => {
  const v = build([loadGame(), loadout(24_176_478)]).view({ balance: 13_000_000 }, T0);
  assert.equal(v.covered, false);
  assert.equal(v.missing, 11_176_478);
  assert.equal(v.times, 0);
  assert.equal(v.alert, null); // pas de décollage : pas d'alerte, seulement le rappel
  const [r] = rebuyReminders(v);
  assert.equal(r.level, 'danger');
  assert.match(r.text, /Rachat NON COUVERT : il manque 11,2 M cr/);
});

test('rappel NON COUVERT : le conseil dépend de l’état à quai', () => {
  const r = build([loadGame(), loadout()]);
  const docked = rebuyReminders(r.view({ balance: 1_000_000, docked: true }, T0))[0].text;
  assert.match(docked, /^Rachat NON COUVERT : il manque 3,5 M cr .* Ne décolle pas avec/);
  // Décollé il y a 4 min (alerte finie) : plus de « Ne décolle pas », le risque en vol
  r.apply({ event: 'Undocked', timestamp: at(5), StationName: 'Flinders City', Taxi: false, Multicrew: false }, { now: T0 });
  const v = r.view({ balance: 1_000_000, docked: false }, T0 + 4 * 60_000);
  assert.equal(v.alert, null);
  assert.equal(v.docked, false);
  const flying = rebuyReminders(v)[0].text;
  assert.doesNotMatch(flying, /Ne décolle pas/);
  assert.match(flying, /^Rachat NON COUVERT : il manque 3,5 M cr .* Tu n'es pas à quai : si tu meurs, tu risques de perdre ce vaisseau et ses modules\.$/);
  // État à quai inconnu : seulement le risque
  const unknown = rebuyReminders(r.view({ balance: 1_000_000 }, T0 + 4 * 60_000))[0].text;
  assert.match(unknown, /\. Si tu meurs, tu risques de perdre ce vaisseau et ses modules\.$/);
});

test('crédits inconnus : ni couvert ni non couvert', () => {
  const v = build([loadout()]).view({ balance: null }, T0);
  assert.equal(v.covered, null);
  assert.equal(v.times, null);
  assert.deepEqual(rebuyReminders(v), []);
});

test('décollage sans rachat couvert : alerte pendant UNDOCK_ALERT_MS, effacée à quai', () => {
  const r = build([loadGame(), loadout()]);
  r.apply({ event: 'Undocked', timestamp: at(5), StationName: 'Flinders City', Taxi: false, Multicrew: false }, { now: T0 });
  const v = r.view({ balance: 1_000_000 }, T0 + 60_000);
  assert.equal(v.alert.station, 'Flinders City');
  assert.equal(v.alert.missing, 3_498_040);
  assert.match(rebuyReminders(v)[0].text, /^Tu as décollé sans pouvoir payer ton rachat : il manque 3,5 M cr/);
  assert.equal(r.view({ balance: 1_000_000 }, T0 + UNDOCK_ALERT_MS + 1).alert, null);
  // Crédits revenus au-dessus du rachat : plus d'alerte
  assert.equal(r.view({ balance: 5_000_000 }, T0 + 60_000).alert, null);
  r.apply({ event: 'Docked', timestamp: at(90) });
  assert.equal(r.view({ balance: 1_000_000 }, T0 + 60_000).alert, null);
});

test('décollage en taxi ou en équipage multiple : pas ton rachat, pas d’alerte', () => {
  assert.deepEqual(NO_REBUY_UNDOCK_FLAGS, ['Taxi', 'Multicrew']);
  for (const flag of NO_REBUY_UNDOCK_FLAGS) {
    const r = build([loadout()]);
    r.apply({ event: 'Undocked', timestamp: at(5), [flag]: true }, { now: T0 });
    assert.equal(r.view({ balance: 0 }, T0 + 1000).alert, null);
  }
});

test('alerte relue de l’historique : trop vieille pour s’afficher', () => {
  const r = build([loadout(), { event: 'Undocked', timestamp: '2026-10-29T12:06:22Z' }]);
  assert.equal(r.view({ balance: 0 }, T0).alert, null);
  assert.equal(r.view({ balance: 0 }, T0).covered, false);
});

test('Loadout sans Rebuy : estimation à 5 % de la coque et des modules, marquée', () => {
  assert.equal(REBUY_RATE, 0.05);
  const ev = loadout();
  delete ev.Rebuy;
  const v = build([ev]).view({ balance: 1e9 }, T0);
  assert.equal(v.rebuy, Math.round((64_687_569 + 26_311_397) * 0.05));
  assert.equal(v.estimated, true);
});

test('mode de jeu : Solo, Open, groupe privé avec son nom (LoadGame)', () => {
  assert.deepEqual(
    [build([loadGame()]).mode.label, build([loadGame({ GameMode: 'Open' })]).mode.open],
    ['Solo', true],
  );
  const g = build([loadGame({ GameMode: 'Group', Group: 'EDFR' })]).mode;
  assert.deepEqual([g.label, g.group, g.open], ['Groupe privé', 'EDFR', false]);
  // Mode inconnu : affiché tel quel ; LoadGame sans mode : le précédent reste
  assert.equal(build([loadGame({ GameMode: 'Nouveau' })]).mode.label, 'Nouveau');
  const kept = build([loadGame(), { event: 'LoadGame', timestamp: at(1) }]);
  assert.equal(kept.mode.label, 'Solo');
});

test('nom du vaisseau : nom donné en jeu, sinon type localisé, sinon nom interne', () => {
  const named = loadout();
  named.ShipName = 'Pioche';
  assert.equal(build([loadGame(), named]).view({ balance: 0 }).ship.label, 'Pioche (Type-11 Prospector)');
  assert.equal(build([loadout()]).view({ balance: 0 }).ship.label, 'Lakonminer');
  // Nom fait d'espaces, vu dans le Loadout du 7 nov. : pas de nom
  assert.equal(build([loadGame(), { ...loadout(), ShipName: '  ' }]).view({ balance: 0 }).ship.label, 'Type-11 Prospector');
  const swapped = build([{ event: 'ShipyardSwap', ShipType: 'panthermkii', ShipType_Localised: 'Panther Clipper Mk II', ShipID: 31 }, { ...loadout(), Ship: 'panthermkii', ShipID: 31 }]);
  assert.equal(swapped.view({ balance: 0 }).ship.label, 'Panther Clipper Mk II');
});

test('nom du vaisseau, partie lancée dans le SRV (7 nov. 2026) : type d\'après les données de référence, pas « Lakonminer »', () => {
  // LoadGame nomme le VRS Rhino (ShipID 44) ; le Loadout du vaisseau (ShipID 43) ne donne que « lakonminer »
  const inSrv = loadGame({ Ship: 'MEV_Rhino', Ship_Localised: 'VRS Rhino', ShipID: 44 });
  const asked = [];
  const typeName = (t) => (asked.push(t), t === 'lakonminer' ? 'Type-11 Prospector' : null);
  const r = new RebuyState({ typeName });
  for (const ev of [inSrv, loadout()]) r.apply(ev);
  assert.equal(r.view({ balance: 0 }).ship.label, 'Type-11 Prospector');
  assert.deepEqual(asked, ['lakonminer']);
  // Le nom localisé du journal passe avant ; un type inconnu des données garde le nom interne
  const local = new RebuyState({ typeName: () => 'Autre' });
  for (const ev of [loadGame(), loadout()]) local.apply(ev);
  assert.equal(local.view({ balance: 0 }).ship.label, 'Type-11 Prospector');
  const unknown = new RebuyState({ typeName });
  unknown.apply({ ...loadout(), Ship: 'nouveau_vaisseau' });
  assert.equal(unknown.view({ balance: 0 }).ship.label, 'Nouveau_vaisseau');
});

test('résurrection du 29 oct. : rachat payé 20 559 981 cr, égal au dernier Loadout.Rebuy', () => {
  const r = build([
    { ...loadout(20_559_981), Ship: 'panthermkii', ShipID: 31 },
    { event: 'Died', timestamp: '2026-10-29T14:37:01Z' },
    { event: 'Resurrect', timestamp: '2026-10-29T14:37:59Z', Option: 'rebuy', Cost: 20_559_981, Bankrupt: false },
  ]);
  const v = r.view({ balance: 600_000_000 }, Date.parse('2026-10-29T14:40:00Z'));
  assert.equal(v.resurrect.text, `Rachat payé : ${fr(20_559_981)} cr.`);
  assert.equal(v.resurrect.expectedCost, 20_559_981);
  assert.equal(v.resurrect.recent, true);
  assert.equal(rebuyReminders(v)[0].level, 'warning');
  assert.equal(r.view({ balance: 6e8 }, Date.parse('2026-10-29T14:37:59Z') + RESURRECT_RECENT_MS + 1).resurrect.recent, false);
});

test('mort à pied (rejoin, 29 oct.) : sans frais, aucune perte annoncée', () => {
  const g = buildGlance([{ event: 'Bounty', TotalReward: 1000 }]);
  const r = new RebuyState();
  r.apply({ event: 'Died', timestamp: '2026-10-29T12:54:54Z' }, { loss: deathLoss(g) });
  r.apply({ event: 'Resurrect', timestamp: '2026-10-29T12:55:31Z', Option: 'rejoin', Cost: 0, Bankrupt: false });
  assert.equal(r.resurrect.text, 'Retour au vaisseau, sans frais (mort hors du vaisseau).');
  assert.ok(SHIP_KEPT_OPTIONS.has('rejoin'));
  assert.equal(r.resurrect.loss, null);
  assert.equal(r.resurrect.optionStatus, 'mesurée');
});

test('faillite : expliquée en une phrase', () => {
  assert.equal(resurrectText({ option: 'free', cost: 0, bankrupt: true }), BANKRUPT_TEXT);
  assert.equal(BANKRUPT_TEXT.match(/[.!?]/g).length, 1);
  const r = build([{ event: 'Died', timestamp: at(0) }, { event: 'Resurrect', timestamp: at(30), Option: 'free', Cost: 0, Bankrupt: true }]);
  const v = r.view({ balance: 1000 }, T0 + 60_000);
  assert.equal(rebuyReminders(v)[0].level, 'danger');
  assert.match(rebuyReminders(v)[0].text, /^Faillite : /);
});

test('options non mesurées : affichées telles quelles, marquées à vérifier', () => {
  assert.equal(resurrectText({ option: 'recover', cost: 1500, bankrupt: false }), `Résurrection (option « recover ») : ${fr(1500)} cr payés.`);
  assert.equal(build([{ event: 'Resurrect', Option: 'HandIn', Cost: 0 }]).resurrect.optionStatus, 'à vérifier');
});

test('destruction : ce qui a été perdu, relevé avant que le Coup d’œil ne l’efface', () => {
  const events = [
    { event: 'Cargo', Vessel: 'Ship', Count: 12 },
    { event: 'Bounty', TotalReward: 1_200_000 },
    { event: 'ScanOrganic', ScanType: 'Analyse', Species: 'x', Species_Localised: 'X' },
    { event: 'Died', timestamp: at(0) },
    { event: 'Resurrect', timestamp: at(40), Option: 'rebuy', Cost: 4_498_040, Bankrupt: false },
  ];
  // Même ordre que index.js : le rachat relève la perte, puis l'état du Coup d'œil l'efface
  const glance = buildGlance([]);
  const r = new RebuyState();
  for (const ev of events) {
    r.apply(ev, { loss: ev.event === 'Died' ? deathLoss(glance, r.cargoTons) : null });
    glance.apply(ev);
  }
  assert.equal(glance.bounties, 0);
  assert.equal(r.resurrect.loss, `Perdu : 1,2 M cr de primes, 1 échantillon exobio, 12 t de soute.`);
  assert.equal(r.cargoTons, 0);
  assert.equal(lossText({ bounties: 0, bonds: 0, exploration: 0, exobiology: { count: 0 }, cargo: 0 }), null);
});

// Achat de limpets réel du 5 nov. 2026 : ils ne passent jamais par MarketBuy
const buyDrones = { timestamp: '2026-11-05T15:23:03Z', event: 'BuyDrones', Type: 'Drones', Count: 332, BuyPrice: 101, TotalCost: 33_532 };

test('total « en jeu » : rachat + à encaisser + soute au dernier prix vu', () => {
  const r = build([
    loadout(),
    { event: 'MarketSell', timestamp: '2026-11-07T13:49:51Z', Type: 'iridium', Count: 90, SellPrice: 194_385 },
    buyDrones,
  ]);
  // Noms de Cargo.json (soute de l'état du jeu) : Name « drones », Name_Localised « Drone »
  const cargo = [
    { name: 'iridium', label: 'Iridium', count: 268 },
    { name: 'drones', label: 'Drone', count: 20 },
    { name: 'platinum', label: 'Platine', count: 4 },
  ];
  const v = r.view({ balance: 823_047_781, toCash: 2_405_962, cargo }, T0);
  const soute = 268 * 194_385 + 20 * 101;
  assert.equal(v.atStake.cargo, soute);
  assert.equal(v.atStake.total, 4_498_040 + 2_405_962 + soute);
  assert.deepEqual(v.atStake.unpriced, [{ name: 'platinum', label: 'Platine', count: 4 }]);
  // Rien en jeu (ni rachat connu, ni encaissement, ni soute chiffrée) : pas de total
  assert.equal(new RebuyState().view({ balance: 0 }, T0).atStake, null);

  assert.equal(v.atStake.missionTons, 0);
  // Cargaison de mission (missionId) : pas à toi, hors du total, dite à part ; même marchandise qu'un lot à toi
  const avecMission = r.view({ balance: 823_047_781, toCash: 2_405_962, cargo: [...cargo, { name: 'iridium', label: 'Iridium', count: 50, missionId: 1234 }] }, T0);
  assert.equal(avecMission.atStake.cargo, soute, 'les 50 t de mission ne comptent pas');
  assert.equal(avecMission.atStake.total, v.atStake.total);
  assert.equal(avecMission.atStake.missionTons, 50);
});

test('limpets : prix appris de BuyDrones et SellDrones (journaux de référence), écoutés par le module', () => {
  assert.ok(REBUY_EVENTS.includes('BuyDrones') && REBUY_EVENTS.includes('SellDrones'));
  const r = new RebuyState();
  // Vente du 29 oct. 2026 à 100 cr, puis achat du 5 nov. à 101 cr : le dernier prix vu l'emporte
  assert.equal(r.apply({ timestamp: '2026-10-29T10:17:31Z', event: 'SellDrones', Type: 'Drones', Count: 172, SellPrice: 100, TotalSale: 17_200 }), false);
  assert.deepEqual(r.prices.value([{ name: 'drones', label: 'Drone', count: 30 }]), { value: 3000, unpriced: [] });
  r.apply(buyDrones);
  assert.deepEqual(r.prices.value([{ name: 'drones', label: 'Drone', count: 30 }]), { value: 3030, unpriced: [] });
  assert.equal(r.prices.prices.get('drones').source, 'achat');
});

test('prix : un prix nul ou absent n’efface pas le dernier prix connu', () => {
  const r = build([
    { event: 'MarketSell', Type: 'Iridium', SellPrice: 174_729 },
    { event: 'MarketSell', Type: 'iridium', SellPrice: 0 },
  ]);
  assert.equal(r.prices.value([{ name: 'iridium', count: 1 }]).value, 174_729);
});

test('soute du SRV ignorée pour la perte à la destruction', () => {
  const r = build([{ event: 'Cargo', Vessel: 'Ship', Count: 30 }, { event: 'Cargo', Vessel: 'SRV', Count: 2 }]);
  assert.equal(r.cargoTons, 30);
});

test('deux commandants, même ShipID (audit M7) : ni le nom ni le rachat de l’Anaconda ne passent à la Cobra du second compte', () => {
  const UN = { FID: 'F0000001', Commander: 'Testeur' };
  const DEUX = { FID: 'F0000002', Commander: 'Testeur 2' };
  const r = new RebuyState();
  r.apply({ event: 'LoadGame', ...UN, Ship: 'Anaconda', Ship_Localised: 'Anaconda Test', ShipID: 1, GameMode: 'Solo' });
  r.apply({ event: 'Loadout', Ship: 'anaconda', ShipID: 1, Rebuy: 9_000_000 });
  assert.equal(r.shipLabel(), 'Anaconda Test');
  // Second compte lancé : jusqu'à son Loadout, aucun vaisseau (ni le rachat de l'Anaconda)
  r.apply({ event: 'LoadGame', ...DEUX, Ship: 'CobraMkIII', Ship_Localised: 'Cobra Test', ShipID: 1, GameMode: 'Solo' });
  assert.equal(r.ship, null);
  r.apply({ event: 'Loadout', Ship: 'cobramkiii', ShipID: 1, Rebuy: 50_000 });
  assert.deepEqual([r.shipLabel(), r.ship.rebuy], ['Cobra Test', 50_000]);
  // Retour au compte principal, lancé en SRV (LoadGame sans le nom du vaisseau) : son Anaconda, pas « Cobra Test »
  r.apply({ event: 'LoadGame', ...UN, Ship: 'TestBuggy', ShipID: 32, GameMode: 'Solo' });
  r.apply({ event: 'Loadout', Ship: 'anaconda', ShipID: 1, Rebuy: 9_000_000 });
  assert.equal(r.shipLabel(), 'Anaconda Test');
});
