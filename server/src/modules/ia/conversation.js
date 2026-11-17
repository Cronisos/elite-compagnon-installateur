// Une question à l'IA de bord : la consigne, les tours avec outils, la réponse, et sa version pour la bulle.

import { definitions, executer, OUTILS } from './outils.js';

export const MAX_TOURS = 6; // appels d'outils enchaînés au plus, avant de renoncer
export const MAX_BULLE = 300; // caractères montrés dans la bulle du Compagnon
export const HISTORIQUE_MODELE = 12; // derniers messages (questions et réponses) redonnés au modèle

/** Consigne du modèle : personnage, langue, réponses courtes, outils plutôt que devinettes. */
const LONGUEUR = {
  courte: 'Tu réponds en français, en une à trois phrases courtes : ta réponse s’affiche dans une bulle à côté de ton avatar. Une liste seulement si on te la demande.',
  normale: 'Tu réponds en français, en quelques phrases : ta réponse s’affiche dans une bulle à côté de ton avatar. Une liste seulement si on te la demande.',
  detaillee: 'Tu réponds en français, en détail quand la question le demande, avec des listes si c’est plus clair.',
};

/**
 * Consigne du modèle. `personnalite` : texte libre du joueur (caractère, façon de parler), placé après les règles de
 * base, qui restent prioritaires (ne jamais inventer de chiffre).
 */
export function consigne({ nom = 'Alicia', cmdr = null, personnalite = '', longueur = 'courte', vue = false, actions = false } = {}) {
  return [
    `Tu es ${nom}, l’IA de bord ${cmdr ? `du commandant ${cmdr}` : 'du joueur'} dans le jeu Elite Dangerous. Tu le tutoies.`,
    LONGUEUR[longueur] || LONGUEUR.courte,
    'Avant chaque question, tu reçois une fiche de la partie du joueur : réponds d’abord avec elle, mot pour mot pour les chiffres. Les outils servent au détail qui n’y est pas. Ne devine jamais un chiffre.',
    'Si l’information n’est dans aucun outil, dis simplement que tu ne l’as pas, sans inventer. Sur les règles du jeu, si tu n’es pas sûr, dis-le.',
    'Les crédits du jeu s’écrivent « cr » (jamais £, € ni $).',
    // Sans cette phrase, le modèle intermédiaire inventait une fois sur deux (12 nov. 2026 : « rang 4, 72 mérites »)
    'IMPORTANT : tu ne connais RIEN de la partie du joueur en dehors de la fiche et des outils. Ce qui n’y est pas, dis que tu ne le sais pas.',
    'Si plusieurs outils peuvent répondre (minage au Rhino ou en vaisseau…), appelle-les tous plutôt que de poser une question. Réponds seulement à la dernière question, sans répéter les réponses d’avant.',
    // Vue du jeu allumée : sans cette phrase, le modèle répondait « je ne peux pas regarder l'écran » (12 nov. 2026)
    // Elle se sert de l'app, elle ne fait pas que répondre (l’auteur, 12 nov. 2026)
    ...(actions ? [
      'Tu PEUX agir sur l’app : quand le joueur te demande de montrer, guider, afficher, lancer un mode, ouvrir une page ou cacher l’interface, FAIS-LE avec les outils d’action (guider_vers_repere, changer_mode, interface, ouvrir_page…), puis dis en une phrase ce que tu as fait. Ne te contente jamais de décrire l’information.',
      'Pour un repère (« là où j’ai miné l’iridium, emplacement 25, 3 forages ») : chercher_reperes avec ses mots, puis guider_vers_repere avec l’id du meilleur ; s’il y en a plusieurs, prends le plus proche de sa demande et dis lequel. Si un outil répond une erreur, dis-le : ne prétends jamais avoir fait une action qui a échoué.',
    ] : []),
    ...(vue ? ['Tu PEUX voir l’écran du jeu : quand le joueur te demande de regarder, ce que tu vois, ou une chose visible à l’écran, appelle l’outil regarder_ecran, puis réponds d’après ce qu’il décrit. Ne dis jamais que tu ne peux pas voir.'] : []),
    ...(personnalite ? [
      'Ta personnalité et ta façon de parler, décrites par le joueur (à suivre, sauf si elles contredisent les règles ci-dessus, qui passent avant) :',
      '<<<',
      personnalite,
      '>>>',
    ] : []),
  ].join('\n');
}

/** Relance quand une réponse donne des chiffres sans qu'aucun outil n'ait été lu : ils sont sans doute inventés. */
export const RAPPEL_OUTILS = 'Tu as répondu avec des chiffres sans appeler aucun outil : ils sont inventés. Appelle maintenant les outils qui donnent ces informations, puis réponds uniquement avec leurs chiffres.';
const aDesChiffres = (t) => /\d/.test(String(t || ''));

/**
 * Répond à une question : le modèle appelle les outils dont il a besoin, puis répond.
 * @param o.chat       (messages, tools) => Promise<{ message }>  (un tour d'Ollama)
 * @param o.lire       GET sur l'API locale
 * @param o.historique [{ role: 'user' | 'assistant', texte }] des échanges précédents
 * @param o.fiche      fiche de la partie du joueur (fiche.js), donnée juste avant la question : le début de la
 *                     conversation reste le même d'une question à l'autre (Ollama le garde en cache, c'est plus rapide)
 * Une réponse avec des chiffres sans aucun outil lu est relancée une fois (RAPPEL_OUTILS) ; si elle n'en lit toujours
 * aucun, elle revient marquée nonVerifiee.
 * @returns {Promise<{ texte, appels: string[], nonVerifiee?: true }>}
 */
export async function repondre({ question, historique = [], chat, lire, agir = null, nom, cmdr, fiche = null, personnalite = '', longueur = 'courte', outils = OUTILS }) {
  const messages = [
    { role: 'system', content: consigne({ nom, cmdr, personnalite, longueur, vue: outils.some((o) => o.nom === 'regarder_ecran'), actions: outils.some((o) => o.action) }) },
    ...historique.slice(-HISTORIQUE_MODELE).map((m) => ({ role: m.role, content: m.texte })),
    ...(fiche ? [{ role: 'system', content: fiche }] : []),
    { role: 'user', content: question },
  ];
  const tools = definitions(outils);
  const appels = [];
  let relance = false;
  for (let tour = 0; tour < MAX_TOURS; tour++) {
    const { message } = await chat(messages, tools);
    if (!message) throw new Error('Réponse vide du modèle.');
    messages.push(message);
    if (!message.tool_calls?.length) {
      const texte = String(message.content || '').trim() || '…';
      // Avec la fiche, des chiffres sans outil sont normaux : ils viennent d'elle
      if (fiche || appels.length || !aDesChiffres(texte)) return { texte, appels };
      if (relance) return { texte, appels, nonVerifiee: true };
      relance = true;
      messages.push({ role: 'system', content: RAPPEL_OUTILS });
      continue;
    }
    for (const tc of message.tool_calls) {
      const nomOutil = tc.function?.name;
      appels.push(nomOutil);
      messages.push({ role: 'tool', tool_name: nomOutil, content: await executer(nomOutil, lire, outils, tc.function?.arguments, agir) });
    }
  }
  return { texte: 'Je tourne en rond dans mes outils : repose ta question autrement ?', appels };
}

/** Texte de la bulle : sans mise en forme, coupé à la fin d'une phrase s'il est trop long. */
export function pourLaBulle(texte, max = MAX_BULLE) {
  const plat = String(texte || '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*(?:[-*•]|\d+\.)\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plat.length <= max) return plat;
  const suite = ' (la suite dans la fenêtre principale)';
  const coupe = plat.slice(0, max - suite.length);
  const fin = Math.max(coupe.lastIndexOf('. '), coupe.lastIndexOf('! '), coupe.lastIndexOf('? '));
  return `${fin > 60 ? coupe.slice(0, fin + 1) : `${coupe.trimEnd()}…`}${suite}`;
}
