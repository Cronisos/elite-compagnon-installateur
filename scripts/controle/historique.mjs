// npm run controle:historique : les données réelles du joueur dans l'HISTORIQUE git du dépôt (toutes les versions de
// tous les fichiers, sur toutes les branches et étiquettes, et les messages de commit), avec les mêmes règles que
// l'étape 60-anonymat de npm run controle (anonymat/depot.mjs). L'étape 60, elle, ne fouille que les fichiers actuels.
//
// L'historique n'est pas réécrit (décision du joueur à venir) : un clone complet, ou une copie du dossier .git,
// emporte ces anciennes versions même si les fichiers actuels sont propres. Ce script ne modifie rien et ne bloque pas
// npm run controle : il dit ce qui partirait. Il rend le code 1 s'il trouve quelque chose (0 sinon), pour servir de
// garde avant un partage.
//
// Les secrets sont lus dans les vrais journaux (CONTROLE_JOURNAUX_REELS, sinon le dossier par défaut du jeu), en
// lecture seule, et jamais affichés : seulement le fichier, la version (commit) et la sorte du secret.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auteursDuDepot, fouillerHistorique, reglesDepot } from './anonymat/depot.mjs';
import { dossierJournauxReels, lireSecrets } from './anonymat/secrets.mjs';

const RACINE = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Rapport en français ; { texte, propre }. */
export function rapportHistorique({ versions, trouves, messages }, { toleres = 0 } = {}) {
  const lignes = [];
  const propre = !trouves.length && !messages.length;
  if (propre) {
    lignes.push(`Historique git propre : ${versions} versions de fichiers et tous les messages de commit, sans donnée réelle.`);
  } else {
    lignes.push(`Historique git : ${trouves.length} version(s) de fichier sur ${versions}, et ${messages.length} message(s) de commit, contiennent des données réelles.`);
    for (const t of trouves.slice(0, 60)) {
      const ou = t.lignes.length ? ` (lignes ${t.lignes.slice(0, 8).join(', ')}${t.lignes.length > 8 ? '…' : ''})` : '';
      const [ajout, ...suite] = t.commits;
      const quand = ajout ? `apparue au commit ${ajout}${suite.length ? `, changée ou retirée en ${suite.slice(0, 3).join(', ')}${suite.length > 3 ? '…' : ''}` : ''}` : 'commit inconnu';
      lignes.push(`  - ${t.chemin}${ou}, version ${t.blob} (${quand}) : ${t.sortes.join(', ')}`);
    }
    if (trouves.length > 60) lignes.push(`  … et ${trouves.length - 60} autre(s).`);
    for (const m of messages.slice(0, 20)) lignes.push(`  - message du commit ${m.commit} : ${m.sortes.join(', ')}`);
    lignes.push('Les fichiers actuels sont vérifiés par npm run controle (étape 60). Ces anciennes versions restent dans l’historique, qui n’est pas réécrit : un clone complet du dépôt les emporte. À décider avant tout partage : réécrire l’historique, ou ne partager qu’une copie sans lui.');
  }
  if (toleres) lignes.push('Hors fixtures, le nom du commandant est toléré : c’est aussi l’auteur des commits.');
  return { texte: lignes.join('\n'), propre };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dossier = dossierJournauxReels();
  const secrets = lireSecrets(dossier);
  if (!secrets) {
    console.error(`Aucun vrai journal dans ${dossier} : impossible de savoir quelles données réelles chercher. Règle CONTROLE_JOURNAUX_REELS.`);
    process.exitCode = 1;
  } else {
    try {
      const regles = reglesDepot(secrets.gele, { auteurs: auteursDuDepot(RACINE) });
      const { texte, propre } = rapportHistorique(fouillerHistorique(RACINE, regles), { toleres: regles.toleres.length });
      console.log(texte);
      console.log(`Secrets lus dans ${secrets.fichiers} journaux (${dossier}), jamais affichés.`);
      process.exitCode = propre ? 0 : 1;
    } catch (err) {
      console.error(`Historique illisible : ${err.message}`);
      process.exitCode = 1;
    }
  }
}
