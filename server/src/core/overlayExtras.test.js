// Fenêtres de l'overlay (core/overlay.js) : demande du menu vérifiée (400 avec la raison, rien de changé), fenêtres
// ouvertes d'elles-mêmes par un module (« extras ») que le serveur relancé sait encore fermer, « Aucun » qui les ferme
// aussi, et un ordre de fermeture qui ne lance jamais l'overlay (--if-running). Dossier de données temporaire,
// lancement simulé : rien n'est lancé. Un serveur relancé = une nouvelle instance du module (import avec ?relance=…).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-overlay-extras-'));
process.env.ELITE_DATA_DIR = DIR;
delete process.env.ELITE_NO_OVERLAY;
const SAVED = path.join(DIR, 'overlay.json');

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
let relances = 0;

/** Un serveur (nouvelle instance du module), avec son lancement simulé : rend { o, ordres, attendreOrdres() }. */
async function serveur() {
  const o = await import(`./overlay.js?relance=${(relances += 1)}`);
  const ordres = [];
  o.setOverlaySpawnForTest((exe, args) => {
    ordres.push(args.slice(1).filter((a) => !a.startsWith('--at=')).join(' '));
    const c = new EventEmitter();
    c.unref = () => {};
    return c;
  });
  return { o, ordres, laisserPartir: () => attendre(o.LAUNCH_DELAY_MS + 80) };
}

test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));

test('demande du menu vérifiée : mal formée, refus 400 avec la raison, rien de changé ni lancé', async () => {
  const { o, ordres, laisserPartir } = await serveur();
  assert.equal(o.overlayState().installed, true, 'Electron présent dans node_modules (sinon le test ne prouve rien)');
  o.showOverlay({ mode: 'combat', glance: false, pages: ['combat'] });
  await laisserPartir();
  assert.deepEqual(ordres, ['--only=combat']);
  const avant = fs.readFileSync(SAVED, 'utf8');
  for (const [corps, raison] of [
    [{ pages: 'combat' }, /Pages invalides/],
    [{ pages: { length: 1 } }, /Pages invalides/],
    [{ pages: 5 }, /Pages invalides/],
    [{ pages: true }, /Pages invalides/],
    [{ pages: ['combat', '../x'] }, /Page invalide : « \.\.\/x »/],
    [{ pages: ['constructor'] }, /Page invalide/],
    [{ pages: [{ toString: 'x' }] }, /Page invalide/],
    [{ pages: Array.from({ length: 17 }, (_, i) => `p${i}`) }, /Trop de pages demandées \(17\) : 16 au plus/],
    [{ mode: { piege: 1 } }, /Mode de jeu invalide/],
    [{ mode: 'x'.repeat(200_000) }, /Mode de jeu invalide/],
    [{ mode: '__proto__' }, /Mode de jeu invalide/],
    [{ mode: [1, 2], glance: 'oui' }, /Mode de jeu invalide/],
    [{ mode: 'combat', glance: 'oui' }, /« glance » : vrai ou faux/],
    [{ mode: 'combat', dismissExtras: 1 }, /« dismissExtras » : vrai ou faux/],
    [[], /Demande invalide/],
    [null, /Demande invalide/],
    ['combat', /Demande invalide/],
  ]) {
    assert.throws(() => o.overlayRequest(corps), (err) => err.status === 400 && raison.test(err.publicMessage), JSON.stringify(corps)?.slice(0, 60));
    assert.throws(() => o.showOverlay(corps), (err) => err.status === 400, 'showOverlay vérifie aussi');
  }
  await laisserPartir();
  assert.deepEqual(ordres, ['--only=combat'], 'aucun ordre de plus');
  assert.equal(fs.readFileSync(SAVED, 'utf8'), avant, 'overlay.json inchangé');
  assert.equal(o.overlayMode(), 'combat');
  // Valide : absents et null valent null, [] et faux ; doublons retirés ; champs inconnus ignorés
  assert.deepEqual(o.overlayRequest({}), { mode: null, glance: false, pages: [], dismissExtras: false });
  assert.deepEqual(o.overlayRequest({ mode: null, glance: null, pages: null, autre: 1 }), { mode: null, glance: false, pages: [], dismissExtras: false });
  assert.deepEqual(o.overlayRequest({ mode: 'combat', glance: true, pages: ['combat', 'glance', 'combat'], dismissExtras: true }), { mode: 'combat', glance: true, pages: ['combat', 'glance'], dismissExtras: true });
  // Enregistré par une ancienne version : un mode qui n'est pas un identifiant est écarté au démarrage
  fs.writeFileSync(SAVED, JSON.stringify({ mode: 'x'.repeat(5000), activity: { a: 1 }, glance: 'oui', pages: ['combat', 7, '__proto__'] }));
  const relu = (await serveur()).o;
  assert.deepEqual(relu.overlayState().mode, null);
  assert.deepEqual(relu.overlayState().pages, ['combat']);
  assert.equal(relu.overlayState().glance, false);
});

test('fenêtre d’un module : la fermer n’ouvre jamais l’overlay (--if-running) ; l’ouvrir, si', async () => {
  fs.rmSync(SAVED, { force: true });
  const { o, ordres, laisserPartir } = await serveur();
  o.showOverlay({ mode: 'combat', pages: ['combat'] });
  await laisserPartir();
  o.setOverlayExtra('carrier', true);
  await laisserPartir();
  o.setOverlayExtra('carrier', true); // déjà ouverte : rien
  o.setOverlayExtra('carrier', false);
  await laisserPartir();
  o.setOverlayExtra('carrier', false); // déjà fermée : rien
  await laisserPartir();
  assert.deepEqual(ordres, ['--only=combat', '--only=combat,carrier', '--only=combat --if-running']);
  // Ouverture et fermeture du même instant : un ordre, qui peut lancer l'overlay (une ouverture en fait partie)
  o.setOverlayExtra('navroute', true);
  o.setOverlayExtra('glance', true);
  o.setOverlayExtra('glance', false);
  await laisserPartir();
  assert.equal(ordres.at(-1), '--only=combat,navroute');
});

test('serveur relancé : il ferme la fenêtre qu’un module ferme, et celles qu’aucun module ne reprend ; il garde celle qu’un module reprend', async () => {
  fs.rmSync(SAVED, { force: true });
  const avant = await serveur();
  avant.o.showOverlay({ mode: 'combat', pages: ['combat'] });
  for (const p of ['navroute', 'glance', 'expansion-sale']) avant.o.setOverlayExtra(p, true);
  await avant.laisserPartir();
  assert.equal(avant.ordres.at(-1), '--only=combat,navroute,glance,expansion-sale');
  assert.deepEqual(JSON.parse(fs.readFileSync(SAVED, 'utf8')).extras, ['navroute', 'glance', 'expansion-sale']);

  // Plantage, relance par dev.js 2 s plus tard : l'overlay affiche toujours ces fenêtres ; le nouveau serveur le sait
  const apres = await serveur();
  const { o, ordres, laisserPartir } = apres;
  assert.deepEqual(o.overlayExtrasForTest().inherited, ['navroute', 'glance', 'expansion-sale']);
  assert.equal(o.overlayShown('navroute'), true);
  assert.equal(o.overlayShown('combat'), false, 'une page du mode n’est pas une fenêtre de module');
  // Le module de l'itinéraire la reprend (itinéraire encore en cours) : aucun ordre, elle reste
  o.setOverlayExtra('navroute', true);
  // Le module de la vente à quai la ferme (départ du quai) : un ordre, qui ne lance pas l'overlay. Avant : rien
  // (« extras.has(page) === false »), la fenêtre restait par-dessus le jeu
  o.setOverlayExtra('expansion-sale', false);
  await laisserPartir();
  assert.deepEqual(ordres, ['--only=combat,navroute,glance --if-running']);
  // Personne ne reprend l'alerte du Coup d'œil (sa minuterie est perdue) : fermée une fois les modules prêts
  o.settleOverlay();
  await laisserPartir();
  assert.deepEqual(ordres.slice(1), ['--only=combat,navroute --if-running']);
  o.settleOverlay(); // une seule fois : plus rien d'hérité
  await laisserPartir();
  assert.equal(ordres.length, 2);
  // La fenêtre reprise se ferme ensuite normalement, quand l'itinéraire est fini
  o.setOverlayExtra('navroute', false);
  await laisserPartir();
  assert.equal(ordres.at(-1), '--only=combat --if-running');
  assert.deepEqual(JSON.parse(fs.readFileSync(SAVED, 'utf8')).extras, []);
});

test('« Aucun » ferme aussi les fenêtres des modules ; chacune se rouvrira d’elle-même à sa prochaine occasion', async () => {
  fs.rmSync(SAVED, { force: true });
  const { o, ordres, laisserPartir } = await serveur();
  o.showOverlay({ mode: 'combat', pages: ['combat'] });
  o.setOverlayExtra('navroute', true);
  await laisserPartir();
  assert.equal(ordres.at(-1), '--only=combat,navroute');
  // Sans dismissExtras (« Masquer la fenêtre » d'une page) : la fenêtre du module reste
  o.showOverlay({ mode: null, pages: [] });
  await laisserPartir();
  assert.equal(ordres.at(-1), '--only=navroute');
  // « Aucun » : tout se ferme. Avant : « --only=navroute », la fenêtre Itinéraire restait
  o.showOverlay({ mode: null, glance: false, pages: [], dismissExtras: true });
  await laisserPartir();
  assert.equal(ordres.at(-1), '--only=,');
  assert.equal(o.overlayShown('navroute'), false);
  const n = ordres.length;
  // Le module la redemande pendant le même itinéraire : elle reste fermée, sans ordre
  o.setOverlayExtra('navroute', true);
  // Un mode choisi ensuite ne la rouvre pas non plus
  o.showOverlay({ mode: 'combat', pages: ['combat'] });
  await laisserPartir();
  assert.equal(ordres.at(-1), '--only=combat');
  // Fin de l'itinéraire : rien à fermer (pas d'ordre) ; au suivant, elle s'ouvre de nouveau d'elle-même
  o.setOverlayExtra('navroute', false);
  await laisserPartir();
  assert.equal(ordres.length, n + 1);
  o.setOverlayExtra('navroute', true);
  await laisserPartir();
  assert.equal(ordres.at(-1), '--only=combat,navroute');

  // « Aucun » tient aussi après une relance du serveur, puis est oublié si le module ne la redemande plus
  o.showOverlay({ mode: null, pages: [], dismissExtras: true });
  await laisserPartir();
  const r = await serveur();
  assert.deepEqual(r.o.overlayExtrasForTest(), { extras: [], dismissed: ['navroute'], inherited: [] });
  r.o.setOverlayExtra('navroute', true); // l'itinéraire est toujours là : toujours fermée
  r.o.settleOverlay();
  await r.laisserPartir();
  assert.deepEqual(r.ordres, [], 'rien à fermer ni à ouvrir');
  assert.equal(r.o.overlayShown('navroute'), false);
  const r2 = await serveur();
  r2.o.settleOverlay(); // cette fois aucun module ne la redemande : « Aucun » oublié pour elle
  assert.deepEqual(r2.o.overlayExtrasForTest().dismissed, []);
});
