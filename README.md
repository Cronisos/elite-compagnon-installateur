# Compagnon Elite

Application compagnon **locale** pour Elite Dangerous (PC). Elle lit les journaux du jeu en temps réel et
remplit tout automatiquement. Aucune donnée personnelle n'est envoyée sur Internet (le calculateur de routes, les
stations proches d'un chantier de colonisation, les Systèmes importants, « Où agir cette semaine » et, dans Mes
repères, la prospection et les prix des minerais n'envoient qu'un nom de système, son adresse dans le jeu ou un nom de
marchandise, et leurs critères de recherche). Rien ne part sans ton choix : Mes repères n'interroge Spansh (planètes à
EEP) et Ardent Insight (prix du système) qu'à ton clic, sauf si tu actives ses recherches automatiques (coupées par
défaut, proposées une fois dans la page) ; elles suivent alors le système où tu es, et ces sites voient ton adresse IP
et la suite de tes systèmes.
Seule autre exception, désactivée par défaut : si tu l'actives, le module Escadron envoie tes gains de mérites au
Squadron Tracker de l'escadron. Tout appel sortant passe par une passerelle unique, avec une liste blanche des hôtes
(voir « Contrôles avant mise à jour », Dossiers et réseau).

Modules disponibles : **Mes routes commerciales**, **Mon ingénierie**, **Constructeur de builds**,
**Mes repères**, **Systèmes importants**, **Projet extension** (avec les mérites à la vente, les mérites par heure,
le calculateur de routes et « Où agir cette semaine »), **Règles du jeu**, **Escadron**, **Combat**, **Sauvetage**,
**Colonisation**, **Garde des commandes**, **Couleurs du HUD**, **Compagnon**, **Applications externes** et
**Coup d'œil**.

> Application gratuite et non commerciale, en libre service, créée par **Cronisos Lysiris**. Non affiliée à Frontier Developments.

## Télécharger (Windows)

Tout est dans la version la plus récente, page [Releases](../../releases/latest). Deux façons de participer, au choix :

| Tu veux | Prends | Ce que ça fait |
| --- | --- | --- |
| Toute l'app | `Installer Elite Compagnon … .exe` | Fenêtres en jeu, vaisseaux, ingénierie, Powerplay, partage de builds, et l'envoi de tes mérites à l'escadron si tu l'actives |
| Seulement compter pour le Powerplay de l'escadron | `Squadron_Tracker.zip` | Un petit plugin pour [EDMarketConnector](https://github.com/EDCD/EDMarketConnector) qui envoie tes gains de mérites, rien d'autre |

**L'app.** Télécharge le `.exe` et lance-le. L'installateur n'est pas signé : Windows affiche « Windows a protégé
votre ordinateur » ; clique sur « Informations complémentaires », puis « Exécuter quand même ».

**Le plugin.** Installe EDMarketConnector, puis décompresse l'archive et copie le dossier `Squadron_Tracker` dans
`%LOCALAPPDATA%\EDMarketConnector\plugins`. Relance EDMC, lance le jeu une fois, puis dans Fichier, Paramètres,
Squadron Tracker, colle le code de l'escadron et clique « Rejoindre en tant que … ». Son code (un seul fichier,
`load.py`) et sa notice complète sont dans le dépôt [squadron-tracker](https://github.com/Cronisos/squadron-tracker).

Dans les deux cas il te faut le **code de l'escadron**, donné par ton chef. Chaque fichier a son `.sha256`, pour
vérifier que le téléchargement est intact (`Get-FileHash <fichier> -Algorithm SHA256` dans PowerShell).

## Installation

Le reste de cette page s'adresse à qui veut lire le code ou le lancer depuis les sources.

Prérequis : [Node.js](https://nodejs.org) 24 (LTS), avec npm 11.19 ou plus récent (`npm -v` ; Node 24.22 le fournit).

```powershell
cd EliteApp
npm run installer
```

`npm run installer` (`scripts/installer.mjs`) lance `npm ci` : il installe exactement les versions du
`package-lock.json`, jamais une mise à jour glissée entre-temps. Il le fait avec `CHECKPOINT_DISABLE=1`, que tous les
scripts d'installation reçoivent. L'installation télécharge ce qu'il faut pour tourner : les paquets (registre npm, qui
signale aussi leurs failles connues), le module SQLite natif (`better-sqlite3`), les moteurs de Prisma, puis le
programme d'Electron : Electron 45 n'a plus de script d'installation et le téléchargerait au premier lancement de
l'overlay, en pleine partie ; l'installateur lance son `install.js` (empreinte vérifiée). Il génère enfin le client
Prisma (`prisma generate` : Prisma 7 ne le fait plus à l'installation). Sans `CHECKPOINT_DISABLE`, la CLI de Prisma
enverrait en plus sa télémétrie à `checkpoint.prisma.io` (identifiant du PC, empreintes du projet, système). Pour installer à la main :
`$env:CHECKPOINT_DISABLE = "1"` dans PowerShell (`set CHECKPOINT_DISABLE=1` dans cmd), puis `npm ci`. Jamais dans une
worktree dont `node_modules` est un lien vers l'app principale : `npm ci` commence par le vider (`npm run installer`
refuse).

npm 11.19 ou plus récent : `.npmrc` impose `strict-allow-scripts`. Un paquet qui a un script d'installation
(`preinstall`, `install`, `postinstall`) ne le lance que s'il a une décision dans `allowScripts` du `package.json`
racine (`true` : utile, comme Prisma ou `better-sqlite3` ; `false` : inutile, comme celui de `tesseract.js`). Un paquet
sans décision fait échouer l'installation, au lieu de lancer son script avec un simple avertissement
(`scripts/controle/tests/depot.test.mjs` vérifie que chaque paquet du lockfile qui en a un est décidé). npm 10 (livré
avec Node 20 et 22) ne connaît ni `allowScripts` ni `strict-allow-scripts` et lancerait tous les scripts : `engines`
du `package.json` (Node 24, npm 11.19) et `engine-strict` dans `.npmrc` le refusent avant tout script. Le même
`.npmrc` coupe la vérification de version de npm sur Internet à chaque commande.

## Lancement

```powershell
npm run dev
```

Cette commande unique :

1. crée ou met à jour la base SQLite (`server/data/elite.db`, au premier lancement) par `server/dbPush.mjs`, qui applique
   les migrations versionnées (`prisma migrate deploy`, voir « Base de données : migrations ») puis `prisma generate` (Prisma 7 : l'adresse de la base est dans `server/prisma.config.mjs`, la
   même que l'app, `core/paths.js` ; l'app s'y connecte par l'adaptateur `better-sqlite3`) **sans la télémétrie de Prisma** (`CHECKPOINT_DISABLE=1`) : lancée telle quelle, la commande
   Prisma envoie à chaque fois, hors de la passerelle réseau de l'app et même avec `ELITE_NO_NETWORK`, une requête à
   `checkpoint.prisma.io` (identifiant du PC, empreintes du projet, commande, système). `Lancer EliteApp.cmd` coupe
   aussi cette télémétrie et la vérification de version de npm. `depot.test.mjs` le vérifie en vrai : le vrai
   `dbPush.mjs`, sur une base temporaire et réseau gardé, n'envoie rien, quand la CLI telle quelle (témoin) envoie sa
   requête à un récepteur local ; et tout code du dépôt qui lance la CLI doit couper sa télémétrie ;
2. démarre le serveur sur http://localhost:3001,
3. démarre l'interface sur **http://127.0.0.1:5173** (à ouvrir dans le navigateur ; pas « localhost », voir
   « Protection de l'API locale »).

Pour arrêter : `Ctrl + C` dans le terminal.

Le serveur redémarre de lui-même quand son code change, et aussi après un plantage (`server/dev.js`,
`server/src/core/devSupervisor.js`). Une erreur imprévue hors d'une requête (minuterie, promesse rejetée sans
traitement) est écrite en français dans le terminal, avec sa pile, puis le serveur s'arrête, car son état n'est plus
sûr (`server/src/core/crashGuard.js`). Il est relancé 2 s plus tard. Après plus de 5 plantages en une minute, il
n'est plus relancé, et le terminal le dit : un défaut qui revient à chaque démarrage ne se réglerait pas tout seul.
Une écriture différée ratée (fichier en lecture seule, verrou d'un antivirus, disque plein) ne fait jamais planter le
serveur : elle est écrite dans le terminal et réessayée à la sauvegarde suivante. C'est le cas du balayage de l'EEP et
du dernier coin de minage (`server/src/modules/waypoints/deferredSave.js`).

Sans terminal : l'app de bureau ci-dessous. L'overlay tourne à part (lancé détaché par le serveur) : si l'app s'arrête,
ses fenêtres disent « Connexion à l'app perdue : valeurs figées » (contenu grisé) au bout de 10 s sans connexion, se
cachent au bout de 30 s sans réponse et l'overlay s'arrête au bout de 5 min (voir « Ce qu'une fenêtre de l'overlay
peut faire »). Alt+Maj+Q le ferme tout de suite.

## Premiers pas

1. Vérifie dans **Paramètres** le dossier des journaux (voir « Lecture des journaux » ci-dessous). La même page
   affiche les événements du jeu en direct, avec leur délai de réception.
2. Fais ta route une fois en jeu : un aller-retour complet, de l'achat de la marchandise de départ
   jusqu'à son rachat au même endroit.
3. **Mes routes commerciales → Nouvelle route → « J'ai fait ma route »**. Choisis la station de départ si
   plusieurs sont possibles, indique ton objectif de crédits, puis crée la route.
4. Chaque nouvelle boucle est ensuite enregistrée toute seule. Ouvre le marché en jeu dans chaque station :
   l'app archive `Market.json` pour suivre les stocks et proposer des marchandises d'appoint.

### Lecture des journaux

- **Dossier** : au premier lancement, l'app propose le dossier des journaux d'après l'emplacement de « Parties
  enregistrées » connu de Windows. Elle le suit même si tu l'as déplacé, par exemple vers `D:\Jeux`. Sinon, elle
  propose le dossier habituel sous ton profil (`Saved Games\Frontier Developments\Elite Dangerous`). Si le dossier est
  faux, un bandeau rouge en haut des pages le dit, avec un lien vers Paramètres pour le corriger.
- **Lecture de l'historique** : l'app relit tous tes journaux, par morceaux d'environ 1 Mo, avec une pause entre deux
  morceaux, puis les remet aux modules un par un : le serveur ne se fige jamais longtemps. Au lancement, l'app attend
  la fin de cette lecture avant d'ouvrir ses pages. Quand tu changes le dossier des journaux dans Paramètres, l'app relit
  tout ton historique en arrière-plan : elle reste utilisable, et le bloc « Lecteur de journaux » affiche « Relecture
  de tes journaux en cours… » jusqu'à la fin (quelques secondes, un peu plus si tu as beaucoup de journaux). Un
  nouveau changement de dossier pendant la lecture l'abandonne au profit du dernier.
- **Galaxies** : seules les séances Live (version 4.0 et plus) sont lues. Les séances Legacy (3.x, après la séparation
  des galaxies du 29 nov. 2022) et les bêtas sont ignorées : flotte, matériaux, boucles de commerce et fichiers
  d'état. Un vieux journal 3.8 d'avant cette date reste lu. Paramètres signale une séance en cours en Legacy ou en
  bêta. La date de séparation est une fiche du dépôt des règles (`escadron.galaxie.separation`).
- **Journal verrouillé** : un journal qu'un antivirus, une sauvegarde ou un outil de synchronisation bloque au
  démarrage est signalé (« Journal illisible pour l'instant : …, il est bloqué par un autre programme (antivirus,
  sauvegarde, synchronisation) »). L'app le réessaie toutes les 10 s et relit tout l'historique dès qu'il se lit. Tant
  qu'il manque, aucune boucle de commerce n'est effacée.

### Si l'app bloque au démarrage

- **Données de référence abîmées** (vaisseaux, modules, recettes) : un bandeau nomme le fichier en cause et propose
  « Retélécharger les données ». Si les données restent illisibles juste après un téléchargement réussi, l'app te
  demande de le signaler avec le journal de l'app (`bureau.log`). Le détail technique est écrit dans ce journal.
- **Partie de l'app en panne** : si une partie de l'app ne démarre pas, le reste marche quand même. Un bandeau la
  nomme. Relance l'app, et si ça recommence, signale-le avec `bureau.log`.
- **Profil Windows sur le réseau** (PC d'entreprise) : si ton dossier `%APPDATA%` est sur le réseau, l'app range ses
  données dans `%LOCALAPPDATA%\Elite Compagnon`, et le note dans `bureau.log`. Si les deux dossiers sont sur le réseau,
  l'app ne peut pas démarrer et te le dit dans une fenêtre en français.
- **Port déjà pris** : si un autre programme (Discord, un outil de développement…) occupe le port 3001 ou 5173, l'app
  de bureau prend le premier port libre juste après (3002…, 5174…, `desktop/ports.js`) et le note dans `bureau.log`
  (« port 3001 (serveur) déjà pris par node.exe : l'app prend le 3002 »). Le serveur, l'interface (et son relais
  `/api`) et l'overlay reçoivent les ports de ce lancement (`ELITE_PORT`, `ELITE_UI_PORT`), toujours sur 127.0.0.1 :
  l'overlay n'accepte que ce port de 127.0.0.1, jamais un autre hôte. `npm run dev`, lui, garde 3001 et 5173.
- **Node.js mis à jour** : si tu as changé de version majeure de Node.js depuis l'installation, relance
  l'installation. Tes données ne sont pas touchées.

## Documentation

Le détail de chaque partie de l’app est dans `docs/`, un fichier par sujet :

| Fichier | Contenu |
| --- | --- |
| [App de bureau](docs/app-de-bureau.md) | La fenêtre principale, l’overlay en jeu, les ports, les données, la protection de l’API locale |
| [Règles de calcul et textes](docs/regles-et-textes.md) | Comment l’app calcule, et d’où viennent ses textes français |
| [Vaisseaux](docs/vaisseaux.md) | Mes vaisseaux, cartes des ingénieurs, rôles des vaisseaux |
| [Mon ingénierie](docs/ingenierie.md) | Plans par vaisseau, matériaux, itinéraire d’ingénierie |
| [Constructeur de builds](docs/constructeur.md) | Composer un vaisseau, statistiques, comparaison avec EDSY |
| [Mes repères et Systèmes importants](docs/reperes.md) | Repères de minage, prospection, balayage, systèmes importants |
| [Projet extension](docs/extension.md) | Routes Powerplay, mérites, calculateur de routes, « Où agir cette semaine » |
| [Modes de jeu et fenêtres en jeu](docs/modes-de-jeu.md) | Menu « Mode de jeu », minage, matériaux, signaux, itinéraire, porteur, FSD, combat, sauvetage, bilans |
| [Colonisation](docs/colonisation.md) | Chantiers suivis, liste de courses, stations proches, projet de l'escadron |
| [Outils](docs/outils.md) | Applications externes, Règles du jeu, Coup d’œil, commandes, couleurs du HUD, Compagnon, Moniteur PC |
| [IA de bord (Alicia)](docs/ia.md) | Le copilote facultatif, sur ton PC |
| [Escadron](docs/escadron.md) | Squadron Tracker : rejoindre, monter le serveur, route, suivi Discord |
| [Développement](docs/developpement.md) | Tests, contrôles avant mise à jour, migrations, structure du projet |

## Licence

Required Notice: Copyright Cronisos Lysiris (https://github.com/Cronisos)

Le code d'Elite Compagnon est sous licence [PolyForm Noncommercial 1.0.0](LICENSE.md) : tu peux l'utiliser, le lire,
le modifier et le redistribuer gratuitement, pour tout usage non commercial. Personne ne peut le vendre ni s'en servir
pour gagner de l'argent. La ligne « Required Notice » ci-dessus et le texte de la licence doivent accompagner toute
copie.

Cette licence ne couvre que le code de l'app. Ce qui vient d'ailleurs garde sa propre licence, détaillée dans
[CREDITS.md](CREDITS.md) : les dessins des vaisseaux de CMDR Qohen Leth (CC BY-NC-SA 4.0), les polices (OFL), et tout
ce qui appartient à Frontier Developments.
