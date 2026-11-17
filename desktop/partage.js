// Partage du rapport de la semaine dans Discord (main.js) : ce qui se vérifie sans Electron.
//
// - La demande de la page : la route (« all » ou un numéro de projet) et la semaine (début en ms, ou celle en cours).
//   Rien d'autre ne passe, et jamais un chemin de fichier : le GIF est toujours écrit au même endroit par l'app.
// - Le presse-papiers : Discord n'anime que les fichiers GIF. L'app y met donc le fichier lui-même (comme un copier
//   dans l'Explorateur), avec Set-Clipboard de PowerShell ; une image copiée serait collée fixe.

const path = require('node:path');

/** Images du GIF et durée de chacune : 48 × 5 centièmes = 2,4 s, la boucle du vaisseau (sa flamme : 0,6 s). */
const IMAGES_GIF = 48;
const DELAI_GIF = 5;
const DUREE_GIF = (IMAGES_GIF * DELAI_GIF) / 100;
/** Hauteur maximale capturée (px) : au-delà, le rapport est coupé (il ne dépasse pas 2 000 px d'ordinaire). */
const HAUTEUR_MAX_GIF = 4000;

/** Demande de la page, vérifiée : { projet, semaine } ou null. */
function demandeRapport(d) {
  const projet = String(d?.projet ?? 'all');
  if (!/^(all|[1-9]\d{0,8})$/.test(projet)) return null;
  const semaine = d?.semaine == null ? null : Number(d.semaine);
  if (semaine != null && !(Number.isSafeInteger(semaine) && semaine > 0 && semaine < 1e14)) return null;
  return { projet, semaine };
}

/** Adresse de la page de capture, sur l'interface `ui`. */
function adresseCapture(ui, { projet, semaine }) {
  const q = new URLSearchParams({ projet });
  if (semaine != null) q.set('semaine', String(semaine));
  return `${ui}/capture/rapport-semaine?${q}`;
}

/** Fichier du GIF, dans le dossier des données (toujours le même : il remplace le précédent). */
const fichierGif = (dossierDonnees) => path.join(dossierDonnees, 'partage', 'rapport-semaine.gif');

/** powershell.exe par son chemin complet : jamais un programme du même nom dans le dossier courant. */
function powershell(env = process.env) {
  const racine = String(env.SystemRoot || env.SYSTEMROOT || env.windir || 'C:\\Windows');
  return path.win32.join(racine, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

/**
 * Commande qui met le fichier dans le presse-papiers : { programme, args, env }. Le chemin passe par l'environnement
 * (ELITE_GIF), jamais dans le texte de la commande : un nom de Windows avec une apostrophe, même typographique
 * (« Testeur D’Essai », que PowerShell prend aussi pour une fin de chaîne), ne la casse pas.
 */
function commandePressePapiers(fichier, env = process.env) {
  const chemin = String(fichier);
  if (!path.isAbsolute(chemin) || /[\r\n\0]/.test(chemin)) throw new Error('Chemin du GIF impossible.');
  return {
    programme: powershell(env),
    args: ['-NoProfile', '-NonInteractive', '-Command', 'Set-Clipboard -LiteralPath $env:ELITE_GIF'],
    env: { ...env, ELITE_GIF: chemin },
  };
}

module.exports = { IMAGES_GIF, DELAI_GIF, DUREE_GIF, HAUTEUR_MAX_GIF, demandeRapport, adresseCapture, fichierGif, commandePressePapiers, powershell };
