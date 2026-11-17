// Tutoriels du groupe activites (voir ../moteur.js pour la forme d'un parcours) : la rubrique Activités, Combat,
// Combat au sol, Sauvetage, Collecte de matériaux, Colonisation (liste et fiche d'un chantier) et Bilans de session.
//
// Les boutons « Afficher la fenêtre » et « Pause » viennent du cadre commun (core/overlay.jsx, core/hud.jsx) : ils sont
// visés par leur infobulle. « Afficher la fenêtre » est remplacé par un texte quand les fenêtres en jeu ne sont pas
// installées : son étape est alors sautée.
//
// Ordre à garder : « activites-colonisation » avant « activites-chantier ». Les deux ont la même adresse ; le premier
// vaut pour la liste, le second (sousPages) pour la fiche d'un chantier, et à égalité le moteur prend le premier.

const FENETRE = 'button[title="Fenêtre par-dessus le jeu"]';
const PAUSE = 'button[title^="Le chrono se met aussi en pause"]';

export const PARCOURS_ACTIVITES = [
  {
    id: 'activites-rubrique',
    titre: 'Activités',
    chemin: '/activites',
    etapes: [
      {
        titre: 'Tes activités',
        texte: 'Cette page range tout ce que tu fais en jeu : commerce, minage, combat, sauvetage, collecte de matériaux, colonisation. Chaque activité a sa page, qui compte ce que tu fais pendant que tu joues.',
      },
      {
        cible: '.rub-cartes',
        titre: 'Une carte par activité',
        texte: 'Chaque carte porte le nom d’une activité et dit en une ligne ce que sa page suit. La dernière, « Bilans de session », résume tes sessions de jeu, toutes activités confondues.',
      },
      {
        cible: '.rub-carte .rub-tete',
        titre: 'Ouvrir une page',
        texte: 'Clique sur le titre d’une carte pour ouvrir sa page. Tu pourras le faire dès la fin de ce tutoriel.',
      },
      {
        cible: '.rub-sous',
        titre: 'Les pages d’une activité',
        texte: 'Quand une activité a plusieurs pages, elles sont listées dans sa carte. Le minage en a deux : au Rhino, sur une planète, ou en vaisseau.',
      },
      {
        cible: '.mode-button',
        titre: 'Les suivre en jeu',
        texte: 'Les pages se lisent ici. Pour suivre une activité pendant que tu joues, choisis son mode avec ce bouton : l’app ouvre alors sa fenêtre par-dessus le jeu.',
      },
      {
        cible: '.fil',
        titre: 'Revenir ici',
        texte: 'Ce fil montre où tu es dans l’app. Depuis la page d’une activité, clique sur « Activités » dans ce fil pour revenir à ces cartes.',
      },
    ],
  },
  {
    id: 'activites-combat',
    titre: 'Combat',
    chemin: '/combat',
    etapes: [
      {
        titre: 'Ta session de combat',
        texte: 'Cette page compte tes combats en vaisseau pendant que tu joues : ennemis abattus, primes, obligations de combat et mérites. Tu n’as rien à saisir, l’app lit le journal du jeu.',
      },
      {
        cible: '.mode-button',
        titre: 'En jeu : le mode « Combat »',
        texte: 'Avant de te battre, choisis le mode « Combat » avec ce bouton : l’app affiche par-dessus le jeu tes ennemis abattus, tes primes, tes mérites et l’état de ta coque.',
      },
      {
        cible: '[data-tuto="activites-combat-session"]',
        titre: 'La session en cours',
        texte: 'Une session commence au lancement du jeu, ou quand tu la remets à zéro. Cette ligne donne son heure de début, sa durée, l’heure de ton dernier kill et tes destructions.',
      },
      {
        cible: '[data-tuto="activites-combat-tuiles"]',
        titre: 'Tes chiffres',
        texte: 'Les ennemis abattus, les crédits des primes et des obligations, les mérites gagnés en combat, et tes gains par heure. Le « par heure » apparaît après cinq minutes de session.',
      },
      {
        cible: '[data-tuto="activites-combat-alerte"]',
        titre: 'L’alerte du vaisseau',
        texte: 'Règle ici le pourcentage sous lequel l’app te prévient : coque ou module en dessous du seuil. Les boutons −5 et +5 le changent d’un cran, ou tape un nombre entre 5 et 95. En dessous, la page liste l’état de tes modules au dernier relevé.',
      },
      {
        cible: '[data-tuto="activites-combat-kills"]',
        titre: 'Tes derniers kills',
        texte: 'Chaque ennemi abattu s’ajoute ici : l’heure, son vaisseau, son pilote, sa faction, ce qu’il rapporte et les mérites. Un vaisseau abattu sans prime ni obligation n’est pas écrit par le jeu : il n’est pas compté.',
      },
      {
        cible: FENETRE,
        titre: 'Afficher la fenêtre',
        texte: 'Ce bouton passe en mode « Combat » et ouvre sa fenêtre par-dessus le jeu, comme le bouton du mode de jeu. Quand la fenêtre est ouverte, le même bouton sert à la masquer.',
      },
      {
        cible: PAUSE,
        titre: 'Mettre le chrono en pause',
        texte: 'Le chrono sert à calculer tes gains par heure. Mets-le en pause quand tu t’absentes, puis clique sur « Reprendre ». Il se met aussi en pause tout seul à quai et quand le jeu est fermé.',
      },
      {
        cible: '[data-tuto="activites-combat-zero"]',
        titre: 'Remettre à zéro',
        texte: 'Efface les compteurs et repart d’une session neuve, par exemple avant une soirée de chasse aux primes. L’app te demande de confirmer. L’état du vaisseau, lui, est gardé.',
      },
    ],
  },
  {
    id: 'activites-combat-sol',
    titre: 'Combat au sol',
    chemin: '/combat-au-sol',
    etapes: [
      {
        titre: 'Tes combats à pied',
        texte: 'Cette page suit tes combats à pied : kills, gains, mérites et morts, d’après le journal du jeu. Elle montre aussi les guerres du système où tu es.',
      },
      {
        cible: '.mode-button',
        titre: 'En jeu : le mode « Combat au sol »',
        texte: 'Avant de descendre te battre à pied, choisis le mode « Combat au sol » avec ce bouton : l’app ouvre sa fenêtre par-dessus le jeu.',
      },
      {
        cible: '[data-tuto="activites-sol-tuiles"]',
        titre: 'Tes chiffres',
        texte: 'Tes kills à pied, tes gains en obligations de combat et en primes, les mérites gagnés à pied, et tes morts. Les crimes commis à pied sont notés sous les morts.',
      },
      {
        cible: '[data-tuto="activites-sol-lieu"]',
        titre: 'Où tu es',
        texte: 'Le système et l’installation où tu te trouves, et les guerres en cours ici : les deux factions, leurs jours gagnés et l’enjeu. Sans guerre dans le système, il n’y a pas de zone de conflit au sol.',
      },
      {
        cible: '[data-tuto="activites-sol-equipement"]',
        titre: 'Ton équipement',
        texte: 'Ta combinaison et tes armes. Si rien n’est affiché, c’est normal : l’app les connaît à ta prochaine sortie à pied.',
      },
      {
        cible: '[data-tuto="activites-sol-listes"]',
        titre: 'Le détail de la session',
        texte: 'Trois listes : tes kills par faction abattue, les crédits à encaisser par faction qui paie, et les consommables que tu as utilisés.',
      },
      {
        cible: '[data-tuto="activites-sol-kills"]',
        titre: 'Tes derniers kills',
        texte: 'Chaque kill à pied s’ajoute ici : l’heure, prime ou obligation de combat, la faction abattue, celle qui paie et le gain. Une obligation s’encaisse auprès de la faction qui paie.',
      },
      {
        cible: FENETRE,
        titre: 'Afficher la fenêtre',
        texte: 'Ce bouton passe en mode « Combat au sol » et ouvre sa fenêtre par-dessus le jeu, comme le bouton du mode de jeu. Quand la fenêtre est ouverte, le même bouton sert à la masquer.',
      },
      {
        cible: '[data-tuto="activites-sol-zero"]',
        titre: 'Pause et remise à zéro',
        texte: '« Pause » arrête le chrono qui sert aux chiffres par heure, « Reprendre » le relance. « Remettre à zéro » efface les compteurs de la session, après confirmation.',
      },
    ],
  },
  {
    id: 'activites-sauvetage',
    titre: 'Sauvetage',
    chemin: '/sauvetage',
    etapes: [
      {
        titre: 'Ta session de sauvetage',
        texte: 'Cette page compte ce que tu récupères dans l’espace et ce que tu livres au contact de recherche et sauvetage : nacelles d’évacuation, boîtes noires, débris d’épave, effets personnels.',
      },
      {
        cible: '.mode-button',
        titre: 'En jeu : le mode « Sauvetage »',
        texte: 'Avant de partir, choisis le mode « Sauvetage » avec ce bouton : l’app ouvre sa fenêtre par-dessus le jeu. À chaque arrivée dans un système, une fenêtre « Signaux » liste aussi les sources de signal du système.',
      },
      {
        cible: '[data-tuto="activites-sauvetage-session"]',
        titre: 'La session en cours',
        texte: 'L’heure de début de la session, sa durée et l’heure de ta dernière action. Une destruction s’affiche ici en rouge : elle te fait perdre ce qui était en soute.',
      },
      {
        cible: '[data-tuto="activites-sauvetage-tuiles"]',
        titre: 'Du ramassage à la livraison',
        texte: 'Dans l’ordre : ce que tu as récupéré, ce qui est encore en soute et reste à livrer, ce que tu as livré avec les crédits reçus, et les mérites gagnés après tes livraisons.',
      },
      {
        cible: '[data-tuto="activites-sauvetage-actions"]',
        titre: 'Tes dernières actions',
        texte: 'Chaque ramassage, livraison ou largage s’ajoute ici, avec la marchandise, la quantité, la récompense et les mérites. Un objet largué est compté comme perdu.',
      },
      {
        cible: FENETRE,
        titre: 'Afficher la fenêtre',
        texte: 'Ce bouton passe en mode « Sauvetage » et ouvre sa fenêtre par-dessus le jeu, comme le bouton du mode de jeu. Quand la fenêtre est ouverte, le même bouton sert à la masquer.',
      },
      {
        cible: PAUSE,
        titre: 'Mettre le chrono en pause',
        texte: 'Le chrono sert à calculer tes crédits et tes mérites par heure. Mets-le en pause quand tu t’absentes, puis clique sur « Reprendre ». Il se met aussi en pause tout seul à quai et quand le jeu est fermé.',
      },
      {
        cible: '[data-tuto="activites-sauvetage-zero"]',
        titre: 'Remettre à zéro',
        texte: 'Efface les compteurs et repart d’une session neuve, par exemple avant une nouvelle tournée. L’app te demande de confirmer.',
      },
    ],
  },
  {
    id: 'activites-materiaux',
    titre: 'Collecte de matériaux',
    chemin: '/materiaux',
    etapes: [
      {
        titre: 'Ta collecte de matériaux',
        texte: 'Cette page compte les matériaux que tu ramasses pendant la session, ceux qui servent à l’ingénierie. Ton stock complet, lui, est dans Ingénierie, page Matériaux.',
      },
      {
        cible: '.mode-button',
        titre: 'En jeu : le mode « Matériaux »',
        texte: 'Avant une tournée de ramassage, choisis le mode « Matériaux » avec ce bouton : l’app affiche par-dessus le jeu ce que tu récupères, par catégorie et par grade.',
      },
      {
        cible: '[data-tuto="activites-materiaux-tuiles"]',
        titre: 'Par catégorie',
        texte: 'Le nombre d’unités récupérées pendant la session, puis le détail dans les trois catégories du jeu : bruts, manufacturés et encodés.',
      },
      {
        cible: '[data-tuto="activites-materiaux-grades"]',
        titre: 'Par grade',
        texte: 'Les mêmes unités, rangées par grade, de G1 à G5. Les grades viennent des données de référence, à télécharger dans la rubrique Ingénierie.',
      },
      {
        cible: '[data-tuto="activites-materiaux-liste"]',
        titre: 'Matériau par matériau',
        texte: 'Sous ce titre, la liste de ce que tu as ramassé : le nom du matériau, sa catégorie, son grade et la quantité. Elle est vide tant que tu n’as rien récupéré.',
      },
      {
        cible: '[data-tuto="activites-materiaux-signaux"]',
        titre: 'La fenêtre « Signaux »',
        texte: 'En mode Matériaux, une fenêtre « Signaux » s’ouvre par-dessus le jeu à chaque arrivée dans un système. Elle liste les sources de signal, les sites au sol, les zones de conflit et les sites d’extraction.',
      },
      {
        cible: FENETRE,
        titre: 'Afficher la fenêtre',
        texte: 'Ce bouton passe en mode « Matériaux » et ouvre sa fenêtre par-dessus le jeu, comme le bouton du mode de jeu. Quand la fenêtre est ouverte, le même bouton sert à la masquer.',
      },
      {
        cible: PAUSE,
        titre: 'Mettre le chrono en pause',
        texte: 'Ce bouton met en pause le chrono de la session, puis « Reprendre » le relance. Il se met aussi en pause tout seul à quai et quand le jeu est fermé.',
      },
      {
        cible: '[data-tuto="activites-materiaux-zero"]',
        titre: 'Remettre à zéro',
        texte: 'Efface les compteurs de la session et repart de zéro, après confirmation. Ton stock de matériaux en jeu n’est pas touché : seul le compte de la session repart.',
      },
    ],
  },
  {
    id: 'activites-colonisation',
    titre: 'Colonisation',
    chemin: '/colonisation',
    etapes: [
      {
        titre: 'Tes chantiers de colonisation',
        texte: 'Cette page suit les chantiers de construction que tu ravitailles : ce qu’ils demandent, ce qu’il reste à livrer, ce que tu dois encore acheter et le nombre de trajets.',
      },
      {
        cible: '[data-tuto="activites-colo-vide"]',
        titre: 'Faire apparaître un chantier',
        texte: 'Rien à saisir : amarre-toi à un vaisseau de colonisation ou à un chantier de construction, et l’app le reconnaît. Ouvre ensuite le contact de colonisation en jeu pour qu’elle lise ses besoins.',
      },
      {
        cible: '[data-tuto="activites-colo-actif"]',
        titre: 'Le chantier actif',
        texte: 'Celui où tu es à quai, sinon celui que tu as épinglé, sinon le dernier en cours. Tu y lis son avancement, le reste à livrer, ce qu’il te faut acheter une fois ta soute déduite, et les trajets restants.',
      },
      {
        cible: '[data-tuto="activites-colo-tableau"]',
        titre: 'Tous tes chantiers',
        texte: 'Une ligne par chantier. « Reste » est ce que le chantier attend encore de tous les commandants, « Mes livraisons » ce que tu as apporté toi. Clique sur un nom pour ouvrir sa fiche.',
      },
      {
        cible: '[data-tuto="activites-colo-revendications"]',
        titre: 'Tes revendications',
        texte: 'Les systèmes que tu as revendiqués, avec les dates de la revendication, de la balise et de l’abandon. Le jeu n’écrit pas le délai d’une revendication : l’app ne l’affiche donc pas.',
      },
      {
        cible: '.mode-button',
        titre: 'En jeu : le mode « Colonisation »',
        texte: 'Avant tes trajets, choisis le mode « Colonisation » avec ce bouton : l’app ouvre par-dessus le jeu le suivi du chantier actif et sa liste de courses.',
      },
      {
        cible: FENETRE,
        titre: 'Afficher la fenêtre',
        texte: 'Ce bouton passe en mode « Colonisation » et ouvre ses fenêtres par-dessus le jeu, comme le bouton du mode de jeu. Quand elles sont ouvertes, le même bouton sert à les masquer.',
      },
      {
        cible: '[data-tuto="activites-colo-diagnostic"]',
        titre: 'Le diagnostic',
        texte: 'Un bloc à déplier si un chiffre te paraît faux : il montre les écarts entre ce que le jeu a écrit et ce que l’app attendait. En temps normal, tu n’en as pas besoin.',
      },
    ],
  },
  {
    id: 'activites-chantier',
    titre: 'Colonisation : fiche d’un chantier',
    chemin: '/colonisation',
    sousPages: true,
    etapes: [
      {
        titre: 'La fiche d’un chantier',
        texte: 'Tout ce que l’app sait de ce chantier : ses besoins, tes livraisons, où acheter ce qui manque et quand tu auras fini. Le lien « Chantiers », en haut, ramène à la liste.',
      },
      {
        cible: '[data-tuto="activites-chantier-tuiles"]',
        titre: 'Où en est le chantier',
        texte: 'L’avancement, le reste à livrer, ce que tu dois acheter et les trajets restants avec la soute de ton vaisseau. Un « ? » veut dire que les besoins ne sont pas lus : ouvre le contact du chantier en jeu.',
      },
      {
        cible: '[data-tuto="activites-chantier-echeance"]',
        titre: 'Fin estimée',
        texte: 'D’après la durée d’une boucle, c’est-à-dire un aller-retour de livraison, l’app estime le temps de jeu restant. Si tu as saisi une échéance, elle te dit si tu es dans les temps, serré ou en retard.',
      },
      {
        cible: '[data-tuto="activites-chantier-reglages"]',
        titre: 'Tes réglages',
        texte: 'Donne un nom au chantier, saisis son échéance (le jeu ne l’écrit pas), la durée d’une boucle et des notes. « Épingler » en fait le chantier affiché en jeu quand tu n’es à quai à aucun chantier. « Enregistrer » garde le tout.',
      },
      {
        cible: '[data-tuto="activites-chantier-marchandises"]',
        titre: 'Marchandise par marchandise',
        texte: 'Sous ce titre, pour chaque marchandise : ce qui est demandé, livré, ce qu’il reste, ce que tu as en soute et ce qu’il te faut acheter. Une ligne terminée porte une coche.',
      },
      {
        cible: '[data-tuto="activites-chantier-acheter"]',
        titre: 'Où acheter',
        texte: 'Choisis une distance et l’âge maximal des relevés, puis « Chercher » : l’app demande au site Ardent Insight les stations proches qui vendent ce qu’il manque. Stocks et prix datent de quelques heures ou jours : vérifie sur place.',
      },
      {
        cible: '[data-tuto="activites-chantier-livraisons"]',
        titre: 'Tes livraisons',
        texte: 'Sous ce titre, tes livraisons à ce chantier, comptées une par une : la date, les marchandises et le total en tonnes.',
      },
      {
        cible: '[data-tuto="activites-chantier-oublier"]',
        titre: 'Oublier un chantier',
        texte: 'Ce bouton retire le chantier de l’app : ses lectures et tes livraisons passées ne sont plus comptées. L’app te demande de confirmer. À garder pour un chantier qui ne te concerne plus.',
      },
    ],
  },
  {
    id: 'activites-bilans',
    titre: 'Bilans de session',
    chemin: '/bilans',
    etapes: [
      {
        titre: 'Tes sessions de jeu',
        texte: 'Cette page résume chacune de tes sessions de jeu, la plus récente en haut, et la compare à tes sessions passées. Elle se remplit toute seule depuis le journal du jeu.',
      },
      {
        cible: '[data-tuto="activites-bilans-tete"]',
        titre: 'Ce qu’est une session',
        texte: 'Une session va du chargement de ta partie à la fermeture du jeu. Si la page est vide, lance le jeu : tes sessions déjà écrites dans le journal apparaîtront.',
      },
      {
        cible: '[data-tuto="activites-bilans-moyennes"]',
        titre: 'Ton habitude et tes records',
        texte: 'Ce que tu gagnes d’habitude par heure, en crédits et en mérites, sur tes dernières sessions, et tes meilleurs scores. C’est le repère auquel chaque session est comparée.',
      },
      {
        cible: '[data-tuto="activites-bilans-carte"]',
        titre: 'Une carte par session',
        texte: 'En tête, la date, les vaisseaux pilotés et l’état de la session : en cours, jeu fermé, ou interrompue si le jeu s’est arrêté sans le dire.',
      },
      {
        cible: '[data-tuto="activites-bilans-chiffres"]',
        titre: 'Les chiffres de la session',
        texte: 'Durée, crédits gagnés ou perdus, mérites, matériaux ramassés, morts et sauts. Sous les crédits et les mérites, le gain par heure et l’écart avec ton habitude, en pour cent.',
      },
      {
        cible: '[data-tuto="activites-bilans-modes"]',
        titre: 'Les modes joués',
        texte: 'Les modes de jeu que tu as choisis pendant la session, avec le temps passé dans chacun.',
      },
      {
        cible: '.mode-button',
        titre: 'Pense au mode de jeu',
        texte: 'Les bilans n’ont pas de mode à eux. Mais le jeu n’écrit pas ce que tu fais : choisis ton mode avec ce bouton pendant que tu joues, et tes prochains bilans diront combien de temps tu as passé dans chacun.',
      },
    ],
  },
];
