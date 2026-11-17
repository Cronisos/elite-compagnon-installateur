// Partage du rapport dans Discord (partage.js) : demande de la page, page de capture, presse-papiers.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DUREE_GIF, IMAGES_GIF, DELAI_GIF, demandeRapport, adresseCapture, fichierGif, commandePressePapiers, powershell } = require('./partage.js');

test('partage : la boucle du GIF dure 2,4 s, celle du vaisseau, et la flamme (0,6 s) y tombe juste', () => {
  assert.equal(DUREE_GIF, 2.4);
  assert.equal((IMAGES_GIF * DELAI_GIF) % 60, 0);
});

test('partage : seule une route et une semaine passent, jamais autre chose', () => {
  assert.deepEqual(demandeRapport({ projet: 'all', semaine: null }), { projet: 'all', semaine: null });
  assert.deepEqual(demandeRapport({ projet: '12', semaine: 1762995600000 }), { projet: '12', semaine: 1762995600000 });
  assert.deepEqual(demandeRapport({}), { projet: 'all', semaine: null });
  for (const projet of ['0', '-1', '1e3', '../x', 'all ', '12345678901', 'C:\\x']) assert.equal(demandeRapport({ projet }), null, projet);
  for (const semaine of [-5, 1.5, 'abc', 1e15, Infinity]) assert.equal(demandeRapport({ projet: 'all', semaine }), null, String(semaine));
  assert.equal(adresseCapture('http://127.0.0.1:5173', { projet: '3', semaine: null }), 'http://127.0.0.1:5173/capture/rapport-semaine?projet=3');
  assert.equal(adresseCapture('http://127.0.0.1:5173', { projet: 'all', semaine: 42 }), 'http://127.0.0.1:5173/capture/rapport-semaine?projet=all&semaine=42');
});

test('partage : le fichier va au presse-papiers par l’environnement, jamais dans la commande ; chemin relatif ou à saut de ligne refusé', () => {
  const f = fichierGif('C:\\Users\\Test\\AppData\\Roaming\\Elite Compagnon\\donnees');
  assert.match(f, /partage[\\/]rapport-semaine\.gif$/);
  for (const chemin of ["C:\\Users\\L'As\\rapport-semaine.gif", 'C:\\Users\\Testeur D’Essai\\rapport-semaine.gif', 'C:\\Users\\Testeur $(calc)\\r.gif']) {
    const c = commandePressePapiers(chemin, { SystemRoot: 'C:\\Windows', PATH: 'x' });
    assert.equal(c.args.at(-1), 'Set-Clipboard -LiteralPath $env:ELITE_GIF');
    assert.ok(!c.args.join(' ').includes('Users'), 'le chemin n’est jamais dans le texte de la commande');
    assert.equal(c.env.ELITE_GIF, chemin);
    assert.equal(c.env.PATH, 'x', 'le reste de l’environnement est gardé');
  }
  assert.equal(commandePressePapiers('C:\\a.gif', { SystemRoot: 'D:\\Win' }).programme, 'D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(powershell({}), 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'jamais cherché par son seul nom');
  assert.throws(() => commandePressePapiers('rapport.gif'), /impossible/);
  assert.throws(() => commandePressePapiers('C:\\a\nb.gif'), /impossible/);
});
