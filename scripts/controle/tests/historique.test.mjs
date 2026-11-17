// Anonymat de tout le dépôt (étape 60) et de son historique git (npm run controle:historique), sur un dépôt git
// temporaire et des journaux inventés : aucun vrai nom ici. Avant, l'étape 60 ne cherchait les porteurs, l'escadron et
// les autres joueurs que dans les fichiers du banc, et le reste du dépôt pour le FID seulement : un vrai porteur dans
// un test passait au vert.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { leaks, Secrets } from '../anonymat/anonymiser.mjs';
import { auteursDuDepot, estFixture, fichiersDuDepot, fouiller, fouillerDepot, fouillerHistorique, INATTEIGNABLE, parFichier, reglesDepot } from '../anonymat/depot.mjs';
import { rapportHistorique } from '../historique.mjs';

// git du test isolé des réglages du PC (signature, crochets, nom d'auteur) : seuls ceux donnés ici comptent
const vide = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'elite-git-conf-')), 'gitconfig');
fs.writeFileSync(vide, '');
process.env.GIT_CONFIG_GLOBAL = vide;
process.env.GIT_CONFIG_NOSYSTEM = '1';
after(() => fs.rmSync(path.dirname(vide), { recursive: true, force: true }));

const JOURNAL = [
  { event: 'Commander', FID: 'F7654321', Name: 'Zorglub' },
  { event: 'LoadGame', FID: 'F7654321', Commander: 'Zorglub', ShipName: 'Bécane', ShipIdent: 'ZG-01' },
  { event: 'SquadronStartup', SquadronID: 86420, SquadronName: 'Les Zorgs' },
  { event: 'CarrierStats', CarrierID: 3700999001, Callsign: 'ZZZ-999', Name: 'BIDULE' },
  { event: 'WingAdd', Name: 'Bob Ami' },
  { event: 'Interdicted', Interdictor: 'Pirate Humain', IsPlayer: true },
  { event: 'SuitLoadout', LoadoutName: 'Exobiologie' },
];
const VALEURS = ['zorglub', 'f7654321', 'bécane', 'zg-01', '86420', 'les zorgs', '3700999001', 'zzz-999', 'bidule', 'bob ami', 'pirate humain'];

function geler() {
  const s = new Secrets();
  for (const e of JOURNAL) s.collect(e);
  return s.finish();
}

function depot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-anonymat-git-'));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q');
  const ecrire = (rel, texte) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), texte);
  };
  const commit = (message) => {
    git('add', '-A');
    git('-c', 'user.name=Zorglub', '-c', 'user.email=zorglub@example.invalid', 'commit', '-q', '-m', message);
    return git('rev-parse', '--short=7', 'HEAD').trim();
  };
  return { dir, git, ecrire, commit, fin: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const PIEGE = {
  'src/porteur.test.js': "const stats = { Name: 'BIDULE', Callsign: 'ZZZ-999', CarrierID: 3700999001 };\n",
  'src/escadron.js': '// escadron n° 86420, « Les Zorgs »\nexport const x = 1;\n',
  'src/groupe.js': '// Groupes vus : Open, Solo et « Bob Ami »\n',
  'server/src/m/fixtures/seance.json': '{"cmdr":"Zorglubien"}\n',
  'README.md': 'Application de Zorglub (son pseudo d’auteur). Tenue « Exobiologie ». Système Zorglubia.\n',
};
const PROPRE = {
  'src/porteur.test.js': "const stats = { Name: 'PORTEUR 1', Callsign: 'TST-001', CarrierID: 3700000001 };\n",
  'src/escadron.js': '// escadron n° 1, « Escadron Test »\nexport const x = 1;\n',
  'src/groupe.js': '// Groupes vus : Open, Solo et un groupe privé\n',
  'server/src/m/fixtures/seance.json': '{"cmdr":"Testeur"}\n',
};

test('dépôt : porteur, escadron et son numéro, ami hors des fixtures trouvés ; l’ancienne règle (FID seul) ne voyait rien', () => {
  const r = depot();
  try {
    for (const [rel, texte] of Object.entries(PIEGE)) r.ecrire(rel, texte);
    r.commit('Premier commit');
    const regles = reglesDepot(geler(), { auteurs: auteursDuDepot(r.dir) });
    assert.deepEqual(regles.toleres, ['zorglub'], 'le commandant est aussi l’auteur des commits');
    const { fichiers, fixtures, trouves } = fouillerDepot(r.dir, regles);
    assert.equal(fichiers, 5);
    assert.equal(fixtures, 1);
    assert.deepEqual(parFichier(trouves).sort(), [
      'server/src/m/fixtures/seance.json:1 : nom du commandant',
      'src/escadron.js:1 : nom de l’escadron, numéro de l’escadron',
      'src/groupe.js:1 : ami ou coéquipier',
      'src/porteur.test.js:1 : identifiant de porteur, indicatif de porteur, nom de porteur',
    ]);
    // Ce que l'ancienne étape cherchait hors des fixtures : le FID seul. Elle passait donc au vert.
    const fids = geler().strict.filter((s) => /^f\d+$/.test(s));
    for (const rel of ['src/porteur.test.js', 'src/escadron.js', 'src/groupe.js']) assert.deepEqual(leaks(PIEGE[rel], fids), [], rel);
    // Jamais une valeur dans le rapport
    const rapport = parFichier(trouves).join('\n').toLowerCase();
    for (const v of VALEURS) assert.ok(!rapport.includes(v), v);
  } finally {
    r.fin();
  }
});

test('dépôt : nom du commandant toléré hors fixtures seulement s’il est l’auteur des commits ; FID interdit même dans un mot', () => {
  const regles = reglesDepot(geler(), { auteurs: [] });
  assert.deepEqual(regles.toleres, []);
  assert.deepEqual(fouiller('Application de Zorglub.', regles), [{ ligne: 1, sortes: ['nom du commandant'] }]);
  assert.deepEqual(fouiller('Système Zorglubia', regles), [], 'hors fixtures : mot entier seulement');
  assert.deepEqual(fouiller('Système Zorglubia', regles, { fixture: true }), [{ ligne: 1, sortes: ['nom du commandant'] }]);
  const auteur = reglesDepot(geler(), { auteurs: ['ZORGLUB'] });
  assert.deepEqual(fouiller('Application de Zorglub.', auteur), []);
  assert.deepEqual(fouiller('x\nid=xF7654321y', auteur), [{ ligne: 2, sortes: ['FID'] }]);
  assert.deepEqual(fouiller('Vaisseau « Bécane » (ZG-01)', auteur), [{ ligne: 1, sortes: ['identifiant de vaisseau', 'nom de vaisseau'] }]);
  assert.deepEqual(fouiller('Tenue « Exobiologie »', auteur), [], 'les noms de tenues sont des mots courants : pas cherchés');
  assert.ok(estFixture('scripts/controle/seances/a/journal.log') && estFixture('client/src/x/__golden__/y.json'));
  assert.ok(!estFixture('server/src/modules/carrier/carrier.test.js'));
});

test('historique : les anciennes versions et les messages de commit sont fouillés ; rapport sans aucune valeur', () => {
  const r = depot();
  try {
    for (const [rel, texte] of Object.entries(PIEGE)) r.ecrire(rel, texte);
    const avant = r.commit('Ajout, testé avec Bob Ami');
    for (const [rel, texte] of Object.entries(PROPRE)) r.ecrire(rel, texte);
    const apres = r.commit('Valeurs fictives');
    const regles = reglesDepot(geler(), { auteurs: auteursDuDepot(r.dir) });
    assert.deepEqual(fouillerDepot(r.dir, regles).trouves, [], 'les fichiers actuels sont propres');
    const h = fouillerHistorique(r.dir, regles);
    assert.equal(h.versions, 9);
    const vus = new Map(h.trouves.map((t) => [t.chemin, t]));
    assert.deepEqual([...vus.keys()].sort(), ['server/src/m/fixtures/seance.json', 'src/escadron.js', 'src/groupe.js', 'src/porteur.test.js']);
    assert.deepEqual(vus.get('src/porteur.test.js').commits, [avant, apres], 'apparue, puis remplacée');
    assert.deepEqual(vus.get('src/porteur.test.js').sortes, ['identifiant de porteur', 'indicatif de porteur', 'nom de porteur']);
    assert.deepEqual(h.messages, [{ commit: avant, sortes: ['ami ou coéquipier'] }]);
    const { texte, propre } = rapportHistorique(h, { toleres: regles.toleres.length });
    assert.equal(propre, false);
    assert.match(texte, /4 version\(s\) de fichier sur 9, et 1 message\(s\) de commit/);
    for (const v of VALEURS) assert.ok(!texte.toLowerCase().includes(v), v);
  } finally {
    r.fin();
  }
});

test('historique propre : rapport « propre » ; sans git, le dépôt se parcourt quand même', () => {
  const r = depot();
  try {
    for (const [rel, texte] of Object.entries(PROPRE)) r.ecrire(rel, texte);
    r.commit('Valeurs fictives');
    const regles = reglesDepot(geler(), { auteurs: auteursDuDepot(r.dir) });
    const { texte, propre } = rapportHistorique(fouillerHistorique(r.dir, regles));
    assert.equal(propre, true);
    assert.match(texte, /Historique git propre : 4 versions/);
    fs.rmSync(path.join(r.dir, '.git'), { recursive: true, force: true });
    r.ecrire('src/nouveau.js', "// 'BIDULE'\n");
    assert.equal(fichiersDuDepot(r.dir).length, 5);
    assert.deepEqual(parFichier(fouillerDepot(r.dir, regles).trouves), ['src/nouveau.js:1 : nom de porteur']);
  } finally {
    r.fin();
  }
});

test('historique : un stash abandonné (objet inatteignable) est fouillé aussi', () => {
  const r = depot();
  try {
    for (const [rel, texte] of Object.entries(PROPRE)) r.ecrire(rel, texte);
    r.commit('Valeurs fictives');
    r.ecrire('src/porteur.test.js', PIEGE['src/porteur.test.js']);
    r.git('-c', 'user.name=Zorglub', '-c', 'user.email=zorglub@example.invalid', 'stash', '-q');
    r.git('stash', 'drop', '-q'); // plus aucune référence ni reflog : seul git fsck --unreachable le voit encore
    const regles = reglesDepot(geler(), { auteurs: auteursDuDepot(r.dir) });
    const h = fouillerHistorique(r.dir, regles);
    const t = h.trouves.find((x) => x.chemin.includes(INATTEIGNABLE));
    assert.ok(t, `trouvé : ${h.trouves.map((x) => x.chemin).join(' | ') || 'rien'}`);
    assert.deepEqual(t.sortes, ['identifiant de porteur', 'indicatif de porteur', 'nom de porteur']);
  } finally {
    r.fin();
  }
});
