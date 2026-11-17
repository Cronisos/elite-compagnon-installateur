// Raccourcis clavier globaux de l'overlay : ce qu'il prend auprès de Windows, d'après le réglage du joueur (lu sur le
// serveur de l'app : GET /api/raccourcis, server/src/core/raccourcis.js). Tout est revérifié ici, sans confiance : un
// raccourci mal formé, sans Ctrl ni Alt, ou une page qui n'est pas une page de l'app, ne sont jamais pris. Serveur
// injoignable ou réglage illisible : les touches par défaut. Sans Electron : testé seul.

/** Touches par défaut de chaque action (les mêmes que server/src/core/raccourcis.js). */
const DEFAUTS = Object.freeze({
  souris: 'Alt+Shift+K',
  masquer: 'Alt+Shift+H',
  deplacer: 'Alt+Shift+C',
  repere: 'Alt+Shift+R',
  foreuse: 'Alt+Shift+F',
  photo: 'Alt+Shift+P',
  voix: 'Alt+Shift+V',
  quitter: 'Alt+Shift+Q',
});
const MAX_PAGES = 12;
const RACCOURCI = /^(?:Ctrl\+)?(?:Alt\+)?(?:Shift\+)?(?:[A-Z0-9]|F(?:[1-9]|1\d|2[0-4]))$/;
const CHEMIN = /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*(?:\?onglet=[a-z-]{1,40})?$/;

/** Raccourci acceptable : forme d'Electron, avec Ctrl ou Alt (jamais une touche seule, volée au jeu). */
const acceptable = (t) => typeof t === 'string' && t.length <= 30 && RACCOURCI.test(t) && /(?:Ctrl|Alt)\+/.test(t);

/**
 * Ce qu'il faut prendre : [{ touche, action }] et [{ touche, chemin }], sans doublon (le premier l'emporte).
 * `reglage` : la réponse du serveur ({ actions: [{ id, touche }], pages: [{ touche, chemin }] }), ou null.
 */
function plan(reglage) {
  const lisible = reglage && Array.isArray(reglage.actions);
  const prises = new Set();
  const sortie = [];
  const prendre = (touche, quoi) => {
    if (!acceptable(touche) || prises.has(touche)) return;
    prises.add(touche);
    sortie.push({ touche, ...quoi });
  };
  for (const id of Object.keys(DEFAUTS)) {
    const regle = lisible ? reglage.actions.find((a) => a && a.id === id) : null;
    // Action absente de la réponse : sa touche par défaut. Présente avec une touche vide : pas de raccourci.
    const touche = regle ? regle.touche : DEFAUTS[id];
    if (touche) prendre(touche, { action: id });
  }
  for (const p of (lisible && Array.isArray(reglage.pages) ? reglage.pages : []).slice(0, MAX_PAGES)) {
    if (p && typeof p.chemin === 'string' && p.chemin.length <= 120 && CHEMIN.test(p.chemin)) prendre(p.touche, { chemin: p.chemin });
  }
  return sortie;
}

module.exports = { DEFAUTS, acceptable, plan };
