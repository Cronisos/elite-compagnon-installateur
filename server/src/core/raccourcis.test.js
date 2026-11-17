// Raccourcis clavier : ce qui est accepté, ce qui est refusé, le réglage gardé, et l'accord avec l'overlay.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ACTIONS, FICHIER_RACCOURCIS, MAX_PAGES, Raccourcis, raccourciValide } from './raccourcis.js';

const overlay = createRequire(import.meta.url)('../../../overlay/raccourcis.js');
const fichier = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'elite-raccourcis-')), FICHIER_RACCOURCIS);
const cheminValide = (c) => /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(c);
const neuf = (f = fichier()) => new Raccourcis({ fichier: f, cheminValide });

test('raccourci valide : Ctrl ou Alt obligatoire, écrit dans l’ordre, « Maj » compris', () => {
  assert.equal(raccourciValide('Alt+Shift+K'), 'Alt+Shift+K');
  assert.equal(raccourciValide('shift+alt+k'), 'Alt+Shift+K');
  assert.equal(raccourciValide('Maj+Ctrl+F5'), 'Ctrl+Shift+F5');
  assert.equal(raccourciValide('Ctrl+Alt+1'), 'Ctrl+Alt+1');
  for (const non of ['K', 'Shift+K', 'Alt', 'Alt+Shift', 'Alt+Alt+K', 'Alt+Échap', 'Alt+F25', 'Alt+KK', 'Win+K', '', null, 42, 'Alt+Shift+K+L', 'A'.repeat(40)]) {
    assert.equal(raccourciValide(non), null, String(non));
  }
});

test('par défaut : les touches d’origine, aucune page ; l’overlay a les mêmes', () => {
  const e = neuf().etat();
  assert.deepEqual(Object.fromEntries(e.actions.map((a) => [a.id, a.touche])), { ...overlay.DEFAUTS });
  assert.deepEqual(e.pages, []);
  assert.deepEqual(ACTIONS.map((a) => a.id).sort(), Object.keys(overlay.DEFAUTS).sort());
  for (const a of ACTIONS) assert.equal(a.defaut, overlay.DEFAUTS[a.id], a.id);
});

test('régler : touches changées, action sans raccourci, pages ; gardé au lancement suivant', () => {
  const f = fichier();
  const r = neuf(f);
  const etat = r.regler({ actions: { souris: 'Ctrl+Alt+M', quitter: null }, pages: [{ touche: 'alt+shift+1', chemin: '/vaisseaux' }] });
  const touches = Object.fromEntries(etat.actions.map((a) => [a.id, a.touche]));
  assert.equal(touches.souris, 'Ctrl+Alt+M');
  assert.equal(touches.quitter, null);
  assert.equal(touches.masquer, 'Alt+Shift+H', 'non citée : sa touche par défaut');
  assert.deepEqual(etat.pages, [{ touche: 'Alt+Shift+1', chemin: '/vaisseaux' }]);
  assert.deepEqual(neuf(f).etat().pages, [{ touche: 'Alt+Shift+1', chemin: '/vaisseaux' }]);
  assert.equal(Object.fromEntries(neuf(f).etat().actions.map((a) => [a.id, a.touche])).souris, 'Ctrl+Alt+M');
  assert.equal(Object.fromEntries(r.regler({ defaut: true }).actions.map((a) => [a.id, a.touche])).souris, 'Alt+Shift+K');
});

test('refusé : touche seule, doublon, page inconnue, trop de pages ; rien n’est changé', () => {
  const r = neuf();
  const page = (k) => ({ touche: `Ctrl+Alt+${k}`, chemin: '/vaisseaux' });
  for (const mauvais of [
    { actions: { souris: 'K' } },
    { actions: { souris: 'Alt+Shift+H' } }, // déjà « cacher ou afficher »
    { pages: [{ touche: 'Alt+Shift+K', chemin: '/vaisseaux' }] }, // déjà « souris »
    { pages: [page(1), page(1)] },
    { pages: [{ touche: 'Alt+Shift+1', chemin: 'https://evil.example/' }] },
    { pages: [{ touche: 'Alt+Shift+1', chemin: '/../x' }] },
    { pages: Array.from({ length: MAX_PAGES + 1 }, (_, k) => page(String.fromCharCode(65 + k))) },
  ]) assert.throws(() => r.regler(mauvais), (e) => e.status === 400, JSON.stringify(mauvais).slice(0, 80));
  assert.deepEqual(r.etat().pages, []);
});

test('fichier abîmé ou incohérent : les touches par défaut', () => {
  const f = fichier();
  fs.writeFileSync(f, JSON.stringify({ actions: { souris: 'K' } }));
  assert.equal(Object.fromEntries(neuf(f).etat().actions.map((a) => [a.id, a.touche])).souris, 'Alt+Shift+K');
});

test('overlay : il revérifie tout, et prend les touches par défaut sans réglage lisible', () => {
  assert.deepEqual(overlay.plan(null).map((p) => p.action), Object.keys(overlay.DEFAUTS));
  assert.deepEqual(overlay.plan('n’importe quoi').length, Object.keys(overlay.DEFAUTS).length);
  const p = overlay.plan({
    actions: [{ id: 'souris', touche: 'Ctrl+Alt+M' }, { id: 'quitter', touche: null }, { id: 'masquer', touche: 'H' }, { id: 'inconnue', touche: 'Ctrl+Alt+Z' }],
    pages: [{ touche: 'Alt+Shift+1', chemin: '/vaisseaux' }, { touche: 'Ctrl+Alt+M', chemin: '/builder' }, { touche: 'Alt+Shift+2', chemin: 'https://evil.example/' }, { touche: 'Alt+Shift+3', chemin: '/extension?onglet=vente' }],
  });
  assert.equal(p.find((x) => x.action === 'souris').touche, 'Ctrl+Alt+M');
  assert.ok(!p.some((x) => x.action === 'quitter'), 'action sans raccourci');
  assert.ok(!p.some((x) => x.action === 'masquer'), 'touche seule : jamais prise');
  assert.ok(!p.some((x) => x.action === 'inconnue'));
  assert.deepEqual(p.filter((x) => x.chemin).map((x) => [x.touche, x.chemin]), [['Alt+Shift+1', '/vaisseaux'], ['Alt+Shift+3', '/extension?onglet=vente']]);
  // Ce que rend le serveur est accepté tel quel par l'overlay
  const r = neuf();
  r.regler({ actions: { souris: 'Ctrl+Alt+M' }, pages: [{ touche: 'Alt+Shift+1', chemin: '/vaisseaux' }] });
  const plan = overlay.plan(r.etat());
  assert.equal(plan.length, ACTIONS.length + 1);
});
