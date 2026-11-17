// Assignations du joueur (assignations.js) et catalogue (catalogue.js), sur le profil réel du banc (fixtures).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { decodeText } from './parse.js';
import { lireAssignations, nomTouche, texteTouche, vueAssignations } from './assignations.js';
import { INTENTIONS, SECTIONS, intentionDe, nomParDefaut, sectionsDe } from './catalogue.js';

const xml = decodeText(fs.readFileSync(new URL('./fixtures/Custom.4.2.binds', import.meta.url)));
// Toutes les entrées d'un profil complet du jeu 4.4, dans l'ordre (noms seulement, sans touches)
const complet = fs.readFileSync(new URL('./fixtures/commandes-4.2.txt', import.meta.url), 'utf8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#')).map((l) => { const [id, genre] = l.split('|'); return { id, genre, touches: [], valeur: null }; });

test('profil complet du jeu : chaque entrée a un nom français, une intention et une section', () => {
  assert.ok(complet.length > 500, `${complet.length} entrées`);
  const v = vueAssignations(complet);
  const inconnus = v.filter((x) => !x.connu).map((x) => x.id);
  assert.deepEqual(inconnus, [], 'commande sans nom français');
  const ids = new Set(INTENTIONS.map((i) => i.id));
  assert.ok(v.every((x) => ids.has(x.intention)));
  assert.ok(v.every((x) => x.section));
  const boost = v.find((x) => x.id === 'UseBoostJuice');
  assert.equal(boost.nom, 'Boost');
  assert.equal(boost.intention, 'piloter');
  assert.deepEqual([boost.section, boost.sous], ['Commandes du vaisseau', 'Vol : divers']);
  assert.equal(v.find((x) => x.id === 'HumanoidJumpButton').intention, 'a-pied');
  assert.equal(v.find((x) => x.id === 'ExplorationFSSDiscoveryScan').intention, 'explorer');
  assert.equal(v.find((x) => x.id === 'LandingGearToggle').intention, 'atterrir');
  assert.equal(v.find((x) => x.id === 'MouseSensitivity').intention, 'reglages');
});

test('profil du banc (extrait) : lu en entier, des touches assignées', () => {
  const e = lireAssignations(xml);
  assert.equal(e.length, 35);
  assert.ok(vueAssignations(e).some((x) => x.touches.length > 0));
});

test('chaque section du catalogue commence par une entrée du profil complet', () => {
  const ids = new Set(complet.map((x) => x.id));
  assert.deepEqual(SECTIONS.map(([id]) => id).filter((id) => !ids.has(id)), []);
});

test('touches en clair : modificateurs, souris, manette, chapeau, axes', () => {
  const [a] = lireAssignations('\t<PhotoCameraToggle>\n\t\t<Primary Device="Keyboard" Key="Key_Space">\n\t\t\t<Modifier Device="Keyboard" Key="Key_LeftControl" />\n\t\t\t<Modifier Device="Keyboard" Key="Key_LeftAlt" />\n\t\t</Primary>\n\t\t<Secondary Device="{NoDevice}" Key="" />\n\t</PhotoCameraToggle>\n');
  assert.equal(a.genre, 'bouton');
  assert.equal(texteTouche(a.touches[0]), 'Clavier : Ctrl gauche + Alt gauche + Espace');
  assert.equal(a.touches.length, 1, 'pas de touche pour {NoDevice}');
  assert.equal(nomTouche('Joy_POV1Up'), 'chapeau 1 haut');
  assert.equal(nomTouche('Joy_RZAxis'), 'axe RZ');
  assert.equal(nomTouche('Neg_Joy_XAxis'), 'axe X −');
  assert.equal(nomTouche('Pos_Mouse_ZAxis'), 'molette ↑');
  assert.equal(nomTouche('Key_Numpad_4'), 'Pavé num. 4');
  assert.equal(nomTouche('Key_é'), 'É');
  assert.equal(texteTouche({ appareil: 'SaitekX52', touche: 'Joy_3', modifs: [] }), 'X52 : bouton 3');
  const [r] = lireAssignations('\t<MouseSensitivity Value="0.5" />\n');
  assert.deepEqual([r.genre, r.valeur], ['reglage', '0.5']);
  assert.deepEqual(lireAssignations(null), []);
});

test('catalogue : intention par défaut, nom par défaut, sections dans l’ordre du fichier', () => {
  assert.equal(intentionDe('QuelqueChoseDeNouveau', 'bouton'), 'divers');
  assert.equal(nomParDefaut('HumanoidNewThing_X'), 'Humanoid new thing x');
  const s = sectionsDe(['Avant', 'YawAxisRaw', 'Nouveau', 'SelectTarget']);
  assert.equal(s.get('Avant').section, 'Commandes générales');
  assert.equal(s.get('Nouveau').sous, 'Rotation en vol');
  assert.equal(s.get('SelectTarget').sous, 'Ciblage');
});
