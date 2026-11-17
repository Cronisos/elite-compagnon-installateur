// Données de référence du banc de contrôle (server/data/reference de cette copie du projet, recopiées dans chaque
// serveur isolé) : seulement les versions figées de cette version de l'app (server/src/core/reference/download.js,
// SOURCES). Des données téléchargées avant le figeage des versions (depuis « master »), ou modifiées depuis, faisaient
// passer le contrôle sur des tables que « Mettre à jour les données » remplacera : le banc les refuse.
//
//   npm run controle:reference     télécharge les versions figées dans server/data/reference (empreintes vérifiées,
//                                  l'ancien dossier n'est remplacé qu'une fois tout vérifié)
//
// À lancer dans une copie de travail du projet (worktree), jamais dans le dossier de l'app du joueur si l'app tourne :
// c'est le même téléchargement que le bouton « Mettre à jour les données », qui fait la même chose depuis l'app.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REFERENCE, SERVEUR } from './chemins.mjs';

const DOWNLOAD = pathToFileURL(path.join(SERVEUR, 'src', 'core', 'reference', 'download.js')).href;

/** Écarts des données du banc aux versions figées : { pinned, problems } (verifyReference du serveur). */
export async function etatReference(dossier = REFERENCE) {
  const { verifyReference } = await import(DOWNLOAD);
  return verifyReference(dossier);
}

/**
 * Lève une erreur claire si les données de référence du banc ne sont pas les versions figées. Vérifiées à chaque
 * serveur isolé (environ 2 Mo relus, quelques millisecondes).
 */
export async function verifierReference(dossier = REFERENCE) {
  const etat = await etatReference(dossier);
  if (etat.pinned) return etat;
  throw new Error(`Données de référence du banc (${dossier}) pas aux versions figées de cette version de l'app :\n  - ${etat.problems.join('\n  - ')}\nnpm run controle:reference les retélécharge (versions figées, empreintes vérifiées), puis relance le contrôle.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { downloadReference } = await import(DOWNLOAD);
  try {
    const meta = await downloadReference((m) => console.log(m), { dir: REFERENCE });
    const etat = await etatReference();
    console.log(`Données de référence à jour dans ${REFERENCE} : ${meta.files} fichiers, versions ${etat.pinned ? 'figées (empreintes conformes)' : `NON conformes : ${etat.problems.join(' ; ')}`}.`);
    process.exitCode = etat.pinned ? 0 : 1;
  } catch (err) {
    console.error(`Téléchargement impossible : ${err.message} (les données en place sont gardées).`);
    process.exitCode = 1;
  }
}
