// Suggestions pendant la frappe (noms de systèmes…) : une seule requête quand le joueur marque une pause, pas une par
// touche. La requête précédente est annulée (AbortController), et une réponse arrivée après une frappe plus récente
// est ignorée : les suggestions ne reviennent jamais dans le désordre.

/**
 * @param o.chercher (texte, signal) => Promise de la liste
 * @param o.recevoir liste reçue (une erreur donne [])
 * @param o.delai ms de pause avant la requête (300 par défaut)
 * @param o.min nombre de caractères avant de chercher (3 par défaut)
 * @returns {{ demander(texte), annuler() }}
 */
export function creerSuggestions({ chercher, recevoir, delai = 300, min = 3 }) {
  let minuterie = null;
  let ctrl = null;
  let numero = 0; // frappe la plus récente : seules ses réponses comptent

  function annuler() {
    if (minuterie != null) clearTimeout(minuterie);
    minuterie = null;
    ctrl?.abort();
    ctrl = null;
  }

  function demander(texte) {
    annuler();
    const n = ++numero;
    const q = String(texte ?? '');
    if (q.length < min) return;
    minuterie = setTimeout(() => {
      minuterie = null;
      ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      Promise.resolve()
        .then(() => chercher(q, ctrl?.signal))
        .then(
          (liste) => n === numero && recevoir(liste),
          (err) => n === numero && err?.name !== 'AbortError' && recevoir([]),
        );
    }, delai);
  }

  return { demander, annuler };
}
