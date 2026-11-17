// Vaisseau actuel et embarquement (core/boarding.js), sur des suites d'événements de la forme mesurée dans les journaux
// de l’auteur (23 oct.-7 nov. 2026 ; noms et identifiants de joueurs retirés).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isOwnShipType, modelName, ShipTracker } from './boarding.js';

// Données de référence de test (table FDevIDs des vaisseaux) : jamais celles du PC
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-boarding-'));
fs.mkdirSync(path.join(DATA, 'reference', 'fdevids'), { recursive: true });
fs.writeFileSync(path.join(DATA, 'reference', 'fdevids', 'shipyard.csv'), 'id,symbol,name,entitlement\n129036130,LakonMiner,Type-11 Prospector,ELITE_V_LAKON_MINER\n129030680,Mandalay,Mandalay,\n');
process.env.ELITE_DATA_DIR = DATA;
process.on('exit', () => fs.rmSync(DATA, { recursive: true, force: true }));

let t0 = Date.parse('2026-11-07T08:00:00Z');
const at = () => new Date((t0 += 1000)).toISOString();
const E = {
  loadGame: (Ship, ShipID, extra = {}) => ({ event: 'LoadGame', timestamp: at(), Commander: 'Testeur', Ship, ShipID, ShipName: '', ShipIdent: '', GameMode: 'Solo', ...extra }),
  loadout: (Ship, ShipID, extra = {}) => ({ event: 'Loadout', timestamp: at(), Ship, ShipID, ShipName: '', ShipIdent: 'TS-01', Modules: [], ...extra }),
  swap: (ShipType, ShipID, StoreShipID, extra = {}) => ({ event: 'ShipyardSwap', timestamp: at(), ShipType, ShipID, StoreOldShip: 'X', StoreShipID, ...extra }),
  buy: (ShipType, old) => ({ event: 'ShipyardBuy', timestamp: at(), ShipType, ShipPrice: 1, ...old }),
  new: (ShipType, NewShipID, extra = {}) => ({ event: 'ShipyardNew', timestamp: at(), ShipType, NewShipID, ...extra }),
  embark: (ID, flags = {}) => ({ event: 'Embark', timestamp: at(), SRV: false, Taxi: false, Multicrew: false, ID, ...flags }),
  disembark: (ID, flags = {}) => ({ event: 'Disembark', timestamp: at(), SRV: false, Taxi: false, Multicrew: false, ID, ...flags }),
};
const kinds = (tr, evs) => evs.map((ev) => tr.apply(ev).boarding).map((b) => (b ? `${b.kind}:${b.shipId}` : null));

test('types : SRV, chasseurs, combinaisons et taxis ne sont pas « ton vaisseau »', () => {
  for (const t of ['LakonMiner', 'federation_corvette', 'PantherMkII', 'explorer_nx', 'MediumTransport01', 'cutter', 'type9_military', 'empire_eagle', 'independant_trader']) assert.equal(isOwnShipType(t), true, t);
  for (const t of ['MEV_Rhino', 'mev_rhino', 'TestBuggy', 'combat_multicrew_srv_01', 'ExplorationSuit_Class1', 'FlightSuit', 'TacticalSuit_Class3', 'empire_fighter', 'gdn_hybrid_fighter_v1', 'adder_taxi', '', null, 7]) assert.equal(isOwnShipType(t), false, String(t));
});

test('lancement du jeu : le même vaisseau est un lancement, un autre un changement', () => {
  const tr = new ShipTracker();
  const lancement = E.loadGame('Federation_Corvette', 26, { Ship_Localised: 'Federal Corvette' });
  assert.deepEqual(kinds(tr, [lancement, E.loadout('federation_corvette', 26)]), ['change:26', null]);
  assert.deepEqual(tr.ship(), { shipId: 26, commander: 'nom:Testeur', type: 'federation_corvette', model: 'Federal Corvette', name: null });
  assert.equal(tr.running, true);
  tr.apply({ event: 'Shutdown', timestamp: at() });
  assert.equal(tr.running, false);
  assert.deepEqual(kinds(tr, [E.loadGame('Federation_Corvette', 26), E.loadout('federation_corvette', 26)]), ['launch:26', null]);
  assert.deepEqual(kinds(tr, [E.loadGame('Explorer_NX', 36, { Ship_Localised: 'Caspian Explorer' }), E.loadout('explorer_nx', 36)]), ['change:36', null]);
});

test('équipement, retour du SRV, rachat, retour à bord à pied : même vaisseau, rien', () => {
  const tr = new ShipTracker();
  kinds(tr, [E.loadGame('PantherMkII', 31), E.loadout('panthermkii', 31)]);
  const suite = [
    E.loadout('panthermkii', 31), // après l'équipement
    { event: 'LaunchSRV', timestamp: at(), SRVType: 'mev_rhino', ID: 40, PlayerControlled: true },
    E.embark(40, { SRV: true }),
    { event: 'DockSRV', timestamp: at(), SRVType: 'mev_rhino', ID: 40 },
    E.loadout('panthermkii', 31),
    { event: 'Died', timestamp: at() },
    { event: 'Resurrect', timestamp: at(), Option: 'rebuy', Cost: 20559981, Bankrupt: false },
    E.loadout('panthermkii', 31, { HullHealth: 1 }),
    E.disembark(31, { OnStation: true }),
    E.embark(31, { OnStation: true }),
    E.loadout('panthermkii', 31),
  ];
  assert.deepEqual(kinds(tr, suite), suite.map(() => null));
  assert.equal(tr.ship().shipId, 31);
});

test('changements : échange au chantier naval, achat (numéro neuf ou repris), Loadout d’un autre numéro', () => {
  const tr = new ShipTracker();
  kinds(tr, [E.loadGame('PantherMkII', 31), E.loadout('panthermkii', 31)]);
  // Échange : ShipyardSwap puis Loadout du vaisseau pris
  assert.deepEqual(kinds(tr, [E.swap('anaconda', 9, 31), E.loadout('anaconda', 9)]), ['change:9', null]);
  // Achat en gardant l'ancien : ShipyardBuy (StoreShipID), ShipyardNew (NewShipID), Loadout
  assert.deepEqual(kinds(tr, [E.buy('lakonminer', { StoreOldShip: 'Anaconda', StoreShipID: 9 }), E.new('lakonminer', 29, { ShipType_Localised: 'Type-11 Prospector' }), E.loadout('lakonminer', 29)]), [null, 'change:29', null]);
  // Achat en vendant l'ancien : le jeu redonne son numéro au neuf (Panther n° 30 → Mandalay n° 30, 24 oct.)
  kinds(tr, [E.swap('panthermkii', 30, 29), E.loadout('panthermkii', 30)]);
  const vente = E.buy('mandalay', { SellOldShip: 'PantherMkII', SellShipID: 30, SellPrice: 1 });
  const r = tr.apply(vente);
  assert.deepEqual(r.sold, [30]);
  assert.equal(tr.ship(), null, 'l’ancien est vendu');
  assert.deepEqual(kinds(tr, [E.new('mandalay', 30), E.loadout('mandalay', 30)]), ['change:30', null]);
  assert.equal(tr.ship().model, 'Mandalay', 'modèle de la table de référence');
  // Loadout d'un autre numéro sans événement de chantier (cas rattrapé)
  assert.deepEqual(kinds(tr, [E.loadout('lakonminer', 29)]), ['change:29']);
  // Un autre modèle sous le même numéro : changement aussi
  assert.deepEqual(kinds(tr, [E.loadout('krait_mkii', 29)]), ['change:29']);
});

test('ventes : ShipyardSell, SellShipOnRebuy, ShipyardBuy ; noms oubliés', () => {
  const tr = new ShipTracker();
  kinds(tr, [E.loadGame('Explorer_NX', 36), E.loadout('explorer_nx', 36, { ShipName: 'Ancien nom' })]);
  tr.apply({ event: 'StoredShips', timestamp: at(), ShipsHere: [{ ShipID: 29, ShipType: 'LakonMiner', ShipType_Localised: 'Type-11 Prospector', Name: 'Nom stocké' }], ShipsRemote: [{ ShipID: 40, ShipType: 'mev_rhino' }] });
  assert.equal(tr.typeOf(29), 'lakonminer');
  assert.equal(tr.typeOf(40), null, 'un SRV n’est pas noté');
  assert.deepEqual(tr.apply({ event: 'ShipyardSell', timestamp: at(), ShipType: 'LakonMiner', SellShipID: 29, ShipPrice: 1 }).sold, [29]);
  assert.equal(tr.typeOf(29), null);
  assert.deepEqual(tr.apply({ event: 'SellShipOnRebuy', timestamp: at(), ShipType: 'cutter', SellShipId: 22, ShipPrice: 1 }).sold, [22]);
  assert.deepEqual(tr.apply({ event: 'ShipyardSell', timestamp: at(), SellShipID: 'x' }).sold, []);
  assert.equal(tr.ship().shipId, 36, 'vendre un autre vaisseau ne change pas le tien');
});

test('lancé en SRV, à pied ou en taxi', () => {
  // En SRV, vaisseau connu : c'est un lancement de ce vaisseau (mesuré : LoadGame MEV_Rhino n° 44, puis DockSRV, Loadout n° 43)
  let tr = new ShipTracker();
  kinds(tr, [E.loadGame('LakonMiner', 43), E.loadout('lakonminer', 43), { event: 'Shutdown', timestamp: at() }]);
  assert.deepEqual(kinds(tr, [E.loadGame('MEV_Rhino', 44, { Ship_Localised: 'VRS Rhino' }), { event: 'DockSRV', timestamp: at(), ID: 44 }, E.loadout('lakonminer', 43)]), ['launch:43', null, null]);
  // En SRV, vaisseau inconnu (premier lancement de l'app) : le Loadout du retour le fait connaître
  tr = new ShipTracker();
  assert.deepEqual(kinds(tr, [E.loadGame('MEV_Rhino', 44), E.loadout('lakonminer', 43)]), [null, 'change:43']);
  // À pied (combinaison n° 4293000002, mesuré) : le lancement compte au retour à bord…
  tr = new ShipTracker();
  kinds(tr, [E.loadGame('PantherMkII', 31), E.loadout('panthermkii', 31), { event: 'Shutdown', timestamp: at() }]);
  assert.deepEqual(kinds(tr, [E.loadGame('ExplorationSuit_Class1', 4293000002, { Ship_Localised: 'Combinaison Artemis' }), E.embark(31), E.loadout('panthermkii', 31), E.embark(31)]), [null, 'launch:31', null, null]);
  assert.equal(tr.ship().shipId, 31, 'la combinaison n’est jamais le vaisseau');
  // … ou dès l'Embark dans le SRV de ton vaisseau (30 oct. : LoadGame à pied, sorties en SRV, DockSRV et Loadout deux
  // heures plus tard) : le retour du SRV n'est plus un lancement
  tr = new ShipTracker();
  kinds(tr, [E.loadGame('PantherMkII', 31), E.loadout('panthermkii', 31), { event: 'Shutdown', timestamp: at() }]);
  const srv = [E.embark(40, { SRV: true }), E.disembark(40, { SRV: true }), E.embark(40, { SRV: true }), { event: 'DockSRV', timestamp: at(), SRVType: 'mev_rhino', ID: 40 }, E.loadout('panthermkii', 31)];
  assert.deepEqual(kinds(tr, [E.loadGame('ExplorationSuit_Class1', 4293000002), ...srv]), [null, 'launch:31', null, null, null, null]);
  // Sans vaisseau connu (premier lancement de l'app) : le SRV ne dit pas lequel, le Loadout du retour le fait connaître
  tr = new ShipTracker();
  assert.deepEqual(kinds(tr, [E.loadGame('ExplorationSuit_Class1', 4293000002), E.embark(40, { SRV: true }), E.loadout('panthermkii', 31)]), [null, null, 'change:31']);
  // En taxi : rien tant que tu n'es pas remonté dans ton vaisseau
  tr = new ShipTracker();
  kinds(tr, [E.loadGame('PantherMkII', 31), E.loadout('panthermkii', 31), { event: 'Shutdown', timestamp: at() }]);
  assert.deepEqual(kinds(tr, [E.loadGame('adder_taxi', 99), E.loadout('adder_taxi', 99), E.disembark(99, { Taxi: true }), E.embark(31), E.loadout('panthermkii', 31)]), [null, null, null, 'launch:31', null]);
});

test('taxi et équipage multijoueur pris en route : le vaisseau des autres ne compte pas', () => {
  const tr = new ShipTracker();
  kinds(tr, [E.loadGame('PantherMkII', 31), E.loadout('panthermkii', 31)]);
  // Taxi Apex : Embark Taxi, Loadout éventuel du taxi ignoré, puis Disembark Taxi
  assert.deepEqual(kinds(tr, [E.disembark(31), E.embark(12, { Taxi: true }), E.loadout('adder', 12), E.disembark(12, { Taxi: true })]), [null, null, null, null]);
  assert.equal(tr.ship().shipId, 31);
  // Équipage d'un autre CMDR : son vaisseau a peut-être un numéro et un Loadout, ils ne sont pas à toi
  assert.deepEqual(kinds(tr, [{ event: 'JoinACrew', timestamp: at(), Captain: 'Autre' }, E.loadout('cutter', 5), E.embark(5, { Multicrew: true }), { event: 'QuitACrew', timestamp: at(), Captain: 'Autre' }]), [null, null, null, null]);
  assert.equal(tr.ship().shipId, 31);
  // Chasseur : jamais ton vaisseau
  assert.deepEqual(kinds(tr, [E.loadout('empire_fighter', 41)]), [null]);
  // De retour : un Loadout du même vaisseau ne dit rien
  assert.deepEqual(kinds(tr, [E.loadout('panthermkii', 31)]), [null]);
});

test('équipage multijoueur : descendre à pied du vaisseau de l’hôte (Disembark Multicrew) ne fait pas quitter l’équipage', () => {
  // Constat du 9 nov. : away était remis à null au Disembark Multicrew, comme si tu étais revenu avec ton vaisseau
  const tr = new ShipTracker();
  kinds(tr, [E.loadGame('PantherMkII', 31), E.loadout('panthermkii', 31)]);
  const away = (ev) => {
    tr.apply(ev);
    return tr.away;
  };
  assert.equal(away({ event: 'JoinACrew', timestamp: at(), Captain: 'Autre' }), 'crew');
  assert.equal(away(E.embark(5, { Multicrew: true })), 'crew');
  assert.equal(away(E.disembark(5, { Multicrew: true })), 'crew', 'à pied, toujours dans l’équipage');
  assert.deepEqual(kinds(tr, [E.loadout('cutter', 5)]), [null], 'le Loadout de l’hôte reste écarté');
  assert.equal(away(E.embark(5, { Multicrew: true })), 'crew');
  assert.equal(away({ event: 'QuitACrew', timestamp: at(), Captain: 'Autre' }), null, 'l’équipage finit au QuitACrew');
  // Fin aussi au Shutdown, au LoadGame, ou en remontant dans ton propre vaisseau
  for (const fin of [{ event: 'Shutdown', timestamp: at() }, E.loadGame('PantherMkII', 31), E.embark(31)]) {
    tr.apply({ event: 'JoinACrew', timestamp: at(), Captain: 'Autre' });
    tr.apply(E.disembark(5, { Multicrew: true }));
    assert.equal(away(fin), null, fin.event);
  }
  // Taxi : descendre du taxi finit le trajet
  assert.equal(away(E.embark(12, { Taxi: true })), 'taxi');
  assert.equal(away(E.disembark(12, { Taxi: true })), null);
});

test('vrai changement de vaisseau daté (boardedAt), relecture comprise ; pas la découverte du vaisseau ni un lancement', () => {
  const tr = new ShipTracker();
  tr.apply(E.loadGame('PantherMkII', 31));
  assert.equal(tr.boardedAt, null, 'découverte du vaisseau au début du journal');
  tr.apply({ event: 'Shutdown', timestamp: at() });
  tr.apply(E.loadGame('PantherMkII', 31));
  tr.apply(E.loadout('panthermkii', 31));
  assert.equal(tr.boardedAt, null, 'lancement dans le même vaisseau');
  const swap = E.swap('federation_corvette', 26, 31);
  tr.apply(swap);
  assert.equal(tr.boardedAt, Date.parse(swap.timestamp));
  const neuf = E.new('mandalay', 30);
  tr.apply(neuf);
  assert.equal(tr.boardedAt, Date.parse(neuf.timestamp), 'vaisseau neuf');
});

test('vaisseau neuf sous le numéro de l’ancien, vendu à l’achat (Panther n° 30 → Mandalay n° 30, 24 oct.) : vrai changement, daté', () => {
  const tr = new ShipTracker();
  kinds(tr, [E.loadGame('PantherMkII', 30), E.loadout('panthermkii', 30)]);
  assert.equal(tr.boardedAt, null);
  tr.apply(E.buy('mandalay', { SellOldShip: 'PantherMkII', SellShipID: 30, SellPrice: 1 }));
  assert.equal(tr.ship(), null);
  const neuf = E.new('mandalay', 30);
  assert.deepEqual(tr.apply(neuf).boarding, { kind: 'change', shipId: 30, previous: null });
  assert.equal(tr.boardedAt, Date.parse(neuf.timestamp), 'un choix fait dans le Panther ne vaut plus pour le Mandalay');
});

test('noms : traduit par le jeu, sinon table de référence, sinon nom interne ; nom en jeu fait d’espaces = sans nom', () => {
  assert.equal(modelName('lakonminer', 'Type-11 Prospector'), 'Type-11 Prospector');
  assert.equal(modelName('LakonMiner'), 'Type-11 Prospector');
  assert.equal(modelName('python_nx'), 'Python_nx');
  const tr = new ShipTracker();
  kinds(tr, [E.loadGame('PantherMkII', 31, { Ship_Localised: 'Panther Clipper Mk II' }), E.loadout('panthermkii', 31, { ShipName: ' ' })]);
  assert.deepEqual(tr.ship(), { shipId: 31, commander: 'nom:Testeur', type: 'panthermkii', model: 'Panther Clipper Mk II', name: null });
  tr.apply({ event: 'SetUserShipName', timestamp: at(), Ship: 'panthermkii', ShipID: 31, UserShipName: 'Nom &amp; test', UserShipId: 'TS-01' });
  assert.equal(tr.ship().name, 'Nom & test', 'texte du jeu nettoyé');
  assert.equal(tr.ship().model, 'Panther Clipper Mk II');
});

test('événements bancals : rien ne casse, rien ne change', () => {
  const tr = new ShipTracker();
  for (const ev of [null, {}, { event: 'Loadout' }, { event: 'Loadout', ShipID: '31', Ship: 'panthermkii' }, { event: 'ShipyardSwap', ShipID: -1, ShipType: 'cutter' }, { event: 'StoredShips', ShipsHere: 'x' }, { event: 'Embark', ID: 'x' }, { event: 'LoadGame', Ship: 'Cutter', ShipID: 1.5 }]) {
    assert.doesNotThrow(() => tr.apply(ev));
  }
  assert.equal(tr.ship(), null);
});

// --- Plusieurs commandants sur le même PC (audit du 15 nov. 2026, M7) : « Testeur » (F0000001, n° 1 = Anaconda) et
// « Testeur 2 » (F0000002, n° 1 = Cobra) ---

const UN = { FID: 'F0000001', Commander: 'Testeur' };
const DEUX = { FID: 'F0000002', Commander: 'Testeur 2' };

test('deux commandants, même ShipID : l’autre compte est un changement de vaisseau, chacun garde ses vaisseaux et leurs noms', () => {
  const tr = new ShipTracker();
  assert.deepEqual(kinds(tr, [E.loadGame('Anaconda', 1, { ...UN, ShipName: 'Grande Test' }), E.loadout('anaconda', 1, { ShipName: 'Grande Test' })]), ['change:1', null]);
  assert.equal(tr.commander, 'F0000001');
  assert.deepEqual(tr.ship(), { shipId: 1, commander: 'F0000001', type: 'anaconda', model: 'Anaconda', name: 'Grande Test' });
  tr.apply({ event: 'Shutdown', timestamp: at() });
  // Second compte, même numéro, autre modèle : jamais « le même vaisseau », jamais « un autre modèle sous ce numéro »
  const r = tr.apply(E.loadGame('CobraMkIII', 1, { ...DEUX, Ship_Localised: 'Cobra Mk III' }));
  assert.equal(r.commanderChanged, true);
  assert.equal(r.commander, 'F0000002');
  assert.deepEqual(r.boarding, { kind: 'change', shipId: 1, previous: null });
  assert.notEqual(tr.boardedAt, null, 'vrai changement de vaisseau, daté : un choix fait dans l’Anaconda ne vaut plus');
  assert.deepEqual(tr.ship(), { shipId: 1, commander: 'F0000002', type: 'cobramkiii', model: 'Cobra Mk III', name: null }, 'le nom de l’Anaconda ne passe pas à la Cobra');
  assert.equal(tr.typeOf(1), 'cobramkiii');
  // Vente du n° 1 par le second compte : l’Anaconda du premier reste connue
  const vente = tr.apply({ event: 'ShipyardSell', timestamp: at(), ShipType: 'cobramkiii', SellShipID: 1, ShipPrice: 1 });
  assert.deepEqual(vente.sold, [1]);
  assert.equal(vente.commander, 'F0000002');
  tr.apply({ event: 'Shutdown', timestamp: at() });
  // LoadGame sans nom (ShipName absent) : le nom appris reste
  const { ShipName: _n, ...retour } = E.loadGame('Anaconda', 1, UN);
  assert.deepEqual(kinds(tr, [retour]), ['change:1']);
  assert.equal(tr.ship().name, 'Grande Test', 'retour au compte principal : son vaisseau et son nom');
  // Relog du même commandant dans le même vaisseau : un lancement, comme avant
  tr.apply({ event: 'Shutdown', timestamp: at() });
  assert.deepEqual(kinds(tr, [E.loadGame('Anaconda', 1, UN)]), ['launch:1']);
});

test('second compte lancé à pied : plus de vaisseau actuel (celui d’avant est à l’autre) ; son embarquement est un changement', () => {
  const tr = new ShipTracker();
  kinds(tr, [E.loadGame('Anaconda', 1, UN), E.loadout('anaconda', 1)]);
  tr.apply(E.loadGame('ExplorationSuit_Class1', 4293000002, DEUX));
  assert.equal(tr.ship(), null);
  assert.deepEqual(kinds(tr, [E.embark(1)]), ['change:1']);
  assert.equal(tr.ship().commander, 'F0000002');
});

test('commandant connu seulement au premier LoadGame : les vaisseaux vus avant lui sont les siens, pas un changement', () => {
  const tr = new ShipTracker();
  kinds(tr, [E.loadout('anaconda', 1, { ShipName: 'Grande Test' })]);
  assert.equal(tr.commander, null);
  assert.deepEqual(kinds(tr, [E.loadGame('Anaconda', 1, { ...UN, ShipName: 'Grande Test' })]), ['launch:1']);
  assert.equal(tr.ship().name, 'Grande Test');
  assert.equal(tr.ship().commander, 'F0000001');
});
