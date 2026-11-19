# App de bureau

> Partie de la notice d’Enova : sommaire dans le [README](../README.md#documentation).

## App de bureau « Enova »

Un seul programme (dossier `desktop/`, l'Electron de l'overlay) : double-clic sur **`Lancer EliteApp.cmd`**, sur le
raccourci « Enova » du Bureau ou du menu Démarrer (`npm run raccourcis` les écrit, `npm run raccourcis --
--retirer` les efface), ou `npm run bureau` depuis un terminal. Déjà lancée : la fenêtre principale revient.

- **Démarrage** (`desktop/main.js`) : met la base à jour (`server/dbPush.mjs`), lance le serveur puis l'interface avec
  le Node du PC (`desktop/noeud.js` : Node 24 ou plus, cherché dans le PATH puis dans `Program Files\nodejs` ;
  `better-sqlite3` est compilé pour lui, pas pour Electron). La page de chargement dit l'étape en cours.
- **Interface** (`desktop/interface.mjs`) : compilée (`client/dist`) seulement si son code a changé depuis la dernière
  fois (empreinte du contenu, jamais des dates), puis servie par `vite preview` sur **http://127.0.0.1:5173**, proxy
  `/api` compris. C'est l'adresse de `npm run dev`, sauf si 5173 est pris : l'app prend alors un autre port libre
  (voir « Port déjà pris »). `vite preview`
  sert les fichiers compilés de `/assets/` en cache immuable d'un an, seulement pour un fichier trouvé (réponse 200,
  206 ou 304). Une 404 et les pages sont en `no-cache` : une ancienne erreur ne reste pas un an dans le cache.
- **Données** (`desktop/donnees.js`) : `%APPDATA%\Elite Compagnon\donnees` (`ELITE_DATA_DIR` du serveur). L'app
  démarre avec un dossier vide. Les données de `npm run dev` (`server/data`) n'y sont copiées qu'à la demande de celui
  qui développe, avec `ELITE_COPIER_DONNEES_DEV=1` : une fois, au premier lancement, dans un dossier temporaire renommé
  à la fin, et l'original reste en place, intact. Sans ce réglage, jamais de copie : un dossier de l'app zippé tel quel
  ne recopie pas les données de son auteur chez les autres. Ensuite, `npm run dev` et l'app de bureau ont chacun leurs
  données. Le journal de l'app (`bureau.log`, sortie du serveur et de l'interface comprise, 2 Mo puis `bureau.1.log`),
  la place des fenêtres (`bureau.json`) et les réglages de l'overlay (dossier `overlay`) sont dans
  `%APPDATA%\Elite Compagnon`. Menu de l'icône de notification : « Journal de l'app ».
- **Mon compte** (**Paramètres → Mon compte**) : tout ce qui est à toi, au même endroit. Ton commandant (lu dans tes
  journaux), le serveur, le jeton et l'envoi de l'escadron, les modèles d'Alicia (sur ce PC, sans compte ni clé), et
  le dossier où tout est rangé. L'app elle-même ne contient rien de personnel : copiée ou installée chez quelqu'un
  d'autre, elle démarre vide, avec ses propres réglages. La version de l'app et l'empreinte de son paquet s'affichent
  aussi : compare-les à celles que publie le chef (voir « Donner l'app à l'escadron »). **Effacer mes données** (il
  faut taper EFFACER) : l'app note la demande (`effacer-donnees.demande` dans `%APPDATA%\Elite Compagnon`), se relance
  et, avant que le serveur n'ouvre la base, vide le dossier des données sauf `reference` (données publiques, gardées
  pour ne pas tout retélécharger), efface `bureau.json`, le stockage des pages, la connexion aux sites (Inara), les
  journaux `bureau*.log` et les données de l'overlay (`%APPDATA%\Elite Compagnon\overlay`). Si tu gères le serveur de
  l'escadron depuis ce PC, la page te prévient : ses clés (clé de chef, clé du suivi, mot de passe) partent aussi. Le
  dossier vidé reste en place, pour que `server/data` n'y soit jamais recopié. Tes journaux du jeu ne sont pas touchés. `POST /api/bureau/effacer
  {confirmation: 'EFFACER'}` ; 409 sans l'app de bureau. Aucun outil d'Alicia n'y mène.
- **Overlay toujours actif** : l'app de bureau le lance dès le démarrage et il reste lancé même sans fenêtre à montrer
  (`ELITE_OVERLAY_TOUJOURS=1`, ordre `--rester`) : ses raccourcis (Alt+Maj+K pour la souris, Alt+Maj+H…) marchent
  toujours et ne partent jamais au jeu. Avec `npm run dev`, comme avant : lancé seulement s'il a une fenêtre à montrer.
- **Fenêtre principale** : la navigation de toujours, dans un cadre maison (la ligne du haut sert de barre de titre ;
  boutons façon panneau du jeu : « ⧉ Détacher », « ▾ Réduire », « ⤢ Agrandir », « ✕ Masquer »). La masquer garde l'app dans la zone de notification ; « Quitter » (menu
  de l'icône) arrête le serveur proprement, puis l'interface.
- **Pages détachées** : ⧉ copie la page affichée dans sa propre fenêtre, déplaçable et redimensionnable, au premier
  plan par-dessus le jeu (« ◉ Épinglé » pour l'y garder ou non). Jusqu'à 12 ; elles reviennent à leur place au lancement suivant.
  Une page détachée n'affiche ni les menus ni les alertes des modules (elles restent dans la fenêtre principale).
- **MAR (menu d'accès rapide)**, en haut à gauche de l'écran, au premier plan par-dessus le jeu (comme l'overlay) ; il ne
  prend jamais la main (le jeu garde clavier et souris, la barre des tâches reste cachée). En tête, **Mode de jeu** : un
  mode choisi ouvre ses fenêtres en jeu, comme le menu de la fenêtre principale (« Aucun », « Fenêtre Coup d'œil »),
  sans ouvrir la fenêtre principale. Puis les rubriques
  (Mes vaisseaux, Ingénierie, Activités, Powerplay & Escadron, Outils) ; un clic sur son nom ouvre la page de la rubrique
  (Mes vaisseaux : la flotte), le survol ou sa flèche ▾ ses pages, et leurs sous-pages s'ouvrent vers la droite, sur autant de niveaux qu'il faut. Un clic sur une page ouvre la fenêtre
  principale dessus, devant le jeu mais sans lui prendre la main (un clic dedans la lui donne ; ouverte depuis la zone
  de notification, elle redevient une fenêtre ordinaire). Un clic ailleurs, ou la souris qui quitte la barre, referme le menu. La fenêtre de la barre prend la taille
  de ce qu'elle montre, collée au coin (`placeBarre`, `desktop/etat.js`) : rien d'invisible ne bloque les clics du jeu
  autour. Son **◆** cache toute l'app : la fenêtre principale, les pages détachées, les fenêtres en jeu de l'overlay (gardées
  ouvertes, comme Alt+Maj+H ; celles qui s'ouvrent pendant ce temps naissent cachées) et les rubriques du MAR, dont il
  ne reste que le ◆. Un autre clic réaffiche tout tel que c'était ;
  clic droit : menu (Quitter…). **Fenêtre principale réduite ou fermée** : un bouton **↺ <page>** (« ↺ Tous les
  vaisseaux ») apparaît au bout du MAR et la rouvre devant le jeu, sur la page où elle était, sans repasser par les
  menus ; il disparaît dès qu'elle est revenue. Sa place se règle dans **Paramètres → MAR** : le coin de l'écran (haut gauche par
  défaut, haut droite, bas gauche, bas droite) et un décalage le long du bord ; il bouge tout de suite, ses menus
  s'ouvrent dans le bon sens, et la place est gardée dans `bureau.json`.
  Le MAR et les pages détachées sont remis devant toutes les 2 s, sans prendre la main : quand le jeu passe au premier
  plan, Windows met sa fenêtre devant même celles « toujours au premier plan ». Les fenêtres de l'overlay (HUD) ne bougent pas : elles suivent le jeu. Page `/barre`
  de l'interface (`client/src/core/BarreBureau.jsx`), le plan de `core/navigation.js` : la barre, le menu ☰ et les
  onglets montrent toujours les mêmes pages.
- **Pavé tactile** (**Paramètres → Pavé tactile**, coché : il s'ouvre tout de suite) : les menus de l'app en gros
  boutons, dans une fenêtre à part à poser sur un petit écran tactile (sous l'écran principal, à la manière d'un
  Stream Deck). À la racine, « Mode de jeu » et les rubriques ; un bouton à sous-menu l'ouvre (›), « ◂ Retour »
  remonte, « Ouvrir … » (liseré vert) ouvre la page de l'entrée, une page s'ouvre dans la fenêtre principale devant le
  jeu. « Mode de jeu » : les modes, Aucun, Coup d'œil. Comme le MAR, il ne prend jamais la main (le jeu garde clavier et
  souris). On le déplace par sa barre du haut, on l'agrandit par ses bords ; sa place et son état sont gardés dans
  `bureau.json`. Le ◆ ne le cache pas : il a son propre ◆ pour tout réafficher, et ✕ pour se fermer. Page `/pave`
  (`core/PaveTactile.jsx`, `core/paveVue.js` testé), fenêtre `creerPave` de `desktop/main.js`. Ce n'est pas un
  plugin pour le matériel Stream Deck d'Elgato : c'est une fenêtre, qui marche sur n'importe quel écran.
  **Favoris** : la première page du pavé, composée sur le pavé lui-même (✎, puis toucher une page ou un mode de jeu
  pour l'ajouter ou le retirer, ★) : 8 boutons au plus, dans l'ordre d'ajout, pages et modes de jeu mêlés ;
  « ☰ Tous les menus » ouvre les menus, « ★ Favoris » y revient. Gardés avec la place du pavé (`bureau.json`, relus
  sans confiance : une page de l'app ou `mode:<id>`, sans doublon).
- **Sécurité** : les fenêtres ne chargent que l'interface (mêmes gardes que l'overlay, `overlay/guards.js`) et les
  la page de chargement locale (`desktop/pages`) ; un lien vers un site s'ouvre dans le navigateur ; aucune permission
  (caméra, micro, position…) sauf copier dans le presse-papiers ; le pont `desktop/preload.js` n'écoute que le cadre
  principal de ces pages. Le serveur, l'interface et la mise à jour de la base reçoivent `CHECKPOINT_DISABLE=1`.
- **Sites externes** (page « Inara » du menu) : le vrai site, affiché par l'app de bureau sur la zone que lui réserve
  sa page (`client/src/modules/sites/`), avec une barre retour, avancer, recharger, accueil, « ↗ Navigateur ». Pas
  d'iframe : Inara la refuse (`X-Frame-Options: SAMEORIGIN`) ; dans un navigateur, la page donne seulement le lien.
  Chaque site a sa propre session (`persist:site-<id>`, dans `%APPDATA%\Elite Compagnon\Partitions` : la connexion
  à ton compte est gardée), aucun pont vers l'app, aucune permission, `https` et `wss` seulement, aucune requête vers
  ce PC ni le réseau local (l'API locale reste hors de sa portée, même par une adresse déguisée : `2130706433`,
  `[::ffff:127.0.0.1]`…, ou par un nom DNS qui porte une adresse locale : `192.168.1.1.nip.io`, `ac100001.nip.io`). La
  vérification « réseau local » de Chromium est activée en plus. Un téléchargement lancé par le site ne se fait jamais
  dans l'app. Sa page ne navigue que sur ses domaines : un lien vers un autre site s'ouvre dans le navigateur. L'app se présente
  telle qu'elle est (Chromium d'Electron), sans se faire passer pour un autre navigateur. Ajouter un site : une
  entrée dans `desktop/sites.js` (domaines permis : c'est lui qui fait foi) et dans `client/src/modules/sites/sites.js`
  (titre, icône), même identifiant ; l'interface n'envoie jamais d'adresse, seulement l'identifiant.

### Donner l'app à l'escadron : `npm run paquet`

C'est la seule façon de donner l'app. Jamais un zip du dossier de travail : il emporterait `server/data` (ta base, ton
jeton d'escadron, les clés du chef), `.git` et les journaux. `npm run paquet` (`scripts/paquet.mjs`) contrôle d'abord
le dossier de travail. Il copie ensuite, dans un dossier neuf (`paquet/`, ignoré par git), les seuls fichiers
distribués : ni `server/data`, ni `.git`, ni `node_modules`, ni `*.log` (sauf les journaux d'exemple que relisent les
tests). Il écrit `paquet.json`, avec l'empreinte SHA-256 de chaque fichier, revérifie le dossier fabriqué, puis le
zippe, avec un fichier `.sha256` à publier à côté.

Options : `--sortie <dossier>`, `--sans-zip`, `--remplacer` (efface d'abord un paquet de même version), `--help`
(affiche l'aide, ne fabrique rien). Toute autre option est refusée : une faute de frappe ne fabrique rien. Avec npm :
`npm run paquet -- --sans-zip`.

La version et l'empreinte du paquet s'affichent dans **Paramètres → Mon compte** : compare-les à celles que publie le
chef.

### Quand l'app s'arrête sur une erreur

Au démarrage, sans le jeu lancé (Node.js introuvable ou trop ancien, par exemple), une boîte d'erreur s'affiche tout
de suite, avec le chemin du journal de l'app. Si le jeu tourne, ou en plein vol, l'app ne t'ouvre jamais de boîte qui
prendrait le clavier et la souris du jeu. Une bulle de Windows te prévient, l'icône reste dans la zone de
notification, et l'erreur s'ouvre quand tu cliques sur la bulle ou sur l'icône, ou quand tu relances Enova.

### Mise à jour : l'overlay range ses réglages avec l'app

L'overlay range maintenant ses réglages dans `%APPDATA%\Elite Compagnon\overlay` (une copie est faite une fois depuis
l'ancien dossier, `%APPDATA%\elite-companion-overlay`). Juste après cette mise à jour, l'overlay de l'ancienne version
peut rester ouvert à côté du nouveau, et tu vois des HUD en double. Quitte alors Enova (icône → Quitter),
attends 5 minutes ou redémarre le PC, puis relance-le. Cela n'arrive qu'une fois.

## Protection de l'API locale

Le serveur n'écoute que sur ce PC et refuse ce qui ne vient pas de l'app : un site web ouvert dans le navigateur
ne peut ni lire ni modifier vos données (`server/src/core/localGuard.js`). Sur chaque requête `/api` :

- l'adresse appelée (en-tête `Host`) doit être `localhost:3001` ou `127.0.0.1:3001` ;
- si le navigateur indique une origine (`Origin`), ce doit être l'interface : `http://localhost:5173` ou
  `http://127.0.0.1:5173` ; une requête lancée par un autre site (`Sec-Fetch-Site: cross-site`) ou par la page d'un
  autre programme de ce PC (`http://127.0.0.1:<autre port>`, `Sec-Fetch-Site: same-site`, même sans `Origin`) est
  refusée. Une adresse tapée dans le navigateur, ou un lien ouvert depuis une autre application (`Sec-Fetch-Site: none`),
  peut lire, jamais écrire : les recherches de Mes repères réservées à ton clic (Spansh, Ardent) sont des écritures,
  qu'un simple lien ne peut donc pas lancer (voir « Recherches en ligne ») ;
- toute écriture (POST, PUT, PATCH, DELETE) doit porter l'en-tête **`X-Elite-Compagnon: 1`**. L'interface
  l'ajoute d'elle-même (`client/src/core/api.js`) ; un site tiers ne peut pas l'ajouter.

Un refus répond 403 avec la raison en français. Les lectures (GET) et le flux temps réel n'ont pas besoin de
l'en-tête. Les corps JSON sont limités à 1 Mo (12 Mo pour l'image d'un vaisseau et les captures de l'overlay,
4 Mo pour la page Inara). L'interface reste sur le port 5173 (`strictPort`) : s'il est pris, Vite s'arrête au
lieu d'en changer. Elle n'écoute que sur **127.0.0.1** (`server.host` de `client/vite.config.js`), l'adresse que
l'overlay et `Lancer EliteApp.cmd` appellent. Avec « localhost », Vite n'écoutait que sur `[::1]:5173` : un autre
programme pouvait tenir `127.0.0.1:5173` sans que Vite le voie, et l'overlay ou le navigateur tombaient chez lui dès que
Vite ne répondait pas. Désormais, si un autre programme tient déjà `127.0.0.1:5173`, Vite refuse de démarrer. Un
ancien favori `http://localhost:5173` marche encore (le navigateur se rabat sur 127.0.0.1), mais il garde les
préférences d'affichage d'une autre adresse : ouvre plutôt `http://127.0.0.1:5173`. Le dossier des journaux doit être un dossier de ce PC : les chemins réseau (`\\serveur\partage`)
et de périphérique (`\\?\`, `\\.\`) sont refusés. La liste « Événements en direct » ne reçoit que le nom et
l'heure de chaque événement (ni chat, ni identifiant Frontier, ni nom d'autres CMDR). Les journaux sont relus et
suivis dans l'ordre de l'heure UTC de leur première ligne (`Fileheader`), le nom ne faisant que départager
(`server/src/core/journalFiles.js`) : le jeu nomme ses journaux à l'heure **locale**, et la nuit du passage à l'heure
d'hiver, une séance lancée à 2 h 10 (heure d'hiver) porte un nom plus « ancien » que celle de 2 h 30 (heure d'été)
lancée avant elle. Triée par le nom, la nouvelle séance n'était jamais suivie (ni HUD, ni mérites, ni ventes).

Un corps annoncé à plus de quatre fois sa limite est refusé (413) sans être lu. Chaque refus dit sa raison en
français, y compris une adresse mal encodée (« % » seul) ou un encodage du corps inconnu (415) : « Erreur interne du
serveur » est réservé aux vraies pannes. Les identifiants reçus dans une adresse sont vérifiés strictement
(`server/src/core/ids.js`) : « 1.5 », « 0x10 », « -1 » ou « 01 » ne désignent jamais la ligne 1. Les images reçues
(image d'un vaisseau, captures de l'overlay) sont reconnues à leur contenu (`server/src/core/imageCheck.js`) : un
texte ou un SVG annoncé « png » est refusé, et l'image d'un vaisseau n'est acceptée que pour un vaisseau des données de
référence (jamais un nom de fichier choisi par la requête, comme « nul » ou « com1 »). L'interface (Vite) n'envoie
aucun en-tête CORS (`server.cors: false`) : aucune autre page, même « localhost » d'un autre port, ne lit ses réponses.

L'interface elle-même (pages, modules et routes internes de Vite, en développement comme avec `vite preview`) a sa
garde, `client/viteGuard.js`, branchée avant tout le reste par `client/vite.config.js`. Sans elle, n'importe quel site
ouvert dans le navigateur pouvait, sans un clic, faire lancer un éditeur sur un fichier de son choix
(`<img src="…/__open-in-editor?file=…">`) ou encadrer une page de l'app sous un faux bouton :

- `/__open-in-editor` répond toujours 404, quelle que soit l'écriture de l'adresse : l'app n'ouvre jamais d'éditeur ;
- une requête d'un autre site ou d'un autre port de ce PC (`Sec-Fetch-Site` `cross-site` ou `same-site`) est refusée
  (403), sauf un lien suivi (navigation de premier niveau) ; un `Origin` qui n'est pas l'interface elle-même, ou
  `null`, aussi ;
- chaque réponse porte `X-Frame-Options: DENY` et `Content-Security-Policy: frame-ancestors 'none'` : aucune page de
  l'app ne s'affiche dans un cadre ;
- `/@fs/` (serveur de développement seulement) ne sert un fichier que si son **vrai chemin** (`realpath`, liens et
  jonctions suivis) reste dans le client et les paquets. `server.fs.allow` ne compare que des chaînes : dans une
  worktree, `node_modules` contient des jonctions d'espace de travail (`elite-companion-server`, `-overlay`, `-client`
  vers `server/`, `overlay/`, `client/`), si bien que `/@fs/<node_modules>/elite-companion-server/data/…` servait
  `server/data` (jeton, base) malgré `fs.allow`. Un nom court 8.3 (`ELITE-~1`), un flux NTFS (`::$INDEX_ALLOCATION`),
  `..` ou `%2e%2e` mènent au même fichier ; en résolvant le vrai chemin, tous sont refusés. Jamais la racine du dépôt,
  `server/data` ni `.git` ; un chemin UNC (`\\hôte\partage`) est refusé sans être ouvert (aucune connexion SMB).

Les requêtes `/api` passent à la garde du serveur. L'étape `80-attaques` rejoue ces cas sur `vite preview` et sur le
vrai serveur de développement, avec un éditeur inerte : un seul lancement est un échec.

Pour vos propres appels d'écriture, ajoutez l'en-tête :

```powershell
# PowerShell
Invoke-RestMethod -Method Put -Uri http://localhost:3001/api/settings -Headers @{ 'X-Elite-Compagnon' = '1' } `
  -ContentType 'application/json' -Body '{"hoursPerEvening":3}'
# curl (dans PowerShell, écrire curl.exe : « curl » seul y désigne Invoke-WebRequest)
curl.exe -X POST -H "X-Elite-Compagnon: 1" http://localhost:3001/api/overlay/suggest/dismiss
```

## Organisation de l'application

Les pages sont rangées par ce que veut faire le joueur, dans un seul plan : `client/src/core/navigation.js`.

| Rubrique | Pages |
|---|---|
| Mes vaisseaux | la flotte (page de la rubrique) · Builds (Mes builds, Nouveau build, Comparer) |
| Ingénierie | Tableau de bord · Nouveau plan · Ingénieurs · Matériaux · Rangs · Itinéraire · Données de référence |
| Activités | Commerce · Minage (Rhino, vaisseau) · Combat · Sauvetage · Collecte de matériaux · Colonisation · Bilans de session |
| Powerplay & Escadron | Projet extension (ses six onglets) · Systèmes importants · Escadron |
| Outils | Sites (Inara) · Applications externes · Règles du jeu (Fiches, Vigie si elle est allumée) · Coup d'œil · Couleurs du HUD · Commandes du jeu (Mes commandes, Garde des commandes) · Compagnon |

- **Menu ☰**, en haut à gauche, dans un navigateur seulement (l'app de bureau a sa MAR en haut à gauche de
  l'écran, voir « App de bureau ») : toutes les pages en cascade. Survol ou clic sur une entrée qui a des sous-pages :
  elles s'ouvrent à droite, sur autant de niveaux qu'il faut ; un clic sur une page y va. Échap ou un clic ailleurs
  le referme.
- **Barre des rubriques** : le menu « Mode de jeu » (qui change le mode et ses fenêtres en jeu), puis une rubrique
  par bouton, allumé quand on est dans une de ses pages. Chaque rubrique a sa page de cartes (`/vaisseaux`,
  `/activites`, `/powerplay`, `/outils`), sauf Mes vaisseaux (sa page est la flotte) et Ingénierie (le tableau de bord).
- **Onglets** : chaque rubrique montre en haut de ses pages les mêmes pages que le menu (`core/Onglets.jsx`), et une
  sous-rubrique les siennes en dessous (Builds : Mes builds · Nouveau build · Comparer). Une rubrique qui est elle-même
  une page a son onglet en tête (Mes vaisseaux · Builds). Les rubriques restent
  séparées : rien de l'ingénierie dans Mes vaisseaux, et l'inverse (`navigation.test.js` le vérifie).
- **Accueil** (`core/Home.jsx`, `core/accueilVue.js` testé) : un tableau de bord « Maintenant », sans boutons de
  menu (les menus sont en haut). « À faire maintenant » reprend les rappels du Coup d'œil (données à vendre, primes,
  objectif communautaire à réclamer, rachat), les plans d'ingénierie faisables et le palier proche du système ; puis
  des cartes : session du mode en cours, système actuel (palier Powerplay), mérites de la semaine par activité, plans
  d'ingénierie, objectifs communautaires, à encaisser (et rachat), dernière session, chantiers de colonisation en cours
  (l'actif d'abord, avancement et voyages), escadron (rang et apport de la semaine), projets d'extension. Chaque carte mène à sa page de
  détail ; une source absente retire sa carte, pas la page. Relu toutes les 30 s.
- **MAR** : le menu d'une rubrique s'ouvre juste sous elle (aligné sur son bord droit quand le MAR est à droite).
- **Fil d'Ariane** en haut de chaque page (« Accueil › Ingénierie › Ingénieurs ») : chaque étape y ramène.
- Les onglets du Projet extension ont leur adresse (`/extension?onglet=vente`…) : le menu y mène directement.
- **Nom de système** : partout où l'app en affiche un (pages, fenêtres en jeu), 📋 le copie, prêt à coller dans la
  carte de la galaxie (`core/NomSysteme.jsx` ; dans l'overlay, par son pont).

Ajouter une page : une entrée dans `navigation.js`, à sa place. Le banc de contrôle ouvre d'office chaque page de
rubrique (`scripts/controle/pages/controler.mjs` lit le plan) et le menu sur trois niveaux.
