# Constructeur de builds

> Partie de la notice d’Enova : sommaire dans le [README](../README.md#documentation).

## Module « Constructeur de builds »

Nécessite les données de référence (Mon ingénierie → Données).

- **Nouveau** : partir d'un de vos vaisseaux (config lue dans le journal), d'un vaisseau neuf ou d'un lien EDSY.
- **Tous les vaisseaux** (`/builder/vaisseaux`) : les 49 vaisseaux du jeu en cartes, pour choisir avant d'en faire
  un build sans l'avoir. Taille (pad P, M, G), prix, équipage, masse, vitesse et boost, bouclier et coque de base,
  maniabilité ; points d'emport par taille (É, G, M, P) et utilitaires ; compartiments internes (tailles) et
  militaires ; classe du réacteur FSD. Trois chiffres calculés (`server/src/modules/builder/apercu.js`,
  `GET /api/modules/builder/ships/apercu`, gardé en mémoire par version des données) : **saut max** dans une
  configuration d'explo commune à tous (meilleur FSD normal ou SCO en Increased Range G5 + Mass Manager, plus gros
  booster gardien, autres modules de base en D, sans armes ni internes, plein fait ; sans ingénierie de poids sur le
  reste), **saut d'origine** (tel que vendu) et **soute max** (la plus grande soute permise dans chaque
  compartiment, Mk II comprise là où le jeu l'accepte). Tri par saut, soute, compartiments, points d'emport,
  vitesse, défense, prix ou nom ; filtre par taille et par nom. « Créer un build » ouvre l'éditeur sur ce vaisseau
  neuf (`/builder/nouveau?modele=<id EDSY>`). **Doit pouvoir porter** (cases à cocher, toutes exigées) : Rhino (seul
  le grand hangar de véhicule planétaire le porte), SRV, hangar SRV Mk II, chasseurs, chasseurs Mk II, soute Mk II,
  drones de minage Mk II, passagers, cabines de luxe, compartiments militaires. Calculé d'après les modules que le jeu
  accepte dans au moins un compartiment (`moduleAllowed`) ; chaque carte en montre les pastilles, et ses modules
  **exclusifs** (réservés à quatre vaisseaux au plus : SCO Mk II du Caspian, propulseurs Mk II du Kestrel…).
  Pour chaque emplacement : module, modification, grade, effet expérimental. Seuls les modules possibles dans
  l'emplacement sont proposés (taille, soutes réservées…). **Limites du jeu** (`server/src/modules/builder/limites.js`,
  champ `limit` d'EDSY) : un seul générateur de boucliers, booster FSD gardien, collecteur de carburant, raffinerie,
  intercepteur FSD, hangar à chasseurs, contrôleur multi-drones, ordinateur d'appontage, assistance de
  supercroisière, scanner de chaque sorte ; 4 armes expérimentales au plus. Une fois la limite atteinte ailleurs sur
  le vaisseau, le module est barré et grisé dans la liste (on peut encore le remplacer là où il est). Un build qui
  dépasse (import, ancien build) est signalé « Impossible dans le jeu » et n'est pas enregistré.
  **La liste des modules ne bouge pas** d'un emplacement à l'autre de la même catégorie (internes, modules de
  base…) : le type de module qu'on regardait (soutes, par exemple) reste à la même hauteur, seules les classes
  trop grandes pour le nouvel emplacement disparaissent. Changer de catégorie la ramène en haut.
  Disposition façon EDSY : chiffres clés en bandeau (saut, boucliers, coque, DPS, vitesse, énergie, soute, masse, prix),
  à gauche tous les modules de l'emplacement choisi (par type, une ligne par classe, une case par note A → E avec sa
  caractéristique : capacité, puissance, DPS…), à droite le vaisseau sur deux colonnes (un clic choisit l'emplacement).
  Les modules de base portent la taille maximale de leur emplacement (« Générateur 5 : 5A Générateur », sauf le
  blindage) et la couleur de leur note, la même que les cases du choix : A or, B vert, C cyan, D violet, E orange.
  Noms des modules en français, les mêmes partout (names.js ; Inara garde les noms officiels). Une FSD SCO plus petite que
  l'emplacement est acceptée, comme dans le jeu (EDSY l'interdit).
  Un vaisseau neuf part avec ses modules de base au maximum : plus grande classe, en A (blindage d'origine).
- **Statistiques en direct** : défense par type de dégât (résistances, boucliers, boucliers + cellules, coque, total
  effectif), recharge des boucliers (0 → 50 → 100 %). **Pips SYS** (0 à 4, au-dessus du bandeau ; 2 par défaut,
  comme EDSY à l'ouverture d'un lien) : ils réduisent les dégâts sur les boucliers de 60 % × (pips / 4)^0,85 (33 % à
  2 pips, 60 % à 4), compris dans les boucliers effectifs, et règlent la recharge du condensateur SYS qui alimente
  leur régénération (syschg × (pips / 4)^1,1, divisé par le coût du générateur en MJ par MJ de bouclier). Retour à
  50 % après effondrement : 16 s d'attente, puis la reconstruction bridée par le distributeur. Avant le 15 nov. 2026,
  l'app ignorait les pips et le distributeur : boucliers effectifs 1,5 fois plus bas qu'EDSY à 2 pips, recharges trop
  rapides (Corsair de référence). « Boucliers + cellules » additionne les deux ; EDSY montre les cellules seules.
  Armement arme par arme (DPS soutenu et en rafale, type de dégâts,
  cadence, perforation, portée, tirage WEP, chaleur, munitions et autonomie, tir continu possible ou non), énergie et
  chaleur, distributeur, saut (maximal, à vide, soute pleine, portée totale d'un plein), mobilité (vitesse, boost,
  rotations), masse, prix et rachat. Calculs réécrits pour l'app sur les règles d'EDSY (© taleden, CC BY-NC 4.0) et vérifiés contre edsy.org lui-même
  (`builder/__golden__/edsy.test.js` : 20 builds ouverts dans EDSY, chiffres affichés et attributs modifiés
  identiques), données d'EDSY (`eddb.js`, lu comme une donnée,
  jamais exécuté) ; modifications comptées au maximum de leur grade. Contrôle : sur 10 vaisseaux réels, masse et portée identiques
  à celles du jeu quand l'ingénierie est au maximum (Panther : 1 506 t et 37,84 al).
- **Enregistrer** un build (nommé, éventuellement destiné à un vaisseau précis), le dupliquer, le **partager** :
  texte prêt pour Discord (nom en gras, vaisseau, chiffres clés, lien « EDSY »). Le lien EDSY rouvre exactement
  le même build (test aller-retour sur tous les vaisseaux).
- **Chercher sur Inara** : ouvre la recherche d'équipement d'Inara dans un nouvel onglet, avec tous les modules
  du build et le système où vous êtes. Inara bloque la lecture automatique de sa page : la première fois,
  enregistrez la page « recherche d'équipement » (Ctrl+S, HTML uniquement) et chargez-la avec « Charger la liste
  Inara ». La liste des modules et de leurs numéros est gardée dans `server/data/inara-modules.json`.
- **Comparer** deux configs (builds ou config actuelle), du même vaisseau ou de deux vaisseaux différents (un
  Python Mk II contre un Corsair) : chiffres côte à côte, écarts en vert ou rouge. Même vaisseau : liste des modules
  différents, emplacement par emplacement ; vaisseaux différents : l'équipement de chacun côte à côte. Dans la 2e
  liste, les configs du même vaisseau que la 1re viennent d'abord.
- **Dans Ingénierie → Nouveau plan → Importer un build**, « Un de mes builds » crée le plan : matériaux
  possédés et manquants pour passer de la config actuelle à ce build.
- Pas encore fait : import et export **Coriolis**.

**Noms des vaisseaux** : « Nommer » (Mes vaisseaux, ou le constructeur) donne un nom à un
vaisseau. L'app reconnaît chaque vaisseau à son identifiant du jeu (ShipID) : deux Cutter restent distincts. À côté,
« ⚑ Rôle » donne son rôle (voir « Rôles des vaisseaux »).

### Vérifié contre edsy.org (banc du 15 nov. 2026)

245 builds (5 par vaisseau, 49 vaisseaux : thermique, cinétique, Guardian, survie, exploration) ont été comparés à
edsy.org, environ 85 000 chiffres. 237 concordent en tout. Les 8 autres viennent de deux écarts d'EDSY connus, où
l'app a raison : EDSY donne à la Balle à plasma, rechargée sur ton carburant, la durée d'un seul chargeur ; et il
compte 169 coups au multi-canon Haute capacité G3 (100 × 1,68 arrondi vers le haut) au lieu de 168. Les valeurs
d'edsy.org sont figées dans `server/src/modules/builder/fixtures/banc-edsy.json` (`banc-edsy.test.js`).

- **Énergie des armes.** « Tirage WEP soutenu » (rechargements compris) porte le voyant : orange s'il dépasse la
  recharge du distributeur. « Tirage WEP en rafale » fixe la durée du tir continu. « Soutenabilité WEP » est la part
  du DPS soutenu que le distributeur entretient une fois le condensateur vide, pondérée par le DPS de chaque arme.
- **Munitions.** L'autonomie de chaque arme tient compte du tir ralenti une fois le condensateur WEP vide. Un
  lance-torpilles (chargeur sans réserve) a une autonomie chiffrée. La Balle à plasma se recharge sur ton carburant :
  « carburant », sans fin. Recharge WEP nulle : les armes sur le condensateur affichent « WEP vide ».
- **Renforts de modules.** Ils se cumulent (chacun absorbe sa part de ce que les autres laissent passer), avec leur
  intégrité totale.
- **Rotation** calculée à la masse avec la réserve de carburant ; **portée des capteurs** qui suit Longue portée et
  Grand angle.
- **Import du journal.** Les plans des scanners utilitaires (sillage FSD, mandat, cargaison) ne sont plus pris pour
  ceux des capteurs (le plan est cherché par son nom ET le type du module). Exposing Seeker (plan sans nom Frontier)
  est retrouvé. Une modification ou un effet inconnu est signalé ; un grade est borné au maximum du plan.
- **Règles du jeu.** Le stabilisateur d'armes expérimentales permet 1 (3F) ou 2 (5F) armes expérimentales de plus
  (`unlimit`/`unlimitcount` d'EDSY), dans les limites comme dans le grisé du choix des modules. Un effet interdit
  sur un module (`noexpeffects`) n'est plus proposé ni gardé, et aucun effet ne reste sans modification. Les modules
  retirés du jeu (`hidden`) ne sont plus proposés, mais un vaisseau venu du journal peut toujours en porter.
- **Données de référence.** EDSY est épinglé au commit 0f577f76 (eddb 424029903, la version d'edsy.org le 15 nov.
  2026). Après « Mettre à jour les données », la Soute à extension va jusqu'au G4 : un build enregistré en G5
  s'affiche, se calcule et se partage en G4, sans que le build enregistré soit réécrit. Tant que les données ne sont
  pas à jour, l'onglet Données le signale et les tests de référence liés à la nouvelle version sont ignorés.
