// Compilation de l'interface (vite build) dans un dossier temporaire, effacé ensuite : client/dist n'est pas touché.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lireVersionVite, trouverVite, verdictVite } from '../vite/version.mjs';

export default {
  titre: "Compilation de l'interface (vite build)",
  async lancer(ctx) {
    const vite = trouverVite(ctx.racine)?.bin ?? path.join(ctx.client, 'node_modules', 'vite', 'bin', 'vite.js');
    if (!fs.existsSync(vite)) throw new ctx.EchecEtape(`Vite introuvable (${vite}) : lance « npm install » à la racine.`);
    // Vite sert l'interface tous les jours : hors suivi, échec, sauf mise à jour déclarée en attente (avertissement)
    const v = verdictVite(lireVersionVite(ctx.racine));
    if (v.niveau === 'echec') throw new ctx.EchecEtape(v.message);
    const sortie = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-controle-vite-'));
    try {
      const r = await ctx.node([vite, 'build', '--outDir', sortie, '--emptyOutDir', '--logLevel', 'warn'], { cwd: ctx.client, journal: ctx.journal(), titre: 'Compilation' });
      if (!fs.existsSync(path.join(sortie, 'index.html'))) throw new ctx.EchecEtape('Compilation : index.html absent du résultat.', { journal: r.journal });
      const fichiers = fs.readdirSync(sortie, { recursive: true }).length;
      const avertissements = r.sortie.split('\n').filter((l) => /warn|avertissement|\(!\)/i.test(l)).length;
      const resume = `${fichiers} fichiers produits${avertissements ? `, ${avertissements} ligne(s) d'avertissement (voir le journal)` : ''}`;
      return v.niveau === 'avertissement' ? { resume, avertissement: v.message } : `${resume} (${v.message})`;
    } finally {
      fs.rmSync(sortie, { recursive: true, force: true });
    }
  },
};
