// Projet de colonisation de l'escadron vu d'ici (escadron.js, calculs purs) : la lecture la plus récente l'emporte,
// tes livraisons d'après le relevé de l'escadron y sont ajoutées, l'ordre du chef est gardé.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstOpen, freshest, projectView, siteFromReleve } from './escadron.js';

const SYS = 'Bleae Thua ED-D c12-5';
const releve = (over = {}) => ({
  marketId: 10, system: SYS, station: 'Orbital Construction Site: Smith', at: '2026-11-18T20:00:00Z', progress: 0.5, complete: false, failed: false,
  resources: [{ symbol: 'steel', name: 'Acier', required: 100, provided: 50 }], cmdr: 'Testeur 2', ...over,
});
const local = (over = {}) => ({
  ...siteFromReleve(releve({ at: '2026-11-18T19:00:00Z', resources: [{ symbol: 'steel', name: 'Acier', required: 100, provided: 20 }] })),
  local: undefined, user: { name: 'Mon port', deadline: null, notes: null, loopMinutes: null, pinned: false }, contributions: [], ...over,
});

test('chantier connu par l’escadron seul : de quoi faire sa liste de courses', () => {
  const s = siteFromReleve(releve());
  assert.equal(s.kind, 'orbital');
  assert.equal(s.stationLabel, 'Chantier orbital · Smith');
  assert.deepEqual(s.resources.map((r) => [r.symbol, r.remaining]), [['steel', 50]]);
  assert.equal(s.local, false);
  assert.equal(s.progress, 0.5);
  assert.equal(siteFromReleve(releve({ progress: null })).progress, 0.5); // recalculé : Σ livré ÷ Σ demandé
});

test('la lecture la plus récente l’emporte : la tienne ou celle de l’escadron', () => {
  const plusRecent = freshest(local(), releve());
  assert.equal(plusRecent.site.resources[0].provided, 50);
  assert.deepEqual(plusRecent.releve, { by: 'Testeur 2', at: '2026-11-18T20:00:00Z' });
  assert.equal(plusRecent.site.user.name, 'Mon port'); // tes réglages restent
  const plusVieux = freshest(local(), releve({ at: '2026-11-18T18:00:00Z' }));
  assert.equal(plusVieux.site.resources[0].provided, 20);
  assert.equal(plusVieux.releve, null);
  assert.equal(freshest(local(), null).releve, null);
  assert.equal(freshest(null, null), null);
  // Chantier fini ici (d'après l'amarrage) après le relevé de l'escadron : il reste fini
  const fini = freshest(local({ complete: true, completedAt: '2026-11-18T21:00:00Z' }), releve());
  assert.equal(fini.releve, null);
  assert.equal(fini.site.complete, true);
});

test('tes livraisons faites après le relevé de l’escadron : ajoutées en attendant le suivant', () => {
  const contributions = [
    { at: '2026-11-18T19:30:00Z', items: [{ symbol: 'steel', amount: 10 }], total: 10 }, // déjà dans le relevé de 20 h
    { at: '2026-11-18T20:10:00Z', items: [{ symbol: 'steel', amount: 30 }], total: 30 },
  ];
  const f = freshest(local({ contributions }), releve());
  assert.equal(f.site.resources[0].provided, 80);
  assert.equal(f.site.resources[0].remaining, 20);
  assert.equal(f.site.provisional, true);
  assert.equal(f.site.progress, 0.8);
  // Jamais plus que demandé
  const trop = freshest(local({ contributions: [{ at: '2026-11-18T20:10:00Z', items: [{ symbol: 'steel', amount: 500 }] }] }), releve());
  assert.equal(trop.site.resources[0].remaining, 0);
});

test('le projet vu d’ici : l’ordre du chef, les autres chantiers des systèmes, les systèmes encore vides', () => {
  const squad = {
    projet: { systems: [SYS, 'Autre Système', 'Vide'], sites: [{ marketId: 20, system: 'Autre Système', name: 'Port' }, { marketId: 10, system: SYS }, { marketId: 30, system: SYS, name: 'Pas encore relevé' }] },
    releves: [releve(), releve({ marketId: 20, system: 'Autre Système', complete: true, progress: 1 }), releve({ marketId: 40 })],
  };
  const locaux = new Map([[10, local({ marketId: 10 })], [50, local({ marketId: 50, system: SYS })], [60, local({ marketId: 60, system: 'Hors projet' })]]);
  const v = projectView(squad, locaux);
  assert.deepEqual(v.sites.map((s) => [s.priority, s.marketId, Boolean(s.site)]), [[1, 20, true], [2, 10, true], [3, 30, false]]);
  assert.equal(v.sites[1].site.user.name, 'Mon port'); // ton chantier, avec le relevé plus récent de l'escadron
  assert.deepEqual(v.others.map((o) => o.site.marketId).sort(), [40, 50]); // ni 60 (hors projet) ni ceux déjà classés
  assert.deepEqual(v.empty, ['Vide']);
  // Le premier encore en cours, dans l'ordre du chef : 20 est terminé, c'est 10
  assert.equal(firstOpen(v).marketId, 10);
  assert.equal(projectView({ projet: null, releves: [] }, locaux), null);
  assert.equal(projectView(null, locaux), null);
});
