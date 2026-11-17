// Cartes des ingénieurs (ingenieursVue.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAMILLES, etatIngenieur, familleDe, filtrerFamille, initiales, lignesOffres, nomGroupe } from './ingenieursVue.js';

const labels = { groups: { t: 'Propulseurs', fsd: 'Réacteur FSD', advmc: 'advmc' } };

test('offres : une ligne par module au grade le plus haut, du plus haut au plus bas', () => {
  const offres = [['t', 'Engine_Dirty', 5], ['t', 'Engine_Tuned', 3], ['fsd', 'FSD_LongRange', 3], ['advmc', 'Weapon_Sturdy', 3]];
  assert.deepEqual(lignesOffres(offres, labels).map((l) => `G${l.grade} ${l.nom}`), ['G5 Propulseurs', 'G3 Multicanon avancé', 'G3 Réacteur FSD']);
  assert.equal(nomGroupe('cc', labels), 'Contrôleur de drones collecteurs');
  assert.equal(nomGroupe('zz', labels), 'zz');
  assert.deepEqual(lignesOffres(null, labels), []);
});

test('familles : chaque groupe à une seule famille, filtre par famille', () => {
  const vus = FAMILLES.flatMap((f) => f.groupes);
  assert.equal(new Set(vus).size, vus.length, 'un groupe dans deux familles');
  assert.equal(familleDe('t'), 'propulsion');
  assert.equal(familleDe('inconnu'), 'divers');
  const ing = [{ id: 1, offers: [['t', 'x', 5]] }, { id: 2, offers: [['bl', 'x', 5]] }];
  assert.deepEqual(filtrerFamille(ing, 'thermiques').map((e) => e.id), [2]);
  assert.equal(filtrerFamille(ing, null).length, 2);
});

test('état chez toi et initiales', () => {
  assert.deepEqual(etatIngenieur({ progress: 'Unlocked', rank: 5, rankProgress: 0 }), { texte: 'Débloqué · rang 5', ton: 'debloque', rang: 5, progres: 0 });
  assert.equal(etatIngenieur({ progress: 'Invited' }).ton, 'invite');
  assert.equal(etatIngenieur({ progress: 'Known' }).texte, 'Connu');
  assert.equal(etatIngenieur({ progress: null }).ton, 'inconnu');
  assert.equal(initiales('Bill Turner'), 'BT');
  assert.equal(initiales("Tod 'The Blaster' McQuinn"), 'TM');
  assert.equal(initiales('Professor Palin'), 'PP');
  assert.equal(initiales(''), '?');
});
