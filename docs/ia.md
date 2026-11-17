# IA de bord (Alicia)

> Partie de la notice d’Elite Compagnon : sommaire dans le [README](../README.md#documentation).

## Module « IA de bord » : Alicia (facultatif)

Une IA qui tourne **sur ton PC** répond à tes questions sur ta partie. Elle porte le nom et l'avatar réglés dans le
Compagnon (« Alicia » par défaut, aussi si le Compagnon est absent) : « il me reste combien de place en soute ? »,
« ma dernière session de minage, ça a donné quoi ? ». Elle lit tes données dans l'app (jamais ailleurs) et répond
dans la fenêtre principale et dans la bulle du Copilote, avec son avatar. Rien ne part sur internet.

**Coupée par défaut** : à allumer sur sa page (« Allumer l'IA »). Il faut Ollama sur le PC et une carte graphique avec
au moins 8 Go de mémoire vidéo pour le modèle léger. Coupée, elle n'interroge pas Ollama du tout : aucun modèle
chargé, aucune question envoyée, aucune liste demandée. Un choix déjà enregistré (`ia.json`) est gardé.

- **Où lui parler** : Outils › Alicia (adresse `/ia` : la discussion en grand, l'état, les réglages), ou le bouton
  à son nom en bas à droite de toutes les pages de la fenêtre principale, qui ouvre un volet de discussion sans
  quitter la page (Échap le ferme). Entrée envoie, Maj+Entrée va à la ligne.
- **En jeu** : sa fenêtre (« Afficher la fenêtre en jeu » sur sa page ; choix gardé) montre son état (prête,
  réfléchit, modèle chargé), ta dernière question, sa réponse, et une zone pour écrire : passe en mode souris
  (Alt+Maj+K), clique dedans, Entrée. Sa réponse s'affiche aussi dans la bulle du Compagnon.
- **À voix haute** (allumé par défaut) : le Compagnon dit ses réponses avec la **voix naturelle** 4 par défaut, ou une
  voix de Windows (Julie, Hortense, Paul… au choix, bouton « Essayer »). L'overlay est lancé
  avec `autoplay-policy=no-user-gesture-required` : sinon Chromium bloque la voix d'une fenêtre où l'on n'a pas
  cliqué. Code de la voix partagé dans `client/src/core/voix.js` (le Compagnon et la page de l'IA s'en servent).
  - **Voix naturelle** (`parole.js`) : [Supertonic 3](https://huggingface.co/Supertone/supertonic-3) (licence
    OpenRAIL-M), lancé par `sherpa-onnx-offline-tts.exe` de [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)
    (Apache-2.0), **sur le processeur**, rien ne sort du PC. Dix voix : 0 à 4 femmes, 5 à 9 hommes. ~2 s de calcul
    pour 10 s de parole (8 étapes ; 16 doublent le temps sans gain net, essais du 12 nov. 2026). Le son est fait
    avant la bulle (les deux partent ensemble), gardé en mémoire 5 min (`GET voix/:id`, 5 au plus), joué par la
    fenêtre en jeu au volume réglé ; la hauteur ne s'y règle pas. Le texte est préparé : nombres et unités du jeu en
    toutes lettres (« 58 t » → « cinquante-huit tonnes », « 200k Cr » → « deux cent mille crédits »), émojis et mise
    en forme retirés. Le programme lit sa ligne de commande dans la page de code de Windows (1252), pas en UTF-8 : le
    texte lui est passé en octets UTF-8 écrits en 1252 (`argumentTexte`) ; si le programme signale un texte mal
    encodé (autre page de code), ou s'il manque ou échoue, la voix de Windows prend le relais. Installé à part dans
    `%LOCALAPPDATA%\Programs\sherpa-onnx` : le dossier `sherpa-onnx-v…-win-x64-…` de la version Windows (`bin\`) et
    `modeles\sherpa-onnx-supertonic-3-tts-int8-…` (le plus récent est pris). Kokoro, essayé d'abord, ne parle plus
    français dans sherpa-onnx 2.0 (plus d'espeak-ng, lexiques anglais et chinois seulement).
- **Lui parler au micro** : Alt+Maj+V (ou 🎤 dans sa fenêtre en jeu), tu parles, Alt+Maj+V encore pour finir (60 s au
  plus). Ta voix est transcrite par [Whisper](https://github.com/ggml-org/whisper.cpp) **sur le processeur** (aucune
  mémoire vidéo prise au jeu ni à l'IA), puis posée comme une question écrite. Installé à part dans
  `%LOCALAPPDATA%\Programs\whisper-cpp` : `bin\Release\whisper-cli.exe` (version Windows de whisper.cpp) et deux
  modèles dans `modeles\` : « rapide », `ggml-small-q5_1.bin` (190 Mo, ~1,5 s pour 5 s de parole, par défaut) et
  « précis », `ggml-large-v3-turbo-q5_0.bin` (570 Mo, ~5 s) ; mesuré le 12 nov. 2026 sur un i9-14900KF, mêmes mots
  compris. Chemins réglables ; le serveur ne lance jamais d'autre programme qu'un `whisper…exe`. Le micro n'est
  permis qu'à la fenêtre en jeu de l'IA, et seulement le son (`overlay/main.js`, `microPermis`) : toutes les autres
  pages de l'overlay n'ont toujours aucune permission.
- **Sa personnalité** (sur sa page) : son nom (celui du Compagnon), un texte libre qui décrit son caractère et sa
  façon de parler (comme une « skill » : donné au modèle avec sa consigne, après ses règles de base, qui restent
  prioritaires), la longueur de ses réponses (courtes, normales, détaillées), sa voix, sa vitesse, sa hauteur (voix de
  Windows seulement) et son volume (60 % par défaut : à 100 %, bien trop fort).
- **Elle se sert de l'app** (`actions.js`) : « guide-moi là où j'ai miné l'iridium, emplacement 25, 3 forages »,
  « lance le minage Rhino », « cache l'interface », « ouvre les ingénieurs » : elle le fait, comme si tu avais cliqué,
  puis dit ce qu'elle a fait. Six outils, par la même API que l'interface : `chercher_reperes` (mots libres, fautes
  de frappe des repères comprises, numéro d'emplacement ou nombre de forages ; les mots qui ne ressemblent à rien,
  comme « ELP » pour « emplacement » au micro, ne comptent pas), `guider_vers_repere` (boussole ; ouvre le Minage
  Rhino s'il ne l'est pas, réaffiche l'interface cachée), `arreter_guidage`, `changer_mode` (comme le menu « Mode
  de jeu », Coup d'œil gardé), `interface` (cacher / afficher, comme le ◆), `ouvrir_page` (les pages du plan de
  l'interface, `client/src/core/navigation.js`, lu au démarrage). Rien qui efface, rien qui touche au jeu : seulement
  ce qu'un clic dans l'app ferait, et qu'un clic défait.
- **Ce qu'elle sait du jeu** : la synthèse de l'état du jeu (voir « Synthèse de l'état du jeu ») lui est donnée à
  chaque question (en direct : où tu es, boucliers, énergie, carburant du véhicule où tu es…), et sept outils en
  lisent le détail : `etat_direct`, `position_detaillee`, `marche_station`, `materiaux`, `missions_en_cours`,
  `rangs_et_ingenieurs`, `casier_et_sac`.
- **La vue du jeu** (coupée par défaut, page d'Alicia › Vue du jeu) : elle peut regarder **la fenêtre d'Elite
  Dangerous, et rien d'autre** (`overlay/vision.js`). La liste des fenêtres est lue sans aucune vignette ; la source
  retenue doit être la fenêtre principale du processus `EliteDangerous64` (numéro lu dans Windows) et porter le titre
  du jeu ; seul son flux vidéo est ouvert, dans une fenêtre cachée à part, sans réseau, qui n'a droit qu'à ce flux ;
  aucune source « écran » n'est jamais demandée (un test le vérifie). Les fenêtres de l'app posées sur le jeu n'y sont
  pas. Images en mémoire seulement, jamais enregistrées ni envoyées ailleurs ; flux fermé après 60 s sans demande, et
  tout de suite quand la vue est coupée. L'overlay demande à l'app toutes les secondes (`GET vision`) s'il y a une
  photo à prendre ; coupée, toutes les 5 s, sans image.
  - **« Qu'est-ce que tu vois ? »** : outil `regarder_ecran` (proposé au modèle seulement si la vue est allumée) :
    une image (1 280 pixels de large), lue par le modèle déjà chargé (les trois lisent les images) : ~5 s une fois
    chargé (12 nov. 2026, à quai : lieu, menu, heure, statut lus ; petits textes parfois écorchés).
  - **Jauge des boucliers** : le jeu ne donne nulle part leur pourcentage. Un cadre en jeu (« Régler la jauge en jeu »)
    se pose sur l'hologramme du vaisseau ; on note une image boucliers tombés, puis une pleins : les pixels qui
    s'allument en plus forment les anneaux (`overlay/bouclier.js`). Ensuite, toutes les secondes, un petit carré du
    jeu (80 ms) donne la part des anneaux allumée ; seul le pourcentage part à l'app (`POST /api/etat-jeu/boucliers`),
    gardé 20 s. Approximatif ; il faut le jeu en plein écran fenêtré, et ne pas tourner la tête.
- **Le modèle** : il tourne dans [Ollama](https://ollama.com) (installé à part, il se lance avec Windows). Trois
  modèles : un grand (`qwen3.8:27b`, 17,4 Go de mémoire vidéo), pour hors jeu ; un intermédiaire (`qwen3.6:35b-a3b`,
  « à experts », 22,6 Go), pour le jeu ; un léger (`qwen3.5:9b`, 6,1 Go), en secours. Pour les installer :
  `ollama pull <nom>`. Les noms se changent dans les réglages.
- **Le jeu passe d'abord** : avant chaque question, le grand s'il tient **entièrement** sur la carte en laissant la
  marge (1 Go) ; sinon l'intermédiaire, entier ou **réparti entre la carte et le processeur**, sans jamais toucher à la
  mémoire laissée au jeu (2,5 Go) et avec au moins la moitié de ses couches sur la carte ; sinon le léger ; sinon pas
  de réponse, avec l'explication. La version utilisée est notée sous la réponse. Mesuré le 12 nov. 2026, jeu lancé
  (Elite : 6 à 8,5 Go) : le grand ne passe pas (en partie sur la carte : 1 à 3 min par question) ; l'intermédiaire,
  13,7 Go sur la carte, répond en ~3 s (28 s pour la première, le temps de le charger) ; le léger en 6 à 12 s.
  **Ollama ne voit pas la mémoire prise par le jeu** (il s'est cru à 21 Go libres pour 14 réels et a fait ramer le
  jeu) : le nombre de couches mises sur la carte est toujours calculé par l'app et imposé (`num_gpu`). Un seul de
  ces modèles est chargé à la fois.
  Un modèle chargé n'est jamais chassé par Windows pour faire de la place au jeu : l'app surveille la mémoire libre
  toutes les 5 s tant qu'un modèle peut être chargé, et le décharge tout de suite si elle passe sous la marge. Après
  20 min sans question (réglable), le modèle se décharge de lui-même (la première question suivante prend ~15 s). Bouton
  « Rendre la mémoire vidéo maintenant ». Sans carte NVIDIA (mémoire libre illisible) : le léger seulement.
- **La fiche** (`server/src/modules/ia/fiche.js`) : à chaque question, l'app lui donne d'office une fiche courte de
  ta partie, en phrases avec leurs unités : crédits, Powerplay (rang, mérites), système (niveau, points, renfort, sape,
  érosion prévue), position, vaisseau (soute utilisée et libre, réservoir, saut, coque, boucliers, modules abîmés),
  combat, dernière session de minage au Rhino et en vaisseau, flotte, rappels, et ce que l'app ne sait pas (carburant
  du SRV…). Placée juste avant la question, pour que le début de la conversation reste en cache. Sans elle, les
  petits modèles allaient mal chercher (12 nov. 2026 : « je n'ai pas les détails de ton minage », « blindage 85 % »,
  une réponse sur deux inventée) ; avec elle : 5 questions sur 5 justes, en 3 à 4 s, en jeu. Une réponse avec des
  chiffres sans fiche ni outil lu est relancée une fois, puis marquée « chiffres non vérifiés ».
- **Ses outils** (`server/src/modules/ia/outils.js`) : résumé du commandant, vaisseau actuel, soute, flotte, minage
  Rhino, minage en vaisseau, combat, Powerplay ici, route. Chaque description dit aussi ce que l'outil ne sait pas
  (rien sur le carburant du Rhino, par exemple) : sans ça, un modèle répond avec le réservoir du vaisseau. Pour qu'il
  se serve d'une nouvelle fonction de l'app : un outil de plus dans ce fichier, rien ailleurs.
- **La conversation** est gardée (60 derniers messages, `server/data/ia-historique.json`) ; les 12 derniers lui sont
  redonnés à chaque question. « Oublier la conversation » efface tout.

**Facultatif** : le module n'est chargé que si son dossier est là (`OPTIONNELS` dans `server/src/modules/index.js`,
`import.meta.glob` dans `client/src/modules/index.js`) ; son entrée du menu porte `module: 'ia'` et disparaît sans lui
(`core/navigation.js`). Aucun autre module n'en dépend : la version escadron est construite sans les dossiers
`server/src/modules/ia/` et `client/src/modules/ia/`, et tout le reste est le même code.

Fichiers : `server/src/modules/ia/` (`memoire.js` mémoire vidéo et choix du modèle, `ollama.js` client d'Ollama,
`outils.js`, `actions.js` ce qu'elle fait dans l'app, `conversation.js` consigne et bulle, `parole.js` voix naturelle, `reglages.js`) et `client/src/modules/ia/` (page, volet,
discussion). API sous `/api/modules/ia/` : `GET etat`, `GET historique`, `POST question` (`{ texte }`),
`POST oublier`, `POST decharger`, `PUT reglages` (`actif`, `grand`, `moyen`, `leger`, `margeMo`, `margeJeuMo`,
`garderSec`, `fenetre`, `voix`, `voixNom` (`naturelle:0` à `naturelle:9`, ou nom d'une voix de Windows), `voixVitesse`,
`voixHauteur`, `voixVolume`, `personnalite`, `longueur`, `ecoute`, `modeleEcoute`,
`whisperExe`, `whisperModele`, `langueEcoute`) ; `POST ecoute` (WAV 16 kHz mono → `{ texte }`) ;
`POST voix/essai` (`{ texte, voixNom, vitesse }` → `{ audio }`), `GET voix/:id` (son WAV de la voix naturelle) ; temps
réel : `ia:etat`, `ia:message`, `ia:oubli`.
