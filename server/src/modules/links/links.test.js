// Tests du module Applications externes : remplissage des liens contextuels.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillTemplate, SOURCE_JOUEUR, sourceLue } from './index.js';
import { DEFAULT_LINKS } from './defaults.js';

const tpl = (label) => DEFAULT_LINKS.find((l) => l.label === label).url;

test('station sur Inara : même format que EDMarketConnector', () => {
  assert.equal(
    fillTemplate(tpl('Station sur Inara'), { station: 'Port Draught', system: 'ICZ KC-U b3-4' }),
    'https://inara.cz/elite/station/?search=Port%20Draught%20[ICZ%20KC-U%20b3-4]'
  );
});

test('Spansh : système par adresse, station par MarketID', () => {
  assert.equal(fillTemplate(tpl('Système sur Spansh'), { systemAddress: 9468120933817 }), 'https://spansh.co.uk/system/9468120933817');
  assert.equal(fillTemplate(tpl('Station sur Spansh'), { marketId: 4362099715 }), 'https://spansh.co.uk/station/4362099715');
});

test('valeur manquante : pas de lien (jamais d’adresse à moitié remplie)', () => {
  assert.equal(fillTemplate(tpl('Station sur Spansh'), { station: 'Port Draught' }), null);
});

test('liens proposés : vérifiés à part, pages Inara du menu marquées « à vérifier »', () => {
  assert.ok(DEFAULT_LINKS.filter((l) => l.verified === false).every((l) => l.url.startsWith('https://inara.cz/elite/')));
  assert.ok(DEFAULT_LINKS.filter((l) => l.verified !== false).every((l) => l.source));
});

test('lien ajouté par le joueur : « ajouté par toi », y compris pour ceux enregistrés avant le tutoiement', () => {
  assert.equal(SOURCE_JOUEUR, 'ajouté par toi');
  const ancien = { id: 3, label: 'Mon site', source: ['ajouté par', 'vous'].join(' ') };
  assert.deepEqual(sourceLue(ancien), { id: 3, label: 'Mon site', source: 'ajouté par toi' });
  const propose = { id: 1, source: 'inara.cz' };
  assert.equal(sourceLue(propose), propose);
});
