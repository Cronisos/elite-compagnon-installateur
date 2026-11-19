// Processus de l'app de bureau : prêt, erreur, arrêt avant d'être prêt, journal (processus.js).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { anonymiseur, executer, journal, lancerEnfant, nomProcessus, pidSurPort, quiTientLePort, raisonArret } = require('./processus.js');

const t = fs.mkdtempSync(path.join(os.tmpdir(), 'bureau-proc-'));
const script = (nom, code) => {
  const f = path.join(t, nom);
  fs.writeFileSync(f, code);
  return f;
};

test('prêt, erreur, arrêt avant d’être prêt', async () => {
  const log = journal(path.join(t, 'logs', 'bureau.log'));
  const a = lancerEnfant({ node: process.execPath, script: script('pret.js', "console.log('bonjour'); process.send({ type: 'pret', port: 1 }); setTimeout(() => {}, 100);"), nom: 'a', log });
  assert.equal((await a.pret).port, 1);
  const b = lancerEnfant({ node: process.execPath, script: script('erreur.js', "process.send({ type: 'erreur', message: 'Le port 5173 est déjà pris' }); setTimeout(() => {}, 100);"), nom: 'b', log });
  await assert.rejects(b.pret, /5173 est déjà pris/);
  let sortie = null;
  const plante = "console.error('Error: listen EADDRINUSE: address already in use 127.0.0.1:3001'); process.exit(1);";
  const c = lancerEnfant({ node: process.execPath, script: script('plante.js', plante), nom: 'serveur', log, surSortie: (code) => { sortie = code; } });
  await assert.rejects(c.pret, /Le port 3001 \(serveur\) est déjà pris/);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(sortie, 1);
  await log.attendre();
  const texte = fs.readFileSync(log.fichier, 'utf8');
  assert.match(texte, /\[a\] bonjour/);
  assert.match(texte, /\[serveur\] arrêté \(code 1\)/);
});

test('executer : code 0, ou un message avec la fin de la sortie', async () => {
  await executer({ node: process.execPath, script: script('ok.js', 'process.exit(0)'), nom: 'base' });
  await assert.rejects(executer({ node: process.execPath, script: script('ko.js', "console.error('schéma invalide'); process.exit(2)"), nom: 'base' }), /base s'est arrêté \(code 2\)\.\n\nschéma invalide/);
  assert.match(raisonArret('x', '', null), /code —/);
});

test('raisonArret : Node.js changé depuis l’installation (better-sqlite3) : quoi faire, sans la pile en anglais', () => {
  const pile = [
    "Error: The module '\\\\?\\C:\\Jeux\\Elite Compagnon\\node_modules\\better-sqlite3\\build\\Release\\better_sqlite3.node'",
    'was compiled against a different Node.js version using',
    'NODE_MODULE_VERSION 137. This version of Node.js requires',
    'NODE_MODULE_VERSION 141. Please try re-compiling or re-installing',
    "    at Module._extensions..node (node:internal/modules/cjs/loader:1921:18) { code: 'ERR_DLOPEN_FAILED' }",
  ].join('\n');
  for (const sortie of [pile, "code: 'ERR_DLOPEN_FAILED'"]) {
    const m = raisonArret('serveur', sortie, 1);
    assert.match(m, /^serveur : Node\.js a changé de version depuis l'installation d'Enova/);
    assert.match(m, /Relance l'installation \(npm run installer/);
    assert.doesNotMatch(m, /compiled against|at Module/);
  }
});

test('journal : tourne au-delà de la taille maximale, écrit en arrière-plan dans l’ordre', async () => {
  const f = path.join(t, 'gros', 'bureau.log');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, 'x'.repeat(2 * 1024 * 1024 + 10));
  const log = journal(f);
  log.ecrire('a', 'ligne');
  log.ecrire('a', 'deux\ntrois');
  await log.attendre();
  assert.ok(fs.existsSync(path.join(t, 'gros', 'bureau.1.log')));
  assert.match(fs.readFileSync(f, 'utf8'), /\[a\] ligne\n.*\[a\] deux\n.*\[a\] trois\n$/);
  // Petite taille maximale : la taille suivie en mémoire fait tourner sans relire le fichier
  const g = path.join(t, 'petit', 'bureau.log');
  const petit = journal(g, { tailleMax: 100 });
  for (let i = 0; i < 5; i++) {
    petit.ecrire('a', `ligne numéro ${i} ${'.'.repeat(40)}`);
    await petit.attendre();
  }
  assert.ok(fs.existsSync(path.join(t, 'petit', 'bureau.1.log')));
  assert.ok(fs.statSync(g).size < 200);
});

test('journal anonymisé : ni le nom d’utilisateur Windows ni les paramètres des adresses', async () => {
  const anon = anonymiseur('C:\\Users\\Testeur Test');
  assert.equal(anon('Journaux : C:\\Users\\Testeur Test\\Saved Games\\Frontier Developments'), 'Journaux : %USERPROFILE%\\Saved Games\\Frontier Developments');
  assert.equal(anon('à c:/users/testeur test/AppData'), 'à %USERPROFILE%/AppData', 'autre écriture, autre casse');
  assert.equal(anon('"C:\\\\Users\\\\Testeur Test\\\\x"'), '"%USERPROFILE%\\\\x"', 'chemin échappé (JSON)');
  assert.equal(anon('C:\\Users\\Testeur Testeur2\\x'), 'C:\\Users\\Testeur Testeur2\\x', 'un autre dossier qui commence pareil : intact');
  assert.equal(anon('inara : requête bloquée vers https://inara.cz/elite/cmdr/?name=Testeur&x=1 ok'), 'inara : requête bloquée vers https://inara.cz/elite/cmdr/?… ok');
  assert.equal(anon('wss://a.b/c#jeton'), 'wss://a.b/c?…');
  const f = path.join(t, 'anon', 'bureau.log');
  const log = journal(f, { home: 'C:\\Users\\Testeur Test' });
  log.ecrire('serveur', 'Journaux : C:\\Users\\Testeur Test\\Saved Games');
  await log.attendre();
  assert.match(fs.readFileSync(f, 'utf8'), /\[serveur\] Journaux : %USERPROFILE%\\Saved Games/);
});

test('port déjà pris : le programme qui le tient est nommé, et le message parle à un joueur', () => {
  const netstat = [
    '',
    'Connexions actives',
    '',
    '  Proto  Adresse locale         Adresse distante       État',
    '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1100',
    '  TCP    127.0.0.1:3001         127.0.0.1:50000        ESTABLISHED     4321',
    '  TCP    127.0.0.1:3001         0.0.0.0:0              LISTENING       4242',
    '  TCP    [::]:5173              [::]:0                 ABHÖREN         777',
  ].join('\r\n');
  assert.equal(pidSurPort(netstat, 3001), 4242, 'le port en écoute, pas une connexion établie');
  assert.equal(pidSurPort(netstat, 5173), 777, 'netstat dans une autre langue');
  assert.equal(pidSurPort(netstat, 9999), null);
  assert.equal(nomProcessus('"Discord.exe","4242","Console","1","120 000 Ko"\r\n'), 'Discord.exe');
  assert.equal(nomProcessus('INFO : aucune tâche'), null);
  const appels = [];
  const exec = (prog, args) => {
    appels.push(prog);
    return args[0] === '-ano' ? netstat : '"Discord.exe","4242","Console","1","1 Ko"';
  };
  assert.deepEqual(quiTientLePort(3001, { exec, env: { SystemRoot: 'C:\\Windows' } }), { pid: 4242, nom: 'Discord.exe' });
  assert.deepEqual(appels, ['C:\\Windows\\System32\\NETSTAT.EXE', 'C:\\Windows\\System32\\tasklist.exe'], 'programmes de Windows par leur chemin complet');
  assert.equal(quiTientLePort(3001, { exec: () => { throw new Error('x'); } }), null);
  const sortie = 'Error: listen EADDRINUSE: address already in use 127.0.0.1:3001';
  const autre = raisonArret('serveur', sortie, 1, { qui: () => ({ pid: 4242, nom: 'Discord.exe' }) });
  assert.match(autre, /Le port 3001 \(serveur\) est déjà pris par le programme « Discord\.exe » \(n° 4242\)\. Ferme-le/);
  const copie = raisonArret('serveur', sortie, 1, { qui: () => ({ pid: 12, nom: 'node.exe' }) });
  assert.match(copie, /une autre copie d'Enova tourne sans doute encore/);
  for (const m of [autre, copie, raisonArret('serveur', sortie, 1, { qui: () => null })]) assert.ok(!/npm/.test(m), 'jamais « npm run dev » pour un joueur');
});

test.after(() => fs.rmSync(t, { recursive: true, force: true }));
