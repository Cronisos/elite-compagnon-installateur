// Langue du jeu (Fileheader) : avertissement quand elle n'est pas French/FR.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { languageStatus, trackGameLanguage } from './language.js';

// Fileheader réel (journal du 23 oct. 2026)
const FR = { timestamp: '2026-10-23T19:29:12Z', event: 'Fileheader', part: 1, language: 'French/FR', Odyssey: true, gameversion: '4.4.2.1', build: 'r334925/r0 ' };
const EN = { ...FR, timestamp: '2026-11-08T10:00:00Z', language: 'English/UK' };

test('jeu en français : aucun avertissement', () => {
  const s = languageStatus('French/FR', FR.timestamp);
  assert.deepEqual(s, { language: 'French/FR', french: true, warning: null, at: FR.timestamp });
});

test('jeu dans une autre langue : OCR et noms non garantis', () => {
  const s = languageStatus('English/UK');
  assert.equal(s.french, false);
  assert.match(s.warning, /^Ton jeu est en anglais \(English\/UK\)/);
  assert.match(s.warning, /OCR/);
  assert.match(s.warning, /noms/);
  assert.match(languageStatus('German/DE').warning, /en allemand/);
  // Langue inconnue, ou autre variante du français : nom brut, sans traduction hasardeuse
  assert.match(languageStatus('Klingon/KL').warning, /réglé sur « Klingon\/KL »/);
  assert.match(languageStatus('French/CA').warning, /réglé sur « French\/CA »/);
});

test('langue absente : rien n’est affirmé', () => {
  for (const v of [undefined, null, '', '   ', 42]) {
    assert.deepEqual(languageStatus(v), { language: null, french: null, warning: null, at: null });
  }
  assert.equal(languageStatus('x'.repeat(500)).language.length, 40, 'texte du journal borné');
});

test('suivi : dernier Fileheader de l’historique, puis chaque nouveau journal', () => {
  const journal = new EventEmitter();
  const interest = new Set();
  journal.addInterest = (names) => names.forEach((n) => interest.add(n));
  const changes = [];
  const tracker = trackGameLanguage(journal, (s) => changes.push(s.language));
  assert.ok(interest.has('Fileheader'), "l'historique doit garder les Fileheader");
  assert.equal(tracker.current().language, null);

  journal.emit('ready', { history: [EN, { event: 'LoadGame' }, FR, { event: 'Location' }] });
  assert.equal(tracker.current().language, 'French/FR');
  assert.equal(tracker.current().warning, null);

  journal.emit('event', { event: 'Location' });
  journal.emit('event', EN);
  assert.equal(tracker.current().french, false);
  assert.equal(tracker.current().at, EN.timestamp);
  journal.emit('event', EN); // même langue : pas de nouvelle annonce
  assert.deepEqual(changes, ['French/FR', 'English/UK']);

  journal.emit('ready', { history: [] }); // dossier vide ou introuvable
  assert.equal(tracker.current().language, null);
  assert.deepEqual(changes, ['French/FR', 'English/UK', null]);
});
