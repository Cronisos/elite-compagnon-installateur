// Chiffrement de bout en bout des partages : aller-retour, plusieurs destinataires, refus de ce qui n'est pas pour soi
// ou a été modifié, et ce que voit le serveur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLE_PUBLIQUE, MAX_ENVELOPPE, chiffrer, dechiffrer, empreinte, estChiffre, nouvellePaire, paireValide } from './chiffre.js';

const clair = { titre: 'Filon de Platine', data: { label: 'Filon de Platine', system: 'Système Test', latitude: 12.5, notes: 'près du cratère' } };

test('paire de clés : publique brute de 32 octets, relue sans confiance', () => {
  const p = nouvellePaire();
  assert.match(p.publique, CLE_PUBLIQUE);
  assert.deepEqual(paireValide(p), p);
  assert.notEqual(nouvellePaire().publique, p.publique);
  const autre = nouvellePaire();
  for (const mauvais of [null, {}, { publique: p.publique }, { publique: 'x', privee: p.privee }, { publique: autre.publique, privee: p.privee }, { publique: p.publique, privee: 'pas une clé' }]) {
    assert.equal(paireValide(mauvais), null);
  }
});

test('aller-retour : chaque destinataire lit, avec chacune de ses installations ; les autres non', () => {
  const [moi, lui1, lui2, tiers] = [nouvellePaire(), nouvellePaire(), nouvellePaire(), nouvellePaire()];
  const env = chiffrer(clair, [moi.publique, lui1.publique, lui2.publique, lui1.publique]);
  assert.equal(estChiffre(env), true);
  assert.equal(env.cles.length, 3, 'une clé enveloppée par installation, sans doublon');
  for (const p of [moi, lui1, lui2]) assert.deepEqual(dechiffrer(env, p), clair);
  assert.equal(dechiffrer(env, tiers), null, 'pas destinataire : illisible');
});

test('le serveur ne voit ni le titre ni le contenu, seulement des empreintes de clés', () => {
  const [moi, lui] = [nouvellePaire(), nouvellePaire()];
  const texte = JSON.stringify(chiffrer(clair, [moi.publique, lui.publique]));
  for (const secret of ['Platine', 'Système Test', 'cratère', '12.5', moi.publique, lui.publique]) assert.ok(!texte.includes(secret), secret);
  assert.ok(texte.includes(empreinte(lui.publique)));
  assert.notEqual(JSON.stringify(chiffrer(clair, [lui.publique])), JSON.stringify(chiffrer(clair, [lui.publique])), 'jamais deux fois la même enveloppe');
});

test('enveloppe modifiée, abîmée ou incomplète : rien n’est rendu', () => {
  const lui = nouvellePaire();
  const env = chiffrer(clair, [lui.publique]);
  const change = (f) => { const c = JSON.parse(JSON.stringify(env)); f(c); return c; };
  const retourne = (s) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
  assert.equal(dechiffrer(change((c) => { c.ct = retourne(c.ct); }), lui), null, 'contenu modifié');
  assert.equal(dechiffrer(change((c) => { c.cles[0].w = retourne(c.cles[0].w); }), lui), null, 'clé enveloppée modifiée');
  assert.equal(dechiffrer(change((c) => { c.eph = nouvellePaire().publique; }), lui), null, 'clé éphémère remplacée');
  assert.equal(dechiffrer(change((c) => { c.cles = []; }), lui), null);
  assert.equal(dechiffrer(change((c) => { delete c.eph; }), lui), null);
  for (const pas of [null, {}, { e2e: 2, ct: 'x' }, { label: 'un repère en clair' }, 'texte']) {
    assert.equal(estChiffre(pas), false);
    assert.equal(dechiffrer(pas, lui), null);
  }
});

test('sans clé de destinataire valable : refusé ; taille d’une enveloppe pour 30 personnes à 2 installations', () => {
  assert.throws(() => chiffrer(clair, []), /aucune clé/);
  assert.throws(() => chiffrer(clair, ['pas une clé', null, 42]), /aucune clé/);
  const cles = Array.from({ length: 61 }, () => nouvellePaire().publique);
  const gros = { titre: 'Build', data: { texte: 'x'.repeat(8000) } };
  const taille = JSON.stringify(chiffrer(gros, cles)).length;
  assert.ok(taille < MAX_ENVELOPPE, `${taille} octets`);
});
