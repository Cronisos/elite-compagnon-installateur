// Bandeaux de santé (santeVue.js) : journaux introuvables, module en panne, données de référence abîmées ou périmées.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TELECHARGER_REFERENCE, accueilVide, bandeauxSante } from './santeVue.js';

const OK = { journal: { dir: 'C:\\Jeu', error: null }, modules: [], reference: null };

test('santé : rien à dire quand tout va bien (ou avant la première réponse)', () => {
  assert.deepEqual(bandeauxSante(null), []);
  assert.deepEqual(bandeauxSante(OK), []);
  assert.deepEqual(bandeauxSante({}), []);
});

test('santé : journaux introuvables : bandeau rouge avec le lien vers Paramètres, et l’accueil dit pourquoi', () => {
  const journal = { dir: 'D:\\Jeux\\Saved Games\\Frontier Developments\\Elite Dangerous', error: 'Dossier introuvable : D:\\Jeux\\Saved Games\\Frontier Developments\\Elite Dangerous' };
  const [b, ...reste] = bandeauxSante({ ...OK, journal });
  assert.deepEqual(reste, []);
  assert.equal(b.ton, 'danger');
  assert.match(b.texte, /ne trouve pas les journaux du jeu \(Dossier introuvable : D:\\Jeux/);
  assert.equal(b.lien, '/parametres');
  assert.match(accueilVide(journal), /introuvables : règle leur dossier dans Paramètres/);
  assert.match(accueilVide({ error: null }), /^Lance le jeu/);
  assert.match(accueilVide(null), /^Lance le jeu/);
});

test('santé : module en panne nommé ; données abîmées : retéléchargées en un clic, sauf si Mon ingénierie est en panne', () => {
  const abimees = { error: 'Données de référence abîmées (coriolis/ships/adder.json : contenu invalide) : retélécharge-les.' };
  const l = bandeauxSante({ ...OK, modules: [{ id: 'bilan', name: 'Bilans de session', error: 'fichier illisible' }], reference: abimees });
  assert.deepEqual(l.map((b) => b.id), ['module-bilan', 'reference']);
  assert.match(l[0].texte, /« Bilans de session » n'a pas pu démarrer \(fichier illisible\)/);
  const [sans] = bandeauxSante({ ...OK, modules: [{ id: 'bilan', name: 'Bilans de session', error: null }] });
  assert.match(sans.texte, /^« Bilans de session » n'a pas pu démarrer : ses pages restent vides\./, 'pas d’erreur technique : pas de parenthèses vides');
  assert.equal(l[1].texte, abimees.error);
  assert.equal(l[1].envoi, TELECHARGER_REFERENCE);
  assert.equal(l[1].lien, '/ingenierie/donnees');

  const panne = bandeauxSante({ ...OK, modules: [{ id: 'engineering', name: 'Mon ingénierie', error: 'x' }], reference: abimees });
  assert.equal(panne[1].envoi, undefined, 'route du module en panne : pas de bouton qui répondrait 503');
});

test('santé : données pas aux versions figées : avertissement orange avec le bouton', () => {
  const [b] = bandeauxSante({ ...OK, reference: { pinned: false, problems: ['fdevids/material.csv absent'] } });
  assert.equal(b.ton, 'warning');
  assert.match(b.texte, /pas celles de cette version de l'app/);
  assert.equal(b.envoi, TELECHARGER_REFERENCE);
});
