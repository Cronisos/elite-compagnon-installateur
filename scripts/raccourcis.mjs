// Raccourcis de l'app de bureau (npm run raccourcis) : « Elite Compagnon » sur le Bureau et dans le menu Démarrer, vers
// l'Electron du projet avec le dossier desktop/ (icône EliteApp.ico). Écrits seulement à la demande, jamais à
// l'installation. Un raccourci existant du même nom est remplacé ; rien d'autre n'est touché.
// --retirer : efface les deux raccourcis.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const NOM = 'Elite Compagnon';

/** Ce que pointe le raccourci : l'exécutable d'Electron (celui de l'overlay), le dossier desktop/, l'icône. */
export function cibleRaccourci(racine = RACINE) {
  const electron = createRequire(path.join(racine, 'overlay', 'package.json'))('electron'); // chemin de electron.exe
  return {
    cible: electron,
    arguments: `"${path.join(racine, 'desktop')}"`,
    dossier: path.join(racine, 'desktop'),
    icone: path.join(racine, 'EliteApp.ico'),
    description: "Elite Compagnon : l'app compagnon d'Elite Dangerous",
  };
}

// Chemins passés par l'environnement, jamais collés dans le texte de la commande (aucun échappement à faire)
const SCRIPT = `
$ErrorActionPreference = 'Stop'
$noms = @()
foreach ($dossier in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $f = Join-Path $dossier ($env:RAC_NOM + '.lnk')
  if ($env:RAC_RETIRER -eq '1') { if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f; $noms += $f }; continue }
  $l = (New-Object -ComObject WScript.Shell).CreateShortcut($f)
  $l.TargetPath = $env:RAC_CIBLE
  $l.Arguments = $env:RAC_ARGS
  $l.WorkingDirectory = $env:RAC_DOSSIER
  $l.IconLocation = $env:RAC_ICONE + ',0'
  $l.Description = $env:RAC_DESC
  $l.Save()
  $noms += $f
}
$noms -join [Environment]::NewLine
`;

export function ecrireRaccourcis({ retirer = false } = {}) {
  const c = cibleRaccourci();
  if (!retirer && !fs.existsSync(c.cible)) throw new Error("Electron n'est pas installé : lance d'abord « npm run installer ».");
  const env = { ...process.env, RAC_NOM: NOM, RAC_CIBLE: c.cible, RAC_ARGS: c.arguments, RAC_DOSSIER: c.dossier, RAC_ICONE: c.icone, RAC_DESC: c.description, RAC_RETIRER: retirer ? '1' : '0' };
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT], { env, encoding: 'utf8', windowsHide: true }).trim();
}

if (process.argv[1] && pathToFileURL(fs.realpathSync.native(process.argv[1])).href === import.meta.url) {
  const retirer = process.argv.includes('--retirer');
  try {
    const faits = ecrireRaccourcis({ retirer });
    console.log(retirer ? `Raccourcis retirés :\n${faits || '(aucun)'}` : `Raccourcis « ${NOM} » écrits :\n${faits}`);
  } catch (err) {
    console.error(`Raccourcis : ${err.message}`);
    process.exit(1);
  }
}
