// Minuteries qui s'arrêtent quand la fenêtre est cachée (réduite, derrière le jeu en plein écran, onglet en arrière-plan) :
// une page qu'on ne voit pas n'a pas à se redessiner chaque seconde ni à relire le serveur toutes les 30 s. Au retour,
// la fonction est appelée tout de suite, puis la minuterie reprend.

const docParDefaut = () => (typeof document !== 'undefined' ? document : null);

/** La page est-elle visible ? (pas de document : oui, rien ne peut la cacher) */
export function pageVisible(doc = docParDefaut()) {
  return !doc || doc.visibilityState !== 'hidden';
}

/**
 * Appelle `fn` toutes les `ms` tant que la page est visible ; au retour à l'écran, `fn` tout de suite, puis la
 * minuterie repart. Renvoie la fonction qui arrête tout.
 */
export function intervalleVisible(fn, ms, doc = docParDefaut()) {
  let t = null;
  const demarrer = () => {
    if (t == null) t = setInterval(fn, ms);
  };
  const arreter = () => {
    if (t != null) clearInterval(t);
    t = null;
  };
  const surVisibilite = () => {
    if (pageVisible(doc)) {
      if (t == null) {
        fn();
        demarrer();
      }
    } else arreter();
  };
  if (pageVisible(doc)) demarrer();
  doc?.addEventListener?.('visibilitychange', surVisibilite);
  return () => {
    arreter();
    doc?.removeEventListener?.('visibilitychange', surVisibilite);
  };
}
