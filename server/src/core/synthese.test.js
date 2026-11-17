// Synthèse de l'état du jeu : Status.json décodé, doublons résolus (le plus récent gagne), missions, SRV, fichier écrit
// seulement en direct.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bits, FLAGS, lireStatus } from './statusFlags.js';
import { Synthese } from './synthese.js';

const T = (m) => `2026-11-12T10:${String(m).padStart(2, '0')}:00Z`;

test('Status.json : indicateurs en clair, énergie en pips, véhicule, carburant', () => {
  // 151060485 : à quai, train sorti, masse bloquée, dans le vaisseau, mode analyse (relevé réel, 12 nov. 2026)
  const d = lireStatus({ timestamp: T(1), event: 'Status', Flags: 151060485, Flags2: 0, Pips: [2, 8, 2], FireGroup: 0, GuiFocus: 0, Fuel: { FuelMain: 58.449997, FuelReservoir: 0.65737 }, Cargo: 0, LegalState: 'Allied', Balance: 916894299 });
  assert.deepEqual(Object.keys(d.indicateurs).sort(), ['aQuai', 'dansVaisseau', 'masseBloquee', 'modeAnalyse', 'trainSorti']);
  assert.deepEqual(d.pips, { sys: 1, mot: 4, arm: 1 });
  assert.equal(d.vehicule, 'vaisseau');
  assert.equal(d.groupeTir, 1);
  assert.equal(d.ecran, undefined);
  assert.deepEqual(d.carburant, { principal: 58.45, reservoir: 0.657 });
  assert.equal(d.credits, 916894299);
  // Bit 31 (pleins phares du SRV) : jamais un nombre négatif
  assert.deepEqual(bits(2 ** 31, FLAGS), { srvPleinsPhares: true });
  // À pied : oxygène et santé en %, véhicule « a pied »
  const pied = lireStatus({ event: 'Status', Flags: 0, Flags2: 1 | 16, Oxygen: 0.5, Health: 0.92, Temperature: 293.4, GuiFocus: 6 });
  assert.equal(pied.vehicule, 'a pied');
  assert.equal(pied.oxygene, 50);
  assert.equal(pied.sante, 92);
  assert.equal(pied.ecran, 'carte de la galaxie');
  assert.equal(lireStatus({ event: 'Cargo' }), null);
});

test('synthèse : vaisseau, coque, boucliers, crédits les plus récents, SRV et son carburant', () => {
  const s = new Synthese();
  s.applyEvent({ timestamp: T(1), event: 'LoadGame', Commander: 'Testeur', Credits: 1000 });
  s.applyEvent({ timestamp: T(2), event: 'Loadout', Ship: 'panthermkii', ShipID: 31, ShipName: ' ', ShipIdent: 'TS-01', HullHealth: 0.93, CargoCapacity: 1184, MaxJumpRange: 41.29, FuelCapacity: { Main: 64, Reserve: 1.11 }, Rebuy: 20559981, Modules: [{ Slot: 'Armour', Health: 0.5 }, { Slot: 'MainEngines', Health: 1 }] });
  s.applyStatus({ timestamp: T(3), event: 'Status', Flags: (1 << 24) | (1 << 3), Fuel: { FuelMain: 50, FuelReservoir: 1 }, Balance: 2000 });
  s.applyEvent({ timestamp: T(4), event: 'HullDamage', Health: 0.6, PlayerPilot: true, Fighter: false });
  s.applyEvent({ timestamp: T(4), event: 'HullDamage', Health: 0.1, PlayerPilot: false, Fighter: true }); // le chasseur : pas ta coque
  s.applyEvent({ timestamp: T(5), event: 'ShieldState', ShieldsUp: false });
  let v = s.snapshot();
  assert.equal(v.commandant, 'Testeur');
  assert.equal(v.credits, 2000); // Status.json, plus récent que LoadGame
  assert.equal(v.vaisseau.nom, null); // « » n'est pas un nom
  assert.equal(v.vaisseau.coque, 60);
  assert.equal(v.vaisseau.boucliers, false);
  assert.deepEqual(v.vaisseau.carburant, { principal: 50, reservoir: 1 });
  assert.deepEqual(v.vaisseau.modulesAbimes, [{ emplacement: 'Armour', sante: 50 }]);
  assert.deepEqual(v.evenements.map((e) => e.quoi), ['boucliers tombés', 'coque à 60 %']);
  // Dans le SRV : le carburant de Status.json est celui du SRV, plus celui du vaisseau
  s.applyEvent({ timestamp: T(6), event: 'LaunchSRV', SRVType: 'testbuggy', SRVType_Localised: 'VRS Rhino', PlayerControlled: true });
  s.applyStatus({ timestamp: T(7), event: 'Status', Flags: 1 << 26, Fuel: { FuelMain: 0.42, FuelReservoir: 0 } });
  v = s.snapshot();
  assert.equal(v.enDirect.vehicule, 'srv');
  assert.equal(v.vaisseau.carburant, null);
  assert.deepEqual(v.srv.carburant, { principal: 0.42, reservoir: 0 });
  assert.equal(v.srv.type, 'VRS Rhino');
  assert.equal(v.vaisseau.boucliers, false); // pas dans le vaisseau : le bit du Status ne dit rien de ses boucliers
});

test('synthèse : position, quai, interdiction par un joueur sans son nom, missions actives', () => {
  const s = new Synthese();
  s.applyEvent({ timestamp: T(1), event: 'MissionAccepted', MissionID: 1, LocalisedName: 'Livrer de l’or', Faction: 'Faction Test', DestinationSystem: 'Système Test', Expiry: T(59), Reward: 500000, Commodity_Localised: 'Or', Count: 12 });
  s.applyEvent({ timestamp: T(2), event: 'MissionAccepted', MissionID: 2, LocalisedName: 'Vieille mission' });
  s.applyEvent({ timestamp: T(3), event: 'Missions', Active: [{ MissionID: 1, Name: 'Mission_Delivery_name', Expires: 600 }, { MissionID: 3, Name: 'Mission_Massacre_name', Expires: 60 }] });
  s.applyEvent({ timestamp: T(4), event: 'FSDJump', StarSystem: 'Système Test', SystemAddress: 42, SystemSecurity_Localised: 'Sécurité élevée', Population: 10, ControllingPower: 'Puissance Test', PowerplayState: 'Exploited', Factions: [{ Name: 'A', Influence: 0.2 }, { Name: 'B', Influence: 0.7, FactionState: 'Boom', MyReputation: 100 }] });
  s.applyEvent({ timestamp: T(5), event: 'Docked', StationName: 'Station Test', StationType: 'Coriolis', DistFromStarLS: 120.4, StationServices: ['dock', 'refuel'] });
  s.applyEvent({ timestamp: T(6), event: 'Interdicted', Submitted: false, Interdictor: 'Autre Joueur', IsPlayer: true });
  s.applyEvent({ timestamp: T(7), event: 'MissionCompleted', MissionID: 3 });
  const v = s.snapshot();
  assert.equal(v.position.systeme, 'Système Test');
  assert.equal(v.position.station, 'Station Test');
  assert.equal(v.position.aQuai, true);
  assert.equal(v.position.securite, 'Sécurité élevée');
  assert.deepEqual(v.position.factions.map((f) => f.nom), ['B', 'A']);
  assert.equal(v.position.factions[0].influence, 70);
  assert.deepEqual(v.combat.interdiction, { at: T(6), parUnJoueur: true, soumis: false });
  assert.ok(!JSON.stringify(v).includes('Autre Joueur'));
  assert.deepEqual(v.missions.map((m) => m.nom), ['Livrer de l’or']); // 2 n'est plus active, 3 finie
  assert.equal(v.missions[0].marchandise, '12 Or');
  assert.equal(v.missions[0].expire, '2026-11-12T10:13:00.000Z'); // Missions (au lancement) : 600 s après
  assert.ok(v.evenements.some((e) => e.quoi === 'mission finie : Massacre'));
});

test('synthèse : fichiers du jeu (soute, marché, sac, itinéraire), parties détaillées', () => {
  const s = new Synthese();
  s.applyFichier('cargo', { timestamp: T(1), event: 'Cargo', Vessel: 'Ship', Inventory: [{ Name: 'gold', Name_Localised: 'Or', Count: 20 }, { Name: 'tea', Count: 3, Stolen: 1 }] });
  s.applyFichier('market', { timestamp: T(2), StationName: 'Station Test', StarSystem: 'Système Test', Items: [{ Name_Localised: 'Or', BuyPrice: 9000, SellPrice: 8800, Stock: 100, Demand: 0 }, { Name_Localised: 'Rien', Stock: 0, Demand: 0 }] });
  s.applyFichier('backpack', { timestamp: T(3), Items: [], Components: [], Consumables: [{ Name: 'healthpack', Name_Localised: 'Médikit', Count: 2 }], Data: [] });
  s.applyFichier('navroute', { timestamp: T(4), Route: [{ StarSystem: 'Départ' }, { StarSystem: 'Milieu' }, { StarSystem: 'Arrivée' }] });
  s.applyFichier('inconnu', { timestamp: T(5) });
  const v = s.snapshot();
  assert.deepEqual(v.soute, [{ nom: 'Or', quantite: 20 }, { nom: 'tea', quantite: 3, volee: 1 }]);
  assert.deepEqual(v.marche, { at: T(2), station: 'Station Test', systeme: 'Système Test', articles: 1 });
  assert.deepEqual(v.route, { etapes: 2, fin: 'Arrivée', debut: 'Départ', prochainSysteme: null, sautsRestants: null });
  assert.equal(v.sac.total, 1);
  assert.deepEqual(s.partie('marche').articles, [{ nom: 'Or', categorie: null, achat: 9000, vente: null, stock: 100, demande: 0 }]);
  assert.deepEqual(s.partie('sac').consommables, [{ nom: 'Médikit', quantite: 2 }]);
  assert.equal(s.partie('soute').length, 2);
  assert.equal(s.partie('nimporte'), null);
});

test('synthèse : fichier écrit seulement en direct, regroupé', async () => {
  const ecrits = [];
  const s = new Synthese({ fichier: 'etat-jeu.json', ecrire: (f, v) => ecrits.push([f, v.commandant]), ecritureMs: 10 });
  s.applyEvent({ timestamp: T(1), event: 'Commander', Name: 'Testeur' }); // relecture de l'historique : rien
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(ecrits.length, 0);
  s.enDirect();
  s.applyEvent({ timestamp: T(2), event: 'HeatWarning' });
  s.applyEvent({ timestamp: T(3), event: 'HeatWarning' });
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(ecrits, [['etat-jeu.json', 'Testeur']]);
  s.stop();
});

test('synthèse : rien de réécrit quand le contenu n’a pas changé ; réécrit après une écriture ratée', async () => {
  const ecrits = [];
  let rate = false;
  const s = new Synthese({ fichier: 'etat-jeu.json', ecrire: (f, v) => { if (rate) throw new Error('EPERM'); ecrits.push(v.commandant); }, ecritureMs: 5 });
  const attendre = () => new Promise((r) => setTimeout(r, 25));
  s.applyEvent({ timestamp: T(1), event: 'Commander', Name: 'Testeur' });
  s.enDirect();
  await attendre();
  s.changed(); // rien de neuf
  await attendre();
  assert.deepEqual(ecrits, ['Testeur'], 'même contenu : pas de nouvelle écriture');
  rate = true;
  s.applyEvent({ timestamp: T(2), event: 'Commander', Name: 'Testeur Deux' });
  await attendre();
  rate = false;
  s.changed(); // même contenu que l'essai raté : réécrit quand même
  await attendre();
  assert.deepEqual(ecrits, ['Testeur', 'Testeur Deux']);
  s.stop();
});
