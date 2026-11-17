// Catégories de réactions du compagnon : ce qui les déclenche, leur sorte, leur délai minimal, et des valeurs
// d'exemple pour les boutons « Essayer ». Données pures, partagées par le moteur, les déclencheurs et la validation
// des phrases d'un pack.
//
// Sortes :
//   normal    : respecte le délai global du bavardage, peut être tirée au sort (chance), se tait pendant un combat ;
//   important : ignore le délai global et la chance (rare et attendu : bonjour, promotion…), se tait en combat ;
//   alerte    : comme important, mais parle aussi pendant un combat (boucliers, carburant…) ;
//   critique  : comme alerte, et peut couper la parole à une alerte (destruction, coque en danger).

export const MOODS = ['neutre', 'content', 'ravi', 'inquiet', 'triste', 'malicieux', 'surpris', 'endormi'];
export const MOOD_LABELS = {
  neutre: 'Neutre',
  content: 'Content',
  ravi: 'Ravi',
  inquiet: 'Inquiet',
  triste: 'Triste',
  malicieux: 'Malicieux',
  surpris: 'Surpris',
  endormi: 'Endormi',
};
/** Image facultative d'un pack : l'humeur neutre, yeux fermés, montrée un instant de temps en temps. */
export const BLINK = 'clignement';

// Variables utilisables dans toutes les phrases
export const GLOBAL_VARS = ['cmdr', 'nom'];

const DOCK_REASONS = ['distance', 'toolarge', 'offences', 'nospace', 'hostile', 'restrictedaccess', 'activefighter', 'dockoffline', 'jumpimminent'];

/**
 * @type {{ id: string, label: string, when: string, kind: 'normal'|'important'|'alerte'|'critique', cooldown: number,
 *          chance?: number, vars: string[], cases?: string[], sample: object }[]}
 * cooldown : secondes minimales entre deux phrases de la catégorie (bavardage « normal ») ;
 * chance : probabilité de parler à chaque occasion (bavardage « normal ») ; cases : variantes propres à un cas.
 */
export const CATEGORIES = [
  {
    id: 'bonjour', label: 'Bonjour', when: 'tu arrives en jeu (selon l’heure, ou après plusieurs jours d’absence)',
    kind: 'important', cooldown: 1800, vars: ['vaisseau'], cases: ['matin', 'aprem', 'soir', 'nuit', 'retour'],
    sample: { vaisseau: 'Type-11 Prospector' },
  },
  {
    id: 'vente', label: 'Bonne vente', when: 'une vente rapporte plus que le seuil de bon bénéfice',
    kind: 'normal', cooldown: 240, vars: ['profit', 'marchandise', 'quantite', 'station'],
    sample: { profit: 4_250_000, marchandise: 'Palladium', quantite: 120, station: 'Flinders City' },
  },
  {
    id: 'jackpot', label: 'Très grosse vente', when: 'une vente rapporte plus que le seuil de très grosse vente',
    kind: 'normal', cooldown: 240, vars: ['profit', 'marchandise', 'quantite', 'station'],
    sample: { profit: 46_827_372, marchandise: 'Iridium', quantite: 268, station: 'Flinders City' },
  },
  {
    id: 'perte', label: 'Vente à perte', when: 'tu vends moins cher que ton prix d’achat',
    kind: 'normal', cooldown: 240, vars: ['perte', 'marchandise', 'quantite', 'station'],
    sample: { perte: 312_000, marchandise: 'Thé de Fujin', quantite: 40, station: 'Cheranovsky City' },
  },
  {
    id: 'merites', label: 'Mérites gagnés', when: 'tu gagnes des mérites Powerplay (cumulés sur quelques secondes)',
    kind: 'normal', cooldown: 600, chance: 0.8, vars: ['merites', 'total', 'puissance'], cases: ['gros'],
    sample: { merites: 3788, total: 1_296_017, puissance: 'Aisling Duval' },
  },
  {
    id: 'minage', label: 'Fin d’une rafale de minage', when: 'tu as raffiné au moins 5 t, puis plus rien pendant 90 s',
    kind: 'normal', cooldown: 300, vars: ['tonnes', 'minerai'], cases: ['gros'],
    sample: { tonnes: 23, minerai: 'Platine' },
  },
  {
    id: 'amarrage', label: 'Amarrage accordé', when: 'la station t’accorde une plateforme',
    kind: 'normal', cooldown: 900, chance: 0.5, vars: ['station', 'plateforme'],
    sample: { station: 'Flinders City', plateforme: 4 },
  },
  {
    id: 'refus', label: 'Amarrage refusé', when: 'la station refuse ta demande (avec la raison)',
    kind: 'normal', cooldown: 90, vars: ['station', 'raison'], cases: DOCK_REASONS,
    sample: { station: 'TST-001', raison: 'trop loin' },
  },
  {
    id: 'interception', label: 'Tentative d’interdiction', when: 'quelqu’un essaie de t’arracher au supercruise',
    kind: 'alerte', cooldown: 60, vars: [], sample: {},
  },
  {
    id: 'interdiction', label: 'Interdiction subie', when: 'l’interdiction réussit : lutte perdue ou soumission',
    kind: 'alerte', cooldown: 60, vars: ['interdicteur'], cases: ['soumis'],
    sample: { interdicteur: 'Carlos Spicy' },
  },
  {
    id: 'evasion', label: 'Interdiction évitée', when: 'tu échappes à une interdiction',
    kind: 'alerte', cooldown: 120, vars: ['interdicteur'], sample: { interdicteur: 'Cydonia' },
  },
  {
    id: 'boucliers', label: 'Boucliers tombés', when: 'les boucliers de ton vaisseau tombent pendant un combat (pas ceux du VRS ni de la combinaison)',
    kind: 'alerte', cooldown: 60, vars: [], sample: {},
  },
  {
    id: 'boucliersRetour', label: 'Boucliers rétablis', when: 'tes boucliers reviennent après être tombés',
    kind: 'alerte', cooldown: 60, vars: [], sample: {},
  },
  {
    id: 'degats', label: 'Dégâts sur la coque', when: 'ta coque descend sous 90 %',
    kind: 'alerte', cooldown: 90, vars: ['coque'], sample: { coque: 72 },
  },
  {
    id: 'coqueCritique', label: 'Coque en danger', when: 'ta coque descend sous 35 %',
    kind: 'critique', cooldown: 45, vars: ['coque'], sample: { coque: 21 },
  },
  {
    id: 'mort', label: 'Destruction', when: 'ton vaisseau est détruit (ou toi, à pied)',
    kind: 'critique', cooldown: 0, vars: [], cases: ['vaisseau', 'pied'], sample: {},
  },
  {
    id: 'reapparition', label: 'Réapparition', when: 'tu reviens après une destruction (avec le prix du rachat), en vaisseau ou à pied',
    kind: 'important', cooldown: 0, vars: ['cout'], cases: ['rachat', 'gratuit', 'pied'], sample: { cout: 20_559_981 },
  },
  {
    id: 'carburant', label: 'Carburant bas', when: 'le réservoir passe sous 25 % (le jeu l’indique)',
    kind: 'alerte', cooldown: 600, vars: ['carburant'], sample: { carburant: 22 },
  },
  {
    id: 'rang', label: 'Promotion', when: 'nouveau rang (combat, commerce, exploration…), ou rang Powerplay rond',
    kind: 'important', cooldown: 120, vars: ['domaine', 'niveau', 'puissance'], cases: ['powerplay'],
    sample: { domaine: 'Commerce', niveau: 170, puissance: 'Aisling Duval' },
  },
  {
    id: 'ingenieur', label: 'Ingénieur', when: 'un ingénieur t’invite, te débloque, ou tu atteins le grade 5',
    kind: 'important', cooldown: 60, vars: ['ingenieur'], cases: ['invite', 'debloque', 'grade5'],
    sample: { ingenieur: 'Tiana Fortune' },
  },
  {
    id: 'porteur', label: 'Saut du porteur programmé', when: 'tu programmes un saut de ton porteur',
    kind: 'normal', cooldown: 120, vars: ['systeme', 'heure'], sample: { systeme: 'Synuefe OU-E c28-2', heure: '13:01' },
  },
  {
    id: 'porteurArrivee', label: 'Porteur arrivé', when: 'le porteur sur lequel tu es amarré termine son saut',
    kind: 'normal', cooldown: 120, vars: ['systeme'], sample: { systeme: 'ICZ RY-R b4-4' },
  },
  {
    id: 'nouveauSysteme', label: 'Nouveau système (rare)', when: 'tu arrives dans un système jamais visité (pas à chaque fois)',
    kind: 'normal', cooldown: 1200, chance: 0.35, vars: ['systeme', 'distance'],
    sample: { systeme: 'Synuefe GA-I b57-6', distance: 38.42 },
  },
  {
    id: 'ennui', label: 'Longue inactivité', when: 'rien ne se passe en jeu pendant 15 min (il s’endort)',
    kind: 'normal', cooldown: 0, vars: ['minutes'], sample: { minutes: 15 },
  },
  {
    id: 'reveil', label: 'Réveil', when: 'tu reprends après une longue inactivité',
    kind: 'normal', cooldown: 0, chance: 0.7, vars: [], sample: {},
  },
  {
    id: 'aurevoir', label: 'Au revoir', when: 'tu quittes le jeu',
    kind: 'important', cooldown: 0, vars: [], sample: {},
  },
];

export const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.id, c]));

/** Les phrases ne peuvent utiliser que ces variables. */
export const varsOf = (id) => new Set([...GLOBAL_VARS, ...(CATEGORY_MAP.get(id)?.vars || [])]);
