// Tests du « SCO prêt » : bit de Status.json, génération du vaisseau, compte à rebours à la coupure, signal « prêt »,
// mesure des réactivations (gardées ou non), relevé, et fichier des mesures (dossier temporaire du système).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FLAG } from './state.js';
import {
  SCO_FLAG2, SCO_COOLDOWN_MS, SCO_READY_SIGNAL_MS, SCO_KEEP, ScoCooldown, scoGeneration, scoNote, shipKey, learnShipName,
} from './sco.js';
import { loadSamples, saveSamples } from './scoStore.js';

const SC = FLAG.supercruise;
const ON = SCO_FLAG2;

test('indicateur SCO : bit 20 de Flags2, la valeur vue dans le relevé du joueur', () => {
  assert.equal(SCO_FLAG2, 0x00100000);
  assert.equal(SCO_FLAG2, 1048576); // fsd-status.log : « Flags2=1048576 »
  assert.equal(524288 & SCO_FLAG2, 0); // bit 19 : charge de l'hyperpropulsion, pas le SCO
});

test('génération du vaisseau d’après Loadout.Ship, sans tenir compte de la casse', () => {
  assert.equal(scoGeneration('lakonminer'), 'newGeneration');
  assert.equal(scoGeneration('Python_NX'), 'newGeneration');
  assert.equal(scoGeneration('mediumtransport01'), 'newGeneration');
  assert.equal(scoGeneration('explorer_nx'), 'caspian');
  assert.equal(scoGeneration('federation_corvette'), 'legacy');
  assert.equal(scoGeneration('anaconda'), 'legacy');
  assert.equal(scoGeneration(null), 'unknown');
  assert.equal(scoGeneration('__proto__'), 'unknown');
  assert.equal(shipKey(' Type8 '), 'type8');
});

test('durées de départ : 17 s ancien, 9 s nouvelle génération, 7 s Caspian, 9 s vaisseau inconnu', () => {
  const s = new ScoCooldown();
  assert.equal(s.expected('anaconda').ms, 17_000);
  assert.equal(s.expected('mandalay').ms, 9_000);
  assert.equal(s.expected('explorer_nx').ms, 7_000);
  assert.deepEqual([s.expected(null).ms, s.expected(null).source], [SCO_COOLDOWN_MS.unknown, 'unknown']);
  assert.equal(s.expected('mandalay').source, 'default');
});

test('compte à rebours à la coupure, signal « SCO prêt » puis fin', () => {
  const s = new ScoCooldown();
  assert.equal(s.status(SC, 0, 0, 'panthermkii'), null); // première lecture : point de départ
  assert.equal(s.status(SC, ON, 1_000, 'panthermkii').type, 'start');
  assert.equal(s.shown(1_500), false); // pendant le SCO : rien à montrer
  const end = s.status(SC, 0, 5_000, 'panthermkii', 'Panther Clipper Mk II');
  assert.equal(end.type, 'end');
  assert.equal(end.countdown.readyAt, 14_000);
  assert.equal(s.shown(13_999), true);
  assert.equal(s.shownUntil(13_999), 14_000 + SCO_READY_SIGNAL_MS);
  assert.equal(s.shown(14_000 + SCO_READY_SIGNAL_MS), false);
  const sum = s.summary(6_000);
  assert.equal(sum.countdown.readyAt, new Date(14_000).toISOString());
  assert.equal(sum.countdown.shipName, 'Panther Clipper Mk II');
  assert.equal(sum.countdown.generation, 'newGeneration');
  assert.equal(sum.shown, true);
});

test('hors supercruise, le compte à rebours ne se montre pas, et revient au retour en supercruise', () => {
  const s = new ScoCooldown();
  s.status(SC, ON, 0, 'anaconda');
  s.status(SC, 0, 1_000, 'anaconda'); // coupure : prêt à 18 000
  assert.equal(s.status(0, 0, 2_000, 'anaconda').type, 'supercruise');
  assert.equal(s.shown(2_500), false);
  s.status(SC, 0, 10_000, 'anaconda');
  assert.equal(s.shown(10_500), true);
});

test('première lecture pendant un SCO : pas de compte à rebours avant la coupure', () => {
  const s = new ScoCooldown();
  assert.equal(s.status(SC, ON, 0, 'type8'), null);
  assert.equal(s.shown(100), false);
  assert.equal(s.status(SC, 0, 3_000, 'type8').type, 'end');
  assert.equal(s.shown(3_100), true);
});

// Extrait réel du relevé (fsd-status.log du 5 nov. 2026, Type-11 Prospector) : Flags en supercruise, Flags2 qui bascule
const REAL = [
  ['2026-11-05T21:51:28.366Z', 153223176, 0], // charge du supercruise
  ['2026-11-05T21:51:38.615Z', 689963032, 1048576],
  ['2026-11-05T21:51:44.757Z', 150994968, 0],
  ['2026-11-05T21:51:55.482Z', 150994968, 1048576],
  ['2026-11-05T21:52:07.741Z', 150994968, 0],
  ['2026-11-05T21:52:17.961Z', 150994968, 1048576],
  ['2026-11-05T21:52:24.076Z', 150994968, 0],
  ['2026-11-05T21:52:38.909Z', 150994968, 1048576],
];

test('relevé réel du Type-11 : écarts 10,7 s, 10,2 s et 14,8 s gardés, 9 s reste la durée (plus courte)', () => {
  const s = new ScoCooldown();
  const measures = [];
  for (const [t, flags, flags2] of REAL) {
    const c = s.status(flags, flags2, Date.parse(t), 'lakonminer');
    if (c?.type === 'start' && c.measure) measures.push(c.measure);
  }
  assert.deepEqual(measures.map((m) => m.ms), [10_725, 10_220, 14_833]);
  assert.ok(measures.every((m) => m.kept && !m.early && m.expectedMs === 9_000));
  assert.equal(s.shortest('lakonminer'), 10_220);
  assert.deepEqual([s.expected('lakonminer').ms, s.expected('lakonminer').source], [9_000, 'default']);
});

test('réactivation plus tôt que la valeur de départ : la durée mesurée la remplace', () => {
  const s = new ScoCooldown();
  s.status(SC, ON, 0, 'cutter');
  s.status(SC, 0, 1_000, 'cutter');
  const m = s.status(SC, ON, 13_000, 'cutter').measure;
  assert.deepEqual([m.ms, m.kept, m.early], [12_000, true, true]);
  assert.deepEqual([s.expected('cutter').ms, s.expected('cutter').source], [12_000, 'measured']);
  assert.equal(s.status(SC, 0, 20_000, 'cutter').countdown.readyAt, 32_000);
  assert.equal(s.expected('anaconda').ms, 17_000); // les mesures sont propres à chaque vaisseau
});

test('écarts non retenus : sortie du supercruise, saut, rechargement, autre vaisseau, clignotement, trop long', () => {
  const run = (between, ship2 = 'mandalay', gap = 15_000) => {
    const s = new ScoCooldown();
    s.status(SC, ON, 0, 'mandalay');
    s.status(SC, 0, 1_000, 'mandalay');
    between(s);
    return s.status(SC, ON, 1_000 + gap, ship2).measure;
  };
  assert.equal(run((s) => s.status(0, 0, 2_000, 'mandalay')).why, 'sorti du supercruise');
  const jump = run((s) => s.interrupted('saut hyperespace')); // StartJump ou FSDJump (index.js)
  assert.deepEqual([jump.kept, jump.why], [false, 'saut hyperespace']);
  const reload = run((s) => s.interrupted('rechargement du jeu')); // LoadGame (index.js)
  assert.deepEqual([reload.kept, reload.why], [false, 'rechargement du jeu']);
  // La première raison reste : un saut puis une sortie du supercruise, c'est le saut qui est noté
  const both = run((s) => {
    s.interrupted('saut hyperespace');
    s.status(0, 0, 2_000, 'mandalay');
  });
  assert.equal(both.why, 'saut hyperespace');
  assert.equal(run(() => {}, 'type8').why, 'vaisseau inconnu ou changé');
  assert.match(run(() => {}, 'mandalay', 800).why, /trop court/);
  assert.match(run(() => {}, 'mandalay', 90_000).why, /trop long/);
  assert.equal(run(() => {}).kept, true);
});

test('mesures gardées par vaisseau : les plus récentes seulement', () => {
  const s = new ScoCooldown();
  let t = 0;
  s.status(SC, 0, t, 'corsair');
  for (let i = 0; i < SCO_KEEP + 5; i++) {
    s.status(SC, ON, (t += 3_000), 'corsair');
    s.status(SC, 0, (t += 4_000), 'corsair');
  }
  assert.equal(s.samples.get('corsair').length, SCO_KEEP);
});

test('relevé : une ligne à la coupure et à la réactivation', () => {
  const s = new ScoCooldown();
  s.status(SC, ON, 0, 'anaconda');
  assert.equal(scoNote(s.status(SC, 0, 1_000, 'anaconda')), "SCO coupé : prêt dans 17.0 s (anaconda, d'après SCO-Cooldown)");
  assert.equal(scoNote(s.status(SC, ON, 13_500, 'anaconda')), 'SCO réactivé 12.5 s après la coupure (anaconda ; compte à rebours 17.0 s, réactivé avant sa fin)');
  s.status(SC, 0, 20_000, 'anaconda');
  s.status(0, 0, 21_000, 'anaconda');
  s.status(SC, 0, 30_000, 'anaconda');
  assert.match(scoNote(s.status(SC, ON, 40_000, 'anaconda')), /non retenu, sorti du supercruise$/);
  // Relevé réel du 5 nov. 2026 : deux sauts entre la coupure et la réactivation, supercruise=1 tout du long
  s.status(SC, 0, 50_000, 'anaconda');
  s.interrupted('saut hyperespace');
  assert.match(scoNote(s.status(SC, ON, 217_000, 'anaconda')), /non retenu, saut hyperespace$/);
  assert.equal(scoNote({ type: 'supercruise' }), null);
  assert.equal(scoNote(null), null);
});

// Événements réels (journaux du joueur, 5-7 nov. 2026, champs utiles seulement)
const LOADGAME_RHINO = { event: 'LoadGame', Ship: 'MEV_Rhino', Ship_Localised: 'VRS Rhino' };
const LOADGAME_CORVETTE = { event: 'LoadGame', Ship: 'Federation_Corvette', Ship_Localised: 'Federal Corvette' };
const SWAP_LYNX = { event: 'ShipyardSwap', ShipType: 'mediumtransport01', ShipType_Localised: 'Lynx Highliner', StoreOldShip: 'Federation_Corvette' };
const NEW_TYPE11 = { event: 'ShipyardNew', ShipType: 'lakonminer', ShipType_Localised: 'Type-11 Prospector', NewShipID: 43 };
const LOADOUT_TYPE11 = { event: 'Loadout', Ship: 'lakonminer' }; // Loadout : jamais de Ship_Localised

test('nom du vaisseau : celui du Loadout, pas celui du VRS du LoadGame ni de l’ancien vaisseau après un échange', () => {
  const names = new Map();
  assert.equal(learnShipName(names, LOADGAME_RHINO), true); // LoadGame en VRS (7 nov. 08:15:50)
  assert.equal(learnShipName(names, LOADOUT_TYPE11), false);
  const sco = (ship) => {
    const s = new ScoCooldown();
    s.status(SC, ON, 0, ship);
    return s.status(SC, 0, 5_000, ship, () => names.get(shipKey(ship)) ?? null).countdown.shipName;
  };
  assert.equal(sco('lakonminer'), null); // nom inconnu : la ligne du bas montre la génération seule, pas « VRS Rhino »
  learnShipName(names, NEW_TYPE11);
  assert.equal(sco('lakonminer'), 'Type-11 Prospector');

  learnShipName(names, LOADGAME_CORVETTE); // 5 nov. 12:15:49, puis échange vers le Lynx à 13:04:26
  learnShipName(names, SWAP_LYNX);
  assert.equal(sco('mediumtransport01'), 'Lynx Highliner');
  assert.equal(sco('federation_corvette'), 'Federal Corvette');

  learnShipName(names, { event: 'LoadGame', Ship: 'Anaconda' }); // pas de Ship_Localised : le champ Ship est lisible
  assert.equal(names.get('anaconda'), 'Anaconda');
  assert.equal(learnShipName(names, { event: 'ShipyardSwap', ShipType: 'eagle' }), false); // type brut : pas de nom
  assert.equal(learnShipName(names, { event: 'LoadGame', Ship: '__proto__', Ship_Localised: 'x' }), false);
  assert.equal(learnShipName(names, { event: 'toString', Ship: 'eagle' }), false);
  assert.equal(learnShipName(names, null), false);
});

test('rapport des règles et des mesures', () => {
  const s = new ScoCooldown(new Map([['lakonminer', [{ at: '2026-11-05T21:52:17.961Z', ms: 10_220 }]]]));
  const r = s.report('lakonminer');
  assert.equal(r.rules.flags2Bit, 20);
  assert.ok(r.rules.newGeneration.includes('smallcombat01_nx'));
  assert.deepEqual([r.current.ship, r.current.ms, r.current.shortest], ['lakonminer', 9_000, 10_220]);
  assert.equal(r.ships[0].ship, 'lakonminer');
});

test('fichier des mesures : aller-retour, écriture atomique, entrées inattendues ignorées', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-sco-'));
  try {
    const file = path.join(dir, 'sco-cooldown.json');
    assert.equal(loadSamples(file).size, 0); // pas encore de fichier
    const samples = new Map([['lakonminer', [{ at: '2026-11-05T21:52:17.961Z', ms: 10_220 }]]]);
    saveSamples(file, samples);
    assert.ok(!fs.existsSync(`${file}.tmp`));
    assert.deepEqual(loadSamples(file), samples);

    const at = '"at":"2026-11-05T21:52:17.961Z"';
    fs.writeFileSync(file, `{"samples":{
      "__proto__":[{${at},"ms":10000}],
      "Cutter":[{${at},"ms":10000}],
      "anaconda":[{"at":"hier","ms":10000},{${at},"ms":-5},{${at},"ms":12000}],
      "type8":"pas une liste"}}`);
    const loaded = loadSamples(file);
    assert.deepEqual([...loaded.keys()], ['anaconda']);
    assert.deepEqual(loaded.get('anaconda'), [{ at: '2026-11-05T21:52:17.961Z', ms: 12_000 }]);
    assert.equal({}.ms, undefined); // rien n'est passé dans le prototype des objets
    fs.writeFileSync(file, '{ illisible');
    assert.equal(loadSamples(file).size, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
