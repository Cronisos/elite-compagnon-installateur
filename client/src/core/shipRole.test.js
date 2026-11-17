// Rôles des vaisseaux côté interface : résumé, aide, règles d'édition (comme celles du serveur), avis de bascule, et
// écriture avec l'en-tête X-Elite-Compagnon.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkRole, MAX_SECONDARY_ROLES } from './modes.js';
import {
  draftOf, hudBottom, menuBubbles, noticeInPanel, REMEMBER_SHORT, REMEMBER_TEXT, rememberTitle, roleHelp, roleSummary, saveRole, setPrimary, suggestionTitle, switchText,
  toggleSecondary,
} from './shipRole.js';

test('résumé du rôle', () => {
  assert.equal(roleSummary(null), 'Sans rôle');
  assert.equal(roleSummary({ primary: null, secondary: [] }), 'Sans rôle');
  assert.equal(roleSummary({ primary: 'waypoints', secondary: [] }), '⛏ Minage Rhino');
  assert.equal(roleSummary({ primary: 'waypoints', secondary: ['shipmining', 'combat'] }), '⛏ Minage Rhino · aussi ☄ Minage vaisseau, ⚔ Combat');
  assert.equal(roleSummary({ primary: 'polyvalent', secondary: [] }), '✦ Polyvalent');
  assert.equal(roleSummary({ primary: null, secondary: ['rescue'] }), '✚ Sauvetage (sans rôle principal)');
});

test("aide : ce que fait le rôle, en tutoyant", () => {
  assert.match(roleHelp({ primary: 'combat', secondary: [] }), /Quand tu montes dans ce vaisseau, l’app passe d’elle-même en ⚔ Combat et ouvre ses fenêtres/);
  assert.match(roleHelp({ primary: 'polyvalent', secondary: [] }), /rien ne s’ouvre seul/);
  assert.match(roleHelp({ primary: 'polyvalent', secondary: [] }), /l’équipement du vaisseau/, 'Polyvalent : l’équipement est proposé, comme sans rôle');
  // Commerce n'a pas de fenêtre : l'aide ne promet pas d'en ouvrir
  assert.doesNotMatch(roleHelp({ primary: 'routes', secondary: [] }), /ouvre ses fenêtres/);
  assert.match(roleHelp({ primary: 'routes', secondary: [] }), /pas de fenêtre en jeu/);
  assert.match(roleHelp({ primary: null, secondary: ['combat'] }), /Sans rôle principal/);
  assert.equal(roleHelp(null), 'Sans rôle, rien ne s’ouvre seul : l’app te propose un mode d’après ce que tu fais et l’équipement du vaisseau.');
  assert.doesNotMatch(roleHelp(null), /comme avant/, 'un nouveau joueur n’a pas d’« avant » (constat du 9 nov.)');
});

test("édition : le principal sort des secondaires, Polyvalent n'en garde aucun, jamais plus que le maximum", () => {
  let d = draftOf({ primary: null, secondary: ['combat', 'rescue'] });
  d = setPrimary(d, 'combat');
  assert.deepEqual(d, { primary: 'combat', secondary: ['rescue'] });
  assert.deepEqual(toggleSecondary(d, 'combat'), d, 'le principal ne peut pas être secondaire');
  d = toggleSecondary(toggleSecondary(d, 'materials'), 'shipmining');
  assert.equal(d.secondary.length, MAX_SECONDARY_ROLES);
  assert.deepEqual(toggleSecondary(d, 'colonisation'), d, 'au-delà du maximum : rien ne change');
  assert.ok(checkRole(d).ok, 'ce que l’éditeur laisse passer, le serveur l’accepte');
  d = toggleSecondary(d, 'rescue');
  assert.deepEqual(d.secondary, ['materials', 'shipmining']);
  const p = setPrimary(d, 'polyvalent');
  assert.deepEqual(p, { primary: 'polyvalent', secondary: [] });
  assert.deepEqual(toggleSecondary(p, 'combat'), p);
  assert.deepEqual(setPrimary(d, ''), { primary: null, secondary: ['materials', 'shipmining'] }, '« Aucun »');
  // La copie de travail ne touche pas au rôle d'origine
  const role = { primary: 'combat', secondary: ['rescue'] };
  toggleSecondary(draftOf(role), 'materials');
  assert.deepEqual(role, { primary: 'combat', secondary: ['rescue'] });
});

test('avis de bascule', () => {
  assert.equal(switchText({ mode: 'waypoints', ship: 'Pioche' }), '⛏ Minage Rhino activé — vaisseau « Pioche »');
  assert.equal(switchText({ mode: 'combat', ship: null }), '⚔ Combat activé — rôle principal du vaisseau');
  assert.equal(switchText(null), '');
});

test('avis de bascule accordé au nom du mode (constat du 9 nov. : « Colonisation activé », « Matériaux activé »)', () => {
  assert.equal(switchText({ mode: 'colonisation', ship: 'Pioche' }), '🏗 Colonisation activée — vaisseau « Pioche »');
  assert.equal(switchText({ mode: 'materials', ship: 'Pioche' }), '◈ Matériaux activés — vaisseau « Pioche »');
  for (const id of ['routes', 'shipmining', 'rescue']) assert.match(switchText({ mode: id, ship: 'X' }), / activé — /, id);
  assert.equal(switchText({ mode: 'inconnu', ship: 'X' }), 'inconnu activé — vaisseau « X »', 'mode inconnu : rien ne casse');
});

// Ce que montrent la ligne du bas des HUD (hud.jsx) et les bulles du menu « Mode de jeu » (ModeMenu.jsx) : les deux
// composants ne font qu'afficher ce que rendent ces fonctions.
const NORMALE = { mode: 'combat', reason: 'prime gagnée' };
const DISCRETE = { mode: 'rescue', reason: 'capsule de survie ramassée', discreet: true };
const RETENIR = { mode: 'waypoints', reason: 'vaisseau avec hangar à Rhino', shipId: 43, canRemember: true };
const ROLE = { mode: 'waypoints', reason: 'rôle principal de « Pioche » : …', source: 'role', shipId: 43 };
const AVIS = { mode: 'waypoints', shipId: 43, ship: 'Pioche' };

test('ligne du bas du HUD : l’avis d’abord, la proposition normale sinon, la discrète au bout sans prendre la ligne', () => {
  assert.deepEqual(hudBottom({}), { line: null, tag: null, quiet: false, remember: false });
  assert.deepEqual(hudBottom({ suggestion: NORMALE }), { line: 'suggest', tag: 'Proposé', quiet: false, remember: false });
  assert.deepEqual(hudBottom({ suggestion: RETENIR }), { line: 'suggest', tag: 'Proposé', quiet: false, remember: true }, '« Retenir » seulement si canRemember');
  assert.deepEqual(hudBottom({ suggestion: DISCRETE }), { line: null, tag: null, quiet: true, remember: false }, 'la discrète ne prend jamais la ligne');
  assert.deepEqual(hudBottom({ notice: AVIS, suggestion: NORMALE }), { line: 'switch', tag: 'Rôle', quiet: false, remember: false }, 'l’avis passe avant');
  assert.deepEqual(hudBottom({ notice: AVIS, suggestion: DISCRETE }), { line: 'switch', tag: 'Rôle', quiet: true, remember: false });
  // En déplacement du cadre : rien
  for (const o of [{ notice: AVIS }, { suggestion: NORMALE }, { suggestion: DISCRETE }]) assert.deepEqual(hudBottom({ ...o, editing: true }), { line: null, tag: null, quiet: false, remember: false });
});

test('textes : l’étiquette de l’avis ne répète pas « activé », l’infobulle d’un rôle ne dit pas « d’après ce que tu fais »', () => {
  const { tag } = hudBottom({ notice: AVIS });
  assert.doesNotMatch(`${tag} ${switchText(AVIS)}`.toLowerCase(), /activé.*activé/);
  assert.equal(suggestionTitle(ROLE), 'Rôle principal de ce vaisseau');
  assert.equal(suggestionTitle(NORMALE), 'D’après ce que tu fais : prime gagnée');
  assert.equal(suggestionTitle(DISCRETE), 'Hors des rôles de ce vaisseau, d’après ce que tu fais : capsule de survie ramassée');
  assert.equal(suggestionTitle(null), '');
});

test('bulles du menu : normale (avec « Retenir » sans rôle), discrète, avis ; sans overlay, « Ouvrir la page »', () => {
  assert.deepEqual(menuBubbles({}), { notice: false, suggest: null, remember: false, accept: 'Oui' });
  assert.deepEqual(menuBubbles({ suggestion: NORMALE }), { notice: false, suggest: 'normal', remember: false, accept: 'Oui' });
  assert.deepEqual(menuBubbles({ suggestion: RETENIR }), { notice: false, suggest: 'normal', remember: true, accept: 'Oui' });
  assert.deepEqual(menuBubbles({ suggestion: { ...DISCRETE, canRemember: true } }), { notice: false, suggest: 'quiet', remember: false, accept: 'Oui' }, 'jamais « Retenir » en discret');
  assert.deepEqual(menuBubbles({ notice: AVIS, suggestion: DISCRETE }), { notice: true, suggest: 'quiet', remember: false, accept: 'Oui' });
  // Mode inconnu de l'interface : rien
  assert.equal(menuBubbles({ suggestion: NORMALE, known: false }).suggest, null);
  // Sans overlay, « Oui » ne pourrait rien ouvrir (PUT /api/overlay : 409) : il ouvre la page du mode dans l'app
  assert.equal(menuBubbles({ suggestion: ROLE, installed: false }).accept, 'Ouvrir la page');
  assert.equal(menuBubbles({ suggestion: ROLE, installed: true }).accept, 'Oui');
});

test('avis dans le Coup d’œil : seulement pour un mode sans fenêtre (aucun HUD ne le montre)', () => {
  assert.equal(noticeInPanel({ mode: 'routes', ship: 'Cargo' }), true);
  assert.equal(noticeInPanel(AVIS), false, 'Minage Rhino : son HUD le montre déjà');
  assert.equal(noticeInPanel(null), false);
});

test("écriture du rôle : PUT, avec l'en-tête maison, seulement primary et secondary", async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ shipId: 43, role: { primary: 'waypoints', secondary: [] } }) };
  });
  const r = await saveRole(43, { primary: 'waypoints', secondary: [], extra: 'non' });
  assert.equal(r.role.primary, 'waypoints');
  assert.equal(calls[0].url, '/api/ships/43/role');
  assert.equal(calls[0].init.method, 'PUT');
  assert.equal(calls[0].init.headers['X-Elite-Compagnon'], '1');
  assert.deepEqual(JSON.parse(calls[0].init.body), { primary: 'waypoints', secondary: [] });
});

test('« Retenir » : dit ce qui est retenu, sur la ligne du bas du HUD comme à côté du menu (constat du 9 nov.)', () => {
  assert.equal(REMEMBER_TEXT, 'Retenir comme rôle de ce vaisseau', 'le texte de l’auteur, à côté du menu');
  assert.match(REMEMBER_SHORT, /Retenir comme rôle/, 'HUD : court, mais explicite');
  assert.notEqual(REMEMBER_SHORT, 'Retenir');
  assert.equal(rememberTitle('waypoints'), 'À chaque embarquement dans ce vaisseau, l’app passera d’elle-même en ⛏ Minage Rhino');
  // Les composants affichent ces textes (et le bouton du HUD n'a pas l'air d'un « Non »)
  const hud = fs.readFileSync(new URL('./hud.jsx', import.meta.url), 'utf8');
  const bouton = hud.split(/\r?\n/).find((l) => l.includes('{REMEMBER_SHORT}'));
  assert.ok(bouton, 'hud.jsx affiche REMEMBER_SHORT');
  assert.doesNotMatch(bouton, /is-no/, 'pas le style gris du « Non »');
  assert.doesNotMatch(hud, />Retenir</);
  assert.ok(fs.readFileSync(new URL('./ModeMenu.jsx', import.meta.url), 'utf8').includes('{REMEMBER_TEXT}'), 'ModeMenu.jsx affiche REMEMBER_TEXT');
});

test('rôles en tags colorés : principal d’abord, couleur propre à chaque rôle', async () => {
  const { tagsRole, COULEURS_ROLE } = await import('./shipRole.js');
  assert.deepEqual(tagsRole(null), []);
  const t = tagsRole({ primary: 'waypoints', secondary: ['shipmining', 'waypoints'] });
  assert.deepEqual(t.map((x) => [x.id, x.principal]), [['waypoints', true], ['shipmining', false]]);
  assert.equal(t[0].label, 'Minage Rhino');
  assert.equal(t[0].couleur, COULEURS_ROLE.waypoints);
  assert.deepEqual(tagsRole({ primary: null, secondary: ['combat'] }).map((x) => x.principal), [false]);
  assert.equal(new Set(Object.values(COULEURS_ROLE)).size, Object.keys(COULEURS_ROLE).length, 'deux rôles de même couleur');
});
