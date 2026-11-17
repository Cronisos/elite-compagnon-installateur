// Tutoriels du groupe minage-commerce (voir ../moteur.js pour la forme d'un parcours) : les écrans de Mes repères
// (sous la page d'accueil, qui a déjà le sien dans ../parcours.js), Minage vaisseau, et le Commerce.
//
// Ordre à garder : « commerce » avant « commerce-route ». Les deux ont la même adresse ; le premier vaut pour le
// tableau de bord, le second (sousPages) pour la fiche d'une route, et à égalité le moteur prend le premier.
//
// « reperes-repere-decrire » vaut pour la fiche d'un repère ouverte en saisie (« ?modifier=1 », après « Marquer ici »
// ou « Modifier ») ; « reperes-repere » pour la fiche elle-même. L'écran d'une planète et celui d'un EEP sont sous la
// même adresse (« /reperes/planete/… ») : un seul parcours pour les deux, dont les étapes de l'autre écran sont sautées.
//
// Les boutons « Afficher la fenêtre », « Pause » et « Partager à l'escadron » viennent du cadre commun
// (core/overlay.jsx, core/hud.jsx, core/PartageEscadron.jsx) : ils sont visés par leur infobulle, et leur étape est
// sautée quand ils ne sont pas affichés (fenêtres en jeu non installées, module Escadron absent).

const FENETRE = 'button[title="Fenêtre par-dessus le jeu"]';
const PAUSE = 'button[title^="Le chrono se met aussi en pause"]';
const PARTAGER = 'button[title^="Partag"]';

export const PARCOURS_MINAGE_COMMERCE = [
  // ───────────────────────────── Mes repères ─────────────────────────────
  {
    id: 'reperes-liste',
    titre: 'Tous mes repères',
    chemin: '/reperes/liste',
    etapes: [
      {
        titre: 'Tous tes repères',
        texte: 'Cet écran liste les endroits que tu as marqués, rangés par planète. Par défaut, il ne montre que ceux du système où tu te trouves.',
      },
      {
        cible: '.wp-head',
        titre: 'Revenir en arrière',
        texte: 'Chaque écran de Mes repères a ce bandeau : la flèche ↩ remonte d’un écran, la touche Échap aussi. Les noms à côté disent où tu es, et un clic sur l’un d’eux t’y ramène.',
      },
      {
        cible: '[data-tuto="reperes-liste-onglets"]',
        titre: 'Trois onglets',
        texte: '« Repères » montre ceux qui servent. « Taris » range les coins de minage que tu as vidés, pendant deux mois. « Pas rentables » garde ceux que tu as écartés, pour ne pas y retourner par erreur.',
      },
      {
        cible: '[data-tuto="reperes-liste-filtres"]',
        titre: 'Chercher et filtrer',
        texte: 'Tape un nom, un système, une planète ou un mot de tes notes. La liste à côté ne garde qu’un type de repère. Quand l’app connaît ta position, un bouton « Tous les systèmes » affiche aussi les repères d’ailleurs.',
      },
      {
        cible: '.wp-row',
        titre: 'Ouvrir un repère',
        texte: 'Un clic sur une ligne ouvre la fiche du repère : le guidage pour y retourner, et toutes ses actions.',
      },
      {
        cible: '.wp-bar .btn-primary',
        titre: 'Pas encore de repère ?',
        texte: 'La liste se remplit avec « Marquer ici » : en jeu, une fois sur place, ce bouton enregistre l’endroit où tu es. Il est grisé tant que l’app ne connaît pas ta position.',
      },
    ],
  },
  {
    id: 'reperes-repere-decrire',
    titre: 'Décrire un repère',
    chemin: '/reperes/repere?modifier=1',
    sousPages: true,
    etapes: [
      {
        titre: 'Décrire ton repère',
        texte: 'Le système, la planète et les coordonnées sont déjà notés. Il te reste à dire ce que c’est, pour le reconnaître plus tard. Ce formulaire revient chaque fois que tu cliques sur « Modifier ».',
      },
      {
        cible: '[data-tuto="reperes-decrire-nom"]',
        titre: 'Un nom',
        texte: 'Écris en quelques mots ce qu’il y a ici. C’est ce nom qui s’affiche dans tes listes et dans le guidage.',
      },
      {
        cible: '[data-tuto="reperes-decrire-type"]',
        titre: 'Le type de repère',
        texte: 'Choisis ce que c’est : exobiologie, géologie, site, épave, point de vue… Prends « Minage » pour un coin où tu mines au sol : c’est le seul type qui permet de lancer une session de minage.',
      },
      {
        cible: '[data-tuto="reperes-decrire-eep"]',
        titre: 'EEP et foreuses',
        texte: 'Pour un repère de minage seulement. Un EEP est un site de minage au sol, que le jeu numérote. Note son numéro et le nombre de foreuses que tu y poses : le repère sera rangé dans la fiche de cet EEP.',
      },
      {
        cible: '[data-tuto="reperes-decrire-notes"]',
        titre: 'Des notes',
        texte: 'Tout ce qui t’aidera la prochaine fois : ce qu’on y trouve, par où arriver, où te poser.',
      },
      {
        cible: '[data-tuto="reperes-decrire-enregistrer"]',
        titre: 'Enregistrer ou fermer',
        texte: '« Enregistrer » garde ce que tu as écrit et affiche la fiche du repère. « Fermer » quitte le formulaire sans rien changer.',
      },
    ],
  },
  {
    id: 'reperes-repere',
    titre: 'Fiche d’un repère',
    chemin: '/reperes/repere',
    sousPages: true,
    etapes: [
      {
        titre: 'La fiche d’un repère',
        texte: 'En haut, ce que c’est et où c’est. Dessous, le guidage pour y retourner, puis tous les boutons du repère. Les boutons de minage n’apparaissent que sur un repère de type « Minage ».',
      },
      {
        cible: '.waypoint-guide',
        titre: 'Le guidage',
        texte: 'Près de la surface de la bonne planète, une flèche te montre de combien tourner, avec la distance et le cap à suivre. Si tu es ailleurs, il te dit dans quel système ou vers quelle planète aller d’abord.',
      },
      {
        cible: '[data-tuto="reperes-fiche-session"]',
        titre: 'Lancer la session',
        texte: 'À cliquer quand tu commences à miner ici. L’app démarre un chrono et ouvre l’écran de la session : elle compte ce que tu raffines et ce que tu vends. Une session tourne déjà ? Le bouton devient « Session en cours » et t’y ramène.',
      },
      {
        cible: '[data-tuto="reperes-fiche-vide"]',
        titre: 'Vidé aujourd’hui',
        texte: 'À cliquer quand tu as tout ramassé et qu’il ne reste rien à miner. Le repère passe dans l’onglet « Taris » pour deux mois, avec sa date de retour. En cas d’erreur, le bouton « Annuler tari » le remet en place.',
      },
      {
        cible: '[data-tuto="reperes-fiche-rentable"]',
        titre: 'Pas rentable',
        texte: 'À cliquer si le coin ne vaut pas le déplacement. Le repère n’est pas supprimé : il part dans l’onglet « Pas rentables », pour te rappeler de ne pas y revenir. Le même bouton annule ce choix.',
      },
      {
        cible: '[data-tuto="reperes-fiche-modifier"]',
        titre: 'Modifier',
        texte: 'Rouvre le formulaire du repère : son nom, son type, ses notes et, pour le minage, le numéro de l’EEP et le nombre de foreuses.',
      },
      {
        cible: '[data-tuto="reperes-fiche-discord"]',
        titre: 'Copier pour Discord',
        texte: 'Copie un petit texte prêt à coller dans Discord : le nom, le type, la planète, le système, les coordonnées et tes notes. Rien n’est envoyé : c’est toi qui le colles où tu veux.',
      },
      {
        cible: `[data-tuto="reperes-fiche-actions"] ${PARTAGER}`,
        titre: 'Partager à l’escadron',
        texte: 'Ouvre une fenêtre où tu choisis à qui montrer ce repère : tout l’escadron, un rôle, ou quelques personnes. Rien ne part avant ton clic sur « Partager », et tu peux le retirer ensuite. Il faut avoir rejoint un escadron.',
      },
      {
        cible: '[data-tuto="reperes-fiche-supprimer"]',
        titre: 'Supprimer',
        texte: 'Efface ce repère pour de bon, après une confirmation. Pour un coin de minage décevant, préfère « Pas rentable » : tu gardes la trace de l’endroit.',
      },
    ],
  },
  {
    id: 'reperes-planete',
    titre: 'Une planète et ses EEP',
    chemin: '/reperes/planete',
    sousPages: true,
    etapes: [
      {
        titre: 'Prospecter une planète',
        texte: 'Un EEP est un site de minage au sol, que le jeu numérote. L’écran d’une planète montre tous ses EEP. Un clic sur l’un d’eux ouvre sa fiche, où tu notes ce que tu y as vu.',
      },
      {
        cible: '.wp-head',
        titre: 'Où tu es',
        texte: 'Le fil en haut suit ton chemin : le système, la planète, puis l’EEP. La flèche ↩ ou la touche Échap remonte d’un écran.',
      },
      {
        cible: '.survey-planet-actions',
        titre: 'Planète out et notes',
        texte: '« Planète out » écarte une planète où tu n’as rien trouvé de correct : elle passe en fin de liste. Un second clic annule. Le champ à côté garde tes notes sur la planète, enregistrées quand tu en sors.',
      },
      {
        cible: '.survey-grid',
        titre: 'Les emplacements',
        texte: 'Une case par EEP, avec sa note sur 10 quand tu l’as donnée et une épingle s’il porte un repère. Clique sur une case pour ouvrir sa fiche. Tu peux aussi taper un numéro d’EEP puis Entrée.',
      },
      {
        cible: '.survey-eep .survey-top',
        titre: 'La fiche d’un EEP',
        texte: 'Les flèches passent à l’EEP voisin. « Rien d’intéressant » le marque comme mauvais, pour ne pas y revenir. « Effacer » oublie tout ce que tu as noté sur lui.',
      },
      {
        cible: '.survey-ratings',
        titre: 'La note de l’EEP',
        texte: 'Donne une note de 1 à 10 d’un clic. À partir de 6, l’EEP compte comme rentable. Reclique sur la note pour la retirer.',
      },
      {
        cible: '.survey-eep .survey-add',
        titre: 'Ses minerais',
        texte: 'Note les minerais de l’EEP : clique sur un nom proposé, ou tape-le dans « autre… » puis Entrée. La croix d’un minerai le retire. Une capture du panneau de cible, en jeu, peut aussi les remplir.',
      },
      {
        cible: '.survey-eep > .btn-primary',
        titre: 'Marquer ici sur l’EEP',
        texte: 'Enregistre ta position comme repère de minage, déjà rattaché à cet EEP, puis ouvre son formulaire. Le bouton est grisé tant que tu n’es pas sur la planète.',
      },
    ],
  },
  {
    id: 'reperes-eeps',
    titre: 'EEP balayés',
    chemin: '/reperes/eeps',
    etapes: [
      {
        titre: 'Les cartes de tes EEP',
        texte: 'Quand tu balaies un EEP au Rhino, l’app dessine sa carte et la garde. Cet écran les range par système et par planète, pour les revoir ou les partager.',
      },
      {
        cible: '.eeps-tete',
        titre: 'D’où viennent ces cartes',
        texte: 'Le balayage se lance en jeu, au Rhino, depuis la fenêtre de minage : bouton 🎯, au centre de l’EEP. La carte revient d’elle-même quand tu retournes sur le même EEP.',
      },
      {
        cible: '.eeps-tete .btn',
        titre: 'Importer une carte',
        texte: 'Un autre joueur t’a envoyé un fichier de carte ? Ce bouton te laisse le choisir sur ton PC. L’EEP s’ajoute à ta liste, avec ses repères de minerais.',
      },
      {
        cible: '.eep-carte-liste',
        titre: 'Un EEP balayé',
        texte: 'Son numéro et son nom, son rayon, la part déjà balayée, et les minerais repérés avec leur nombre.',
      },
      {
        cible: '.eep-carte-liste .btn-primary',
        titre: 'Afficher la carte',
        texte: 'Ouvre la carte ronde de l’EEP dans une fenêtre. Le bouton reste grisé tant que le bord de l’EEP n’a pas été marqué pendant le balayage.',
      },
      {
        cible: '.eep-partage',
        titre: 'Partager la carte',
        texte: '« Fichier de carte » enregistre sur ton PC un fichier à envoyer à un joueur, qui l’importera dans son app. « Image » enregistre une image de la carte, à poster sur Discord.',
      },
      {
        cible: '.eep-carte-liste .btn-ghost',
        titre: 'Nommer et effacer',
        texte: '« Nommer » donne un nom à l’EEP, pour le reconnaître. « Effacer » le retire de cette liste après une confirmation : ses repères, eux, restent.',
      },
      {
        cible: '.mode-button',
        titre: 'Le mode « Minage Rhino »',
        texte: 'C’est ce mode qui ouvre, par-dessus le jeu, la fenêtre de minage et son balayage. Choisis-le ici avant de descendre sur la planète.',
      },
    ],
  },
  {
    id: 'reperes-captures',
    titre: 'Captures',
    chemin: '/reperes/captures',
    etapes: [
      {
        titre: 'Tes captures',
        texte: 'Une capture est une photo du panneau du jeu qui montre le contenu d’un EEP ciblé. L’app lit le texte de la photo et range les minerais reconnus dans la fiche de cet EEP.',
      },
      {
        cible: '[data-tuto="reperes-captures"]',
        titre: 'Prendre une capture',
        texte: 'En mode Minage Rhino, un cadre en pointillés s’ouvre par-dessus le jeu. Place-le sur le panneau qui liste le contenu de l’EEP, puis prends la photo avec 📷 ou Alt+Maj+P. Elle arrive ici, avec le texte lu.',
      },
      {
        cible: '.capture',
        titre: 'Une capture',
        texte: 'La photo, la date, l’EEP concerné et le texte lu. L’app dit si les minerais ont été rangés dans la fiche de l’EEP, ou si aucun EEP n’était ciblé. La croix supprime la capture.',
      },
      {
        cible: '[data-tuto="reperes-captures"] .survey-top .btn',
        titre: 'Les voir toutes',
        texte: 'L’écran montre les quatre dernières captures. Ce bouton affiche les autres, puis revient aux dernières.',
      },
      {
        cible: '.mode-button',
        titre: 'Le mode « Minage Rhino »',
        texte: 'Le cadre de capture ne s’ouvre qu’avec ce mode. Choisis-le ici avant de jouer.',
      },
      {
        cible: '.wp-head',
        titre: 'Revenir',
        texte: 'La flèche ↩ ou la touche Échap te ramène à l’accueil de Mes repères.',
      },
    ],
  },
  {
    id: 'reperes-session',
    titre: 'Session de minage',
    chemin: '/reperes/session',
    etapes: [
      {
        titre: 'Ta session de minage',
        texte: 'Une session mesure ce qu’un coin de minage au sol te rapporte : le temps passé, les tonnes raffinées, ce que tu as vendu. À la fin, tu sais s’il vaut le déplacement.',
      },
      {
        cible: '[data-tuto="reperes-session-vide"]',
        titre: 'Aucune session pour l’instant',
        texte: 'Une session se lance depuis un repère de type « Minage » : ouvre sa fiche, puis clique sur « Lancer la session ». Cet écran se remplit alors tout seul pendant que tu joues.',
      },
      {
        cible: '[data-tuto="reperes-session-tete"]',
        titre: 'Le chrono',
        texte: 'Le nom du repère et le temps de la session. À quai, jeu fermé ou sans action de ta part, le chrono se met en pause tout seul et l’app le dit ici. Il repart à ta prochaine action.',
      },
      {
        cible: '[data-tuto="reperes-session-stop"]',
        titre: 'Stop : session finie',
        texte: 'À cliquer quand tu as fini de miner ici. La session s’arrête et son bilan est rangé dans « Sessions passées », où l’app t’emmène.',
      },
      {
        cible: '[data-tuto="reperes-session-reset"]',
        titre: 'Reset',
        texte: 'Remet les compteurs et le chrono à zéro, après une confirmation. Utile si tu as lancé la session trop tôt. Ce qui était compté est perdu.',
      },
      {
        cible: '.mining-grid',
        titre: 'Les compteurs',
        texte: 'La soute du Rhino et celle du vaisseau, ton rythme en tonnes par heure, ce que tu as récupéré, ce que tes ventes ont rapporté, le gain par heure et tes mérites.',
      },
      {
        cible: '.mining-resources',
        titre: 'Minerais et matériaux',
        texte: 'Le détail par minerai : raffiné, transféré au vaisseau, vendu, et les crédits gagnés. À côté, les matériaux ramassés en passant.',
      },
      {
        cible: '[data-tuto="reperes-session-onglets"]',
        titre: 'Simulation de vente',
        texte: 'Cet onglet estime ce que ta soute rapporterait : pour chaque minerai, tu corriges les tonnes et le prix, et l’app calcule les crédits et les mérites. « Session » revient aux compteurs.',
      },
      {
        cible: '.mode-button',
        titre: 'La voir en jeu',
        texte: 'Le mode « Minage Rhino » affiche la session par-dessus le jeu, dans une petite fenêtre. Le bouton « Afficher la fenêtre » de cet écran l’ouvre aussi.',
      },
    ],
  },
  {
    id: 'reperes-historique',
    titre: 'Sessions de minage passées',
    chemin: '/reperes/historique',
    etapes: [
      {
        titre: 'Tes sessions passées',
        texte: 'Chaque session de minage terminée par « Stop : session finie » est rangée ici avec son bilan. C’est là que tu compares tes coins de minage.',
      },
      {
        cible: '[data-tuto="reperes-historique"]',
        titre: 'Le bilan de chaque session',
        texte: 'Une ligne par session : la date, le repère, la durée, les tonnes récupérées, la moyenne par heure, les crédits gagnés, le gain par heure, les mérites et les minerais. Tant que tu n’as rien terminé, la liste est vide.',
      },
      {
        cible: '[data-tuto="reperes-historique"] td .btn',
        titre: 'Reprendre',
        texte: 'Rouvre cette session pour continuer à compter dessus, et t’emmène sur son écran. Le bouton n’apparaît que si aucune autre session n’est en cours.',
      },
      {
        cible: '.wp-head',
        titre: 'Revenir',
        texte: 'La flèche ↩ ou la touche Échap te ramène à l’accueil de Mes repères.',
      },
    ],
  },
  {
    id: 'reperes-systemes',
    titre: 'Systèmes prospectés',
    chemin: '/reperes/systemes',
    etapes: [
      {
        titre: 'Les systèmes déjà prospectés',
        texte: 'Tous les systèmes où tu as noté quelque chose pour le minage au sol : un EEP, une planète, ou un repère de minage. Pratique pour retrouver un bon système quand tu n’y es plus.',
      },
      {
        cible: '.survey-systems',
        titre: 'Un système par case',
        texte: 'Pour chacun : combien de planètes sont rentables, taries ou écartées, et les minerais qui valent le coup. Les systèmes les plus rentables viennent en premier.',
      },
      {
        cible: '.survey-system',
        titre: 'Ouvrir un système',
        texte: 'Un clic affiche les planètes de ce système sur l’accueil de Mes repères, même si tu es ailleurs. Là-bas, le bouton « Revenir au système où je suis » te ramène à ta position.',
      },
      {
        cible: '.wp-head',
        titre: 'Revenir',
        texte: 'La flèche ↩ ou la touche Échap te ramène à l’accueil de Mes repères.',
      },
    ],
  },
  {
    id: 'reperes-escadron',
    titre: 'Repères de l’escadron',
    chemin: '/reperes/escadron',
    etapes: [
      {
        titre: 'Les repères de ton escadron',
        texte: 'Ici arrivent les repères que les membres de ton escadron ont partagés avec toi. Ils restent à part des tiens : rien n’est ajouté chez toi sans ton clic.',
      },
      {
        cible: '[data-tuto="reperes-escadron-types"]',
        titre: 'Trier par type',
        texte: 'Ces boutons ne gardent qu’un type de repère reçu : minage au Rhino, minage en vaisseau, ou les autres. « Tous » les montre ensemble.',
      },
      {
        cible: '[data-tuto="reperes-escadron-types"] + .panel',
        titre: 'Reçu de l’escadron',
        texte: 'La liste de ce qu’on t’a partagé. « Actualiser » va relire le serveur de ton escadron. Si le partage n’est pas encore prêt, l’app te dit ici quoi faire.',
      },
      {
        cible: '.partage-recu',
        titre: 'Un repère reçu',
        texte: 'Qui l’a partagé, où il se trouve et ses notes. « Copier dans mes repères » l’ajoute aux tiens, avec le nom de son auteur dans les notes. « Masquer » le retire de ta liste, sur ce PC seulement.',
      },
      {
        cible: '.topbar-settings',
        titre: 'Activer le partage',
        texte: 'Le partage avec l’escadron s’active dans Paramètres. Il faut d’abord avoir rejoint ton escadron avec le code de ton chef.',
      },
      {
        titre: 'Partager l’un des tiens',
        texte: 'Ouvre la fiche d’un de tes repères, puis clique sur « Partager à l’escadron ». Tu choisis qui le reçoit.',
      },
    ],
  },

  // ───────────────────────────── Minage vaisseau ─────────────────────────────
  {
    id: 'minage-vaisseau',
    titre: 'Minage vaisseau',
    chemin: '/minage-vaisseau',
    etapes: [
      {
        titre: 'Le minage en vaisseau',
        texte: 'Cette page suit ta session de minage dans les astéroïdes : ce que valent ceux que tu prospectes, tes drones, ce que tu raffines et la place qui reste en soute. Tout vient du journal du jeu.',
      },
      {
        cible: '[data-tuto="minage-vaisseau-session"]',
        titre: 'La session',
        texte: 'Une session commence toute seule au lancement du jeu. Tu vois ici son heure de début et le temps écoulé.',
      },
      {
        cible: `[data-tuto="minage-vaisseau-actions"] ${FENETRE}`,
        titre: 'Afficher la fenêtre',
        texte: 'Ouvre par-dessus le jeu une petite fenêtre avec ta soute, tes tonnes raffinées et le dernier astéroïde prospecté. Le même bouton la referme.',
      },
      {
        cible: `[data-tuto="minage-vaisseau-actions"] ${PAUSE}`,
        titre: 'Pause',
        texte: 'Arrête le chrono quand tu fais autre chose, et le relance ensuite. Il se met aussi en pause de lui-même quand tu es à quai ou que le jeu est fermé.',
      },
      {
        cible: '[data-tuto="minage-vaisseau-zero"]',
        titre: 'Remettre à zéro',
        texte: 'Repart d’une session neuve, après une confirmation : astéroïdes, tonnes et chrono reviennent à zéro. À faire quand tu changes de coin ou de minerai.',
      },
      {
        cible: '[data-tuto="minage-vaisseau-tuiles"]',
        titre: 'Les compteurs',
        texte: 'Ta soute, tes drones restants et ceux déjà lancés, les tonnes raffinées avec ton rythme sur la dernière demi-heure, et le nombre d’astéroïdes prospectés.',
      },
      {
        cible: '[data-tuto="minage-vaisseau-prospects"]',
        titre: 'Les astéroïdes prospectés',
        texte: 'Chaque astéroïde touché par un drone prospecteur s’ajoute ici, avec un verdict : bon, moyen ou à laisser. Tu vois aussi ses minerais, leur teneur, et s’il cache un filon mère.',
      },
      {
        cible: '[data-tuto="minage-vaisseau-valeur"]',
        titre: 'D’où vient le verdict',
        texte: 'La valeur est une estimation par tonne collectée, d’après la teneur de chaque minerai et un relevé de prix. Elle sert à comparer les astéroïdes entre eux, pas à prévoir ton gain exact.',
      },
      {
        cible: '.mode-button',
        titre: 'Le mode « Minage vaisseau »',
        texte: 'Choisis ce mode ici avant de partir miner : il ouvre la fenêtre de minage par-dessus le jeu. Le minage au sol, lui, se suit avec le mode « Minage Rhino ».',
      },
    ],
  },

  // ───────────────────────────── Commerce ─────────────────────────────
  {
    id: 'commerce',
    titre: 'Commerce : tableau de bord',
    chemin: '/routes',
    etapes: [
      {
        titre: 'Tes routes commerciales',
        texte: 'Une route, c’est une boucle : tu achètes dans une station, tu vends dans une autre, et tu reviens. L’app reconnaît chaque boucle dans le journal du jeu et compte ce qu’elle te rapporte.',
      },
      {
        cible: '.tabs',
        titre: 'Les onglets',
        texte: 'Le tableau de bord, la création d’une route, la liste de tes routes, l’historique de toutes tes boucles, et les routes partagées par ton escadron.',
      },
      {
        cible: '[data-tuto="commerce-totaux"]',
        titre: 'Tes totaux',
        texte: 'Toutes routes confondues : crédits et mérites gagnés, nombre de boucles, temps de jeu sans les pauses, et ce que t’ont coûté les réparations et les destructions.',
      },
      {
        cible: '.banner-link',
        titre: 'La route active',
        texte: 'Une seule route est active à la fois : celle que tu fais en ce moment. Ce bandeau ouvre sa fiche d’un clic.',
      },
      {
        cible: '[data-tuto="commerce-par-route"]',
        titre: 'Route par route',
        texte: 'Une ligne par route : ses boucles, son gain net et ses mérites. Un clic sur son nom ouvre sa fiche. Tant que tu n’as aucune route, la liste est vide.',
      },
      {
        cible: '.tabs a[href$="/routes/nouvelle"]',
        titre: 'Pour commencer',
        texte: 'Ta première route se crée dans l’onglet « Nouvelle route », après l’avoir faite une fois en jeu.',
      },
    ],
  },
  {
    id: 'commerce-nouvelle',
    titre: 'Commerce : nouvelle route',
    chemin: '/routes/nouvelle',
    etapes: [
      {
        titre: 'Créer une route',
        texte: 'Une route ne se saisit pas à la main. Tu la fais une fois en jeu, et l’app la retrouve dans ton journal : les stations, les marchandises, les prix.',
      },
      {
        cible: '[data-tuto="commerce-nouvelle-depart"]',
        titre: 'D’abord, en jeu',
        texte: 'Fais un aller-retour complet : de l’achat de ta marchandise de départ jusqu’à son rachat au même endroit. Sans cette boucle entière, l’app n’a rien à retrouver.',
      },
      {
        cible: '[data-tuto="commerce-nouvelle-detecter"]',
        titre: 'J’ai fait ma route',
        texte: 'Ce bouton lit ton journal et cherche ta dernière boucle. Rien n’est encore créé : l’app te montre d’abord ce qu’elle a trouvé. Si elle ne trouve pas de boucle, elle te le dit.',
      },
      {
        cible: '[data-tuto="commerce-nouvelle-detectee"]',
        titre: 'La route détectée',
        texte: 'Vérifie que c’est bien ta boucle : ses stations, ses marchandises, son gain net, sa durée et ses sauts. Si l’app hésite entre plusieurs points de départ, tu choisis ici le bon.',
      },
      {
        cible: '[data-tuto="commerce-nouvelle-reglages"]',
        titre: 'Le nom et l’objectif',
        texte: 'L’app propose un nom, que tu peux changer. L’objectif de crédits est le seul champ obligatoire : c’est la somme que tu vises. Tu peux écrire « 7 md » pour sept milliards.',
      },
      {
        cible: '[data-tuto="commerce-nouvelle-reglages"] label.check',
        titre: 'Tes boucles d’avant',
        texte: 'Si tu avais déjà fait cette route plusieurs fois, l’app a retrouvé ces boucles. Laisse la case cochée pour les compter dans la route dès sa création.',
      },
      {
        cible: '[data-tuto="commerce-nouvelle-creer"]',
        titre: 'Créer la route',
        texte: 'Enregistre la route et ouvre sa fiche. Elle devient ta route active : à partir de là, chaque nouvelle boucle est comptée toute seule.',
      },
      {
        cible: '[data-tuto="commerce-nouvelle-relire"]',
        titre: 'Relire le journal',
        texte: 'Refait la recherche dans ton journal, par exemple si tu viens de terminer une boucle de plus en jeu.',
      },
    ],
  },
  {
    id: 'commerce-liste',
    titre: 'Commerce : mes routes',
    chemin: '/routes/liste',
    etapes: [
      {
        titre: 'Tes routes',
        texte: 'Toutes les routes que tu as créées, chacune sur sa carte. C’est ici que tu changes de route ou que tu en supprimes une.',
      },
      {
        cible: '[data-tuto="commerce-liste-vide"]',
        titre: 'Encore aucune route',
        texte: 'Tu n’as pas encore de route. Le lien t’emmène à sa création : il faut l’avoir faite une fois en jeu avant.',
      },
      {
        cible: '[data-tuto="commerce-liste-carte"]',
        titre: 'Une route',
        texte: 'Ses systèmes et ses marchandises, puis ses boucles, son gain net, ton objectif et la date de la dernière boucle. L’étiquette « active » marque celle que tu fais en ce moment.',
      },
      {
        cible: '[data-tuto="commerce-liste-reprendre"]',
        titre: 'Reprendre',
        texte: 'À cliquer quand tu reviens sur cette route. Elle redevient la route active, à la place de l’autre, et sa fiche s’ouvre. C’est sur la route active que l’app vérifie tes achats.',
      },
      {
        cible: '[data-tuto="commerce-liste-ouvrir"]',
        titre: 'Ouvrir',
        texte: 'Affiche la fiche de la route pour la consulter, sans changer de route active.',
      },
      {
        cible: '[data-tuto="commerce-liste-supprimer"]',
        titre: 'Supprimer',
        texte: 'Efface la route et toutes ses boucles enregistrées, après une confirmation. C’est définitif.',
      },
      {
        cible: '.tabs a[href$="/routes/nouvelle"]',
        titre: 'Ajouter une route',
        texte: 'Une nouvelle route se crée dans cet onglet, une fois faite en jeu.',
      },
    ],
  },
  {
    id: 'commerce-historique',
    titre: 'Commerce : historique',
    chemin: '/routes/historique',
    etapes: [
      {
        titre: 'Toutes tes boucles',
        texte: 'L’historique liste chaque boucle enregistrée, toutes routes confondues. Tu peux le réduire à une route ou à une période.',
      },
      {
        cible: '[data-tuto="commerce-historique-filtres"]',
        titre: 'Les filtres',
        texte: 'Choisis une route, une date de début, une date de fin, ou les trois. Les chiffres et la liste se mettent à jour aussitôt. Un bouton « Effacer les filtres » apparaît pour tout remettre.',
      },
      {
        cible: '[data-tuto="commerce-historique-totaux"]',
        titre: 'Le total de la sélection',
        texte: 'Pour les boucles affichées : leur nombre, le gain net, les mérites et le temps réellement joué, pauses exclues.',
      },
      {
        cible: '[data-tuto="commerce-historique-boucles"]',
        titre: 'Boucle par boucle',
        texte: 'Une ligne par boucle : son départ, sa route, la soute, la durée, le gain net, les mérites, et ce qui s’est passé en chemin. La liste reste vide tant que tu n’as bouclé aucune route.',
      },
    ],
  },
  {
    id: 'commerce-escadron',
    titre: 'Commerce : routes de l’escadron',
    chemin: '/routes/escadron',
    etapes: [
      {
        titre: 'Les routes de ton escadron',
        texte: 'Ici arrivent les routes commerciales que les membres de ton escadron ont partagées avec toi. Elles restent à part des tiennes.',
      },
      {
        cible: '.module > section.panel',
        titre: 'Reçu de l’escadron',
        texte: 'La liste de ce qu’on t’a partagé. « Actualiser » va relire le serveur de ton escadron. Si le partage n’est pas encore prêt, l’app te dit ici quoi faire.',
      },
      {
        cible: '.partage-recu',
        titre: 'Une route reçue',
        texte: 'Qui l’a partagée, ce qu’elle rapporte en moyenne, puis ses étapes : où aller et quoi faire à chaque station. Les prix bougent : vérifie-les avant de charger. « Masquer » la retire de ta liste, sur ce PC seulement.',
      },
      {
        cible: '[data-tuto="commerce-escadron-suivre"]',
        titre: 'Suivre une de ces routes',
        texte: 'Une route reçue ne se copie pas. Fais-la une fois en jeu, puis crée-la dans « Nouvelle route » : l’app la retrouve dans ton journal et mesure tes propres boucles.',
      },
      {
        cible: '.topbar-settings',
        titre: 'Activer le partage',
        texte: 'Le partage avec l’escadron s’active dans Paramètres. Pour partager l’une de tes routes, ouvre sa fiche puis clique sur « Partager à l’escadron ».',
      },
    ],
  },
  {
    id: 'commerce-route',
    titre: 'Commerce : fiche d’une route',
    chemin: '/routes',
    sousPages: true,
    etapes: [
      {
        titre: 'La fiche d’une route',
        texte: 'Tout ce que l’app sait de cette route : où tu en es de ton objectif, ce qui se passe en ce moment, ce qu’il te reste à faire. Plus bas : la boucle, les marchandises d’appoint et le journal de chaque boucle.',
      },
      {
        cible: '.progress-banner',
        titre: 'Ta progression',
        texte: 'Ton solde, ton objectif, le pourcentage atteint et ce qu’il reste à gagner. La barre se remplit à mesure que ton solde monte.',
      },
      {
        cible: '.route-page .live',
        titre: 'En ce moment',
        texte: 'Ce que l’app voit de ta boucle en cours : ta prochaine destination, le chrono de la boucle et de l’étape, et si tu es en avance ou en retard sur ta moyenne. Les chronos s’arrêtent quand tu ne joues plus.',
      },
      {
        cible: '[data-tuto="commerce-route-indicateurs"]',
        titre: 'Ce qu’il te reste',
        texte: 'Le nombre d’allers-retours et le temps de jeu qu’il te faut encore, ton gain par boucle et par heure, et les mérites gagnés au passage.',
      },
      {
        cible: '[data-tuto="commerce-route-verifier"]',
        titre: 'Vérifier le dernier achat',
        texte: 'À chaque achat en jeu, l’app vérifie s’il sera rentable à la prochaine station et t’alerte sinon. Ce bouton refait la vérification du dernier achat et réaffiche l’alerte.',
      },
      {
        cible: '[data-tuto="commerce-route-redetecter"]',
        titre: 'Re-détecter la boucle',
        texte: 'À utiliser si la route affichée n’est plus la bonne : l’app relit ton journal et refait la liste des stations et des marchandises. Ton objectif est gardé, et elle demande avant de remplacer la boucle par une autre.',
      },
      {
        cible: '[data-tuto="commerce-route-discord"]',
        titre: 'Partager la route',
        texte: 'Prépare un message à coller dans Discord, ou une image, avec les stations, les marchandises et les prix. Rien n’est envoyé : tu copies, puis tu colles où tu veux. Ton nom n’y figure que si tu coches la case.',
      },
      {
        cible: `[data-tuto="commerce-route-actions"] ${PARTAGER}`,
        titre: 'Partager à l’escadron',
        texte: 'Ouvre une fenêtre où tu choisis à qui montrer cette route : tout l’escadron, un rôle, ou quelques personnes. Rien ne part avant ton clic sur « Partager ». Il faut avoir rejoint un escadron.',
      },
      {
        cible: '[data-tuto="commerce-route-reglages"]',
        titre: 'Les réglages',
        texte: 'Tu ne saisis que ton objectif et tes heures de jeu par soirée. Le reste est lu dans le jeu. Si une valeur est fausse, corrige-la dans sa case, ou vide la case pour revenir à la valeur automatique. « Enregistrer » valide.',
      },
    ],
  },
];
