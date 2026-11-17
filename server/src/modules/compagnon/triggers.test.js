// Tests des déclencheurs du compagnon, sur des lignes réelles du journal (octobre-novembre 2026, jeu 4.4.2.1).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLAG, GONE_MS, IDLE_MS, MERITS_QUIET_MS, MINING_QUIET_MS, SALE_QUIET_MS, Triggers, goodsName, momentOf } from './triggers.js';

const T0 = new Date(2026, 10, 7, 21, 15, 18).getTime(); // 21 h 15, heure locale : le soir
const ev = (o, t = T0) => ({ timestamp: new Date(t).toISOString(), ...o });
const loadGame = (t = T0) => ev({ event: 'LoadGame', FID: 'F0000000', Commander: 'Testeur', Ship: 'LakonMiner', Ship_Localised: 'Type-11 Prospector', ShipID: 43, ShipName: '', ShipIdent: '', FuelLevel: 30.85, FuelCapacity: 32, GameMode: 'Solo', Credits: 823047781 }, t);
const docked = ev({ event: 'Docked', StationName: 'Flinders City', StationType: 'Outpost', StarSystem: 'Synuefe GA-I b57-6', MarketID: 4224076803 });

/** Déclencheurs en direct après un historique, l'heure avançant d'un événement à l'autre. */
function live(history = [], opts) {
  const t = new Triggers(opts);
  t.prime(history);
  return t;
}
const cats = (list) => list.map((x) => x.category);

test('moment de la journée selon l’heure locale', () => {
  assert.equal(momentOf(new Date(2026, 10, 7, 8, 0)), 'matin');
  assert.equal(momentOf(new Date(2026, 10, 7, 14, 0)), 'aprem');
  assert.equal(momentOf(new Date(2026, 10, 7, 21, 0)), 'soir');
  assert.equal(momentOf(new Date(2026, 10, 7, 2, 0)), 'nuit');
});

test('bonjour au lancement : nom du CMDR, vaisseau, moment, après un délai ; rien pour l’historique', () => {
  const t = new Triggers();
  t.prime([loadGame(T0 - 3600_000)]); // lancement passé : aucun bonjour, mais le nom est connu
  assert.equal(t.commander, 'Testeur');
  const [hello] = t.event(loadGame(), T0);
  assert.equal(hello.category, 'bonjour');
  assert.equal(hello.cas, 'soir');
  assert.deepEqual(hello.ctx, { cmdr: 'Testeur', vaisseau: 'Type-11 Prospector' });
  assert.ok(hello.delay > 0);
});

test('bonjour après plusieurs jours sans jouer : cas « retour »', () => {
  const t = live([loadGame(T0 - 5 * 86_400_000)]);
  t.event(ev({ event: 'Fileheader', part: 1 }), T0);
  t.event(ev({ event: 'Commander', FID: 'F0000000', Name: 'Testeur' }), T0);
  const [hello] = t.event(loadGame(), T0);
  assert.equal(hello.cas, 'retour');
});

test('ventes : bénéfice (prix de vente − prix moyen payé) × quantité, cumulé sur la série', () => {
  const t = live([docked], { minProfit: 100_000, bigProfit: 20_000_000 });
  // Deux ventes réelles de thé de Fujin (2 nov.) : 23 × (16 775 − 1 545) + 19 × (16 775 − 1 545)
  t.event(ev({ event: 'MarketSell', MarketID: 128674695, Type: 'fujintea', Type_Localised: 'Thé de Fujin', Count: 23, SellPrice: 16775, TotalSale: 385825, AvgPricePaid: 1545 }), T0);
  t.event(ev({ event: 'MarketSell', MarketID: 128674695, Type: 'fujintea', Type_Localised: 'Thé de Fujin', Count: 19, SellPrice: 16775, TotalSale: 318725, AvgPricePaid: 1545 }), T0 + 3000);
  assert.deepEqual(t.tick(T0 + 3000 + SALE_QUIET_MS - 1), [], 'la série n’est pas finie');
  const [sale] = t.tick(T0 + 3000 + SALE_QUIET_MS);
  assert.equal(sale.category, 'vente');
  assert.deepEqual(sale.ctx, { marchandise: 'Thé de Fujin', quantite: 42, station: 'Flinders City', profit: 42 * 15230 });
});

test('vente de minerai (prix payé 0) au-delà du seuil : très grosse vente ; sous le seuil : rien', () => {
  const t = live([docked]);
  t.event(ev({ event: 'MarketSell', MarketID: 4235814659, Type: 'iridium', Count: 268, SellPrice: 174729, TotalSale: 46827372, AvgPricePaid: 0 }), T0);
  const [sale] = t.tick(T0 + SALE_QUIET_MS);
  assert.equal(sale.category, 'jackpot');
  assert.equal(sale.ctx.profit, 46827372);
  assert.equal(sale.ctx.marchandise, 'Iridium', 'code du jeu mis en forme, faute de nom traduit');
  t.event(ev({ event: 'MarketSell', Type: 'gold', Count: 1, SellPrice: 50000, AvgPricePaid: 0 }), T0 + 60_000);
  assert.deepEqual(t.tick(T0 + 60_000 + SALE_QUIET_MS), []);
});

test('nom d’une marchandise : traduit par le jeu, sinon son code mis en forme', () => {
  assert.equal(goodsName({ Type: 'titanium', Type_Localised: 'Titane' }), 'Titane');
  assert.equal(goodsName({ Type: 'iridium' }), 'Iridium');
  assert.equal(goodsName({ Type: '$iridium_name;' }), 'Iridium');
  assert.equal(goodsName({}), null);
});

test('vente à perte', () => {
  const t = live([docked]);
  t.event(ev({ event: 'MarketSell', Type: 'palladium', Count: 10, SellPrice: 45000, AvgPricePaid: 47745 }), T0);
  const [loss] = t.tick(T0 + SALE_QUIET_MS);
  assert.equal(loss.category, 'perte');
  assert.equal(loss.ctx.perte, 27450);
});

test('mérites : cumulés sur la série (ventes réelles du 7 nov.), cas « gros » au-delà de 2 000', () => {
  const t = live();
  t.event(ev({ event: 'PowerplayMerits', Power: 'Aisling Duval', MeritsGained: 2015, TotalMerits: 1296259 }), T0);
  t.event(ev({ event: 'PowerplayMerits', Power: 'Aisling Duval', MeritsGained: 1773, TotalMerits: 1296017 }), T0 + 9000);
  assert.deepEqual(t.tick(T0 + 9000 + MERITS_QUIET_MS - 1), []);
  const [m] = t.tick(T0 + 9000 + MERITS_QUIET_MS);
  assert.equal(m.category, 'merites');
  assert.equal(m.cas, 'gros');
  assert.deepEqual(m.ctx, { merites: 3788, total: 1296017, puissance: 'Aisling Duval' });
});

test('minage : fin de rafale après 90 s sans raffinage, 5 t au moins', () => {
  const refined = ev({ event: 'MiningRefined', Type: '$iridium_name;', Type_Localised: 'Iridium' });
  const t = live();
  for (let i = 0; i < 6; i += 1) t.event(refined, T0 + i * 10_000);
  assert.deepEqual(t.tick(T0 + 50_000 + MINING_QUIET_MS - 1), []);
  const [m] = t.tick(T0 + 50_000 + MINING_QUIET_MS);
  assert.equal(m.category, 'minage');
  assert.deepEqual(m.ctx, { tonnes: 6, minerai: 'Iridium' });
  assert.equal(m.cas, undefined);
  for (let i = 0; i < 3; i += 1) t.event(refined, T0 + 300_000);
  assert.deepEqual(t.tick(T0 + 300_000 + MINING_QUIET_MS), [], 'moins de 5 t : rien');
});

test('amarrage accordé, refusé avec la raison en français', () => {
  const t = live();
  const [ok] = t.event(ev({ event: 'DockingGranted', LandingPad: 4, MarketID: 4224076803, StationName: 'Flinders City', StationType: 'Outpost' }), T0);
  assert.deepEqual(ok, { category: 'amarrage', ctx: { station: 'Flinders City', plateforme: 4 } });
  const [no] = t.event(ev({ event: 'DockingDenied', Reason: 'Distance', MarketID: 3700000001, StationName: 'TST-001', StationType: 'FleetCarrier' }), T0);
  assert.equal(no.category, 'refus');
  assert.equal(no.cas, 'distance');
  assert.deepEqual(no.ctx, { station: 'TST-001', raison: 'trop loin' });
  const [odd] = t.event(ev({ event: 'DockingDenied', Reason: 'Bizarre', StationName: 'X' }), T0);
  assert.equal(odd.cas, undefined);
  assert.equal(odd.ctx.raison, 'sans explication');
  const [hostile] = t.event(ev({ event: 'DockingDenied', Reason: 'Hostile', StationName: 'X' }), T0);
  assert.equal(hostile.ctx.raison, 'on nous considère comme hostiles', 'c’est la station qui nous juge hostiles, pas l’inverse');
});

test('interdiction subie (soumission), évitée, tentative en cours (Status.json) ; jamais le nom d’un joueur', () => {
  const t = live();
  const [sub] = t.event(ev({ event: 'Interdicted', Submitted: true, Interdictor: 'Csaba', IsPlayer: false, Faction: "Cashibo People's Party" }), T0);
  assert.deepEqual(sub, { category: 'interdiction', cas: 'soumis', ctx: { interdicteur: 'Csaba' } });
  assert.ok(t.inCombat(T0 + 1000));
  const [esc] = t.event(ev({ event: 'EscapeInterdiction', Interdictor: 'SomeCmdr', IsPlayer: true }), T0);
  assert.deepEqual(esc.ctx, { interdicteur: 'un autre commandant' });
  const [npc] = t.event(ev({ event: 'EscapeInterdiction', Interdictor: '$npc_name_decorate:#name=X;', IsPlayer: false }), T0);
  assert.equal(npc.ctx.interdicteur, null);

  const s = live();
  s.status({ Flags: FLAG.inMainShip }, T0, { initial: true });
  assert.deepEqual(cats(s.status({ Flags: FLAG.inMainShip | FLAG.beingInterdicted }, T0 + 1000)), ['interception']);
  assert.deepEqual(cats(s.status({ Flags: FLAG.inMainShip | FLAG.beingInterdicted | 8 }, T0 + 2000)), [], 'une seule fois');
});

const shields = (up) => ev({ event: 'ShieldState', ShieldsUp: up });
const attacked = ev({ event: 'UnderAttack', Target: 'You' });
const rhino = ev({ event: 'LoadGame', FID: 'F0000000', Commander: 'Testeur', Ship: 'MEV_Rhino', Ship_Localised: 'VRS Rhino', ShipID: 40, ShipName: '', ShipIdent: '', FuelLevel: 0, FuelCapacity: 0, GameMode: 'Solo' });

test('boucliers en combat : attaque juste avant (26 oct.), puis rétablis ; ignorés juste après une réapparition', () => {
  const t = live();
  t.event(ev({ event: 'Resurrect', Option: 'rebuy', Cost: 20559981, Bankrupt: false }), T0);
  t.event(attacked, T0 + 2000);
  assert.deepEqual(t.event(shields(false), T0 + 4000), [], 'le jeu l’écrit en réapparaissant');
  t.event(attacked, T0 + 98_000);
  assert.deepEqual(cats(t.event(shields(false), T0 + 120_000)), ['boucliers'], 'attaque 22 s avant');
  assert.ok(t.inCombat(T0 + 121_000));
  assert.deepEqual(cats(t.event(shields(true), T0 + 150_000)), ['boucliersRetour']);
  assert.deepEqual(t.event(shields(true), T0 + 160_000), []);
});

test('boucliers : signe de combat juste après (attaque 5 s plus tard, 2 nov.) ; sans signe, boucliers coupés : rien', () => {
  const t = live();
  assert.deepEqual(t.event(shields(false), T0), [], 'on attend un signe de combat');
  assert.equal(t.inCombat(T0 + 1000), false, 'des boucliers tombés seuls ne font pas un combat');
  assert.deepEqual(cats(t.event(attacked, T0 + 5000)), ['boucliers']);
  assert.ok(t.inCombat(T0 + 6000));

  const off = live();
  assert.deepEqual(off.event(shields(false), T0), [], 'coupés à la main, panne d’énergie, vol au ras d’une planète…');
  assert.deepEqual(off.tick(T0 + 20_000), []);
  assert.equal(off.inCombat(T0 + 20_000), false, 'il ne se tait pas pour rien');
  assert.deepEqual(cats(off.event(attacked, T0 + 20_000)), [], 'attaque 20 s après : trop tard pour ces boucliers-là');
  assert.deepEqual(off.event(shields(true), T0 + 30_000), [], 'pas de « rétablis » pour une chute non signalée');

  const hull = live();
  hull.event(shields(false), T0);
  assert.deepEqual(cats(hull.event(ev({ event: 'HullDamage', Health: 0.79, PlayerPilot: true, Fighter: false }), T0 + 6000)), ['boucliers', 'degats']);
});

test('boucliers après une fuite en hyperespace (27 oct. : police à la sortie de station, saut, boucliers écrits à l’arrivée) : rien', () => {
  const t = live([loadGame()]);
  t.event(attacked, T0);
  assert.ok(t.inCombat(T0 + 1000));
  t.event(ev({ event: 'FSDJump', Taxi: false, Multicrew: false, StarSystem: 'LTT 619', SystemAddress: 671759476153, JumpDist: 12.5 }), T0 + 50_000);
  assert.equal(t.inCombat(T0 + 50_000), false, 'le combat est resté dans l’autre système');
  assert.deepEqual(t.event(shields(false), T0 + 50_000), []);
  assert.deepEqual(t.tick(T0 + 70_000), []);
});

test('boucliers du VRS (Rhino, 29 oct. et 3 nov.) et de la combinaison : jamais d’alerte', () => {
  const srv = live([rhino]);
  srv.event(attacked, T0);
  assert.deepEqual(srv.event(shields(false), T0 + 1000), [], 'chargé dans le VRS');
  const back = live([rhino, ev({ event: 'DockSRV', SRVType: 'mev_rhino', SRVType_Localised: 'VRS Rhino', ID: 40 })]);
  back.event(attacked, T0);
  assert.deepEqual(cats(back.event(shields(false), T0 + 1000)), ['boucliers'], 'remonté à bord : le vaisseau compte de nouveau');
  const out = live([loadGame(), ev({ event: 'LaunchSRV', SRVType: 'mev_rhino', Loadout: 'base', ID: 44, PlayerControlled: true })]);
  out.event(attacked, T0);
  assert.deepEqual(out.event(shields(false), T0 + 1000), [], 'VRS sorti');

  const foot = live([loadGame(), ev({ event: 'Disembark', SRV: false, Taxi: false, Multicrew: false, ID: 36, OnStation: false, OnPlanet: true })]);
  foot.event(attacked, T0);
  assert.deepEqual(foot.event(shields(false), T0 + 1000), [], 'combinaison en zone de conflit');
  const suit = live();
  suit.status({ Flags: 0, Flags2: 1 }, T0, { initial: true }); // à pied, d'après Status.json
  suit.event(attacked, T0);
  assert.deepEqual(suit.event(shields(false), T0 + 1000), []);
});

test('boucliers d’un vaisseau posé (Status.json) : pas d’alerte', () => {
  const t = live([loadGame()]);
  t.status({ Flags: FLAG.inMainShip | FLAG.landed | 8 }, T0, { initial: true });
  t.event(attacked, T0);
  assert.deepEqual(t.event(shields(false), T0 + 1000), []);
  t.status({ Flags: FLAG.inMainShip | 8 }, T0 + 2000); // redécollé
  assert.deepEqual(cats(t.event(shields(false), T0 + 3000)), ['boucliers']);
});

test('dégâts sur la coque (pilote), coque en danger ; pas ceux du chasseur', () => {
  const t = live();
  const [hit] = t.event(ev({ event: 'HullDamage', Health: 0.798882, PlayerPilot: true }), T0);
  assert.deepEqual(hit, { category: 'degats', ctx: { coque: 80 } });
  assert.deepEqual(cats(t.event(ev({ event: 'HullDamage', Health: 0.21, PlayerPilot: true }), T0)), ['coqueCritique']);
  assert.deepEqual(t.event(ev({ event: 'HullDamage', Health: 0.5, PlayerPilot: false, Fighter: true }), T0), []);
});

test('destruction et réapparition en vaisseau (rachat, ou gratuite)', () => {
  const t = live([loadGame()]);
  t.event(ev({ event: 'UnderAttack', Target: 'You' }), T0);
  assert.ok(t.inCombat(T0 + 1000));
  const [died] = t.event(ev({ event: 'Died' }), T0 + 2000);
  assert.deepEqual(died, { category: 'mort', cas: 'vaisseau', ctx: {} });
  assert.equal(t.inCombat(T0 + 3000), false, 'le combat s’arrête avec la destruction');
  const [paid] = t.event(ev({ event: 'Resurrect', Option: 'rebuy', Cost: 20559981, Bankrupt: false }), T0 + 40_000);
  assert.deepEqual(paid, { category: 'reapparition', cas: 'rachat', ctx: { cout: 20559981 } });
  const [free] = t.event(ev({ event: 'Resurrect', Option: 'rejoin', Cost: 0, Bankrupt: false }), T0 + 80_000);
  assert.equal(free.cas, 'gratuit');
});

test('mort à pied en zone de conflit (29 oct. : Disembark, Died 49 s plus tard, Resurrect « rejoin » gratuit)', () => {
  const t = live([loadGame()]);
  t.event(ev({ event: 'Disembark', SRV: true, Taxi: false, Multicrew: false, ID: 40, OnStation: false, OnPlanet: true }), T0);
  const [died] = t.event(ev({ event: 'Died' }), T0 + 49_000);
  assert.deepEqual(died, { category: 'mort', cas: 'pied', ctx: {} });
  t.status({ Flags: FLAG.inMainShip }, T0 + 60_000); // l'état a pu changer entre-temps : la mort, elle, était à pied
  const [back] = t.event(ev({ event: 'Resurrect', Option: 'rejoin', Cost: 0, Bankrupt: false }), T0 + 90_000);
  assert.deepEqual(back, { category: 'reapparition', cas: 'pied', ctx: { cout: null } }, 'pas de « crash » ni de rachat à pied');
});

test('bonjour : le modèle du vaisseau, pas son nom ; à pied, pas de vaisseau (8 chargements sur 66)', () => {
  const t = live();
  const named = ev({ event: 'LoadGame', Commander: 'Testeur', Ship: 'Federation_Corvette', Ship_Localised: 'Federal Corvette', ShipName: 'Nostromo' });
  assert.equal(t.event(named, T0)[0].ctx.vaisseau, 'Federal Corvette');
  const suit = ev({ event: 'LoadGame', Commander: 'Testeur', Ship: 'ExplorationSuit_Class1', Ship_Localised: 'Combinaison Artemis', ShipID: 4294436180, ShipName: '', ShipIdent: '' });
  const [hello] = t.event(suit, T0 + 60_000);
  assert.equal(hello.ctx.vaisseau, null, 'jamais « Ton Combinaison Artemis »');
  assert.equal(t.vehicle, 'foot');
  assert.equal(t.event(rhino, T0 + 120_000)[0].ctx.vaisseau, 'VRS Rhino');
  assert.equal(t.vehicle, 'srv');
});

test('jeu disparu sans « Shutdown » (plantage, 9 sessions sur 49) : plus joué après 20 min sans nouvelles, repris au prochain événement', () => {
  const t = live();
  t.event(loadGame(), T0);
  t.event(ev({ event: 'StartJump', JumpType: 'Hyperspace', StarSystem: 'Col 285 Sector AN-G b25-1' }), T0 + 1000);
  assert.ok(t.gameOn);
  assert.deepEqual(cats(t.tick(T0 + 1000 + IDLE_MS)), ['ennui'], 'il s’endort d’abord');
  t.tick(T0 + GONE_MS); // dernier signe à T0 + 1 s
  assert.ok(t.gameOn, 'pas encore');
  t.tick(T0 + 1000 + GONE_MS);
  assert.equal(t.gameOn, false);
  assert.equal(t.sleeping, false, 'humeur de fond neutre, fenêtre fermée');
  assert.deepEqual(t.tick(T0 + 3 * GONE_MS), []);
  t.event(ev({ event: 'Music', MusicTrack: 'MainMenu' }), T0 + 4 * GONE_MS);
  assert.ok(t.gameOn, 'de retour');

  // Status.json qui change compte aussi comme un signe de vie
  const s = live();
  s.status({ Flags: FLAG.inMainShip }, T0, { initial: true });
  s.event(loadGame(), T0);
  s.status({ Flags: FLAG.inMainShip | 8 }, T0 + GONE_MS - 1000);
  s.tick(T0 + GONE_MS);
  assert.ok(s.gameOn);
});

test('carburant bas : au passage sous 25 % (indicateur du jeu), avec le pourcentage du réservoir principal', () => {
  const t = live([ev({ event: 'Loadout', Ship: 'lakonminer', FuelCapacity: { Main: 32, Reserve: 0.6 } })]);
  t.status({ Flags: FLAG.inMainShip, Fuel: { FuelMain: 10, FuelReservoir: 0.5 } }, T0, { initial: true });
  const [low] = t.status({ Flags: FLAG.inMainShip | FLAG.lowFuel, Fuel: { FuelMain: 7.5, FuelReservoir: 0.5 } }, T0 + 1000);
  assert.deepEqual(low, { category: 'carburant', ctx: { carburant: 23 } });
  assert.deepEqual(t.status({ Flags: FLAG.inMainShip | FLAG.lowFuel, Fuel: { FuelMain: 7 } }, T0 + 2000), []);
  // À quai : pas d'alerte
  const d = live();
  d.status({ Flags: FLAG.inMainShip | FLAG.docked }, T0, { initial: true });
  assert.deepEqual(d.status({ Flags: FLAG.inMainShip | FLAG.docked | FLAG.lowFuel }, T0 + 1000), []);
});

test('Status.json au démarrage : aucune réaction ; indicateurs à zéro (menu) : pas une action', () => {
  const t = live();
  assert.deepEqual(t.status({ Flags: FLAG.inMainShip | FLAG.lowFuel }, T0, { initial: true }), []);
  t.event(ev({ event: 'Shutdown' }), T0);
  t.status({ Flags: 0, Flags2: 0 }, T0 + 1000);
  assert.equal(t.gameOn, false);
});

test('promotions : rangs du jeu ; rangs Powerplay seulement les premiers et les ronds', () => {
  const t = live();
  const [trade] = t.event(ev({ event: 'Promotion', Trade: 13 }), T0);
  assert.deepEqual(trade, { category: 'rang', ctx: { domaine: 'Commerce', niveau: 13 } });
  assert.equal(t.event(ev({ event: 'Promotion', Exobiologist: 1 }), T0)[0].ctx.domaine, 'Exobiologie');
  assert.deepEqual(t.event(ev({ event: 'PowerplayRank', Power: 'Aisling Duval', Rank: 165 }), T0), []);
  const [pp] = t.event(ev({ event: 'PowerplayRank', Power: 'Aisling Duval', Rank: 170 }), T0);
  assert.equal(pp.cas, 'powerplay');
  assert.deepEqual(pp.ctx, { domaine: 'Powerplay', niveau: 170, puissance: 'Aisling Duval' });
});

test('ingénieurs : invitation, déblocage, grade 5 ; la liste complète du chargement ne dit rien', () => {
  const t = live();
  const one = (o) => t.event(ev({ event: 'EngineerProgress', ...o }), T0);
  assert.equal(one({ Engineer: 'Ram Tah', EngineerID: 300110, Progress: 'Invited' })[0].cas, 'invite');
  const [unlocked] = one({ Engineer: 'Tiana Fortune', EngineerID: 300270, Progress: 'Unlocked', Rank: 1 });
  assert.deepEqual(unlocked, { category: 'ingenieur', cas: 'debloque', ctx: { ingenieur: 'Tiana Fortune' } });
  assert.deepEqual(one({ Engineer: 'Tiana Fortune', EngineerID: 300270, Rank: 4 }), []);
  assert.equal(one({ Engineer: 'Tiana Fortune', EngineerID: 300270, Rank: 5 })[0].cas, 'grade5');
  assert.deepEqual(one({ Engineers: [{ Engineer: 'Hera Tani', EngineerID: 300090, Progress: 'Unlocked', RankProgress: 0, Rank: 5 }] }), []);
});

test('porteur : saut programmé (destination, heure de départ), puis arrivée', () => {
  const t = live();
  const departure = '2026-11-05T13:01:10Z';
  const [req] = t.event(ev({ event: 'CarrierJumpRequest', CarrierType: 'FleetCarrier', CarrierID: 3700000001, SystemName: 'Synuefe OU-E c28-2', Body: 'Synuefe OU-E c28-2 11 a', DepartureTime: departure }), T0);
  assert.equal(req.category, 'porteur');
  assert.equal(req.ctx.systeme, 'Synuefe OU-E c28-2');
  assert.equal(req.ctx.heure, new Date(departure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
  const [arr] = t.event(ev({ event: 'CarrierJump', Docked: true, StationName: 'TST-001', StarSystem: 'Synuefe OU-E c28-2' }), T0);
  assert.deepEqual(arr, { category: 'porteurArrivee', ctx: { systeme: 'Synuefe OU-E c28-2' } });
});

test('nouveau système : seulement ceux jamais visités d’après l’historique', () => {
  const jump = (sys, d = 38.42) => ev({ event: 'FSDJump', Taxi: false, StarSystem: sys, SystemAddress: 1, JumpDist: d });
  const t = live([jump('Synuefe OU-E c28-2')]);
  assert.deepEqual(t.event(jump('Synuefe OU-E c28-2'), T0), []);
  const [news] = t.event(jump('Synuefe GA-I b57-6', 21.7), T0);
  assert.deepEqual(news, { category: 'nouveauSysteme', ctx: { systeme: 'Synuefe GA-I b57-6', distance: 21.7 } });
  assert.deepEqual(t.event(jump('Synuefe GA-I b57-6'), T0 + 60_000), [], 'déjà visité, maintenant');
});

test('longue inactivité : il s’endort une fois, se réveille à la reprise ; pas après la fermeture du jeu', () => {
  const t = live();
  t.event(ev({ event: 'Music', MusicTrack: 'NoTrack' }), T0); // le jeu tourne
  t.event(ev({ event: 'Docked', StationName: 'Flinders City' }), T0);
  t.event(ev({ event: 'ReceiveText', From: 'x', Message: 'y', Channel: 'npc' }), T0 + IDLE_MS - 1000); // pas une action
  const [bored] = t.tick(T0 + IDLE_MS);
  assert.deepEqual(bored, { category: 'ennui', ctx: { minutes: 15 } });
  assert.equal(t.sleeping, true);
  assert.deepEqual(t.tick(T0 + IDLE_MS + 60_000), []);
  assert.deepEqual(cats(t.event(ev({ event: 'Undocked', StationName: 'Flinders City' }), T0 + IDLE_MS + 90_000)), ['reveil']);
  assert.equal(t.sleeping, false);
  assert.deepEqual(cats(t.event(ev({ event: 'Shutdown' }), T0 + IDLE_MS + 100_000)), ['aurevoir']);
  assert.deepEqual(t.tick(T0 + 3 * IDLE_MS), [], 'jeu fermé : pas d’ennui');
});

test('combat : signes du journal pendant 1 min, ou indicateur « en danger » de Status.json', () => {
  const t = live();
  t.event(ev({ event: 'UnderAttack', Target: 'Fighter' }), T0);
  assert.equal(t.inCombat(T0 + 1000), false);
  t.event(ev({ event: 'Bounty', Rewards: [{ Faction: 'Far Systems Protectorate', Reward: 173716 }], Target: 'viper' }), T0);
  assert.ok(t.inCombat(T0 + 59_000));
  assert.equal(t.inCombat(T0 + 61_000), false);
  t.status({ Flags: FLAG.inMainShip | FLAG.danger }, T0 + 120_000);
  assert.ok(t.inCombat(T0 + 500_000));
});
