// Mes commandes (commandesVue.js) : recherche, classement, doublons, voisins.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classer, doublons, score, voisins } from './commandesVue.js';

const I = [{ id: 'piloter', titre: 'Piloter' }, { id: 'voyager', titre: 'Voyager' }, { id: 'atterrir', titre: 'Atterrir et apponter' }, { id: 'reglages', titre: 'Réglages' }];
const c = (ordre, id, nom, intention, touches = [], genre = 'bouton', section = 'Commandes du vaisseau') => ({ ordre, id, nom, intention, genre, section, sous: null, touches: touches.map((texte) => ({ texte })) });
const L = [
  c(0, 'MouseSensitivity', 'Sensibilité de la souris', 'reglages', [], 'reglage'),
  c(1, 'UseBoostJuice', 'Boost', 'piloter', ['Clavier : Tab']),
  c(2, 'HyperSuperCombination', 'Hyperespace / supercroisière (FSD)', 'voyager', ['Clavier : Maj gauche + K']),
  c(3, 'LandingGearToggle', 'Train d’atterrissage', 'atterrir', ['Clavier : L']),
  c(4, 'ToggleFlightAssist', 'Assistance de vol (activer / couper)', 'piloter', ['Clavier : Z', 'X52 : bouton 3']),
  c(5, 'Hyperspace', 'Saut hyperespace', 'voyager', ['Clavier : Z']),
];

test('recherche : nom, synonymes, touche exacte, apostrophes et accents', () => {
  assert.ok(score(L[2], 'fsd') > 0);
  assert.ok(score(L[3], 'train d atterrissage') > 0);
  assert.ok(score(L[3], 'gear') > 0, 'synonyme anglais');
  assert.ok(score(L[2], 'k') > 0, 'une lettre : la touche K');
  assert.equal(score(L[1], 'k'), 0, 'pas le k de « Clavier »');
  assert.ok(score(L[2], 'maj') > 0, 'touche modificatrice');
  assert.ok(score(L[1], 'BOOST') > score(L[4], 'x52'), 'le nom passe avant la touche');
  assert.equal(score(L[1], 'boost inexistant'), 0, 'chaque mot doit trouver sa place');
});

test('classement par intention, filtres, réglages cachés par défaut', () => {
  assert.deepEqual(classer(L, I).map((g) => g.intention.id), ['piloter', 'voyager', 'atterrir']);
  assert.deepEqual(classer(L, I, { reglages: true }).map((g) => g.intention.id), ['piloter', 'voyager', 'atterrir', 'reglages']);
  assert.deepEqual(classer(L, I, { q: 'hyperespace' })[0].commandes.map((x) => x.id), ['HyperSuperCombination', 'Hyperspace']);
  assert.deepEqual(classer(L, I, { intention: 'atterrir' }).map((g) => g.commandes.length), [1]);
  assert.equal(classer(L, I, { libres: true }).length, 0);
});

test('touches en double dans le même contexte, voisins dans le menu', () => {
  const d = doublons(L);
  assert.deepEqual([...d.values()], [['Assistance de vol (activer / couper)', 'Saut hyperespace']]);
  const v = voisins(L, L[3]);
  assert.deepEqual([v.avant.id, v.apres.id], ['HyperSuperCombination', 'ToggleFlightAssist']);
  assert.equal(voisins(L, L[1]).avant, null, 'les réglages ne sont pas des voisins d’une commande');
});

test('doublons intelligents : seulement ce que le jeu écoute en même temps', async () => {
  const { contexteDe, partagesDe } = await import('./commandesVue.js');
  const V = 'Commandes du vaisseau';
  const G = 'Commandes générales';
  const liste = [
    c(1, 'PrimaryFire', 'Tir principal', 'combattre', ['X52 : bouton 1'], 'bouton', V),
    c(2, 'ExplorationFSSZoomIn', 'FSS : zoom avant', 'explorer', ['X52 : bouton 1'], 'bouton', V),
    c(3, 'MultiCrewPrimaryFire', 'Équipage : tir principal', 'equipage', ['X52 : bouton 1'], 'bouton', V),
    c(4, 'LeftThrustButton', 'Poussée à gauche', 'piloter', ['Clavier : A'], 'bouton', V),
    c(5, 'ExplorationSAAPreviousGenus', 'Scanner de surface : genre précédent', 'explorer', ['Clavier : A'], 'bouton', V),
    c(6, 'ExplorationFSSEnter', 'Ouvrir le scanner FSS', 'explorer', ['Clavier : Ù'], 'bouton', V),
    c(7, 'ExplorationFSSQuit', 'Quitter le scanner FSS', 'explorer', ['Clavier : Ù'], 'bouton', V),
    c(8, 'UI_Up', 'Menu : haut', 'interface', ['Clavier : Z'], 'bouton', G),
    c(9, 'CamTranslateForward', 'Carte : avancer', 'voyager', ['Clavier : Z'], 'bouton', G),
    c(10, 'ToggleFlightAssist', 'Assistance de vol', 'piloter', ['Clavier : W'], 'bouton', V),
    c(11, 'Hyperspace', 'Saut hyperespace', 'voyager', ['Clavier : W'], 'bouton', V),
    c(12, 'IncreaseEnginesPower', 'Énergie aux moteurs', 'combattre', ['X52 : chapeau 1 haut'], 'bouton', V),
    c(13, 'HeadLookPitchUp', 'Regard : haut', 'camera', ['X52 : chapeau 1 haut'], 'bouton', V),
    c(14, 'PhotoCameraToggle_Buggy', 'Caméra (VRS)', 'camera', ['Clavier : A'], 'bouton', G),
    c(15, 'YawLeftButton_Landing', 'Lacet à gauche (atterrissage)', 'atterrir', ['Clavier : A'], 'bouton', V),
  ];
  assert.deepEqual([contexteDe(liste[0]).id, contexteDe(liste[1]).id, contexteDe(liste[2]).id, contexteDe(liste[4]).id], ['vol', 'fss', 'equipage', 'dss']);
  assert.deepEqual([contexteDe(liste[5]).id, contexteDe(liste[6]).id], ['vol', 'fss'], 'on ouvre le FSS depuis le vol, on le quitte depuis le FSS');
  assert.deepEqual([contexteDe(liste[7]).id, contexteDe(liste[8]).id, contexteDe(liste[13]).id, contexteDe(liste[14]).id], ['interface', 'carte', 'vrs', 'atterrissage']);
  const d = doublons(liste);
  assert.deepEqual([...d.keys()].sort(), ['vol|Clavier : W', 'vol|X52 : chapeau 1 haut'], 'seuls les vrais conflits restent');
  assert.deepEqual(d.get('vol|Clavier : W'), ['Assistance de vol', 'Saut hyperespace']);
  // Les partages sans gêne sont dits, pas alertés
  assert.deepEqual(partagesDe(liste, liste[0]), [{ nom: 'FSS : zoom avant', contexte: 'scanner FSS' }, { nom: 'Équipage : tir principal', contexte: 'équipage multiple' }]);
  assert.deepEqual(partagesDe(liste, liste[9]), [], 'un vrai doublon n’est pas un partage');
  assert.deepEqual(partagesDe(liste, liste[5]), [{ nom: 'Quitter le scanner FSS', contexte: 'scanner FSS' }]);
});
