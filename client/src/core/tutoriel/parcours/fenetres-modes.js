// Tutoriels des fenêtres en jeu des modes Minage vaisseau, Combat, Combat au sol, Sauvetage, Matériaux et Colonisation
// (voir ../moteur.js pour la forme d'un parcours). Chaque parcours se lance sur /fenetres-en-jeu/<mode>, où la fenêtre
// est montrée en démonstration : ses étapes portent `fenetre`, et leur cible est cherchée dans cette fenêtre.
//
// Ces fenêtres sont des bandeaux du cadre commun (core/hud.jsx, HudFrame) : les cibles sont ses classes. Dans la ligne
// des cases (.hud-row), le premier enfant est le bloc du titre (.hud-id) : la première case est donc :nth-child(2).
// En démonstration, le bouton de déplacement et le bouton pause du coin n'existent pas (ils viennent de l'overlay) :
// ils sont expliqués sur la ligne du bas, là où ils apparaissent en jeu.
//
// Aucun clic n'est demandé : les seuls boutons présents en démonstration règlent le chrono (pause, remise à zéro).

const caseN = (n) => `.hud-row > .hud-cell:nth-child(${n + 1})`;

/** Le chrono, ses pauses et sa remise à zéro : les mêmes dans tous les bandeaux qui ont une session. */
const chrono = (fenetre, depart) => [
  {
    fenetre,
    cible: '.hud-chrono',
    titre: 'Le chrono de la session',
    texte: `Le temps que tu as vraiment passé à jouer depuis le début de la session, pauses déduites. ${depart}`,
  },
  {
    fenetre,
    cible: '.hud-live',
    titre: 'En direct, ou en pause',
    texte: '« En direct » : le chrono tourne. Sinon, la raison de la pause est écrite ici. Il s’arrête tout seul quand tu es à quai (station ou porteur) jusqu’à ton départ, quand le jeu est fermé, et quand tu ne fais plus rien depuis plus de 10 minutes : là, il repart à ta prochaine action.',
  },
  {
    fenetre,
    cible: '.hud-live',
    titre: 'Ta propre pause',
    texte: 'En jeu, un clic sur ce texte met le chrono en pause, un autre le relance. Un bouton pause fait la même chose au bout de la ligne du bas. Si tu es à quai, le chrono reste arrêté jusqu’à ton départ, même après une reprise.',
  },
  {
    fenetre,
    cible: '.hud-reset-time',
    titre: 'Remettre le chrono à zéro',
    texte: 'Cette flèche remet le temps affiché à zéro, et rien d’autre : les compteurs des cases et les chiffres par heure gardent toute la session. Il faut cliquer deux fois, la flèche devient « ↺ ? » entre les deux, pour éviter une remise à zéro par erreur.',
  },
];

/** Clics, déplacement et raccourcis : valables pour toutes les fenêtres, dits une fois par parcours. */
const enJeu = (fenetre, cible = '.hud-last') => [
  {
    fenetre,
    cible,
    titre: 'En jeu : clics et déplacement',
    texte: 'En jeu, la fenêtre laisse passer tes clics vers le jeu, sauf sur ses boutons. Au bout de cette ligne, le bouton ✥ passe en mode déplacement : fais glisser le cadre, puis clique sur l’épingle pour le fixer. La place est retenue. Ce bouton n’existe qu’en jeu, pas dans cette démonstration.',
  },
  {
    titre: 'Les raccourcis clavier',
    texte: 'Ils marchent même en jeu, pour toutes les fenêtres. Alt+Maj+C : mode déplacement, puis fixer. Alt+Maj+H : masquer ou réafficher. Alt+Maj+K : mode souris, les fenêtres deviennent cliquables ; refais-le, ou clique dans le jeu, pour lui rendre la main. Le jeu doit être en plein écran fenêtré.',
  },
];

const PROPOSITION = 'Cette ligne sert aussi à l’app pour te parler : si elle pense que tu fais autre chose, elle y propose un autre mode de jeu, avec « Oui » et « Non ».';
const DEPART = 'Une session commence au lancement du jeu, et repart de zéro quand tu passes à ce mode depuis un autre.';

export const PARCOURS_FENETRES_MODES = [
  {
    id: 'jeu-shipmining',
    titre: 'Fenêtres en jeu : Minage vaisseau',
    chemin: '/fenetres-en-jeu/shipmining',
    etapes: [
      {
        titre: 'Le bandeau du minage en vaisseau',
        texte: 'Quand tu choisis le mode « Minage vaisseau », ce bandeau s’affiche par-dessus le jeu. Il te dit si l’astéroïde que tu viens de sonder vaut le coup, et où en sont ta soute et ton raffinage. Ici, c’est une démonstration avec des données d’exemple.',
      },
      ...chrono('shipmining', DEPART),
      {
        fenetre: 'shipmining',
        cible: caseN(1),
        titre: 'Soute',
        texte: 'Les tonnes que tu as en soute en ce moment. Dessous : la place qui reste, puis le nombre de drones encore en soute. Tout change dès que ta soute change : minerai raffiné, drone lancé, vente.',
      },
      {
        fenetre: 'shipmining',
        cible: caseN(2),
        titre: 'Raffinés',
        texte: 'Les tonnes sorties de ta raffinerie depuis le début de la session : une de plus à chaque tonne raffinée. Dessous, ton rythme en tonnes par heure, calculé sur la dernière demi-heure. Il apparaît après dix minutes de raffinage.',
      },
      {
        fenetre: 'shipmining',
        cible: caseN(3),
        titre: 'Dernier astéroïde',
        texte: 'Lance un drone prospecteur sur un astéroïde : la case donne sa valeur estimée en crédits par tonne collectée, et un verdict. Vert « bon » à partir de 40 000 cr/t, jaune « moyen » à partir de 15 000, rouge « à laisser » en dessous.',
      },
      {
        fenetre: 'shipmining',
        cible: caseN(3),
        titre: 'D’où vient cette valeur',
        texte: 'C’est la teneur de chaque minerai multipliée par un prix relevé une fois : elle sert à comparer les astéroïdes, pas à connaître le prix du jour. Si aucun de ses minerais n’a de prix connu, la case affiche la teneur du meilleur minerai : bon dès 30 %, moyen dès 15 %.',
      },
      {
        fenetre: 'shipmining',
        cible: '.hud-last',
        titre: 'Le détail de l’astéroïde',
        texte: 'Après un prospecteur, cette ligne liste les minerais de l’astéroïde, chacun avec sa teneur et sa valeur. Elle signale aussi un filon mère, et un astéroïde déjà miné avec ce qu’il en reste. Tant que tu n’as rien sondé, elle le dit.',
      },
      {
        fenetre: 'shipmining',
        cible: '.hud-last',
        titre: 'Une proposition de mode',
        texte: PROPOSITION,
      },
      ...enJeu('shipmining'),
    ],
  },
  {
    id: 'jeu-combat',
    titre: 'Fenêtres en jeu : Combat',
    chemin: '/fenetres-en-jeu/combat',
    etapes: [
      {
        titre: 'Le bandeau du combat',
        texte: 'Quand tu choisis le mode « Combat », ce bandeau s’affiche par-dessus le jeu. Il compte tes ennemis abattus, tes primes et tes mérites, et surveille ta coque. Ici, c’est une démonstration avec des données d’exemple.',
      },
      ...chrono('combat', DEPART),
      {
        fenetre: 'combat',
        cible: caseN(1),
        titre: 'Abattus',
        texte: 'Le nombre d’ennemis que tu as abattus pendant la session : chaque prime, chaque obligation de combat, chaque vaisseau capital et chaque joueur compte pour un. Si ton vaisseau est détruit, le nombre de tes destructions s’écrit dessous.',
      },
      {
        fenetre: 'combat',
        cible: caseN(2),
        titre: 'Primes',
        texte: 'Les crédits gagnés au combat pendant la session : primes et obligations de combat réunies. Dessous, ton gain par heure de jeu. Il n’apparaît qu’après cinq minutes de session, pour éviter les chiffres absurdes du début.',
      },
      {
        fenetre: 'combat',
        cible: caseN(3),
        titre: 'Mérites',
        texte: 'Tes mérites Powerplay gagnés en combat. Le jeu ne dit pas d’où vient un mérite : l’app le compte ici s’il arrive dans la minute qui suit un signe de combat (cible verrouillée, attaque subie, ennemi abattu), et pas juste après une vente ou une livraison.',
      },
      {
        fenetre: 'combat',
        cible: caseN(4),
        titre: 'Coque',
        texte: 'L’état de ta coque. Le jeu ne l’écrit que par paliers d’environ 20 %. La case est verte, orange sous 60 %, et clignote en rouge sous ton seuil d’alerte : 40 % au départ, réglable sur la page Combat de l’app.',
      },
      {
        fenetre: 'combat',
        cible: caseN(4),
        titre: 'Boucliers et modules',
        texte: 'Sous la coque, « boucliers ↓ » s’affiche quand tes boucliers sont tombés. Un contour rouge et « 2 mod. < 40 % » signalent des modules sous le seuil. Attention : le jeu ne donne l’état des modules qu’au dernier relevé du vaisseau, jamais en plein combat.',
      },
      {
        fenetre: 'combat',
        cible: '.hud-last',
        titre: 'Le dernier ennemi abattu',
        texte: 'Après chaque victoire : le vaisseau abattu, sa faction, l’heure, et à droite ce qu’il t’a rapporté en crédits et en mérites. Si des modules sont sous le seuil, la ligne passe en rouge et les liste avec leur état et l’heure du relevé.',
      },
      {
        fenetre: 'combat',
        cible: '.hud-last',
        titre: 'Une proposition de mode',
        texte: PROPOSITION,
      },
      ...enJeu('combat'),
    ],
  },
  {
    id: 'jeu-groundcombat',
    titre: 'Fenêtres en jeu : Combat au sol',
    chemin: '/fenetres-en-jeu/groundcombat',
    etapes: [
      {
        titre: 'Le bandeau du combat au sol',
        texte: 'Quand tu choisis le mode « Combat au sol », ce bandeau s’affiche par-dessus le jeu. Il compte ce que tu fais à pied : ennemis abattus, gains et mérites. Ce que tu gagnes en vaisseau reste au mode Combat. Ici, c’est une démonstration.',
      },
      ...chrono('groundcombat', 'Une session commence au lancement du jeu. Choisir ce mode en plein combat ne la remet pas à zéro, et relancer le jeu moins de 30 minutes après ta dernière action la continue.'),
      {
        fenetre: 'groundcombat',
        cible: caseN(1),
        titre: 'Kills',
        texte: 'Les ennemis que tu as abattus à pied : un de plus à chaque obligation de combat ou prime gagnée une fois descendu du vaisseau. Dessous, ton rythme par heure, mesuré entre ton premier et ton dernier kill, puis tes morts s’il y en a.',
      },
      {
        fenetre: 'groundcombat',
        cible: caseN(2),
        titre: 'Gains',
        texte: 'Les crédits gagnés à pied pendant la session : obligations de combat et primes réunies. Dessous, la part des primes si tu en as touché, puis ton gain par heure de jeu, affiché après cinq minutes de session.',
      },
      {
        fenetre: 'groundcombat',
        cible: caseN(3),
        titre: 'Mérites',
        texte: 'Les mérites Powerplay que tu gagnes pendant que tu es à pied. Dessous, le nombre par heure de jeu, affiché lui aussi après cinq minutes de session.',
      },
      {
        fenetre: 'groundcombat',
        cible: '.hud-last',
        titre: 'Le dernier kill, ou la guerre',
        texte: 'Après un kill : la faction de l’ennemi abattu, l’heure et le gain. Avant le premier, la ligne montre la guerre du système où tu es, avec les jours gagnés par chaque camp. Sans guerre, elle dit si tu es à pied ou non.',
      },
      {
        fenetre: 'groundcombat',
        cible: '.hud-last',
        titre: 'Une proposition de mode',
        texte: PROPOSITION,
      },
      ...enJeu('groundcombat'),
    ],
  },
  {
    id: 'jeu-rescue',
    titre: 'Fenêtres en jeu : Sauvetage',
    chemin: '/fenetres-en-jeu/rescue',
    etapes: [
      {
        titre: 'Le bandeau du sauvetage',
        texte: 'Quand tu choisis le mode « Sauvetage », ce bandeau s’affiche par-dessus le jeu. Il compte ce que tu ramasses dans les épaves, ce que tu as en soute, et ce que tes livraisons te rapportent. Ici, c’est une démonstration avec des données d’exemple.',
      },
      ...chrono('rescue', DEPART),
      {
        fenetre: 'rescue',
        cible: caseN(1),
        titre: 'Nacelles',
        texte: 'Les nacelles de survie que tu as récupérées pendant la session, endommagées ou occupées : une de plus à chaque nacelle ramassée. Dessous, celles qui sont dans ta soute en ce moment, donc pas encore livrées.',
      },
      {
        fenetre: 'rescue',
        cible: caseN(2),
        titre: 'Boîtes noires',
        texte: 'Même principe pour les boîtes noires : en grand, celles ramassées pendant la session, et dessous celles qui attendent dans ta soute.',
      },
      {
        fenetre: 'rescue',
        cible: caseN(3),
        titre: 'Débris',
        texte: 'Les débris d’épave ramassés pendant la session, et ceux encore en soute. Les autres objets de sauvetage que tu ramasses n’ont pas de case à eux, mais leurs livraisons comptent dans tes récompenses.',
      },
      {
        fenetre: 'rescue',
        cible: caseN(4),
        titre: 'Récompenses',
        texte: 'Les crédits versés par le contact de recherche et sauvetage d’une station, à chaque livraison. Dessous, ton gain par heure de jeu, affiché après cinq minutes de session.',
      },
      {
        fenetre: 'rescue',
        cible: caseN(5),
        titre: 'Mérites',
        texte: 'Les mérites Powerplay de tes livraisons : l’app compte ici ceux qui arrivent dans les dix secondes après une livraison au contact de recherche et sauvetage. Dessous, le nombre par heure de jeu.',
      },
      {
        fenetre: 'rescue',
        cible: '.hud-last',
        titre: 'La dernière action',
        texte: 'Ce que tu viens de faire : « Récupéré », « Largué » ou « Livré », avec l’objet, le nombre et l’heure. Pour une livraison, les crédits et les mérites gagnés s’ajoutent à droite. L’app peut aussi y proposer un autre mode de jeu, avec « Oui » et « Non ».',
      },
      {
        fenetre: 'rescue',
        cible: '.rg-ligne',
        titre: 'Les matériaux ramassés',
        texte: 'Les matériaux d’ingénierie ramassés pendant la session, comptés par grade, de G1 à G5, puis le total. Passe la souris sur cette ligne : la liste complète s’ouvre dans le cadre, avec le nom et le nombre de chaque matériau.',
      },
      ...enJeu('rescue'),
    ],
  },
  {
    id: 'jeu-materials',
    titre: 'Fenêtres en jeu : Matériaux',
    chemin: '/fenetres-en-jeu/materials',
    etapes: [
      {
        titre: 'Le bandeau des matériaux',
        texte: 'Quand tu choisis le mode « Matériaux », ce bandeau s’affiche par-dessus le jeu. Il compte les matériaux d’ingénierie que tu ramasses pendant ta sortie, par catégorie et par grade. Ici, c’est une démonstration avec des données d’exemple.',
      },
      ...chrono('materials', DEPART),
      {
        fenetre: 'materials',
        cible: caseN(1),
        titre: 'Bruts',
        texte: 'Les matériaux bruts ramassés pendant la session. Le chiffre monte à chaque matériau de cette catégorie que tu récupères, du nombre d’unités ramassées.',
      },
      {
        fenetre: 'materials',
        cible: caseN(2),
        titre: 'Manufacturés',
        texte: 'Les matériaux manufacturés ramassés pendant la session, comptés de la même façon : en unités, à chaque ramassage.',
      },
      {
        fenetre: 'materials',
        cible: caseN(3),
        titre: 'Encodés',
        texte: 'Les matériaux encodés, c’est-à-dire les données. Ils se comptent de la même façon, dès que le jeu t’en donne.',
      },
      {
        fenetre: 'materials',
        cible: '.hud-last',
        titre: 'Par grade, et le dernier ramassé',
        texte: 'Les mêmes matériaux, comptés cette fois par grade, de G1 à G5. À droite, en vert, le dernier que tu as ramassé : son nom, son grade et le nombre d’unités. Il apparaît à ton premier ramassage.',
      },
      {
        fenetre: 'materials',
        cible: '.hud-last',
        titre: 'Une proposition de mode',
        texte: PROPOSITION,
      },
      ...enJeu('materials'),
    ],
  },
  {
    id: 'jeu-colonisation',
    titre: 'Fenêtres en jeu : Colonisation',
    chemin: '/fenetres-en-jeu/colonisation',
    etapes: [
      {
        titre: 'Les fenêtres de la colonisation',
        texte: 'Le mode « Colonisation » ouvre deux fenêtres par-dessus le jeu : un bandeau qui résume ton chantier, et la liste de courses de ce qu’il reste à acheter. Ici, aucun chantier n’est suivi : les cases sont vides, et ce tutoriel te dit ce qu’elles afficheront.',
      },
      {
        fenetre: 'colonisation',
        cible: '.hud-id',
        titre: 'Un seul chantier, sans chrono',
        texte: 'Ce bandeau n’a pas de chrono : il n’y a rien à chronométrer. Il suit un seul chantier : celui où tu es à quai, sinon celui que tu as épinglé dans sa fiche de l’app, sinon le dernier chantier en cours où il s’est passé quelque chose.',
      },
      {
        fenetre: 'colonisation',
        cible: caseN(1),
        titre: 'Avancement',
        texte: 'Le pourcentage d’avancement du chantier. Dessous, d’où vient ce chiffre : « lu au dépôt » quand le jeu l’a donné sur place, « estimé (tes livraisons) » quand l’app le déduit de ce que tu as livré, « pas encore lu », ou « terminé ».',
      },
      {
        fenetre: 'colonisation',
        cible: caseN(2),
        titre: 'Reste',
        texte: 'Les tonnes qu’il reste à livrer au chantier, et dessous le total demandé. Un « ? » veut dire que l’app ne connaît pas encore les besoins : ouvre le contact de colonisation du chantier pour qu’elle les lise.',
      },
      {
        fenetre: 'colonisation',
        cible: caseN(3),
        titre: 'À acheter',
        texte: 'Ce qu’il te reste vraiment à acheter : le reste à livrer, moins ce que tu as déjà en soute pour ce chantier. Dessous, les tonnes en soute, ou « rien en soute ».',
      },
      {
        fenetre: 'colonisation',
        cible: caseN(4),
        titre: 'Trajets',
        texte: 'Le nombre de trajets qu’il te reste à faire avec la soute du vaisseau que tu pilotes. Dessous, la taille de cette soute. Change de vaisseau, et le compte change avec lui.',
      },
      {
        fenetre: 'colonisation',
        cible: '.hud-last',
        titre: 'Le chantier et les premiers achats',
        texte: 'L’étiquette dit pourquoi ce chantier est affiché : « À quai », « Épinglé » ou « Dernier en cours ». Puis son nom, et les trois marchandises à acheter en premier, les plus grosses quantités d’abord. Sans chantier, la ligne te dit de t’amarrer à un dépôt de construction.',
      },
      {
        fenetre: 'colonisation-list',
        cible: '.hud-panel-head',
        titre: 'La liste de courses',
        texte: 'Cette seconde fenêtre s’ouvre avec le mode. Elle détaille, pour le même chantier, tout ce qu’il reste à acheter, soute déduite. C’est elle que tu gardes sous les yeux au marché.',
      },
      {
        fenetre: 'colonisation-list',
        cible: '.hud-panel-body',
        titre: 'Ce qu’elle affiche',
        texte: 'Avec un chantier suivi : son nom et son avancement en haut, puis une ligne par marchandise, les plus grosses quantités d’abord, douze au plus. Chaque ligne donne les tonnes à acheter, et ce que tu en as déjà en soute.',
      },
      {
        fenetre: 'colonisation-list',
        cible: '.hud-panel-body',
        titre: 'Déjà en soute',
        texte: 'Une marchandise dont tu as déjà tout le reste en soute passe en vert, avec une coche et « en soute » : plus rien à acheter, il faut la livrer. Quand tout est livré, la fenêtre écrit « Plus rien à livrer » ou « Chantier terminé ».',
      },
      {
        fenetre: 'colonisation-list',
        cible: '.hud-panel',
        titre: 'Le bas de la liste',
        texte: 'Une fois les besoins lus, la ligne du bas rappelle le nombre de trajets et la taille de ta soute. La fenêtre prend d’elle-même la hauteur de sa liste. En mode déplacement, deux flèches en haut à droite règlent sa largeur.',
      },
      ...enJeu('colonisation'),
    ],
  },
];
