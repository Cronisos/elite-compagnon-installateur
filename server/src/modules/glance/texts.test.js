// Coup d'œil : noms de missions et de marchandises en français propre (« Donnez 1 000 000 CR à la cause »).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGlance, reminders } from './state.js';
import { parseLines } from '../../core/journalFiles.js';
import { cleanText } from '../../core/text.js';

const NBSP = '\u00a0';
const CLEAN = `Donnez 1${NBSP}000${NBSP}000 CR à la cause`;
// Ligne réelle du journal du 3 nov. 2026
const ACCEPTED = '{ "timestamp":"2026-11-03T10:00:40Z", "event":"MissionAccepted", "Faction":"The Gathering", "Name":"Mission_AltruismCredits", "LocalisedName":"Donnez 1&nbsp;000&nbsp;000 CR à la cause", "Donation":"1000000", "Expiry":"2026-11-03T13:57:07Z", "MissionID":1070290686 }';

test('mission lue dans le journal : plus de &nbsp; dans le Coup d’œil ni dans les rappels', () => {
  const g = buildGlance(parseLines(ACCEPTED));
  const [m] = [...g.missions.values()];
  assert.equal(m.name, CLEAN);
  const out = reminders(
    { exploration: { value: 0 }, exobiology: { count: 0 }, bounties: 0, bonds: 0, missions: [m], powerplayCargo: [], missionCargo: 0 },
    Date.parse('2026-11-03T13:00:00Z'),
  );
  assert.equal(out[0].text, `Mission « ${CLEAN} » : expire dans 57 min.`);
});

test('nom nettoyé à la lecture, puis par le Coup d’œil : même résultat qu’un seul nettoyage', () => {
  // Cas inventé (aucun « &amp; » dans les journaux) : lecture du journal, puis buildGlance, puis l'interface
  const raw = 'Prix &amp;nbsp; R&amp;amp;D ';
  const line = JSON.stringify({ timestamp: '2026-11-03T10:00:40Z', event: 'MissionAccepted', Name: 'Mission_X', LocalisedName: raw, MissionID: 7 });
  const name = buildGlance(parseLines(line)).missions.get(7).name;
  assert.equal(name, cleanText(raw));
  assert.equal(name, `Prix ${NBSP} R&D`);
  assert.equal(cleanText(name), name);
});

test('mission reçue telle quelle (sans passer par la lecture du journal) : nettoyée aussi', () => {
  const g = buildGlance([JSON.parse(ACCEPTED)]);
  assert.equal(g.missions.get(1070290686).name, CLEAN);
});

test('mission sans nom traduit : nom interne lisible ; marchandise : clé rendue lisible', () => {
  const g = buildGlance([
    { event: 'MissionAccepted', MissionID: 1, Name: 'Mission_AltruismCredits' },
    { event: 'MissionAccepted', MissionID: 2, Name: 'Mission_Delivery', LocalisedName: 'Livrer de l’or', Commodity: '$Gold_Name;' },
    { event: 'MissionAccepted', MissionID: 3, Name: 'Mission_Delivery', LocalisedName: 'Livrer', Commodity: '$Gold_Name;', Commodity_Localised: 'Or ' },
  ]);
  assert.equal(g.missions.get(1).name, 'Mission Altruism Credits');
  assert.equal(g.missions.get(1).commodity, null);
  assert.equal(g.missions.get(2).commodity, 'Gold');
  assert.equal(g.missions.get(3).commodity, 'Or');
});

test('liste des missions à la connexion (Missions) : nom nettoyé', () => {
  // Le jeu y écrit déjà le nom traduit (journal du 2 nov. 2026 : « Poursuites judiciaires finales »)
  const g = buildGlance([
    { timestamp: '2026-11-02T18:29:00Z', event: 'Missions', Active: [
      { MissionID: 939076817, Name: 'Poursuites judiciaires finales', PassengerMission: false, Expires: 0 },
      { MissionID: 5, Name: 'Donnez 1&nbsp;000&nbsp;000 CR à la cause ', Expires: 3600 },
    ] },
  ]);
  assert.equal(g.missions.get(939076817).name, 'Poursuites judiciaires finales');
  assert.equal(g.missions.get(5).name, CLEAN);
});
