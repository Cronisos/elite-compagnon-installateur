// Vigie des règles, côté vente : chaque cause de 0 pointe vers une fiche du dépôt ; une vente qui contredit une règle
// est un écart, un 0 annoncé par une règle une mesure conforme, le reste n'apprend rien.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAUSE_REGLE, venteVigie } from './sale.js';
import { fiche } from '../../regles/index.js';

test('chaque cause de 0 pointe vers une fiche du dépôt des règles', () => {
  for (const [cause, id] of CAUSE_REGLE) assert.ok(fiche(id), `${cause} → ${id}`);
});

test('vente contredite : écart sur la règle de la cause qui pèse le plus ; 0 annoncé : conforme ; vente normale : rien', () => {
  const contredite = { cause: 'rule-contradicted', merits: 420, count: 100, lots: [{ ok: false, cause: 'enemy', count: 80 }, { ok: false, cause: 'tiny', count: 20 }] };
  assert.deepEqual(venteVigie(contredite), { regle: 'powerplay.vente.ennemi-ou-vide', attendu: 0, observe: 420, ecart: true, details: { cause: 'enemy', tonnes: 100 } });
  assert.deepEqual(venteVigie({ cause: 'reinf-mined-elsewhere', merits: 0, count: 12 }), { regle: 'powerplay.vente.renforcement-meme-systeme', attendu: 0, observe: 0, ecart: false, details: { cause: 'reinf-mined-elsewhere', tonnes: 12 } });
  assert.equal(venteVigie({ cause: 'unexplained', merits: 0 }), null, 'un 0 inexpliqué ne désigne aucune règle');
  assert.equal(venteVigie({ merits: 1200, eligible: 100 }), null);
});
