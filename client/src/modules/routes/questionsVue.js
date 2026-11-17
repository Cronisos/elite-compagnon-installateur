// Questions de la route active (components/RouteQuestions.jsx) : ce que devient une question après la réponse.

/**
 * Faut-il retirer la question après la réponse ? Oui si le serveur l'a prise (pas d'erreur) ou s'il ne la connaît
 * plus (404 : déjà traitée dans une autre fenêtre). Sur toute autre erreur (serveur arrêté…), on la garde pour que
 * le joueur puisse répondre à nouveau.
 */
export function questionRetiree(err) {
  return !err || err.status === 404;
}
