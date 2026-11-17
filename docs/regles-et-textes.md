# Règles de calcul et textes

> Partie de la notice d’Elite Compagnon : sommaire dans le [README](../README.md#documentation).

## Règles de calcul

- **Boucle** : d'un passage à quai avec achats dans le système de départ jusqu'au suivant, après être passé
  par toutes les escales. Tous les achats d'un même passage comptent dans la même boucle ; changer de station
  dans le même système ou de marchandise ne casse pas le suivi.
- **Questions** : à un amarrage dans une autre station d'un système de la route, ou à un gros achat (25 % de
  la soute ou plus) d'une autre marchandise que d'habitude, une pop-up demande si la route doit suivre. « Oui »
  met la route à jour ; « Non, ponctuel » ne redemande plus.
- **Route active** : seule elle enregistre les nouvelles boucles ; le tableau de bord ne compte chaque période
  de jeu qu'une fois, même si plusieurs routes l'ont enregistrée.
- **Gain net** : ventes − achats − carburant − réparations − salaires d'équipage − munitions − rachat.
- **Pause** : boucle de plus de 2× la durée médiane, exclue des moyennes.
- **Érosion** : pente (régression linéaire) des prix de vente sur les 20 dernières boucles normales.
- **Projection** : à la boucle *i*, chaque prix de vente baisse de `érosion × i`, chaque prix d'achat monte
  de sa hausse mesurée (à défaut `érosion × 0,16`). Arrêt dès que l'objectif est atteint ou qu'une boucle
  n'est plus rentable.
- **Portée chargée** : déduite du `MaxJumpRange` du `Loadout`, recalculée avec carburant plein et soute pleine.
  Saisie manuelle possible dans les réglages de la route.
- **Route abîmée dans la base** : la page de la route le dit et propose « Re-détecter la boucle ». Tu peux aussi la
  supprimer depuis Mes routes. Les autres routes continuent d'être suivies.

## Textes français

Le jeu écrit parfois son texte français mal formé. L'app le nettoie dès la lecture du journal et des fichiers
d'état comme `Market.json` (`server/src/core/text.js`, appelé par `journalFiles.js`) : tous les modules reçoivent
des noms propres.

- **Entités HTML** décodées : « Donnez 1&amp;nbsp;000&amp;nbsp;000 CR à la cause » s'affiche « Donnez 1 000 000 CR
  à la cause ». L'espace insécable reste insécable à l'affichage : un nombre ne se coupe pas en fin de ligne. Le
  décodage va jusqu'au bout (`&amp;nbsp;` donne aussi une espace insécable) : nettoyer un texte déjà nettoyé
  ne le change pas, quel que soit le nombre de passages (lecture du journal, module, interface). Le décodage se
  fait en un seul passage, en temps linéaire : 1 Mo de « &amp;amp;… » se décode en quelques millisecondes (l'ancienne
  boucle relisait tout le texte à chaque niveau et bloquait le serveur plusieurs secondes).
- **Clés non traduites** remplacées par un nom lisible : `$TacticalSuit_Class1_Name;` → « Combinaison Dominator ».
  Une clé inconnue donne ses mots (`$iridium_name;` → « Iridium »). Les noms Artemis, « de vol » et Maverick sont
  écrits par le jeu dans tes journaux ; celui de la Dominator est déduit (à vérifier).
- **Espaces** du début et de la fin retirées.
- Seuls les champs traduits (`*_Localised`, `LocalisedName`) changent, jamais les noms internes. Sur tes 49 journaux,
  28 champs changent (6 noms de mission, 4 messages, 18 noms de combinaison) et rien d'autre. Le Coup d'œil nettoie
  aussi les noms de la liste des missions (`Missions`), et rend lisible le nom interne d'une mission sans nom traduit.

**Recherche** : les recherches des repères et des matériaux ignorent les accents, les majuscules, les apostrophes
typographiques et les espaces insécables. « d'extraction » trouve « d’extraction », « cobra mk iii » trouve
« Cobra Mk III » et « etain » trouve « Étain ». Les matériaux se cherchent aussi en anglais (« tin »), et leur nom
anglais s'affiche au survol de la ligne, sous la méthode d'obtention (table FDevIDs `material.csv`, déjà téléchargée).

**Textes à coller dans Discord** (calculateur de routes, « Où agir cette semaine », partage d'une route, d'un repère
ou d'un build, ventes mesurées) : chaque nom venu d'ailleurs passe par `discordName` (`client/src/core/discord.js` et
son jumeau `server/src/core/discord.js`, même code, `discord.test.js` le vérifie). Les noms de station et de système
d'Ardent Insight et de Spansh viennent des relevés d'EDDN, que n'importe qui peut envoyer ; un lien EDSY partagé porte
le nom que son auteur lui a donné. Une station nommée « @everyone [Spansh](https://site-piege/) <@&rôle> » ne
mentionne donc personne et n'affiche aucun lien masqué : « @ » et « < » sont suivis d'une espace sans chasse, « :// »
aussi, la mise en forme est échappée (`\*`, `\[`…), comme les titres et listes en début de nom ; les caractères
invisibles et d'inversion du sens d'écriture sont retirés, et un nom est coupé à 100 caractères. Dans Discord, le nom
se lit tel quel. Tes notes de repère restent telles que tu les as écrites.

**Langue du jeu** : l'app lit `Fileheader.language` au début de chaque journal. Si ce n'est pas `French/FR`, un
bandeau prévient en haut des pages que la lecture d'écran (OCR) et les noms ne sont pas garantis. Rien ne bloque.
`GET /api/journal/language` donne l'état ; l'événement temps réel `journal:language` annonce un changement.

**Tri des marchandises** : `sortCommodities` range comme le marché du jeu, par catégorie puis par nom, dans l'ordre
alphabétique français. Une marchandise sans catégorie va à la fin. Ordre à vérifier en jeu.

Pour les modules : `cleanText` (affichage), `localised(texte traduit, nom interne)`, `foldText` et `matchesSearch`
(recherche), `compareFrench` et `sortCommodities` (tri). Les mêmes fonctions existent dans `client/src/core/text.js`,
et un test vérifie qu'elles donnent les mêmes résultats. Les règles du jeu (langue attendue, forme des clés, entités,
noms des combinaisons, ordre du marché) sont des constantes de `server/src/core/text.js`, avec leur source, leur date
et leur statut (« mesurée » ou « à vérifier »), listées dans `TEXT_RULES`.

Pour plus tard : le nom anglais des marchandises au survol et dans la recherche, et le nom anglais passé aux liens
externes. Il faut la table FDevIDs `commodity.csv`, absente du téléchargement figé : l'ajouter avec son empreinte
dans `server/src/core/reference/download.js`.

### Nom et plateforme du vaisseau

Le nom affiché du vaisseau est celui que le journal donne (`Ship_Localised`, `ShipType_Localised`). Quand le journal ne
l'a pas encore donné (journal commencé en cours de session), l'app prend le nom connu du modèle (`server/src/core/ship.js`,
`nomModele`) : jamais le nom interne (« panthermkii », « lakonminer »). Modèle inconnu de l'app : le nom du journal.

Taille de plateforme (`shipPad`) : grande pour l'Imperial Clipper (« empire_trader » dans le journal) ; moyenne pour le
Type-6, le Keelback et les trois Alliance.
