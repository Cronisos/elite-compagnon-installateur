// Paquet de l'app pour l'escadron (scripts/paquet.mjs) : seuls les fichiers distribués partent, jamais server/data,
// .git, node_modules ni *.log, et le dossier fabriqué est revérifié lui-même.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fichiersDistribues } from '../../distribution.mjs';
import { fabriquer, fichiersDuPaquet, lireOptions, reverifier, versionPaquet } from '../../paquet.mjs';
import version from '../../../desktop/version.js';

const ecrire = (racine, rel, contenu = 'x') => {
  fs.mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
  fs.writeFileSync(path.join(racine, rel), contenu);
};
const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=Testeur', '-c', 'user.email=testeur@example.invalid', ...args], { cwd, encoding: 'utf8' });

test('paquet : un dossier propre, revérifié, que l’app sait vérifier', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-paquet-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const depot = path.join(tmp, 'depot');
  // Un dossier de travail comme celui du développeur : ses données, ses journaux, ses paquets installés
  ecrire(depot, '.gitignore', 'node_modules/\nserver/data/*\n!server/data/.gitkeep\n*.log\n/paquet/\n');
  ecrire(depot, 'server/data/.gitkeep', '');
  ecrire(depot, 'server/data/elite.db', 'base de Testeur');
  ecrire(depot, 'server/data/escadron-jeton.json', '{"token":"x"}');
  ecrire(depot, 'server/src/index.js', 'console.log(1)');
  ecrire(depot, 'node_modules/a/index.js', '');
  ecrire(depot, 'bureau.log', 'journal');
  ecrire(depot, 'README.md', 'lis-moi');
  ecrire(depot, 'CLAUDE.md — notes.md', 'notes de développement');
  ecrire(depot, 'Vector Ships by Qohen Leth_2025/gros.pdf', 'pdf');
  ecrire(depot, 'nouveau.js', 'pas encore commité');
  assert.equal(git(depot, 'init', '-q').status, 0);
  git(depot, 'add', '.gitignore', 'server', 'README.md', 'CLAUDE.md — notes.md', 'Vector Ships by Qohen Leth_2025');
  git(depot, 'commit', '-q', '-m', 'départ');

  const fichiers = fichiersDuPaquet(fichiersDistribues(depot));
  assert.deepEqual(fichiers, ['.gitignore', 'README.md', 'nouveau.js', 'server/data/.gitkeep', 'server/src/index.js']);
  const infos = versionPaquet({ racine: depot, now: new Date('2026-11-15T12:00:00Z') });
  assert.match(infos.version, /^2026\.11\.15-[0-9a-f]{7,}-modifie$/, 'nouveau.js pas commité');

  const sortie = path.join(depot, 'paquet', `Elite Compagnon ${infos.version}`);
  const paquet = fabriquer({ racine: depot, fichiers, sortie, infos });
  assert.equal(paquet.empreinte, version.empreinteManifeste(paquet.fichiers));
  assert.ok(!fs.existsSync(path.join(sortie, '.git')));
  assert.ok(!fs.existsSync(path.join(sortie, 'server', 'data', 'elite.db')));
  assert.ok(!fs.existsSync(path.join(sortie, 'node_modules')));
  assert.deepEqual(reverifier(sortie), [], 'le dossier fabriqué passe le contrôle tel quel');
  assert.throws(() => fabriquer({ racine: depot, fichiers, sortie, infos }), /dossier neuf/);
  assert.equal(fichiersDuPaquet(fichiersDistribues(depot)).some((f) => f.startsWith('paquet/')), false, 'le paquet fabriqué ne part jamais dans le suivant');

  // L'app installée depuis ce paquet le reconnaît (Paramètres → Mon compte)
  const v = await version.verifierPaquet(sortie);
  assert.equal(v.conforme, true);
  assert.equal(v.version, infos.version);

  // Une donnée glissée dans le dossier fabriqué : le contrôle la voit (sans git)
  ecrire(sortie, 'server/data/escadron-jeton.json', '{"token":"x"}');
  ecrire(sortie, 'serveur.log', 'journal');
  const problemes = reverifier(sortie);
  assert.ok(problemes.some((p) => p.startsWith('server/data/escadron-jeton.json')), problemes.join('\n'));
  assert.ok(problemes.some((p) => p.startsWith('serveur.log')), problemes.join('\n'));
});

test('paquet : options connues seulement, --help n’en fabrique aucun', () => {
  assert.deepEqual(lireOptions([]), { aide: false, sortie: null, sansZip: false, remplacer: false });
  assert.deepEqual(lireOptions(['--sortie', 'D:/partage', '--sans-zip', '--remplacer']), { aide: false, sortie: 'D:/partage', sansZip: true, remplacer: true });
  assert.equal(lireOptions(['--help']).aide, true);
  assert.equal(lireOptions(['-h']).aide, true);
  // Fautes de frappe : refusées avant de rien fabriquer
  assert.throws(() => lireOptions(['--sans-zipp']), /option inconnue : --sans-zipp/);
  assert.throws(() => lireOptions(['--sorti', 'D:/partage']), /option inconnue : --sorti/);
  assert.throws(() => lireOptions(['D:/partage']), /option inconnue/);
  assert.throws(() => lireOptions(['--sortie']), /--sortie attend un dossier/);
  assert.throws(() => lireOptions(['--sortie', '--sans-zip']), /--sortie attend un dossier/);
});

test('paquet : --help affiche l’aide et rend 0 sans rien fabriquer', () => {
  const script = path.resolve(import.meta.dirname, '..', '..', 'paquet.mjs');
  const r = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--sortie <dossier>/);
  assert.doesNotMatch(r.stdout, /Paquet .* fichiers dans/);
  const faute = spawnSync(process.execPath, [script, '--sans-zipp'], { encoding: 'utf8' });
  assert.equal(faute.status, 1);
  assert.match(faute.stderr, /option inconnue : --sans-zipp/);
});

test('paquet : les journaux d’exemple des tests partent, les autres journaux jamais', () => {
  const fichiers = fichiersDuPaquet([
    'server/src/modules/routes/tests/fixtures/port-test.log',
    'scripts/controle/seances/seance-test/Journal.2026-11-01T100000.01.log',
    'scripts/controle/options/Bindings/BindingLoadingErrors.log',
    'bureau.log',
    'bureau.1.log',
    'server/fsd-status.log',
    'server/src/modules/routes/tests/fixtures/sous/autre.log',
    'scripts/controle/autre.log',
    'server/src/index.js',
  ]);
  assert.deepEqual(fichiers, [
    'scripts/controle/options/Bindings/BindingLoadingErrors.log',
    'scripts/controle/seances/seance-test/Journal.2026-11-01T100000.01.log',
    'server/src/index.js',
    'server/src/modules/routes/tests/fixtures/port-test.log',
  ]);
});
