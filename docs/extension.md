# Projet extension

> Partie de la notice d’Enova : sommaire dans le [README](../README.md#documentation).

## Calculateur de routes (onglet du Projet extension)

Cherche les routes rentables autour de votre position (ou d'un système au choix), avec la soute, la portée
chargée et la taille de plateforme du vaisseau en jeu. Boucles A ⇄ B (aller + retour) et allers simples,
classés par gain par heure estimé ou par gain par boucle.

- Prix : API publique [Ardent Insight](https://github.com/iaincollins/ardent-api), alimentée par les relevés
  des joueurs (EDDN). Inara n'a pas d'accès ouvert à ses données. Environ 120 requêtes par recherche (≈ 5 à
  10 s), gardées 15 min en cache. Le cache garde 500 réponses au plus (les plus anciennes partent), et une réponse
  périmée lue est retirée : avant, chaque recherche et chaque frappe de l'autocomplétion restaient en mémoire jusqu'au
  redémarrage.
- Quantité = min(soute, stock au départ, demande à l'arrivée). Une demande de 1 signifie que la station
  n'importe pas la marchandise : pas de vente possible.
- Porte-vaisseaux et chantiers de colonisation exclus ; colonies Odyssey et stations planétaires en option.
- Durées « ≈ » : sauts × 65 s + supercroisière + 200 s d'amarrage et de marché, calées sur des boucles
  réelles. La boucle réelle est ensuite mesurée par « Mes routes commerciales ».

## Module « Projet extension »

Les routes Powerplay à prendre système par système : le rôle de chaque système, la longueur des sauts, et le nom à
copier pour la carte de la galaxie. Une route enregistrée respecte la portée du jeu : 20 AL au plus depuis un système
Consolidé, 30 AL depuis une Forteresse. Un saut plus long est refusé. Chaque route a son onglet, de la plus récente
à la plus ancienne, suivi de « + Nouvelle route » : on voit une route à la fois. L'Historique des mérites a les mêmes
onglets, plus « Tous les systèmes ». L'onglet « Calculateur de routes » de la même page cherche les routes commerciales rentables
(voir plus haut).

**Créer ou modifier une route** (onglet « Routes d'extension ») : « + Nouvelle route » ou « Modifier » ouvre
l'éditeur. Tu donnes un nom à la route, puis tu listes ses systèmes dans l'ordre, du départ (n° 0) à l'arrivée. Pour
chacun, tu choisis son rôle (« Déjà Forteresse », « Déjà Consolidé », « Objectif Consolidé », « Objectif
Forteresse » ou « Arrivée ») et le saut depuis le système d'avant, en AL (la virgule est acceptée : 18,4). Les
boutons ↑ ↓ et ✕ déplacent ou retirent un système. La portée est vérifiée pendant que tu tapes : 20 AL au plus
depuis un système Consolidé, 30 AL depuis une Forteresse (fiches `powerplay.prise.portee-consolide` et
`powerplay.prise.portee-forteresse` des Règles du jeu). « Calculer les sauts depuis mes journaux » remplit les
distances d'après les positions lues dans tes journaux, pour les systèmes où tu es déjà passé. Un saut laissé vide
est calculé à l'enregistrement, si c'est possible. Juste après le démarrage, avant la fin de la lecture des journaux,
un saut laissé vide est refusé avec « Lecture de tes journaux en cours… Réessaie dans un instant. » Tant qu'un
éditeur est ouvert, les autres boutons « Modifier » et « + Nouvelle route » sont grisés, pour ne pas perdre ce que
tu n'as pas enregistré. Les noms de systèmes sont comparés sans tenir compte de la casse, et l'orthographe du
journal est reprise. Si la liste des routes ne se charge pas, ou si une suppression échoue, la page le dit, avec
« Réessayer ». API : `POST /api/modules/expansion/projects` (créer), `PUT /api/modules/expansion/projects/:id`
(modifier : même identifiant, même vérification qu'à la création), et en lecture seule
`GET /api/modules/expansion/jumps?systems=…` et `GET /api/modules/expansion/rules` (portée et paliers).

La page a six onglets : Historique des mérites, Mérites à la vente, Mérites par heure, Routes d'extension,
Calculateur de routes et Où agir cette semaine (chacun décrit plus bas).

L'onglet « Historique des mérites », le premier de la page, reprend le rapport du squadron sur Discord, en solo :
les mérites que tu as gagnés dans les systèmes d'une route (ou dans tous les systèmes), semaine Powerplay par
semaine Powerplay, du jeudi 7 h UTC au jeudi suivant. On y trouve :

- la carte de la route, comme sur la carte Discord : fond étoilé, systèmes validés allumés, Forteresses en hexagone,
  et le vaisseau sur le système en cours avec sa jauge. Un système est validé quand son dernier relevé montre son
  objectif atteint (Consolidé, Forteresse, ou tenu pour l'arrivée). Les noms sont **complets**, sur deux lignes
  (« Synuefe » / « HK-C d14-83 ») : la carte de la galaxie du jeu ne trouve pas un système à son nom abrégé ;
- **le système** (ou l'objectif de la route si tu n'as rien gagné cette semaine), d'après le dernier relevé du jeu,
  tous les joueurs de ta puissance confondus : son niveau (Inoccupé, Exploité, Consolidé, Forteresse), ses points de
  contrôle dans la jauge du niveau, le renforcement de la semaine, la sape de la semaine (érosion du passage
  comprise), les points qu'il manque avant le passage de semaine pour le palier suivant (et en mérites), puis pour
  l'objectif de la route, et **l'érosion prévue au passage** si la jauge en reste là. Si le dernier relevé date
  d'avant le passage de jeudi, la page l'écrit : « Relevé d’avant le passage de jeudi : le renforcement est remis à
  zéro… Repasse dans le système pour voir son état. » Le renforcement est alors masqué, et ni érosion ni points
  manquants ne sont annoncés. Une jauge pleine avant le passage fait quand même avancer la route ;
- **l'érosion du passage de semaine** (règle mesurée le 12 nov. 2026, fiches `powerplay.erosion.*` des Règles du
  jeu) : à chaque passage, un système tenu perd un douzième de ce qui dépasse 25 % de son palier, arrondi en dessous :
  érosion = (points au passage − 25 % du palier) ÷ 12. Le journal la montre en sape juste après le passage, figée
  ensuite. Exact deux fois à Synuefe OU-E c28-2 (Exploité) : (149 600 − 87 500) ÷ 12 = 5 175 et
  (268 600 − 87 500) ÷ 12 = 15 091 ; rien sous 25 %. Vérifiée en Exploité seulement (« ? » ailleurs) ; non affichée
  quand le palier sera atteint (effet au changement de niveau inconnu). Le Coup d'œil la donne aussi
  (« Jeudi : −13 834 » sur la ligne de la semaine) ;
- **toi** : ton bilan de la semaine (mérites et points de contrôle gagnés, tes trois meilleurs jours), puis ton
  total dans le système depuis le début des journaux, avec tes points que le jeu n'a pas encore relevés (si le
  relevé date d'avant le passage, seuls les gains de la semaine en cours y figurent) ;
- le classement des activités : minage, combat, sauvetage, commerce, missions, livraisons Powerplay, exploration,
  exobiologie ;
- une vue jour par jour en barres empilées, avec le détail au survol, ou en tableau. Une journée va d'un passage
  de semaine au suivant, soit de 8 h à 8 h en heure d'hiver.

Paliers mesurés : la jauge d'un niveau va de 0 à 1,0. Une prise vaut 120 000 points, Exploité → Consolidé 350 000,
Consolidé → Forteresse 650 000, et la jauge d'une Forteresse 1 000 000. En prise, le surplus est perdu au passage de
semaine (mesuré, `/regles#pp-surplus-perdu`) ; pour un palier de renforcement, c'est encore à vérifier
(`/regles#pp-surplus-renforcement`).

Les flèches passent d'une semaine à l'autre, parmi celles où tu as gagné des mérites. L'historique se met à jour
à chaque gain.

**✓ Marquer le palier atteint** (sous le système, semaine en cours, renforcement seulement) : quand le relevé du jeu
reste sous le palier alors que c'est fait. Il peut être en retard, ou d'autres joueurs l'ont passé : le 15 nov. 2026,
Synuefe OU-E c28-2 est resté à 0,971 après une vente payée moitié prix. Le rapport montre alors la jauge pleine,
« ✓ Palier atteint · Consolidé au passage de semaine », le vrai pourcentage du jeu à côté du relevé. Sur la carte, le
système est allumé avec une bulle « PALIER ATTEINT ✓ · PASSAGE JEUDI 19 NOV. », et le vaisseau est déjà sur
l'étape suivante. La déclaration ne vaut que pour sa semaine (`expansion-paliers.json` dans le dossier des données,
huit semaines gardées) : au passage de jeudi, le vrai relevé reprend la main. Une prise ne se déclare pas.
`PUT /api/modules/expansion/palier {system, atteint}` ; le système doit être sur une route. Le nom est comparé sans
tenir compte de la casse : une déclaration faite avec une autre orthographe est remplacée ou retirée.

**📋 Copier pour Discord** (app de bureau seulement) : le rapport affiché (bannière, systèmes, bilan, classement) en
**GIF animé**, vaisseau et flammes compris, prêt à coller. Discord n'anime que les fichiers GIF : une image copiée y
serait collée fixe. L'app met donc le **fichier** dans le presse-papiers, comme un copier dans l'Explorateur
(`Set-Clipboard -LiteralPath` de PowerShell) : Ctrl+V dans un salon l'envoie. « ⇱ Glisser dans Discord » le
dépose aussi par glisser-déposer. Fabrication (`desktop/main.js`, `gif.js`, `partage.js`) :

- la page de capture `/capture/rapport-semaine?projet=…&semaine=…` (le rapport seul, 1 000 px de large) est ouverte
  hors écran, jamais montrée : ni ta fenêtre ni ton curseur ne bougent ;
- ses animations sont figées à 48 instants de la boucle (`pauseAnimations`, `setCurrentTime`), une capture chacun,
  5 centièmes de seconde par image : 2,4 s, la boucle exacte du vaisseau (sa flamme : 0,6 s). Aucun saut à la reprise ;
- encodeur GIF de l'app, sans dépendance : palette commune de 256 couleurs (coupe médiane, histogramme 6 bits par
  canal), première image entière puis le seul rectangle qui change (le vaisseau) : quelques centaines de Ko ;
- le fichier est `partage\rapport-semaine.gif` dans le dossier des données, remplacé à chaque copie. Rien ne part
  tout seul : c'est toi qui colles. La page ne donne que la route et la semaine, jamais un chemin de fichier.

Le journal ne dit pas d'où vient un gain, l'app le déduit de ce qui le précède :

- une vente, une livraison, une mission ou un sauvetage dans les 30 s (une vente de 785 t est créditée 13 s plus
  tard) ;
- un kill dans les 15 s ;
- un ciblage verrouillé ou une attaque subie dans la minute.

Une vente compte en minage quand la marchandise est un minerai. Un gain compte pour le système où tu es à ce
moment-là. Les doublons que le jeu écrit puis retire sont repris sur le gain d'origine.

À chaque arrivée dans un système, le jeu écrit son état Powerplay. L'app s'en sert pour compter les points et pour
vérifier qu'ils ont été comptés. Les règles, mesurées sur les journaux :

- 4 mérites = 1 point de contrôle (6 en exploration et en exobiologie), en prise comme en renforcement ;
- **prise** (système inoccupé) : 120 000 points = 1,0 de progression. Synuefe GA-I b57-6, 30 octobre : 2 322
  mérites, +0,004833, soit 580 points ;
- **renforcement** (système déjà tenu) : total de la semaine, remis à zéro au passage de semaine. Synuefe OU-E
  c28-2, 6 novembre : 60 779 mérites de vente, et un relevé passé de 16 079 à 35 547 avec les autres joueurs.
  En 1 pour 1, il aurait fallu au moins +60 779.

Le relevé du jeu additionne tous les joueurs de ta puissance dans le système : toi, tes coéquipiers et les autres. La
page ne le confond jamais avec tes points, calculés depuis tes seuls mérites. Une alerte ⚠ s'affiche quand le relevé
de tous les joueurs est plus bas que tes seuls points de la semaine : il manque forcément des tiens. Tant que ta
puissance n'est pas connue, ou si tu n'en as pas, le relevé affiché est celui de la puissance qui tient le système.
Dès que ta puissance est connue, seuls ses relevés sont gardés.

Le jeu met ses relevés à jour avec du retard : un gain peut n'apparaître qu'au relevé suivant.

#### Chez l'ingénieur (fiche en jeu)

À quai à la base d'un ingénieur qui a des tâches dans le dernier itinéraire calculé, pour un plan validé et non
modifié, la fenêtre « 🔧 Chez … » s'ouvre par-dessus le jeu (`/hud/engineering-visit`), et la même fiche s'affiche en
tête de la page Itinéraire : « Ici tu dois faire » (chaque module, ses grades cochés en direct — `G1 ✓ · ▸G2 · G3`,
▸ = grade commencé —, l'effet, 🔒 tant que le plan n'est pas posé, sinon l'effet serait effacé) et « Cela va te coûter »
(matériaux de l'escale comparés à ton inventaire du moment). Elle ne s'ouvre qu'en direct (jamais à la relecture du
journal), jamais sans tâche ; elle se ferme au départ, au chargement d'une partie, à l'arrêt du jeu, et ✕ la ferme
jusqu'au prochain amarrage.

- **Plan affiché** : celui du vaisseau que tu pilotes, sinon le premier qui a des tâches ici ; le choix « Plan … » le
  change à la main, jusqu'au départ, sans tenir compte du vaisseau piloté.
- **Modules montés sur un autre vaisseau** (pour sauter plus loin) : si le vaisseau piloté n'est pas celui du plan et
  porte le même module, c'est lui qui est lu, et la fiche le dit (« sur le vaisseau que tu pilotes ») ; sinon elle dit
  d'amener le vaisseau du plan ou d'y monter le module.
- **Avant** : « ⚠ Il porte … G3 + effet « … » : le 1er G1 de … les efface, sans retour » (R7).
- **Après chaque application** : remplacement prévu (✓), effet ou grades effacés hors du plan (⚠), application sur un
  module qu'aucune tâche d'ici ne vise alors qu'une tâche du même plan reste à faire (⚠). « Compris » efface l'alerte.
- **Limites de cette version** : pas de suivi des modules physiques à travers l'entrepôt et les transferts (un module
  rangé puis ressorti n'est reconnu que par son type), coût tel que calculé par l'itinéraire, rien d'enregistré (tout
  tient jusqu'au départ).

API (écritures avec `X-Elite-Compagnon: 1`) : `GET /api/modules/engineering/visit`, `PUT …/visit/plan` `{ planId | null }`,
`POST …/visit/close`, `POST …/visit/dismiss` `{ id }` ; temps réel `engineering:visit`. Fichiers :
`server/src/modules/engineering/services/visit.js`, `client/src/modules/engineering/VisitOverlay.jsx`,
`components/VisitSheet.jsx`, `visitView.js` (phrases, testées).

À vérifier en jeu : ouverture et fermeture réelles de la fenêtre, cases cochées pendant les applications, alerte sur un
autre module, modules montés sur un autre vaisseau.


### Mérites à la vente (onglet du Projet extension et fenêtre en jeu)

À quai, l'app dit ce que ta soute rapporterait ici en mérites avant que tu vendes, et pourquoi une vente risque de
rapporter 0. Rien n'est automatique : l'app conseille, tu vends.

- **Provenance de chaque tonne** : une tonne raffinée (`MiningRefined`) garde le système où elle a été minée et son
  état Powerplay du moment (`ControllingPower`, `Powers`, `PowerplayState` de `FSDJump` / `Location`) ; un achat
  (`MarketBuy`) garde son système et son prix ; une rare est reconnue grâce au champ `Rare` de Market.json. Une vente
  prend les lots les plus anciens d'abord (ordre du jeu non documenté). Un lot passé par ton porteur garde sa
  provenance et le note. Ce que porte le SRV est suivi à part : une mort dans le SRV ne retire que ça, le vaisseau
  garde sa soute (mesuré à 16 Librae le 29 oct.). Les marchandises Powerplay (`PowerplayCollect`, `PowerplayDeliver`)
  et les objets rendus au sauvetage (`SearchAndRescue`) sont écartés comme les drones. L'inventaire du jeu recale le
  suivi : le `Cargo` détaillé de la connexion, et en direct Cargo.json quand il suit la ligne `Cargo` du journal (même
  heure, même total), pour toute sortie que l'app ne suit pas (mission, dépôt…). Enregistré dans
  `server/data/expansion-sales.json` (écriture atomique) ; au lancement, tout est recalculé depuis les journaux.
- **Règles de lieu** (`server/src/modules/expansion/saleRules.js` : chacune avec sa source, sa date et son statut
  « mesurée », « publiée » ou « à vérifier ») :
  - système ennemi ou sans puissance : 0 (mesurée : Vequess le 30 oct., HIP 8060 le 31 oct.) ; minerai miné dans ce
    même système ennemi : sabotage possible, jamais mesuré ;
  - renforcement : minerai miné et vendu dans le même système (mesurée : Gungnir → Talta le 29 oct., HIP 73834 →
    Synuefe OU-E c28-2 le 6 nov.) ;
  - acquisition : minerai miné, ou marchandise achetée, dans un système Consolidé (à 20 AL) ou Forteresse (à 30 AL) de
    ta puissance (publiée ; seul le cas négatif est mesuré : 1 184 t minées et vendues à Synuefe GA-I b57-6, inoccupé,
    le 31 oct., 303,9 M cr, 0 mérite) ; commerce avec au moins 40 % de bénéfice (à vérifier) ;
  - rare : à vendre ailleurs que dans son système d'achat ;
  - demande inférieure à 4 × la quantité : taxe de vente en gros. L'app propose de répartir la vente, chaque part sous
    le quart de la demande restante (que cela évite la taxe est à vérifier) ;
  - petite vente (moins de 3 mérites prévus) : l'arrondi peut donner 0 (à vérifier).
- **Mérites prévus** : calculés sur tes propres ventes (une vente `MarketSell` suivie de son `PowerplayMerits`), en
  mérites par million de crédits. L'app prend d'abord la même marchandise dans le même mode, sinon la même sorte
  (minée, achetée, rare). Mesuré : environ 390 par million pour le minerai en renforcement, 65 à 72 pour le commerce,
  1 500 pour les reliques de Soontill en acquisition. Sans aucune mesure dans un mode, l'app reprend l'autre mode et
  affiche « extrapolé », avec le facteur appliqué : mesuré sur une sorte vendue dans les deux modes (les reliques de
  Soontill : 1 500 par million en acquisition, 520 en renforcement le 1er nov., soit × 2,9), sinon publié (+5 % en
  acquisition, −35 % en renforcement, soit × 1,6 ; contredit par la mesure, à vérifier). Le prix vient du Market.json
  de la station, avec son âge et l'écart avec ta dernière vente ici. Sans lui, l'app prend ta dernière vente ici.
  Seule une vente dont chaque tonne devait compter mesure un ratio : avec des tonnes de provenance inconnue ou prévues
  à 0, on ne sait pas sur quelle part le jeu a payé. Le 7 nov. à Rivers Depot, 268 t d'iridium dont 243 inconnues de
  l'app (minées la veille) ont rapporté 18 311 mérites : rapportés aux 25 t sûres, 4 192 par million au lieu de 391,
  et 40 088 mérites prévus pour les 90 t de 13:49, qui en ont donné 6 841. Sans vente entière mesurée, pas de chiffre.
- **Après la vente** : une vente sans `PowerplayMerits` dans la minute est notée « 0 mérite », avec sa cause probable.
  Dans une rafale de ventes, chaque gain va à la vente dont les mérites prévus sont les plus proches. Un doublon que le
  jeu retire plus tard est repris sur la vente qui l'avait reçu, même close : à la ligne suivante (un quart d'heure
  après le 28 oct. à ICZ KC-U b3-4) ou au total de la connexion suivante. Un gain qui suit une autre source
  (sauvetage, livraison, mission, kill, données Powerplay) ne compte pas pour la vente, sauf s'il tombe à ±25 % des
  mérites prévus d'une vente pas encore créditée. Le tableau « Ventes mesurées » (date, marchandise, lieux,
  provenance, mérites obtenus et prévus, cause) se copie en texte pour Discord, en heure UTC, sans ton nom ni ton solde.
- **Fenêtre en jeu** (`/hud/expansion-sale`) : elle s'ouvre d'elle-même à quai quand la soute a quelque chose à vendre
  (minerai ou achat apporté, ou objet que la station achète), et se ferme au départ. Elle attend que le jeu écrive
  depuis le lancement de l'app : après un plantage du jeu, elle ne s'ouvre pas sur le bureau. Elle montre les mérites
  prévus, les tonnes à 0 et l'âge du prix. En bas, le conseil principal, puis le résultat de la vente. La case
  « fenêtre en jeu à quai » de l'onglet la coupe.
- **Jamais présenté comme sûr** ce qui ne l'est pas. Mérites tirés d'un ratio extrapolé : « ≈ N ? », « estimé, à
  vérifier », en orange, dans la fenêtre comme dans l'onglet. Tonnes qui comptent d'après une règle dont le cas positif
  n'a jamais été vu (acquisition : minerai d'un système Consolidé ou Forteresse, commerce à 40 % ; seul le cas négatif
  est mesuré) : « règle jamais vue » au lieu de « tout compte », pastille « compte, règle jamais vue » dans l'onglet,
  jusqu'à ce qu'une de tes ventes de cette sorte soit créditée dans ce mode. Le conseil passe alors du niveau « ok »
  (« ta soute compte pour … ») au niveau « info », qui dit d'où vient l'estimation (« d'après tes ventes en
  renforcement × 1,6 (règles publiées). À vérifier. »), et la fenêtre porte « À vérifier ».
- API : `GET /api/modules/expansion/sale` (prévision), `GET …/sales?zero=1` (ventes mesurées, ratios, règles),
  `GET …/sales/text`, `PUT …/sale/settings` (`{ autoWindow }`).

Les tests rejouent un extrait réel des journaux (`fixtures/ventes-reelles.jsonl.gz`). Chacune des trois ventes de
1 184 t à 0 mérite ressort avec sa cause : Vequess est ennemi, HIP 8060 n'a pas de puissance, et l'iridium de Synuefe
GA-I b57-6 vient d'un système inoccupé. Le doublon du gallium du 28 oct. (14:55, retiré à 15:10) y est repris.

### Onglet « Mérites par heure »

Tes rendements réels, en mérites par heure active : au total, par activité (minage, commerce, combat, sauvetage…),
par état du système (Renforcement · Forteresse, Prise · Inoccupé, Sape · Exploité, Sans puissance…) et par paire
activité · état. Chaque ligne donne la taille de l'échantillon : travaux, gains, travaux à 0 mérite et temps actif.
Une ligne de moins de 5 travaux ou de 30 min actives est grisée (« échantillon faible »). La période se choisit :
depuis le dernier changement de règles connu (par défaut), semaine Powerplay en cours, 30 derniers jours, ou tout
l'historique. Pas de moyenne d'escadron pour l'instant : elle viendra avec le partage.

Comment l'app compte (`server/src/modules/expansion/rates.js`) :

- **les gains** sont ceux de l'Historique : l'écart de TotalMerits d'une ligne PowerplayMerits à l'autre, ce qui
  retire les doublons que le jeu écrit puis annule (journaux de référence du 23 oct. au 7 nov. 2026 : 52 lignes en double
  sur 1 154 ; additionner MeritsGained aurait compté 0,5 % de trop) ;
- **un travail** finit à chaque vente, kill, livraison Powerplay, mission rendue, sauvetage, vente d'exploration ou
  d'exobiologie, bon de combat encaissé (primes, obligations de combat, zones de conflit au sol), même sans mérite :
  une vente à 0 mérite compte donc, avec son temps. Les bons codex, trade ou scannable ne sont pas des travaux.
  Plusieurs ventes à la suite au même endroit, ou des kills à moins d'une minute d'intervalle, forment un seul
  travail. Un gain revient au travail de la même activité fini dans la minute qui précède ;
- **un gain sans travail** de son activité juste avant compte dans tes mérites, sans temps, et ne coupe pas le
  travail en cours : « Scan de vaisseaux » s'il arrive au plus 3 s après un scan complet de vaisseau (ShipTargeted,
  ScanStage 3 : 387 des 569 gains de +7 de tes journaux du 23 oct. au 7 nov. 2026) et ne dépasse pas 14 mérites
  (7 en renforcement, 14 en prise), « Autre » sinon. L'Historique, lui, range en combat un gain qui suit un ciblage
  ou une attaque subie ;
- **le temps d'un travail** est le temps actif écoulé depuis le travail précédent, mais au plus 30 min avant le
  premier signe de son activité (premier raffinage, drone de prospection, premier achat, première attaque, premier
  scan…), ou avant la vente s'il n'y en a aucun. Le reste est « temps actif écarté » : ingénieurs, chantier naval,
  longs détours. Les travaux finis pendant le même amarrage (pas de temps actif entre eux) se partagent ce temps
  quel que soit l'ordre de tes clics : chacun va du premier signe de son activité au premier signe de l'activité
  suivante, le dernier jusqu'à l'amarrage. Un travail sans aucun signe (un bon de prime encaissé en rendant ton
  exobiologie) n'a rien si un autre en a un ; s'ils n'en ont aucun, ils se partagent les 30 min. Les signes d'une
  activité qui ne finit pas à cet amarrage (une attaque subie en commerçant, des nacelles gardées en soute) ne
  comptent plus ensuite. Limite connue : un kill en espace pendant une autre activité (pirate abattu en minant ou
  en commerçant) prend jusqu'à 30 min à cette activité ; sur tes journaux, cela ne fait que 0,15 h ;
- **le temps actif** suit les règles des chronos des sessions : pause à quai, jeu fermé, et plus de 10 min sans action
  (mouvement ou changement d'écran vu dans Status.json, ou action écrite dans le journal : saut, raffinage, vente,
  ciblage… ; pas les messages reçus ni les attaques subies). `core/activity.js` ne garde que 3 jours de mouvements :
  l'onglet garde aussi les minutes jouées pendant un an (`server/data/expansion-activity.json`). Avant le premier
  mouvement connu, seules les actions du journal comptent, et le temps actif peut être un peu court (la page le dit) ;
- **une vente** est du commerce quand la marchandise a été achetée (prix d'achat moyen non nul), du minage quand c'est
  un minerai que tu n'as pas payé. L'Historique, lui, range en minage tout minerai vendu, même acheté ;
- **l'état du système** est celui de ta dernière arrivée dans le système où le gain est crédité (vente, kill…), pour ta
  puissance : renforcement (tenu par elle), sape (tenu par une autre), prise (inoccupé, ta puissance en lice), prise
  par une autre puissance, sans puissance. Les travaux faits sans allégeance ne comptent pas.

L'onglet liste aussi les **changements de règles** et les **modificateurs connus**, chacun avec sa date, sa source et
son statut (« publiée » : notes de Frontier ; « mesurée » : tes journaux ; « à vérifier »). Relevés le 7 nov. 2026 dans
les notes de mise à jour (API Steam News) :

- 25 avr. 2025 : renforcement −35 % (multiplicateur défensif), actions offensives +5 % ;
- 3 juil. 2025 : renforcement de −20 % à +30 % selon la sape subie dans les dernières 24 h (−20 % sans aucune sape),
  sape +15 %, prise 0 % ;
- 11 nov. 2025 : ventes à l'unité ajustées par rapport aux ventes en gros ;
- 2 déc. 2025 : systèmes marqués, +25 % en sape et +35 % en renforcement, d'abord autour de HIP 87621 seulement
  (à vérifier depuis) ; correctif du commerce Powerplay qui rapportait trop peu ;
- 24 févr. 2026 : correctif des kills de joueurs qui ne rapportaient rien ;
- 1er juil. 2026 : Opérations, nouvelle source de mérites (non chiffrée dans les notes) : le dernier changement connu.

Le jeu n'écrit aucun modificateur dans le journal : l'app ne les applique pas, elle mesure après coup. Tu peux ajouter
les tiens (« Ajouter ») : un système marqué, un bonus constaté, ou un changement de règles, avec sa source et sa date.
Un changement de règles saisi devient le début de la période par défaut. Un modificateur qui nomme un système reçoit
ce que tu y as fait pendant la semaine Powerplay de sa date : de quoi mesurer un bonus de système marqué. Ils sont
gardés dans `server/data/expansion-modifiers.json`. Les règles connues sont des constantes de `rates.js`
(`RULE_CHANGES`, `KNOWN_MODIFIERS`) : chacune a sa date, sa source et son statut.

## Où agir cette semaine (onglet du Projet extension)

Tu choisis ce que tu veux faire, l'app liste les systèmes valides autour de toi :

- **Prise (acquisition)** : systèmes Inoccupés à 20 al au plus d'un système Consolidé de ta puissance, ou à 30 al
  d'une Forteresse. Pour chacun : le système d'appui et sa distance, l'avancement de la prise (en % et en points,
  120 000 points = 1,0) et les puissances rivales ;
- **Renforcement** : systèmes tenus par ta puissance, avec la jauge, le renfort et la sape de la semaine (tri « le plus
  menacé » : sape moins renfort) ;
- **Sape** : systèmes tenus par une autre puissance (toutes, ou celle que tu vises) ;
- **tes tâches de la semaine** : le journal ne les écrit pas, tu les saisis (« + Tâche de la semaine ») : système visé
  (prise, ta puissance, une autre, peu importe), états, station exigée (grand port, avant-poste, port planétaire,
  colonie Odyssey, mégavaisseau, porte-vaisseaux), plateforme L, contact Powerplay, zones de conflit (guerre ou guerre
  civile en cours). Elles sont gardées dans `server/data/whereto.json`. Une tâche d'une semaine passée le signale et
  se reprend d'un clic.

Les mêmes exigences de station se cochent aussi pour les trois activités de base.

**Âge de la donnée.** Les états viennent de [Spansh](https://spansh.co.uk), relevés par les joueurs. Chaque résultat
montre l'âge de son relevé : vert s'il date de la semaine Powerplay en cours, orange s'il précède le passage du jeudi,
rouge au-delà de 7 jours. Le 7 nov. 2026, dans un rayon de 40 al autour de Synuefe OU-E c28-2, la moitié des systèmes
Inoccupés avaient un relevé de plus de 20 jours.

**Confirmation par le journal.** Chaque arrivée (FSDJump, Location, CarrierJump) donne l'état réel du système :

- la colonne « En jeu » montre ton dernier passage (✓ valide, ⚠ démenti, avec la raison). Un passage plus récent que
  Spansh qui dément la tâche envoie le système en fin de liste ;
- après une recherche, un bandeau dit à chaque arrivée dans un système de la liste (ou valide pour la tâche) s'il
  convient. Un saut de transit hors de la liste n'a droit qu'à une ligne discrète « En route », et le bandeau garde
  le verdict de la dernière cible. Pour une prise, ta puissance doit figurer dans « Powers ». Le type de station ne se
  vérifie pas à l'arrivée : le journal ne liste pas les stations ;
- tes passages servent aussi d'appuis : un Consolidé ou une Forteresse vu en jeu cette semaine compte même s'il
  manque à Spansh (un passage d'avant le jeudi ne suffit pas : l'état a pu changer), et un appui que tu as vu perdu
  après le relevé Spansh est retiré. Seuls les appuis assez proches de la zone cherchée comptent.

Contrôles sur les vraies données :

- le 7 nov. 2026, autour de Synuefe OU-E c28-2 (30 al), les 75 systèmes Inoccupés qu'Aisling Duval peut prendre
  selon la règle des 20/30 al sont exactement ceux où Spansh liste la puissance ;
- le 8 nov. 2026, sur tes journaux : pour les 56 systèmes Inoccupés relevés du 29 oct. au 7 nov., Aisling Duval
  figure dans « Powers » si et seulement si un appui Spansh est à portée (56 sur 56). Un Consolidé à 21,8 al ne
  suffit pas.

**Nom du système de départ.** Spansh tient compte des majuscules (« synuefe ou-e c28-2 » est refusé). Un nom tapé à
la main reprend la casse d'un système que tu as déjà visité ; sinon, après un refus, l'app cherche le nom exact par
l'autocomplétion de Spansh et relance la recherche.

- Réseau : une recherche part seulement au clic sur « Chercher », vers `POST https://spansh.co.uk/api/systems/search`,
  avec le nom du système de départ, la puissance et les états. Rien d'autre, jamais en arrière-plan. Une prise demande
  deux recherches : les systèmes Inoccupés, puis les appuis jusqu'au rayon + 30 al. Si Spansh refuse le nom, le même
  nom part une fois vers son autocomplétion (`GET /api/systems/field_values/system_names`). Les réponses sont gardées
  10 min en mémoire, 2 000 systèmes au plus par recherche (au-delà, l'app le dit : réduis le rayon).
- Erreurs : système inconnu de Spansh (le message rappelle l'orthographe exacte, majuscules comprises), délai dépassé
  (30 s), Spansh indisponible ou pas de connexion. Le message le dit clairement, et rien n'est gardé en cache.
- Règles du jeu : `server/src/modules/whereto/rules.js`, chacune avec sa source, sa date et son statut (mesurée,
  publiée, à vérifier), y compris la portée de 20/30 al (mesurée) et 120 000 points pour 1,0 de prise (mesurée).
  `GET /api/modules/whereto/rules` les liste pour la future vigie des règles. À vérifier : pas de portée pour la sape,
  zones de conflit seulement en guerre et en guerre civile, passage de semaine à 7 h UTC pile.
