// Dossiers de l'application (core/paths.js) : défauts inchangés, variables d'environnement vérifiées, et aucun chemin
// de données codé ailleurs dans le serveur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_DATA_DIR, SERVER_DIR, dataDir, databaseUrl, defaultJournalDir, envDir, gameOptionsDir, gameOptionsDisplay,
  gameOptionsPath, isNetworkOrDevicePath, journalDir, databaseFileUrl, referenceDir, parseRegValue, savedGamesDir, SAVED_GAMES_ID, REG_COMMAND,
} from './paths.js';
import { defaultBindingsDir } from '../modules/bindings/index.js';
import { defaultOptionsDir } from '../modules/hudcolours/store.js';

const SRC = fileURLToPath(new URL('../', import.meta.url));
const ABS = process.platform === 'win32' ? 'C:\\Banc\\donnees' : '/banc/donnees';

test('chemins : défauts identiques à ceux d’avant (server/data, Saved Games, %LOCALAPPDATA%\\…\\Options)', () => {
  assert.equal(DEFAULT_DATA_DIR, path.resolve(fileURLToPath(new URL('../../data', import.meta.url))));
  assert.equal(SERVER_DIR.replace(/[\\/]$/, ''), path.resolve(fileURLToPath(new URL('../..', import.meta.url))));
  assert.equal(dataDir({}), DEFAULT_DATA_DIR);
  assert.equal(referenceDir({}), path.join(DEFAULT_DATA_DIR, 'reference'));
  assert.equal(defaultJournalDir({}, { savedGames: () => null }), path.join(os.homedir(), 'Saved Games', 'Frontier Developments', 'Elite Dangerous'));
  assert.equal(journalDir('D:\\Jeu', {}), 'D:\\Jeu');
  const local = 'C:\\Users\\Testeur\\AppData\\Local';
  assert.equal(gameOptionsDir({ LOCALAPPDATA: local }), path.join(local, 'Frontier Developments', 'Elite Dangerous', 'Options'));
  assert.equal(gameOptionsPath('Graphics', { LOCALAPPDATA: local }), path.join(local, 'Frontier Developments', 'Elite Dangerous', 'Options', 'Graphics'));
  assert.equal(gameOptionsDisplay('Bindings', {}), '%LOCALAPPDATA%\\Frontier Developments\\Elite Dangerous\\Options\\Bindings');
  assert.equal(databaseFileUrl({}), 'file:' + path.join(DEFAULT_DATA_DIR, 'elite.db').replace(/\\/g, '/'), 'sans ELITE_DATA_DIR : server/data/elite.db');
  // Les modules reçoivent les mêmes dossiers qu'avant le passage par core/paths.js
  assert.deepEqual(defaultBindingsDir({ LOCALAPPDATA: local }), {
    dir: path.join(local, 'Frontier Developments', 'Elite Dangerous', 'Options', 'Bindings'),
    displayDir: '%LOCALAPPDATA%\\Frontier Developments\\Elite Dangerous\\Options\\Bindings',
  });
  assert.equal(defaultOptionsDir({ LOCALAPPDATA: local }), path.join(local, 'Frontier Developments', 'Elite Dangerous', 'Options', 'Graphics'));
});

test('chemins : la CLI Prisma (prisma.config.mjs) et l’app prennent la même base ; le schéma n’en porte plus', () => {
  const schema = fs.readFileSync(path.join(SERVER_DIR, 'prisma', 'schema', 'schema.prisma'), 'utf8');
  assert.doesNotMatch(schema, /^\s*url\s*=/m, 'Prisma 7 : adresse dans prisma.config.mjs');
  const config = fs.readFileSync(path.join(SERVER_DIR, 'prisma.config.mjs'), 'utf8');
  assert.match(config, /url: databaseFileUrl\(\)/);
});

test('chemins : ELITE_DATA_DIR, ELITE_JOURNAL_DIR et ELITE_GAME_OPTIONS_DIR remplacent les défauts', () => {
  const env = { ELITE_DATA_DIR: ABS, ELITE_JOURNAL_DIR: `${ABS}j`, ELITE_GAME_OPTIONS_DIR: `${ABS}o`, LOCALAPPDATA: 'C:\\X' };
  assert.equal(dataDir(env), path.resolve(ABS));
  assert.equal(referenceDir(env), path.join(path.resolve(ABS), 'reference'));
  assert.equal(defaultJournalDir(env), path.resolve(`${ABS}j`));
  assert.equal(journalDir('D:\\Réglage du joueur', env), path.resolve(`${ABS}j`), 'la variable passe avant le réglage');
  assert.equal(gameOptionsDir(env), path.resolve(`${ABS}o`));
  assert.equal(gameOptionsPath('Bindings', env), path.join(path.resolve(`${ABS}o`), 'Bindings'));
  assert.equal(gameOptionsDisplay('Bindings', env), `${path.resolve(`${ABS}o`)}\\Bindings`);
  assert.deepEqual(defaultBindingsDir(env), { dir: path.join(path.resolve(`${ABS}o`), 'Bindings'), displayDir: `${path.resolve(`${ABS}o`)}\\Bindings` });
  const datasourceUrl = databaseFileUrl(env);
  assert.equal(datasourceUrl, `file:${path.join(path.resolve(ABS), 'elite.db').replace(/\\/g, '/')}`);
  assert.doesNotMatch(datasourceUrl, /\\/);
  // Vide = absente
  assert.equal(dataDir({ ELITE_DATA_DIR: '  ' }), DEFAULT_DATA_DIR);
  assert.equal(journalDir('D:\\Jeu', { ELITE_JOURNAL_DIR: '' }), 'D:\\Jeu');
});

test('chemins : chemin relatif, réseau ou de périphérique refusé avec un message clair', () => {
  for (const bad of ['donnees', '.\\donnees', '..\\server\\data', '\\\\serveur\\partage', '//serveur/partage', '\\\\?\\C:\\x', '\\\\.\\pipe\\x', '\\??\\C:\\x']) {
    assert.throws(() => dataDir({ ELITE_DATA_DIR: bad }), /ELITE_DATA_DIR refusé/, bad);
    assert.throws(() => journalDir('C:\\x', { ELITE_JOURNAL_DIR: bad }), /ELITE_JOURNAL_DIR refusé/, bad);
    assert.throws(() => gameOptionsDir({ ELITE_GAME_OPTIONS_DIR: bad }), /ELITE_GAME_OPTIONS_DIR refusé/, bad);
  }
  if (process.platform === 'win32') assert.throws(() => envDir({ X: '\\sans\\lecteur' }, 'X'), /pas un chemin absolu/);
  assert.equal(isNetworkOrDevicePath('\\\\serveur\\partage'), true);
  assert.equal(isNetworkOrDevicePath('C:\\Jeu'), false);
});

test('chemins : « Parties enregistrées » déplacé (registre de Windows) : journaux proposés à la bonne place', () => {
  const env = { USERPROFILE: 'C:\\Users\\Testeur' };
  const sortie = (valeur) => `\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders\r\n    ${SAVED_GAMES_ID}    REG_EXPAND_SZ    ${valeur}\r\n\r\n`;
  assert.equal(parseRegValue(sortie('%USERPROFILE%\\Saved Games'), SAVED_GAMES_ID, env), 'C:\\Users\\Testeur\\Saved Games');
  assert.equal(parseRegValue(sortie('D:\\Jeux\\Parties enregistrées'), SAVED_GAMES_ID, env), 'D:\\Jeux\\Parties enregistrées');
  assert.equal(parseRegValue(sortie('%INCONNUE%\\x'), SAVED_GAMES_ID, env), null, 'variable inconnue : valeur inutilisable');
  assert.equal(parseRegValue('', SAVED_GAMES_ID, env), null);

  const reg = (valeur) => ({ platform: 'win32', exec: () => sortie(valeur) });
  assert.equal(savedGamesDir(env, reg('D:\\Jeux\\Saved Games')), 'D:\\Jeux\\Saved Games');
  assert.equal(savedGamesDir(env, reg('\\\\serveur\\partage\\Saved Games')), null, 'chemin réseau : jamais proposé');
  assert.equal(savedGamesDir(env, reg('Saved Games')), null, 'chemin relatif : ignoré');
  assert.equal(savedGamesDir(env, { platform: 'win32', exec: () => { throw new Error('valeur absente'); } }), null, 'jamais déplacé : rien');
  assert.equal(savedGamesDir(env, { platform: 'linux', exec: () => assert.fail('pas de registre hors de Windows') }), null);

  // Chemin accentué : reg.exe passe par cmd.exe en UTF-8 (chcp 65001), sinon il écrirait en OEM 850
  let appel = null;
  const enregistre = { platform: 'win32', exec: (cmd, args, opts) => { appel = { cmd, args, opts }; return Buffer.from(sortie('D:\\Données\\Parties enregistrées'), 'utf8').toString(opts.encoding); } };
  assert.equal(savedGamesDir(env, enregistre), 'D:\\Données\\Parties enregistrées');
  assert.equal(appel.cmd, 'cmd.exe');
  assert.deepEqual(appel.args, [REG_COMMAND]);
  assert.equal(appel.opts.windowsVerbatimArguments, true, 'guillemets de la ligne gardés tels quels');
  assert.ok(!appel.opts.stdio.includes('inherit'), 'console à part, cachée : celle du joueur ne change pas de page de codes');
  assert.match(REG_COMMAND, /^\/d \/s \/c "chcp 65001 >nul & reg query "HKCU\\[^"]+User Shell Folders" \/v \{4C5C32FF-[^}]+\}"$/);
  // Octets réels de reg.exe sans chcp (« è » = 0x8A en CP850) lus en UTF-8 : U+FFFD, chemin abîmé jamais proposé
  const cp850 = Buffer.concat([Buffer.from(sortie('D:\\Syst'), 'latin1').subarray(0, -4), Buffer.from([0x8a]), Buffer.from('me\\Saved Games\r\n\r\n', 'latin1')]);
  const abime = { platform: 'win32', exec: (cmd, args, opts) => cp850.toString(opts.encoding) };
  assert.ok(cp850.toString('utf8').includes('\uFFFD'));
  assert.equal(savedGamesDir(env, abime), null, 'décodage raté : dossier de l’utilisateur à la place');
  assert.equal(defaultJournalDir({}, { savedGames: (e) => savedGamesDir(e, abime) }), path.join(os.homedir(), 'Saved Games', 'Frontier Developments', 'Elite Dangerous'));

  // Déplacé : sous le dossier déplacé ; sinon le dossier de l'utilisateur ; ELITE_JOURNAL_DIR passe avant tout
  assert.equal(defaultJournalDir({}, { savedGames: () => 'D:\\Jeux\\Saved Games' }), path.join('D:\\Jeux\\Saved Games', 'Frontier Developments', 'Elite Dangerous'));
  assert.equal(defaultJournalDir({ ELITE_JOURNAL_DIR: `${ABS}j` }, { savedGames: () => assert.fail('registre lu pour rien') }), path.resolve(`${ABS}j`));
});

test('chemins : adresse Prisma d’un fichier de base (barres obliques, chemin absolu)', () => {
  assert.equal(databaseUrl(`${ABS}\\elite.db`.replace(/\\/g, path.sep)), `file:${path.resolve(`${ABS}\\elite.db`.replace(/\\/g, path.sep)).replace(/\\/g, '/')}`);
});

// Le seul endroit des dossiers : aucun module ni le cœur ne recalcule server/data, %LOCALAPPDATA% ou Saved Games
function sources(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== '__golden__' && e.name !== 'fixtures') sources(p, out);
    } else if (e.name.endsWith('.js') && !e.name.endsWith('.test.js')) out.push(p);
  }
  return out;
}
const code = (text) => text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

test('chemins : aucun chemin de données codé hors de core/paths.js', () => {
  const found = [];
  for (const file of sources(SRC)) {
    const rel = path.relative(SRC, file).replace(/\\/g, '/');
    if (rel === 'core/paths.js') continue;
    const text = code(fs.readFileSync(file, 'utf8'));
    if (/['"`][./]*(\.\.\/)+data\b/.test(text)) found.push(`${rel} : chemin ../data`);
    if (/LOCALAPPDATA/.test(text)) found.push(`${rel} : LOCALAPPDATA`);
    if (/APPDATA/.test(text.replace(/LOCALAPPDATA/g, ''))) found.push(`${rel} : APPDATA`);
    if (/['"]Saved Games['"]/.test(text)) found.push(`${rel} : Saved Games`);
    if (/os\.homedir\(/.test(text)) found.push(`${rel} : os.homedir()`);
    if (/['"]Options['"]/.test(text)) found.push(`${rel} : dossier Options`);
  }
  assert.deepEqual(found, []);
});
