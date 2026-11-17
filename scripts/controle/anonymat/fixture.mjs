// Anonymise sur place une fixture tirée d'un vrai journal (ex. server/src/modules/routes/tests/fixtures/port-draught-
// cemiess.log), avec les mêmes remplacements que les séances du banc (anonymiser.mjs, secrets lus dans les vrais journaux
// en lecture seule), puis revérifie : s'il reste un secret, rien n'est écrit.
//   node scripts/controle/anonymat/fixture.mjs <fichier> [<fichier>…]

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { anonymizeJournal } from './anonymiser.mjs';
import { dossierJournauxReels, lireSecrets } from './secrets.mjs';
import { verifier } from '../seances/extraire.mjs';

export function anonymiserFixture(fichier, gele) {
  const texte = anonymizeJournal(fs.readFileSync(fichier, 'utf8'), gele);
  const problemes = verifier(texte, gele);
  if (problemes.length) throw new Error(`${fichier} : ${problemes.join(' ; ')} — rien n'est écrit.`);
  fs.writeFileSync(`${fichier}.tmp`, texte);
  fs.renameSync(`${fichier}.tmp`, fichier);
  return texte.split('\n').filter(Boolean).length;
}

if (process.argv[1] && pathToFileURL(fs.realpathSync.native(process.argv[1])).href === import.meta.url) {
  const fichiers = process.argv.slice(2);
  if (!fichiers.length) {
    console.error('Usage : node scripts/controle/anonymat/fixture.mjs <fichier> [<fichier>…]');
    process.exit(2);
  }
  const secrets = lireSecrets(dossierJournauxReels());
  if (!secrets) {
    console.error('Aucun vrai journal : impossible de connaître les secrets à remplacer.');
    process.exit(1);
  }
  for (const f of fichiers) console.log(`${f} : ${anonymiserFixture(f, secrets.gele)} lignes anonymisées.`);
}
