// Raccourcis clavier (Paramètres) : lire la combinaison que le joueur vient de presser, et l'écrire en français.
// Sans React : testé seul. Les règles d'acceptation sont celles du serveur (server/src/core/raccourcis.js).

const MODIFICATEURS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph']);

/**
 * Combinaison pressée, au format du réglage (« Alt+Shift+K »), d'après un événement clavier :
 *   - { attente: true } tant que seules des touches Ctrl, Alt ou Maj sont enfoncées ;
 *   - { touche } pour une combinaison acceptable ;
 *   - { erreur } sinon (touche seule, touche Windows, touche qui n'est ni une lettre, ni un chiffre, ni F1 à F24).
 * La touche est lue par sa place sur le clavier (`code`), pas par le caractère produit : Alt+Maj+K reste « K » quel
 * que soit ce que Maj ou Alt en font, et les chiffres du haut marchent sur un clavier français.
 */
export function combinaison(e) {
  if (MODIFICATEURS.has(e.key)) return { attente: true };
  if (e.metaKey) return { erreur: 'La touche Windows n’est pas utilisable dans un raccourci.' };
  const code = String(e.code || '');
  const lettre = /^Key([A-Z])$/.exec(code)?.[1];
  const chiffre = /^(?:Digit|Numpad)(\d)$/.exec(code)?.[1];
  const fonction = /^F(?:[1-9]|1\d|2[0-4])$/.test(code) ? code : null;
  // Lettre : celle que produit la touche sur CE clavier (A et Q échangés en azerty), si c'en est une
  const produite = typeof e.key === 'string' && /^[a-z]$/i.test(e.key) ? e.key.toUpperCase() : null;
  const touche = fonction ?? chiffre ?? produite ?? lettre;
  if (!touche) return { erreur: 'Choisis une lettre, un chiffre ou une touche F1 à F24.' };
  if (!e.ctrlKey && !e.altKey) return { erreur: 'Ajoute Ctrl ou Alt : une touche seule serait prise au jeu à chaque appui.' };
  return { touche: [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', touche].filter(Boolean).join('+') };
}

/** « Alt+Shift+K » → « Alt + Maj + K » ; rien → « aucun ». */
export function ecrire(touche) {
  return touche ? String(touche).split('+').map((p) => (p === 'Shift' ? 'Maj' : p)).join(' + ') : 'aucun';
}

/** Raccourcis utilisés deux fois dans un réglage en cours de saisie : [touches]. */
export function doubles(actions, pages) {
  const toutes = [...actions.map((a) => a.touche), ...pages.map((p) => p.touche)].filter(Boolean);
  return [...new Set(toutes.filter((t, i) => toutes.indexOf(t) !== i))];
}

/** Pages proposées pour un raccourci, d'après le plan de l'app : [{ chemin, titre }], sans doublon d'adresse. */
export function pagesProposees(chaines) {
  const vues = new Set();
  const sortie = [{ chemin: '/', titre: 'Accueil' }];
  vues.add('/');
  for (const chaine of chaines) {
    const e = chaine.at(-1);
    if (!e?.chemin || vues.has(e.chemin)) continue;
    vues.add(e.chemin);
    sortie.push({ chemin: e.chemin, titre: chaine.map((x) => x.titre).join(' › ') });
  }
  return sortie;
}
