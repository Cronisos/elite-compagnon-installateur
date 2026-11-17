// Textes du journal : les exemples viennent des journaux du joueur (jeu en French/FR, 23 oct. → 7 nov. 2026).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanLocalisedFields, cleanText, compareFrench, decodeEntities, foldText, keyLabel, localised, matchesSearch,
  rawKey, sortCommodities, TEXT_RULES, unifyApostrophes,
} from './text.js';

const NBSP = '\u00a0';

test('entités HTML du journal : &nbsp; devient une vraie espace insécable', () => {
  assert.equal(cleanText('Donnez 1&nbsp;000&nbsp;000 CR à la cause'), `Donnez 1${NBSP}000${NBSP}000 CR à la cause`);
  assert.equal(
    cleanText('File-moi du matos ! Disons, pour 17&nbsp;500 CR, et je te laisserai la vie sauve.'),
    `File-moi du matos ! Disons, pour 17${NBSP}500 CR, et je te laisserai la vie sauve.`,
  );
  assert.equal(decodeEntities('L&#39;Écho &amp; d&#x2019;autres'), 'L\'Écho & d’autres');
});

test('entités décodées jusqu’au bout : nettoyer deux fois ne change rien', () => {
  assert.equal(decodeEntities('&amp;nbsp;'), NBSP);
  assert.equal(decodeEntities('Prix &amp;nbsp; R&amp;amp;D'), `Prix ${NBSP} R&D`);
  assert.equal(decodeEntities('&amp;amp;amp;#39;'), "'");
  const samples = [
    'Donnez 1&nbsp;000&nbsp;000 CR à la cause', 'Prix &amp;nbsp; R&amp;amp;D', '  &nbsp;$TacticalSuit_Class1_Name;&#32; ',
    '&#36;FlightSuit_Name;', '$$$A;', '$A&B;', 'R&D &amp &;', '&inconnu; &#7; &#xD800;', `Cobra Mk${NBSP}III`, '', null,
  ];
  for (const s of samples) {
    const once = cleanText(s);
    assert.equal(cleanText(once), once, `cleanText ${s}`);
    assert.equal(localised(once, 'Mission_AltruismCredits'), localised(s, 'Mission_AltruismCredits'), `localised ${s}`);
    assert.equal(decodeEntities(decodeEntities(s)), decodeEntities(s), `decodeEntities ${s}`);
  }
  assert.equal(cleanText('  &nbsp;$TacticalSuit_Class1_Name;&#32; '), 'Combinaison Dominator');
});

test('entités inconnues et invalides laissées telles quelles', () => {
  assert.equal(decodeEntities('&inconnu; &#0; &#7; &#xD800; &#99999999;'), '&inconnu; &#0; &#7; &#xD800; &#99999999;');
  assert.equal(decodeEntities('&valueOf; &toString;'), '&valueOf; &toString;'); // table en Map : pas de méthode d'objet
  assert.equal(cleanText('Prix : 5 €'), 'Prix : 5 €'); // pas d'esperluette : texte inchangé
});

test('espaces de début et de fin retirées, espaces insécables du jeu gardées', () => {
  assert.equal(cleanText('  Platine  '), 'Platine');
  assert.equal(cleanText(`Cobra Mk${NBSP}III`), `Cobra Mk${NBSP}III`);
  assert.equal(cleanText(null), '');
  assert.equal(cleanText(undefined), '');
});

test('clé non traduite : nom lisible tiré de la clé', () => {
  // 17 SuitName_Localised et 1 Name_Localised (BuySuit d'une TacticalSuit_Class2) dans les journaux
  assert.equal(cleanText('$TacticalSuit_Class1_Name;'), 'Combinaison Dominator');
  assert.equal(cleanText('$ExplorationSuit_Class3_Name;'), 'Combinaison Artemis');
  assert.equal(cleanText('$FlightSuit_Name;'), 'Combinaison de vol');
  // Famille inconnue : les mots de la clé
  assert.equal(cleanText('$iridium_name;'), 'Iridium');
  assert.equal(cleanText('$MULTIPLAYER_SCENARIO42_TITLE;'), 'Multiplayer scenario 42 title');
  assert.equal(keyLabel('Mission_AltruismCredits'), 'Mission Altruism Credits');
  assert.equal(keyLabel('$Some_NewThing_Class2_Name;'), 'Some New Thing Class 2');
  // Un texte qui commence par $ sans être une clé ne bouge pas
  assert.equal(cleanText('$ 500 de prime'), '$ 500 de prime');
  assert.equal(rawKey('$cmdr_decorate:#name=JOUEURFICTIF;'), 'cmdr_decorate:#name=JOUEURFICTIF');
  assert.equal(rawKey('Combinaison Artemis'), null);
});

test('localised : texte traduit propre, sinon nom interne lisible, sinon null', () => {
  assert.equal(localised('Donnez 1&nbsp;000&nbsp;000 CR à la cause', 'Mission_AltruismCredits'), `Donnez 1${NBSP}000${NBSP}000 CR à la cause`);
  assert.equal(localised(undefined, 'Mission_AltruismCredits'), 'Mission Altruism Credits');
  assert.equal(localised('', '$Gold_Name;'), 'Gold');
  assert.equal(localised('   ', null), null);
  assert.equal(localised(null, undefined), null);
});

test('champs *_Localised et LocalisedName nettoyés à toute profondeur, les autres intacts', () => {
  const ev = {
    event: 'CreateSuitLoadout',
    SuitName: 'tacticalsuit_class2',
    SuitName_Localised: '$TacticalSuit_Class1_Name;',
    LocalisedName: 'Donnez 1&nbsp;000&nbsp;000 CR à la cause',
    Modules: [{ ModuleName: 'wpn_m_assaultrifle_laser_fauto', ModuleName_Localised: 'TK Aphelion ' }],
    Items: [{ Name: '$platinum_name;', Name_Localised: 'Platine', Category: '$MARKET_category_metals;', Category_Localised: 'Métaux' }],
    Note: 'a&nbsp;b', // champ non traduit : jamais touché
    Count: 3,
  };
  const out = cleanLocalisedFields(ev);
  assert.equal(out, ev, 'nettoyé sur place');
  assert.equal(ev.SuitName_Localised, 'Combinaison Dominator');
  assert.equal(ev.LocalisedName, `Donnez 1${NBSP}000${NBSP}000 CR à la cause`);
  assert.equal(ev.Modules[0].ModuleName_Localised, 'TK Aphelion');
  assert.equal(ev.Items[0].Name, '$platinum_name;');
  assert.equal(ev.Items[0].Category, '$MARKET_category_metals;');
  assert.equal(ev.Note, 'a&nbsp;b');
  assert.equal(ev.Count, 3);
  assert.equal(cleanLocalisedFields(null), null);
  assert.equal(cleanLocalisedFields('texte'), 'texte');
});

test('recherche : apostrophes, accents, casse, ligatures et espaces insécables', () => {
  // « d'extraction » doit trouver « d’extraction » (145 Type_Localised dans les journaux)
  assert.ok(matchesSearch("d'extraction", ['Emplacement d’extraction planétaire']));
  assert.ok(matchesSearch('planetaire', ['Emplacement d’extraction planétaire']));
  assert.ok(matchesSearch('ÉTAIN', ['Étain']));
  assert.ok(matchesSearch('cobra mk iii', [`Cobra Mk${NBSP}III`]));
  assert.ok(matchesSearch("coup d'oeil", ["Coup d'œil"]));
  assert.ok(matchesSearch('1 000 000', ['Donnez 1&nbsp;000&nbsp;000 CR à la cause']));
  assert.ok(matchesSearch('', ['rien']), 'recherche vide : tout passe');
  assert.ok(!matchesSearch('or', [null, undefined, false, 'Argent']));
  assert.ok(matchesSearch('niobium', 'Niobium'), 'un seul texte accepté');
  assert.equal(foldText('  Émission   d’ÉNERGIE  '), "emission d'energie");
  assert.equal(unifyApostrophes('l’a ‘b’ c`d'), "l'a 'b' c'd");
});

test('ordre français : accents au bon endroit, apostrophes unifiées, nombres dans l’ordre', () => {
  const list = ['Métaux', 'Minerais', 'Machines', 'Médicaments', 'Matériaux industriels'];
  assert.deepEqual([...list].sort(compareFrench), ['Machines', 'Matériaux industriels', 'Médicaments', 'Métaux', 'Minerais']);
  assert.equal(compareFrench("d'extraction", 'd’extraction'), 0);
  assert.ok(compareFrench('Type 9', 'Type 10') < 0);
});

test('marchandises triées comme le marché : catégorie puis nom, en français', () => {
  // Lignes réelles de Market.json (Flinders City, 7 nov. 2026)
  const market = [
    { Name: '$platinum_name;', Name_Localised: 'Platine', Category_Localised: 'Métaux' },
    { Name: '$gold_name;', Name_Localised: 'Or', Category_Localised: 'Métaux' },
    { Name: '$silver_name;', Name_Localised: 'Argent', Category_Localised: 'Métaux' },
    { Name: '$bertrandite_name;', Name_Localised: 'Bertrandite', Category_Localised: 'Minerais' },
    { Name: '$water_name;', Name_Localised: 'Eau', Category_Localised: 'Produits chimiques' },
    { Name: '$coffee_name;', Name_Localised: 'Café(s)', Category_Localised: 'Alimentation' },
    { Name: '$algae_name;', Name_Localised: 'Algue(s)', Category_Localised: 'Alimentation' },
  ];
  assert.deepEqual(sortCommodities(market).map((x) => x.Name_Localised), ['Algue(s)', 'Café(s)', 'Argent', 'Or', 'Platine', 'Bertrandite', 'Eau']);
  assert.equal(market[0].Name_Localised, 'Platine', "la liste d'origine ne bouge pas");

  // Lignes de l'app : { label, category } ; sans catégorie connue → à la fin, par nom
  const cargo = [{ label: 'Tritium' }, { label: 'Or', category: 'Métaux' }, { label: 'Argent' }];
  assert.deepEqual(sortCommodities(cargo).map((x) => x.label), ['Or', 'Argent', 'Tritium']);

  // Champs choisis par l'appelant
  const rows = [{ cat: 'Métaux', n: 'Or' }, { cat: 'Alimentation', n: 'Café' }];
  assert.deepEqual(sortCommodities(rows, { category: (x) => x.cat, name: (x) => x.n }).map((x) => x.n), ['Café', 'Or']);
  assert.deepEqual(sortCommodities(undefined), []);
});

test('règles du jeu déclarées pour la vigie : statut, date et source', () => {
  for (const r of TEXT_RULES) {
    assert.ok(r.name && r.source && /^\d{4}-\d{2}-\d{2}$/.test(r.date), r.name);
    assert.match(r.status, /mesurée|publiée|à vérifier/, r.name);
  }
  assert.equal(TEXT_RULES.find((r) => r.name === 'MARKET_SORT').status, 'à vérifier');
});
