// Tutoriels des fenêtres en jeu du mode « Minage Rhino » (voir ../moteur.js pour la forme d'un parcours). Deux parcours
// qui se suivent sur la même page (/fenetres-en-jeu/waypoints) : le bandeau, la liste des repères et le guidage, puis
// le balayage. Les fenêtres y sont en démonstration : sans l'overlay, les boutons du bandeau (🎯 📷 📍 ⏸ ✥) ne sont pas
// affichés, le guidage reste sur « Calcul… » et le Top 10 s'ouvre par-dessus la carte au lieu de sortir en volet.
export const PARCOURS_FENETRES_MINAGE = [
  {
    id: 'jeu-waypoints',
    titre: 'Fenêtres en jeu : Minage Rhino',
    chemin: '/fenetres-en-jeu/waypoints',
    etapes: [
      {
        titre: 'Les fenêtres du Minage Rhino',
        texte: 'Quand tu choisis le mode « Minage Rhino », quatre fenêtres se posent par-dessus le jeu : un bandeau, la liste de tes repères, le guidage et le balayage. Seul le bandeau est affiché d’emblée, les autres se montrent à la demande. Ici, tout est en démonstration, avec des données d’exemple.',
      },
      {
        fenetre: 'waypoints',
        cible: '.hud-id',
        titre: 'Le chrono de ta session',
        texte: 'Le chrono démarre à ta première tonne raffinée. Dessous, « en direct » devient « en pause » quand il s’arrête : après dix minutes sans rien faire, ou jeu fermé. Clique sur cette ligne pour le mettre en pause toi-même. Le petit ↺ remet le temps à zéro, en deux clics, sans toucher au reste.',
      },
      {
        fenetre: 'waypoints',
        cible: '.hud-row > .hud-cell:nth-child(2)',
        titre: 'La soute du Rhino',
        texte: 'Ce que ton Rhino, le véhicule au sol, transporte en ce moment, et sa capacité juste en dessous. La case se met à jour toute seule pendant que tu mines. Au-delà de 60 tonnes, elle clignote en rouge puis reste rouge : il est temps d’aller vider le Rhino dans ton vaisseau.',
      },
      {
        fenetre: 'waypoints',
        cible: '.hud-row > .hud-cell:nth-child(3)',
        titre: 'La soute du vaisseau',
        texte: 'Les tonnes déjà dans ton vaisseau, sa capacité, et la place qui restera une fois le Rhino vidé dedans. Quand il reste moins de 70 tonnes de place, la case s’entoure de rouge. Passe la souris dessus : la ligne du bas montre ce que la soute contient.',
      },
      {
        fenetre: 'waypoints',
        cible: '.hud-row > .hud-cell:nth-child(4)',
        titre: 'Ton rendement',
        texte: 'Le grand chiffre est ton rythme récent, en tonnes par heure. Dessous, la moyenne de toute la session. Un tiret s’affiche tant que l’app n’a pas de quoi le calculer.',
      },
      {
        fenetre: 'waypoints',
        cible: '.hud-last',
        titre: 'Matériaux et mérites',
        texte: 'Les matériaux ramassés pendant la session, comptés par grade : G1, G2, G3, G4, et G5 s’il y en a. Au bout de la ligne, les mérites Powerplay de la session, quand tu en as gagné.',
      },
      {
        fenetre: 'waypoints',
        cible: '.hud-last',
        titre: 'Les boutons du bandeau, en jeu',
        texte: 'En jeu, cette ligne se termine par des boutons, absents de la démonstration. 🎯 affiche ou cache le balayage. 📍 affiche ou cache la liste des repères. ⏸ met le chrono en pause, puis ▶ le relance. Un bouton allumé veut dire que sa fenêtre est affichée.',
      },
      {
        fenetre: 'waypoints',
        cible: '.hud-last',
        titre: 'Le cadre de capture',
        texte: 'En jeu, le bouton 📷 affiche un cadre en pointillés. Place-le sur le panneau du jeu qui montre le contenu d’un EEP ciblé (un EEP est un site de minage au sol). Le 📷 du cadre, ou Alt+Maj+P, photographie cette zone : l’app y lit les minerais et les note pour cet EEP.',
      },
      {
        fenetre: 'waypoints',
        cible: '.hud',
        titre: 'Cliquer et déplacer, en jeu',
        texte: 'En jeu, une fenêtre laisse passer tes clics vers le jeu, sauf sur ses boutons. Alt+Maj+K donne la souris aux fenêtres, puis la rend au jeu. Le bouton ✥, absent ici, permet de faire glisser la fenêtre, et 📌 la fixe. Alt+Maj+C fait la même chose. Alt+Maj+H cache ou réaffiche toutes les fenêtres.',
      },
      {
        fenetre: 'waypoints-list',
        cible: '.rl-bar',
        titre: 'La liste de tes repères',
        texte: 'Cette fenêtre range tes repères par système, par planète, puis par EEP. Elle suit toute seule l’endroit où tu es : ici, la planète 12 b. La barre du haut dit où tu en es dans la liste. Clique sur un de ses niveaux pour remonter, par exemple vers toutes les planètes du système.',
      },
      {
        fenetre: 'waypoints-list',
        cible: '.rl-sec .rl-nav:last-of-type',
        action: 'clic',
        titre: 'Un EEP de la planète',
        texte: 'Chaque ligne est un EEP où tu as des repères : son numéro, sa note si tu lui en as donné une, ses minerais, la distance du repère le plus proche quand tu es sur la planète, et le nombre de repères. Clique sur cette ligne pour voir ses repères.',
      },
      {
        fenetre: 'waypoints-list',
        cible: '.rl-row',
        titre: 'Un repère',
        texte: 'Les repères de l’EEP, du plus proche au plus loin : le nom, le nombre de forages et la distance. En jeu, le bouton 🧭 au bout de la ligne affiche la fenêtre de guidage et lui donne ce repère. Un second clic sur le même bouton la cache.',
      },
      {
        fenetre: 'waypoints-list',
        cible: '.rl-tools',
        titre: 'Repères taris, et revenir à toi',
        texte: 'Un repère tari ou pas rentable est caché. « Taris » le fait réapparaître, grisé, et son chiffre dit combien sont cachés. Quand tu t’es promené à la main dans la liste, « Suivre » apparaît et la ramène là où tu es. Le bas de la fenêtre résume l’écran affiché.',
      },
      {
        fenetre: 'waypoints-guide',
        cible: '.hud-panel',
        titre: 'Le guidage vers un repère',
        texte: 'En jeu, cette fenêtre montre une flèche qui pointe vers le repère par rapport à là où tu regardes, avec la distance et le cap à suivre. À moins de 100 m, elle affiche « Tu y es ». Elle se cache quand tu quittes la planète. La démonstration, elle, reste sur « Calcul… ».',
      },
    ],
  },
  {
    id: 'jeu-waypoints-balayage',
    titre: 'Fenêtres en jeu : Minage Rhino, le balayage',
    chemin: '/fenetres-en-jeu/waypoints',
    etapes: [
      {
        titre: 'Balayer un site de minage',
        texte: 'Un EEP est un site de minage au sol, en forme de disque. Le scanner du Rhino ne détecte un gisement qu’à moins de 1,5 km. Le balayage te fait rouler sur des cercles calculés pour que le scanner voie tout le disque, et retient ce qui a déjà été vu. En jeu, le bouton 🎯 du bandeau affiche cette fenêtre.',
      },
      {
        fenetre: 'waypoints-sweep',
        cible: '.hud-panel-head',
        titre: 'Commencer : le centre, puis le bord',
        texte: 'Roule jusqu’au centre de l’EEP et marque-le avec le bouton ◎. Roule ensuite jusqu’au bord et marque-le avec ◯ : l’app trace alors les cercles à suivre. Le titre donne le numéro de l’EEP. Plus bas, « Nouveau centre » fait repartir le balayage de l’endroit où tu es.',
      },
      {
        fenetre: 'waypoints-sweep',
        cible: '.sw-map',
        titre: 'La carte ronde',
        texte: 'C’est l’EEP vu du dessus, le nord en haut. Le grand cercle est son bord, le milieu est le centre que tu as marqué. En jeu, une flèche blanche te montre, tournée dans ton sens de marche. Le rond bleu autour d’elle est ce que ton scanner voit de là où tu es.',
      },
      {
        fenetre: 'waypoints-sweep',
        cible: '.sw-map',
        titre: 'Les anneaux et les tranches',
        texte: 'Le disque est découpé en anneaux, un par cercle à parcourir, et chaque anneau en tranches. Une tranche colorée a déjà été vue par ton scanner. Une tranche sombre reste à voir. La carte se remplit toute seule pendant que tu roules en Rhino, même si tu fais un détour.',
      },
      {
        fenetre: 'waypoints-sweep',
        cible: '.sw-map',
        titre: 'Les cercles en pointillés',
        texte: 'Chaque pointillé est une route à suivre, du plus grand cercle vers le centre. En jeu, celui du tour en cours prend la couleur de l’app. Inutile de le suivre au mètre près : une bande s’allume en vert tant que tu roules assez près de lui pour que tout l’anneau soit vu.',
      },
      {
        fenetre: 'waypoints-sweep',
        cible: '.sw-map',
        titre: 'Les losanges',
        texte: 'Un losange est un repère de cet EEP, à la couleur de son minerai. Vide, il est tari ou pas rentable. « 4F » veut dire quatre foreuses. L’orange marque la fin de ton dernier minage. Survole un losange : une bulle dit où vendre ce minerai dans le système. À droite, la légende des couleurs.',
      },
      {
        fenetre: 'waypoints-sweep',
        cible: '.sw-big',
        titre: 'Où tu en es',
        texte: 'L’avancement du tour en cours : un quart, la moitié, trois quarts, avec son pourcentage. En jeu, une flèche montre où rouler et une ligne te dit « Sur le cercle », « Écarte-toi du centre » ou « Rapproche-toi du centre », avec la distance. À la fin : « EEP balayé en entier ».',
      },
      {
        fenetre: 'waypoints-sweep',
        cible: '.sw-mark',
        titre: 'Poser un repère',
        texte: 'Tu as trouvé un bon gisement ? En jeu, ce bouton, ou Alt+Maj+R, prend ta position et ouvre un volet collé à la fenêtre. Rien n’est enregistré tant que tu n’as pas validé. S’il y a déjà un repère tout près, il est mis à jour au lieu d’en créer un second.',
      },
      {
        fenetre: 'waypoints-sweep',
        cible: '.sw-mark',
        titre: 'Le volet du repère',
        texte: 'Dans ce volet, tu donnes le nombre de foreuses, de 1 à 6, puis le minerai : les plus courants d’un clic, ou « Autre… » pour chercher. Le numéro de l’EEP est rempli seul quand l’app le connaît. Sinon tape-le une fois : tout l’EEP le prend. « OK » enregistre, la croix abandonne.',
      },
      {
        fenetre: 'waypoints-sweep',
        cible: '.sw-buttons .sw-btn:nth-child(3)',
        titre: 'Marquer une foreuse',
        texte: 'En jeu, ce bouton, ou Alt+Maj+F, note qu’une foreuse est posée là où tu es. Elle apparaît sur la carte dans un rond numéroté, et une case par foreuse s’ajoute sous la carte. L’app reconnaît seule chaque vidange. Un clic sur une case ouvre le guidage vers cette foreuse.',
      },
      {
        fenetre: 'waypoints-sweep',
        cible: '.sw-buttons .sw-btn:nth-child(4)',
        titre: 'Effacer ce balayage',
        texte: 'Ce bouton retire cet EEP de tes EEP balayés. Ses repères, eux, restent. Il demande confirmation : il affiche « Sûr ? » pendant trois secondes, et n’efface qu’au second clic.',
      },
      {
        fenetre: 'waypoints-sweep',
        cible: '.hud-panel-foot',
        titre: 'Le pied de la fenêtre',
        texte: 'À gauche, la part de l’EEP déjà balayée, tous cercles confondus. À côté, la longueur approximative de la route complète. En jeu, le bouton ✥ qui sert à déplacer la fenêtre se trouve au bout de cette ligne.',
      },
      {
        fenetre: 'waypoints-sweep',
        cible: '.sw-buttons .sw-btn:nth-child(1)',
        action: 'clic',
        titre: 'Le Top 10',
        texte: 'Quels minerais chercher en premier ? Clique sur « Top 10 ». Ici, le panneau s’ouvre par-dessus la carte. En jeu, c’est un volet qui glisse hors de la fenêtre, sur le côté.',
      },
      {
        fenetre: 'waypoints-sweep',
        cible: '.sw-top',
        titre: 'À chercher en priorité',
        texte: '« Galaxie » classe les minerais du Rhino par meilleure vente du moment, avec la station et son système. « Ce système » donne le meilleur prix et la demande sur place, pour vendre là où tu gagnes des mérites. Seul ce second onglet est rempli ici. La croix, ou « Top 10 », referme le panneau.',
      },
    ],
  },
];
