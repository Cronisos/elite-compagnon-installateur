# Vaisseaux

> Partie de la notice d’Elite Compagnon : sommaire dans le [README](../README.md#documentation).

## Ingénieurs (cartes)

Ingénierie → Ingénieurs : une carte par ingénieur de vaisseau, triées par distance depuis ta position, comme Inara mais
avec **ton** état : « Débloqué · rang N » (barres de rang), « Invité », « Connu », « Pas encore découvert » ; base et
système (📋), distance, région, pad, permis ; ce qu'il fait, une ligne par module au grade le plus haut (G5 en orange,
G4 en ambre). Filtres : familles de modules en un clic (armes thermiques, cinétiques, explosives, mixtes, défense,
boucliers, blindage, FSD et propulseurs, générateur et distributeur, scanners, contrôleurs de drones, divers ; la
famille choisie est surlignée dans chaque carte), région, débloqués seulement, « Qui fait » un plan (grade max sur la
carte). Un clic ouvre la fiche de l'ingénieur.

**Portraits** : à déposer soi-même, un fichier par ingénieur, dans `ingenieurs` du dossier des données
(`%APPDATA%\Elite Compagnon\donnees\ingenieurs\` avec l'app de bureau, `server/data/ingenieurs/` avec npm run dev),
nommé par son nom (« Bill Turner.png » ; majuscules, accents et ponctuation sans importance) ou par son identifiant du
jeu (« 300050.jpg »). PNG, JPEG ou WebP reconnus à leur contenu, 8 Mo et 8 192 px au plus ; un faux fichier, un
dossier ou un lien est ignoré (`services/portraits.js`, testé). Sans portrait : ses initiales. Grisé tant que
l'ingénieur n'est pas invité. Rien n'est versionné ni envoyé. `GET /api/modules/engineering/engineers/:id/portrait`
(204 sans portrait, 404 pour un ingénieur inconnu).
(`client/src/modules/engineering/ingenieursVue.js`, testé.)

## Mes vaisseaux

Pour répondre vite à « comment est fité ce vaisseau, et où est-il ? », sans aller en station ni créer quoi que ce soit.
Tout vient de ce que le jeu écrit (la configuration de chaque vaisseau à chaque fois que tu montes à bord).

- **Cartes** : le vaisseau actuel en premier, sur toute la largeur, avec son bandeau, où tu es (station comprise) et
  ses chiffres en grand ; puis les autres, par modèle. Sur chaque carte : où il est garé (📋), saut maximal, soute,
  boucliers, rôle. Les chiffres que le jeu écrit (saut maximal, soute, rachat) passent avant le calcul. En haut à
  droite, le badge ingénierie : une clé et le nombre de modules ingéniérés, lus dans la configuration du jeu (même une
  modification que les données EDSY ne connaissent pas), à la couleur du grade le plus haut ; gris à 0.
- **Filtres par modèle** : « Anaconda ×3 » ne montre que tes Anaconda, pour savoir d'un clic lequel est fité comment.
- **Fiche** (un clic sur une carte, fenêtre en lecture seule) : onglet **Stats** (saut, défense avec résistances,
  mobilité, énergie et chaleur, armement, soute et valeur), onglet **Modules** (emplacement, module, ingénierie et
  effet ; les modules identiques qui se suivent sur une ligne, « ×3 »). On y nomme le vaisseau et on règle son rôle ;
  rien d'autre ne s'y modifie.
- **Ses builds** (onglet de la fiche) : les builds destinés à ce vaisseau, puis ceux du même modèle, chacun avec « ce
  qu'il te faut » depuis la configuration actuelle (`builder/ecart.js`, testé ; `GET /api/modules/builder/fleet/:id/builds`) :
  modules à acheter (＋, avec leur modification), modifications d'ingénierie sur un module gardé (⚙, « G3 → 5 »),
  modules à retirer (−), et le prix catalogue des achats. « Ouvrir dans le constructeur » pour le modifier ;
  « Matériaux : préparer le plan d'ingénierie » crée le plan à partir du build, rattaché à ce vaisseau, et l'ouvre
  (matériaux nécessaires et manquants). Un build sans rien à faire le dit ; un module à toi déjà modifié alors que celui du build ne l'est pas est montré en retrait, pour information.
- **Construire un build à partir de celui-ci** (pied de la fiche) ouvre le constructeur sur la configuration actuelle :
  modifier un build, c'est une autre fenêtre. Le plan d'ingénierie d'un vaisseau se crée dans Ingénierie → Nouveau plan
  (le vaisseau où tu es y est choisi d'avance).

Serveur : `GET /api/modules/builder/fleet/resumes` (chiffres des cartes) et `GET /api/modules/builder/fleet/:shipId/fiche`
(modules en clair et statistiques, calculées comme le constructeur, sur la configuration réelle). Client :
`client/src/modules/vaisseaux/` (`ficheVue.js` : mise en forme, testée).

## Rôles des vaisseaux

Chaque vaisseau peut avoir un **rôle principal** (un seul au plus) et des **rôles secondaires** (3 au plus) : les modes
de jeu (Commerce, Minage Rhino, Minage vaisseau, Combat, Sauvetage, Matériaux, Colonisation), plus **Polyvalent**. Le
rôle se donne avec « ⚑ Rôle », à côté de « Nommer » (Mes vaisseaux, Constructeur → Mes vaisseaux), ou
dans le menu « Mode de jeu » pour le vaisseau où tu es. L'app reconnaît chaque vaisseau à son identifiant du jeu
(ShipID), comme pour les noms. Le but : reconnaître ce que tu fais, et t'ouvrir la bonne interface sans que tu la
cherches.

**Bascule à l'embarquement.** Quand tu montes dans un vaisseau qui a un rôle principal, l'app passe d'elle-même au mode de
ce rôle et ouvre ses fenêtres par-dessus le jeu (le Coup d'œil reste ouvert s'il l'était). Un avis le dit, à côté du
menu et sur la ligne du bas des HUD : « RÔLE ⛏ Minage Rhino activé — vaisseau « Pioche » [Annuler] » (accordé au nom du
mode : « 🏗 Colonisation activée », « ◈ Matériaux activés » ; chaque mode déclare son accord dans
`server/src/core/modes.js`, un mode ajouté sans lui ne se charge pas). **Annuler** remet
le mode et les fenêtres d'avant (sans remettre à zéro la session du mode retrouvé), le mode annulé se tait 30 min
comme après « Non », et l'app ne rebascule plus pour ce vaisseau avant le prochain vrai embarquement (un relog ou un
relancement du jeu dans le même vaisseau n'en est pas un). L'avis s'efface au bout de 3 min (le mode reste), ou dès que
tu changes de mode toi-même ; ✕ le ferme. L'avis ne survit pas à un redémarrage de l'app : la bascule reste (et son
choix noté, donc pas de nouvelle bascule dans ce vaisseau), le menu remet le mode voulu. À un changement de vaisseau, comme à tout changement de mode, la session du
mode ouvert repart de zéro (nouvelle sortie) ; au démarrage de l'app et au lancement du jeu, la bascule garde la
session déjà relue depuis le `LoadGame` (rien n'est perdu).

Ce qui compte comme embarquement (seulement en direct : la relecture du journal au démarrage ne fait que retrouver le
vaisseau où tu es) :

- un **vrai changement de vaisseau** : `ShipyardSwap` (échange au chantier naval), `ShipyardNew` (vaisseau acheté, même
  quand il reprend le numéro de l'ancien vendu à l'achat), `LoadGame` dans un autre vaisseau que le dernier, `Loadout`
  d'un autre ShipID (ou d'un autre modèle sous le même numéro), `Embark` dans un autre de tes vaisseaux ;
- le **lancement du jeu** (`LoadGame`) dans le même vaisseau, relog compris (passage Ouvert → Solo, retour au menu
  principal puis « Continuer ») : ce n'est pas un changement de vaisseau. Tout choix fait dans ce vaisseau reste : un
  mode choisi au menu, « Aucun », Annuler, ou la bascule elle-même ; un mode d'origine inconnue aussi. Bascule seulement
  s'il n'y a aucun choix noté, si le choix a été fait dans un autre vaisseau, ou si tu as quitté ce vaisseau puis y es
  remonté depuis (vu à la relecture du journal, même app fermée). Lancé en SRV, c'est un lancement de ton vaisseau ;
  lancé à pied, le lancement compte quand tu remontes à bord ou dès que tu montes dans le SRV de ton vaisseau (30 oct. :
  jeu lancé à pied près du Rhino, sorties en SRV, retour deux heures plus tard) ; en taxi, quand tu remontes à bord ;
- **jamais** : un `Loadout` du même vaisseau (après l'équipement, le retour du SRV, un rachat après `Resurrect`), un
  taxi, le vaisseau d'un autre CMDR en équipage multijoueur (`JoinACrew` … `QuitACrew`, `Embark` Multicrew ; à pied
  aussi : `Disembark` Multicrew, « tu sors du vaisseau d'un autre joueur », ne fait pas quitter l'équipage), un chasseur,
  un SRV ou une combinaison (`LoadGame` à pied : ShipID 4293000002, mesuré). Formes vérifiées dans les journaux de référence
  du 23 oct. au 7 nov. 2026 (lecture seule) ; taxi et équipage multijoueur n'y figurent pas : à vérifier en jeu.

Un mode choisi à la main (menu, page, « Oui », « Aucun » compris) n'est **jamais écrasé** tant que tu restes dans le
même vaisseau : l'app note dans quel vaisseau, comment et à quelle heure il a été choisi (`overlay.json`, champ
`choice` : `shipId`, `kind`, `at`). Le choix tient jusqu'au prochain vrai changement de vaisseau, **relances du jeu
comprises** : « Aucun », une bascule annulée ou l'overlay fermé un soir dans « Pioche », et rien ne s'ouvre le
lendemain si tu relances le jeu dans « Pioche ». Il ne vaut plus quand tu quittes ce vaisseau puis y remontes : le
journal date chaque vrai changement de vaisseau, relecture comprise. Le silence de 30 min après « Non » ne bloque pas
la bascule ni la proposition d'un vrai embarquement : elles viennent d'un rôle que tu as choisi, pas d'une devinette.
Au lancement dans le même vaisseau (relog) et au démarrage de l'app, « Non » tient : ni bascule ni proposition pendant
30 min, que l'overlay soit là ou non, **même si l'app a redémarré entre-temps** : les silences en cours (« Non », bascule
annulée) sont gardés dans `mode-silences.json` (voir « Stockage »).

**Déjà dans le mode du rôle** : rien ne change, mais les fenêtres de ce mode, que l'app croit ouvertes, sont
redemandées telles quelles à l'overlay (à l'embarquement, au lancement, au démarrage de l'app jeu lancé). S'il tourne,
rien ne bouge ; s'il s'est arrêté sans le dire (PC redémarré, plantage), il se relance : le Minage Rhino d'hier soir
revient par-dessus le jeu quand tu montes dans un de tes porte-Rhino. Ni avis, ni choix noté, ni session remise à zéro.

**Overlay quitté (Alt+Maj+Q)** : l'overlay le dit au serveur avant de quitter (`overlay/closed.js`, `POST
/api/overlay/closed`). L'app ne croit plus ses fenêtres ouvertes : le mode reste noté (le menu le montre), le Coup
d'œil est décoché. Annuler une bascule ne rouvre donc pas des fenêtres que tu avais fermées (il remet le mode d'avant,
sans fenêtre), et un rôle sans fenêtre (Commerce) bascule, puisque rien n'est ouvert. Fermer l'overlay compte comme un
choix fait dans ce vaisseau : un relog ou un relancement du jeu n'y rouvre rien. Le prochain **vrai** embarquement
dans un vaisseau à rôle principal rouvre l'overlay avec les fenêtres du rôle, avec l'avis et Annuler, même si le mode
était déjà le bon (choix de l'app : la bascule à l'embarquement prime ; Annuler les referme).

**Alt+Maj+Q pressé pendant que l'app (son serveur) est arrêtée** : l'overlay, lancé détaché, lui survit, et son avis
n'arrive pas. Il garde alors la fermeture, avec son heure, dans son propre dossier (`fermeture-a-transmettre.json`, à côté
de la position des fenêtres) et la transmet à son lancement suivant, **avant d'ouvrir quoi que ce soit** (`POST
/api/overlay/closed` avec `{ at }`). Le serveur, qui note l'heure de chaque changement voulu (`overlay.json`, champ
`changedAt` : menu, page, bascule, Annuler, overlay quitté ; des fenêtres simplement redemandées telles quelles n'en
sont pas un), applique la fermeture si rien n'a été voulu depuis, comme si elle venait d'avoir lieu (notée à son heure),
et répond ce que l'overlay doit ouvrir (`open`) : rien, et les fenêtres d'hier ne reviennent pas seules par-dessus le
jeu. Un changement voulu depuis prime : ce sont ses fenêtres qui s'ouvrent ; l'état d'avant une bascule encore
annulable, s'il datait d'avant la fermeture, perd ses fenêtres (Annuler ne les rouvre pas). Serveur toujours
injoignable : l'overlay ouvre ce qui est demandé et garde la fermeture pour la fois suivante. Lancé à la main
(`npm run overlay`), il transmet la fermeture puis ouvre ce que tu demandes.

**Bascules à la suite** (échanges rapprochés au chantier naval : 46 s entre deux `ShipyardSwap` le 29 oct.) : si une
bascule suit une autre encore annulable (avis encore affiché), Annuler remonte à l'état d'avant la première, pas au
mode automatique d'un vaisseau que tu as quitté. La série s'arrête dès que l'avis s'efface : échéance, mode changé à
la main, passage par un vaisseau sans rôle (le mode y reste, comme toujours).

**Rôle sans fenêtre (Commerce)** : le mode n'a pas de fenêtre par-dessus le jeu. Si d'autres fenêtres sont ouvertes
(le HUD du Combat…), basculer les fermerait sans rien montrer à la place, ni l'avis : l'app le **propose** au lieu de
basculer (« ⇄ Commerce ? rôle principal de « Cargo » : ⇄ Commerce n'a pas de fenêtre en jeu, l'app ne ferme pas
d'elle-même celles qui sont ouvertes »). Si rien n'est ouvert (ou seulement le Coup d'œil), rien ne se ferme : la
bascule a lieu, et l'avis, avec Annuler, s'affiche dans l'app et sur la ligne du bas du Coup d'œil s'il est ouvert.

**Démarrage de l'app, jeu déjà lancé** : un mode actif n'est jamais touché. En taxi ou à bord du vaisseau d'un autre
CMDR (équipage, à pied compris), rien : la décision attend ton retour à bord de ton vaisseau, et c'est **elle** qui est
prise alors, avec la même règle (un mode actif n'est jamais touché) : descendre du taxi n'est ni un changement de
vaisseau ni un lancement du jeu. Un `LoadGame` ou un vrai changement de vaisseau avant ton retour la remplacent, avec
leur propre règle. Sinon, même règle que le lancement : si
aucun mode n'est actif, l'app applique le rôle principal du vaisseau actuel (avec son avis et Annuler), sauf si tu as
choisi « Aucun » ou annulé une bascule dans ce vaisseau sans l'avoir quitté depuis. Rien n'est écrasé (il n'y avait
aucun mode) et la session du mode ouvert reste celle relue depuis le `LoadGame`. Cette décision tient lieu de celle du
lancement : partie lancée à pied, le retour à bord n'est plus un lancement (sinon il rebasculerait après un Annuler).
« Jeu lancé » : `LoadGame` sans `Shutdown`, et un signe de vie (Status.json, journal) depuis moins de 10 min, comme
pour la garde des commandes.

**Overlay absent ou coupé** : pas de bascule possible. Elle devient une proposition normale, avec la raison : « ⛏ Minage
Rhino ? rôle principal de « Pioche » : l'overlay est coupé, pas de fenêtre par-dessus le jeu ; ouvre sa page dans
l'app ». Sans overlay, « Oui » ne pourrait ouvrir aucune fenêtre (`PUT /api/overlay` répond 409) : à côté du menu, il
devient **« Ouvrir la page »**, qui ouvre la page du mode dans l'app et répond à la proposition (elle se tait 30 min,
comme après « Non »). Valable pour toute proposition sans overlay. Celle du rôle passe même si ce mode se taisait
après un « Non », à un vrai embarquement (pas à un relog), puis vit comme les autres (« Non », 15 min).

**Propositions selon le rôle** :

| Vaisseau | Activité dans ses rôles | Activité hors de ses rôles | Équipement (`Loadout`) |
|---|---|---|---|
| sans rôle | proposée normalement | proposée normalement | proposé, avec « Retenir comme rôle de ce vaisseau » |
| rôle principal et/ou secondaires | proposée normalement | proposée **discrètement** | rien : le rôle prime |
| Polyvalent | tout est proposé normalement, aucune bascule | — | proposé normalement, sans « Retenir » |

Polyvalent : l'équipement propose un mode comme pour un vaisseau sans rôle, mais sans « Retenir » (un rôle est déjà
donné). L'équipement ne parle que de **ton** vaisseau, celui où tu es : le
`Loadout` d'un taxi ou du vaisseau d'un autre CMDR (équipage) ne propose rien, et ne peut donc jamais faire retenir un
rôle pour le tien. En taxi ou en équipage (à pied compris, jusqu'au `QuitACrew`), l'activité est proposée comme sans
rôle (les rôles de ton vaisseau ne s'y appliquent pas).

La proposition discrète ne prend pas la ligne du bas du HUD : elle s'ajoute au bout, en gris et en petit (« ☄ Minage
vaisseau ? oui ✕ »), et à côté du menu, en gris, sans bouton coloré. Elle ne chasse jamais une proposition normale en
attente ; une normale la remplace. « Non » (✕) la fait taire 30 min, comme une autre. « Retenir comme rôle de ce
vaisseau » (sur la ligne du bas d'un HUD, plus étroite : « ⚑ Retenir comme rôle », du style de « Oui ») donne ce mode
comme rôle principal au vaisseau, puis l'ouvre, comme « Oui ». Sans rôle, l'aide de l'éditeur le dit : « Sans rôle, rien
ne s'ouvre seul : l'app te propose un mode d'après ce que tu fais et l'équipement du vaisseau. »

**Vaisseau vendu** : le jeu redonne son numéro au suivant (mesuré : Panther n° 30 vendu à l'achat d'un Mandalay, qui a
reçu le n° 30, 24 oct. ; Python Mk II puis Krait Mk II n° 37, 25 oct.). Son rôle est donc effacé à la vente
(`ShipyardSell`, `SellShipOnRebuy`, `ShipyardBuy` avec `SellShipID`), en direct comme à la relecture du journal (vente
faite après le choix du rôle, pendant que l'app était fermée). En plus, le rôle garde le modèle du vaisseau : sous le même
numéro, un autre modèle ne l'hérite pas (le rôle est ignoré, puis effacé).

**Stockage** : `ship-roles.json` dans le dossier des données (`core/paths.js`), écrit d'un coup (fichier temporaire puis
renommage, `server/src/core/jsonFile.js`). Fichier illisible (JSON cassé, autre version) : mis de côté sous
`ship-roles.json.illisible-<date>` (copié sous ce nom si le renommage est refusé), départ à vide, avertissement.
Fichier là mais pas relu au démarrage (verrouillé par un antivirus ou une synchronisation, droits refusés), ou illisible
et ni renommé ni copié : la table reste vide en attendant, et **rien n'est écrit par-dessus**, sinon le premier rôle
donné effacerait ceux de tous les autres vaisseaux. Chaque écriture (rôle donné, « Retenir », vente vue dans le
journal) relit d'abord le fichier ; s'il est enfin lisible, elle part de son contenu ; sinon elle est refusée (503 :
« Rôle non enregistré : ship-roles.json n'a pas pu être relu… ; rien n'est écrit… »). Entrée douteuse (numéro qui
n'est pas un ShipID, rôle inconnu, secondaire en double ou égal au principal, Polyvalent avec des secondaires, plus de
3 secondaires, valeur qui n'est pas un texte, même un objet que JavaScript ne sait pas écrire comme `{"toString":0}`) :
écartée ou nettoyée, avec un avertissement qui ne montre que les textes. La relecture ne lève jamais d'erreur : une panne
imprévue laisse la table vide, sans rien écrire par-dessus le fichier, et le serveur démarre quand même. Validation stricte (`checkRole` de `core/modes.js`, la même côté interface) : ShipID
entier de 0 à 1 000 000, rôles de la liste, principal hors des secondaires, 3 secondaires au plus, Polyvalent seul,
aucun autre champ, aucune clé de prototype.

`mode-silences.json`, dans le même dossier : les silences en cours (« Non », bascule annulée), `{ "version": 1,
"silences": { "combat": "<fin du silence>" } }`, écrit d'un coup à chaque « Non » (`server/src/core/silences.js`) et
relu au démarrage : modes connus seulement (jamais une clé de prototype), dates lisibles, échéances passées oubliées, et
jamais plus de 30 min à partir de maintenant (fichier retouché, horloge reculée). Illisible : mis de côté, départ à
vide ; là mais pas relu : rien n'est écrit par-dessus. Écriture impossible : « Non » est pris quand même, il ne tiendra
simplement pas après un redémarrage.

**API** (écritures avec l'en-tête `X-Elite-Compagnon: 1`, erreurs 400 en français) :

- `GET /api/ships/roles` : rôles possibles (`roles`), maximum de secondaires (`maxSecondary`), rôle de chaque vaisseau
  (`ships` : `{ "43": { primary, secondary } }`) ;
- `PUT /api/ships/:shipId/role` : `{ primary, secondary }` (`primary` obligatoire ; `{ primary: null, secondary: [] }`
  efface) ;
- `GET /api/ships/current` : vaisseau où tu es (`shipId`, `model`, `name` en jeu, `nickname`, `title` affiché, `role`) ;
- `GET /api/overlay/switch` : avis de la dernière bascule (`mode`, `shipId`, `ship`, `at`, `until`) ou null ;
  `POST /api/overlay/switch/cancel` : Annuler (409 s'il n'y a plus rien à annuler) ; `POST /api/overlay/switch/dismiss` :
  fermer l'avis ;
- `POST /api/overlay/closed` : overlay quitté par le joueur (envoyé par l'overlay à Alt+Maj+Q) ; corps vide, ou
  `{ at }` (heure ISO) pour une fermeture transmise après coup (400 en français si elle est illisible, ou pour tout
  autre champ) ; rend l'état, et `open` : les fenêtres que l'overlay doit ouvrir maintenant ;
- `PUT /api/overlay` refuse désormais un mode inconnu (400, testé par le banc : `scripts/controle/tests/serveur.test.mjs`).

Temps réel : `ships:roles`, `ships:current`, `overlay:switch`, et `overlay:suggest` (champs `discreet`, `canRemember` +
`shipId`, `source: 'role'`).

Fichiers : `server/src/core/modes.js` (modes et rôles), `shipRoles.js` (stockage), `boarding.js` (vaisseau actuel et
embarquement), `roleSwitch.js` (bascule, Annuler, démarrage), `shipRoutes.js` (API), `timers.js` (minuteries, partagées
avec `modeGuess.js`), `silences.js` (silences gardés d'un démarrage à l'autre), `overlay.js` (fenêtres, choix et heure
du dernier changement voulu) ; `overlay/closed.js` (avis « overlay quitté », fermeture gardée puis transmise) ; côté interface `client/src/core/ShipRole.jsx` (éditeur), `shipRole.js` (textes, règles
d'édition, et ce que montrent la ligne du bas des HUD et les bulles du menu : `hudBottom`, `menuBubbles`),
`useShips.js` (lecture en temps réel), `ModeMenu.jsx` et `hud.jsx` (avis, propositions, qui affichent ce que rendent
`hudBottom` et `menuBubbles`). Tests : `modes.test.js`, `shipRoles.test.js`, `boarding.test.js`, `roleSwitch.test.js`
(avec un faux overlay et de fausses minuteries, et les séquences réelles des 29 et 30 oct.), `shipRoutes.test.js` (API,
garde, temps réel), `overlay.test.js` (overlay coupé : rien d'écrit), `overlay.persist.test.js` (overlay présent mais
lancement remplacé, jamais d'Electron : `overlay.json` écrit puis relu par un second chargement du module, comme après
un redémarrage), `silences.test.js`, `timers.test.js`, `overlay/closed.test.js` (avis « overlay quitté », fermeture
gardée et transmise), et côté interface `modes.test.js`, `shipRole.test.js`. Le rejeu a un scénario : un
rôle donné par l'API au vaisseau de la séance de minage Rhino, overlay coupé du banc, et la bascule devient la
proposition attendue, que « Oui » ne peut pas accepter (409) et qu'« Ouvrir la page » efface
(`scripts/controle/rejeu/scenarios.mjs`). L'étape des pages a un parcours en direct (voir « Pages et fenêtres »).

À vérifier en jeu : la bascule avec l'overlay réel (fenêtres, Coup d'œil gardé, Annuler) ; Alt+Maj+Q avec l'overlay
réel (le menu doit montrer le Coup d'œil décoché, et Annuler ne rien rouvrir) ; Alt+Maj+Q avec l'app arrêtée, puis
l'app et le jeu relancés dans le même vaisseau (rien ne doit s'ouvrir seul) ; taxi et équipage multijoueur (aucun dans
les journaux ; à pied pendant un équipage, `Disembark` Multicrew : l'app doit te croire toujours en équipage) ; un `LoadGame` pendant un équipage multijoueur (s'il existe, son vaisseau serait pris pour le
tien) ; un chasseur piloté (aucun `Loadout` de chasseur vu).
