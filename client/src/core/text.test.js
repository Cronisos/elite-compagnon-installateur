// Textes côté interface : recherche sans accents ni apostrophes typographiques, et mêmes résultats que le
// serveur (server/src/core/text.js, qui nettoie le journal à la lecture).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as client from './text.js';
import * as server from '../../../server/src/core/text.js';

const NBSP = '\u00a0';
const SAMPLES = [
  'Donnez 1&nbsp;000&nbsp;000 CR à la cause',
  'File-moi du matos ! Disons, pour 17&nbsp;500 CR, et je te laisserai la vie sauve.',
  '$TacticalSuit_Class1_Name;',
  '$ExplorationSuit_Class1_Name;',
  '$FlightSuit_Name;',
  '$MULTIPLAYER_SCENARIO42_TITLE;',
  '$iridium_name;',
  'Mission_AltruismCredits',
  'Emplacement d’extraction planétaire',
  `Cobra Mk${NBSP}III`,
  "Coup d'œil",
  '  Platine  ',
  '&amp;nbsp; &#39; &#x2019; &valueOf; &#7; &eacute;',
  'Prix &amp;nbsp; R&amp;amp;D ',
  '$ 500 de prime',
  '',
  null,
  undefined,
];

test('client et serveur : mêmes textes propres, mêmes formes de recherche', () => {
  for (const s of SAMPLES) {
    assert.equal(client.cleanText(s), server.cleanText(s), `cleanText ${s}`);
    assert.equal(client.foldText(s), server.foldText(s), `foldText ${s}`);
    assert.equal(client.keyLabel(s), server.keyLabel(s), `keyLabel ${s}`);
    assert.equal(client.localised(s, 'Mission_AltruismCredits'), server.localised(s, 'Mission_AltruismCredits'), `localised ${s}`);
    assert.equal(client.rawKey(s), server.rawKey(s), `rawKey ${s}`);
    // Le serveur a déjà nettoyé le nom : le nettoyer encore dans l'interface ne le change pas
    assert.equal(client.cleanText(server.cleanText(s)), server.cleanText(s), `double nettoyage ${s}`);
  }
  assert.equal(String(client.RAW_KEY_RE), String(server.RAW_KEY_RE));
  assert.deepEqual([...client.KEY_NAMES], [...server.KEY_NAMES]);
  assert.deepEqual(client.MARKET_SORT, server.MARKET_SORT);
});

test('client et serveur : entités piégées décodées en temps linéaire, même résultat', () => {
  const MO = 1024 * 1024;
  for (const s of [`&${';'.repeat(MO)}`, `&${'amp;'.repeat(MO / 4)}nbsp;`, `${'&'.repeat(MO / 2)}${';'.repeat(MO / 2)}`]) {
    for (const [nom, decode] of [['client', client.decodeEntities], ['serveur', server.decodeEntities]]) {
      const t = performance.now();
      decode(s);
      const ms = performance.now() - t;
      assert.ok(ms < 500, `${nom} : ${ms.toFixed(0)} ms pour ${s.slice(0, 12)}…`);
    }
    assert.equal(client.decodeEntities(s), server.decodeEntities(s));
  }
});

test('client et serveur : même ordre des marchandises', () => {
  const market = [
    { Name_Localised: 'Platine', Category_Localised: 'Métaux' },
    { Name_Localised: 'Café', Category_Localised: 'Alimentation' },
    { Name_Localised: 'Eau', Category_Localised: 'Produits chimiques' },
    { Name_Localised: 'Algues', Category_Localised: 'Alimentation' },
    { Name_Localised: 'Bertrandite', Category_Localised: 'Minerais' },
    { label: 'Tritium' },
    { Name_Localised: 'Médicaments de base', Category_Localised: 'Médicaments' },
    { Name_Localised: 'Ferraille de l’épave', Category_Localised: 'Ferraille' },
  ];
  const names = (list) => list.map((x) => x.Name_Localised || x.label);
  assert.deepEqual(names(client.sortCommodities(market)), names(server.sortCommodities(market)));
  assert.deepEqual(names(client.sortCommodities(market)), [
    'Algues', 'Café', 'Ferraille de l’épave', 'Médicaments de base', 'Platine', 'Bertrandite', 'Eau', 'Tritium',
  ]);
});

test('recherche des pages (repères, matériaux) : accents, apostrophes, deux langues', () => {
  // Repère nommé avec l'apostrophe du jeu, cherché avec celle du clavier
  assert.ok(client.matchesSearch("d'extraction", ['Emplacement d’extraction planétaire', null, undefined, false]));
  assert.ok(client.matchesSearch('eep 7', ['EEP 7']));
  // Matériau : nom français ou anglais (FDevIDs)
  const tin = { label: 'Étain', english: 'Tin' };
  assert.ok(client.matchesSearch('etain', [tin.label, tin.english]));
  assert.ok(client.matchesSearch('TIN', [tin.label, tin.english]));
  assert.ok(!client.matchesSearch('zinc', [tin.label, tin.english]));
  assert.ok(client.matchesSearch('   ', [tin.label]), 'recherche vide : tout passe');
});
