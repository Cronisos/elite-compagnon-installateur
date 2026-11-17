// Bandeaux de santé de l'app (GET /api/sante, server/src/index.js) : ce qui empêche l'app de marcher et que le joueur
// peut régler lui-même. Avant, « Dossier introuvable » n'était écrit que dans Paramètres, et l'accueil continuait de dire
// « Lance le jeu » : le joueur lançait le jeu, rien ne se remplissait, et rien ne lui disait pourquoi.

/** Téléchargement des données de référence (Mon ingénierie → Données), demandé par HTTP : jamais en important le module. */
export const TELECHARGER_REFERENCE = '/modules/engineering/reference/update';

/**
 * Bandeaux à afficher, du plus bloquant au moins bloquant :
 * [{ id, ton: 'danger'|'warning', texte, lien?, action?, envoi?, bouton? }] (envoi : route POST lancée par le bouton).
 * @param {object|null} sante réponse de /api/sante
 */
export function bandeauxSante(sante) {
  if (!sante) return [];
  const out = [];
  const j = sante.journal;
  if (j?.error) {
    out.push({
      id: 'journal',
      ton: 'danger',
      texte: `L'app ne trouve pas les journaux du jeu (${j.error}). Rien ne se remplira tant que ce dossier n'est pas le bon : indique celui où le jeu écrit ses journaux (dans « Parties enregistrées », sous Frontier Developments\\Elite Dangerous).`,
      lien: '/parametres',
      action: 'Régler le dossier dans Paramètres',
    });
  }
  for (const m of Array.isArray(sante.modules) ? sante.modules : []) {
    out.push({
      id: `module-${m.id}`,
      ton: 'danger',
      // m.error : texte pour le joueur, ou null (le détail technique est dans le journal, pas ici)
      texte: `« ${m.name} » n'a pas pu démarrer${m.error ? ` (${m.error})` : ''} : ses pages restent vides. Le reste de l'app marche. Relance l'app ; si ça recommence, signale-le avec le journal de l'app (bureau.log).`,
    });
  }
  // Données de référence : retéléchargées en un clic (route du module Mon ingénierie, par HTTP), détail sur sa page
  const r = sante.reference;
  const engPanne = out.some((b) => b.id === 'module-engineering');
  const telecharger = engPanne ? {} : { envoi: TELECHARGER_REFERENCE, bouton: 'Retélécharger les données' };
  if (r?.error) {
    out.push({ id: 'reference', ton: 'danger', texte: r.error, lien: '/ingenierie/donnees', action: 'Voir le détail', ...telecharger });
  } else if (r && r.pinned === false) {
    out.push({
      id: 'reference',
      ton: 'warning',
      texte: "Les données de référence (vaisseaux, modules, recettes) ne sont pas celles de cette version de l'app : des vaisseaux ou des modules récents peuvent manquer.",
      lien: '/ingenierie/donnees',
      action: 'Voir le détail',
      ...telecharger,
    });
  }
  return out;
}

/** Texte d'accueil quand rien n'est encore lu : la vraie raison si les journaux sont introuvables. */
export function accueilVide(journal) {
  if (journal?.error) return 'Les journaux du jeu sont introuvables : règle leur dossier dans Paramètres, et ce tableau se remplira.';
  return 'Lance le jeu : ce tableau se remplit avec tes journaux.';
}
