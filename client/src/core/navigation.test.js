// Plan de l'application (navigation.js) : entrées bien formées, fil d'Ariane, rubrique active.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAN, aPlat, aSaPage, entree, estUnePage, exact, filDAriane, rubriqueActive } from './navigation.js';

const titres = (chaine) => chaine.map((e) => e.titre);

test('plan : identifiants uniques, chemins internes, rubriques avec enfants', () => {
  const ids = aPlat().map((c) => c.at(-1).id);
  assert.equal(new Set(ids).size, ids.length, 'identifiants en double');
  for (const chaine of aPlat()) {
    const e = chaine.at(-1);
    assert.match(e.chemin, /^\/[a-z0-9\-/]*(\?onglet=[a-z-]+)?$/, `${e.id} : ${e.chemin}`);
    assert.ok(e.titre, e.id);
  }
  for (const r of PLAN) {
    assert.ok(r.enfants.length, r.id);
    assert.ok(r.icone && r.description, r.id);
  }
  assert.deepEqual(PLAN.filter(aSaPage).map((r) => r.chemin), ['/activites', '/powerplay', '/outils']);
});

test('fil d’Ariane : la page la plus précise, onglets compris', () => {
  assert.deepEqual(titres(filDAriane('/ingenierie/ingenieurs')), ['Ingénierie', 'Ingénieurs']);
  assert.deepEqual(titres(filDAriane('/ingenierie/ingenieurs/42')), ['Ingénierie', 'Ingénieurs']);
  assert.deepEqual(titres(filDAriane('/ingenierie')), ['Ingénierie', 'Tableau de bord']);
  assert.deepEqual(titres(filDAriane('/vaisseaux')), ['Mes vaisseaux']);
  assert.deepEqual(titres(filDAriane('/ingenierie/nouveau-plan')), ['Ingénierie', 'Nouveau plan']);
  assert.deepEqual(titres(filDAriane('/ingenierie/plan/4')), ['Ingénierie', 'Tableau de bord']);
  assert.deepEqual(titres(filDAriane('/builder')), ['Mes vaisseaux', 'Builds', 'Mes builds']);
  assert.deepEqual(titres(filDAriane('/builder/build/3')), ['Mes vaisseaux', 'Builds', 'Mes builds']);
  assert.deepEqual(titres(filDAriane('/reperes')), ['Activités', 'Minage', 'Minage Rhino']);
  assert.deepEqual(titres(filDAriane('/extension')), ['Powerplay & Escadron', 'Projet extension', 'Historique des mérites']);
  assert.deepEqual(titres(filDAriane('/extension', '?onglet=vente')), ['Powerplay & Escadron', 'Projet extension', 'Mérites à la vente']);
  assert.deepEqual(titres(filDAriane('/regles/vigie')), ['Outils', 'Règles du jeu'], 'vigie : pas d’entrée de menu (outil de développement)');
  assert.equal(entree('vigie'), null);
  assert.deepEqual(titres(filDAriane('/activites')), ['Activités']);
  assert.deepEqual(filDAriane('/'), []);
  assert.deepEqual(filDAriane('/parametres'), []);
  assert.deepEqual(filDAriane('/routesxyz'), []); // pas « /routes » : un autre mot
});

test('rubrique active', () => {
  assert.equal(rubriqueActive('/outils').id, 'outils');
  assert.equal(rubriqueActive('/ingenierie/rangs').id, 'ingenierie');
  assert.equal(rubriqueActive('/vaisseaux').id, 'vaisseaux');
  assert.equal(rubriqueActive('/builder/comparer').id, 'vaisseaux');
  assert.equal(rubriqueActive('/combat').id, 'activites');
  assert.equal(rubriqueActive('/'), null);
});

test('rubriques séparées : rien de l’ingénierie dans Mes vaisseaux, et l’inverse', () => {
  const sous = (id) => aPlat([entree(id)]).map((c) => c.at(-1).chemin);
  assert.ok(sous('vaisseaux').every((c) => !c.startsWith('/ingenierie')), 'Mes vaisseaux pointe vers l’ingénierie');
  assert.ok(sous('ingenierie').every((c) => c.startsWith('/ingenierie')), 'Ingénierie pointe hors de ses pages');
  assert.equal(entree('vaisseaux').chemin, '/vaisseaux', 'Mes vaisseaux ouvre la flotte');
  assert.equal(entree('flotte'), null, 'plus d’entrée « Ma flotte »');
  assert.equal(aSaPage(entree('vaisseaux')), false, 'pas de page de cartes : la flotte');
  assert.equal(entree('rien'), null);
});

test('onglets : allumés seulement sur leur page quand un autre vit dessous', () => {
  const ing = entree('ingenierie').enfants;
  assert.equal(exact(ing.find((e) => e.id === 'tableau'), ing), true); // /ingenierie : pas sur /ingenierie/rangs
  assert.equal(exact(ing.find((e) => e.id === 'rangs'), ing), false);
  assert.equal(estUnePage(entree('vaisseaux')), true); // onglet « Mes vaisseaux », puis Builds
  assert.equal(estUnePage(entree('ingenierie')), false); // son onglet, c'est le Tableau de bord
  const b = entree('builds').enfants;
  assert.equal(exact(b.find((e) => e.id === 'mes-builds'), b), true);
});
