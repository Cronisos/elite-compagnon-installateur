// Mode démonstration d'une fenêtre : « ?demo=1 » dans son adresse. Sert au tutoriel des fenêtres en jeu (page
// « Fenêtres en jeu »), qui les montre dans la fenêtre principale telles qu'elles sont pendant une partie, même chez
// un joueur qui n'a encore rien fait. Dans ce mode :
//   - les lectures (GET) viennent d'un jeu de données fictif livré avec l'app (tutoriel/demo/donnees.js : commandant
//     « Testeur », « Système Test »…), jamais du serveur ;
//   - les écritures ne font rien et ne partent nulle part : cliquer sur un bouton d'une fenêtre de démonstration ne
//     change aucune donnée du joueur ;
//   - le flux temps réel est coupé : ce que fait le joueur en jeu ne vient pas remplacer la démonstration.
// La logique est sans React ni navigateur (testée seule) ; seul `DEMO` lit l'adresse de la page.

export const PARAMETRE_DEMO = 'demo';

/** La page est-elle en démonstration ? (adresse de la fenêtre, lue une fois) */
export const estDemo = (recherche) => new URLSearchParams(String(recherche || '')).has(PARAMETRE_DEMO);
export const DEMO = typeof window !== 'undefined' && estDemo(window.location?.search);

const copie = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

/**
 * Réponse de démonstration à un appel de l'API : la donnée fictive de ce chemin (avec ses paramètres s'ils y sont,
 * sinon sans), ou null si la démonstration n'a rien pour lui. Une écriture rend la donnée du même chemin sans rien
 * changer, sinon la session fictive du même module (ce que rend l'action d'un bandeau), sinon un objet vide : jamais
 * d'erreur, jamais d'appel au serveur. Toujours une copie.
 */
export function reponseDemo(donnees, chemin, methode = 'GET') {
  const sansParametres = String(chemin).split('?')[0];
  const trouve = Object.hasOwn(donnees, chemin) ? donnees[chemin] : Object.hasOwn(donnees, sansParametres) ? donnees[sansParametres] : undefined;
  if (methode !== 'GET') {
    if (trouve !== undefined && trouve !== null) return copie(trouve);
    // Action d'un bandeau (« /modules/combat/pause », « /reset-time »…) : elle rend d'ordinaire la session du mode.
    // On rend donc la session fictive, inchangée : la fenêtre reste telle quelle au lieu de recevoir un objet vide.
    // De même pour une action sur un objet (« /modules/waypoints/sweep/center ») : l'objet lui-même, inchangé.
    for (let p = sansParametres; p.lastIndexOf('/') > 0;) {
      p = p.slice(0, p.lastIndexOf('/'));
      if (Object.hasOwn(donnees, p) && donnees[p] && typeof donnees[p] === 'object' && !Array.isArray(donnees[p])) return copie(donnees[p]);
      const session = `${p}/session`;
      if (Object.hasOwn(donnees, session) && donnees[session]) return copie(donnees[session]);
    }
    return {};
  }
  return copie(trouve);
}

let chargees = null;
/** Les données fictives, chargées à la première demande (jamais hors démonstration). */
export async function repondreEnDemo(chemin, methode) {
  chargees ??= import('./tutoriel/demo/donnees.js').then((m) => m.DONNEES);
  return reponseDemo(await chargees, chemin, methode);
}
