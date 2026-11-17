// Phrase venue d'un autre module (POST /dire) : forme vérifiée, durée de lecture.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dureeBulle, phraseExterne, MAX_MS, MIN_MS } from './externe.js';

test('phrase d’ailleurs : texte nettoyé, humeur connue, source facultative', () => {
  assert.deepEqual(phraseExterne({ texte: '  Tu as\n42 cr.  ', source: 'ia' }), { text: 'Tu as 42 cr.', mood: 'neutre', ms: dureeBulle('Tu as 42 cr.'), source: 'ia', parler: false, voix: null, vitesse: 1, hauteur: 1, volume: 1, audio: null });
  assert.equal(phraseExterne({ texte: 'Aïe.', humeur: 'inquiet' }).mood, 'inquiet');
  assert.equal(phraseExterne({ texte: 'x', source: '<script>' }).source, null);
  for (const b of [null, {}, { texte: '' }, { texte: 'x'.repeat(601) }, { texte: 3 }]) assert.ok(phraseExterne(b).error, JSON.stringify(b));
  assert.match(phraseExterne({ texte: 'x', humeur: 'furieux' }).error, /Humeur inconnue/);
  // À voix haute, avec une voix choisie
  assert.deepEqual([phraseExterne({ texte: 'x', parler: true, voix: 'Microsoft Julie' }).parler, phraseExterne({ texte: 'x', parler: true, voix: 'Microsoft Julie' }).voix], [true, 'Microsoft Julie']);
  assert.ok(phraseExterne({ texte: 'x', parler: 'oui' }).error);
  assert.deepEqual([phraseExterne({ texte: 'x', vitesse: 1.3, hauteur: 0.8 }).vitesse, phraseExterne({ texte: 'x', vitesse: 9 }).vitesse], [1.3, 1]);
  assert.equal(phraseExterne({ texte: 'x', volume: 0.4 }).volume, 0.4); // volume de la voix (Alicia)
  // Son déjà prêt (voix naturelle) : un chemin de l'API locale seulement
  assert.equal(phraseExterne({ texte: 'x', audio: '/api/modules/ia/voix/s3' }).audio, '/api/modules/ia/voix/s3');
  for (const audio of ['http://ailleurs/x.wav', '/api/modules/ia/../../x', '//ailleurs/x', 42]) assert.equal(phraseExterne({ texte: 'x', audio }).audio, null);
});

test('durée de la bulle : le temps de lire, entre 4 et 30 s', () => {
  assert.equal(dureeBulle('ok'), MIN_MS);
  assert.equal(dureeBulle('x'.repeat(600)), MAX_MS);
  assert.equal(dureeBulle('x'.repeat(100)), 8_500);
});
