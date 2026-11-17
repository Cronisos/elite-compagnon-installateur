import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choisirVoix, direAVoixHaute, estNaturelle, jouerSon, texteParle, voixFrancaises } from './voix.js';

const VOIX = [
  { name: 'Microsoft David - English (United States)', lang: 'en-US' },
  { name: 'Microsoft Hortense - French (France)', lang: 'fr-FR' },
  { name: 'Microsoft Julie - French (France)', lang: 'fr-FR' },
];

test('voix : françaises seulement, celle demandée, sinon Julie, sinon une française', () => {
  const synth = { getVoices: () => VOIX };
  assert.deepEqual(voixFrancaises(synth).map((v) => v.name.split(' ')[1]), ['Hortense', 'Julie']);
  assert.match(choisirVoix(voixFrancaises(synth), 'Microsoft Hortense - French (France)').name, /Hortense/);
  assert.match(choisirVoix(voixFrancaises(synth), 'inconnue').name, /Julie/);
  assert.equal(choisirVoix([], null), null);
  assert.equal(voixFrancaises(undefined).length, 0);
});

test('à voix haute : sans le renvoi à la fenêtre principale ni le gras ; sans synthèse, rien', () => {
  assert.equal(texteParle('Tu as **42 cr**. (la suite dans la fenêtre principale)'), 'Tu as 42 cr.');
  const dits = [];
  const ancienne = globalThis.SpeechSynthesisUtterance;
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  try {
    const synth = { getVoices: () => VOIX, cancel: () => dits.push('stop'), speak: (u) => dits.push(`${u.voice.name.split(' ')[1]} : ${u.text}`) };
    assert.equal(direAVoixHaute('Bonjour.', null, { vitesse: 1.2, hauteur: 0.9 }, synth), true);
    assert.deepEqual(dits, ['stop', 'Julie : Bonjour.']);
  } finally {
    globalThis.SpeechSynthesisUtterance = ancienne;
  }
  assert.equal(direAVoixHaute('Bonjour.', null, {}, null), false);
});

test('voix naturelle : reconnue par son nom ; seuls les sons de l’API locale se jouent', () => {
  assert.equal(estNaturelle('naturelle:4'), true);
  assert.equal(estNaturelle('Microsoft Julie - French (France)'), false);
  const joues = [];
  globalThis.Audio = class { constructor(src) { this.src = src; joues.push(this); } play() { return Promise.resolve(); } pause() { this.coupe = true; } };
  try {
    assert.equal(jouerSon('http://ailleurs/x.wav'), false);
    assert.equal(jouerSon('/api/modules/ia/voix/s1', { volume: 0.6 }), true);
    assert.equal(joues[0].volume, 0.6);
    jouerSon('/api/modules/ia/voix/s2');
    assert.equal(joues[0].coupe, true); // la phrase précédente est coupée
  } finally {
    delete globalThis.Audio;
  }
});
