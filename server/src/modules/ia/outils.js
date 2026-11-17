// Outils de l'IA de bord : ce qu'il peut lire de l'app pour répondre (lecture seule, par l'API locale : un module
// n'importe jamais le code d'un autre). L'essentiel lui est déjà donné d'office dans la fiche (fiche.js) ; les outils
// servent au détail. Chaque description dit aussi ce que l'outil NE sait PAS : un petit modèle
// ne fait pas la nuance seul (banc d'essai du 12 nov. 2026 : « carburant du Rhino » → le réservoir du vaisseau).
//
// Pour qu'il se serve d'une nouvelle fonction de l'app : un outil de plus ici, rien ailleurs. Ce qui agit sur l'app
// (boussole, mode, interface, pages) est dans actions.js, au même format, avec des paramètres.

/** @typedef {(chemin: string) => Promise<any>} Lire  GET sur l'API locale, JSON ou null */

const sans = (o, cles) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => !cles.includes(k))) : o);

/** @type {{ nom: string, description: string, lire: (lire: Lire) => Promise<any> }[]} */
export const OUTILS = [
  {
    nom: 'resume_commandant',
    description: 'Résumé du commandant : crédits, Powerplay (puissance, rang, mérites), système actuel (état Powerplay, puissance qui le contrôle, progression).',
    lire: (lire) => lire('/api/modules/glance/summary'),
  },
  {
    nom: 'vaisseau_actuel',
    description: 'Vaisseau principal où est le joueur : modèle, équipement (FSD, réservoir, soute, portée de saut), coque, boucliers, état des modules au dernier relevé. Pour le SRV ou la combinaison : etat_direct.',
    lire: async (lire) => {
      const [etat, combat] = await Promise.all([lire('/api/state'), lire('/api/modules/combat/session')]);
      const g = etat?.game || {};
      return { vaisseau: g.ship, equipement: g.loadout, a_quai: g.docked, station: g.station, etat: combat?.vaisseau ?? null };
    },
  },
  {
    nom: 'soute',
    description: 'Cargaison actuelle de la soute du vaisseau principal (marchandises et quantités, capacité). Pas la soute du SRV.',
    lire: async (lire) => {
      const g = (await lire('/api/state'))?.game || {};
      return { cargaison: g.cargo, total: g.cargoCount, capacite: g.loadout?.cargoCapacity ?? null };
    },
  },
  {
    nom: 'flotte',
    description: 'Tous les vaisseaux possédés par le commandant (modèle, immatriculation, surnom).',
    lire: (lire) => lire('/api/modules/builder/fleet'),
  },
  {
    nom: 'minage_rhino',
    description: 'Session de minage au sol en SRV Rhino (la dernière ou celle en cours) : minerai, site, quantités raffinées et transférées, rythme par heure, ventes. Rien sur le carburant du Rhino.',
    lire: (lire) => lire('/api/modules/waypoints/session'),
  },
  {
    nom: 'minage_vaisseau',
    description: 'Session de minage en vaisseau (astéroïdes) : soute, drones, prospection, minerais raffinés, rythme par heure.',
    lire: (lire) => lire('/api/modules/shipmining/session'),
  },
  {
    nom: 'combat_session',
    description: 'Session de combat : ennemis abattus, primes, obligations, mérites de combat, destructions, derniers kills.',
    lire: async (lire) => sans(await lire('/api/modules/combat/session'), ['vaisseau']),
  },
  {
    nom: 'powerplay_ici',
    description: 'Powerplay dans le système actuel : la puissance du joueur, les activités possibles ici et leur intérêt.',
    lire: (lire) => lire('/api/modules/whereto/context'),
  },
  // Synthèse de l'état du jeu (core/synthese.js, GET /api/etat-jeu) : tout ce que le jeu écrit, sans doublons
  {
    nom: 'etat_direct',
    description: 'État en direct (Status.json, réécrit par le jeu à chaque changement) : où est le joueur (vaisseau, SRV, chasseur, à pied), indicateurs (boucliers, train, armes, surchauffe, interdiction, danger, masse bloquée…), énergie SYS/MOT/ARM, carburant DU VÉHICULE OÙ IL EST (celui du SRV quand il est dans le SRV), écran ouvert, altitude, oxygène et santé à pied, coque, derniers événements marquants (attaques, boucliers tombés, chaleur…).',
    lire: async (lire) => {
      const v = await lire('/api/etat-jeu');
      return v && { enDirect: v.enDirect, vaisseau: v.vaisseau, srv: v.srv, combat: v.combat, evenements: v.evenements };
    },
  },
  {
    nom: 'position_detaillee',
    description: "Système et lieu actuels en détail : sécurité, économie, gouvernement, allégeance, population, factions (influence, état, réputation du joueur), Powerplay du système, station (type, distance à l'étoile), corps céleste, prochain saut de la route.",
    lire: async (lire) => {
      const v = await lire('/api/etat-jeu');
      return v && { position: v.position, route: v.route };
    },
  },
  {
    nom: 'marche_station',
    description: "Dernier marché ouvert par le joueur (station et heure de lecture) : marchandises en vente (prix d'achat, stock) et demandées (prix de vente, demande). Un seul marché : celui de la dernière station où il a ouvert le marché.",
    lire: (lire) => lire('/api/etat-jeu?partie=marche'),
  },
  {
    nom: 'materiaux',
    description: "Matériaux d'ingénierie du vaisseau (bruts, manufacturés, encodés) avec leurs quantités, tels que relevés au dernier lancement du jeu.",
    lire: (lire) => lire('/api/etat-jeu?partie=materiaux'),
  },
  {
    nom: 'missions_en_cours',
    description: 'Missions acceptées encore en cours : nom, faction, destination, échéance, récompense, marchandise ou cibles.',
    lire: (lire) => lire('/api/etat-jeu?partie=missions'),
  },
  {
    nom: 'rangs_et_ingenieurs',
    description: 'Rangs du pilote (combat, commerce, exploration, mercenaire, exobiologie, Empire, Fédération) avec leur progression en %, réputation auprès des superpuissances, ingénieurs connus et débloqués (avec leur rang), porte-vaisseaux (carburant, espace libre, solde).',
    lire: async (lire) => {
      const [v, ing] = await Promise.all([lire('/api/etat-jeu'), lire('/api/etat-jeu?partie=ingenieurs')]);
      return v && { rangs: v.rangs, reputation: v.reputation, ingenieurs: ing?.contenu ?? null, porteVaisseaux: v.porteVaisseaux };
    },
  },
  {
    nom: 'casier_et_sac',
    description: 'Odyssey (à pied) : contenu du casier du vaisseau et du sac à dos de la combinaison (objets, composants, consommables, données) avec quantités.',
    lire: async (lire) => {
      const [c, s] = await Promise.all([lire('/api/etat-jeu?partie=casier'), lire('/api/etat-jeu?partie=sac')]);
      return { casier: c?.contenu ?? null, sac: s?.contenu ?? null };
    },
  },
  {
    nom: 'regarder_ecran',
    description: "Regarde l'écran du jeu à l'instant (une image de la fenêtre d'Elite Dangerous, rien d'autre) et dit ce qu'on y voit : lieu, menus ouverts, cible, jauges et alertes visibles. Seulement quand le joueur demande ce que tu vois, ou une chose visible que les autres outils ne donnent pas : c'est plus lent (quelques secondes).",
    lire: (lire) => lire('/api/modules/ia/vision/regarder', { timeoutMs: 30_000 }),
  },
  {
    nom: 'route_navigation',
    description: 'Route tracée dans la carte de la galaxie : systèmes restants, destination, sauts. null si aucune route.',
    lire: (lire) => lire('/api/modules/navroute/session'),
  },
];

/** Définitions passées au modèle (format des outils d'Ollama) ; sans paramètres déclarés : aucun. */
export const definitions = (outils = OUTILS) => outils.map((o) => ({
  type: 'function',
  function: { name: o.nom, description: o.description, parameters: o.parametres || { type: 'object', properties: {}, required: [] } },
}));

/** Arguments d'un appel d'outil : objet, ou texte JSON selon le modèle ; {} sinon. */
export function argumentsDe(brut) {
  if (brut && typeof brut === 'object' && !Array.isArray(brut)) return brut;
  try {
    const o = JSON.parse(String(brut || '{}'));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

/** Taille maximale du résultat d'un outil donné au modèle (caractères) : le contexte reste petit, donc rapide. */
export const MAX_RESULTAT = 6000;

/**
 * Exécute un outil : son résultat en JSON (coupé s'il est trop long), ou une erreur lisible pour le modèle.
 * `args` : ses arguments ; `agir` : écriture sur l'API locale (actions.js seulement).
 */
export async function executer(nom, lire, outils = OUTILS, args = {}, agir = null) {
  const o = outils.find((x) => x.nom === nom);
  if (!o) return JSON.stringify({ erreur: `Outil inconnu : ${nom}` });
  try {
    const json = JSON.stringify((await o.lire(lire, argumentsDe(args), agir)) ?? null);
    return json.length > MAX_RESULTAT ? `${json.slice(0, MAX_RESULTAT)}… (coupé)` : json;
  } catch (err) {
    return JSON.stringify({ erreur: `Lecture impossible (${err.message}) : la partie de l'app correspondante est peut-être absente.` });
  }
}
