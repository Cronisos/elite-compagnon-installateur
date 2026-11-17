// Chargement des modules au démarrage du serveur : chacun reçoit son routeur et les services communs.
//
// Un module qui échoue à démarrer (fichier abîmé, erreur dans son register) est mis hors service côté HTTP et signalé ;
// les autres démarrent. Avant, l'erreur arrêtait tout le serveur à chaque lancement, l'app de bureau abandonnait après
// 3 relances, et plus rien n'était accessible, pas même le bouton qui aurait réparé (M6 de l'audit du 15 nov. 2026).
//
// Limite : seules ses routes sont coupées. Ce que son register a posé AVANT l'échec (écouteurs du journal, minuteries,
// abonnements, broadcast) reste actif, sur un état à moitié prêt, et peut lever à chaque événement (rattrapé et écrit
// dans le journal du serveur, comme toute erreur d'écouteur). À terme : passer à register un ctx qui note ses
// abonnements, pour les retirer en cas d'échec.
//
// Le joueur ne lit jamais l'erreur technique (souvent en anglais) : seulement err.publicMessage s'il y en a un (même
// convention que les réponses d'erreur du serveur), sinon le nom du module et quoi faire. Le détail va dans le journal.

import express from 'express';

/** Ce que le joueur peut lire de l'erreur : son publicMessage (en français), ou null. */
function publicError(err) {
  const m = err && typeof err === 'object' ? err.publicMessage : null;
  return typeof m === 'string' && m.trim() ? m.trim() : null;
}

/** Texte montré au joueur pour un module qui n'a pas pu démarrer (503 de ses routes). */
export function texteEnPanne(name, error) {
  return `« ${name} » n'a pas pu démarrer${error ? ` (${error})` : ''}. Relance l'app ; si ça recommence, signale-le avec le journal de l'app (bureau.log).`;
}

/**
 * @param {object} o
 * @param {import('express').Express} o.app
 * @param {Array<{ id: string, name: string, register: Function }>} o.modules
 * @param {object} o.ctx services communs (le routeur de chaque module est ajouté)
 * @param {(text: string, err: unknown) => void} [o.log]
 * @returns {Promise<{ mounts: Map<object, string>, enPanne: Array<{ id: string, name: string, error: string|null }> }>}
 *   mounts : routeur → chemin de montage (liste des routes du banc de contrôle) ; enPanne : modules hors service,
 *   error : texte lisible par le joueur (publicMessage) ou null
 */
export async function registerModules({ app, modules, ctx, log = (text, err) => console.error(text, err) }) {
  const mounts = new Map();
  const enPanne = [];
  for (const mod of modules) {
    const base = `/api/modules/${mod.id}`;
    const router = express.Router();
    try {
      await mod.register({ ...ctx, router });
    } catch (err) {
      const detail = (err && err.message) || String(err);
      const error = publicError(err);
      enPanne.push({ id: mod.id, name: mod.name, error });
      log(`Module « ${mod.name} » hors service : son démarrage a échoué (${detail}). Le reste de l'app démarre.`, err);
      // Ses routes répondent une erreur lisible (503) au lieu d'une page « Cannot GET » ; celles posées avant l'échec
      // ne sont jamais montées (module à moitié prêt)
      const message = texteEnPanne(mod.name, error);
      app.use(base, (req, res) => res.status(503).json({ error: message }));
      continue;
    }
    app.use(base, router);
    mounts.set(router, base);
  }
  return { mounts, enPanne };
}
