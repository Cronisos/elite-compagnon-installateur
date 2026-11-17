// Anonymat du dépôt : AUCUN fichier suivi par git (ni nouveau fichier non ignoré) ne contient une donnée réelle du
// joueur. Les secrets sont lus dans ses vrais journaux (lecture seule) et gardés en mémoire : jamais écrits, jamais
// affichés (le rapport donne le fichier, la ligne et la sorte du secret, pas la valeur). Règles : anonymat/depot.mjs.
//   - partout : FID (même au milieu d'un mot), escadron et son numéro, porteurs (nom, indicatif, identifiant), amis et
//     coéquipiers, autres joueurs, noms et identifiants de vaisseaux (mots entiers) ;
//   - fixtures (séances, attendus, options et pages du banc ; fixtures/ et __golden__/ du serveur et du client) : nom
//     du commandant aussi, même au milieu d'un mot ; séances sans chat ni indicatif de porteur non anonymisé ;
//   - ailleurs, le nom du commandant n'est toléré que s'il est aussi le nom d'auteur des commits (déjà public).
// Avant, seules les fixtures étaient fouillées pour le nom et les autres secrets, et le reste du dépôt pour le FID
// seulement : de vrais porteurs, escadron et noms de joueurs sont restés dans des tests et du code, étape au vert.
//
// L'historique git n'est pas fouillé ici (il n'est pas réécrit, décision du joueur à venir) : npm run
// controle:historique le vérifie à part, sans bloquer ce contrôle.
//
// Sans vrais journaux sur ce PC : échec, sauf CONTROLE_SANS_JOURNAUX=1 (étape sautée, contrôle incomplet).

import fs from 'node:fs';
import path from 'node:path';
import { strayCallsigns } from '../anonymat/anonymiser.mjs';
import { auteursDuDepot, fouillerDepot, parFichier, reglesDepot, texteAFouiller } from '../anonymat/depot.mjs';
import { dossierJournauxReels, lireSecrets } from '../anonymat/secrets.mjs';

const lister = (dossier) => (fs.existsSync(dossier)
  ? fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? lister(path.join(dossier, e.name)) : [path.join(dossier, e.name)]))
  : []);

export default {
  titre: 'Anonymat du dépôt (nom du commandant, FID, porteurs, escadron, autres joueurs)',
  async lancer(ctx) {
    const dossier = dossierJournauxReels();
    const secrets = lireSecrets(dossier);
    if (!secrets) {
      if (process.env.CONTROLE_SANS_JOURNAUX === '1') return { saute: `aucun vrai journal dans ${dossier} (CONTROLE_SANS_JOURNAUX=1)` };
      throw new ctx.EchecEtape(`Aucun vrai journal dans ${dossier} : impossible de savoir quelles données réelles chercher. Règle CONTROLE_JOURNAUX_REELS, ou CONTROLE_SANS_JOURNAUX=1 pour sauter (contrôle incomplet).`);
    }
    if (!secrets.commandants || !secrets.fids) throw new ctx.EchecEtape('Les vrais journaux ne donnent ni nom de commandant ni FID : contrôle impossible.');
    const regles = reglesDepot(secrets.gele, { auteurs: auteursDuDepot(ctx.racine) });

    // Les fixtures sont fouillées même si git les ignore (un .log de fixtures/ ajouté plus tard partirait avec le dépôt)
    const banc = ['seances', 'attendu', 'options', 'pages'].flatMap((d) => lister(path.join(ctx.controle, d)));
    const modules = ['server/src', 'client/src'].flatMap((d) => lister(path.join(ctx.racine, d)))
      .filter((f) => /[\\/](fixtures|__golden__)[\\/]/.test(f));
    const { fichiers, fixtures, trouves } = fouillerDepot(ctx.racine, regles, { autres: [...banc, ...modules] });
    const problemes = parFichier(trouves);
    for (const f of banc) {
      const rel = path.relative(ctx.racine, f).replace(/\\/g, '/');
      if (!rel.includes('/seances/') || !rel.endsWith('.log')) continue;
      const texte = texteAFouiller(fs.readFileSync(f), rel);
      const indicatifs = strayCallsigns(texte);
      if (indicatifs.length) problemes.push(`${rel} : ${indicatifs.length} indicatif(s) de porteur non anonymisé(s)`);
      if (/"event"\s*:\s*"(ReceiveText|SendText)"/.test(texte)) problemes.push(`${rel} : message de chat`);
    }
    if (problemes.length) {
      throw new ctx.EchecEtape(`${problemes.length} fichier(s) avec des données réelles. Remplace-les par des valeurs fictives (« PORTEUR 1 », « TST-001 », 3700000001, « Escadron Test », « Coéquipier 1 »…) ; pour une séance, relance l'extraction (node scripts/controle/seances/extraire.mjs).`, { details: problemes.slice(0, 40).join('\n') });
    }
    const tolere = regles.toleres.length ? ' ; hors fixtures, le nom du commandant est toléré : c’est aussi l’auteur des commits' : '';
    return `${fichiers} fichiers du dépôt sans donnée réelle (dont ${fixtures} fixtures, aussi sans nom du commandant)${tolere} ; secrets lus dans ${secrets.fichiers} journaux ; historique git à part : npm run controle:historique`;
  },
};
