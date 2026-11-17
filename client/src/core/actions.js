// Actions des boutons : une erreur de l'API locale s'affiche à côté du bouton, au lieu de partir en
// « Uncaught (in promise) » dans la console pendant que le joueur croit que son clic n'a rien fait.

/** Message d'une page qui n'a pas pu lire ses données : « Impossible de lire <quoi> : <raison> ». */
export function texteEchec(quoi, raison) {
  return `Impossible de lire ${quoi}${raison ? ` : ${raison}` : '.'}`;
}

/**
 * Lance `action` (async) ; son erreur va dans `surErreur(message)`, et une réussite l'efface (`surErreur(null)`).
 * Une requête annulée (AbortError) n'est pas une erreur. Renvoie le résultat de l'action, ou undefined en cas d'échec.
 */
export async function tenter(action, surErreur) {
  try {
    const r = await action();
    surErreur?.(null);
    return r;
  } catch (err) {
    if (err?.name !== 'AbortError') surErreur?.(err?.message || String(err));
    return undefined;
  }
}
