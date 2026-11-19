// Installateur d'Enova : « Installer Enova <version>.exe », fabriqué par scripts/release.mjs (un
// exécutable Node unique, SEA : ce fichier, et l'app compressée en ressource). Il ne dépend que de Node lui-même :
// aucun require d'un autre fichier du projet. Application créée par Cronisos Lysiris, gratuite, en libre service.
//
// Pour le joueur :
//   1. il vérifie que son contenu est intact (empreinte SHA-256 notée à la fabrication) : un téléchargement coupé ou
//      un fichier modifié est refusé, rien ne s'installe ;
//   2. il installe dans %LOCALAPPDATA%\Programs\Elite Compagnon (le dossier des programmes de ton compte : sans droits
//      d'administrateur, jamais sous OneDrive ni Program Files) ; une version déjà installée est remplacée d'un bloc
//      (nouvelle version décompressée à côté, puis échangée) ; tes données (%APPDATA%\Elite Compagnon) ne sont jamais
//      touchées ;
//   3. il pose les raccourcis (Bureau et menu Démarrer), inscrit l'app dans « Applications installées » de Windows (avec
//      son désinstalleur), puis la lance.
//
// Aucun mot de passe, aucun compte, aucune donnée de qui que ce soit dans l'installateur : chacun règle la sienne dans
// l'app. Le même fichier sert à scripts/release.mjs (en-tête) et aux tests (module.exports) quand il n'est pas
// l'exécutable.

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn, spawnSync } = require('node:child_process');

const NOM = 'Enova'; // nom montré : messages, « Applications installées », raccourcis
// Dossier d'installation : son nom d'avant le changement de nom de l'app, gardé pour qu'une mise à jour remplace
// l'ancienne version au lieu de s'installer à côté
const NOM_DOSSIER = 'Elite Compagnon';
const AUTEUR = 'Cronisos Lysiris';
const ENTETE = 'ELITE-COMPAGNON-INSTALLATEUR-2';

/** Empreinte SHA-256 d'un contenu (Buffer), en hexadécimal. */
function empreinte(contenu) {
  return crypto.createHash('sha256').update(contenu).digest('hex');
}

/** En-tête à ranger à côté de l'app compressée : { format, version, auteur, taille, sha256 }. */
function entetePour(fichier, { version = '?' } = {}) {
  const contenu = fs.readFileSync(fichier);
  return { format: ENTETE, version, auteur: AUTEUR, taille: contenu.length, sha256: empreinte(contenu) };
}

/** Le contenu est-il celui de l'en-tête ? Lève une erreur claire sinon (téléchargement coupé, fichier modifié). */
function verifier(contenu, entete) {
  if (entete?.format !== ENTETE || typeof entete.sha256 !== 'string') throw new Error('Installateur abîmé : en-tête illisible. Retélécharge-le.');
  if (contenu.length !== entete.taille || empreinte(contenu) !== entete.sha256) {
    throw new Error('Installateur abîmé ou modifié : son contenu ne correspond pas à son empreinte. Retélécharge-le.');
  }
}

/** Dossier d'installation : les programmes du compte (%LOCALAPPDATA%\Programs). */
function dossierInstallation(env = process.env) {
  const local = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(local, 'Programs', NOM_DOSSIER);
}

const CLE_DESINSTALLATION = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\EliteCompagnon';

/** Valeurs de l'inscription dans « Applications installées ». */
function inscription(dossier, version) {
  const node = path.join(dossier, 'runtime', 'node', 'node.exe');
  return {
    DisplayName: NOM,
    DisplayVersion: version,
    Publisher: AUTEUR,
    InstallLocation: dossier,
    DisplayIcon: path.join(dossier, 'EliteApp.ico'),
    UninstallString: `"${node}" "${path.join(dossier, 'scripts', 'release', 'desinstaller.cjs')}"`,
    NoModify: 1,
    NoRepair: 1,
  };
}

// --- Exécutable (SEA) ---

function estExecutable() {
  try {
    return require('node:sea').isSea();
  } catch {
    return false;
  }
}

function attendreEntree(message) {
  return new Promise((resolve) => {
    process.stdout.write(message);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}

/** L'app installée tourne-t-elle ? (un Electron lancé depuis ce dossier) */
function appOuverte(dossier) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name='electron.exe' OR Name='node.exe'\" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($env:EC_DOSSIER, [StringComparison]::OrdinalIgnoreCase) } | Measure-Object | Select-Object -ExpandProperty Count"],
  { env: { ...process.env, EC_DOSSIER: dossier }, encoding: 'utf8', windowsHide: true });
  return Number(String(r.stdout).trim()) > 0;
}

async function installer() {
  const sea = require('node:sea');
  const entete = JSON.parse(Buffer.from(sea.getAsset('entete')).toString('utf8'));
  console.log(`\n  ${NOM} — installation de la version ${entete.version}`);
  console.log(`  Une application gratuite de ${AUTEUR}, non affiliée à Frontier Developments.\n`);
  console.log('  Vérification du contenu…');
  const contenu = Buffer.from(sea.getAsset('app'));
  verifier(contenu, entete);

  const dossier = dossierInstallation();
  const nouveau = `${dossier}.nouveau`;
  const ancien = `${dossier}.ancien`;
  if (fs.existsSync(dossier)) {
    while (appOuverte(dossier)) await attendreEntree(`\n  ${NOM} est ouvert : ferme-le (clic droit sur son logo puis Quitter, ou l’icône près de l’horloge), puis appuie sur Entrée… `);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-compagnon-'));
  try {
    const archive = path.join(tmp, 'app.tar.gz');
    fs.writeFileSync(archive, contenu);
    console.log('  Décompression (une minute environ)…');
    fs.rmSync(nouveau, { recursive: true, force: true });
    fs.mkdirSync(nouveau, { recursive: true });
    execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xzf', archive, '-C', nouveau, '--strip-components=1'], { stdio: 'ignore', windowsHide: true });
    if (!fs.existsSync(path.join(nouveau, 'desktop', 'main.js'))) throw new Error('Décompression incomplète : retélécharge l’installateur.');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // Échange d'un bloc : l'ancienne version n'est effacée qu'une fois la nouvelle en place
  fs.rmSync(ancien, { recursive: true, force: true });
  if (fs.existsSync(dossier)) fs.renameSync(dossier, ancien);
  fs.renameSync(nouveau, dossier);
  fs.rmSync(ancien, { recursive: true, force: true });

  console.log('  Raccourcis et inscription dans « Applications installées »…');
  const node = path.join(dossier, 'runtime', 'node', 'node.exe');
  execFileSync(node, [path.join(dossier, 'scripts', 'raccourcis.mjs')], { cwd: dossier, stdio: 'ignore', windowsHide: true });
  for (const [nom, valeur] of Object.entries(inscription(dossier, entete.version))) {
    const type = typeof valeur === 'number' ? 'REG_DWORD' : 'REG_SZ';
    execFileSync('reg.exe', ['add', CLE_DESINSTALLATION, '/v', nom, '/t', type, '/d', String(valeur), '/f'], { stdio: 'ignore', windowsHide: true });
  }
  console.log(`\n  Installé dans ${dossier}.`);
  console.log('  Raccourci « Enova » sur le Bureau et dans le menu Démarrer. Lancement…\n');
  const electron = path.join(dossier, 'node_modules', 'electron', 'dist', 'electron.exe');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE; // posée, même vide, elle ferait tourner Electron comme un simple Node
  spawn(electron, [path.join(dossier, 'desktop')], { cwd: dossier, detached: true, stdio: 'ignore', env }).unref();
}

if (estExecutable()) {
  installer().then(
    () => setTimeout(() => process.exit(0), 3000),
    async (err) => {
      console.error(`\n  Installation impossible : ${err.message}`);
      await attendreEntree('\n  Appuie sur Entrée pour fermer… ');
      process.exit(1);
    },
  );
}

module.exports = { AUTEUR, CLE_DESINSTALLATION, ENTETE, NOM, NOM_DOSSIER, dossierInstallation, empreinte, entetePour, inscription, verifier };
