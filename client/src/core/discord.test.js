// Noms venus d'ailleurs dans un texte à coller dans Discord : ni mention, ni lien masqué, ni mise en forme, ni sens
// d'écriture inversé ; et mêmes résultats que le serveur (server/src/core/discord.js : export des ventes, builds).
// Les caractères invisibles ne sont écrits que par leur code (\u{…}).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as client from './discord.js';
import * as server from '../../../server/src/core/discord.js';

const { discordName } = client;
const ZWSP = '\u{200b}';
const PIEGE = '@everyone [Spansh](https://exemple.invalid/) <@&123456789012345678>';

/** Ce que Discord interpréterait dans un message : mentions, liens, mise en forme non échappée, sens d'écriture. */
function dangers(text) {
  const found = [];
  if (/@(everyone|here)\b/.test(text)) found.push('mention de tout le monde');
  if (/<(@[!&]?|#|\/|t:|a?:|https?:)/.test(text)) found.push('mention ou balise <…>');
  if (/(^|[^\\])\[[^\]]*[^\\]\]\(/.test(text)) found.push('lien masqué');
  if (/[a-z]+:\/\//i.test(text)) found.push('adresse cliquable');
  if (/(^|[^\\])(\*\*|__|~~|\|\||`)/.test(text)) found.push('mise en forme');
  if (/[\u{202a}-\u{202e}\u{2066}-\u{2069}\u{200e}\u{200f}\u{61c}]/u.test(text)) found.push('sens d’écriture');
  return found;
}

/** Ce qu'on lit dans Discord : sans les échappements ni les espaces sans chasse. */
const lu = (s) => s.replaceAll(ZWSP, '').replace(/\\(.)/g, '$1');

test('nom piégé d’Ardent : ni mention, ni rôle, ni lien masqué, et il se lit tel quel', () => {
  const s = discordName(PIEGE);
  assert.deepEqual(dangers(PIEGE).length, 4, 'le témoin est bien dangereux');
  assert.deepEqual(dangers(s), []);
  assert.ok(s.includes(`@${ZWSP}everyone`));
  assert.ok(s.includes(`<${ZWSP}@${ZWSP}&123456789012345678>`));
  assert.ok(s.includes('\\[Spansh\\]'));
  assert.equal(lu(s), PIEGE);
});

test('mentions et balises de Discord : toutes neutralisées', () => {
  for (const v of ['@here', '@everyone', '<@123>', '<@!123>', '<@&123>', '<#123>', '</commande:123>', '<t:1700000000:R>', '<:emoji:123>', '<a:emoji:123>', '<https://exemple.invalid>', 'https://exemple.invalid/x', 'http://exemple.invalid', 'steam://run/359320']) {
    const s = discordName(v);
    assert.deepEqual(dangers(s), [], v);
    assert.ok(!/@[a-z&!]/i.test(s) && !/<[@#/:a-z]/i.test(s) && !s.includes('://'), `${v} → ${s}`);
    assert.equal(lu(s), v);
  }
});

test('mise en forme : échappée partout, titres et listes seulement en début de nom', () => {
  assert.equal(discordName('**gras** __souligné__ ~~barré~~ ||spoiler|| `code` \\'), '\\*\\*gras\\*\\* \\_\\_souligné\\_\\_ \\~\\~barré\\~\\~ \\|\\|spoiler\\|\\| \\`code\\` \\\\');
  assert.equal(discordName('# Titre'), '\\# Titre');
  assert.equal(discordName('-# petit'), '\\-# petit');
  assert.equal(discordName('> citation'), '\\> citation');
  assert.equal(discordName('>>> citation'), '\\>>> citation');
  assert.equal(discordName('- liste'), '\\- liste');
  assert.equal(discordName('+ liste'), '\\+ liste');
  assert.equal(discordName('1. liste'), '1\\. liste');
  assert.equal(discordName('12) liste'), '12\\) liste');
  for (const v of ['# Titre', '- liste', '> citation', '1. liste', '**gras**']) assert.deepEqual(dangers(discordName(v)), [], v);
});

test('noms ordinaires : inchangés (systèmes, stations, porteurs, marchandises)', () => {
  for (const v of ['Synuefe GA-I b57-6', 'ICZ KC-U b3-4', "Broo's Legacy", 'Col 285 Sector AN-G b25-1', 'Thé de Fujin', 'X7Z-12K', 'Gare A (Sys1)', 'Port Draught', 'Cobra Mk III', 'Résidence Ørsted', 'Mégavaisseaux', '2 nov. 19:42 UTC']) {
    assert.equal(discordName(v), v);
  }
});

test('contrôles, invisibles, sens d’écriture, retours à la ligne : retirés', () => {
  assert.equal(discordName('Gare\u{202e}A\u{202c}\u{2066}B\u{2069}\u{200f}\u{200e}\u{61c}'), 'GareAB');
  assert.equal(discordName('ligne 1\n# ligne 2\r\n@everyone\u{2028}x'), `ligne 1 # ligne 2 @${ZWSP}everyone x`);
  assert.equal(discordName('a\u{0}b\u{7}c\u{7f}\u{9f}d\u{ad}\u{feff}e\u{2060}f'), 'abcdef');
  assert.equal(discordName(`@${ZWSP}everyone`), `@${ZWSP}everyone`, 'une espace sans chasse déjà là ne fait pas double emploi');
  assert.equal(discordName('a\u{e0041}\u{e0042}b'), 'ab', 'tags Unicode invisibles');
  assert.equal(discordName('   espaces   multiples  '), 'espaces multiples');
  assert.deepEqual(dangers(discordName(`@${ZWSP}everyone \u{202e}[x](https://y)`)), []);
  assert.deepEqual(dangers(discordName(`@\u{200d}everyone <\u{2060}@&1>`)), [], 'un invisible glissé avant la mention ne la protège pas');
});

test('longueur bornée, sans couper un caractère en deux ; valeurs vides', () => {
  const long = discordName('é'.repeat(5000));
  assert.equal(Array.from(long).length, 100);
  assert.ok(long.endsWith('…'));
  const fusees = discordName('🚀'.repeat(300), 10);
  assert.equal(Array.from(fusees).length, 10);
  assert.ok(!/[\u{d800}-\u{dfff}]/u.test(fusees), 'aucune moitié de caractère');
  assert.equal(discordName(null), '');
  assert.equal(discordName(undefined), '');
  assert.equal(discordName(''), '');
  assert.equal(discordName(42), '42');
});

test('client et serveur : même code, mêmes résultats', () => {
  const samples = [PIEGE, '# x', '1. y', '**a**', '<@&1>', 'https://z', 'Synuefe GA-I b57-6', '\u{202e}abc', 'é'.repeat(300), null, '', 'a\nb', '`x`'];
  for (const s of samples) assert.equal(client.discordName(s), server.discordName(s), String(s));
  const corps = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8').replace(/^\/\/.*\r?\n/gm, ''); // \r? : fins de ligne Windows (git core.autocrlf)
  assert.equal(corps('./discord.js'), corps('../../../server/src/core/discord.js'), 'les deux fichiers ne diffèrent que par leurs commentaires');
});
