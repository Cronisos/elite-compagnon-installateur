// Sites externes affichés dans l'app de bureau, une page chacun (« /inara », « /spansh »…). Ajouter un site : une
// entrée ici ET dans desktop/sites.js (même identifiant : c'est là que sont ses adresses permises et sa sécurité).
// Ici, seulement ce que les pages affichent ; l'interface n'envoie jamais d'adresse à l'app de bureau, seulement
// l'identifiant. Dans le cœur parce que deux modules s'en servent : la page de chaque site (modules/sites) et la page
// « Sites et applications » (modules/links), qui les propose en tête.

export const SITES = Object.freeze([
  Object.freeze({
    id: 'inara',
    titre: 'Inara',
    icone: '◈',
    description: 'Ton commandant, les marchés, les ingénieurs, le Powerplay. Ta connexion à ton compte est gardée.',
    // Pour le lien « ouvrir dans le navigateur » (hors de l'app de bureau)
    accueil: 'https://inara.cz/',
  }),
  Object.freeze({
    id: 'spansh',
    titre: 'Spansh',
    icone: '✧',
    description: 'Calculateurs de routes (neutrons, commerce, exploration) et recherche de systèmes, de stations et d’astres.',
    accueil: 'https://spansh.co.uk/',
  }),
  Object.freeze({
    id: 'edsy',
    titre: 'EDSY',
    icone: '◇',
    description: 'Le constructeur de builds EDSY : composer un vaisseau, comparer, partager un lien.',
    accueil: 'https://edsy.org/',
  }),
  Object.freeze({
    id: 'coriolis',
    titre: 'Coriolis',
    icone: '⬡',
    description: 'L’autre constructeur de builds : composer un vaisseau et ses modules.',
    accueil: 'https://coriolis.io/',
  }),
]);

/** Adresse courte pour la barre du site : domaine et chemin, sans « https:// » ni paramètres. */
export function adresseCourte(url) {
  try {
    const u = new URL(String(url));
    const chemin = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
    return `${u.hostname}${chemin}`;
  } catch {
    return '';
  }
}
