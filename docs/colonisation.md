# Colonisation

> Partie de la notice d’Elite Compagnon : sommaire dans le [README](../README.md#documentation).

## Module « Colonisation »

Mode de jeu (menu « Mode de jeu », page `/colonisation`) pour les chantiers de construction : vaisseau de
colonisation (port primaire d'un système revendiqué), chantiers orbitaux et planétaires. Il suit plusieurs chantiers
à la fois et dit, pour chacun, ce qu'il reste à livrer, ce qu'il faut encore acheter une fois ta soute déduite,
combien de trajets il reste avec ton vaisseau actuel et où acheter près du chantier.

> Écrit **sans vrai journal de colonisation** : aucun événement `Colonisation*` dans les journaux disponibles (le joueur
> ne colonise pas encore, l'escadron si). Le module suit les
> exemples documentés (schémas jixxed/edomh, échantillons réels d'EDDI, SrvSurvey et de la fixture BGS-Tally, code
> d'EDCT, EDDiscovery, EDAPITool) et note dans son diagnostic tout ce qui s'en écarte, pour être affiné le jour où
> un vrai journal arrivera. Les tests (`server/src/modules/colonisation/fixtures/examples.js`) indiquent la source
> de chaque ligne.

- **Page** : le chantier actif en tête (celui où tu es à quai, sinon celui que tu as épinglé, sinon le dernier en
  cours), puis la liste des chantiers : avancement, reste en tonnes, à acheter, trajets restants, tes livraisons,
  échéance. Le détail d'un chantier (`/colonisation/<MarketID>`) donne le tableau des marchandises (demandé, livré,
  reste, en soute, à acheter), les stations proches, l'échéance et la fin estimée, tes livraisons datées, et les
  réglages : nom personnalisé, échéance, durée d'une boucle, notes, épinglé. « Oublier » retire un chantier.
- **Fenêtres en jeu** : le HUD (avancement, reste, à acheter, trajets, et sur la ligne du bas les marchandises à
  acheter en premier) et la fenêtre libre « 🛒 Liste de courses » (`/hud/colonisation-list`), ouverte avec le mode :
  ce qu'il reste à acheter moins la soute, ce qui est déjà tout en soute coché, trajets restants. Pas de chrono ni de
  session : changer de mode ne remet rien à zéro ici.
- **« 🛒 À acheter ici »** (`/hud/colonisation-station`, `server/src/modules/colonisation/station.js`) : en mode
  Colonisation, à quai, quand tu ouvres le marché des marchandises (le jeu écrit alors `Market.json`) et que la
  station vend ce qu'il reste à acheter pour le chantier actif, la fenêtre s'ouvre d'elle-même. Pour chaque
  marchandise : ce qu'il faut prendre ici (le moins entre ce qu'il faut, le stock de la station et la place libre en
  soute, partagée dans l'ordre de la liste de courses), le stock (en orange s'il ne suffit pas), le prix, puis le total
  et la place restante. Elle suit tes achats (la soute se remplit, ce qu'il reste baisse), et se ferme au départ de la
  station ou hors du mode ; ✕ la ferme jusqu'à la station suivante. Jamais pour un marché relu au démarrage de l'app,
  jamais au chantier lui-même. Aucune recherche en ligne : seulement le marché que le jeu a écrit (les stations
  proches, elles, restent à la demande sur la page). API : `GET /station`, `POST /station/close` ; temps réel
  `colonisation:station`.
- **Mode proposé** à l'amarrage à un chantier ou à une livraison (voir « Menu « Mode de jeu » »).

Reconnaissance d'un chantier, à l'amarrage (`Docked`, ou `Location` à quai) : nom de station
« `$EXT_PANEL_ColonisationShip; <nom>` » ou « `$EXT_PANEL_ColonisationShip:#index=N;` » (vaisseau de colonisation),
« `Orbital Construction Site: <nom>` » ou « `Planetary Construction Site: <nom>` », **et** le service
`colonisationcontribution`. Le service seul ne suffit pas : un vrai journal (1er nov. 2026) le montre sur un
établissement terminé (Gibbs Hydroponics Site). `StationType` n'est jamais utilisé (il varie pour un même vaisseau).
Une lecture de dépôt crée aussi le chantier, même sans amarrage connu.

Règles de lecture (`server/src/modules/colonisation/state.js`) :

- `ColonisationConstructionDepot` est un **instantané absolu** des livraisons de **tous** les CMDR : il remplace le
  précédent ; une lecture identique ne change rien ; une lecture plus ancienne que la dernière est ignorée. Le module
  ne dépend pas de sa fréquence d'écriture (inconnue, voir plus bas).
- Le dépôt ne porte que son `MarketID` : le nom et le système viennent du dernier `Docked`, `Location`,
  `DockingRequested`/`DockingGranted`, `SupercruiseDestinationDrop` ou `ApproachSettlement` du même MarketID
  (ces trois derniers n'ont pas le nom du système : c'est celui où tu es). Aucun état « à quai » n'est exigé
  (EDDiscovery a vu un dépôt écrit après un `Touchdown`).
- `ColonisationContribution` est **ta** livraison, en delta : gardée avec sa date, et ajoutée à titre provisoire au
  dernier instantané (« estimé ») jusqu'à la lecture suivante, qui la remplace. Les noms (dépôt en minuscules,
  livraison en PascalCase, Cargo.json) sont ramenés au même symbole : sans `$` ni `_name;`, en minuscules.
- Chantier terminé (`ConstructionComplete: true`) ou échoué (`ConstructionFailed: true`) : gardé et marqué, jamais
  actif (sauf si tu y es à quai). `CompleteConstruction` est seulement noté au diagnostic (vu « brièvement » par
  EDDiscovery, absent de la fin de la fixture BGS-Tally).
- Chantier fini par d'autres CMDR (fin jamais lue au dépôt par toi) : il est **terminé d'après l'amarrage** à la
  station finie, et marqué ainsi sur la page. Même MarketID : station sans nom de chantier, ou sans le service
  `colonisationcontribution`. Nouveau MarketID (cas du port primaire) : même système et même nom que la partie libre
  du nom du chantier (« Judson Depot ») ; la nouvelle station est notée sur l'ancien chantier. Chaque fin déduite est
  notée au diagnostic ; une lecture du dépôt plus récente qui dit « en cours » l'annule.
- `ColonisationSystemClaim` donne le système **revendiqué**, pas ta position (il est écrit depuis un autre système) ;
  `ColonisationBeaconDeployed`, sans champ, prend le système où tu es. La page liste ces revendications.

Liste de courses et fin estimée (`plan.js`, calculs purs) :

- **Reste** = demandé − livré (dernière lecture du dépôt) ; **à acheter** = reste − ta soute (Cargo.json), jamais
  négatif ; la soute en trop ou hors chantier ne compte pas. La soute n'est déduite que pour le **chantier actif**
  (à quai, sinon épinglé, sinon le dernier en cours) : la déduire de chaque chantier qui demande la même marchandise
  la compterait plusieurs fois ; les autres affichent « soute comptée pour le chantier actif ». La cargaison de
  mission (ligne de Cargo.json avec `MissionID`, gardé pour cela par l'état du jeu) ne compte pas : elle est réservée
  à la mission. Les marchandises volées comptent.
- **Ton porteur** : sa cargaison estimée (module Porteur, voir [Saut du porteur](modes-de-jeu.md#saut-du-porteur), lue
  par son API locale toutes les 30 s et 1 s après un transfert, un achat ou une vente) est déduite après la soute :
  **à acheter** = reste − soute − porteur, jamais négatif, pour le chantier actif seulement (comme la soute : elle ne
  sert qu'une fois). La page montre le porteur (total estimé, écart au total que le jeu donne, en orange) avec la case
  « Compter sa cargaison dans « À acheter » » (cochée par défaut ; `PUT /settings { carrier }`, gardée dans
  `colonisation-reglages.json` à côté de l'archive) ; le détail d'un chantier a une colonne « Porteur », le HUD et la
  liste de courses disent ce qui est sur le porteur. Seulement ton porteur (`CarrierStats`), pas celui d'un autre.
- **Trajets** = reste ÷ capacité de soute du vaisseau actuel (`CargoCapacity` du Loadout), arrondi au-dessus ;
  inconnus sans capacité, 0 sans reste.
- **Durée d'une boucle** : saisie, sinon mesurée sur tes livraisons à ce chantier (médiane des écarts entre deux
  passages au dépôt, pauses de plus de 3 h exclues, dès 2 boucles). Le module « Mes routes commerciales » a été
  regardé : ses boucles vont d'un achat au suivant avec des ventes (`MarketSell`) ; une livraison à un dépôt n'est pas
  une vente, ses durées ne servent donc pas ici.
- **Fin estimée** = trajets × boucle, en temps de jeu et en soirées (heures par soirée des Paramètres). Rien à
  livrer (chantier terminé ou tout livré) : pas de fin estimée, la page donne la date de fin s'il y en a une.
- **Échéance** : toujours **saisie** par toi (aucun événement ne la donne) et marquée « saisie ». Verdict : dans les
  temps, serré (plus de soirées que de jours), en retard (même en jouant sans t'arrêter), dépassée.

Stations proches (`sources.js`, à la demande sur la page) : Ardent Insight,
`GET /v2/system/name/{système}/commodity/name/{symbole}/nearby/exports?maxDistance&maxDaysAgo&fleetCarriers=false&sort=distance`
pour chaque marchandise restante, plus `/v2/system/name/{système}/commodities/exports` pour le système du chantier
(exclu de la première). Filtré ici sur la plateforme de ton vaisseau (une plateforme inconnue est gardée), reclassé par
distance, distance à l'arrivée et fraîcheur, avec stock (en vert s'il suffit), prix et âge du relevé. Cache de 30 min,
4 requêtes à la fois au plus ; système inconnu d'Ardent (404) ou réseau coupé : message clair, rien ne casse. Seuls un
nom de système et des symboles de marchandises sont envoyés. Ardent ne connaît pas les besoins des chantiers (pas de
flux EDDN pour la colonisation) : ils viennent uniquement du journal.

Persistance : `server/data/colonisation.json` (écriture atomique : fichier temporaire puis renommage). À chaque
démarrage, les chantiers sont reconstruits depuis tout l'historique du journal, puis complétés par ce fichier
(chantiers dont les journaux ont disparu, réglages saisis, livraisons plus anciennes). Le fichier est relu avec
prudence : un champ inattendu ou piégé est ignoré. Un fichier illisible (JSON abîmé, autre forme) est mis de côté
sous `colonisation.json.illisible-<date>` avec un avertissement dans la console, avant toute nouvelle écriture : il
contient des saisies et des livraisons que le journal ne permet pas de retrouver. « Oublier » ignore les événements
passés du chantier, et les suivants (lectures du dépôt, livraisons) jusqu'au prochain amarrage à ce chantier
(`Docked`, ou `Location` à quai), qui le fait revenir sans rien de ce qui précède.

API (`/api/modules/colonisation`) : `GET /sites` (vue d'ensemble), `GET /sites/:marketId`, `GET /here` (chantier où
tu es à quai, avec sa liste de courses), `GET /active` (chantier du HUD), `GET /sites/:marketId/sources`
(`maxDistance` 1 à 500 al, `maxDaysAgo` 1 à 90 j, `carriers`), `PUT /sites/:marketId` (`name` 60 caractères,
`notes` 2 000, `deadline` date, `loopMinutes` 1 à 1 440, `pinned`), `DELETE /sites/:marketId`, `GET /diagnostics`.
Le MarketID doit être numérique (sinon 400) ; seules les clés connues du corps sont lues.

**Diagnostic** (bas de la page, `GET /diagnostics`) : champs inconnus, absents ou mal typés de chaque événement de
colonisation, derniers événements `Colonisation*` bruts (rien d'autre du journal), et écarts aux observations
documentées, vérifiées à chaque lecture sans rien corriger en silence : avancement = Σ livré ÷ Σ demandé (à 1e-6
près), `ConstructionComplete` exactement à 1, `Payment` constant par marchandise, demandé stable, livré jamais en
baisse, hausse du livré au moins égale à tes livraisons, marchandise livrée présente dans les besoins, casse des noms, fin
de chantier lue au dépôt (sinon déduite de l'amarrage).

À vérifier avec un vrai journal (incertitudes de la spécification) :

- Fréquence de `ColonisationConstructionDepot` : « toutes les 15 s à quai » (schémas, Observatory, Reddit
  avril 2025) ou « seulement à l'ouverture du contact » (EDCT, 2026) ; écrit ou non au démarrage du jeu déjà à quai.
- `ConstructionFailed` : jamais vu à `true` ; selon EDAPITool, un chantier abandonné n'est pas marqué échoué (il
  reste alors « en cours » : à oublier à la main).
- `CompleteConstruction` : sans champ, peut-être disparu.
- `Payment` : lu comme le paiement par tonne au contributeur, non documenté (affiché nulle part pour l'instant).
- Formule de `ConstructionProgress` : vérifiée sur trois sources, non documentée par Frontier.
- Changement de MarketID et de nom à la fin : confirmé pour le port primaire (3963439106 → 4351826691), supposé
  pour les autres chantiers. Le chantier terminé garde son ancien MarketID ; la nouvelle station n'y est reliée que
  si elle reprend le nom du chantier dans le même système (à confirmer : sinon, oublie le chantier à la main).
- Cargaison de mission et marchandises volées : livrables au dépôt ou non (la première n'est pas comptée en soute,
  les secondes le sont).
- Aucune ligne `Docked` réelle et complète pour « Orbital/Planetary Construction Site: … » : `StationType`,
  `StationGovernment` et `StationServices` à confirmer. Variante « `$EXT_PNL_ColonisationShip` » acceptée, non
  confirmée.
- `ColonisationBeaconDeployed` : sans champ selon trois sources, avec `StarSystem` selon une autre.
- Ardent : fraîcheur selon les envois EDDN, ni filtre de plateforme ni pagination au-delà de 1 000 lignes.

Aucune règle non vérifiée n'est codée : ni délai de 4 semaines pour un chantier, ni fenêtre de revendication, ni
besoins par type de chantier (Frontier les a déjà changés : ils viennent toujours du dépôt).

## Projet de l'escadron

Le chef de l'escadron choisit, dans son app, les systèmes à coloniser puis leurs chantiers dans l'ordre où les
construire, et publie ce projet sur le serveur de l'escadron. Chaque membre qui le suit voit, en tête de la page
Colonisation, ce qu'il manque à chaque chantier. Les relevés des membres qui y passent le tiennent à jour : personne
n'a besoin d'aller au chantier pour savoir quoi acheter.

- **Le chef** (ce PC gère le serveur : adresse et clé de chef connues, page du chef de l'escadron) : « Composer le
  projet » ou « Modifier le projet ». Il donne de 1 à 10 systèmes (nom exact, comme dans le jeu ; ses revendications
  et les systèmes de ses chantiers sont proposés), puis classe jusqu'à 40 chantiers (↑ ↓ ✕). Les chantiers proposés
  sont ceux que son PC suit dans ces systèmes et ceux que les membres y ont relevés : un chantier n'existe qu'une fois
  la construction lancée en jeu, et son MarketID n'est connu qu'au premier amarrage. Il peut donc publier les systèmes
  d'abord, puis classer les chantiers à mesure qu'ils apparaissent. « Publier à l'escadron » remplace le projet du
  serveur pour tous (version + 1). « Arrêter le projet » l'efface, avec tous ses relevés.
- **Les membres** : « Suivre le projet de l'escadron » (une fois, coupé par défaut ; « Ne plus suivre » l'arrête).
  Il faut avoir rejoint l'escadron, et une installation confirmée. La page montre les chantiers du chef dans son
  ordre (n°, avancement, reste, à acheter, trajets, d'où vient la lecture), « En priorité » (les marchandises à
  acheter d'abord pour le premier chantier en cours), les autres chantiers connus dans les systèmes du projet (pas
  encore classés), et les systèmes où aucun chantier n'est encore connu. Un chantier relevé par l'escadron sans que tu
  t'y sois amarré a sa page (`/colonisation/<MarketID>`, avec « Où acheter »), sans réglages ni « Oublier ».
- **Le HUD** et la liste de courses : à quai à un chantier, c'est lui ; sinon le chantier épinglé ; sinon le **premier
  chantier en cours du projet**, dans l'ordre du chef (« Projet de l'escadron ») ; sinon le dernier en cours. La soute
  n'est déduite que pour ce chantier actif, comme avant.

**La lecture la plus récente l'emporte.** Le relevé du dépôt (`ColonisationConstructionDepot`) est un instantané
absolu des livraisons de tous les CMDR : celui d'un autre membre vaut le tien. Pour chaque chantier, l'app prend la
lecture la plus récente, la tienne ou celle de l'escadron (« relevé par … il y a … »). Tes réglages et tes livraisons
restent les tiens. Tes livraisons faites après le relevé de l'escadron y sont ajoutées à titre provisoire, comme sur
une lecture du dépôt faite ici, jusqu'au relevé suivant (`server/src/modules/colonisation/escadron.js`, calculs purs).

**Ce qui part, et quand** (`server/src/modules/escadron/colonisation.js`). Seulement si le projet est suivi : le
relevé du dépôt des chantiers des systèmes du projet, jamais les autres. Il contient le MarketID, le système, le nom
brut du chantier, l'heure du relevé (celle du journal ; ou la fin du chantier si elle est plus récente, fin déduite
de l'amarrage), l'avancement et, pour chaque marchandise, le demandé et le livré. Le serveur sait qui l'envoie (le
jeton), les autres membres le voient. Ni ta soute, ni tes livraisons, ni ta position ailleurs. Une lecture
provisoire (tes livraisons ajoutées en attendant le dépôt) ne part jamais : seulement ce que le jeu a écrit. Un
relevé ne part que s'il est plus récent que celui du serveur, et pas s'il n'apprend rien (même contenu, moins de
30 min après). L'app relit le projet toutes les 2 min, 10 s après un relevé du dépôt, une livraison ou un amarrage
(un seul passage pour la rafale : le jeu peut écrire le dépôt toutes les 15 s à quai), et à l'ouverture de la page
(au plus toutes les 30 s). Le module Colonisation lit la vue du module Escadron par son API locale (sa copie en
mémoire, aucun réseau) toutes les 30 s pour le HUD, et à chaque affichage de la page. Le module Escadron lit les
chantiers de ce PC par l'API locale du module Colonisation (`GET /sites/:marketId?local=1` : ta propre lecture,
jamais celle d'un autre membre).

**Serveur de l'escadron** (`chef/worker/`, à reporter dans le dépôt squadron-tracker) : le projet est dans `state`
(clé `colonisation` : `{ projet, version, updatedAt }`), les relevés dans `colonisation_releves` (un par chantier, le
plus récent d'après l'heure du journal, écrit seulement s'il l'est : `ON CONFLICT … WHERE excluded.at > at`).
`GET /v1/colonisation` (membres confirmés, chef, suivi) rend le projet et les relevés de ses systèmes ;
`PUT /v1/colonisation/releve` (membres confirmés, 120 appels par minute comme le reste) refuse un relevé du futur
(plus de 5 min), de plus de 30 jours, mal formé (400), hors des systèmes du projet (409), ou un 101e chantier (429) ;
`PUT` et `DELETE /admin/colonisation` (clé de chef) publient et arrêtent le projet. Une installation à confirmer ne lit
ni n'envoie rien (403). Un serveur d'avant cette version répond 404 : la page dit que le chef doit le remonter
(page du chef, étape 1 ; la table se crée sans toucher au reste).

API locale : `GET /api/modules/colonisation/escadron` (le projet vu d'ici) ; module Escadron :
`GET /api/modules/escadron/colonisation`, `PUT …/colonisation/actif` `{ actif }`, `POST …/colonisation/lire`
`{ force? }` ; côté chef `POST …/chef/colonisation/lire`, `PUT …/chef/colonisation` `{ projet: { systems, sites:
[{ marketId, system, name? }] } }`, `DELETE …/chef/colonisation`.

**Carte Discord du projet** (facultative, « 3. Carte Discord » dans l'éditeur du chef, une fois le projet publié).
Le chef colle le lien d'un webhook Discord (`PUT /admin/colonisation/discord { webhook }`, vérifié comme celui de
la carte du Powerplay) : le serveur de l'escadron poste aussitôt un message, puis le **modifie** (même message) à
chaque nouvelle version du projet et à chaque relevé gardé. Au plus une modification par minute : une modification
retenue part à la lecture suivante d'un membre (toutes les 2 min) ; une nouvelle version du projet part tout de
suite. Message supprimé dans Discord : reposté. Lien refusé par Discord : rien n'est gardé, la page le dit. Le
message : les chantiers dans l'ordre du chef (10 au plus, puis « et N autres »), puis les autres relevés ; pour
chacun une barre d'avancement, le reste en tonnes, l'heure du relevé (heure relative de Discord) et les trois
marchandises qui manquent le plus ; « Projet terminé. » à l'arrêt. Aucun nom de commandant ; les noms venus du jeu
sont échappés et aucune mention ne peut sonner (`allowed_mentions` vide). Le lien reste dans la base du serveur
(`state`, clé `colonisation-discord`), jamais sur le PC du chef ni dans une réponse ; `{ webhook: null }` retire la
carte. Pas de GitHub : contrairement à la carte du Powerplay, c'est le Worker qui écrit à Discord, quand un relevé
arrive.

Limites assumées : le code de l'escadron ne prouve pas l'identité, un membre confirmé pourrait envoyer un faux relevé
(le serveur vérifie la forme, pas la vérité) ; le relevé suivant d'un autre membre le remplace.

Plus tard (hors périmètre) : recherche d'un système à coloniser, lien avec Raven Colonial.
