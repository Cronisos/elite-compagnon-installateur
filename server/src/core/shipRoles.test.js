// Rôles des vaisseaux : stockage (écriture atomique, fichier illisible mis de côté), validation stricte, vaisseaux vendus.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkRoleBody, MAX_SHIP_ID, parseShipId, shipType, ShipRoles } from './shipRoles.js';
import { readJsonOrSetAside, writeJsonAtomic } from './jsonFile.js';

function dossier(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-roles-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}

function store(t, { contenu, now = Date.parse('2026-11-08T10:00:00Z') } = {}) {
  const d = dossier(t);
  const file = path.join(d, 'ship-roles.json');
  if (contenu !== undefined) fs.writeFileSync(file, typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
  const warnings = [];
  const roles = new ShipRoles({ file, warn: (m) => warnings.push(m), now: () => now }).load();
  return { roles, file, d, warnings };
}

test('ShipID : entier de 0 à MAX_SHIP_ID, écrit sans fioriture ; une combinaison à pied est refusée', () => {
  for (const [v, attendu] of [[0, 0], ['0', 0], [43, 43], ['43', 43], [MAX_SHIP_ID, MAX_SHIP_ID], [String(MAX_SHIP_ID), MAX_SHIP_ID]]) assert.equal(parseShipId(v), attendu, String(v));
  for (const v of [-1, '-1', 1.5, '1.5', '043', ' 43', '43 ', '4e1', '0x2b', '', null, undefined, NaN, Infinity, MAX_SHIP_ID + 1, 4293000002, '4293000002', '__proto__', [43], { 43: 1 }, true]) {
    assert.equal(parseShipId(v), null, JSON.stringify(v));
  }
  assert.equal(shipType('LakonMiner'), 'lakonminer');
  assert.equal(shipType('Federation_Corvette'), 'federation_corvette');
  assert.equal(shipType('<script>'), null);
  assert.equal(shipType(3), null);
});

test('corps d’écriture : primary obligatoire, aucun autre champ', () => {
  assert.equal(checkRoleBody({ primary: 'combat', secondary: [] }).ok, true);
  assert.equal(checkRoleBody({ primary: null }).ok, true, 'primary: null efface');
  assert.match(checkRoleBody({}).error, /Rôle principal manquant/);
  assert.match(checkRoleBody({ secondary: ['combat'] }).error, /Rôle principal manquant/);
  assert.match(checkRoleBody({ primary: 'combat', type: 'cutter' }).error, /Champ inconnu : « type »/);
  assert.match(checkRoleBody(JSON.parse('{"primary":"combat","__proto__":{"x":1}}')).error, /Champ inconnu : « __proto__ »/);
  assert.match(checkRoleBody(null).error, /Rôle illisible/);
  assert.match(checkRoleBody([]).error, /Rôle illisible/);
  assert.match(checkRoleBody({ primary: 'combat', secondary: ['combat'] }).error, /déjà le rôle principal/);
});

test('écriture atomique : fichier complet, aucun fichier temporaire laissé, relu tel quel', (t) => {
  const { roles, file, d } = store(t);
  assert.deepEqual(roles.view(), {});
  roles.set(43, { primary: 'waypoints', secondary: ['shipmining'] }, { type: 'LakonMiner' });
  roles.set(9, { primary: 'combat', secondary: [] }, { type: 'anaconda' });
  assert.deepEqual(fs.readdirSync(d), ['ship-roles.json']);
  const disque = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(disque, {
    version: 2,
    ships: {
      9: { primary: 'combat', secondary: [], type: 'anaconda', at: '2026-11-08T10:00:00.000Z' },
      43: { primary: 'waypoints', secondary: ['shipmining'], type: 'lakonminer', at: '2026-11-08T10:00:00.000Z' },
    },
    commanders: {},
  });
  const relu = new ShipRoles({ file, warn: () => assert.fail('aucun avertissement') }).load();
  assert.deepEqual(relu.view(), { 9: { primary: 'combat', secondary: [] }, 43: { primary: 'waypoints', secondary: ['shipmining'] } });
  // Rôle vide : le vaisseau disparaît du fichier
  assert.equal(roles.set(9, { primary: null, secondary: [] }), null);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).ships), ['43']);
  assert.equal(roles.remove(43), true);
  assert.equal(roles.remove(43), false);
  // Le modèle déjà connu reste quand on change le rôle sans le redonner
  roles.set(5, { primary: 'rescue', secondary: [] }, { type: 'panthermkii' });
  roles.set(5, { primary: 'combat', secondary: [] });
  assert.equal(roles.get(5).type, 'panthermkii');
});

test('écriture impossible : erreur, et rien de changé en mémoire', (t) => {
  const { roles, d } = store(t);
  roles.set(1, { primary: 'combat', secondary: [] });
  const bloque = path.join(d, 'pas-un-dossier');
  fs.writeFileSync(bloque, 'x');
  roles.file = path.join(bloque, 'ship-roles.json'); // le dossier est un fichier : l'écriture échoue
  assert.throws(() => roles.set(2, { primary: 'rescue', secondary: [] }));
  assert.throws(() => roles.remove(1));
  assert.deepEqual(roles.view(), { 1: { primary: 'combat', secondary: [] } });
  assert.throws(() => roles.set(3, { primary: 'inconnu', secondary: [] }), /Rôle principal inconnu/);
  assert.throws(() => roles.set(-3, { primary: 'combat', secondary: [] }), /Vaisseau invalide/);
});

test('fichier illisible : copie mise de côté, départ à vide, avertissement', (t) => {
  for (const contenu of ['{ pas du json', '[]', '"texte"', 'null', JSON.stringify({ version: 3, ships: {} }), JSON.stringify({ version: 1, ships: [] }), JSON.stringify({ version: 2, ships: {}, commanders: [] }), JSON.stringify({ version: 1, ships: {}, commanders: {} }), JSON.stringify({ ships: {} })]) {
    const { roles, d, warnings } = store(t, { contenu });
    assert.deepEqual(roles.view(), {}, contenu);
    const fichiers = fs.readdirSync(d);
    assert.equal(fichiers.length, 1, contenu);
    assert.match(fichiers[0], /^ship-roles\.json\.illisible-2026-11-08T10-00-00-000Z$/);
    assert.equal(fs.readFileSync(path.join(d, fichiers[0]), 'utf8'), contenu, 'contenu gardé tel quel');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Rôles des vaisseaux : fichier illisible, mis de côté sous .*départ à vide/);
    // Et l'app repart : un rôle s'enregistre de nouveau
    roles.set(43, { primary: 'waypoints', secondary: [] });
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(d, 'ship-roles.json'), 'utf8')).ships), ['43']);
  }
});

test('entrées douteuses : écartées une à une, avec un avertissement ; aucune clé de prototype', (t) => {
  const contenu = `{"version":1,"ships":{
    "__proto__":{"primary":"combat","secondary":[]},
    "constructor":{"primary":"combat","secondary":[]},
    "043":{"primary":"combat","secondary":[]},
    "4293000002":{"primary":"combat","secondary":[]},
    "-1":{"primary":"combat","secondary":[]},
    "7":"combat",
    "8":{"primary":"retire-de-l-app","secondary":["rescue","inconnu","rescue","polyvalent"]},
    "9":{"primary":"polyvalent","secondary":["combat"]},
    "10":{"primary":"combat","secondary":["combat","rescue"],"type":"Cutter","at":"pas une date"},
    "11":{"primary":null,"secondary":["inconnu"]},
    "12":{"primary":null,"secondary":["combat","rescue","materials","routes"]}
  }}`;
  const { roles, warnings } = store(t, { contenu });
  assert.deepEqual(roles.view(), {
    8: { primary: null, secondary: ['rescue'] },
    9: { primary: 'polyvalent', secondary: [] },
    10: { primary: 'combat', secondary: ['rescue'] },
    12: { primary: null, secondary: ['combat', 'rescue', 'materials'] },
  });
  assert.equal(roles.get(10).type, 'cutter');
  assert.equal(roles.get(10).at, null);
  assert.equal(Object.getPrototypeOf(roles.view()), Object.prototype);
  assert.equal(roles.get(0), null);
  assert.ok(warnings.some((w) => /entrée « __proto__ » ignorée/.test(w)));
  assert.ok(warnings.some((w) => /entrée « constructor » ignorée/.test(w)));
  assert.ok(warnings.some((w) => /entrée « 4293000002 » ignorée/.test(w)));
  assert.ok(warnings.some((w) => /vaisseau 8, rôle principal inconnu retiré/.test(w)));
  assert.ok(warnings.some((w) => /vaisseau 11/.test(w)), 'vaisseau 11 : plus aucun rôle, écarté');
  assert.ok(warnings.some((w) => /vaisseau 12, rôles secondaires au-delà de 3 retirés/.test(w)));
});

test('vaisseau vendu : rôle effacé si donné avant la vente, gardé si donné après (numéro réutilisé) ; autre modèle : inoffensif', (t) => {
  const { roles } = store(t, { now: Date.parse('2026-11-08T10:00:00Z') });
  roles.set(30, { primary: 'rescue', secondary: [] }, { type: 'panthermkii' });
  assert.equal(roles.soldAt(30, '2026-11-09T08:00:00Z'), true, 'vente après le choix : effacé');
  assert.equal(roles.get(30), null);
  roles.set(30, { primary: 'combat', secondary: [] }, { type: 'mandalay' });
  assert.equal(roles.soldAt(30, '2026-10-24T08:32:37Z'), false, 'vente relue, faite avant le choix : le rôle vise le nouveau vaisseau');
  assert.equal(roles.get(30).primary, 'combat');
  assert.equal(roles.soldAt(77, '2026-11-09T08:00:00Z'), false);
  // Le numéro 30 porte un autre modèle que celui qui avait le rôle : il ne s'applique pas
  assert.equal(roles.roleFor(30, 'mandalay').primary, 'combat');
  assert.equal(roles.roleFor(30, 'panthermkii'), null);
  assert.equal(roles.roleFor(30, null).primary, 'combat', 'modèle inconnu : on ne peut pas dire, le rôle vaut');
});

test('aide JSON du cœur : absent, lisible, refusé, illisible', (t) => {
  const d = dossier(t);
  const f = path.join(d, 'x.json');
  assert.deepEqual(readJsonOrSetAside(f), { data: null, status: 'absent' });
  writeJsonAtomic(f, { a: 1 });
  assert.deepEqual(readJsonOrSetAside(f), { data: { a: 1 }, status: 'ok' });
  const warn = [];
  const r = readJsonOrSetAside(f, { accept: (x) => x.a === 2, warn: (m) => warn.push(m), label: 'Essai', now: 0 });
  assert.equal(r.status, 'illisible');
  assert.equal(path.basename(r.aside), 'x.json.illisible-1970-01-01T00-00-00-000Z');
  assert.equal(fs.existsSync(f), false);
  assert.match(warn[0], /^Essai : fichier illisible/);
  // Écriture dans un sous-dossier qui n'existe pas encore
  writeJsonAtomic(path.join(d, 'sous', 'y.json'), [1]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, 'sous', 'y.json'), 'utf8')), [1]);
});

/** fs.<nom> échoue (code `code`) pour `file`, `fois` fois, puis remarche ; rend la fonction qui remet l'original. */
function panne(nom, file, code, fois = 1) {
  const vrai = fs[nom];
  let reste = fois;
  fs[nom] = (f, ...args) => {
    if (reste > 0 && path.resolve(String(f)) === path.resolve(file)) {
      reste -= 1;
      throw Object.assign(new Error(`${code}: simulé, ${nom}`), { code });
    }
    return vrai.call(fs, f, ...args);
  };
  return () => {
    fs[nom] = vrai;
  };
}

const TROIS = { version: 1, ships: { 3: { primary: 'combat', secondary: [] }, 7: { primary: 'rescue', secondary: [] }, 9: { primary: 'waypoints', secondary: [] } } };

test('fichier là mais pas relu au démarrage (verrouillé : EBUSY) : rien n’est écrasé ; nouvel essai à la première écriture', (t) => {
  const d = dossier(t);
  const file = path.join(d, 'ship-roles.json');
  fs.writeFileSync(file, JSON.stringify(TROIS));
  const warnings = [];
  let remettre = panne('readFileSync', file, 'EBUSY');
  const roles = new ShipRoles({ file, warn: (m) => warnings.push(m) }).load();
  remettre();
  assert.deepEqual(roles.view(), {});
  assert.ok(warnings.some((w) => /non lu \(EBUSY/.test(w)));
  assert.ok(warnings.some((w) => /aucune écriture tant que/.test(w)));
  // Le verrou est levé : la première écriture relit d'abord le fichier, puis ajoute le rôle aux autres
  roles.set(12, { primary: 'combat', secondary: [] });
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).ships), ['3', '7', '9', '12']);
  assert.deepEqual(Object.keys(roles.view()), ['3', '7', '9', '12']);
  // Toujours verrouillé : écriture refusée avec une raison lisible, fichier intact, rien de changé en mémoire
  remettre = panne('readFileSync', file, 'EBUSY');
  const r2 = new ShipRoles({ file, warn: () => {} }).load();
  remettre();
  remettre = panne('readFileSync', file, 'EBUSY', 5);
  try {
    assert.throws(() => r2.set(5, { primary: 'rescue', secondary: [] }), (err) => err.unread === true && /pas pu être relu.*rien n'est écrit/.test(err.message));
    assert.throws(() => r2.remove(3), (err) => err.unread === true, 'une vente vue en direct ne peut pas non plus écraser le fichier');
    assert.throws(() => r2.soldAt(3, '2026-11-09T08:00:00Z'), (err) => err.unread === true);
  } finally {
    remettre();
  }
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).ships), ['3', '7', '9', '12']);
  assert.deepEqual(r2.view(), {});
  assert.deepEqual(fs.readdirSync(d), ['ship-roles.json'], 'aucun fichier temporaire laissé');
});

test('fichier illisible qui ne peut pas être renommé (EPERM) : copié à côté ; ni renommé ni copié : rien n’est écrit par-dessus', (t) => {
  // Renommage refusé : une copie le garde, l'app repart à vide et peut écrire
  let { d, file, contenu } = (() => {
    const dd = dossier(t);
    const f = path.join(dd, 'ship-roles.json');
    fs.writeFileSync(f, '{ cassé');
    return { d: dd, file: f, contenu: '{ cassé' };
  })();
  let warnings = [];
  let remettre = panne('renameSync', file, 'EPERM');
  let roles = new ShipRoles({ file, warn: (m) => warnings.push(m), now: () => Date.parse('2026-11-08T10:00:00Z') }).load();
  remettre();
  assert.ok(warnings.some((w) => /fichier illisible, copié sous .*illisible-2026-11-08T10-00-00-000Z \(renommage refusé : EPERM/.test(w)), warnings.join(' | '));
  roles.set(5, { primary: 'combat', secondary: [] });
  assert.deepEqual(fs.readdirSync(d).sort(), ['ship-roles.json', 'ship-roles.json.illisible-2026-11-08T10-00-00-000Z']);
  assert.equal(fs.readFileSync(path.join(d, 'ship-roles.json.illisible-2026-11-08T10-00-00-000Z'), 'utf8'), contenu, 'la copie garde le fichier tel quel');
  // Ni renommage ni copie : la seule copie du fichier n'est jamais remplacée
  ({ d, file } = (() => {
    const dd = dossier(t);
    const f = path.join(dd, 'ship-roles.json');
    fs.writeFileSync(f, '{ cassé');
    return { d: dd, file: f };
  })());
  warnings = [];
  // Tout renommage dans ce dossier refusé : ni la mise de côté, ni la copie (écrite par core/atomic.js : temporaire puis
  // renommage) ne passent
  const vraiRename = fs.renameSync;
  fs.renameSync = (src, ...args) => {
    if (path.dirname(path.resolve(String(src))) === path.resolve(d)) throw Object.assign(new Error('EPERM: simulé, renameSync'), { code: 'EPERM' });
    return vraiRename.call(fs, src, ...args);
  };
  const remettreRename = () => {
    fs.renameSync = vraiRename;
  };
  remettre = () => {};
  try {
    roles = new ShipRoles({ file, warn: (m) => warnings.push(m) }).load();
    assert.ok(warnings.some((w) => /ni renommé ni copié/.test(w)));
    assert.throws(() => roles.set(5, { primary: 'combat', secondary: [] }), (err) => err.unread === true && /illisible/.test(err.message));
    assert.equal(fs.readFileSync(file, 'utf8'), '{ cassé', 'fichier intact');
  } finally {
    remettreRename();
    remettre();
  }
  // Le renommage remarche : la première écriture met le fichier de côté puis écrit
  roles.set(5, { primary: 'combat', secondary: [] });
  const fichiers = fs.readdirSync(d).sort();
  assert.equal(fichiers.length, 2);
  assert.match(fichiers[1], /^ship-roles\.json\.illisible-/);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).ships), ['5']);
});

// --- Constats de la revue du 9 nov. : chaque test échouait avant sa correction ---

test('entrée faite d’un objet que String() ne sait pas écrire ({"toString":0}) : écartée avec un avertissement, sans arrêter le serveur', (t) => {
  // String(valeur) dans l'avertissement levait « Cannot convert object to primitive value », et load() (appelé au
  // démarrage du serveur, hors de tout try) arrêtait le serveur à chaque lancement
  const contenu = `{"version":1,"ships":{
    "3":{"primary":{"toString":0}},
    "4":{"primary":"combat","secondary":[{"valueOf":1,"toString":2},"rescue"]},
    "5":{"primary":{"valueOf":{},"toString":null},"secondary":["materials"]},
    "6":{"primary":"rescue","secondary":[]}
  }}`;
  const { roles, warnings, d } = store(t, { contenu });
  assert.deepEqual(roles.view(), {
    4: { primary: 'combat', secondary: ['rescue'] },
    5: { primary: null, secondary: ['materials'] },
    6: { primary: 'rescue', secondary: [] },
  });
  assert.ok(warnings.some((w) => /vaisseau 3, rôle principal inconnu retiré \(object\)/.test(w)), warnings.join(' | '));
  assert.ok(warnings.some((w) => /vaisseau 4, rôle secondaire retiré \(object\)/.test(w)), warnings.join(' | '));
  assert.ok(warnings.some((w) => /vaisseau 5, rôle principal inconnu retiré \(object\)/.test(w)));
  assert.deepEqual(fs.readdirSync(d), ['ship-roles.json'], 'le fichier lisible reste en place : seules les entrées douteuses sont écartées');
  assert.equal(roles.unread, null, 'les écritures restent permises');
  // Un texte trop long est montré tronqué ; pour le reste, seulement sa sorte
  const { warnings: w2 } = store(t, { contenu: { version: 1, ships: { 7: { primary: 'x'.repeat(80), secondary: [12, true, null, ['a']] } } } });
  assert.ok(w2.some((w) => w.includes(`rôle principal inconnu retiré (« ${'x'.repeat(40)} »)`)), w2.join(' | '));
  assert.ok(w2.some((w) => /rôle secondaire retiré \(number\), rôle secondaire retiré \(boolean\), rôle secondaire retiré \(null\), rôle secondaire retiré \(object\)/.test(w)), w2.join(' | '));
});

test('lecture qui échoue d’une façon imprévue : le serveur démarre quand même ; table vide, rien d’écrit par-dessus le fichier', (t) => {
  const d = dossier(t);
  const file = path.join(d, 'ship-roles.json');
  fs.writeFileSync(file, JSON.stringify(TROIS));
  const warnings = [];
  class Fragile extends ShipRoles {
    readEntries() {
      throw new TypeError('panne imprévue');
    }
  }
  const roles = new Fragile({ file, warn: (m) => warnings.push(m) });
  assert.doesNotThrow(() => roles.load());
  assert.deepEqual(roles.view(), {});
  assert.equal(roles.unread, 'imprevu');
  assert.ok(warnings.some((w) => /Rôles des vaisseaux : .*pas relu \(panne imprévue\)/.test(w)), warnings.join(' | '));
  assert.throws(() => roles.set(5, { primary: 'combat', secondary: [] }), (err) => err.unread === true && /n'a pas pu être relu \(panne imprévue\) ; rien n'est écrit/.test(err.message));
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), TROIS, 'fichier intact');
});

// --- Plusieurs commandants sur le même PC (audit du 15 nov. 2026, M7) : « Testeur » (F0000001) et « Testeur 2 »
// (F0000002) ont chacun un vaisseau n° 1, une Anaconda et une Cobra ---

const UN = 'F0000001';
const DEUX = 'F0000002';

test('deux commandants, même ShipID : chacun son rôle ; la vente de l’un n’efface jamais celui de l’autre', (t) => {
  const { roles, file } = store(t);
  roles.set(1, { primary: 'combat', secondary: [] }, { type: 'anaconda', commander: UN });
  assert.equal(roles.get(1, DEUX), null, 'le n° 1 du second compte n’a pas le rôle de l’Anaconda');
  assert.equal(roles.roleFor(1, 'cobramkiii', DEUX), null);
  assert.equal(roles.roleFor(1, 'anaconda', UN).primary, 'combat');
  assert.equal(roles.get(1), null, 'ni un rôle « sans commandant »');
  roles.set(1, { primary: 'routes', secondary: [] }, { type: 'cobramkiii', commander: DEUX });
  assert.deepEqual(roles.view(UN), { 1: { primary: 'combat', secondary: [] } });
  assert.deepEqual(roles.view(DEUX), { 1: { primary: 'routes', secondary: [] } });
  // Vente du n° 1 par le second compte : seul son rôle part
  assert.equal(roles.soldAt(1, '2026-11-09T08:00:00Z', DEUX), true);
  assert.equal(roles.get(1, DEUX), null);
  assert.equal(roles.get(1, UN).primary, 'combat');
  assert.equal(roles.remove(1, DEUX), false);
  // Fichier : rangé par commandant, relu tel quel
  const disque = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(disque, { version: 2, ships: {}, commanders: { [UN]: { 1: { primary: 'combat', secondary: [], type: 'anaconda', at: '2026-11-08T10:00:00.000Z' } } } });
  const relu = new ShipRoles({ file, warn: () => assert.fail('aucun avertissement') }).load();
  assert.equal(relu.roleFor(1, 'anaconda', UN).primary, 'combat');
  assert.equal(relu.get(1, DEUX), null);
  assert.throws(() => roles.set(1, { primary: 'combat', secondary: [] }, { commander: '../x' }), /Commandant invalide/);
});

test('fichier de la version 1 (sans commandant) : relu, ses rôles ne valent pour aucun commandant tant qu’ils ne sont pas rattachés', (t) => {
  const v1 = { version: 1, ships: { 1: { primary: 'combat', secondary: [], type: 'anaconda', at: '2026-11-01T10:00:00.000Z' }, 7: { primary: 'rescue', secondary: [] } } };
  const { roles, file } = store(t, { contenu: v1 });
  assert.equal(roles.hasUnowned(), true);
  assert.deepEqual(Object.keys(roles.view()), ['1', '7'], 'gardés « sans commandant »');
  assert.equal(roles.get(1, UN), null, 'appliqués à aucun commandant connu');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), v1, 'rien n’est réécrit à la lecture');
  // Le compte principal avait déjà donné un rôle au n° 7 : le sien passe avant
  roles.set(7, { primary: 'materials', secondary: [] }, { commander: UN });
  assert.equal(roles.adopt(UN), 1);
  assert.equal(roles.hasUnowned(), false);
  assert.deepEqual(roles.view(UN), { 1: { primary: 'combat', secondary: [] }, 7: { primary: 'materials', secondary: [] } });
  assert.equal(roles.get(1, UN).guessed, true, 'rattaché d’office');
  assert.equal(roles.get(7, UN).guessed, undefined, 'donné par lui');
  assert.deepEqual(roles.view(DEUX), {}, 'rien pour le second compte');
  const disque = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(disque.version, 2);
  assert.deepEqual(disque.ships, {});
  assert.equal(disque.commanders[UN][1].guessed, true);
  assert.equal(roles.adopt(DEUX), 0, 'plus rien à rattacher');
  // Rôle redonné : plus « rattaché d’office »
  roles.set(1, { primary: 'combat', secondary: [] }, { commander: UN });
  assert.equal(roles.get(1, UN).guessed, undefined);
  assert.equal(roles.get(1, UN).type, 'anaconda', 'le modèle connu reste');
});
