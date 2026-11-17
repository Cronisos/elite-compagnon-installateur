// Tests du module Couleurs du HUD. Tout se passe dans des dossiers temporaires : jamais dans le dossier du jeu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import express from 'express';
import { checkMatrix, formatNumber, IDENTITY, readConfig, scan, withMatrix, withoutMatrix } from './xml.js';
import { FILE_NAME, HudColourFile, KEEP_BACKUPS, stamp } from './store.js';
import { GameRun, RECENT_MS } from './gameRun.js';
import hudcolours from './index.js';

// Le fichier réel du joueur (orange d'origine) et sa sauvegarde « bleu » faite à la main, octet pour octet
const ORIGINAL = '<?xml version="1.0" encoding="UTF-8" ?>\r\n<GraphicsConfig />\r\n';
const BLEU = [
  '<?xml version="1.0" encoding="UTF-8" ?>',
  '<GraphicsConfig>',
  '  <GUIColour>',
  '    <Default>',
  '      <LocalisationName>Standard</LocalisationName>',
  '      <MatrixRed>0.2, 0.2, 1</MatrixRed>',
  '      <MatrixGreen>0.1, 0.6, 0.1</MatrixGreen>',
  '      <MatrixBlue>1, 0.6, 0</MatrixBlue>',
  '    </Default>',
  '  </GUIColour>',
  '</GraphicsConfig>',
  '',
].join('\n');
const BLEU_MATRIX = { red: [0.2, 0.2, 1], green: [0.1, 0.6, 0.1], blue: [1, 0.6, 0] };
const PURPLE = { red: [0.6, 0, 1], green: [0.2, 0.5, 0.1], blue: [0, 0.4, 1] };

/** Même calcul que le jeu : chaque ligne est une couleur d'origine, ses nombres le rouge, vert, bleu affichés. */
function shown(m, [r, g, b]) {
  return [0, 1, 2].map((i) => Math.min(1, Math.max(0, r * m.red[i] + g * m.green[i] + b * m.blue[i])));
}

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-hudcolours-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function clock() {
  let t = new Date(2026, 10, 7, 22, 15, 0).getTime();
  return () => new Date((t += 60_000));
}

// --- Sens de la matrice ---

test('sens de la matrice : le préréglage bleu du joueur rend bleu l’orange du HUD, et orange le bleu des boucliers', () => {
  const orange = [1, 0.48, 0]; // orange du HUD : beaucoup de rouge, un peu de vert
  const [r, g, b] = shown(BLEU_MATRIX, orange);
  assert.ok(b === 1 && r < 0.3 && g < 0.6, `orange → ${[r, g, b]}`);
  const [sr, sg, sb] = shown(BLEU_MATRIX, [0, 0, 1]); // bleu pur des boucliers
  assert.deepEqual([sr, sg, sb], [1, 0.6, 0]);
  assert.deepEqual(shown(IDENTITY, orange), orange);
});

// --- Lecture ---

test('fichier d’origine du joueur : pas de bloc, orange d’origine', () => {
  const c = readConfig(ORIGINAL);
  assert.equal(c.hasBlock, false);
  assert.equal(c.empty, false);
  assert.deepEqual(c.matrix, IDENTITY);
  assert.equal(c.otherSettings, false);
});

test('sauvegarde bleu : matrice lue ligne par ligne', () => {
  const c = readConfig(BLEU);
  assert.equal(c.hasBlock, true);
  assert.deepEqual(c.matrix, BLEU_MATRIX);
});

test('fichier vide, blanc ou seulement la déclaration : vide, orange d’origine', () => {
  for (const s of ['', '  \r\n', '<?xml version="1.0" encoding="UTF-8" ?>\r\n']) {
    const c = readConfig(s);
    assert.equal(c.empty, true);
    assert.deepEqual(c.matrix, IDENTITY);
  }
});

test('ligne absente : celle d’origine ; ligne illisible : signalée', () => {
  const c = readConfig('<GraphicsConfig><GUIColour><Default><MatrixRed>0, 0, 1</MatrixRed><MatrixBlue>1, 2</MatrixBlue></Default></GUIColour></GraphicsConfig>');
  assert.deepEqual(c.matrix, { red: [0, 0, 1], green: [0, 1, 0], blue: [0, 0, 1] });
  assert.equal(c.rows.blue, 'invalid');
  assert.equal(c.rows.green, null);
});

test('XML mal formé ou autre racine : erreur, rien n’est réécrit', () => {
  for (const s of ['<GraphicsConfig>', '<GraphicsConfig></Autre>', '<Autre />', 'texte', '<GraphicsConfig /><GraphicsConfig />']) {
    assert.throws(() => readConfig(s), (e) => e.code === 'XML', s);
    assert.throws(() => withMatrix(s, PURPLE), (e) => e.code === 'XML', s);
  }
});

test('texte avant ou après la racine : fichier illisible, rien n’est réécrit', () => {
  const bad = ['junk<GraphicsConfig />', '<GraphicsConfig />\r\nMatrixRed 1, 0, 0', '<?xml version="1.0"?>x\n<GraphicsConfig />', '<GraphicsConfig /><!-- ok -->?'];
  for (const s of bad) {
    assert.throws(() => readConfig(s), (e) => e.code === 'XML' && /hors de l’élément racine/.test(e.message), s);
    assert.throws(() => withMatrix(s, PURPLE), (e) => e.code === 'XML', s);
    assert.throws(() => withoutMatrix(s), (e) => e.code === 'XML', s);
  }
  // Blancs, déclaration et commentaires autour de la racine : acceptés ; texte DANS la racine : XML valide ; entités
  // prédéfinies et caractères numériques : acceptés
  for (const s of ['\r\n\t<?xml version="1.0"?>\r\n<!-- a -->\n<GraphicsConfig />\r\n<!-- b -->\r\n', '<GraphicsConfig>x<GUIColour /></GraphicsConfig>', '<GraphicsConfig><A b="&quot;&#38;&#x26;">&amp;&lt;&gt;&apos;</A></GraphicsConfig>']) {
    assert.equal(readConfig(s).hasBlock, false, s);
    assert.equal(readConfig(withMatrix(s, PURPLE)).hasBlock, true, s);
  }
});

test('lecteur XML : DOCTYPE, ENTITY et références d’entité inconnues refusés (le fichier n’est jamais retouché)', () => {
  const refuses = [
    ['<!DOCTYPE GraphicsConfig>\n<GraphicsConfig />', /DOCTYPE ou ENTITY refusée/],
    ['<!DOCTYPE GraphicsConfig [<!ENTITY e "1">]>\n<GraphicsConfig />', /DOCTYPE ou ENTITY refusée/],
    ['<GraphicsConfig><!ENTITY e "1"></GraphicsConfig>', /DOCTYPE ou ENTITY refusée/],
    ['<GraphicsConfig><Planets>&e;</Planets></GraphicsConfig>', /Référence d’entité inconnue/],
    ['<GraphicsConfig><A b="&e;" /></GraphicsConfig>', /Référence d’entité inconnue/],
    ['<GraphicsConfig><GUIColour><Default><MatrixRed>&e;</MatrixRed></Default></GUIColour></GraphicsConfig>', /Référence d’entité inconnue/],
    ['<GraphicsConfig>a & b</GraphicsConfig>', /Référence d’entité inconnue/],
  ];
  for (const [s, raison] of refuses) {
    assert.throws(() => readConfig(s), (e) => e.code === 'XML' && raison.test(e.message), s);
    assert.throws(() => withMatrix(s, PURPLE), (e) => e.code === 'XML', s);
    assert.throws(() => withoutMatrix(s), (e) => e.code === 'XML', s);
  }
  // Dans un commentaire ou un bloc CDATA, ce n'est que du texte
  assert.equal(readConfig('<GraphicsConfig><!-- <!DOCTYPE x> &e; --><![CDATA[&e;]]></GraphicsConfig>').hasBlock, false);
});

test('lecteur XML : commentaires, CDATA et attributs contenant « > » ignorés', () => {
  const nodes = scan('<?xml version="1.0"?><!-- <GUIColour> --><A b="x>y"><![CDATA[<C>]]><D/></A>');
  assert.equal(nodes.length, 1);
  assert.deepEqual(nodes[0].children.map((c) => c.name), ['D']);
});

// --- Écriture ciblée ---

test('appliquer puis revenir à l’orange : le fichier d’origine revient octet pour octet (CRLF gardés)', () => {
  const colored = withMatrix(ORIGINAL, BLEU_MATRIX);
  assert.deepEqual(readConfig(colored).matrix, BLEU_MATRIX);
  assert.ok(!/[^\r]\n/.test(colored), 'retours à la ligne Windows partout');
  assert.match(colored, /<MatrixRed>0\.2, 0\.2, 1<\/MatrixRed>/);
  assert.match(colored, /<LocalisationName>Standard<\/LocalisationName>/);
  assert.equal(withoutMatrix(colored), ORIGINAL);
});

test('remplacer un bloc existant : même mise en page que la sauvegarde bleu', () => {
  const back = withMatrix(withMatrix(BLEU, PURPLE), BLEU_MATRIX);
  assert.equal(back, BLEU);
});

test('autres réglages gardés tels quels : seul GUIColour/Default change', () => {
  const head = '<?xml version="1.0" encoding="UTF-8" ?>\n<GraphicsConfig>\n  <!-- mes réglages -->\n  <Planets>\n    <Ultra><TextureSize>8192</TextureSize></Ultra>\n  </Planets>\n  <GUIColour>\n    ';
  const old = '<Default>\n      <LocalisationName>Standard</LocalisationName>\n      <MatrixRed>1, 0, 0</MatrixRed>\n    </Default>';
  const tail = '\n    <DesaturateTest><MatrixRed>0.33, 0.33, 0.33</MatrixRed></DesaturateTest>\n  </GUIColour>\n  <GalaxyMap a="1" />\n</GraphicsConfig>\n';
  const out = withMatrix(head + old + tail, PURPLE);
  assert.ok(out.startsWith(head) && out.endsWith(tail));
  const c = readConfig(out);
  assert.deepEqual(c.matrix, PURPLE);
  assert.equal(c.otherSettings, true);
  // Retour à l'orange : GUIColour gardé (il contient encore DesaturateTest), le reste aussi
  const reset = withoutMatrix(out);
  assert.equal(reset, head.replace(/\n    $/, '') + tail);
  assert.equal(readConfig(reset).hasBlock, false);
});

test('GUIColour sans Default, GUIColour vide, racine pleine sans GUIColour', () => {
  const a = withMatrix('<GraphicsConfig>\n  <GUIColour>\n    <Autre />\n  </GUIColour>\n</GraphicsConfig>', PURPLE);
  assert.deepEqual(readConfig(a).matrix, PURPLE);
  assert.match(a, /<Autre \/>/);
  const b = withMatrix('<GraphicsConfig>\n  <GUIColour />\n</GraphicsConfig>', PURPLE);
  assert.deepEqual(readConfig(b).matrix, PURPLE);
  assert.equal(withoutMatrix(b), '<GraphicsConfig />');
  const c = withMatrix('<GraphicsConfig>\n  <Planets />\n</GraphicsConfig>', PURPLE);
  assert.deepEqual(readConfig(c).matrix, PURPLE);
  assert.equal(withoutMatrix(c), '<GraphicsConfig>\n  <Planets />\n</GraphicsConfig>');
});

test('fichier vide : fichier neuf ; BOM gardé', () => {
  const fresh = withMatrix('', PURPLE);
  assert.match(fresh, /^<\?xml version="1\.0" encoding="UTF-8" \?>\r\n<GraphicsConfig>\r\n {2}<GUIColour>/);
  assert.deepEqual(readConfig(fresh).matrix, PURPLE);
  const bom = withMatrix(`﻿${ORIGINAL}`, PURPLE);
  assert.equal(bom.charCodeAt(0), 0xfeff);
  assert.equal(withoutMatrix(bom), `﻿${ORIGINAL}`);
});

test('nombres validés : finis, bornés, 3 par ligne, clés propres', () => {
  assert.deepEqual(checkMatrix(PURPLE), PURPLE);
  assert.equal(typeof checkMatrix(null), 'string');
  assert.equal(typeof checkMatrix({ ...PURPLE, red: [1, 0] }), 'string');
  assert.equal(typeof checkMatrix({ ...PURPLE, red: [1, 0, NaN] }), 'string');
  assert.equal(typeof checkMatrix({ ...PURPLE, red: [1, 0, Infinity] }), 'string');
  assert.equal(typeof checkMatrix({ ...PURPLE, red: [1, 0, '1'] }), 'string');
  assert.equal(typeof checkMatrix({ ...PURPLE, green: [3.5, 0, 0] }), 'string');
  assert.equal(typeof checkMatrix(Object.create(PURPLE)), 'string'); // clés héritées refusées
  assert.deepEqual(checkMatrix({ ...PURPLE, blue: [-0.00001, 1 / 3, 2] }).blue, [0, 0.3333, 2]);
  assert.equal(formatNumber(-0), '0');
  assert.equal(formatNumber(0.1 + 0.2), '0.3');
});

// --- Fichier, sauvegardes, restauration ---

function setup(t, content = ORIGINAL) {
  const dir = tmpDir(t);
  if (content != null) fs.writeFileSync(path.join(dir, FILE_NAME), content);
  fs.writeFileSync(path.join(dir, `${FILE_NAME}.bleu.bak`), BLEU);
  fs.writeFileSync(path.join(dir, `${FILE_NAME}.orange.bak`), ORIGINAL);
  fs.writeFileSync(path.join(dir, 'Settings.xml'), '<Settings />');
  return { dir, store: new HudColourFile({ dir, now: clock() }), read: () => fs.readFileSync(path.join(dir, FILE_NAME), 'utf8') };
}
const opts = (s, extra = {}) => ({ version: s.version, confirm: true, ...extra });

test('appliquer : confirmation et version exigées, sauvegarde horodatée, rien d’autre touché', async (t) => {
  const { dir, store, read } = setup(t);
  const s0 = await store.state();
  assert.equal(s0.exists, true);
  assert.equal(s0.hasBlock, false);
  assert.deepEqual(s0.matrix, IDENTITY);
  await assert.rejects(store.apply(PURPLE, { version: s0.version }), (e) => e.status === 400);
  await assert.rejects(store.apply(PURPLE, { version: 'autre', confirm: true }), (e) => e.status === 409);
  await assert.rejects(store.apply({ red: [9, 0, 0] }, opts(s0)), (e) => e.status === 400);
  assert.equal(read(), ORIGINAL);

  const r = await store.apply(PURPLE, opts(s0));
  assert.equal(r.changed, true);
  assert.match(r.backup, /^GraphicsConfigurationOverride\.xml\.elite-compagnon-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.bak$/);
  assert.equal(fs.readFileSync(path.join(dir, r.backup), 'utf8'), ORIGINAL);
  assert.deepEqual(readConfig(read()).matrix, PURPLE);
  assert.equal(fs.readFileSync(path.join(dir, 'Settings.xml'), 'utf8'), '<Settings />');
  assert.deepEqual(fs.readdirSync(dir).sort(), [FILE_NAME, `${FILE_NAME}.bleu.bak`, r.backup, `${FILE_NAME}.orange.bak`, 'Settings.xml'].sort());

  // Ancienne version de la page : refus
  await assert.rejects(store.apply(BLEU_MATRIX, opts(s0)), (e) => e.status === 409);
  // Même couleur : rien n'est écrit
  const s1 = await store.state();
  assert.deepEqual(await store.apply(PURPLE, opts(s1)), { changed: false, backup: null });
});

test('10 sauvegardes de l’app au plus, dont toujours la toute première (ton fichier d’avant l’app) ; celles faites à la main restent', async (t) => {
  const { dir, store } = setup(t);
  const avant = fs.readFileSync(path.join(dir, FILE_NAME));
  let premiere = null;
  for (let i = 0; i < KEEP_BACKUPS + 4; i++) {
    const s = await store.state();
    const r = await store.apply({ red: [1, i / 100, 0], green: [0, 1, 0], blue: [0, 0, 1] }, opts(s));
    premiere ??= r.backup;
  }
  const names = fs.readdirSync(dir);
  assert.equal(names.filter((n) => n.includes('.elite-compagnon-')).length, KEEP_BACKUPS);
  assert.ok(names.includes(premiere), 'la copie d’avant la première écriture de l’app reste');
  assert.ok(fs.readFileSync(path.join(dir, premiere)).equals(avant), 'et c’est bien ton fichier d’avant');
  assert.ok(names.includes(`${FILE_NAME}.bleu.bak`) && names.includes(`${FILE_NAME}.orange.bak`));
  const s = await store.state();
  assert.equal(s.backups.filter((b) => b.own).length, KEEP_BACKUPS);
  const own = s.backups.filter((b) => b.own).map((b) => b.at);
  assert.deepEqual(own, [...own].sort().reverse(), 'la plus récente d’abord');
  assert.deepEqual(s.backups.find((b) => b.name.endsWith('.bleu.bak')).matrix, BLEU_MATRIX);
  assert.equal(s.backups.find((b) => b.name.endsWith('.orange.bak')).matrix, null);
});

test('deux sauvegardes dans la même seconde : noms distincts', async (t) => {
  const { dir } = setup(t);
  const fixed = () => new Date(2026, 10, 7, 22, 15, 0);
  const store = new HudColourFile({ dir, now: fixed });
  await store.apply(PURPLE, opts(await store.state()));
  await store.apply(BLEU_MATRIX, opts(await store.state()));
  const own = fs.readdirSync(dir).filter((n) => n.includes('.elite-compagnon-')).sort();
  assert.deepEqual(own, [`${FILE_NAME}.elite-compagnon-${stamp(fixed())}-2.bak`, `${FILE_NAME}.elite-compagnon-${stamp(fixed())}.bak`]);
});

test('revenir à l’orange, puis restaurer la sauvegarde bleu faite à la main', async (t) => {
  const { store, read } = setup(t);
  await store.apply(PURPLE, opts(await store.state()));
  const reset = await store.reset(opts(await store.state()));
  assert.equal(reset.changed, true);
  assert.equal(read(), ORIGINAL);

  const r = await store.restore(`${FILE_NAME}.bleu.bak`, opts(await store.state()));
  assert.equal(r.mode, 'colours');
  assert.deepEqual(readConfig(read()).matrix, BLEU_MATRIX);
  // Restaurer l'orange : retour au fichier d'origine
  await store.restore(`${FILE_NAME}.orange.bak`, opts(await store.state()));
  assert.equal(read(), ORIGINAL);
});

test('restauration : seulement un fichier du dossier, jamais un chemin', async (t) => {
  const { store } = setup(t);
  const s = await store.state();
  for (const name of ['../GraphicsConfigurationOverride.xml.x.bak', 'Settings.xml', `${FILE_NAME}.absent.bak`, 42]) {
    await assert.rejects(store.restore(name, opts(s)), (e) => e.status === 400 || e.status === 404, String(name));
  }
});

test('fichier absent : créé sans sauvegarde ; dossier absent : refus, rien n’est créé', async (t) => {
  const { dir, store, read } = setup(t, null);
  const s = await store.state();
  assert.equal(s.exists, false);
  assert.equal(s.version, 'absent');
  const r = await store.apply(PURPLE, opts(s));
  assert.equal(r.backup, null);
  assert.deepEqual(readConfig(read()).matrix, PURPLE);

  const missing = path.join(dir, 'pas-de-jeu');
  const none = new HudColourFile({ dir: missing });
  const s2 = await none.state();
  assert.equal(s2.dirExists, false);
  await assert.rejects(none.apply(PURPLE, opts(s2)), (e) => e.status === 409);
  assert.equal(fs.existsSync(missing), false);
});

test('fichier illisible : couleurs refusées, une sauvegarde peut le remplacer en entier', async (t) => {
  const broken = '<GraphicsConfig><GUIColour>';
  const { dir, store, read } = setup(t, broken);
  const s = await store.state();
  assert.ok(s.error);
  await assert.rejects(store.apply(PURPLE, opts(s)), (e) => e.status === 409);
  await assert.rejects(store.reset(opts(s)), (e) => e.status === 409);
  assert.equal(read(), broken);
  const r = await store.restore(`${FILE_NAME}.bleu.bak`, opts(s));
  assert.equal(r.mode, 'file');
  assert.equal(read(), BLEU);
  assert.equal(fs.readFileSync(path.join(dir, r.backup), 'utf8'), broken); // l'ancien est gardé
});

test('texte parasite après la racine : signalé, ni couleurs ni retour à l’orange', async (t) => {
  const stray = `${ORIGINAL}MatrixRed 1, 0, 0\r\n`;
  const { dir, store, read } = setup(t, stray);
  const s = await store.state();
  assert.match(s.error, /hors de l’élément racine/);
  await assert.rejects(store.apply(PURPLE, opts(s)), (e) => e.status === 409);
  await assert.rejects(store.reset(opts(s)), (e) => e.status === 409);
  assert.equal(read(), stray);
  assert.ok(!fs.readdirSync(dir).some((n) => n.includes('elite-compagnon'))); // aucune sauvegarde ni fichier temporaire
});

test('fichier en lecture seule : signalé, refus sans sauvegarde ni retouche', async (t) => {
  const { dir, store, read } = setup(t);
  const file = path.join(dir, FILE_NAME);
  fs.chmodSync(file, 0o444); // sous Windows : case « Lecture seule » (le dossier temporaire s'efface quand même)
  const s = await store.state();
  assert.equal(s.readOnly, true);
  for (const write of [() => store.apply(PURPLE, opts(s)), () => store.restore(`${FILE_NAME}.bleu.bak`, opts(s))]) {
    await assert.rejects(write(), (e) => e.status === 409 && /lecture seule/.test(e.publicMessage));
  }
  assert.equal(read(), ORIGINAL);
  assert.equal(fs.readdirSync(dir).filter((n) => n.includes('.elite-compagnon')).length, 0, 'ni sauvegarde ni fichier temporaire');
  assert.equal(fs.statSync(file).mode & 0o222, 0, 'l’app ne retire pas la lecture seule');
  fs.chmodSync(file, 0o666);
  assert.equal((await store.state()).readOnly, false);
});

// --- Le jeu tourne-t-il ? ---

test('jeu ouvert, fermé ou inconnu d’après le journal', () => {
  const now = Date.parse('2026-11-07T22:00:00Z');
  const run = new GameRun();
  assert.equal(run.status({ now }).state, 'unknown');
  run.apply({ event: 'Fileheader', timestamp: '2026-11-07T21:50:00Z' });
  assert.equal(run.status({ now }).state, 'running');
  assert.equal(run.status({ now: now + RECENT_MS }).state, 'unknown'); // pas de fermeture notée, plus rien d'écrit
  assert.equal(run.status({ now: now + RECENT_MS, lastWrite: now + RECENT_MS - 1000 }).state, 'running');
  run.apply({ event: 'Shutdown', timestamp: '2026-11-07T21:58:00Z' });
  assert.deepEqual(run.status({ now }), { state: 'closed', since: '2026-11-07T21:58:00.000Z', lastWrite: null });
  run.apply({ event: 'LoadGame', timestamp: '2026-11-07T21:59:00Z' });
  assert.equal(run.status({ now }).state, 'running');
});

// --- API ---

test('API : état, écriture avec confirmation, état du jeu', async (t) => {
  const { dir, read } = setup(t);
  const journal = Object.assign(new EventEmitter(), { addInterest() {}, lastEventAt: null, file: null });
  const sent = [];
  const app = express();
  app.use(express.json());
  const router = express.Router();
  await hudcolours.register({ router, journal, broadcast: (type, data) => sent.push(type), hudColoursDir: dir });
  app.use('/api/modules/hudcolours', router);
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.publicMessage || 'Erreur' }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/modules/hudcolours`;
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  journal.emit('ready', { history: [{ event: 'Fileheader', timestamp: new Date().toISOString() }] });
  const s = await (await fetch(`${base}/state`)).json();
  assert.equal(s.game.state, 'running');
  assert.equal(s.limit, 3);
  assert.equal(s.path, path.join(dir, FILE_NAME));

  const refused = await post('/apply', { matrix: PURPLE, version: s.version });
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).error, /Confirmation/);

  const ok = await post('/apply', { matrix: PURPLE, version: s.version, confirm: true });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.result.changed, true);
  assert.deepEqual(body.state.matrix, PURPLE);
  assert.deepEqual(sent, ['hudcolours:update']);
  assert.deepEqual(readConfig(read()).matrix, PURPLE);

  journal.emit('event', { event: 'Shutdown', timestamp: new Date().toISOString() });
  const after = await (await fetch(`${base}/state`)).json();
  assert.equal(after.game.state, 'closed');
});

test('API : jeu lancé il y a longtemps, Status.json écrit à l’instant : ouvert ; sans lui : inconnu', async (t) => {
  const { dir } = setup(t);
  const logs = tmpDir(t);
  const journal = Object.assign(new EventEmitter(), { addInterest() {}, lastEventAt: null, file: null, dir: logs });
  const app = express();
  const router = express.Router();
  await hudcolours.register({ router, journal, broadcast() {}, hudColoursDir: dir });
  app.use('/api/modules/hudcolours', router);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise((r) => server.once('listening', r));
  const game = async () => (await (await fetch(`http://127.0.0.1:${server.address().port}/api/modules/hudcolours/state`)).json()).game.state;

  journal.emit('ready', { history: [{ event: 'Fileheader', timestamp: new Date(Date.now() - 2 * RECENT_MS).toISOString() }] });
  assert.equal(await game(), 'unknown');
  fs.writeFileSync(path.join(logs, 'Status.json'), '{}');
  assert.equal(await game(), 'running');
});

test('horloge qui recule (heure d’hiver, heure corrigée) : la copie qui vient d’être faite n’est jamais effacée', async (t) => {
  const { dir } = setup(t);
  // 10 applications avec l'horloge en avance (janvier 2027), puis l'heure corrigée (8 nov. 2026)
  let now = new Date(2027, 0, 15, 12, 0, 0).getTime();
  const store = new HudColourFile({ dir, now: () => new Date(now) });
  for (let i = 0; i < KEEP_BACKUPS; i++) {
    now += 60_000;
    await store.apply({ red: [1, i / 100, 0], green: [0, 1, 0], blue: [0, 0, 1] }, opts(await store.state()));
  }
  now = new Date(2026, 10, 8, 12, 0, 0).getTime();
  for (let k = 0; k < 3; k++) {
    const avant = fs.readFileSync(path.join(dir, FILE_NAME));
    now += 60_000;
    const r = await store.apply({ red: [0.5, k / 10, 0.2], green: [0, 1, 0], blue: [0, 0, 1] }, opts(await store.state()));
    assert.equal(r.changed, true);
    assert.ok(fs.existsSync(path.join(dir, r.backup)), `copie annoncée présente (${r.backup})`);
    assert.ok(fs.readFileSync(path.join(dir, r.backup)).equals(avant), 'elle contient le fichier d’avant l’écriture');
    assert.equal(fs.readdirSync(dir).filter((n) => n.includes('.elite-compagnon-')).length, KEEP_BACKUPS, 'toujours 10 au plus');
  }
  // Ordre réel de création : les copies faites après la correction de l'heure sont les plus récentes
  const own = await store.ownBackups();
  assert.deepEqual(own.slice(-3).map((b) => b.name.includes('2026-11-08')), [true, true, true]);
  // Et la page les montre en tête (la plus récente d'abord), parmi les copies faites à la main
  const listed = (await store.state()).backups;
  assert.deepEqual(listed.filter((b) => b.own).slice(0, 3).map((b) => b.name.includes('2026-11-08')), [true, true, true]);
  assert.ok(listed.some((b) => !b.own), 'les copies faites à la main restent listées');
  assert.ok(!listed.some((b) => 'n' in b || 'sort' in b), 'aucun champ interne dans la réponse');
});

test('teinte de l’app : couleurs d’origine sans matrice, oranges passés par la matrice sinon, jamais illisibles', async () => {
  const { teinteApp, aTravers, ORANGES } = await import('./teinte.js');
  assert.deepEqual(teinteApp(null), { identite: true, couleurs: { ...ORANGES } });
  assert.equal(teinteApp(structuredClone(IDENTITY)).identite, true);
  // Matrice « bleu » (sauvegarde .bleu.bak du joueur) : l'orange devient bleu clair
  const bleu = { red: [0.2, 0.2, 1], green: [0.1, 0.6, 0.1], blue: [1, 0.6, 0] };
  const t = teinteApp(bleu);
  assert.equal(t.identite, false);
  assert.deepEqual(t.couleurs.acc, [126, 179, 255]);
  // Une matrice qui assombrit tout est éclaircie jusqu'à rester lisible
  const sombre = aTravers({ red: [0.1, 0, 0], green: [0, 0.1, 0], blue: [0, 0, 0.1] }, [255, 154, 60]);
  assert.ok(0.2126 * sombre[0] + 0.7152 * sombre[1] + 0.0722 * sombre[2] >= 0.39 * 255, sombre.join(','));
});
