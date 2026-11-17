// Premiers pas (carte en haut de l'accueil) : les trois choses à faire quand on ouvre l'app pour la première fois,
// cochées d'après l'état réel de l'app. Sans React : testé seul.

export const ID_BIENVENUE = 'bienvenue';

/**
 * Les étapes, dans l'ordre : [{ id, titre, fait, texte, lien, bouton }].
 *   - journal : l'app a-t-elle trouvé les journaux du jeu, et le jeu a-t-il déjà tourné ? ({ ready, file, error })
 *   - escadron : état du capteur ({ hasToken, enabled }), ou null si le module Escadron n'est pas dans cette version
 *   - mode : mode de jeu choisi (identifiant), ou null
 */
export function etapesBienvenue({ journal, escadron, mode }) {
  const jeuVu = Boolean(journal?.ready && journal?.file);
  const etapes = [{
    id: 'jeu',
    titre: 'L’app voit ton jeu',
    fait: jeuVu,
    texte: jeuVu
      ? 'Tes journaux sont lus : ton commandant, ton solde et ta position s’affichent en haut.'
      : journal?.ready
        ? 'Dossier des journaux trouvé, mais aucun journal dedans : lance Elite Dangerous une fois sur ce PC.'
        : 'L’app n’a pas trouvé les journaux du jeu. Lance Elite Dangerous une fois sur ce PC, ou indique leur dossier dans Paramètres.',
    lien: jeuVu ? null : '/parametres',
    bouton: 'Ouvrir Paramètres',
  }];
  if (escadron) {
    const inscrit = Boolean(escadron.hasToken);
    const envoi = inscrit && Boolean(escadron.enabled);
    etapes.push({
      id: 'escadron',
      titre: 'Rejoindre ton escadron',
      fait: envoi,
      texte: envoi
        ? 'Tu es inscrit et tes mérites partent au tableau de l’escadron.'
        : inscrit
          ? 'Tu es inscrit, mais l’envoi de tes mérites n’est pas activé.'
          : 'Colle le code posté par ton chef sur Discord (il commence par « ESC1. »). Facultatif : l’app marche aussi sans escadron.',
      lien: envoi ? null : '/escadron/rejoindre',
      bouton: inscrit ? 'Activer l’envoi' : 'Rejoindre l’escadron',
    });
  }
  etapes.push({
    id: 'mode',
    titre: 'Choisir un mode de jeu',
    fait: Boolean(mode),
    texte: mode
      ? 'Un mode est choisi : ses fenêtres s’affichent par-dessus le jeu.'
      : 'Dis à l’app ce que tu fais (minage, commerce, combat…) avec le bouton en haut à gauche : elle affiche les fenêtres qui vont avec, par-dessus le jeu.',
    lien: mode ? null : '/fenetres-en-jeu',
    bouton: 'Voir les fenêtres en jeu',
  });
  return etapes;
}

/** La carte se montre-t-elle ? Tant que le joueur ne l'a pas fermée (elle se ferme aussi d'elle-même, tout fait). */
export function montrerBienvenue(etat, etapes) {
  if (!etat || (etat.vus ?? []).includes(ID_BIENVENUE)) return false;
  return etapes.some((e) => !e.fait);
}
