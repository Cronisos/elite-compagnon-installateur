# Modes de jeu et fenêtres en jeu

> Partie de la notice d’Elite Compagnon : sommaire dans le [README](../README.md#documentation).

## Menu « Mode de jeu »

**Commerce** (Mes routes commerciales), **Minage Rhino** (Mes repères), **Minage vaisseau**, **Combat**, **Sauvetage**,
**Matériaux** ou **Colonisation**. Choisir un mode ouvre
sa page et son HUD par-dessus le jeu (overlay), et ferme celui de l'ancien mode. Passer d'un mode à un autre remet à zéro la session du nouveau (chrono et compteurs de Combat, Sauvetage, Matériaux ou Minage vaisseau). Cette remise à zéro, comme celle du bouton, tient jusqu'au prochain lancement du jeu, même si l'app redémarre (heure gardée dans `server/data/sessions.json`). Le chrono se met en pause de lui-même dans trois cas : à quai (station, porteur), quand le jeu est fermé, et après plus de 10 min sans action (« pause · inactif »). Une action, c'est un événement du journal, un déplacement de plus de 50 m ou un changement d'écran. Cette pause part de la dernière action et finit à la suivante (`server/src/core/activity.js`). On peut aussi mettre en pause au bouton « ⏸ Pause » de la page, ou dans la fenêtre en jeu : ⏸ à côté de ✥, ou un clic sur « en direct ». Un nouveau clic relance le chrono, y compris après une pause « inactif ». Les taux par heure ne comptent donc que le temps de jeu actif. Le Commerce n'a pas de HUD. « Fenêtre Coup d'œil » ajoute le Coup d'œil en
fenêtre libre, quel que soit le mode. Chaque page (Combat, Sauvetage, session de minage, Coup d'œil) a aussi un
bouton « Afficher la fenêtre » / « Masquer la fenêtre ». « Aucun » ferme tout : les fenêtres du mode, et celles que
les modules ont ouvertes d'eux-mêmes (itinéraire, saut du porteur, vente à quai, alerte du Coup d'œil…). Chacune de
celles-ci reste fermée jusqu'à ce que son module la ferme lui-même (arrivée, fin de l'alerte, départ du quai), puis
s'ouvre de nouveau à sa prochaine occasion ; « Fenêtre Coup d'œil », si elle est cochée, reste. Les pages des modes et
le Coup d'œil n'ont pas de bouton dans la barre : ils sont dans ce menu et sur l'accueil (Coup d'œil aussi par Alt+C). En bas du menu : le vaisseau où tu es
(nom donné dans l'app, sinon nom en jeu, sinon modèle) et son rôle, modifiable sur place (« ⚑ Rôle », voir « Rôles des
vaisseaux »).

Les fenêtres ouvertes par les modules sont enregistrées avec le choix du menu (`server/data/overlay.json`). L'overlay
garde ses fenêtres quand le serveur redémarre (plantage relancé par `npm run dev`, code modifié) : le serveur relancé
sait donc les fermer quand leur module le demande, et ferme, 10 s après son démarrage, celles qu'aucun module n'a
reprises (alerte dont la minuterie est perdue…). L'itinéraire et le Compagnon reprennent la leur si elle sert encore.
Avant, ces fenêtres restaient par-dessus le jeu jusqu'au prochain ordre. Un ordre qui ne fait que fermer une fenêtre
ne lance jamais l'overlay s'il ne tournait pas (`--if-running`, `overlay/guards.js`). `PUT /api/overlay` est vérifié :
`mode` (identifiant ou `null`), `pages` (au plus 16 identifiants), `glance` et `dismissExtras` (vrai ou faux) ; sinon
400 avec la raison, rien n'est changé.

Les modes sont déclarés à un seul endroit, `server/src/core/modes.js` (données pures, sans import) : identifiant, nom,
icône et fenêtres de l'overlay ouvertes avec le mode (son HUD, puis les fenêtres en plus du module). L'interface reprend
ce fichier tel quel (`client/src/core/modes.js`, intégré par Vite), chaque module client y renvoie par
`mode: modeInfo('<id>')`, et le serveur s'en sert pour ouvrir seul les fenêtres d'un mode. Un mode ajouté là devient
aussitôt un rôle de vaisseau possible. Concordance avec les modules clients (identifiant, page, HUD et `hudPages` =
fenêtres, dans l'ordre) vérifiée par `client/src/core/modes.test.js` et par le banc (étape `75-pages`, sur les
modules tels que Vite les charge).

- Chaque fenêtre a son bouton **✥** : on la fait glisser, puis **📌** fixe sa position, retenue pour la suite.
  La fenêtre Coup d'œil se redimensionne aussi en mode déplacement, avec ◂ ▸ ▴ ▾.
- Sans position fixée, une fenêtre s'ouvre à la première place libre (`overlay/place.js`) : les HUD en haut au
  centre, les uns sous les autres selon leur vraie hauteur ; les fenêtres libres en haut à droite, sinon à côté ou
  sous celles déjà ouvertes, hors de la colonne des HUD et jamais sous une fenêtre qui prend la hauteur de son
  contenu (Coup d'œil, liste de courses). Les fenêtres qui s'ouvrent d'elles-mêmes (alerte des commandes, compagnon,
  vente de mérites, SCO prêt, saut du porteur…) ne se couvrent donc pas. Écran plein : l'ancienne place par défaut.
- Le Minage affiche la session lancée depuis **Mes repères** : soute du vaisseau et du SRV, taux, matériaux.
- L'overlay peut aussi se lancer seul : `npm run overlay` (Combat) ou `npm run overlay:sauvetage`.
- Temps réel : toutes les fenêtres et toutes les pages ouvertes dans un même navigateur partagent **une seule**
  connexion au serveur (`client/src/core/streamWorker.js`, un SharedWorker). Un navigateur ne garde que 6 connexions
  par adresse : avec une connexion par fenêtre, le Minage Rhino (6 fenêtres), le Coup d'œil et le Compagnon les
  prenaient toutes, et plus aucune donnée ni aucune nouvelle fenêtre ne se chargeait. Sans SharedWorker, une page
  ouvre sa propre connexion, comme avant. Côté serveur (`server/src/core/realtime.js`), un client qui ne lit plus
  (console figée par une sélection de texte, script bloqué) est coupé dès que plus de 1 Mo l'attend, ou qu'il est
  bloqué depuis plus de 30 s : avant, le serveur lui gardait tout en mémoire jusqu'à la fermeture. Le navigateur se
  reconnecte de lui-même. Au-delà de 32 connexions ouvertes, une nouvelle est refusée (503, avec la raison).

**Mode proposé** : l'app regarde ce que tu fais et propose le mode qui va avec. Une devinette ne bascule jamais
d'elle-même : changer de mode remet à zéro les compteurs du nouveau, donc une fausse alerte les viderait. Seule
exception, voulue par le joueur : le rôle principal d'un vaisseau, à l'embarquement (voir « Rôles des vaisseaux »).
Les signes retenus :

| Mode proposé | Signes |
|---|---|
| Minage Rhino | vaisseau pris avec un grand hangar (`largebuggybay`, celui du Rhino), Rhino sorti, ou tonne raffinée en SRV |
| Minage vaisseau | vaisseau équipé de lasers de minage ou de prospection, astéroïde prospecté, drone de prospection, ou tonne raffinée en vaisseau |
| Combat | prime, ou victoire en zone de conflit |
| Sauvetage | capsule de survie ramassée, ou livraison de sauvetage |
| Matériaux | 5 matériaux ramassés en 10 min, hors SRV et sans minage |
| Colonisation | à quai à un chantier de construction (nom de chantier **et** service `colonisationcontribution`), ou livraison à un chantier |

Un pirate qui t'attaque pendant le minage ne propose pas le Combat. La proposition prend la ligne du bas du HUD
(« PROPOSÉ ⛏ Minage Rhino ? vaisseau avec hangar à Rhino [Oui] [Non] ») et s'affiche aussi à côté du menu
« Mode de jeu ». « Oui » ouvre le mode et ses fenêtres. « Non » fait taire ce mode 30 min. Sans réponse, la
proposition s'efface au bout de 15 min, et les fenêtres en sont prévenues (la ligne du HUD se vide d'elle-même). Un
changement de vaisseau efface la proposition en cours : elle venait de l'ancien. Les rôles des vaisseaux changent ce qui
est proposé (propositions discrètes, « Retenir comme rôle de ce vaisseau ») : voir ci-dessous. Logique dans
`server/src/core/modeGuess.js`.

En Minage Rhino, le HUD reste en « pause · 1re tonne » tant qu'aucune session ne tourne : le chrono démarre à ta
première tonne raffinée.

### Ce qu'une fenêtre de l'overlay peut faire

Les fenêtres de l'overlay restent au premier plan pendant tout le jeu. Ce qu'elles chargent ne vient que de
l'interface de l'app ; même une page piégée (une dépendance du client, un défaut du moteur de rendu) n'y gagne presque
rien (`overlay/main.js`, `overlay/guards.js`) :

- **Aucune permission** : ni micro, ni caméra, ni lecture du presse-papiers, ni notifications, ni position, ni
  périphériques, ni ouverture d'une application externe (`mailto:`…). Sans gestionnaire, Electron accordait tout sans
  rien demander. La copie du nom d'un système passe par l'overlay lui-même.
- **Aucune requête ailleurs** : seulement `http://127.0.0.1:5173` (pages, modules, API par son proxy, flux temps réel) et
  `ws://127.0.0.1:5173` (rechargement de Vite). Un autre site, un autre port de ce PC ou un fichier local : annulé
  avant de partir.
- **Navigation** : une page ne part jamais ailleurs ; elle peut seulement se recharger elle-même, comme Vite le demande
  après une mise à jour ou un redémarrage (avant, ce rechargement était bloqué aussi, et la fenêtre restait sur l'ancien
  code jusqu'à ce qu'on la ferme). Un cadre inclus (iframe) ne navigue jamais. Aucune fenêtre surgissante.
- **Pont** (`overlay/preload.js`) : il n'écoute que le cadre principal de chaque fenêtre, à son adresse. Les fonctions
  sensibles sont réservées aux pages qui en ont besoin, et à **ton clic** : la fenêtre est affichée et la souris est
  dessus (ou le mode souris, Alt+Maj+K, est actif). Seul le cadre de capture photographie sa zone, au clic sur 📷
  (Alt+Maj+P, décidé par l'overlay, photographie même le cadre caché) ; seul le Coup d'œil copie un texte ; passer en
  mode déplacement (✥, la fenêtre prend alors le clavier) demande aussi le clic, en sortir (📌) jamais. Seules les
  fenêtres qui suivent leur contenu (Coup d'œil, liste de courses) changent d'elles-mêmes de hauteur. Une page ne peut
  donc ni se photographier en boucle, ni remplacer ce que tu as copié, ni prendre le clavier du jeu.
- **Ordres du serveur** : une fois lancé, l'overlay reste branché sur le serveur de l'app (`GET /api/overlay/stream`,
  `overlay/canal.js` ; canal local en 127.0.0.1, rien ne quitte le PC). Les ordres d'ouvrir ou de fermer une fenêtre
  passent par ce canal : aucun programme n'est relancé à chaque saut, et l'overlay n'est lancé que s'il n'y est pas
  branché. Plusieurs changements dans le même instant (modules qui réagissent au même événement du journal, double
  clic) partent en un seul ordre, avec l'état complet (`server/src/core/overlay.js`, 120 ms). Chaque ordre porte son
  heure (`--at`) : si deux ordres se croisent quand même, l'overlay n'applique pas le plus ancien arrivé en dernier.
  Une fenêtre fermée puis rouverte aussitôt reste fermable (avant, elle devenait orpheline : plus fermable par l'app,
  boutons sans effet).
- **Fenêtres rangées pendant un saut** : Signaux, Refroidissement FSD et Itinéraire sont seulement cachées au départ
  d'un système, puis réaffichées à l'arrivée sans prendre la main au jeu. Rangées depuis 10 minutes, elles se ferment
  pour de bon.

- **App arrêtée ou plantée** : les fenêtres ne gardent pas des valeurs figées présentées comme en direct (« Couvert ✓ »,
  « tout compte », boussole…). Chaque page `/hud/…` passe par `client/src/core/hudConnection.js` : au bout de 10 s
  sans connexion au flux temps réel (coupure, ou aucun message depuis 15 s, `STALE_MS` de `core/streamSource.js` : le
  proxy de Vite garde ouverte la connexion d'un serveur arrêté), son contenu est grisé sous le bandeau « Connexion à
  l'app perdue : valeurs figées ». L'overlay, de son côté, demande `GET /api/state` toutes les 10 s (`watchApp` de
  `overlay/guards.js`) : sans réponse depuis 30 s, toutes ses fenêtres se cachent ; de retour, elles réapparaissent ;
  sans réponse depuis 5 min, l'overlay s'arrête. Un raccourci global déjà pris par un autre programme (Electron ne le
  dit pas) est écrit dans la console et, l'overlay lancé par le serveur n'en ayant pas, nommé par une icône dans la
  zone de notification, qui permet aussi de masquer les fenêtres et de quitter l'overlay (la seule sortie si
  Alt+Maj+Q est pris).

Reste ouvert tant que l'overlay charge ses pages depuis Vite : si Vite est arrêté et qu'un autre programme prend
`127.0.0.1:5173` (un autre compte Windows du même PC, par exemple), les fenêtres qui se chargent ou se rechargent à ce
moment-là affichent sa page. Les gardes ci-dessus limitent ce qu'elle peut faire ; le chargement depuis le disque
(version Electron de l'app) fermera ce cas. L'étape `26-overlay` de `npm run controle` essaie toutes ces gardes dans le
vrai Electron.

## Mode « Minage vaisseau »

Page `/minage-vaisseau` et HUD : soute et drones restants, tonnes raffinées et rythme sur la dernière demi-heure, et
surtout le **dernier astéroïde prospecté** : minerais en pourcentage, présence de matériaux, filon mère, déjà miné ou
non, et sa **valeur estimée par tonne collectée** : somme de la teneur de chaque minerai multipliée par son prix.
Verdict en couleur : bon dès 40 000 cr/t, moyen dès 15 000, à laisser en dessous. Les prix sont relevés une fois
(`server/src/modules/shipmining/ore-prices.json`, médiane des meilleures offres d'achat sur Ardent Insight) : ils servent
à comparer les minerais entre eux, pas à prévoir le gain exact. Sans prix connu, le verdict se fait sur la teneur. Le raffinage fait depuis le SRV n'est pas compté ici : il relève du mode
**Minage Rhino** (session de Mes repères).

## Mode « Matériaux »

Page `/materiaux` et HUD : matériaux récupérés pendant la session (bruts, manufacturés, encodés), par grade, et le
dernier récupéré. Les grades viennent des données de référence téléchargées par l'ingénierie.

## Signaux du système

En mode **Sauvetage** ou **Matériaux**, une fenêtre s'ouvre d'elle-même par-dessus le jeu à chaque arrivée dans un
système, et se range au départ (cachée, puis réaffichée à l'arrivée suivante). Elle liste, au fur et à mesure qu'ils apparaissent (scan FSS ou balayage), les signaux
utiles : sources non identifiées (avec leur type, leur menace et le temps qu'il leur reste), sites au sol, zones de
conflit, sites d'extraction, mégavaisseaux, installations. Stations, porteurs et balises sont ignorés.

## Itinéraire

Dès qu'un itinéraire de plus de 2 sauts est tracé dans la carte de la galaxie, une fenêtre s'ouvre d'elle-même : sauts
restants, destination et distance, prochaine étoile, étoiles non récupérables sur la route (classes autres que
O, B, A, F, G, K, M) et dans combien de sauts arrive la première. Elle se ferme à l'arrivée ou quand l'itinéraire est
effacé.

**Carburant.** La case « Carburant » donne le niveau du réservoir (Status.json, en direct) et pour combien de sauts de
la route il suffit. Le calcul tient compte du **récupérateur de carburant** (Loadout) : sans lui, une étoile
récupérable ne sert à rien (la case de la prochaine étoile le dit) et le réservoir ne fait que baisser ; avec lui, on
suppose le plein refait à chaque étoile récupérable. Si le carburant ne couvre pas les **2 sauts suivants**, une
alerte rouge le dit (le saut qui ne passe pas, ce qui resterait, ce qu'il faudrait, pourquoi) et la fenêtre s'ouvre,
même pour une route courte.

Consommation d'un saut : carburant = k × (distance × masse)^exposant, la masse étant celle du vaisseau à vide + la
soute + le carburant. k est mesuré sur les 10 derniers sauts normaux du même vaisseau avec le même FSD (ingénierie
comprise ; sans les sauts boostés par une étoile à neutrons, une naine blanche ou une injection FSD), avec 15 % de
marge. L'exposant dépend de la taille du FSD, sauf pour les FSD Mk II (celui du Caspian : 2,45 quelle que soit la
taille, mesuré). Rejoué sur 958 sauts du joueur (10 nov. 2026) : jamais plus de 6 % sous la consommation réelle. Un
vaisseau qui n'a jamais sauté (ou un FSD changé) : « conso. connue au 1er saut ». Règles : `server/src/regles/saut.js`.

## Saut du porteur

Quand tu programmes un saut de ton vaisseau porteur, une fenêtre s'ouvre d'elle-même par-dessus le jeu (overlay) :
en carré, le compte à rebours jusqu'au départ en grand (heure donnée par le jeu dans le journal), la destination,
l'heure de départ et le tritium.
Elle s'ajoute au mode de jeu en cours et se ferme 2 min après le départ, à l'arrivée, ou à l'annulation du saut.
Comme les autres, elle se déplace avec ✥ et garde sa position. Il faut que l'app tourne au moment de la programmation.

## Refroidissement FSD et « SCO prêt »

Sans fenêtre : une jauge ronde par refroidissement, icône de propulseur au centre (FSD en bleu, SCO en orange), anneau qui
se remplit, compte à rebours dessous ; prêt : vert, flamme allumée, pulsation (`client/src/modules/fsdcool/Jauge.jsx`).
La jauge du FSD apparaît d'elle-même par-dessus le jeu pendant le refroidissement du FSD hors saut, par exemple
après une surcharge du supercruise (indicateur « FSD Cooldown », bit 18 de `Flags` dans `Status.json`). Le jeu ne
donne pas sa durée : le compte à rebours reprend celle des refroidissements déjà mesurés (`server/data/fsd-cooldown.json`).

**SCO prêt.** Le jeu ne dit pas non plus quand l'overdrive du supercruise (SCO) redevient disponible, et le bit
« FSD Cooldown » ne se lève pas après un SCO. À la coupure du SCO (bit 20 de `Flags2`, 0x00100000, qui retombe), la
même fenêtre montre « Prêt dans » en orange, puis **PRÊT** en vert pendant 4 s, et se ferme. Elle ne s'affiche qu'en
supercruise. Si le FSD refroidit en même temps, les deux comptes à rebours sont côte à côte.

La durée dépend de la génération du vaisseau (`Loadout.Ship`). Valeurs de départ d'après le plugin
[SCO-Cooldown](https://github.com/elitedangereuse/SCO-Cooldown) (9 oct. 2026), à mesurer :

| Vaisseaux | Durée |
|---|---|
| Nouvelle génération : Python Mk II, Type-8, Mandalay, Cobra Mk V, Corsair, Panther Clipper Mk II, Type-11 Prospector, Kestrel Mk II, Lynx Highliner | 9 s |
| Caspian Explorer (`explorer_nx`) | 7 s |
| Tous les autres | 17 s |
| Vaisseau pas encore connu | 9 s |

**Mesure.** Chaque coupure et la réactivation suivante sont notées dans `server/data/fsd-status.log`
(« SCO coupé : prêt dans 9.0 s », « SCO réactivé 10.2 s après la coupure »). Si le jeu refuse le SCO pendant son
refroidissement, cet écart borne la vraie durée par le haut. Les 20 derniers écarts de chaque vaisseau sont gardés
dans `server/data/sco-cooldown.json`. Un écart ne compte pas après une sortie du supercruise, un saut, un rechargement
du jeu ou un changement de vaisseau, ni s'il fait moins de 2 s ou plus de 60 s (le relevé note la raison). Dès que le
plus court écart d'un vaisseau passe sous la valeur de départ, il la remplace (la case « Durée » indique alors
« mesurée »). Premier relevé (5-7 nov. 2026, Type-11 Prospector) : 10,2 s au plus court sur 14 réactivations retenues,
compatible avec 9 s. Le nom du vaisseau affiché vient de `LoadGame` et des événements du chantier naval
(`ShipyardSwap`, `ShipyardNew`, `ShipyardBuy`), car `Loadout` ne le donne pas.
`GET /api/modules/fsdcool/sco` donne les règles en vigueur et les mesures par vaisseau. Constantes et sources :
`server/src/modules/fsdcool/sco.js`.

## Bilans de session (Activités › Bilans de session)

Page `/bilans` (module `bilan`) : chaque session de jeu, du chargement de la partie (`LoadGame`) à la fermeture du jeu
(`Shutdown`, ou le chargement suivant si le jeu s'est arrêté sans le dire), **reconstruite depuis le journal** :
l'historique est là dès le premier lancement. Pour chacune : durée, crédits (solde au chargement → au chargement
suivant, ou le solde en direct), crédits et mérites par heure, mérites Powerplay (doublons du jeu retirés,
`core/merits.js`), matériaux ramassés par grade, morts, sauts et distance, primes et obligations encaissées, vaisseaux
pilotés, et les modes de jeu joués avec leur durée. Les modes ne sont pas dans le journal : chaque changement est noté
dans `bilan-modes.json` à partir de maintenant. En haut : valeurs habituelles (médianes : un vaisseau acheté pendant
une courte session ne fausse rien) et records des sessions d'au moins 10 min ; chaque chiffre dit son écart à l'habitude.

**Jeu planté sans fermeture** : à la relance du jeu, la session d'avant est close à son dernier événement et marquée
« interrompue ». Sans relance, elle l'est après 2 h sans aucun signe de vie : ni ligne du journal, ni `Status.json`,
ni changement de mode. Une longue séance de minage sans saut garde donc ses modes, même après un redémarrage de
l'app : chaque changement de mode note le dernier signe de vie dans `bilan-modes.json`. Une session interrompue n'est
plus affichée « en cours » et compte dans les moyennes habituelles.

- **À la fermeture du jeu**, une fenêtre « Bilan de la session » s'ouvre par-dessus le bureau pendant 3 min (`/hud/bilan`).
- **Au changement de mode**, la même fenêtre donne le bilan du mode qu'on quitte (durée, mérites, matériaux, primes,
  sauts, morts) pendant 90 s, s'il a duré au moins une minute.
- L'accueil a une carte « Dernière session ». Calcul : `server/src/modules/bilan/state.js` (testé), textes :
  `client/src/modules/bilan/bilanVue.js` (testé). `GET /api/modules/bilan/sessions`.

## Module « Combat »

Page `/combat`, mise à jour en temps réel pendant le combat. Pour la session en cours, elle affiche les ennemis
abattus, les primes et obligations de combat gagnées, les mérites Powerplay gagnés en combat, le gain par heure
et les derniers kills (vaisseau, pilote, faction, gain).

- « Afficher la fenêtre » / « Masquer la fenêtre » : ouvre ou ferme le HUD par-dessus le jeu (kills, primes,
  mérites, chrono, dernier kill).
- **Overlay en jeu** : `npm run overlay` (l'app doit tourner) ouvre le même HUD sans bordure ni bandeau,
  transparent et toujours au premier plan ; les clics passent au jeu. Le jeu doit être en plein écran
  fenêtré. Le bouton **✥** passe en mode déplacement : on fait glisser le cadre, puis **📌** le fixe (la
  position est retenue). **Paramètres › Disposer les fenêtres en jeu** ouvre d'un coup toutes les fenêtres des
  modules (sans les tiroirs, qui suivent leur fenêtre), en mode déplacement et sans prendre le clavier, chacune dans un
  cadre à son nom, même celles qui ne s'affichent que quelques secondes (FSD prêt) ou à leur moment (saut du porteur,
  itinéraire, vente) ; « ✓ Terminé » enregistre chaque place et remet l'overlay comme avant (`POST
  /api/overlay/disposition`, `--disposer=1|0` ; le mode et ses fenêtres ne changent pas, rien n'est écrit dans
  overlay.json). Les fenêtres ouvertes cachées que tu laisses montrées (liste des repères, balayage, guidage, cadre de
  capture, Top 10…) sont gardées dans `fenetres-montrees.json` (dossier de l'overlay) : à la relance de l'app, du jeu,
  ou au retour du mode, elles reviennent montrées comme tu les avais laissées. Seul le survol de ce bouton rend la fenêtre cliquable. Raccourcis : **Alt+Maj+C**
  fait comme le bouton, **Alt+Maj+H** masque ou affiche, **Alt+Maj+Q** ferme (l'app l'apprend : elle ne croit plus
  les fenêtres ouvertes ; app arrêtée, l'overlay le lui dit à son lancement suivant : voir « Rôles des vaisseaux »). **Alt+Maj+K** passe en mode
  souris : toutes les fenêtres deviennent cliquables et prennent la main, le jeu relâche le curseur ; de nouveau,
  ou un clic dans le jeu, rend la main au jeu (le clavier parle à l'overlay tant que le mode est actif).
  Tout caché (◆ de l'app de bureau, ou Alt+Maj+H) : **Alt+Maj+K** réaffiche d'abord tout ce qui avait été caché
  (l'app de bureau retire son ◆), puis donne la souris ; plus besoin d'Alt+Tab pour revenir.
  L'API peut aussi demander à l'app de bureau de tout cacher ou réafficher, ou d'ouvrir une page (comme le MAR) :
  `GET /api/bureau` (`{ bureau, cache }`), `POST /api/bureau/cacher` (`{ cacher }`), `POST /api/bureau/ouvrir`
  (`{ chemin }`, une page de l'app, revérifiée par l'app de bureau) ; sans app de bureau : 409. C'est par là
  qu'Alicia agit (voir « IA de bord »).
  **Alt+Maj+F** (mode Minage Rhino) note la pose d'une foreuse du Rhino là où tu es ; **Alt+Maj+R** y pose un repère
  (fenêtre de balayage : nommé d'après le minerai raffiné, numéro d'EEP déduit, boutons de minerai pour le corriger).
  Aucune commande du profil de référence n'utilise Alt+Maj+R (R seul : poussée vers le haut, carte, recharger). Le jeu ne reçoit plus une
  combinaison prise par l'overlay : ne la mets sur aucune commande du jeu. Ces
  raccourcis marchent en jeu : on peut les mettre sur les boutons programmables d'une souris ou d'un HOTAS. Aucune
  fenêtre ne dépasse du bord de l'écran (elle peut passer sur la barre des tâches, cachée en jeu) : à l'ouverture, après un déplacement ou un
  redimensionnement, elle y est ramenée. Il
  utilise Electron (dossier `overlay/`, environ 270 Mo).
- La session commence au lancement du jeu. « Remettre à zéro » en ouvre une nouvelle jusqu'au prochain lancement
  du jeu, même si l'app redémarre.
- Kills comptés sur les primes, obligations, vaisseaux capitaux et joueurs. Un vaisseau abattu sans prime ni
  obligation (vaisseau « propre » d'une puissance ennemie) n'apparaît pas dans le journal : il n'est pas compté.
- Le journal ne dit pas d'où viennent les mérites : ils sont comptés en combat s'ils arrivent dans la minute qui
  suit un ciblage, une attaque ou un kill, et pas dans les 10 s qui suivent une vente, une livraison ou une mission.
- **Alerte du vaisseau** (`combat/vaisseau.js`, testé) : 4e case « Coque » du HUD et section de la page, avec un seuil
  réglable (5 à 95 %, 40 % par défaut, `GET`/`PUT /api/modules/combat/alerte`, gardé dans `combat-alerte.json`). La
  case clignote quand la coque passe sous le seuil, montre « boucliers ↓ » quand ils tombent, et prend un contour rouge
  si des modules sont sous le seuil ; la ligne du bas les liste alors (« FSD 32 % · relevé 15:02 ») à la place du
  dernier kill. Ce que le jeu permet, vérifié sur 58 journaux : la coque arrive en direct (`HullDamage`) mais par
  paliers d'environ 20 % ; l'état des modules n'est écrit que dans le `Loadout` (lancement du jeu, à quai, retour à
  bord, réarmement du SRV), jamais en plein combat : les modules sont donc ceux du dernier relevé, avec son heure.
  Réparations à quai (`RepairAll`, `Repair`) et AFMU (`AfmuRepairs`) les remettent à jour. Cet état ne repart pas de
  zéro avec la session.

## Module « Combat au sol »

Mode de jeu 🪖 Combat au sol (Odyssey), page `/combat-au-sol` et HUD `/hud/groundcombat` (`server/src/modules/groundcombat`,
testé). La session à pied, en temps réel : **kills** (obligations de combat des zones de conflit au sol, primes à pied)
et kills par heure, **gains** (obligations + primes) par heure, **mérites** gagnés à pied, **morts**, crimes à pied,
largages Frontline Solutions, kills par faction abattue, crédits par faction qui paie, **consommables** utilisés
(trousses, cellules d'énergie, grenades…) et les derniers kills. Le contexte : les **guerres** du système (guerre ou guerre
civile, factions, jours gagnés, enjeu), l'installation approchée et sa faction, la combinaison et ses armes.
- À pied ou pas : Disembark et Embark (Location au lancement). Les obligations et primes gagnées en vaisseau restent au
  module Combat ; les mérites gagnés à pied comptent ici. La suggestion de mode propose 🪖 sur un kill à pied
  (Status.json, Flags2 « à pied ») ou un largage de Frontline Solutions.
- Écrit d'après le format du journal Odyssey : aucun combat au sol dans les journaux de référence au moment de l'écrire, à
  vérifier à la première zone de conflit.

## Module « Sauvetage »

Page `/sauvetage`, sur le même modèle que Combat (session, bouton de fenêtre, overlay). Elle affiche les nacelles
d'évacuation, boîtes noires, débris et autres marchandises récupérés, ce qui reste en soute, les livraisons au
contact de recherche et sauvetage avec leurs récompenses, et les mérites Powerplay qui suivent.

- Overlay : `npm run overlay:sauvetage`. Si l'overlay de combat tourne déjà, la fenêtre s'y ajoute : les
  raccourcis Alt+Maj+C, H et Q agissent alors sur les deux. Chaque fenêtre a son bouton ✥ et sa position.
- Les mérites sont ceux reçus dans les 10 s qui suivent une livraison.
- Une marchandise livrée une fois au contact est ensuite reconnue comme marchandise de sauvetage.
- **Matériaux ramassés** pendant la session (épaves, débris : `MaterialCollected`), en bas du HUD : un compte par
  grade G1 → G5 (couleurs de la page Matériaux) et le total. Au survol, la liste (nom et nombre, du plus haut grade au
  plus bas) s'ouvre dans le cadre du HUD, de son haut jusqu'à la ligne, sans que la fenêtre change de taille. Ramasser un matériau
  compte comme une action (le chrono ne passe pas en pause « inactif »).
