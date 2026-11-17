// Dossier des données de l'app de bureau : copie unique de server/data, jamais l'original modifié (donnees.js).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { dossierApp, dossierAppOuArret, dossierDonnees, repliDossierApp, sourceDev, donneesLaisseesDeCote, preparerDonnees, demanderEffacement, effacerSiDemande } = require('./donnees.js');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bureau-donnees-'));

test('dossiers sous %APPDATA%', () => {
  assert.equal(dossierApp({ APPDATA: 'C:\\U\\AppData\\Roaming' }), path.join('C:\\U\\AppData\\Roaming', 'Elite Compagnon'));
  assert.equal(dossierDonnees({ APPDATA: 'C:\\U\\AppData\\Roaming' }), path.join('C:\\U\\AppData\\Roaming', 'Elite Compagnon', 'donnees'));
  assert.throws(() => dossierApp({}), /APPDATA/);
  assert.equal(repliDossierApp({ APPDATA: 'C:\\U\\AppData\\Roaming' }), null);
});

test('%APPDATA% redirigé sur le réseau : dossier de l’app sous %LOCALAPPDATA% (le serveur refuserait le réseau), noté', () => {
  const env = { APPDATA: '\\\\serveur\\profils\\Testeur\\AppData\\Roaming', LOCALAPPDATA: 'C:\\U\\AppData\\Local' };
  assert.equal(dossierApp(env), path.join('C:\\U\\AppData\\Local', 'Elite Compagnon'));
  assert.equal(dossierDonnees(env), path.join('C:\\U\\AppData\\Local', 'Elite Compagnon', 'donnees'));
  assert.match(repliDossierApp(env), /%APPDATA% est sur le réseau \(\\\\serveur.*%LOCALAPPDATA%/);
  assert.equal(dossierApp({ ...env, APPDATA: '//serveur/profils' }), path.join('C:\\U\\AppData\\Local', 'Elite Compagnon'));
  // Les deux sur le réseau : un message clair plutôt qu'un dossier que le serveur refusera
  assert.throws(() => dossierApp({ ...env, LOCALAPPDATA: '\\\\serveur\\local' }), /sur le réseau : Elite Compagnon a besoin d'un dossier de ce PC/);
  assert.equal(repliDossierApp({ ...env, LOCALAPPDATA: '' }), null);
});

test('lancement sans dossier de ce PC : message en français pour le joueur, puis arrêt (pas la boîte d’Electron)', () => {
  const vus = [];
  const sortie = { montrer: (titre, texte) => vus.push(['montrer', titre, texte]), arreter: (code) => vus.push(['arreter', code]) };
  const reseau = { APPDATA: '\\\\serveur\\profils\\Testeur', LOCALAPPDATA: '\\\\serveur\\local' };
  assert.equal(dossierAppOuArret(sortie, reseau), null);
  assert.equal(vus.length, 2);
  assert.equal(vus[0][1], 'Elite Compagnon');
  assert.match(vus[0][2], /^Elite Compagnon ne peut pas démarrer\.\n\nTes dossiers Windows .* sont sur le réseau/);
  assert.doesNotMatch(vus[0][2], /\bat .*\.js:\d+|Error:/, 'pas de pile technique');
  assert.deepEqual(vus[1], ['arreter', 1]);
  vus.length = 0;
  assert.equal(dossierAppOuArret(sortie, { APPDATA: 'C:\\U\\AppData\\Roaming' }), path.join('C:\\U\\AppData\\Roaming', 'Elite Compagnon'));
  assert.deepEqual(vus, [], 'dossier trouvé : rien montré, rien arrêté');
});

test('copie une fois, original intact, journaux SQLite et restes ignorés', () => {
  const t = temp();
  const source = path.join(t, 'data');
  fs.mkdirSync(path.join(source, 'captures'), { recursive: true });
  fs.writeFileSync(path.join(source, 'elite.db'), 'base');
  fs.writeFileSync(path.join(source, 'elite.db-journal'), 'x');
  fs.writeFileSync(path.join(source, 'captures', 'a.png'), 'img');
  const cible = path.join(t, 'app', 'donnees');
  fs.mkdirSync(path.join(t, 'app', 'donnees.tmp-999', 'vieux'), { recursive: true });
  const r = preparerDonnees({ source, cible });
  assert.equal(r.copie, source);
  assert.equal(fs.readFileSync(path.join(cible, 'elite.db'), 'utf8'), 'base');
  assert.equal(fs.readFileSync(path.join(cible, 'captures', 'a.png'), 'utf8'), 'img');
  assert.equal(fs.existsSync(path.join(cible, 'elite.db-journal')), false);
  assert.equal(fs.existsSync(path.join(t, 'app', 'donnees.tmp-999')), false);
  assert.deepEqual(fs.readdirSync(source).sort(), ['captures', 'elite.db', 'elite.db-journal']);
  // Deuxième lancement : rien de recopié, même si server/data a changé
  fs.writeFileSync(path.join(source, 'elite.db'), 'plus récente');
  assert.equal(preparerDonnees({ source, cible }).copie, null);
  assert.equal(fs.readFileSync(path.join(cible, 'elite.db'), 'utf8'), 'base');
  fs.rmSync(t, { recursive: true, force: true });
});

test('server/data vide ou absent : dossier neuf, rien de copié', () => {
  const t = temp();
  fs.mkdirSync(path.join(t, 'data', 'reference'), { recursive: true });
  fs.writeFileSync(path.join(t, 'data', '.gitkeep'), '');
  const r = preparerDonnees({ source: path.join(t, 'data'), cible: path.join(t, 'app', 'donnees') });
  assert.equal(r.copie, null);
  assert.deepEqual(fs.readdirSync(path.join(t, 'app', 'donnees')), []);
  assert.equal(preparerDonnees({ source: path.join(t, 'absent'), cible: path.join(t, 'app2', 'donnees') }).copie, null);
  fs.rmSync(t, { recursive: true, force: true });
});

test('effacer mes données : seulement si demandé ; tout sauf la référence, puis plus aucune copie de server/data', () => {
  const t = temp();
  const appDir = path.join(t, 'Elite Compagnon');
  const cible = path.join(appDir, 'donnees');
  fs.mkdirSync(path.join(cible, 'reference'), { recursive: true });
  fs.mkdirSync(path.join(cible, 'captures'), { recursive: true });
  fs.writeFileSync(path.join(cible, 'elite.db'), 'base');
  fs.writeFileSync(path.join(cible, 'escadron-jeton.json'), '{"token":"x"}');
  fs.writeFileSync(path.join(cible, 'reference', 'ships.json'), '[]');
  fs.writeFileSync(path.join(appDir, 'bureau.json'), '{}');
  fs.writeFileSync(path.join(appDir, 'bureau.log'), 'journal');
  fs.writeFileSync(path.join(appDir, 'bureau.1.log'), 'ancien journal');
  fs.mkdirSync(path.join(appDir, 'Cache'));
  // Données de l'overlay : son dossier dans celui de l'app, et son ancien dossier à côté
  fs.mkdirSync(path.join(appDir, 'overlay'));
  fs.writeFileSync(path.join(appDir, 'overlay', 'position-glance.json'), '{"x":1,"y":2}');
  fs.mkdirSync(path.join(t, 'elite-companion-overlay'));
  fs.writeFileSync(path.join(t, 'elite-companion-overlay', 'bouclier-jauge.json'), '{}');
  fs.mkdirSync(path.join(t, 'Autre programme'));
  // Sans demande : rien
  assert.equal(effacerSiDemande({ app: appDir, cible }), null);
  assert.ok(fs.existsSync(path.join(cible, 'elite.db')));
  demanderEffacement({ APPDATA: t }, new Date('2026-11-13T20:00:00Z'));
  const effaces = effacerSiDemande({ app: appDir, cible });
  assert.deepEqual(effaces.sort(), ['bureau.1.log', 'bureau.json', 'bureau.log', 'captures', 'elite-companion-overlay', 'elite.db', 'escadron-jeton.json', 'overlay']);
  assert.deepEqual(fs.readdirSync(cible), ['reference']);
  assert.ok(fs.existsSync(path.join(cible, 'reference', 'ships.json')));
  assert.equal(fs.existsSync(path.join(appDir, 'bureau.log')), false, 'journal de l’app effacé (pages visitées, chemins du PC)');
  assert.equal(fs.existsSync(path.join(appDir, 'overlay')), false, 'places des fenêtres en jeu effacées');
  assert.equal(fs.existsSync(path.join(t, 'elite-companion-overlay')), false, 'ancien dossier de l’overlay effacé');
  assert.ok(fs.existsSync(path.join(appDir, 'Cache')), 'cache de Chromium : vidé par Electron, pas ici');
  assert.ok(fs.existsSync(path.join(t, 'Autre programme')), 'rien d’autre dans %APPDATA%');
  assert.equal(effacerSiDemande({ app: appDir, cible }), null, 'fait une seule fois');
  // Le dossier vidé existe : les données de npm run dev ne sont pas recopiées par-dessus
  const source = path.join(t, 'data');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'elite.db'), 'base du développeur');
  assert.equal(preparerDonnees({ source, cible }).copie, null);
  assert.equal(fs.existsSync(path.join(cible, 'elite.db')), false);
  fs.rmSync(t, { recursive: true, force: true });
});

test('app installée (pas de source) : dossier créé vide, jamais de copie', () => {
  const t = temp();
  const cible = path.join(t, 'app', 'donnees');
  assert.deepEqual(preparerDonnees({ source: null, cible }), { dossier: cible, copie: null });
  assert.deepEqual(fs.readdirSync(cible), []);
  fs.rmSync(t, { recursive: true, force: true });
});

test('copie de server/data : seulement avec le marqueur explicite du développeur', () => {
  const t = temp();
  // Dossier de l'app zippé tel quel, avec les données de son auteur dans server/data
  fs.mkdirSync(path.join(t, 'server', 'data'), { recursive: true });
  fs.writeFileSync(path.join(t, 'server', 'data', 'elite.db'), 'base de Testeur');
  fs.writeFileSync(path.join(t, 'server', 'data', 'escadron-jeton.json'), '{"token":"x"}');
  for (const env of [{}, { ELITE_COPIER_DONNEES_DEV: '' }, { ELITE_COPIER_DONNEES_DEV: '0' }, { ELITE_COPIER_DONNEES_DEV: 'oui' }]) {
    assert.equal(sourceDev(t, env), null, JSON.stringify(env));
  }
  assert.equal(donneesLaisseesDeCote(t, {}), true, 'noté dans bureau.log');
  const cible = path.join(t, 'appdata', 'donnees');
  assert.equal(preparerDonnees({ source: sourceDev(t, {}), cible }).copie, null);
  assert.deepEqual(fs.readdirSync(cible), [], 'le membre démarre vide, sans la base ni le jeton de l’auteur');
  // Le développeur, lui, le demande
  const source = sourceDev(t, { ELITE_COPIER_DONNEES_DEV: '1' });
  assert.equal(source, path.join(t, 'server', 'data'));
  assert.equal(donneesLaisseesDeCote(t, { ELITE_COPIER_DONNEES_DEV: '1' }), false);
  assert.equal(preparerDonnees({ source, cible: path.join(t, 'dev', 'donnees') }).copie, source);
  assert.equal(donneesLaisseesDeCote(path.join(t, 'vide'), {}), false);
  fs.rmSync(t, { recursive: true, force: true });
});

test('restauration : la sauvegarde remplace les données, celles d’avant sont gardées à côté, la référence est reprise', () => {
  const { demanderRestauration, restaurerSiDemande, dossierSauvegardes } = require('./donnees.js');
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-restauration-'));
  const env = { APPDATA: path.join(t, 'Roaming'), USERPROFILE: t };
  const app = path.join(env.APPDATA, 'Elite Compagnon');
  const cible = path.join(app, 'donnees');
  const sauvegardes = dossierSauvegardes(env);
  assert.equal(sauvegardes, path.join(t, 'Documents', 'Elite Compagnon - sauvegardes'));
  const ecrire = (f, c) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); };
  ecrire(path.join(cible, 'elite.db'), 'base actuelle');
  ecrire(path.join(cible, 'reference', 'gros.json'), 'référence');
  const nom = '2026-11-17 14h32m05';
  ecrire(path.join(sauvegardes, nom, 'elite.db'), 'base sauvegardée');
  ecrire(path.join(sauvegardes, nom, 'compagnon', 'a.png'), 'image');
  ecrire(path.join(sauvegardes, nom, 'sauvegarde.json'), JSON.stringify({ app: 'Elite Compagnon' }));
  assert.equal(restaurerSiDemande({ app, cible, sauvegardes }), null, 'sans demande : rien');
  for (const mauvais of ['../ailleurs', 'C:\\Windows', '', null, '2026-11-17']) assert.equal(demanderRestauration(mauvais, env), false, String(mauvais));
  assert.equal(demanderRestauration(nom, env), true);
  const r = restaurerSiDemande({ app, cible, sauvegardes });
  assert.equal(r.nom, nom);
  assert.equal(r.fichiers, 2);
  assert.equal(fs.readFileSync(path.join(cible, 'elite.db'), 'utf8'), 'base sauvegardée');
  assert.equal(fs.readFileSync(path.join(cible, 'compagnon', 'a.png'), 'utf8'), 'image');
  assert.equal(fs.readFileSync(path.join(cible, 'reference', 'gros.json'), 'utf8'), 'référence');
  assert.ok(!fs.existsSync(path.join(cible, 'sauvegarde.json')), 'la fiche de la sauvegarde n’est pas une donnée');
  assert.equal(fs.readFileSync(path.join(r.laisse, 'elite.db'), 'utf8'), 'base actuelle', 'données d’avant gardées');
  assert.equal(fs.readFileSync(path.join(sauvegardes, nom, 'elite.db'), 'utf8'), 'base sauvegardée', 'la sauvegarde reste intacte');
  assert.equal(restaurerSiDemande({ app, cible, sauvegardes }), null, 'une seule fois');
  // Sauvegarde disparue ou qui n'en est pas une : rien ne bouge, la demande est retirée
  assert.equal(demanderRestauration('2026-01-01 00h00m00', env), true);
  assert.match(restaurerSiDemande({ app, cible, sauvegardes }).erreur, /introuvable/);
  assert.equal(fs.readFileSync(path.join(cible, 'elite.db'), 'utf8'), 'base sauvegardée');
  assert.equal(restaurerSiDemande({ app, cible, sauvegardes }), null);
});
