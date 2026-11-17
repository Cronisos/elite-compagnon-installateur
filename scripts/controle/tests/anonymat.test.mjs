// Anonymisation des séances (anonymat/anonymiser.mjs) et extraction (seances/extraire.mjs), sur des journaux inventés :
// aucun vrai nom ici.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anonymizeEvent, anonymizeJournal, carrierSignal, leaks, playerName, Secrets, strayCallsigns, CMDR, FID } from '../anonymat/anonymiser.mjs';
import { extrait, verifier } from '../seances/extraire.mjs';

const T = (s) => `2026-11-01T10:${s}Z`;
const JOURNAL = [
  { timestamp: T('00:00'), event: 'Fileheader', part: 1 },
  { timestamp: T('00:01'), event: 'Commander', FID: 'F7654321', Name: 'Zorglub' },
  { timestamp: T('00:02'), event: 'LoadGame', FID: 'F7654321', Commander: 'Zorglub', ShipName: 'Bécane', ShipIdent: 'ZG-01', Credits: 5 },
  { timestamp: T('00:03'), event: 'SquadronStartup', SquadronID: 4242, SquadronName: 'Les Zorgs', CurrentRank: 3 },
  { timestamp: T('00:04'), event: 'CarrierStats', CarrierID: 3700999001, Callsign: 'ZZZ-999', Name: 'MARS', FuelLevel: 500 },
  { timestamp: T('00:05'), event: 'Docked', StationName: 'ZZZ-999', StationType: 'FleetCarrier', MarketID: 3700999001, StarSystem: 'Marseille Sector' },
  { timestamp: T('00:06'), event: 'ReceiveText', From: 'Bob Ami', Message: 'salut Zorglub', Channel: 'friend' },
  { timestamp: T('00:07'), event: 'SendText', To: 'Bob Ami', Message: 'coucou' },
  { timestamp: T('00:08'), event: 'Friends', Status: 'Online', Name: 'Bob Ami' },
  { timestamp: T('00:09'), event: 'WingJoin', Others: ['Bob Ami', 'Alice Aile'] },
  { timestamp: T('00:10'), event: 'ShipTargeted', TargetLocked: true, PilotName: '$cmdr_decorate:#name=Méchant Joueur;', PilotName_Localised: 'CMDR Méchant Joueur', SquadronID: 'BADS' },
  { timestamp: T('00:11'), event: 'FSSSignalDiscovered', SignalName: 'AUTRE NOM QQQ-111', SignalType: 'FleetCarrier', IsStation: true },
  { timestamp: T('00:12'), event: 'FSSSignalDiscovered', SignalName: 'MARS ZZZ-999', SignalType: 'FleetCarrier', IsStation: true },
  { timestamp: T('00:13'), event: 'FSSSignalDiscovered', SignalName: 'HMS-123 Hercules-class Cargo', SignalType: 'Megaship' },
  { timestamp: T('00:14'), event: 'SupercruiseDestinationDrop', Type: 'MARS ZZZ-999', Threat: 0 },
  { timestamp: T('00:15'), event: 'SuitLoadout', LoadoutName: 'Ma tenue secrète' },
  { timestamp: T('00:16'), event: 'MarketSell', MarketID: 3228342528, Type: 'gold', Count: 4242, SellPrice: 4242 },
  { timestamp: T('00:17'), event: 'Interdicted', Submitted: false, Interdictor: 'Pirate Humain', IsPlayer: true },
];

function geler(evs) {
  const s = new Secrets();
  for (const e of evs) s.collect(e);
  return s.finish();
}

test('anonymat : nom, FID, escadron, porteur, amis, joueurs, vaisseaux et tenues remplacés partout, chat retiré', () => {
  const g = geler(JOURNAL);
  const out = anonymizeJournal(JOURNAL.map((e) => JSON.stringify(e)).join('\n'), g);
  const evs = out.trimEnd().split('\r\n').map((l) => JSON.parse(l));
  assert.ok(out.endsWith('\r\n'), 'fin de ligne du jeu');
  assert.deepEqual(evs.map((e) => e.event).filter((e) => /Text|Friends/.test(e)), [], 'chat et amis retirés');
  assert.equal(evs.length, JOURNAL.length - 3);
  const by = (name) => evs.filter((e) => e.event === name);
  assert.equal(by('Commander')[0].Name, CMDR);
  assert.equal(by('Commander')[0].FID, FID);
  assert.equal(by('LoadGame')[0].Commander, CMDR);
  assert.equal(by('LoadGame')[0].ShipName, 'Vaisseau 1');
  assert.equal(by('LoadGame')[0].ShipIdent, 'TS-01');
  assert.equal(by('LoadGame')[0].Credits, 5, 'le reste ne bouge pas');
  assert.equal(by('SquadronStartup')[0].SquadronName, 'Escadron Test');
  assert.equal(by('SquadronStartup')[0].SquadronID, 1);
  // Porteur du joueur : même indicatif, même nom et même identifiant partout
  const stats = by('CarrierStats')[0];
  assert.deepEqual([stats.Name, stats.Callsign, stats.CarrierID], ['PORTEUR 1', 'TST-001', 3700000001]);
  assert.deepEqual([by('Docked')[0].StationName, by('Docked')[0].MarketID], ['TST-001', 3700000001]);
  assert.equal(by('Docked')[0].StarSystem, 'Marseille Sector', 'mot entier seulement : « Marseille » reste');
  assert.equal(by('SupercruiseDestinationDrop')[0].Type, 'PORTEUR 1 TST-001');
  const signals = by('FSSSignalDiscovered').map((e) => e.SignalName);
  assert.equal(signals[0], 'PORTEUR AUT-001', 'porteur d’un autre : remplacé dans son champ');
  assert.equal(signals[1], 'PORTEUR 1 TST-001');
  assert.equal(signals[2], 'HMS-123 Hercules-class Cargo', 'mégavaisseau (PNJ) : gardé');
  assert.deepEqual(by('WingJoin')[0].Others, ['Coéquipier 2', 'Coéquipier 1']);
  const target = by('ShipTargeted')[0];
  assert.equal(target.PilotName, '$cmdr_decorate:#name=Joueur 1;');
  assert.equal(target.PilotName_Localised, 'CMDR Joueur 1');
  assert.equal(target.SquadronID, 'TS01');
  assert.equal(by('Interdicted')[0].Interdictor, 'Joueur 2');
  assert.equal(by('SuitLoadout')[0].LoadoutName, 'Tenue 1');
  // Un nombre égal au numéro d'escadron, ailleurs, n'est pas touché ; un MarketID de station publique non plus
  assert.deepEqual([by('MarketSell')[0].Count, by('MarketSell')[0].MarketID], [4242, 3228342528]);
  // Plus rien de secret
  assert.deepEqual(leaks(out, g.strict), []);
  assert.deepEqual(leaks(out, g.forbidden, { words: true }), []);
  assert.deepEqual(strayCallsigns(out), []);
  assert.deepEqual(verifier(out, g), []);
});

test('anonymat : la vérification trouve un secret oublié, sans le recopier', () => {
  const g = geler(JOURNAL);
  const fuite = '{"event":"Music","MusicTrack":"zorglub-theme"}\r\n{"event":"Docked","StationName":"ABC-123"}\r\n{"event":"ReceiveText","Message":"x"}\r\n';
  const p = verifier(fuite, g);
  assert.equal(p.length, 3);
  assert.match(p[0], /nom du commandant ou du FID/);
  assert.match(p[1], /indicatif/);
  assert.match(p[2], /chat/);
  for (const ligne of p) assert.doesNotMatch(ligne, /zorglub|ABC-123/i, 'la valeur n’est jamais recopiée');
  assert.deepEqual(leaks('un F7654321 caché', g.strict), ['f7654321']);
  assert.deepEqual(leaks('Les Zorgsss', g.forbidden, { words: true }), [], 'mot entier');
});

test('anonymat : noms de joueurs dans les champs du jeu', () => {
  assert.equal(playerName('$cmdr_decorate:#name=Jean Dupont;'), 'Jean Dupont');
  assert.equal(playerName('CMDR Jean'), 'Jean');
  assert.equal(playerName('Cmdr Jean'), 'Jean');
  assert.equal(playerName('$npc_name_decorate:#name=Bob;'), null);
  assert.equal(playerName('Bob'), null);
  assert.deepEqual(carrierSignal({ event: 'FSSSignalDiscovered', SignalType: 'FleetCarrier', SignalName: 'LE NOM ABC-12D' }), { field: 'SignalName', name: 'LE NOM', callsign: 'ABC-12D' });
  assert.equal(carrierSignal({ event: 'FSSSignalDiscovered', SignalType: 'Megaship', SignalName: 'ABC-123 Hercules-class' }), null);
  assert.equal(anonymizeEvent({ event: 'ReceiveText', Message: 'x' }, geler([])), null);
});

test('extraction : en-tête du journal gardé, puis seulement la fenêtre demandée', () => {
  const lignes = [
    { timestamp: '2026-11-01T09:00:00Z', event: 'Fileheader' },
    { timestamp: '2026-11-01T09:00:10Z', event: 'LoadGame' },
    { timestamp: '2026-11-01T09:00:20Z', event: 'Location' },
    { timestamp: '2026-11-01T09:00:30Z', event: 'Missions' },
    { timestamp: '2026-11-01T09:30:00Z', event: 'FSDJump', n: 1 },
    { timestamp: '2026-11-01T10:00:00Z', event: 'FSDJump', n: 2 },
    { timestamp: '2026-11-01T11:00:00Z', event: 'FSDJump', n: 3 },
  ].map((e) => JSON.stringify(e)).join('\r\n');
  const garde = (o) => extrait(lignes, o).map((l) => JSON.parse(l)).map((e) => e.n ?? e.event);
  assert.deepEqual(garde({}), ['Fileheader', 'LoadGame', 'Location', 'Missions', 1, 2, 3]);
  assert.deepEqual(garde({ de: '2026-11-01T09:45:00Z' }), ['Fileheader', 'LoadGame', 'Location', 'Missions', 2, 3]);
  assert.deepEqual(garde({ de: '2026-11-01T09:45:00Z', a: '2026-11-01T10:30:00Z' }), ['Fileheader', 'LoadGame', 'Location', 'Missions', 2]);
  assert.deepEqual(garde({ a: '2026-11-01T09:45:00Z' }), ['Fileheader', 'LoadGame', 'Location', 'Missions', 1]);
});
