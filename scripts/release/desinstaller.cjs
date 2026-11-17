// Désinstalleur d'Elite Compagnon, lancé par « Applications installées » de Windows (inscription faite par
// l'installateur, scripts/release/installeur.cjs) avec le Node livré avec l'app. Il retire les raccourcis,
// l'inscription et le dossier de l'app. Pour tes données (%APPDATA%\Elite Compagnon : base, réglages, repères…), il
// demande un mot entier, sans choix par défaut : EFFACER ou CONSERVER. Entrée seule ne décide rien, la question est
// reposée. EFFACER demande ensuite une confirmation (OUI), en disant ce qui sera perdu pour de bon. Pour en garder une
// copie ailleurs avant : Paramètres › Sauvegardes.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn, spawnSync } = require('node:child_process');

const NOM = 'Elite Compagnon';
const CLE = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\EliteCompagnon';
const DOSSIER = path.resolve(__dirname, '..', '..');

/**
 * Commande qui efface le dossier de l'app une fois ce script fini : { commande, args, options } pour spawn. Le dossier
 * contient le Node qui fait tourner ce script, donc elle réessaie (20 fois, une seconde d'écart) jusqu'à ce qu'il soit
 * parti. Arguments passés tels quels (windowsVerbatimArguments) : sans cela Node échappe les guillemets du chemin, cmd
 * ne le comprend plus et rien n'est effacé. Lancée depuis le dossier temporaire : un dossier courant ne s'efface pas.
 */
function commandeEffacement(dossier) {
  const boucle = `for /l %i in (1,1,20) do @if exist "${dossier}" (ping -n 2 127.0.0.1 >nul & rmdir /s /q "${dossier}")`;
  return {
    commande: 'cmd.exe',
    args: ['/d', '/s', '/c', `"${boucle}"`],
    options: { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true, cwd: os.tmpdir() },
  };
}

/**
 * Réponse à « tes données ? » : 'effacer' ou 'conserver' pour le mot entier (casse et espaces autour indifférents),
 * null pour tout le reste (Entrée seule, faute de frappe) : la question est alors reposée, rien n'est décidé à sa place.
 */
function choixDonnees(reponse) {
  const mot = String(reponse ?? '').trim().toUpperCase();
  return mot === 'EFFACER' ? 'effacer' : mot === 'CONSERVER' ? 'conserver' : null;
}

/** Confirmation de l'effacement : seulement OUI. Tout le reste revient à conserver. */
function confirmeEffacement(reponse) {
  return String(reponse ?? '').trim().toUpperCase() === 'OUI';
}

function question(texte) {
  return new Promise((resolve) => {
    process.stdout.write(texte);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (d) => {
      process.stdin.pause();
      resolve(String(d).trim());
    });
  });
}

function appOuverte() {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($env:EC_DOSSIER, [StringComparison]::OrdinalIgnoreCase) } | Measure-Object | Select-Object -ExpandProperty Count"],
  { env: { ...process.env, EC_DOSSIER: DOSSIER }, encoding: 'utf8', windowsHide: true });
  return Number(String(r.stdout).trim()) > 0;
}

async function principal() {
  console.log(`\n  Désinstaller ${NOM} (${DOSSIER})\n`);
  if ((await question('  Continuer ? Tape OUI puis Entrée : ')).toUpperCase() !== 'OUI') return console.log('  Rien n’a été touché.');
  while (appOuverte()) await question(`  ${NOM} est ouvert : ferme-le, puis appuie sur Entrée… `);
  const donnees = path.join(process.env.APPDATA || '', NOM);
  let effacerDonnees = false;
  if (fs.existsSync(donnees)) {
    console.log(`\n  Et tes données ? (${donnees})\n  Ce sont tes repères, tes builds, tes routes, tes sessions et tes réglages.\n`);
    let choix = null;
    while (!choix) choix = choixDonnees(await question('  Tape EFFACER pour les supprimer, ou CONSERVER pour les garder, puis Entrée : '));
    if (choix === 'effacer') {
      console.log('\n  Tout sera supprimé, et c\'est définitif : tes repères, tes builds, tes routes, tes sessions,\n  tes réglages et ton inscription à l\'escadron. Rien ne pourra les faire revenir, sauf une\n  sauvegarde faite avant (Paramètres, Sauvegardes).\n');
      effacerDonnees = confirmeEffacement(await question('  Es-tu sûr ? Tape OUI pour tout effacer, autre chose pour conserver tes données : '));
      if (!effacerDonnees) console.log('  Tes données sont conservées.');
    }
  }
  try {
    execFileSync(process.execPath, [path.join(DOSSIER, 'scripts', 'raccourcis.mjs'), '--retirer'], { cwd: DOSSIER, stdio: 'ignore', windowsHide: true });
  } catch {
    // raccourcis déjà retirés
  }
  spawnSync('reg.exe', ['delete', CLE, '/f'], { stdio: 'ignore', windowsHide: true });
  if (effacerDonnees) fs.rmSync(donnees, { recursive: true, force: true });
  // Le dossier de l'app contient le Node qui fait tourner ce script : effacé juste après sa fin, par une commande à part
  const effacement = commandeEffacement(DOSSIER);
  spawn(effacement.commande, effacement.args, effacement.options).unref();
  console.log(`\n  ${NOM} est désinstallé.${effacerDonnees ? ' Tes données sont effacées.' : ` Tes données restent dans ${donnees}.`}`);
  await question('  Appuie sur Entrée pour fermer… ');
}

if (require.main === module) {
  principal().catch(async (err) => {
    console.error(`  Désinstallation impossible : ${err.message}`);
    await question('  Appuie sur Entrée pour fermer… ');
    process.exitCode = 1;
  });
}

module.exports = { commandeEffacement, choixDonnees, confirmeEffacement };
