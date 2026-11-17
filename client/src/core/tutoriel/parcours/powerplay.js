// Tutoriels du groupe powerplay (voir ../moteur.js pour la forme d'un parcours) : la rubrique Powerplay & Escadron,
// les six onglets du Projet extension et les Systèmes importants. Les pages de l'escadron sont dans ../parcours.js.
export const PARCOURS_POWERPLAY = [
  {
    id: 'powerplay-rubrique',
    titre: 'Powerplay & Escadron',
    chemin: '/powerplay',
    etapes: [
      {
        titre: 'Powerplay et escadron',
        texte: 'Cette rubrique regroupe ce qui touche à ta puissance : les mérites que tu gagnes, les systèmes à prendre, ceux que tu veux retrouver, et ton escadron.',
      },
      {
        cible: '.rub-cartes',
        titre: 'Une carte par page',
        texte: 'Chaque carte mène à une page. Clique sur son titre pour l’ouvrir. Les liens en dessous mènent tout droit à une partie de cette page.',
      },
      {
        cible: '.rub-carte:nth-child(1)',
        titre: 'Projet extension',
        texte: 'Le suivi de ton Powerplay : tes mérites semaine par semaine, ce que ta soute rapporte à la vente, ton rendement à l’heure, les routes de systèmes à prendre, et où agir cette semaine.',
      },
      {
        cible: '.rub-carte:nth-child(2)',
        titre: 'Systèmes importants',
        texte: 'Ta liste de systèmes favoris, avec la raison pour laquelle chacun compte, et une recherche des zones qui regroupent beaucoup de planètes.',
      },
      {
        cible: '.rub-carte:nth-child(3)',
        titre: 'Escadron',
        texte: 'Ce que tu apportes à ton escadron, et comment le rejoindre avec le code donné par ton chef. La dernière page ne sert qu’à celui qui gère l’escadron.',
      },
    ],
  },
  {
    id: 'extension-historique',
    titre: 'Projet extension : historique des mérites',
    chemin: '/extension',
    etapes: [
      {
        titre: 'Historique des mérites',
        texte: 'Les mérites sont les points que tu gagnes pour ta puissance. Cette page en fait le rapport, semaine par semaine. Une semaine Powerplay va du jeudi au jeudi.',
      },
      {
        cible: '[data-tuto="extension-onglets"]',
        titre: 'Les six onglets du projet',
        texte: 'Le Projet extension a six onglets : cet historique, les mérites à la vente, les mérites par heure, tes routes d’extension, un calculateur de routes commerciales, et où agir cette semaine. Chacun a son tutoriel.',
      },
      {
        cible: '.tabs-routes',
        titre: 'Quels systèmes compter',
        texte: 'Un onglet par route d’extension que tu as créée : le rapport ne compte alors que ses systèmes. « Tous les systèmes » compte tout. Ton choix est retenu pour la prochaine fois.',
      },
      {
        cible: '.mh-weeknav',
        titre: 'Changer de semaine',
        texte: 'Les deux flèches passent à la semaine d’avant ou d’après. Sur une semaine passée, un bouton « Semaine en cours » apparaît à côté pour revenir à aujourd’hui.',
      },
      {
        cible: '.mh-partage',
        titre: 'Copier pour Discord',
        texte: 'Ce bouton fabrique une image animée du rapport et la met dans ton presse-papiers : un Ctrl+V dans Discord l’envoie. Sers-t’en pour montrer ta semaine à ton escadron.',
      },
      {
        cible: '.mh-report',
        titre: 'Le rapport de la semaine',
        texte: 'Avec une route choisie, la carte du haut montre où elle en est. En dessous, trois cartes : les systèmes où tu as travaillé, ton bilan de la semaine, et tes activités classées par mérites.',
      },
      {
        cible: '.mh-cards .mh-card:nth-child(1)',
        titre: 'L’état de chaque système',
        texte: 'Son niveau et ce qu’il manque pour le palier suivant, d’après le dernier relevé du jeu, tous joueurs de ta puissance compris. Si ce relevé est en retard, « Marquer le palier atteint » le montre atteint jusqu’au passage de jeudi.',
      },
      {
        cible: '[data-tuto="extension-jours-bascule"]',
        action: 'clic',
        titre: 'Jour par jour',
        texte: 'Tes mérites de chaque journée, en barres colorées par activité. Ce bouton passe du graphique au tableau, et retour. Clique dessus pour voir.',
      },
      {
        cible: '[data-tuto="extension-jours"]',
        titre: 'Lire les journées',
        texte: 'Une journée suit l’heure du passage de semaine du jeudi, pas minuit. Sur le graphique, passe la souris sur une barre pour voir le détail par activité.',
      },
    ],
  },
  {
    id: 'extension-vente',
    titre: 'Projet extension : mérites à la vente',
    chemin: '/extension?onglet=vente',
    etapes: [
      {
        titre: 'Mérites à la vente',
        texte: 'Vendre une cargaison peut rapporter des mérites, ou zéro selon d’où elle vient. Cette page te dit, avant de vendre, ce que ta soute rapporterait ici. L’app conseille, c’est toi qui vends.',
      },
      {
        cible: '[data-tuto="extension-vente-prevision"]',
        titre: 'À quai : la prévision',
        texte: 'Dès que tu es à quai avec une soute, une ligne par marchandise : d’où elle vient, le prix ici, la demande de la station et les mérites prévus. Une ligne rouge annonce zéro mérite probable.',
      },
      {
        cible: '[data-tuto="extension-vente-fenetre"]',
        titre: 'La fenêtre en jeu',
        texte: 'Cochée, cette case laisse l’app ouvrir toute seule une petite fenêtre par-dessus le jeu quand tu es à quai, avec cette même prévision puis le résultat de ta vente. Décoche-la si elle te gêne.',
      },
      {
        cible: '[data-tuto="extension-vente-ratios"]',
        titre: 'Tes ratios mesurés',
        texte: 'Ce que tes ventes passées ont vraiment rapporté, en mérites par million de crédits, par sorte de marchandise. C’est sur ces mesures que la prévision s’appuie.',
      },
      {
        cible: '[data-tuto="extension-vente-mesurees"]',
        titre: 'Ventes mesurées',
        texte: 'Chaque vente, avec les mérites reçus dans la minute et ce qui était prévu. Quand une vente n’a rien rapporté, l’app donne la cause la plus probable. Vide tant que tu n’as rien vendu.',
      },
      {
        cible: '[data-tuto="extension-vente-zero"]',
        titre: 'Seulement les 0 mérite',
        texte: 'Coche cette case pour ne garder que les ventes qui n’ont rien rapporté. Pratique pour comprendre ce qui a cloché.',
      },
      {
        cible: '[data-tuto="extension-vente-copier"]',
        titre: 'Copier en texte',
        texte: 'Copie la liste de ces ventes en texte, prête à coller dans Discord pour en parler avec d’autres joueurs. Le texte ne contient ni ton nom ni ton solde.',
      },
      {
        cible: '[data-tuto="extension-vente-regles"] summary',
        action: 'clic',
        titre: 'Les règles appliquées',
        texte: 'La liste des règles dont l’app se sert pour ses prévisions, chacune avec sa source et sa date. Clique sur ce titre pour la déplier.',
      },
    ],
  },
  {
    id: 'extension-merites-heure',
    titre: 'Projet extension : mérites par heure',
    chemin: '/extension?onglet=merites-heure',
    etapes: [
      {
        titre: 'Mérites par heure',
        texte: 'Tes vrais rendements : combien de mérites tu gagnes par heure de jeu actif, selon l’activité et l’état du système. Tu vois ainsi ce qui paie le mieux pour toi.',
      },
      {
        cible: '[data-tuto="extension-heure-periode"]',
        titre: 'La période',
        texte: 'Choisis sur quelle période calculer : depuis le dernier changement de règles du jeu, la semaine Powerplay en cours, les 30 derniers jours ou tout l’historique. Ton choix est retenu.',
      },
      {
        cible: '[data-tuto="extension-heure-tuiles"]',
        titre: 'Le résumé',
        texte: 'Ton rendement global et ton temps actif. Le temps actif ne compte pas les pauses : à quai, jeu fermé, ou plusieurs minutes sans action. Le temps « écarté » est celui joué sans rapport avec un gain de mérites.',
      },
      {
        cible: '[data-tuto="extension-heure-activite"]',
        titre: 'Par activité',
        texte: 'Une ligne par activité : combat, minage, commerce… La colonne « Échantillon » dit sur combien de travaux le chiffre repose. Une ligne grisée repose sur trop peu de mesures pour s’y fier.',
      },
      {
        cible: '[data-tuto="extension-heure-etat"]',
        titre: 'Par état du système',
        texte: 'Le même calcul, rangé d’après l’état Powerplay du système où le gain a été crédité, celui de la vente ou du kill.',
      },
      {
        cible: '[data-tuto="extension-heure-detail"]',
        action: 'clic',
        titre: 'Activité et état croisés',
        texte: 'Ce bouton affiche ou masque le tableau le plus fin : chaque activité dans chaque état de système. Clique dessus pour le déplier.',
      },
      {
        cible: '[data-tuto="extension-heure-modificateurs"]',
        titre: 'Modificateurs connus',
        texte: 'Les bonus et changements connus qui pèsent sur les mérites, avec leur source et leur statut. Le jeu ne les écrit pas dans son journal : l’app ne les applique pas, ils t’aident à lire tes chiffres.',
      },
      {
        cible: '[data-tuto="extension-heure-ajouter"]',
        titre: 'Ajouter le tien',
        texte: 'Note ici un bonus constaté ou un changement de règles, avec sa date et sa source, puis « Ajouter ». Avec un nom de système, l’app mesure ton rendement là-bas cette semaine-là. Un changement de règles fait repartir tes rendements de sa date.',
      },
      {
        cible: '[data-tuto="extension-heure-travaux"]',
        titre: 'Derniers travaux',
        texte: 'Le détail de tes derniers travaux : une vente, un kill, une livraison, une mission rendue ou un sauvetage, avec le temps actif et les mérites de chacun.',
      },
    ],
  },
  {
    id: 'extension-routes',
    titre: 'Projet extension : routes d’extension',
    chemin: '/extension?onglet=routes',
    etapes: [
      {
        titre: 'Routes d’extension',
        texte: 'Une route d’extension est la liste des systèmes que ta puissance veut prendre, dans l’ordre, d’un système déjà tenu jusqu’à l’arrivée. Tu peux en avoir plusieurs.',
      },
      {
        cible: '.tabs-routes',
        titre: 'Un onglet par route',
        texte: 'Chaque route enregistrée a son onglet ici. Clique sur un nom pour voir ses systèmes. Sur une app neuve, il n’y a que « + Nouvelle route ».',
      },
      {
        cible: '.tabs-routes button:last-child',
        action: 'clic',
        titre: 'Créer une route',
        texte: 'Ce bouton ouvre le formulaire d’une nouvelle route. Rien n’est enregistré tant que tu ne le demandes pas. Clique dessus pour le voir.',
      },
      {
        cible: '[data-tuto="extension-route-nom"]',
        titre: 'Le nom de la route',
        texte: 'Donne-lui un nom parlant, par exemple celui du système visé. Ce nom devient son onglet. La description, juste en dessous, est facultative.',
      },
      {
        cible: '[data-tuto="extension-route-systemes"]',
        titre: 'Les systèmes, dans l’ordre',
        texte: 'Une ligne par système, du départ tout en haut à l’arrivée en bas. Tape le nom exact du jeu : tu peux le copier depuis la carte de la galaxie. Les flèches déplacent une ligne, la croix la retire.',
      },
      {
        cible: '[data-tuto="extension-route-objectif"]',
        titre: 'L’objectif de chaque système',
        texte: '« Déjà Consolidé » ou « Déjà Forteresse » : ta puissance le tient, il sert de départ. « Objectif Consolidé » ou « Objectif Forteresse » : à prendre, puis à monter à ce niveau. « Arrivée » : le dernier, d’où l’on ne repart pas.',
      },
      {
        cible: '[data-tuto="extension-route-sauts"]',
        titre: 'Ajouter un système, calculer les sauts',
        texte: 'Le saut est la distance depuis le système juste au-dessus. L’app la calcule d’après tes journaux si tu es passé dans les deux systèmes, sinon tape-la. Un saut trop long pour le niveau du système d’appui est signalé en rouge.',
      },
      {
        cible: '[data-tuto="extension-route-enregistrer"]',
        titre: 'Enregistrer ou annuler',
        texte: '« Enregistrer la route » la garde et l’affiche dans son onglet. Le bouton reste grisé tant qu’une erreur est signalée. « Annuler » referme le formulaire sans rien garder : fais-le maintenant si tu ne crées pas de route.',
      },
      {
        titre: 'Une fois la route enregistrée',
        texte: 'Son onglet liste ses systèmes : « Copier » prend un nom pour la carte de la galaxie, « Modifier » rouvre le formulaire, « Supprimer » efface la route. Son rapport de la semaine, avec la carte, est dans « Historique des mérites ».',
      },
    ],
  },
  {
    id: 'extension-calculateur',
    titre: 'Projet extension : calculateur de routes',
    chemin: '/extension?onglet=calculateur',
    etapes: [
      {
        titre: 'Calculateur de routes',
        texte: 'Il cherche les routes commerciales les plus rentables autour de toi, pour ton vaisseau. Les prix viennent d’Ardent Insight, un site alimenté par les relevés des joueurs.',
      },
      {
        cible: '[data-tuto="extension-calc-tuiles"]',
        titre: 'Ton vaisseau, lu dans le jeu',
        texte: 'Le vaisseau, sa soute et sa portée, lus dans le journal du jeu. La dernière tuile rappelle ce que rapporte ta route commerciale active, pour comparer. Si tout est vide, lance le jeu une fois.',
      },
      {
        cible: '[data-tuto="extension-calc-filtres"]',
        titre: 'Les filtres',
        texte: 'Le rayon de recherche, l’âge maximal des prix, la distance de la station à l’étoile, la taille de plateforme et le classement. Soute et portée sont celles de ton vaisseau, sauf si tu tapes autre chose.',
      },
      {
        cible: '[data-tuto="extension-calc-cases"]',
        titre: 'Départ et stations',
        texte: '« Ma position actuelle » part du système où tu es. Décoche-la pour taper un autre système de départ. Les deux autres cases ajoutent ou retirent les stations posées sur une planète et les colonies Odyssey.',
      },
      {
        cible: '[data-tuto="extension-calc-chercher"]',
        titre: 'Chercher',
        texte: 'Ce bouton lance la recherche : l’app interroge alors Ardent Insight sur internet, ce qui prend une dizaine de secondes. Rien ne part avant ton clic. Pas besoin de cliquer maintenant.',
      },
      {
        titre: 'Lire les résultats',
        texte: 'Deux listes : les boucles entre deux stations, et les allers simples. Clique sur une ligne pour voir quoi acheter et vendre, et « Copier pour Discord ». L’âge des prix est en couleur : vert récent, rouge ancien. Durées et gains par heure sont estimés.',
      },
    ],
  },
  {
    id: 'extension-ou-agir',
    titre: 'Projet extension : où agir cette semaine',
    chemin: '/extension?onglet=ou-agir',
    etapes: [
      {
        titre: 'Où agir cette semaine',
        texte: 'Tu veux faire du Powerplay mais tu ne sais pas où aller ? Cette page liste les systèmes à portée de toi où ton action compte, d’après les données du site Spansh.',
      },
      {
        cible: '[data-tuto="extension-agir-tuiles"]',
        titre: 'Ce que l’app sait de toi',
        texte: 'Ta puissance et ta position, lues dans le journal du jeu, le nombre de systèmes que tu as vus en jeu, et la portée de prise : la distance maximale depuis un système Consolidé ou une Forteresse.',
      },
      {
        cible: '[data-tuto="extension-agir-choix"]',
        titre: 'Que veux-tu faire ?',
        texte: 'Choisis une activité. La prise vise les systèmes inoccupés à portée. Le renforcement vise ceux de ta puissance. La sape vise ceux d’une puissance adverse. Changer de bouton ne lance rien.',
      },
      {
        cible: '[data-tuto="extension-agir-tache"]',
        action: 'clic',
        titre: 'Une tâche de la semaine',
        texte: 'Le jeu propose des tâches chaque semaine mais ne les écrit pas dans son journal : c’est à toi de les saisir. Clique ici pour ouvrir le formulaire.',
      },
      {
        cible: '[data-tuto="extension-agir-tache-form"]',
        titre: 'Décrire la tâche',
        texte: 'Son nom, le genre de système visé, les états acceptés et ce que la station doit avoir. « Enregistrer la tâche » l’ajoute aux boutons du dessus. « Annuler » referme sans rien garder.',
      },
      {
        cible: '[data-tuto="extension-agir-filtres"]',
        titre: 'Où et comment chercher',
        texte: 'Le point de départ, le rayon, ta puissance si le journal ne la connaît pas, et le classement des résultats. « Ma position actuelle », plus bas, part du système où tu es.',
      },
      {
        cible: '[data-tuto="extension-agir-chercher"]',
        titre: 'Chercher',
        texte: 'Ce bouton interroge Spansh sur internet. Seuls le nom du système de départ, la puissance et les états partent, et seulement à ton clic. Pas besoin de cliquer maintenant.',
      },
      {
        titre: 'Lire les résultats',
        texte: 'Chaque système a sa distance, son état et l’âge de son relevé : un relevé d’avant jeudi peut être dépassé. « Copier » prend son nom pour la carte de la galaxie. À ton arrivée, l’app te dit si le journal du jeu confirme.',
      },
    ],
  },
  {
    id: 'powerplay-systemes',
    titre: 'Systèmes importants',
    chemin: '/systemes',
    etapes: [
      {
        titre: 'Systèmes importants',
        texte: 'Tes systèmes favoris, avec la raison pour laquelle chacun compte. Et une recherche pour trouver les zones qui regroupent le plus de planètes intéressantes.',
      },
      {
        cible: '[data-tuto="powerplay-systemes-onglets"]',
        titre: 'Deux écrans',
        texte: '« Mes systèmes » est ta liste, avec leur nombre entre parenthèses. « Recherche multiplanète » sert à en trouver de nouveaux.',
      },
      {
        cible: '[data-tuto="powerplay-systemes-liste"]',
        titre: 'Ta liste',
        texte: 'Vide au début. Ensuite, chaque système a sa carte : sa distance depuis toi, ses planètes, un bouton pour copier son nom, « Modifier » pour changer son nom, son étiquette et sa raison, et la croix pour le retirer.',
      },
      {
        cible: '[data-tuto="powerplay-systemes-recherche"]',
        action: 'clic',
        titre: 'Chercher des zones',
        texte: 'La liste se remplit depuis la recherche. Clique sur ce bouton pour l’ouvrir.',
      },
      {
        cible: '[data-tuto="powerplay-systemes-types"]',
        titre: 'Les types de planètes',
        texte: 'Chaque bouton ajoute ou retire un type de planète de la recherche. Ceux en couleur sont retenus. Il en faut au moins un.',
      },
      {
        cible: '[data-tuto="powerplay-systemes-filtres"]',
        titre: 'Les filtres',
        texte: 'La gravité maximale, la distance maximale depuis Sol, la taille de la zone qui regroupe les planètes, la distance maximale depuis l’étoile d’arrivée, et le tri des résultats.',
      },
      {
        cible: '[data-tuto="powerplay-systemes-chercher"]',
        titre: 'Chercher',
        texte: 'Ce bouton interroge le site Spansh, alimenté par les relevés des joueurs. La première recherche prend une à deux minutes. Changer les filtres ensuite est immédiat. Pas besoin de cliquer maintenant.',
      },
      {
        titre: 'Garder une zone',
        texte: 'Dans les résultats, clique sur une zone pour voir ses planètes, puis « Ajouter aux systèmes importants ». Donne-lui un nom, une étiquette et la raison pour laquelle elle compte : elle rejoint ta liste.',
      },
    ],
  },
];
