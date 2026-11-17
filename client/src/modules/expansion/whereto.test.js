// Tests de l'affichage « Où agir cette semaine » : fraîcheur des relevés, portée, avancement, tâche envoyée.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageTone, isUsefulArrival, pctText, progressText, reachText, shareText, taskToSend } from './whereto.js';

const WEEK = '2026-11-05T07:00:00.000Z';
const NOW = Date.parse('2026-11-07T12:00:00Z');

test('fraîcheur : semaine en cours, avant le passage de semaine, trop vieux', () => {
  assert.equal(ageTone('2026-11-06T10:00:00Z', WEEK, NOW), 'good');
  assert.equal(ageTone('2026-11-04T10:00:00Z', WEEK, NOW), 'warn');
  assert.equal(ageTone('2026-10-16T22:37:47Z', WEEK, NOW), 'bad');
  assert.equal(ageTone(null, WEEK, NOW), 'bad');
});

test('arrivée : bandeau pour une cible de la liste ou un système valide, ligne discrète pour un saut de transit', () => {
  assert.equal(isUsefulArrival({ inResults: true, valid: false }), true); // cible démentie : le bandeau rouge a du sens
  assert.equal(isUsefulArrival({ inResults: false, valid: true }), true); // trouvaille hors de la liste
  assert.equal(isUsefulArrival({ inResults: false, valid: false }), false); // transit
  assert.equal(isUsefulArrival({ inResults: false, valid: null }), false);
  assert.equal(isUsefulArrival(null), false);
});

test('portée : appui, distance et avertissement quand Spansh ne liste pas la puissance', () => {
  const ok = reachText({ anchor: { name: 'Synuefe HK-C d14-113', state: 'Stronghold', distance: 27.98, source: 'spansh' }, listed: true });
  assert.match(ok, /28 al de Synuefe HK-C d14-113, Forteresse/);
  assert.match(reachText({ anchor: null, listed: true }), /appui absent/);
  assert.match(reachText({ anchor: { name: 'X', state: 'Fortified', distance: 3, source: 'journal' }, listed: false }), /vu en jeu.*ne liste pas/);
});

test('avancement : prise en % et en points, tenu en jauge, renfort et sape', () => {
  assert.equal(progressText({ progress: 0.25, points: 30000, rivals: [] }, 'acquisition').replace(/\s/g, ' '), '25 % (30 000 pts)'.replace(/\s/g, ' '));
  assert.match(progressText({ controlProgress: 0.606965, reinforcement: 68013, undermining: 5175 }, 'own'), /jauge 0,607 · renfort 68.013 · sape 5.175/);
  assert.equal(progressText({ progress: null }, 'acquisition'), '—');
  assert.equal(pctText(0.000225), '0,02 %');
  assert.equal(pctText(0.025), '2,5 %');
});

test('tâche envoyée : activité de base avec les exigences du formulaire, ou tâche enregistrée telle quelle', () => {
  const activities = [{ id: 'undermining', name: 'Sape', relation: 'enemy', states: ['Stronghold'] }];
  const tasks = [{ id: 'abc', name: 'Mégavaisseaux', relation: 'any', states: ['Stronghold'], stationGroups: ['megaship'] }];
  const sent = taskToSend('undermining', { activities, extras: { stationGroups: ['megaship'], enemy: 'Archon Delaine', largePad: true } });
  assert.deepEqual(sent.stationGroups, ['megaship']);
  assert.equal(sent.enemy, 'Archon Delaine');
  assert.equal(sent.largePad, true);
  assert.equal(taskToSend('task:abc', { tasks }).name, 'Mégavaisseaux');
  assert.equal(taskToSend('task:inconnue', { tasks }), null);
  assert.equal(taskToSend('rien', { activities }), null);
});

test('partage Discord : la tâche, les systèmes et l’âge de chaque relevé', () => {
  const text = shareText({ task: { name: 'Prise (acquisition)' }, reference: 'Synuefe OU-E c28-2', power: 'Aisling Duval' },
    [{ name: 'Synuefe GA-I b57-6', distance: 18.02, state: 'Unoccupied', updatedAt: '2026-10-16T22:37:47Z' }], () => 'il y a 22 j');
  assert.match(text, /\*\*Prise \(acquisition\)\*\* autour de Synuefe OU-E c28-2/);
  assert.match(text, /Synuefe GA-I b57-6 · 18 al · Inoccupé · relevé il y a 22 j/);
});

test('partage Discord : un système piégé chez Spansh ne mentionne personne et n’affiche aucun lien masqué', () => {
  const piege = '@everyone [Spansh](https://exemple.invalid/) <@&123456789012345678>';
  const text = shareText({ task: { name: 'Prise (acquisition)' }, reference: '# @here', power: '**Aisling** <@1>' },
    [{ name: piege, distance: 3, state: '||@everyone||', updatedAt: '2026-10-16T22:37:47Z' }], () => 'il y a 22 j');
  assert.ok(!/@(everyone|here)\b/.test(text), text);
  assert.ok(!/<@&?\d/.test(text), text);
  assert.ok(!/(^|[^\\])\]\(/.test(text) && !text.includes('https://'), text);
  assert.ok(!/(^|[^\\])\|\|/.test(text), 'aucun spoiler');
  assert.match(text, /^\*\*Prise \(acquisition\)\*\* autour de \\# @\u{200b}here \(\\\*\\\*Aisling\\\*\\\* <\u{200b}@\u{200b}1>\)/u);
});
