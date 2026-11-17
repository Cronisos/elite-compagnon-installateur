import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blocage, choixDepuis, libelleAudience, partageDe, recusDe, versDestinataires } from './partage.js';

const ROLES = [{ id: 'officier', name: 'Officier', rank: 20 }, { id: 'recrue', name: 'Recrue', rank: 10 }];

test('à qui va un partage', () => {
  assert.equal(libelleAudience({ audience: 'all' }, ROLES), 'tout l’escadron');
  assert.equal(libelleAudience({ audience: 'role', role: 'officier' }, ROLES), 'Officier et au-dessus');
  assert.match(libelleAudience({ audience: 'role', role: 'parti' }, ROLES), /supprimé/);
  assert.equal(libelleAudience({ audience: 'cmdrs', to: ['Testeur', 'Testeur 2'] }, ROLES), 'Testeur, Testeur 2');
  assert.equal(libelleAudience({ audience: 'cmdrs', to: ['A', 'B', 'C', 'D', 'E'] }, ROLES), 'A, B, C et 2 de plus');
  assert.equal(libelleAudience({ audience: 'cmdrs' }, ROLES), 'toi'); // reçu : la liste reste à l'auteur
});

test('mon partage d’un objet, et les reçus d’une rubrique', () => {
  const miens = [{ kind: 'repere', ref: '12' }];
  assert.equal(partageDe(miens, 'repere', 12), miens[0]);
  assert.equal(partageDe(miens, 'build', 12), null);
  assert.equal(partageDe(undefined, 'repere', 12), null);
  const vue = { recus: [{ kind: 'repere', updatedAt: '2026-11-01T00:00:00Z', id: 'a' }, { kind: 'build', updatedAt: '2026-11-03T00:00:00Z', id: 'b' }, { kind: 'repere-rhino', updatedAt: '2026-11-02T00:00:00Z', id: 'c' }] };
  assert.deepEqual(recusDe(vue, ['repere', 'repere-rhino']).map((s) => s.id), ['c', 'a']);
  assert.deepEqual(recusDe(null, ['repere']), []);
});

test('destinataires du formulaire', () => {
  assert.deepEqual(versDestinataires({ mode: 'all' }), { all: true });
  assert.deepEqual(versDestinataires({ mode: 'role', role: 'officier' }), { role: 'officier' });
  assert.equal(versDestinataires({ mode: 'role', role: '' }), null);
  assert.deepEqual(versDestinataires({ mode: 'cmdrs', cmdrs: ['Testeur'] }), { cmdrs: ['Testeur'] });
  assert.equal(versDestinataires({ mode: 'cmdrs', cmdrs: [] }), null);
  assert.deepEqual(choixDepuis({ audience: 'cmdrs', to: ['Testeur'] }), { mode: 'cmdrs', role: '', cmdrs: ['Testeur'] });
  assert.deepEqual(choixDepuis(null), { mode: 'all', role: '', cmdrs: [] });
});

test('ce qui bloque le partage', () => {
  assert.equal(blocage(null), null);
  assert.match(blocage({ pret: false }), /Rejoins/);
  assert.match(blocage({ pret: true, actif: false }), /coupé/);
  assert.match(blocage({ pret: true, actif: true, attente: true }), /confirmée/);
  assert.equal(blocage({ pret: true, actif: true, attente: false }), null);
});

test('réglage automatique : liste déroulante dans les deux sens', async () => {
  const { destinatairesAuto, valeurAuto } = await import('./partage.js');
  assert.equal(valeurAuto(null), '');
  assert.equal(valeurAuto({ all: true }), 'all');
  assert.equal(valeurAuto({ role: 'officier' }), 'role:officier');
  assert.equal(valeurAuto({ cmdrs: ['Testeur'] }), 'cmdrs');
  assert.deepEqual(destinatairesAuto('all'), { all: true });
  assert.deepEqual(destinatairesAuto('role:officier'), { role: 'officier' });
  assert.equal(destinatairesAuto(''), null);
  assert.equal(destinatairesAuto('role:'), null);
  assert.equal(destinatairesAuto('cmdrs'), null);
});

test('chiffrement prévu : seulement pour des personnes, toutes avec une clé, depuis un PC qui a publié la sienne', async () => {
  const { chiffrementPrevu } = await import('./partage.js');
  const vue = { chiffrement: true, membres: [{ cmdr: 'Testeur', chiffrable: true }, { cmdr: 'Testeur 2', chiffrable: true }, { cmdr: 'Ancien', chiffrable: false }] };
  assert.equal(chiffrementPrevu(vue, { mode: 'all', cmdrs: [] }), null);
  assert.equal(chiffrementPrevu(vue, { mode: 'role', role: 'x', cmdrs: [] }), null);
  assert.equal(chiffrementPrevu(vue, { mode: 'cmdrs', cmdrs: [] }), null);
  assert.deepEqual(chiffrementPrevu(vue, { mode: 'cmdrs', cmdrs: ['testeur 2'] }), { chiffre: true, sansCle: [], pret: true });
  assert.deepEqual(chiffrementPrevu(vue, { mode: 'cmdrs', cmdrs: ['Testeur 2', 'Ancien'] }), { chiffre: false, sansCle: ['Ancien'], pret: true });
  assert.deepEqual(chiffrementPrevu({ ...vue, chiffrement: false }, { mode: 'cmdrs', cmdrs: ['Testeur 2'] }), { chiffre: false, sansCle: [], pret: false });
  assert.deepEqual(chiffrementPrevu({ membres: [] }, { mode: 'cmdrs', cmdrs: ['Inconnu'] }), { chiffre: false, sansCle: ['Inconnu'], pret: false });
});
