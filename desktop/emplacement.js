// Emplacement du dossier de l'app : il doit rester modifiable (mise à jour de la base, interface recompilée quand son
// code change, client Prisma généré quand le schéma change). Sous « Program Files », Windows refuse ces écritures sans
// droits d'administrateur ; sous OneDrive, la synchronisation verrouille des fichiers pendant qu'ils s'écrivent (échecs
// EBUSY ou EPERM au hasard). On prévient (installateur, journal et bulle de l'app au lancement), sans rien bloquer.

const path = require('node:path');

const PROGRAMMES = ['ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432'];
const ONEDRIVE = ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial'];

/** `dossier` est-il `racine` ou dedans ? (Windows : sans tenir compte de la casse ni des séparateurs) */
function dedans(dossier, racine) {
  if (!racine || !dossier) return false;
  const rel = path.win32.relative(String(racine).toLowerCase(), String(dossier).toLowerCase());
  return rel === '' || (!rel.startsWith('..') && !path.win32.isAbsolute(rel));
}

/** Où est le dossier : 'programmes', 'onedrive', ou null (emplacement sans souci). */
function emplacementRisque(dossier, env = process.env) {
  if (PROGRAMMES.some((v) => dedans(dossier, env[v]))) return 'programmes';
  if (ONEDRIVE.some((v) => dedans(dossier, env[v]))) return 'onedrive';
  return null;
}

/** Avertissement pour un joueur : { court (bulle de Windows), long (journal, installateur) }, ou null. */
function avertissementEmplacement(dossier, env = process.env) {
  const risque = emplacementRisque(dossier, env);
  if (!risque) return null;
  const local = env.LOCALAPPDATA ? path.win32.join(env.LOCALAPPDATA, 'Programs', 'Elite Compagnon') : null;
  const ailleurs = `par exemple dans C:\\Jeux\\Elite Compagnon${local ? ` ou ${local}` : ''}`;
  if (risque === 'programmes') {
    return {
      court: "Enova est dans « Program Files » : Windows l'empêche de se mettre à jour. Déplace son dossier (C:\\Jeux\\Elite Compagnon, par exemple).",
      long: `Enova est installé dans « ${dossier} », un dossier de programmes de Windows. L'app doit pouvoir écrire dans son dossier (mise à jour de la base, de l'interface), ce que Windows y refuse sans droits d'administrateur : elle risque de ne pas démarrer. Déplace tout son dossier ailleurs, ${ailleurs}, puis relance l'installateur.`,
    };
  }
  return {
    court: 'Enova est dans un dossier OneDrive : la synchronisation peut le faire échouer au lancement. Déplace son dossier hors de OneDrive.',
    long: `Enova est installé dans « ${dossier} », un dossier synchronisé par OneDrive. OneDrive verrouille des fichiers pendant que l'app les écrit (mise à jour de la base, de l'interface) : des lancements peuvent échouer au hasard. Déplace tout son dossier hors de OneDrive, ${ailleurs}, puis relance l'installateur.`,
  };
}

module.exports = { emplacementRisque, avertissementEmplacement };
