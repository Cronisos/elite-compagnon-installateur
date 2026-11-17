// Bloc « Lecteur de journaux » des Paramètres : que montrer de l'état du lecteur (GET /api/state, champ journal).

/**
 * 'relecture' : l'historique est en cours de relecture (démarrage, dossier changé dans les Paramètres) ; le journal
 * actif affiché serait encore l'ancien, on dit plutôt que la lecture est en cours. 'pret' : journal actif et dernier
 * événement. null : état pas encore reçu.
 */
export function etatLecteur(journal) {
  if (!journal || typeof journal !== 'object') return null;
  return journal.ready === false ? 'relecture' : 'pret';
}
