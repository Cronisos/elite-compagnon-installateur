// Tutoriels du groupe outils (voir ../moteur.js pour la forme d'un parcours) : la rubrique Outils et ses pages
// (Sites, Applications externes, Règles du jeu, Coup d'œil, Couleurs du HUD, Commandes du jeu, Compagnon, Moniteur PC,
// Alicia) et la page Paramètres. Aucun clic demandé sur un bouton qui enregistre, envoie ou écrit quelque part.

const carte = (chemin) => `.rub-carte:has(.rub-tete[href="${chemin}"])`;
const tuto = (nom) => `[data-tuto="${nom}"]`;

export const PARCOURS_OUTILS = [
  {
    id: 'outils-rubrique',
    titre: 'Outils',
    chemin: '/outils',
    etapes: [
      {
        titre: 'La rubrique Outils',
        texte: 'Ici sont rangés les à-côtés de l’app : des sites utiles, les règles du jeu expliquées, les réglages de ton cockpit et de tes touches, et tes compagnons de bord.',
      },
      {
        cible: '.rub-cartes',
        titre: 'Une carte par page',
        texte: 'Chaque carte mène à une page : clique sur son titre pour l’ouvrir. Quand une page a plusieurs écrans, ils sont listés en liens sous la description.',
      },
      {
        cible: carte('/applications'),
        titre: 'Sites et applications',
        texte: 'Inara, Spansh, EDSY et Coriolis s’affichent directement dans l’app, sans ouvrir ton navigateur. La page garde aussi tes liens vers d’autres outils, dont certains se remplissent tout seuls avec le système et la station où tu te trouves.',
      },
      {
        cible: carte('/tutoriels'),
        titre: 'Tutoriels',
        texte: 'La liste de tous les tutoriels comme celui-ci : ceux que tu as vus, ceux qu’il te reste, de quoi en revoir un ou les passer tous d’un coup.',
      },
      {
        cible: carte('/regles'),
        titre: 'Règles du jeu',
        texte: 'Comment le jeu calcule, en français : Powerplay, mérites, colonisation, escadrons. Chaque règle donne sa source et dit si elle a été mesurée ou seulement lue quelque part.',
      },
      {
        cible: carte('/couleurs-hud'),
        titre: 'Couleurs du HUD',
        texte: 'Pour changer la couleur de l’interface de ton cockpit, avec un aperçu avant et après. C’est la seule page de l’app qui écrit dans un fichier du jeu, et seulement quand tu le demandes.',
      },
      {
        cible: carte('/commandes'),
        titre: 'Commandes du jeu',
        texte: 'Deux écrans. « Mes commandes » retrouve une touche ou une action. « Garde des commandes » te prévient quand le jeu ignore ton profil de touches. L’app lit tes touches, elle ne les change jamais.',
      },
      {
        cible: carte('/coup-doeil'),
        titre: 'Les fenêtres en jeu',
        texte: 'Coup d’œil, Compagnon et Moniteur PC ont chacun une petite fenêtre qui s’affiche par-dessus le jeu. Leur page sert à l’afficher, à la masquer et à la régler.',
      },
      {
        cible: carte('/ia'),
        titre: 'Alicia',
        texte: 'Ton IA de bord : tu lui poses une question, elle lit tes données dans l’app et te répond. Elle tourne sur ton PC et demande une bonne carte graphique. Elle est coupée tant que tu ne l’allumes pas.',
      },
    ],
  },
  {
    id: 'outils-sites',
    titre: 'Sites : Inara',
    chemin: '/inara',
    etapes: [
      {
        titre: 'Inara, dans l’app',
        texte: 'Cette page affiche le vrai site Inara dans la fenêtre de l’app, comme le ferait ton navigateur. Tu y navigues et tu t’y connectes comme d’habitude.',
      },
      {
        cible: tuto('outils-site-barre'),
        titre: 'La barre du site',
        texte: 'De gauche à droite : page précédente, page suivante, recharger la page, et la maison qui revient à l’accueil d’Inara. À côté, le nom et l’adresse de la page affichée.',
      },
      {
        cible: tuto('outils-site-navigateur'),
        titre: 'Ouvrir dans le navigateur',
        texte: 'Ce bouton ouvre la page affichée dans ton navigateur habituel. Les liens d’Inara qui mènent vers un autre site s’y ouvrent aussi : seules les pages d’Inara s’affichent dans l’app.',
      },
      {
        titre: 'Ce qui part vers Inara',
        texte: 'Rien de l’app. Le site est isolé : il ne voit ni tes journaux, ni tes données, ni le reste de l’app. Inara reçoit seulement ce que tu fais toi-même sur ses pages, comme dans un navigateur.',
      },
      {
        titre: 'Ta connexion',
        texte: 'Si tu te connectes à ton compte Inara, la connexion est gardée sur ce PC pour la prochaine fois. Elle part avec le reste si tu utilises « Effacer mes données » dans Paramètres.',
      },
    ],
  },
  {
    id: 'outils-applications',
    titre: 'Sites et applications',
    chemin: '/applications',
    etapes: [
      {
        titre: 'Les autres outils des joueurs',
        texte: 'Les sites que tout le monde utilise autour du jeu. Les quatre principaux s’ouvrent dans l’app ; les autres liens s’ouvrent dans un nouvel onglet de ton navigateur.',
      },
      {
        cible: tuto('outils-liens-sites'),
        titre: 'Dans l’app',
        texte: 'Inara, Spansh, EDSY et Coriolis s’affichent dans l’app. Chaque site est isolé : il garde ta connexion à ton compte d’une fois sur l’autre, mais ne voit rien de l’app ni de ton PC.',
      },
      {
        cible: tuto('outils-liens-ici'),
        titre: 'Ici et maintenant',
        texte: 'Des liens déjà remplis avec le système et la station où tu es : un clic ouvre leur fiche sur Inara ou Spansh. Le site reçoit donc ce nom dans l’adresse. Sans position connue, lance le jeu.',
      },
      {
        cible: tuto('outils-liens-menu'),
        titre: 'Le menu, par thème',
        texte: 'Les liens sont rangés par thème. Passe la souris sur un lien pour voir son adresse avant de cliquer.',
      },
      {
        cible: tuto('outils-liens-verifier'),
        titre: 'À vérifier',
        texte: 'Des adresses proposées que l’app n’a pas pu contrôler. Ouvre-les : si la page est la bonne, « Ça marche » la range dans le menu. Sinon, « Corriger » change son adresse et « Supprimer » l’enlève.',
      },
      {
        cible: tuto('outils-liens-modifier'),
        action: 'clic',
        titre: 'Modifier la liste',
        texte: 'Ce bouton passe la page en mode modification, pour ajouter tes propres liens et ranger les autres. Clique dessus : rien n’est changé tant que tu ne touches pas à un lien.',
      },
      {
        cible: tuto('outils-liens-ajouter'),
        titre: 'Ajouter un lien',
        texte: 'Donne un nom, colle l’adresse, choisis le thème, puis « Ajouter ». Dans chaque thème, les flèches montent ou descendent un lien, la croix le supprime, et « Enregistrer » apparaît dès que tu changes un nom ou une adresse.',
      },
      {
        cible: tuto('outils-liens-contextuels'),
        titre: 'Liens contextuels',
        texte: 'Ce sont les modèles des liens « Ici et maintenant ». Les mots entre accolades sont remplacés par ta position. D’autres pages de l’app s’en servent aussi, pour les stations d’une route ou la base d’un ingénieur.',
      },
      {
        cible: tuto('outils-liens-remettre'),
        titre: 'Retrouver un lien supprimé',
        texte: 'Tu as supprimé par erreur un lien fourni avec l’app ? Ce bouton remet ceux que tu as enlevés. Pour quitter le mode modification, clique sur « Terminer » en haut de la page.',
      },
    ],
  },
  {
    id: 'outils-regles',
    titre: 'Règles du jeu',
    chemin: '/regles',
    etapes: [
      {
        titre: 'Les règles du jeu, en français',
        texte: 'Le jeu explique peu ses calculs. Cette page les rassemble en fiches : Powerplay, mérites de vente, colonisation, escadrons. Chaque règle donne aussi le terme des guides anglais et sa source.',
      },
      {
        cible: '.regles-recherche',
        titre: 'Chercher une règle',
        texte: 'Tape un mot, en français ou en anglais, ou même un nombre : la liste se réduit aux règles qui en parlent.',
      },
      {
        cible: tuto('outils-regles-statuts'),
        titre: 'Peut-on s’y fier ?',
        texte: 'Chaque règle a un statut. « Mesurée par l’escadron » : relevée dans des journaux de jeu. « Publiée » : écrite par Frontier ou un guide, pas encore mesurée. « À vérifier » : ne t’y fie pas. Un bouton ne garde que ce statut, un second clic les remontre tous.',
      },
      {
        cible: tuto('outils-regles-fiches'),
        titre: 'Une fiche à la fois',
        texte: 'Ces boutons ne gardent qu’un sujet. « Toutes les fiches » les remontre toutes.',
      },
      {
        cible: '.regle',
        titre: 'Lire une règle',
        texte: 'En haut, son titre et son statut. Puis l’énoncé, les chiffres à retenir, et le terme français à côté du terme anglais. « Preuves » et « À savoir » donnent le détail et les limites.',
      },
      {
        cible: '.regle-pied',
        titre: 'Date et source',
        texte: 'Le bas de la carte dit quand la règle a été vérifiée et d’où elle vient. « Voir aussi » mène aux règles voisines.',
      },
      {
        cible: '.regle-lien',
        titre: 'Copier le lien',
        texte: 'Copie l’adresse de cette règle dans l’app, pour y revenir tout droit. Certaines pages de l’app renvoient ainsi vers la règle qui explique un calcul.',
      },
      {
        cible: '#lexique',
        titre: 'Le lexique',
        texte: 'Tout en bas, la table des termes : celui de l’app et du jeu en français, celui des guides anglais, et les règles qui l’emploient. Pratique pour suivre un guide en anglais.',
      },
    ],
  },
  {
    id: 'outils-coup-doeil',
    titre: 'Coup d’œil',
    chemin: '/coup-doeil',
    etapes: [
      {
        titre: 'Tout ce que tu as, en un regard',
        texte: 'Le Coup d’œil résume ta situation : tes crédits, ce que tu peux encaisser, ta soute, tes missions et tes matériaux. Il se remplit tout seul d’après les journaux du jeu.',
      },
      {
        cible: tuto('outils-coupdoeil-fenetre'),
        titre: 'La fenêtre en jeu',
        texte: 'Ce bouton affiche ou masque le Coup d’œil par-dessus le jeu, en plus des fenêtres de ton mode de jeu. S’il est remplacé par un message, c’est que les fenêtres en jeu ne sont pas installées.',
      },
      {
        cible: '.glance-grid',
        titre: 'Les blocs',
        texte: 'Un bloc par sujet. « À encaisser » compte ce que tu n’as pas encore touché : primes, obligations de combat, données d’exploration et d’exobiologie. Tant que ce n’est pas vendu, tu peux le perdre.',
      },
      {
        cible: '.glance-grid .glance-inline',
        titre: 'Points de mercenaire',
        texte: 'Le jeu n’écrit pas ces points dans ses journaux : l’app ne peut pas les lire. Tape ton total ici puis « OK » si tu veux les suivre.',
      },
      {
        cible: '.glance > .glance-block',
        titre: 'Ce qu’il me faut',
        texte: 'Tes objectifs. Donne un nom, choisis ce que tu comptes (crédits, mérites ou points de mercenaire) et le montant visé, puis « Ajouter » : une barre montre où tu en es et ce qui manque. La croix retire un objectif.',
      },
      {
        titre: 'Partout dans l’app',
        texte: 'Sur les autres pages, le bouton « Coup d’œil » ou le raccourci Alt+C ouvre ce même résumé dans un volet, sans quitter ce que tu fais. Échap le referme.',
      },
    ],
  },
  {
    id: 'outils-couleurs-hud',
    titre: 'Couleurs du HUD',
    chemin: '/couleurs-hud',
    etapes: [
      {
        titre: 'Changer la couleur de ton cockpit',
        texte: 'Tu choisis une couleur, tu regardes le résultat, puis tu l’appliques. Attention : c’est la seule page de l’app qui écrit dans un fichier du jeu. Elle ne le fait que si tu cliques sur « Appliquer au jeu » et que tu confirmes.',
      },
      {
        cible: tuto('outils-hud-apercu'),
        titre: 'L’aperçu avant et après',
        texte: 'L’image du dessus est un dessin de l’app, pas une capture du jeu : les couleurs sont approchées. Glisse dessus, ou sers-toi de ces boutons, pour comparer avant et après. Rien n’est écrit tant que tu regardes.',
      },
      {
        cible: tuto('outils-hud-prereglages'),
        titre: 'Les préréglages',
        texte: 'Des couleurs toutes prêtes. Un clic sur l’une d’elles la montre dans l’aperçu, sans rien changer au jeu.',
      },
      {
        cible: tuto('outils-hud-curseurs'),
        titre: 'Ta couleur',
        texte: 'Règle la teinte, la saturation et la luminosité, ou choisis une couleur exacte. Le dernier curseur règle à part les éléments bleus, comme les boucliers. « Mode avancé », juste en dessous, donne les 9 nombres pour les connaisseurs.',
      },
      {
        cible: tuto('outils-hud-appliquer'),
        titre: 'Appliquer au jeu',
        texte: 'Ce bouton écrit ta couleur dans le fichier d’options du jeu, GraphicsConfigurationOverride.xml. L’app te demande d’abord de confirmer, garde une copie de ton fichier, puis ne change que le bloc des couleurs. Ne clique pas maintenant.',
      },
      {
        cible: tuto('outils-hud-actions'),
        titre: 'Les autres boutons',
        texte: '« Annuler mes changements » remet l’aperçu sur la couleur actuelle du fichier. « Revenir à l’orange » retire tes couleurs du fichier, après confirmation et copie. « Copier le bloc XML » copie ta couleur en texte, pour la partager.',
      },
      {
        cible: tuto('outils-hud-sauvegardes'),
        titre: 'Les sauvegardes',
        texte: 'Avant chaque écriture, l’app garde une copie du fichier à côté de lui : les 10 dernières sont listées ici. « Aperçu » montre leurs couleurs, « Restaurer » les remet après confirmation. Tes propres copies ne sont jamais effacées.',
      },
      {
        cible: tuto('outils-hud-teinte'),
        titre: 'L’app à tes couleurs',
        texte: 'Cette case fait prendre à l’app, à ses menus et à ses fenêtres en jeu la couleur que tu as donnée à ton HUD. Décochée, l’app garde son orange.',
      },
      {
        cible: tuto('outils-hud-savoir'),
        titre: 'Relance le jeu',
        texte: 'Le jeu ne lit ce fichier qu’à son démarrage : quitte-le jusqu’au bureau, puis relance-le. La couleur change toute l’interface à la fois, alertes et boucliers compris : lis ces notes avant d’appliquer.',
      },
    ],
  },
  {
    id: 'outils-garde-commandes',
    titre: 'Garde des commandes',
    chemin: '/commandes',
    etapes: [
      {
        titre: 'Protéger ton profil de touches',
        texte: 'Quand une manette manque au lancement, le jeu ignore ton profil de commandes sans prévenir et repasse aux touches par défaut. Si tu réassignes à ce moment-là, tu écrases ton profil. Cette page te prévient avant.',
      },
      {
        cible: '.tabs',
        titre: 'Deux écrans',
        texte: '« Mes commandes » liste tes touches et aide à en retrouver une. « Garde des commandes », où tu es, surveille que le jeu charge bien ton profil.',
      },
      {
        cible: '.bnd-status',
        titre: 'Le verdict',
        texte: 'Ce bandeau dit tout de suite si quelque chose cloche : rien d’anormal, un avertissement, ou une alerte avec ce qu’il faut faire. En cas de souci, l’app te prévient aussi par-dessus le jeu.',
      },
      {
        cible: tuto('outils-garde-relire'),
        titre: 'Relire',
        texte: 'L’app relit le rapport du jeu à chaque lancement. Ce bouton le fait tout de suite, par exemple après avoir rebranché ta manette.',
      },
      {
        cible: tuto('outils-garde-rapport'),
        titre: 'Le rapport du jeu',
        texte: 'Le jeu écrit ici les erreurs qu’il rencontre en chargeant tes commandes. L’app montre ses lignes, quand il a été écrit, et s’il concerne bien ton lancement en cours.',
      },
      {
        cible: tuto('outils-garde-profils'),
        titre: 'Les profils utilisés',
        texte: 'Quel profil le jeu utilise pour chaque famille de commandes, et les manettes dont chaque profil a besoin. Une manette notée absente explique en général l’alerte.',
      },
      {
        cible: tuto('outils-garde-sauvegardes'),
        titre: 'Les sauvegardes du jeu',
        texte: 'Le jeu écrit lui-même ces copies quand il n’arrive pas à charger un profil. Quand il y en a, l’app explique comment en remettre une à la main, jeu fermé. « Copier le chemin » te donne le dossier à ouvrir.',
      },
      {
        titre: 'Lecture seule',
        texte: 'L’app lit le dossier des commandes du jeu, rien de plus. Elle ne modifie, ne remplace et ne supprime jamais tes fichiers de touches : toute remise en place se fait de ta main.',
      },
    ],
  },
  {
    id: 'outils-mes-commandes',
    titre: 'Mes commandes',
    chemin: '/commandes/mes-commandes',
    etapes: [
      {
        titre: 'Retrouver une touche',
        texte: 'Toutes les commandes du jeu avec tes touches, rangées par ce que tu veux faire : piloter, voyager, combattre… L’app lit ton profil sans jamais le modifier : les touches se changent dans le jeu.',
      },
      {
        cible: '.tabs',
        titre: 'Deux écrans',
        texte: 'Tu es sur « Mes commandes ». L’autre onglet, « Garde des commandes », te prévient quand le jeu ignore ton profil de touches.',
      },
      {
        cible: tuto('outils-commandes-vide'),
        titre: 'Rien à afficher ?',
        texte: 'L’app n’a pas trouvé de profil personnel. Dans le jeu, ouvre Options puis Commandes et enregistre un profil « Personnalisé ». Si le dossier du jeu est introuvable, lance le jeu une fois.',
      },
      {
        cible: '.mc-recherche',
        titre: 'La recherche',
        texte: 'Tape ce que tu veux faire, comme « boost », « train » ou « carte ». Tu peux aussi taper une touche, comme « k » ou « bouton 3 », pour voir à quoi elle sert.',
      },
      {
        cible: tuto('outils-commandes-intentions'),
        titre: 'Par intention',
        texte: 'Ces boutons ne gardent qu’une famille de commandes. Un second clic sur le même bouton, ou « Tout », les remontre toutes.',
      },
      {
        cible: tuto('outils-commandes-touches'),
        titre: 'Avec ou sans touche',
        texte: '« Sans touche » montre les commandes que tu n’as pas encore assignées. « Réglages » ajoute les sensibilités et autres valeurs du profil. Le compteur à droite dit combien de commandes sont affichées.',
      },
      {
        cible: '.mc-doublons',
        titre: 'Touches en double',
        texte: 'L’app a trouvé la même touche pour deux commandes du même contexte. Elles sont marquées d’un signe d’avertissement dans la liste : à corriger dans le jeu si ça te gêne.',
      },
      {
        cible: '.mc-ligne',
        action: 'clic',
        titre: 'Ouvrir une commande',
        texte: 'Chaque ligne donne le nom de la commande et ses touches. Clique sur celle-ci pour voir son détail.',
      },
      {
        cible: '.mc-detail',
        titre: 'Où la trouver dans le jeu',
        texte: 'Le détail indique dans quelle partie du menu Commandes du jeu se trouve cette commande, et entre quelles voisines. L’emplacement est approximatif. Un nouveau clic sur la ligne referme le détail.',
      },
    ],
  },
  {
    id: 'outils-compagnon',
    titre: 'Compagnon',
    chemin: '/compagnon',
    etapes: [
      {
        titre: 'Un copilote qui réagit',
        texte: 'Le Compagnon est un petit personnage qui commente ce que tu fais en jeu. Ce n’est pas une IA : ses phrases sont écrites à l’avance et tirées au hasard. Rien ne sort de ton PC.',
      },
      {
        cible: tuto('outils-compagnon-active'),
        titre: 'Activé, puis Enregistrer',
        texte: 'La case « Activé » l’allume ou le fait taire. Sur cette page, rien n’est gardé tant que tu n’as pas cliqué sur « Enregistrer » : le bouton apparaît ici dès que tu changes un réglage, avec « Annuler » à côté.',
      },
      {
        cible: tuto('outils-compagnon-apercu'),
        titre: 'L’aperçu',
        texte: 'Ton personnage tel qu’il apparaîtra, avec sa bulle. Les pastilles sous lui montrent ses humeurs une par une : c’est juste pour voir, rien n’est enregistré.',
      },
      {
        cible: tuto('outils-compagnon-bavardage'),
        titre: 'Son nom et son bavardage',
        texte: 'Juste au-dessus, tu lui donnes un nom. Ici, tu choisis s’il parle peu ou beaucoup : « Discret » pour quelques mots de temps en temps, « Bavard » s’il doit réagir presque à tout.',
      },
      {
        cible: tuto('outils-compagnon-fenetre'),
        titre: 'Où il apparaît',
        texte: 'Cette case l’affiche dans une fenêtre par-dessus le jeu, qui s’ouvre quand le jeu tourne. La case suivante le montre aussi dans l’app, en bas à droite. Tu choisis ensuite de quel côté de la bulle se place son avatar.',
      },
      {
        cible: tuto('outils-compagnon-seuils'),
        titre: 'Les seuils de vente',
        texte: 'À partir de quel bénéfice il salue une bonne vente, et une très grosse vente. Monte ces montants si tu trouves qu’il s’emballe pour peu.',
      },
      {
        cible: tuto('outils-compagnon-avatar'),
        titre: 'Son avatar',
        texte: 'Le personnage affiché. « Choisir » en prend un autre, à valider ensuite avec « Enregistrer ». « Recharger la liste » sert après avoir ajouté ton propre avatar.',
      },
      {
        cible: tuto('outils-compagnon-reactions'),
        titre: 'Ses réactions',
        texte: 'Coche ce qui doit le faire parler. « Essayer » lui fait dire une phrase tout de suite, et le bouton d’à côté montre toutes les phrases de cette réaction. Pendant un combat, seules les alertes parlent.',
      },
      {
        cible: tuto('outils-compagnon-guide'),
        titre: 'Ton propre personnage',
        texte: 'Tu peux remplacer le Copilote par un personnage à toi : un dossier avec une image par humeur suffit. Ce guide donne le dossier à utiliser, la taille des images et une consigne prête pour un générateur d’images.',
      },
    ],
  },
  {
    id: 'outils-moniteur',
    titre: 'Moniteur PC',
    chemin: '/moniteur',
    etapes: [
      {
        titre: 'Ce que le jeu demande à ton PC',
        texte: 'Carte graphique, mémoire vidéo, processeur et mémoire, en direct. Utile pour savoir si ton PC est à la peine pendant que tu joues. Les relevés ne tournent que si cette page ou la fenêtre en jeu est ouverte.',
      },
      {
        cible: tuto('outils-moniteur-fenetre'),
        titre: 'La fenêtre en jeu',
        texte: 'Ce bouton affiche ou masque une petite fenêtre par-dessus le jeu, avec les mêmes mesures. Sers-t’en quand tu veux surveiller ton PC sans quitter le cockpit.',
      },
      {
        cible: tuto('outils-moniteur-pic'),
        titre: 'Le pic de mémoire vidéo',
        texte: 'L’app retient le plus haut niveau de mémoire vidéo atteint. Ce bouton fait repartir ce pic de la valeur actuelle, par exemple avant une nouvelle session.',
      },
      {
        cible: tuto('outils-moniteur-mesures'),
        titre: 'Les mesures',
        texte: 'Un bloc par mesure, mis à jour toutes les quelques secondes. La carte graphique n’est lue que si c’est une NVIDIA. La ligne « Mémoire » dit aussi ce que prend Elite quand il tourne.',
      },
      {
        cible: tuto('outils-moniteur-couleurs'),
        titre: 'Lire les couleurs',
        texte: 'La mémoire vidéo passe à l’ambre sous 3 Go libres et au rouge sous 1 Go. « Jeu + Windows » est une estimation : ce qui reste une fois retiré ce que prend l’IA de bord.',
      },
    ],
  },
  {
    id: 'outils-ia',
    titre: 'Alicia, l’IA de bord',
    chemin: '/ia',
    etapes: [
      {
        titre: 'Ton IA de bord',
        texte: 'Tu poses une question, elle lit tes données dans l’app et répond. Le modèle tourne sur ton PC, avec le programme Ollama : rien ne part sur internet. Elle porte le nom et l’avatar de ton Compagnon.',
      },
      {
        cible: tuto('outils-ia-coupee'),
        titre: 'Coupée pour l’instant',
        texte: 'L’IA est facultative. Pour l’allumer, il faut le programme Ollama installé sur ce PC et une carte graphique avec au moins 8 Go de mémoire vidéo. Sans cela, laisse-la coupée : le reste de l’app marche sans elle.',
      },
      {
        cible: tuto('outils-ia-discussion'),
        titre: 'La discussion',
        texte: 'Écris ta question en bas, puis Entrée ou « Envoyer ». Les phrases proposées sont des exemples : un clic pose la question. Sous chaque réponse, l’app note le modèle utilisé et les données qu’elle a lues.',
      },
      {
        cible: tuto('outils-ia-oublier'),
        titre: 'Oublier la conversation',
        texte: 'Efface les messages échangés pour repartir de zéro. Le bouton est grisé tant qu’il n’y a aucun message.',
      },
      {
        cible: tuto('outils-ia-etat'),
        titre: 'L’état',
        texte: 'Dit si l’IA est prête, quels modèles sont installés et combien de mémoire vidéo reste. Le jeu passe d’abord : si la mémoire manque, le modèle est déchargé. Le bouton du dessous la rend tout de suite.',
      },
      {
        cible: tuto('outils-ia-personnalite'),
        titre: 'Sa personnalité',
        texte: 'Son nom, la longueur de ses réponses et sa voix. Plus bas, tu décris son caractère en quelques lignes. « Essayer sa voix » te la fait entendre. « Enregistrer » garde le tout.',
      },
      {
        cible: tuto('outils-ia-enjeu'),
        titre: 'En jeu',
        texte: 'Le bouton affiche sa fenêtre par-dessus le jeu. Les cases lui font lire ses réponses à voix haute et te laissent lui parler au micro avec Alt+Maj+V. Ta voix est transcrite sur ton PC, sans internet.',
      },
      {
        cible: tuto('outils-ia-vue'),
        titre: 'La vue du jeu',
        texte: 'Si tu coches cette case, elle peut regarder la fenêtre d’Elite, jamais ton écran ni une autre fenêtre. Les images restent en mémoire sur ton PC : ni enregistrées, ni envoyées ailleurs. Décochée, plus aucune image.',
      },
      {
        cible: tuto('outils-ia-modeles'),
        titre: 'Les réglages des modèles',
        texte: 'Pour les connaisseurs : les noms des trois modèles (grand, intermédiaire, léger) et la mémoire à laisser au jeu. « Enregistrer » les garde, « Couper l’IA » l’éteint.',
      },
    ],
  },
  {
    id: 'parametres-page',
    titre: 'Paramètres',
    chemin: '/parametres',
    etapes: [
      {
        titre: 'Les réglages de l’app',
        texte: 'Tout ce qui se règle une fois pour toutes est ici, section par section. Certaines sections n’apparaissent que dans l’app de bureau, ou quand les fenêtres en jeu sont installées.',
      },
      {
        cible: tuto('parametres-general'),
        titre: 'Journaux et soirées',
        texte: 'Le dossier où le jeu écrit ses journaux : l’app le trouve seule, ne le change que s’il est ailleurs. Les heures de jeu par soirée servent à estimer en soirées le temps d’une route ou d’un chantier. « Enregistrer » garde les deux.',
      },
      {
        cible: tuto('parametres-compte'),
        titre: 'Mon compte',
        texte: 'Ce qui est à toi : ton commandant, lu dans tes journaux, ton escadron et la version de l’app. Tout reste sur ce PC. « Effacer mes données » vide l’app sans retour, après une confirmation à taper : n’y touche pas par curiosité.',
      },
      {
        cible: `${tuto('parametres-compte')} + section.panel:not(#reglage-tutoriels)`,
        titre: 'Partage avec l’escadron',
        texte: 'Pour partager un repère, un build ou une route avec ton escadron. La case active le partage : tant qu’elle est décochée, l’app ne demande rien au serveur de l’escadron. Ne la coche que si tu as rejoint un escadron.',
      },
      {
        cible: '#reglage-tutoriels',
        titre: 'Tutoriels',
        texte: 'La case décide si chaque page lance son tutoriel à la première visite. Le tableau liste tous les tutoriels : « Revoir » ouvre la page et relance le sien. Le bouton du bas les remet tous à « pas encore vu ».',
      },
      {
        cible: tuto('parametres-mar'),
        titre: 'Le MAR',
        texte: 'Le menu d’accès rapide est le petit menu de l’app posé sur l’écran, par-dessus le jeu. Choisis son coin, et le décalage s’il cache un élément du jeu. Il bouge tout de suite sous tes yeux.',
      },
      {
        cible: tuto('parametres-pave'),
        titre: 'Le pavé tactile',
        texte: 'Les menus de l’app en gros boutons, dans une fenêtre à part : pratique sur un petit écran tactile posé sous le principal. Cocher la case ouvre cette fenêtre tout de suite, la décocher la ferme.',
      },
      {
        cible: tuto('parametres-disposition'),
        titre: 'Placer les fenêtres en jeu',
        texte: 'Ce bouton ouvre d’un coup toutes les fenêtres que l’app peut afficher par-dessus le jeu. Tu glisses chacune où tu veux, sur l’écran du jeu, puis « Terminé » garde les places.',
      },
      {
        cible: tuto('parametres-lecteur'),
        titre: 'Le lecteur de journaux',
        texte: 'Pour vérifier que l’app suit bien le jeu : le journal en cours de lecture et, en direct, le nom et l’heure de chaque événement que le jeu écrit. Si rien ne bouge alors que tu joues, vérifie le dossier tout en haut.',
      },
    ],
  },
];
