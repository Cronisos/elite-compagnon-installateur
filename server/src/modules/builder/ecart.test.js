// Écart entre la configuration actuelle et un build (ecart.js), sur des données EDSY réduites.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ecartBuild } from './ecart.js';

const eddb = {
  blueprint: { fsd_lr: { name: 'Long Range' }, pp_oc: { name: 'Overcharged' } },
  expeffect: { mass: { name: 'Mass Manager' } },
};
const MODULES = { 1: { name: 'FSD 5A', cost: 5000000 }, 2: { name: 'FSD 5D', cost: 200000 }, 3: { name: 'PP 5A', cost: 1400000 }, 4: { name: 'Soute 5E', cost: 100000 } };
const moduleOf = (_e, _s, id) => MODULES[id] || null;
const libelles = { emplacement: (g, i) => `${g} ${i}`, module: (m) => m.name, plan: (bp) => bp.name, effet: (x) => x.name };

const slots = (o) => ({ hardpoint: [], utility: [], component: o.component || [], military: [], internal: o.internal || [] });

test('écart : achat (avec sa modification), modification seule, retrait ; coût des achats', () => {
  const actuel = { slots: slots({ component: [{ modid: 2 }, { modid: 3, bpid: 'pp_oc', grade: 3 }], internal: [{ modid: 4 }] }) };
  const cible = { slots: slots({ component: [{ modid: 1, bpid: 'fsd_lr', grade: 5, expid: 'mass' }, { modid: 3, bpid: 'pp_oc', grade: 5 }], internal: [null] }) };
  const e = ecartBuild({ eddb, ship: {}, actuel, cible, libelles, moduleOf });
  assert.deepEqual(e.lignes.map((l) => [l.emplacement, l.type]), [['component 0', 'acheter'], ['component 1', 'ingenierie'], ['internal 0', 'retirer']]);
  assert.deepEqual(e.lignes[0].ingenierie, { plan: 'Long Range', grade: 5, effet: 'Mass Manager' });
  assert.deepEqual(e.lignes[1].ingenierie, { plan: 'Overcharged', grade: 5, effet: null, depuis: 3 });
  assert.equal(e.lignes[2].actuel, 'Soute 5E');
  assert.equal(e.cout, 5000000);
  assert.deepEqual([e.achats, e.retraits, e.ingenierie, e.identique], [1, 1, 2, false]);
});

test('écart : rien à faire quand le build est la configuration actuelle', () => {
  const b = { slots: slots({ component: [{ modid: 1, bpid: 'fsd_lr', grade: 5 }] }) };
  const e = ecartBuild({ eddb, ship: {}, actuel: b, cible: structuredClone(b), libelles, moduleOf });
  assert.equal(e.identique, true);
  assert.equal(e.cout, 0);
});

test('écart : ton module modifié, celui du build non : pour information, rien à faire', () => {
  const actuel = { slots: slots({ component: [{ modid: 3, bpid: 'pp_oc', grade: 5 }] }) };
  const cible = { slots: slots({ component: [{ modid: 3 }] }) };
  const e = ecartBuild({ eddb, ship: {}, actuel, cible, libelles, moduleOf });
  assert.deepEqual(e.lignes.map((l) => l.type), ['sans-modif']);
  assert.deepEqual(e.lignes[0].actuelModif, { plan: 'Overcharged', grade: 5, effet: null });
  assert.deepEqual([e.achats, e.ingenierie, e.identique], [0, 0, true]);
});
