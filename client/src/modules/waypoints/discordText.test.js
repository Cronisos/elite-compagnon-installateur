// « Copier pour Discord » d'un repère : les noms venus du journal (corps, station de colonie nommée par un joueur,
// système) ne mentionnent personne et ne mettent rien en forme ; tes notes restent telles que tu les as écrites.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discordText } from './api.js';

test('repère ordinaire : texte inchangé', () => {
  const text = discordText({ label: 'Site EEP', categoryLabel: 'Site de minage', siteNumber: 2, drills: 3, body: 'Synuefe GA-I b57-6 A 1', system: 'Synuefe GA-I b57-6', latitude: 12.34567, longitude: -45.6, notes: 'Bon **filon**' });
  assert.equal(text, '**Site EEP** (Site de minage EEP 2, 3 foreuses)\nSynuefe GA-I b57-6 A 1 · Synuefe GA-I b57-6\nLat 12.3457 / Lon -45.6000\nBon **filon**');
});

test('station piégée : ni mention, ni lien masqué, ni titre en début de ligne', () => {
  const text = discordText({ label: 'Gare', categoryLabel: 'Station', station: '# @everyone [x](https://exemple.invalid/) <@&1>', system: 'Sys' });
  const ligne = text.split('\n')[1];
  assert.ok(ligne.startsWith('\\#'), ligne);
  assert.ok(!/@everyone\b/.test(text) && !/<@&\d/.test(text) && !/(^|[^\\])\]\(/.test(text) && !text.includes('https://'), text);
});
