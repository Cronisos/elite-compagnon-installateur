// Mise en forme de l'IA de bord (sans React, testée) : texte des réponses, état des modèles, mémoire vidéo.

const go = (mo) => (mo / 1024).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** « 20,1 Go libres sur 22,5 », ou une explication si la mémoire vidéo est inconnue. */
export function libelleMemoire(memoire) {
  if (!memoire) return 'mémoire vidéo inconnue (pas de carte NVIDIA) : petit modèle seulement';
  return `${go(memoire.libreMo)} Go libres sur ${go(memoire.totalMo)}`;
}

/** Un modèle : son nom et son état (« chargé », « installé », « pas installé »). */
export function libelleModele(m) {
  if (!m) return '—';
  const etat = m.charge ? 'chargé' : m.installe ? 'installé' : 'pas installé';
  const taille = m.besoinMo ? ` · ${go(m.besoinMo)} Go` : '';
  return `${m.nom} (${etat}${taille})`;
}

/** Réponse en une ligne pour la fenêtre en jeu : sans mise en forme (gras, puces). */
export const pourLaBulleCourte = (texte) => String(texte || '').replace(/\*\*|__|`/g, '').replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '').replace(/\s+/g, ' ').trim();

/** Commande à taper pour installer un modèle manquant. */
export const commandeInstallation = (nom) => `ollama pull ${nom}`;

/**
 * Texte d'une réponse en blocs à afficher : paragraphes et éléments de liste, avec le gras (**…**) repéré.
 * @returns {{ liste: boolean, morceaux: { gras: boolean, texte: string }[] }[]}
 */
export function blocs(texte) {
  return String(texte || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((ligne) => {
      const puce = /^(?:[-*•]|\d+[.)])\s+/.exec(ligne);
      const corps = puce ? ligne.slice(puce[0].length) : ligne;
      const morceaux = corps.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((m) => (
        /^\*\*[^*]+\*\*$/.test(m) ? { gras: true, texte: m.slice(2, -2) } : { gras: false, texte: m }
      ));
      return { liste: Boolean(puce), morceaux };
    });
}
