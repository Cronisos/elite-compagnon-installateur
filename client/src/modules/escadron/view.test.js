// Tests de la mise en forme de la page Escadron.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deltaText, journalCheck, sensorSummary, statusClass, tokenCmdrText, valueText, weekNote } from './view.js';

test('plusieurs commandants sans choix : le résumé demande le choix, rien ne part ; commandant des gains expliqué', () => {
  const base = { enabled: true, hasToken: true, queue: 2, blocked: 2, blockedCmdrs: ['Autre Joueur', 'Testeur'], liveGalaxy: true, gameVersion: '4.4.2.1', status: { text: '' } };
  const s = sensorSummary({ ...base, needsChoice: true, commanders: ['Autre Joueur', 'Testeur'] });
  assert.equal(s.tone, 'warn');
  assert.match(s.text, /Plusieurs commandants dans tes journaux \(CMDR Autre Joueur, CMDR Testeur\) : choisis celui de ton jeton\. Rien ne part avant ton choix/);
  assert.doesNotMatch(s.text, /pas celui de/, 'pas un refus du serveur');
  assert.equal(tokenCmdrText({ tokenCmdr: 'Testeur', chosenCmdr: 'Testeur' }), 'CMDR Testeur (accepté par le serveur)');
  assert.equal(tokenCmdrText({ chosenCmdr: 'Testeur', sendingFor: 'Testeur' }), 'CMDR Testeur (ton choix)');
  assert.equal(tokenCmdrText({ sendingFor: 'Testeur' }), 'CMDR Testeur (seul commandant de tes journaux)');
  assert.match(tokenCmdrText({ needsChoice: true }), /à choisir : rien ne part avant ton choix/);
  assert.equal(tokenCmdrText({}), null);
});

const nb = (s) => s.replace(/[  ]/g, ' '); // espaces fines insécables du format français

test('valeurs : crédits abrégés, mérites et tonnes entiers, écart signé', () => {
  assert.equal(nb(valueText(3202321549, 'cr')), '3,20 Md cr');
  assert.equal(nb(valueText(1296017, 'mérites')), '1 296 017');
  assert.equal(nb(valueText(12, 't')), '12 t');
  assert.equal(valueText(null, 'cr'), '—');
  assert.equal(nb(deltaText(47251, 'mérites')), '+47 251');
  assert.equal(nb(deltaText(-5, null)), '−5');
  assert.equal(deltaText(0, 'cr'), '0 cr');
  assert.equal(deltaText(null, 'cr'), '—');
});

test('statut d\'une règle : couleur de la pastille', () => {
  assert.equal(statusClass('mesurée'), 'pill pill-good');
  assert.equal(statusClass('à vérifier'), 'pill pill-warn');
  assert.equal(statusClass('inconnue'), 'pill pill-muted');
  assert.equal(statusClass('__proto__'), 'pill pill-muted');
});

test('recoupement Powerplay : égal au journal, ou écart signalé', () => {
  const ok = journalCheck({ delta: 47251, journal: { real: 47251, listed: 49266, doubled: 2015, lines: 6 } });
  assert.equal(ok.ok, true);
  assert.match(nb(ok.text), /47 251 mérites crédités, 49 266 écrits dont 2 015 en double$/);
  // Depuis l'arrivée, vrais journaux : 6 657 non crédités, dont seulement 203 sur des lignes en double
  const all = journalCheck({ delta: 1296073, journal: { real: 1296073, listed: 1302730, doubled: 203, lines: 1154 } });
  assert.match(nb(all.text), /1 302 730 écrits dont 6 657 non crédités \(203 en double, 6 454 annulés par la ligne suivante\)/);
  const cancelled = journalCheck({ delta: 1773, journal: { real: 1773, listed: 3788, doubled: 0, lines: 2 } });
  assert.match(nb(cancelled.text), /dont 2 015 annulés par la ligne suivante$/);
  const off = journalCheck({ delta: 1140, journal: { real: 1196, listed: 1308, lines: 9 } });
  assert.equal(off.ok, false);
  assert.match(nb(off.text), /Écart avec l'escadron : −56./);
  assert.equal(journalCheck({ delta: null, journal: { real: 1, listed: 1 } }), null);
  assert.equal(journalCheck({ delta: 3 }), null);
});

test('résumé du capteur : désactivé, sans jeton, jeton refusé, en attente, à jour', () => {
  const base = { enabled: true, hasToken: true, queue: 0, liveGalaxy: true, gameVersion: '4.4.2.1', status: { text: '' } };
  assert.equal(sensorSummary({ ...base, enabled: false }).tone, 'muted');
  assert.equal(sensorSummary({ ...base, hasToken: false }).tone, 'warn');
  assert.equal(sensorSummary({ ...base, paused: true, status: { text: 'Jeton refusé (erreur 401)' } }).text, 'Jeton refusé (erreur 401)');
  assert.match(sensorSummary({ ...base, waitingRetry: true, queue: 3, status: { text: 'Serveur injoignable.' } }).text, /3 gains attendent/);
  assert.equal(sensorSummary({ ...base, liveGalaxy: false, gameVersion: '3.8.0.407' }).tone, 'warn');
  assert.match(sensorSummary({ ...base, queue: 1 }).text, /1 gain en file/);
  // Jeton d'un autre commandant (403) : les gains attendent le bon jeton
  const refused = sensorSummary({ ...base, queue: 3, blocked: 3, blockedCmdrs: ['Testeur'] });
  assert.equal(refused.tone, 'bad');
  assert.match(nb(refused.text), /pas celui de CMDR Testeur : 3 gains attendent dans la file/);
  assert.match(nb(sensorSummary({ ...base, queue: 5, blocked: 2, blockedCmdrs: ['Alt'] }).text), /3 gains en file d'attente\. 2 gains attendent le jeton de CMDR Alt\./);
  assert.equal(sensorSummary({ ...base, lastOkAt: '2026-11-07T21:00:00Z', lastConfirmedAt: '2026-11-07T20:59:00Z' }).tone, 'good');
  assert.equal(sensorSummary(null).tone, 'muted');
});

test('semaine Powerplay : point de départ expliqué, séance à cheval sur le passage signalée', () => {
  const data = { from: '2026-11-05T12:00:00Z', presets: { week: '2026-11-05T12:00:00Z' }, week: { start: '2026-11-05T07:00:00Z', spill: null } };
  assert.match(weekNote(data), /premier relevé qui suit\.$/);
  assert.match(nb(weekNote({ ...data, week: { ...data.week, spill: { merits: 1060, lines: 3 } } })), /ses 1 060 mérites gagnés après sont dans ce relevé de départ/);
  assert.equal(weekNote({ ...data, from: '2026-11-07T08:16:05Z' }), ''); // autre période choisie
  assert.equal(weekNote(null), '');
});

test('qui envoie ses mérites : inscrits, actifs sur 7 jours, endormis, jamais ; rien si le serveur est trop ancien', async () => {
  const { bilanEnvois } = await import('./view.js');
  const now = Date.parse('2026-11-17T12:00:00Z');
  const membres = [
    { cmdr: 'Testeur', dernierEnvoi: '2026-11-17T08:00:00Z' },
    { cmdr: 'Autre Joueur', dernierEnvoi: '2026-11-12T08:00:00Z' },
    { cmdr: 'Endormi', dernierEnvoi: '2026-10-01T08:00:00Z' },
    { cmdr: 'Jamais', dernierEnvoi: null },
  ];
  const b = bilanEnvois(membres, now);
  assert.deepEqual([b.inscrits, b.actifs, b.endormis, b.jamais], [4, 2, ['Endormi'], ['Jamais']]);
  assert.equal(b.texte.replace(/[\u202f\u00a0]/g, ' '), '4 inscrits · 2 ont envoyé des mérites ces 7 derniers jours · 1 plus ancien · 1 n’a jamais rien envoyé');
  assert.equal(bilanEnvois([{ cmdr: 'Testeur', dernierEnvoi: '2026-11-17T08:00:00Z' }], now).texte.replace(/[\u202f\u00a0]/g, ' '), '1 inscrit · 1 a envoyé des mérites ces 7 derniers jours');
  assert.equal(bilanEnvois([{ cmdr: 'Testeur' }], now), null, 'serveur d’avant : il ne donne pas la date');
  assert.equal(bilanEnvois([], now), null);
});
