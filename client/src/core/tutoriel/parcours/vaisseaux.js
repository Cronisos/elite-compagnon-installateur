// Tutoriels du groupe vaisseaux (voir ../moteur.js pour la forme d'un parcours) : la flotte (Mes vaisseaux) et les
// builds (liste, nouveau build, éditeur, tous les vaisseaux, comparer, reçus de l'escadron).
export const PARCOURS_VAISSEAUX = [
  {
    id: 'vaisseaux-flotte',
    titre: 'Mes vaisseaux',
    chemin: '/vaisseaux',
    etapes: [
      {
        titre: 'Ta flotte',
        texte: 'Cette page montre tous tes vaisseaux, une carte par vaisseau. L’app les trouve seule, dans les journaux que le jeu écrit sur ton PC. Tu n’as rien à saisir.',
      },
      {
        cible: '.tabs',
        titre: 'Deux onglets',
        texte: '« Mes vaisseaux », c’est ce que tu possèdes aujourd’hui, d’après le jeu. « Builds », ce sont tes plans d’équipement : ce que tu voudrais monter sur un vaisseau, avant de dépenser un crédit.',
      },
      {
        cible: '[data-tuto="vaisseaux-vide"]',
        titre: 'Encore vide',
        texte: 'Aucun vaisseau pour l’instant, c’est normal sur une app neuve. Lance le jeu une fois : ta flotte apparaîtra ici toute seule.',
      },
      {
        cible: '[data-tuto="vaisseaux-filtres"]',
        titre: 'Filtrer par modèle',
        texte: 'Un bouton par modèle de vaisseau. Clique sur l’un d’eux pour ne voir que ceux-là, par exemple tes trois Anaconda. « Tous » remet la flotte entière.',
      },
      {
        cible: '[data-tuto="vaisseaux-carte"]',
        action: 'clic',
        titre: 'La carte d’un vaisseau',
        texte: 'Son nom, où il est garé, sa taille de pad, son saut, sa soute, ses boucliers et son rôle. Le chiffre à côté de la clé compte ses modules passés chez un ingénieur. Ton vaisseau actuel est toujours le premier. Clique sur la carte pour ouvrir sa fiche.',
      },
      {
        cible: '[data-tuto="vaisseaux-fiche-nom"]',
        titre: 'Nom et rôle',
        texte: '« Nommer » donne au vaisseau un nom dans l’app, utile quand tu as deux fois le même modèle. « Rôle » dit à quoi il sert : le mode de jeu qui va avec s’ouvrira seul quand tu monteras à bord.',
      },
      {
        cible: '[data-tuto="vaisseaux-fiche-onglets"]',
        titre: 'Les trois vues de la fiche',
        texte: '« Stats » : défense, saut, mobilité, énergie, armement. « Modules » : ce qui est monté dans chaque emplacement, avec son ingénierie. « Ses builds » : tes plans pour ce vaisseau, et ce qu’il te reste à acheter ou à faire modifier pour y arriver.',
      },
      {
        cible: '[data-tuto="vaisseaux-fiche-construire"]',
        titre: 'En faire un build',
        texte: 'La fiche ne modifie rien : elle montre le vaisseau tel qu’il est. Pour essayer d’autres modules, ce bouton ouvre le constructeur de builds sur sa configuration actuelle.',
      },
    ],
  },
  {
    id: 'builds-liste',
    titre: 'Mes builds',
    chemin: '/builder',
    etapes: [
      {
        titre: 'Tes builds',
        texte: 'Un build, c’est le plan d’équipement d’un vaisseau : quels modules, dans quels emplacements, avec quelle ingénierie. Tu le prépares ici au calme, l’app calcule saut, boucliers, dégâts et énergie. Rien ne change dans le jeu.',
      },
      {
        cible: '.tabs-sous',
        titre: 'Les écrans des builds',
        texte: 'Ta liste de builds, la création d’un nouveau, le catalogue de tous les vaisseaux du jeu, la comparaison de deux configurations, et les builds que ton escadron a partagés avec toi.',
      },
      {
        cible: '[data-tuto="builds-nouveau"]',
        titre: 'Créer un build',
        texte: 'Ce bouton ouvre la création : tu pars d’un de tes vaisseaux, d’un vaisseau neuf, ou d’un build trouvé sur le site EDSY.',
      },
      {
        cible: '[data-tuto="builds-table"]',
        titre: 'La liste',
        texte: 'Une ligne par build enregistré : son nom, le modèle de vaisseau, celui de tes vaisseaux auquel il est destiné, et sa dernière modification. Clique sur le nom pour l’ouvrir dans l’éditeur.',
      },
      {
        cible: '[data-tuto="builds-ligne-actions"]',
        titre: 'Les boutons d’une ligne',
        texte: '« Partager » copie un résumé du build, prêt à coller sur Discord. « EDSY » l’ouvre sur le site EDSY, dans ton navigateur. « Dupliquer » en fait une copie et l’ouvre, pour tester une variante. La croix le supprime, après confirmation.',
      },
      {
        cible: '[data-tuto="builds-comparer"]',
        titre: 'Comparer deux builds',
        texte: 'Dès que tu as deux builds, ce bouton les met côte à côte, chiffre par chiffre.',
      },
      {
        cible: '[data-tuto="builds-mes-vaisseaux"]',
        titre: 'Tes vaisseaux',
        texte: 'Les vaisseaux dont l’app a lu l’équipement dans les journaux du jeu. La liste se remplit quand tu joues : si elle est vide, lance le jeu une fois.',
      },
      {
        cible: '[data-tuto="builds-vaisseau-actions"]',
        titre: 'Partir d’un vaisseau',
        texte: '« Nommer » et « Rôle » règlent le nom du vaisseau dans l’app et le mode de jeu qui s’ouvre quand tu montes à bord. « Build depuis ce vaisseau » crée un build avec son équipement actuel : le plus simple pour commencer.',
      },
    ],
  },
  {
    id: 'builds-nouveau',
    titre: 'Nouveau build',
    chemin: '/builder/nouveau',
    etapes: [
      {
        titre: 'Commencer un build',
        texte: 'Un build part toujours d’un vaisseau. Tu as trois points de départ : un vaisseau que tu possèdes, un modèle que tu n’as pas encore, ou un build venu d’ailleurs.',
      },
      {
        cible: '[data-tuto="builds-depart-flotte"]',
        titre: 'Un de tes vaisseaux',
        texte: 'Un bouton par vaisseau dont l’app a lu l’équipement dans les journaux. Clique sur l’un d’eux : le build démarre avec ses modules actuels, et tu n’as plus qu’à changer ce que tu veux essayer. Vide tant que tu n’as pas lancé le jeu.',
      },
      {
        cible: '[data-tuto="builds-depart-neuf"]',
        titre: 'Un vaisseau neuf',
        texte: 'Choisis un modèle dans la liste, puis « Commencer ». Pratique pour préparer un vaisseau avant de l’acheter. Si tu hésites entre plusieurs, le lien juste au-dessus ouvre tous les vaisseaux en cartes.',
      },
      {
        cible: '[data-tuto="builds-depart-import"]',
        titre: 'Importer un build',
        texte: 'Colle ici un lien EDSY (il commence par https://edsy.org) ou un export JSON de type Loadout, puis clique sur « Importer ». C’est la façon de reprendre le build qu’un autre joueur t’a envoyé.',
      },
      {
        titre: 'Ensuite, l’éditeur',
        texte: 'Une fois le départ choisi, l’éditeur s’ouvre sur cette même page. Rien n’est gardé tant que tu n’as pas donné un nom au build et cliqué sur « Enregistrer le build ». L’éditeur a son propre tutoriel.',
      },
    ],
  },
  {
    id: 'builds-editeur',
    titre: 'Éditeur de build : composer',
    chemin: '/builder/build',
    sousPages: true,
    etapes: [
      {
        titre: 'L’éditeur de build',
        texte: 'Ici tu équipes le vaisseau. En haut, les chiffres clés. À droite, les emplacements du vaisseau. À gauche, les modules possibles pour l’emplacement choisi. En bas, le détail des statistiques.',
      },
      {
        cible: '[data-tuto="builds-emplacements"]',
        titre: 'Les emplacements',
        texte: 'Tous les emplacements du vaisseau, rangés par groupe. Chaque ligne donne la taille de l’emplacement, le module qui s’y trouve et, s’il est modifié, son ingénierie. « vide » : rien n’y est monté.',
      },
      {
        cible: '[data-tuto="builds-emplacements"] .builder-slot',
        action: 'clic',
        titre: 'Choisir un emplacement',
        texte: 'On équipe un emplacement à la fois. Clique sur celui-ci : la colonne de gauche montrera ce qu’il peut recevoir. Ce clic ne change rien au build.',
      },
      {
        cible: '[data-tuto="builds-choix"]',
        titre: 'Choisir le module',
        texte: 'Tous les modules que cet emplacement accepte, par type. Chaque case est une classe et une note, comme « 5A ». Un clic sur une case monte le module. Une case grisée : le jeu le refuserait, une limite est atteinte. « Vider » retire le module.',
      },
      {
        cible: '[data-tuto="builds-ingenierie"]',
        titre: 'L’ingénierie',
        texte: 'Trois listes pour le module de l’emplacement choisi : la modification d’ingénieur, son grade, et l’effet expérimental. Elles n’apparaissent que pour un module qui peut être modifié.',
      },
      {
        cible: '[data-tuto="builds-resume"]',
        titre: 'Les chiffres clés',
        texte: 'Saut, boucliers, coque, dégâts par seconde, vitesse, énergie, soute, masse et prix. Ils se recalculent à chaque changement. Surveille l’énergie : au-dessus de 100 %, le générateur ne suit plus et la case passe au rouge.',
      },
      {
        cible: '[data-tuto="builds-pips"]',
        titre: 'Pips SYS',
        texte: 'Le nombre de pips que tu mets sur SYS en jeu. Ils réduisent les dégâts sur les boucliers et règlent leur recharge : change la valeur pour voir ce que tes boucliers encaissent. Ce réglage sert au calcul, il n’est pas enregistré dans le build.',
      },
      {
        cible: '[data-tuto="builds-details"]',
        titre: 'Le détail',
        texte: 'Les mêmes statistiques en détail, par thème : défense selon le type de dégâts, boucliers, coque, armement arme par arme, énergie et chaleur, saut et carburant, mobilité, masse.',
      },
      {
        cible: '[data-tuto="builds-enregistrer"]',
        titre: 'Enregistrer',
        texte: 'Tes changements ne sont gardés que quand tu cliques ici. D’ici là, « Modifications non enregistrées » s’affiche dans cette barre, et l’app te demande confirmation si tu quittes la page. Le bouton reste grisé tant que le build n’a pas de nom.',
      },
    ],
  },
  {
    id: 'builds-editeur-partage',
    titre: 'Éditeur de build : enregistrer et partager',
    chemin: '/builder/build',
    sousPages: true,
    etapes: [
      {
        titre: 'La barre du haut',
        texte: 'La barre au-dessus de l’éditeur sert à nommer le build, à l’enregistrer, à le partager et à trouver où acheter ses modules.',
      },
      {
        cible: '[data-tuto="builds-nom"]',
        titre: 'Le nom du build',
        texte: 'Donne-lui un nom qui dit à quoi il sert, par exemple « Python minage ». Sans nom, le build ne peut pas être enregistré.',
      },
      {
        cible: '[data-tuto="builds-pour"]',
        titre: 'Pour quel vaisseau',
        texte: 'Tu peux destiner le build à l’un de tes vaisseaux du même modèle. Il apparaîtra alors dans la fiche de ce vaisseau, avec ce qu’il te reste à acheter et à faire modifier pour y arriver.',
      },
      {
        cible: '[data-tuto="builds-enregistrer-nouveau"]',
        titre: 'Enregistrer comme nouveau',
        texte: 'Garde ce que tu vois sous la forme d’un nouveau build, sans toucher à celui que tu avais ouvert. Utile pour tester une variante.',
      },
      {
        cible: '[data-tuto="builds-copier"]',
        titre: 'Partager le build',
        texte: 'Copie un petit texte prêt à coller sur Discord : le nom du build, le vaisseau, ses chiffres clés et un lien EDSY. Rien n’est envoyé : c’est toi qui colles le texte où tu veux.',
      },
      {
        cible: '.builder-head button[title^="Partag"]',
        titre: 'Partager à l’escadron',
        texte: 'Envoie le build aux membres de ton escadron, dans leur app. Une fenêtre te demande à qui : tout l’escadron, un rôle, ou quelques personnes. C’est la version enregistrée qui part. Ce bouton n’existe que pour un build déjà enregistré.',
      },
      {
        cible: '[data-tuto="builds-inara"]',
        titre: 'Où acheter',
        texte: '« Chercher sur Inara » ouvre le site Inara dans ton navigateur : où acheter le vaisseau et ses modules, autour de ton système. Si le bouton dit « Charger la liste Inara », l’app a d’abord besoin de la page « recherche d’équipement » d’Inara, enregistrée avec Ctrl+S.',
      },
      {
        cible: '[data-tuto="builds-edsy"]',
        titre: 'Ouvrir dans EDSY',
        texte: 'Ouvre ce même build sur le site EDSY, dans ton navigateur. EDSY est un constructeur de vaisseaux en ligne : le lien s’ouvre dans un nouvel onglet.',
      },
      {
        cible: '[data-tuto="builds-notes"]',
        titre: 'Notes',
        texte: 'Un espace libre pour te rappeler à quoi sert ce build ou ce qu’il reste à régler. Les notes sont enregistrées avec le build.',
      },
    ],
  },
  {
    id: 'builds-tous-vaisseaux',
    titre: 'Tous les vaisseaux',
    chemin: '/builder/vaisseaux',
    etapes: [
      {
        titre: 'Tous les vaisseaux du jeu',
        texte: 'Le catalogue complet, une carte par modèle. Il sert à choisir un vaisseau que tu n’as pas encore, selon ce que tu veux en faire, avant de lui préparer un build.',
      },
      {
        cible: '[data-tuto="builds-apercu-tri"]',
        titre: 'Trier',
        texte: 'Choisis ce qui compte pour toi : le saut pour l’exploration, la soute et les compartiments pour le transport, les points d’emport pour le combat, ou encore la vitesse et le prix.',
      },
      {
        cible: '[data-tuto="builds-apercu-taille"]',
        titre: 'Taille de pad',
        texte: 'Ne garde que les vaisseaux d’une taille : petit, moyen ou grand. La taille décide des stations où le vaisseau peut se poser. Le champ « Nom », à côté, cherche un modèle précis.',
      },
      {
        cible: '[data-tuto="builds-apercu-besoins"]',
        titre: 'Ce qu’il doit porter',
        texte: 'Coche ce dont tu as besoin : un hangar pour le Rhino, des chasseurs, des cabines passagers… Seuls les vaisseaux qui acceptent tout ce qui est coché restent affichés.',
      },
      {
        cible: '[data-tuto="builds-apercu-carte"]',
        titre: 'La carte d’un modèle',
        texte: 'Prix, équipage et masse, puis saut maximal, soute maximale et vitesse. En dessous : ses points d’emport, la taille de chacun de ses compartiments, son réacteur FSD, son bouclier et sa coque de base. La lettre en haut à droite est sa taille de pad.',
      },
      {
        cible: '[data-tuto="builds-apercu-creer"]',
        titre: 'Créer un build',
        texte: 'Ce bouton ouvre l’éditeur de build sur ce modèle, neuf. Tu peux alors l’équiper et voir ce qu’il vaut vraiment.',
      },
      {
        cible: '[data-tuto="builds-apercu-legende"]',
        titre: 'Comment lire les chiffres',
        texte: 'Le « saut max » est calculé avec la même configuration d’exploration pour tous les vaisseaux, pour qu’ils se comparent. Le « saut d’origine » est celui du vaisseau tel que vendu. Ce paragraphe détaille chaque chiffre.',
      },
    ],
  },
  {
    id: 'builds-comparer',
    titre: 'Comparer',
    chemin: '/builder/comparer',
    etapes: [
      {
        titre: 'Comparer deux configurations',
        texte: 'Cette page met deux configurations côte à côte : deux builds, ou un build et l’équipement actuel d’un de tes vaisseaux. Pour savoir ce que tu gagnes et ce que tu perds avant de dépenser.',
      },
      {
        cible: '[data-tuto="builds-comparer-a"]',
        titre: 'La première',
        texte: 'Choisis la configuration de départ : un de tes builds enregistrés, ou la configuration actuelle d’un de tes vaisseaux.',
      },
      {
        cible: '[data-tuto="builds-comparer-b"]',
        titre: 'La seconde',
        texte: 'Puis celle que tu veux lui opposer. La liste se débloque une fois la première choisie, et propose d’abord les configurations du même vaisseau. Tu peux aussi comparer deux vaisseaux différents.',
      },
      {
        cible: '[data-tuto="builds-comparer-vide"]',
        titre: 'Rien à comparer pour l’instant',
        texte: 'Les deux listes sont vides tant que tu n’as ni build ni vaisseau connu de l’app. Crée un premier build, ou lance le jeu une fois.',
      },
      {
        cible: '[data-tuto="builds-comparer-stats"]',
        titre: 'Les statistiques',
        texte: 'Une ligne par chiffre, une colonne par configuration, puis l’écart. En vert, la seconde fait mieux. En rouge, elle fait moins bien.',
      },
      {
        cible: '[data-tuto="builds-comparer-modules"]',
        titre: 'Modules différents',
        texte: 'Pour deux configurations du même vaisseau : seuls les emplacements qui changent, avec le module de l’une et celui de l’autre.',
      },
      {
        cible: '[data-tuto="builds-comparer-equipement"]',
        titre: 'Équipement',
        texte: 'Pour deux vaisseaux différents, les emplacements ne se correspondent pas : l’équipement complet de chacun est listé côte à côte.',
      },
    ],
  },
  {
    id: 'builds-escadron',
    titre: 'Builds de l’escadron',
    chemin: '/builder/escadron',
    etapes: [
      {
        titre: 'Les builds reçus',
        texte: 'Ici arrivent les builds que des membres de ton escadron ont partagés avec toi. Ils restent à part des tiens : rien n’est ajouté chez toi sans ton clic.',
      },
      {
        cible: '.module > section.panel',
        titre: 'Reçu de l’escadron',
        texte: 'La liste des builds partagés. Si un message te demande de rejoindre l’escadron ou d’activer le partage, commence par là : le partage passe par le serveur de ton escadron.',
      },
      {
        cible: '.module > section.panel > .form-actions .btn',
        titre: 'Actualiser',
        texte: 'Relit ce que l’escadron a partagé. Clique dessus si un membre vient de t’envoyer un build et que tu ne le vois pas encore.',
      },
      {
        cible: '.partage-recu',
        titre: 'Un build reçu',
        texte: 'Son titre, qui l’a partagé, pour qui et quand. En dessous : le vaisseau, le nombre de modules et combien sont modifiés.',
      },
      {
        cible: '.partage-recu .form-actions',
        titre: 'Copier ou masquer',
        texte: '« Copier dans mes builds » l’enregistre chez toi, avec le nom de celui qui te l’a envoyé dans les notes. Tu peux ensuite l’ouvrir et le modifier. « Masquer » le retire de ta liste, sur ce PC seulement.',
      },
      {
        cible: '.topbar-settings',
        titre: 'Régler le partage',
        texte: 'Le partage avec l’escadron s’active dans Paramètres.',
      },
      {
        titre: 'Partager l’un des tiens',
        texte: 'Dans l’autre sens : ouvre un de tes builds enregistrés, puis clique sur « Partager à l’escadron » dans la barre du haut.',
      },
    ],
  },
];
