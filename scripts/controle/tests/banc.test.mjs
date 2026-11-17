// Banc de contrôle : normalisation, horloge figée, orchestrateur des étapes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FIGER } from '../banc/chemins.mjs';
import { difference, normaliseur } from '../banc/normaliser.mjs';
import { chargerEtapes, controler } from '../lancer.mjs';
import { bilanTests, testsEnEchec } from '../outils.mjs';

test('normalisation : dossier du banc, port, UUID et heure réelle remplacés ; heure figée et heures du jeu gardées', () => {
  const racine = 'C:\\Users\\X\\AppData\\Local\\Temp\\elite-controle-AbC123';
  const debut = Date.parse('2026-11-08T03:00:00Z');
  const norm = normaliseur({ racine, port: 54321, debut, fin: debut + 60_000 });
  const v = norm({
    dir: `${racine}\\journaux`,
    slash: 'C:/Users/X/AppData/Local/Temp/elite-controle-AbC123/donnees/x.json',
    url: 'http://127.0.0.1:54321/api/state',
    autrePort: 'http://127.0.0.1:3001/api',
    id: 'id 0b6f2a10-1c2d-4e3f-8a9b-0c1d2e3f4a5b',
    creeEnBase: '2026-11-08T03:00:30.123Z',
    creeMs: debut + 10_000,
    figee: '2026-11-07T14:20:00Z',
    jeu: '2026-10-27T22:39:33.000Z',
    nombre: 1234,
    liste: [`${racine}\\a`, null, true],
    avatar: '/api/modules/compagnon/avatars/defaut/neutre?v=1794103550177',
    petitNumero: '/x?v=12',
  });
  assert.deepEqual(v, {
    dir: '<banc>\\journaux',
    slash: '<banc>/donnees/x.json',
    url: 'http://127.0.0.1:<port>/api/state',
    autrePort: 'http://127.0.0.1:3001/api',
    id: 'id <uuid>',
    creeEnBase: '<heure réelle>',
    creeMs: '<heure réelle>',
    figee: '2026-11-07T14:20:00Z',
    jeu: '2026-10-27T22:39:33.000Z',
    nombre: 1234,
    liste: ['<banc>\\a', null, true],
    avatar: '/api/modules/compagnon/avatars/defaut/neutre?v=<date du fichier>',
    petitNumero: '/x?v=12',
  });
});

test('normalisation : première différence, avec son chemin', () => {
  assert.equal(difference({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), null);
  assert.deepEqual(difference({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] }), { chemin: '.a[1].b', attendu: 2, obtenu: 3 });
  assert.deepEqual(difference({ a: 1 }, { a: 1, c: 2 }), { chemin: '.c', attendu: '(absent)', obtenu: 2 });
  assert.deepEqual(difference([1], [1, 2]), { chemin: '[1]', attendu: '(absent)', obtenu: 2 });
  assert.equal(difference({ a: 1, b: 2 }, { b: 2, a: 1 }).chemin, '(racine)', 'ordre des clés compté');
  assert.deepEqual(difference(null, {}), { chemin: '(racine)', attendu: null, obtenu: {} });
});

function figer(env, code) {
  return spawnSync(process.execPath, ['--import', pathToFileURL(FIGER).href, '--input-type=module', '-e', code], {
    encoding: 'utf8', env: { ...process.env, CONTROLE_NOW: '', CONTROLE_ALEA: '', CONTROLE_LANGUE: '', ...env },
  });
}

test('horloge figée : Date.now, new Date() et Date() rendent CONTROLE_NOW ; les autres dates ne bougent pas', () => {
  const code = `
    const a = Date.now(); await new Promise((r) => setTimeout(r, 30)); const b = Date.now();
    console.log(JSON.stringify({ a, b, iso: new Date().toISOString(), str: Date() === new Date(${Date.parse('2026-11-07T14:20:00Z')}).toString(),
      autre: new Date('2026-01-02T03:04:05Z').toISOString(), parse: Date.parse('2026-01-02T03:04:05Z'), utc: Date.UTC(2026, 0, 2),
      inst: new Date() instanceof Date, proto: Object.getPrototypeOf(new Date()) === Date.prototype }));`;
  const r = figer({ CONTROLE_NOW: '2026-11-07T14:20:00Z' }, code);
  assert.equal(r.status, 0, r.stderr);
  const v = JSON.parse(r.stdout);
  const t = Date.parse('2026-11-07T14:20:00Z');
  assert.deepEqual(v, { a: t, b: t, iso: '2026-11-07T14:20:00.000Z', str: true, autre: '2026-01-02T03:04:05.000Z', parse: Date.parse('2026-01-02T03:04:05Z'), utc: Date.UTC(2026, 0, 2), inst: true, proto: true });
  // Sans variable : rien n'est touché
  const libre = figer({}, 'console.log(Date.now())');
  assert.ok(Math.abs(Number(libre.stdout) - Date.now()) < 60_000);
  // Illisible : arrêt clair
  const faux = figer({ CONTROLE_NOW: 'demain' }, 'console.log(1)');
  assert.notEqual(faux.status, 0);
  assert.match(faux.stderr, /CONTROLE_NOW illisible/);
  assert.notEqual(figer({ CONTROLE_NOW: '2026-11-07T14:20:00' }, 'console.log(1)').status, 0, 'fuseau exigé');
});

test('aléa et langue figés : même suite à chaque lancement, tris et nombres en français', () => {
  const code = `console.log(JSON.stringify({ r: [Math.random(), Math.random()], n: (1234.5).toLocaleString(), tri: ['é', 'f', 'e'].sort((a, b) => a.localeCompare(b)),
    coll: new Intl.Collator().resolvedOptions().locale, explicite: (1234.5).toLocaleString('en-US') }))`;
  const a = JSON.parse(figer({ CONTROLE_ALEA: 'controle', CONTROLE_LANGUE: 'fr-FR' }, code).stdout);
  const b = JSON.parse(figer({ CONTROLE_ALEA: 'controle', CONTROLE_LANGUE: 'fr-FR' }, code).stdout);
  assert.deepEqual(a, b);
  assert.notEqual(a.r[0], a.r[1]);
  assert.ok(a.r.every((x) => x >= 0 && x < 1));
  assert.equal(a.n, '1\u202f234,5');
  assert.deepEqual(a.tri, ['e', 'é', 'f']);
  assert.match(a.coll, /^fr/, 'collation française (ICU la range sous « fr »)');
  assert.equal(a.explicite, '1,234.5', 'une langue donnée par le code reste la sienne');
  const autre = JSON.parse(figer({ CONTROLE_ALEA: 'autre graine', CONTROLE_LANGUE: 'fr-FR' }, code).stdout);
  assert.notDeepEqual(autre.r, a.r);
  // Preuve que la langue vient bien de CONTROLE_LANGUE, et pas du PC (qui est peut-être déjà en français)
  const allemand = JSON.parse(figer({ CONTROLE_LANGUE: 'de-DE' }, code).stdout);
  assert.equal(allemand.n, '1.234,5');
  assert.match(allemand.coll, /^de/);
});

test('résumé de node --test lu dans sa sortie', () => {
  const sortie = '✔ a (1ms)\n✖ b échoue (2.5ms)\nℹ tests 3\nℹ suites 0\nℹ pass 2\nℹ fail 1\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n✖ failing tests:\n✖ b échoue (2.5ms)\n';
  assert.deepEqual(bilanTests(sortie), { tests: 3, pass: 2, fail: 1, skipped: 0, todo: 0, cancelled: 0 });
  assert.deepEqual(testsEnEchec(sortie), ['✖ b échoue']);
  assert.equal(bilanTests('rien'), null);
});

test('orchestrateur : étapes dans l’ordre du nom, arrêt au premier échec, résumé clair', async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-controle-etapes-'));
  const marque = path.join(dossier, 'lancee.txt');
  try {
    fs.writeFileSync(path.join(dossier, '20-deux.mjs'), "export default { titre: 'Deuxième', async lancer(ctx) { throw new ctx.EchecEtape('ça casse ici', { details: 'détail utile' }); } };\n");
    fs.writeFileSync(path.join(dossier, '10-un.mjs'), "export default { titre: 'Première', async lancer() { return 'tout va bien'; } };\n");
    fs.writeFileSync(path.join(dossier, '30-trois.mjs'), `import fs from 'node:fs'; export default { titre: 'Troisième', async lancer() { fs.writeFileSync(${JSON.stringify(marque)}, 'x'); } };\n`);
    assert.deepEqual((await chargerEtapes(dossier)).map((e) => e.nom), ['10-un', '20-deux', '30-trois']);
    const lignes = [];
    const code = await controler([], (l) => lignes.push(l), dossier, { journaux: path.join(dossier, 'journaux') });
    const texte = lignes.join('\n');
    assert.equal(code, 1);
    assert.equal(fs.existsSync(marque), false, 'rien ne tourne après un échec');
    assert.match(texte, /✔ réussie .* : tout va bien/);
    assert.match(texte, /✖ ÉCHEC .* : ça casse ici/);
    assert.match(texte, /détail utile/);
    assert.match(texte, /· Troisième — non lancée/);
    assert.match(texte, /Contrôle arrêté : « Deuxième » a échoué/);
    // Filtre : seulement la première
    const seule = [];
    assert.equal(await controler(['--etape=un'], (l) => seule.push(l), dossier, { journaux: path.join(dossier, 'journaux') }), 0);
    assert.match(seule.join('\n'), /Tout est vert/);
    // Avertissement (point à décider, non bloquant) : vert, mais répété sous l'étape et à la fin
    fs.writeFileSync(path.join(dossier, '35-averti.mjs'), "export default { titre: 'Avertie', async lancer() { return { resume: 'passe', avertissement: 'dépendance hors suivi, mise à jour prévue' }; } };\n");
    const averti = [];
    assert.equal(await controler(['--etape=averti'], (l) => averti.push(l), dossier, { journaux: path.join(dossier, 'journaux') }), 0);
    const texteAverti = averti.join('\n');
    assert.match(texteAverti, /✔ réussie .* : passe\n {2}⚠ AVERTISSEMENT : dépendance hors suivi, mise à jour prévue/);
    assert.match(texteAverti, /1 avertissement\(s\), à décider \(ils ne bloquent pas\) :\n {2}⚠ Avertie : dépendance hors suivi/);
    assert.match(texteAverti, /Tout est vert : la mise à jour peut partir \(lis les avertissements ci-dessus\)\./);
    assert.doesNotMatch(seule.join('\n'), /avertissement/i, 'sans avertissement : rien en plus');
    fs.rmSync(path.join(dossier, '35-averti.mjs'));
    // Étape sautée : pas vert
    fs.writeFileSync(path.join(dossier, '40-quatre.mjs'), "export default { titre: 'Quatrième', async lancer() { return { saute: 'pas possible ici' }; } };\n");
    assert.equal(await controler(['--depuis=40'], () => {}, dossier, { journaux: path.join(dossier, 'journaux') }), 2);
    // Mal nommée ou mal formée : refus (une étape ne doit pas disparaître en silence)
    fs.writeFileSync(path.join(dossier, 'sans-numero.mjs'), 'export default {};\n');
    await assert.rejects(chargerEtapes(dossier), /Étape mal nommée : sans-numero\.mjs/);
    fs.rmSync(path.join(dossier, 'sans-numero.mjs'));
    fs.writeFileSync(path.join(dossier, '50-vide.mjs'), 'export default { titre: "Vide" };\n');
    await assert.rejects(chargerEtapes(dossier), /Étape mal formée : 50-vide\.mjs/);
    await assert.rejects(controler(['--inconnue'], () => {}, dossier), /Option inconnue/);
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});

test('étapes du projet : toutes chargées, numérotées, avec un titre', async () => {
  const etapes = await chargerEtapes();
  const noms = etapes.map((e) => e.nom);
  for (const attendu of ['10-tests-serveur', '20-tests-client', '40-golden', '50-compilation-client', '60-anonymat', '62-distribution', '70-rejeu', '75-pages', '80-attaques', '85-base']) assert.ok(noms.includes(attendu), attendu);
  assert.deepEqual(noms, [...noms].sort());
});

test('étape « gros dossier de journaux » : présente, plafonds fixés, plafond du tas vérifié avant tout lancement', async () => {
  const noms = (await chargerEtapes()).map((e) => e.nom);
  assert.ok(noms.includes('72-memoire'));
  const m = await import(pathToFileURL(path.join(path.dirname(FIGER), '..', 'etapes', '72-memoire.mjs')).href);
  assert.equal(m.COPIES, 40);
  assert.equal(m.TAS_MO, 220);
  assert.equal(m.PAR_MO_MAX, 0.4);
  const { demarrerServeur } = await import(pathToFileURL(path.join(path.dirname(FIGER), 'serveur.mjs')).href);
  for (const tasMo of [10, 1.5, '200', 100000]) await assert.rejects(demarrerServeur({ tasMo }), /Plafond du tas refusé/, String(tasMo));
});

test('mesure de la mémoire (banc/memoire.mjs) : ramasse-miettes exigé, réponse en Mo', () => {
  const script = `
    const { fork } = require('node:child_process');
    const run = (args) => new Promise((ok) => {
      const c = fork('-e', ['setInterval(() => {}, 1000)'], { execArgv: [...args, '--import', ${JSON.stringify(pathToFileURL(path.join(path.dirname(FIGER), 'memoire.mjs')).href)}], stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      c.on('message', (m) => { c.kill(); ok(m); });
      c.send({ type: 'memoire', id: 'x' });
    });
    (async () => { console.log(JSON.stringify([await run(['--expose-gc']), await run([])])); })();
  `;
  const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 30_000 });
  const [avec, sans] = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.equal(avec.id, 'x');
  assert.ok(avec.tasMo > 1 && avec.tasMo < 200 && avec.limiteMo > avec.tasMo, JSON.stringify(avec));
  assert.match(sans.erreur, /--expose-gc/);
});

test('données de référence du banc : seulement les versions figées (sinon refus clair) ; date de téléchargement fixe', async () => {
  const { REFERENCE } = await import(pathToFileURL(path.join(path.dirname(FIGER), 'chemins.mjs')).href);
  const { verifierReference } = await import(pathToFileURL(path.join(path.dirname(FIGER), 'reference.mjs')).href);
  const { DATE_REFERENCE } = await import(pathToFileURL(path.join(path.dirname(FIGER), 'serveur.mjs')).href);
  assert.equal(DATE_REFERENCE, '2026-11-07T00:00:00.000Z');
  if (!fs.existsSync(path.join(REFERENCE, 'meta.json'))) return;
  assert.equal((await verifierReference(REFERENCE)).pinned, true, 'celles du banc : npm run controle:reference');
  const copie = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-banc-ref-'));
  try {
    fs.cpSync(REFERENCE, copie, { recursive: true });
    fs.appendFileSync(path.join(copie, 'fdevids', 'outfitting.csv'), '129051593,Int_LargeCargoRack_Size6_Class1,x,y\n');
    await assert.rejects(verifierReference(copie), (err) => /pas aux versions figées/.test(err.message) && /fdevids\/outfitting\.csv : empreinte/.test(err.message) && /npm run controle:reference/.test(err.message));
    const meta = JSON.parse(fs.readFileSync(path.join(copie, 'meta.json'), 'utf8'));
    fs.writeFileSync(path.join(copie, 'meta.json'), JSON.stringify({ version: meta.version, downloadedAt: '2026-10-28T12:14:04.947Z', files: 183 }));
    await assert.rejects(verifierReference(path.join(copie, '.')), /téléchargées avant le figeage des versions/);
  } finally {
    fs.rmSync(copie, { recursive: true, force: true });
  }
});
