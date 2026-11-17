// Déblocage : ce que le joueur a pour chacun des 25 objets (soute, matériaux, solde ; jamais « ✓ » pour des primes ou
// des obligations), et la chaîne de découverte par référence (R14).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemCheck, unlockChain, unlockSteps, parentNeedsClimb } from '../services/unlock.js';
import { Inventory } from '../services/inventory.js';
import { ref, idx, id } from './helpers/itinerary.js';

const item = (name) => idx.byId.get(id(name)).unlock.items[0];
const inv = (items) => {
  const i = new Inventory();
  for (const [k, n] of Object.entries(items)) i.add(k, n);
  return i;
};
const have = (over = {}) => ({ ref, inventory: inv({}), cargo: { known: true, lines: [] }, balance: 1_000_000, ...over });
const line = (name, count, label = null, missionId = null) => ({ name, label: label ?? name, count, ...(missionId ? { missionId } : {}) });

test('objets de déblocage : un cas par ingénieur (25), l’état exact', () => {
  const cases = [
    ['Didi Vatermann', { cargo: { known: true, lines: [line('lavianbrandy', 50, 'Brandy lavien')] } }, 'ok', 50],
    ['Bill Turner', { cargo: { known: true, lines: [line('bromellite', 20, 'Bromellite')] } }, 'manque', 20],
    ['Broo Tarquin', { cargo: { known: true, lines: [line('fujintea', 50, 'Thé de Fujin')] } }, 'ok', 50],
    ['The Sarge', { inventory: inv({ shieldpatternanalysis: 50 }) }, 'ok', 50],
    ['Zacariah Nemo', { cargo: { known: true, lines: [line('xihecompanions', 10, 'Compagnons biomorphiques de Xihe')] } }, 'manque', 10],
    ['Liz Ryder', { cargo: { known: true, lines: [line('autre', 200, 'Landmines')] } }, 'ok', 200],
    ['Hera Tani', { cargo: { known: true, lines: [line('kamitracigars', 50, 'Cigares de Kamitra')] } }, 'ok', 50],
    ['Felicity Farseer', { cargo: { known: true, lines: [line('metaalloys', 1, 'Méta-alliages')] } }, 'ok', 1],
    ['Ram Tah', { inventory: inv({ scandatabanks: 12 }) }, 'manque', 12],
    ['Lei Cheung', { cargo: { known: true, lines: [{ name: 'gold', label: 'Gold', count: 150 }, line('gold', 100, 'Or', 987654)] } }, 'manque', 150],
    ['Petra Olmanova', { cargo: { known: true, lines: [line('progenitorcells', 200, 'Cellules souches')] } }, 'ok', 200],
    ['Colonel Bris Dekker', { balance: 50_000_000 }, 'inconnu', null],
    ['Marsha Hicks', { cargo: { known: true, lines: [line('osmium', 10, 'Osmium')] } }, 'ok', 10],
    ['Elvira Martuuk', { cargo: { known: true, lines: [line('soontillrelics', 3, 'Reliques de Soontill')] } }, 'ok', 3],
    ['The Dweller', { balance: 400_000 }, 'manque', 400000],
    ['Marco Qwent', { cargo: { known: true, lines: [line('modularterminals', 25, 'Terminaux modulaires')] } }, 'ok', 25],
    ['Selene Jean', { cargo: { known: true, lines: [line('painite', 4, 'Painite')] } }, 'manque', 4],
    ['Professor Palin', { inventory: inv({ unknownenergysource: 25 }) }, 'ok', 25],
    ['Lori Jameson', { cargo: { known: true, lines: [line('konggaale', 25, 'Bière de Kongga')] } }, 'ok', 25],
    ['Juri Ishmaak', { balance: 50_000_000 }, 'inconnu', null],
    ["Tod 'The Blaster' McQuinn", { balance: 50_000_000 }, 'inconnu', null],
    ['Tiana Fortune', { inventory: inv({ decodedemissiondata: 49 }) }, 'manque', 49],
    ['Mel Brandon', { balance: 50_000_000 }, 'inconnu', null],
    ['Etienne Dorn', { cargo: { known: true, lines: [line('occupiedcryopod', 25, 'Nacelle d’évacuation occupée')] } }, 'ok', 25],
    ['Chloe Sedesi', { inventory: inv({ unknownenergysource: 3 }) }, 'manque', 3],
  ];
  assert.equal(cases.length, 25);
  for (const [name, over, state, count] of cases) {
    const c = itemCheck(item(name), have(over));
    assert.equal(c.state, state, name);
    assert.equal(c.count, count, name);
  }
  // Une ligne de mission n'est jamais comptée ; l'or sans nom français se retrouve par son symbole
  assert.equal(itemCheck(item('Lei Cheung'), have({ cargo: { known: true, lines: [line('gold', 200, 'Or', 1)] } })).count, 0);
  // Nacelles par le libellé seul (symbole du jeu écrit autrement)
  assert.equal(itemCheck(item('Etienne Dorn'), have({ cargo: { known: true, lines: [{ name: 'x', label: "Nacelle d'évacuation occupée", count: 25 }] } })).state, 'ok');
  // Primes et obligations : jamais « ok », la phrase dit de vérifier dans le jeu, avec la fourchette
  for (const n of ['Mel Brandon', "Tod 'The Blaster' McQuinn", 'Juri Ishmaak', 'Colonel Bris Dekker']) {
    assert.match(itemCheck(item(n), have({ balance: 50_000_000 })).note, /l’app ne voit pas tes primes ou obligations en attente : vérifie-les dans le jeu/);
  }
  assert.match(itemCheck(item('Juri Ishmaak'), have()).note, /100 000 ou 1 000 000 Cr \(les sources ne s’accordent pas\)/);
  // Extrait demandé (osmium, painite) : la note le dit
  assert.match(itemCheck(item('Marsha Hicks'), have()).note, /extrait demandé : la soute ne dit pas d’où il vient/);
  assert.match(itemCheck(item('Selene Jean'), have()).note, /extrait demandé/);
  // Soute jamais lue, solde inconnu
  assert.deepEqual(itemCheck(item('Didi Vatermann'), have({ cargo: { known: false, lines: [] } })), { state: 'inconnu', count: null, need: 50, note: 'soute pas encore relue : lance le jeu' });
  assert.equal(itemCheck(item('The Dweller'), have({ balance: null })).state, 'inconnu');
  assert.match(itemCheck(item('The Dweller'), have({ balance: 400_000 })).note, /il te manque 100 000 Cr/);
});

/** Ingénieurs du calcul (comme route.js) : tous débloqués au rang 5 sauf exceptions ({ nom: { progress, rank, min } | null }). */
function recs(over = {}) {
  const E = new Map();
  for (const d of idx.list) {
    const o = Object.hasOwn(over, d.name) ? over[d.name] : { progress: 'Unlocked', rank: 5, min: 0 };
    const progress = o === null ? 'absent' : o.progress;
    E.set(d.id, { id: d.id, name: d.name, data: d, region: d.region, progress, rank: o?.rank ?? null, rankProgress: o ? { min: o.min ?? 0 } : null, referralBy: d.referral.by, permitNeeded: false });
  }
  return E;
}

test('chaîne : Didi absent, Selene au rang 2 → montée de référence chez Selene ; à 40 % du rang 3 → seuil incertain ; rang 4 → connu au chargement', () => {
  const DIDI = id('Didi Vatermann');
  const SELENE = id('Selene Jean');
  const c = unlockChain(DIDI, { E: recs({ 'Didi Vatermann': null, 'Selene Jean': { progress: 'Unlocked', rank: 2 } }), H: 'Bulle' });
  assert.deepEqual([c.discovery.state, c.discovery.parent, c.climbs, c.members, c.reach], ['manque', SELENE, [SELENE], [DIDI, SELENE], 'ici']);
  assert.equal(c.totalSteps, 4, 'Didi : 3 + 1 (montée de sa marraine)');
  const mid = unlockChain(DIDI, { E: recs({ 'Didi Vatermann': null, 'Selene Jean': { progress: 'Unlocked', rank: 3, min: 40 } }), H: 'Bulle' });
  assert.equal(mid.discovery.state, 'inconnu');
  assert.match(mid.discovery.note, /seuil incertain/);
  assert.deepEqual(mid.climbs, [SELENE], 'montée comptée, prudente');
  const ok = unlockChain(DIDI, { E: recs({ 'Didi Vatermann': null, 'Selene Jean': { progress: 'Unlocked', rank: 4 } }), H: 'Bulle' });
  assert.equal(ok.discovery.state, 'ok');
  assert.match(ok.discovery.note, /prochain chargement : relance-le/);
  assert.deepEqual(ok.climbs, []);
  // Selene seulement connue : ses étapes comptent aussi (Didi 4 + Selene 2)
  const known = unlockChain(DIDI, { E: recs({ 'Didi Vatermann': null, 'Selene Jean': { progress: 'Known' } }), H: 'Bulle' });
  assert.deepEqual([known.climbs, known.totalSteps], [[SELENE], 6]);
  assert.equal(parentNeedsClimb({ progress: 'Unlocked', rank: 3, rankProgress: { min: 50 } }), false);
  assert.equal(parentNeedsClimb({ progress: 'Unlocked', rank: 3, rankProgress: { min: 49 } }), true);
});

test('chaîne : parrain dans l’autre région → traversée ; connu du public ; aucun relevé ; boucle et profondeur', () => {
  const MEL = id('Mel Brandon');
  const c = unlockChain(MEL, { E: recs({ 'Mel Brandon': null, 'Elvira Martuuk': { progress: 'Unlocked', rank: 2 } }), H: 'Colonia' });
  assert.deepEqual([c.reach, c.climbs], ['traversee', [id('Elvira Martuuk')]]);
  const pub = unlockChain(id('Felicity Farseer'), { E: recs({ 'Felicity Farseer': null }), H: 'Bulle' });
  assert.deepEqual([pub.discovery.state, pub.discovery.parent], ['ok', null]);
  assert.match(pub.discovery.note, /connu du public/);
  // Aucun relevé : rien n'est déplié
  const E = recs();
  for (const e of E.values()) e.progress = 'unknown';
  const u = unlockChain(id('Didi Vatermann'), { E, H: 'Bulle' });
  assert.deepEqual([u.discovery.state, u.climbs, u.reach, u.totalSteps], ['inconnu', [], 'inconnu', 3]);
  // Boucle (données de test) : inconnu, sans escale ajoutée
  const L = recs({ 'Didi Vatermann': null, 'Selene Jean': null });
  L.get(id('Selene Jean')).referralBy = id('Didi Vatermann');
  const loop = unlockChain(id('Didi Vatermann'), { E: L, H: 'Bulle' });
  assert.ok(loop.climbs.length <= 1);
  const deep = unlockChain(id('Selene Jean'), { E: L, H: 'Bulle' }, 4);
  assert.deepEqual([deep.discovery.state, deep.climbs], ['inconnu', []]);
  assert.match(deep.discovery.note, /trop longue ou en boucle/);
});

test('étapes : découverte, invitation (Acquainted : « si tu es déjà invité… »), déblocage, permis', () => {
  const E = recs({ 'Lei Cheung': { progress: 'Acquainted' }, 'Didi Vatermann': null, 'Selene Jean': { progress: 'Unlocked', rank: 2 } });
  const lei = E.get(id('Lei Cheung'));
  lei.permitNeeded = true;
  const steps = unlockSteps(lei, unlockChain(lei.id, { E, H: 'Bulle' }), have(), E);
  assert.deepEqual(steps.map((s) => s.kind), ['invitation', 'deblocage', 'permis']);
  assert.equal(steps[0].acquainted, true);
  assert.equal(steps[0].check.state, 'inconnu');
  assert.equal(steps[1].items[0].label, 'Or');
  const didi = E.get(id('Didi Vatermann'));
  const ds = unlockSteps(didi, unlockChain(didi.id, { E, H: 'Bulle' }), have(), E);
  assert.deepEqual(ds.map((s) => s.kind), ['decouverte', 'invitation', 'deblocage']);
  assert.deepEqual(ds[0].parent, { id: id('Selene Jean'), name: 'Selene Jean', progress: 'Unlocked', rank: 2, region: 'Bulle' });
  assert.equal(unlockSteps(E.get(id('Elvira Martuuk')), unlockChain(id('Elvira Martuuk'), { E, H: 'Bulle' }), have(), E).length, 0);
});
