// Installateur : empreinte du contenu vérifiée (téléchargement coupé ou fichier modifié refusés), aucun mot de passe,
// dossier d'installation et inscription dans « Applications installées ». Aucun réseau, aucune installation réelle.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AUTEUR, CLE_DESINSTALLATION, dossierInstallation, entetePour, inscription, verifier } = require('./installeur.cjs');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'elite-installeur-'));

test('contenu intact : accepté ; l’en-tête porte la version, l’auteur, la taille et l’empreinte', () => {
  const t = temp();
  const source = path.join(t, 'app.tar.gz');
  const contenu = crypto.randomBytes(3 * 1024 * 1024 + 17);
  fs.writeFileSync(source, contenu);
  const entete = entetePour(source, { version: '2026.11.16-test' });
  assert.equal(entete.version, '2026.11.16-test');
  assert.equal(entete.auteur, AUTEUR);
  assert.equal(entete.taille, contenu.length);
  assert.match(entete.sha256, /^[0-9a-f]{64}$/);
  assert.doesNotThrow(() => verifier(contenu, entete));
  fs.rmSync(t, { recursive: true, force: true });
});

test('contenu modifié (un octet) ou coupé : refusé avec un message clair', () => {
  const t = temp();
  const source = path.join(t, 'app.tar.gz');
  const contenu = crypto.randomBytes(100_000);
  fs.writeFileSync(source, contenu);
  const entete = entetePour(source);
  const abime = Buffer.from(contenu);
  abime[500] ^= 0xff;
  assert.throws(() => verifier(abime, entete), /abîmé ou modifié/);
  assert.throws(() => verifier(contenu.subarray(0, 50_000), entete), /abîmé ou modifié/);
  assert.throws(() => verifier(contenu, { format: 'autre' }), /en-tête illisible/);
  assert.throws(() => verifier(contenu, null), /en-tête illisible/);
  fs.rmSync(t, { recursive: true, force: true });
});

test('aucun mot de passe ni chiffrement : l’installateur est en libre service', () => {
  const source = fs.readFileSync(path.join(__dirname, 'installeur.cjs'), 'utf8');
  const code = source.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.doesNotMatch(code, /createCipheriv|createDecipheriv|scrypt|setRawMode/);
  assert.doesNotMatch(code, /mot de passe/i);
});

test('installé dans les programmes du compte, inscrit avec son désinstalleur, son auteur et le Node livré', () => {
  assert.equal(dossierInstallation({ LOCALAPPDATA: 'C:\\Users\\Testeur\\AppData\\Local' }), path.join('C:\\Users\\Testeur\\AppData\\Local', 'Programs', 'Elite Compagnon'));
  const d = 'C:\\Users\\Testeur\\AppData\\Local\\Programs\\Elite Compagnon';
  const i = inscription(d, '2026.11.16-test');
  assert.equal(i.DisplayName, 'Enova');
  assert.equal(i.DisplayVersion, '2026.11.16-test');
  assert.equal(i.Publisher, AUTEUR);
  assert.match(i.UninstallString, /runtime\\node\\node\.exe" ".*scripts\\release\\desinstaller\.cjs"$/);
  assert.match(CLE_DESINSTALLATION, /^HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\/);
});

test('désinstalleur : EFFACER ou CONSERVER en toutes lettres, jamais de choix par défaut ; EFFACER se confirme', () => {
  const { choixDonnees, confirmeEffacement, commandeEffacement } = require('./desinstaller.cjs');
  for (const mot of ['EFFACER', 'effacer', '  Effacer ']) assert.equal(choixDonnees(mot), 'effacer', mot);
  for (const mot of ['CONSERVER', 'conserver', ' Conserver  ']) assert.equal(choixDonnees(mot), 'conserver', mot);
  for (const rien of ['', '   ', 'oui', 'non', 'GARDER', 'EFFACE', 'EFFACER tout', 'CONSERVE', null, undefined]) assert.equal(choixDonnees(rien), null, String(rien));
  for (const oui of ['OUI', 'oui', ' Oui ']) assert.equal(confirmeEffacement(oui), true, oui);
  for (const non of ['', 'o', 'non', 'EFFACER', 'yes', null]) assert.equal(confirmeEffacement(non), false, String(non));
  const c = commandeEffacement('C:\\Users\\Testeur\\AppData\\Local\\Programs\\Elite Compagnon');
  assert.equal(c.commande, 'cmd.exe');
  assert.equal(c.options.windowsVerbatimArguments, true, 'sans cela, les guillemets du chemin sont échappés et rien n’est effacé');
  assert.match(c.args.at(-1), /rmdir \/s \/q "C:\\Users\\Testeur\\AppData\\Local\\Programs\\Elite Compagnon"/);
});
