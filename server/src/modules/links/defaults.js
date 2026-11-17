// Liens proposés au premier lancement.
//
// Adresses VÉRIFIÉES : relevées dans le code source d'outils qui les génèrent tous les jours
// (EDMarketConnector plugins/inara.py, EDDiscovery EliteDangerousCore Inara.cs et SpanshClass.cs),
// ou dans le code du site lui-même (EDSY, coriolis-data).
// Adresses À VÉRIFIER : Inara bloque les accès automatisés, ses pages de menu n'ont pas pu être
// contrôlées. Elles sont proposées à part ; l'utilisateur les teste et les valide d'un clic.

const EDMC = 'EDMarketConnector (plugins/inara.py)';
const EDD = 'EDDiscovery (EliteDangerousCore)';
const BOTH = `${EDMC} et ${EDD}`;

export const THEMES = ['Ici et maintenant', 'Commerce', 'Ingénierie', 'Vaisseaux', 'Powerplay', 'Escadron', 'Galaxie', 'Commandant', 'Autres'];

export const DEFAULT_LINKS = [
  // Liens contextuels (remplis avec le système / la station du moment)
  { theme: 'Ici et maintenant', kind: 'system', label: 'Système sur Inara', url: 'https://inara.cz/elite/starsystem/?search={system}', source: BOTH },
  { theme: 'Ici et maintenant', kind: 'system', label: 'Système sur Spansh', url: 'https://spansh.co.uk/system/{systemAddress}', source: EDD },
  { theme: 'Ici et maintenant', kind: 'station', label: 'Station sur Inara', url: 'https://inara.cz/elite/station/?search={station}%20[{system}]', source: BOTH },
  { theme: 'Ici et maintenant', kind: 'station', label: 'Station sur Spansh', url: 'https://spansh.co.uk/station/{marketId}', source: EDD },

  // Menu : sites (pages d'accueil vérifiées)
  { theme: 'Galaxie', label: 'Inara', url: 'https://inara.cz/elite/', source: EDMC },
  { theme: 'Galaxie', label: 'Spansh', url: 'https://spansh.co.uk/', source: EDD },
  { theme: 'Vaisseaux', label: 'EDSY (constructeur de builds)', url: 'https://edsy.org/', source: 'code source EDSY' },
  { theme: 'Vaisseaux', label: 'Coriolis (constructeur de builds)', url: 'https://coriolis.io/', source: 'coriolis-data (package.json)' },

  // Pages de menu d'Inara : à vérifier
  ...[
    ['Commerce', 'Recherche de marchandises', 'https://inara.cz/elite/commodities/'],
    ['Commerce', 'Routes commerciales', 'https://inara.cz/elite/market-traderoutes/'],
    ['Ingénierie', 'Ingénieurs', 'https://inara.cz/elite/engineers/'],
    ['Ingénierie', 'Recettes (blueprints)', 'https://inara.cz/elite/blueprints/'],
    ['Ingénierie', 'Matériaux', 'https://inara.cz/elite/components/'],
    ['Vaisseaux', 'Stations les plus proches', 'https://inara.cz/elite/nearest-stations/'],
    ['Powerplay', 'Powerplay', 'https://inara.cz/elite/powerplay/'],
    ['Escadron', 'Escadrons', 'https://inara.cz/elite/squadrons/'],
    ['Galaxie', 'GalNet', 'https://inara.cz/elite/galnet/'],
    ['Galaxie', 'Objectifs communautaires', 'https://inara.cz/elite/communitygoals/'],
    ['Commandant', 'Mon profil de commandant', 'https://inara.cz/elite/cmdr/'],
  ].map(([theme, label, url]) => ({ theme, label, url, verified: false, source: 'proposition non vérifiée (Inara bloque les accès automatisés)' })),
];
