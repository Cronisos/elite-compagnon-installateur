import { test } from 'node:test';
import assert from 'node:assert/strict';
import { empreinteBuild, modifie, texteRemarques } from './brouillon.js';

const build = () => ({ shipId: 12, name: 'Testeur full défense', slots: { component: [{ modid: 1, bpid: null, grade: 0, expid: null }], internal: [null] } });
const meta = () => ({ id: 3, gameShipId: '', notes: '' });

test('build juste chargé ou enregistré : rien à enregistrer', () => {
  const ref = empreinteBuild(build(), meta());
  assert.equal(modifie(build(), meta(), ref), false);
});

test('module équipé, ingénierie, nom ou notes changés : modifications non enregistrées', () => {
  const ref = empreinteBuild(build(), meta());
  const b = build();
  b.slots.internal[0] = { modid: 7, bpid: null, grade: 0, expid: null };
  assert.equal(modifie(b, meta(), ref), true);
  const g = build();
  g.slots.component[0].grade = 5;
  assert.equal(modifie(g, meta(), ref), true);
  assert.equal(modifie({ ...build(), name: 'Autre' }, meta(), ref), true);
  assert.equal(modifie(build(), { ...meta(), notes: 'à revoir' }, ref), true);
  assert.equal(modifie(build(), { ...meta(), gameShipId: '4' }, ref), true);
});

test('vaisseau visé : « 4 » du menu et 4 du serveur sont la même valeur', () => {
  const ref = empreinteBuild(build(), { ...meta(), gameShipId: 4 });
  assert.equal(modifie(build(), { ...meta(), gameShipId: '4' }, ref), false);
});

test('pas de build ou pas encore de référence : pas d’alerte', () => {
  assert.equal(modifie(null, meta(), 'x'), false);
  assert.equal(modifie(build(), meta(), null), false);
});

test('remarques d’import : jointes, ou null sans remarque', () => {
  assert.equal(texteRemarques(['Module inconnu : Int_Testeur', 'Ingénierie ignorée']), 'Module inconnu : Int_Testeur · Ingénierie ignorée');
  assert.equal(texteRemarques([]), null);
  assert.equal(texteRemarques(undefined), null);
});
