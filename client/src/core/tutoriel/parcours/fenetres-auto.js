// Tutoriel des fenêtres en jeu qui s'ouvrent d'elles-mêmes (voir ../moteur.js pour la forme d'un parcours, et
// ../FenetresEnJeu.jsx pour la page de démonstration). Trois sont montrées avec des données d'exemple : l'itinéraire,
// les signaux et le moniteur du PC. Les autres ne s'affichent qu'au moment où il se passe quelque chose en jeu : elles
// sont expliquées dans une bulle, sans être montrées.

export const PARCOURS_FENETRES_AUTO = [
  {
    id: 'jeu-auto',
    titre: 'Fenêtres en jeu : celles qui s’ouvrent seules',
    chemin: '/fenetres-en-jeu/auto',
    etapes: [
      {
        titre: 'Des fenêtres qui viennent toutes seules',
        texte: 'Certaines fenêtres ne dépendent pas du mode choisi : l’app les ouvre quand elles deviennent utiles, puis les referme. Tu n’as rien à faire. En voici trois, avec des données d’exemple.',
      },
      {
        fenetre: 'navroute',
        cible: '.hud-head',
        titre: 'L’itinéraire',
        texte: 'Elle s’ouvre quand tu traces une route de plus de deux sauts dans la carte de la galaxie, ou quand ton carburant ne couvre pas les deux sauts suivants. Elle se referme à l’arrivée.',
      },
      {
        fenetre: 'navroute',
        cible: '.hud-row > .hud-cell:nth-child(1)',
        titre: 'Sauts restants',
        texte: 'Le nombre de sauts qu’il te reste, sur le total de la route. Il baisse à chaque saut.',
      },
      {
        fenetre: 'navroute',
        cible: '.hud-row > .hud-cell:nth-child(2)',
        titre: 'Ta destination',
        texte: 'Le système d’arrivée et la distance qu’il reste. Le petit bouton à côté de la distance copie le nom du système, pour le coller ailleurs.',
      },
      {
        fenetre: 'navroute',
        cible: '.hud-row > .hud-cell:nth-child(3)',
        titre: 'La prochaine étoile',
        texte: 'Sa classe, en vert si tu peux y récupérer du carburant, en rouge sinon. De quoi savoir avant le saut si tu pourras refaire le plein à l’arrivée.',
      },
      {
        fenetre: 'navroute',
        cible: '.hud-last',
        titre: 'L’alerte carburant',
        texte: 'La ligne du bas te prévient quand une étoile de la route n’est pas récupérable, et dans combien de sauts. Elle passe au rouge si ton carburant ne suffit pas.',
      },
      {
        fenetre: 'signals',
        cible: '.hud-panel-head',
        titre: 'Les signaux du système',
        texte: 'Elle s’ouvre à ton arrivée dans un système quand tu es en mode Sauvetage ou Matériaux. Elle liste les signaux utiles, au fur et à mesure que ton vaisseau les découvre.',
      },
      {
        fenetre: 'signals',
        cible: '.hud-panel-body',
        titre: 'Classés par sorte',
        texte: 'Chaque sorte a sa couleur : sources de signal, sites, zones de combat, sites d’extraction, mégavaisseaux, installations. Le chiffre devant un nom compte les signaux identiques, et « menace » dit le danger.',
      },
      {
        fenetre: 'signals',
        cible: '.hud-panel-foot',
        titre: 'Combien, et depuis quand',
        texte: 'Le total des signaux et l’heure de ton arrivée. Si la liste est vide, lance un scan du système (FSS) pour en révéler.',
      },
      {
        fenetre: 'systeme',
        cible: '.mpc',
        titre: 'Le moniteur du PC',
        texte: 'Celle-ci, tu l’ouvres toi-même depuis Outils › Moniteur PC. Elle montre la carte graphique, sa mémoire, le processeur et la mémoire vive pendant que tu joues.',
      },
      {
        titre: 'Le refroidissement du FSD',
        texte: 'Après un saut, une petite jauge compte le temps avant que ton moteur de saut soit de nouveau prêt, puis affiche « PRÊT ». Elle fait de même pour l’overdrive (SCO). Elle disparaît toute seule.',
      },
      {
        titre: 'Le saut du porteur, la vente de mérites',
        texte: 'Deux autres viennent au bon moment : le compte à rebours quand un porte-vaisseaux où tu es va sauter, et l’aide à la vente quand tu es à quai avec de quoi gagner des mérites (réglable dans Projet extension › Mérites à la vente).',
      },
      {
        titre: 'Le bilan, l’alerte des commandes, le compagnon',
        texte: 'Le bilan résume ta session quand elle se termine. L’alerte des commandes apparaît si le jeu signale un souci avec tes touches. Et ton compagnon te parle dans sa propre fenêtre, si tu l’as activé dans Outils › Compagnon.',
      },
      {
        cible: '[data-tuto="fej-scene"]',
        titre: 'Comme les autres',
        texte: 'Ces fenêtres se déplacent et se cachent comme celles des modes : le bouton de déplacement apparaît en jeu, et tes raccourcis clavier (Paramètres › Raccourcis clavier) valent pour toutes.',
      },
    ],
  },
];
