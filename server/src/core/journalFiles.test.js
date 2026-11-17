// Lecture des fichiers du jeu : les textes traduits arrivent propres à tous les modules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseLines, readJsonFile } from './journalFiles.js';

const NBSP = '\u00a0';

// Lignes réelles des journaux du joueur (3 nov. et 25 oct. 2026), raccourcies
const LINES = [
  '{ "timestamp":"2026-11-03T10:00:40Z", "event":"MissionAccepted", "Faction":"The Gathering", "Name":"Mission_AltruismCredits", "LocalisedName":"Donnez 1&nbsp;000&nbsp;000 CR à la cause", "MissionID":1070290686 }',
  '{ "timestamp":"2026-10-25T15:58:55Z", "event":"SwitchSuitLoadout", "SuitName":"tacticalsuit_class2", "SuitName_Localised":"$TacticalSuit_Class1_Name;", "Modules":[ { "ModuleName":"wpn_s_pistol_kinetic_sauto", "ModuleName_Localised":"Karma P-15" } ] }',
  '{ "timestamp":"2026-11-07T13:49:39Z", "event":"Docked", "StationName":"Flinders City" }',
].join('\n');

test('journal : LocalisedName et *_Localised nettoyés à la lecture', () => {
  const [mission, suit, docked] = parseLines(LINES);
  assert.equal(mission.LocalisedName, `Donnez 1${NBSP}000${NBSP}000 CR à la cause`);
  assert.equal(mission.Name, 'Mission_AltruismCredits');
  assert.equal(suit.SuitName_Localised, 'Combinaison Dominator');
  assert.equal(suit.Modules[0].ModuleName_Localised, 'Karma P-15');
  assert.equal(docked.StationName, 'Flinders City');
});

test('journal : le filtre par intérêt reste appliqué', () => {
  const out = parseLines(LINES, new Set(['MissionAccepted']));
  assert.deepEqual(out.map((e) => e.event), ['MissionAccepted']);
});

test('fichier d’état (Market.json) : textes traduits nettoyés, clés internes gardées', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-text-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'Market.json');
  fs.writeFileSync(file, '\ufeff{ "event":"Market", "Items":[ { "Name":"$platinum_name;", "Name_Localised":"Platine ", "Category":"$MARKET_category_metals;", "Category_Localised":"M&eacute;taux", "Note_Localised":"&bogus; x" } ] }');
  const m = readJsonFile(file);
  assert.equal(m.Items[0].Name_Localised, 'Platine');
  assert.equal(m.Items[0].Name, '$platinum_name;');
  assert.equal(m.Items[0].Category, '$MARKET_category_metals;');
  assert.equal(m.Items[0].Category_Localised, 'Métaux');
  assert.equal(m.Items[0].Note_Localised, '&bogus; x', 'entité inconnue : laissée telle quelle');
  fs.writeFileSync(file, '{ "event": ');
  assert.equal(readJsonFile(file), null, 'fichier en cours d’écriture : null');
});
