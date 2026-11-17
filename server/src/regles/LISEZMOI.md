# Dépôt des règles du jeu

Toutes les règles d'Elite Dangerous dont l'app se sert vivent ici, et seulement ici : une **fiche** par règle, un
**fichier par domaine**. Les modules lisent leurs valeurs dans ce dossier, et ne les recopient jamais. Le format est
défini dans `fiche.js`, et la liste des domaines dans `index.js`.

| Fichier | Domaine |
|---|---|
| `powerplay.js` | semaine, prise et paliers, mérites et points, zones de conflit, ventes de marchandises |
| `ingenierie.js` (+ dossier `ingenierie/`) | applications et rangs (`rankRules.js`, modèle `rankModel.js`, séquences `rankSequences.json`), itinéraire (`itineraryRules.js`) : on écrit dans le dossier, `ingenierie.js` ne fait que les présenter en fiches |
| `supercroisiere.js` | indicateur et refroidissement du SCO |
| `rachat.js` | taux du rachat, coût payé, options de résurrection, prix de la soute |
| `objectifs.js` | objectifs communautaires : tranches, récompenses, paliers |
| `foreuses.js` | foreuses du Rhino : nombre, vidanges, écarts, rayon |
| `escadron.js` | galaxie Live, lignes de mérites réécrites ou annulées, statistiques d'escadron |
| `textes.js` | langue du jeu, clés brutes, entités, noms des combinaisons, tri du marché |
| `colonisation.js` | invariants du dépôt de construction (vérifiés à chaque lecture) |
| `echangeurs.js` | taux des échangeurs de matériaux : monter, descendre d'un grade, changer de catégorie (mesurés sur 127 échanges) |
| `saut.js` | étoiles récupérables, consommation du FSD (exposants, Mk II), marge et sauts couverts de l'alerte de carburant de l'itinéraire |

Pas encore ici : l'historique des mises à jour du jeu et leurs modificateurs de mérites (`modules/expansion/rates.js`),
les formats des fichiers de commandes (`modules/bindings/rules.js`), et le lien entre les fiches en français du module
Règles (`modules/regles/regles.json`) et les fiches du dépôt.

## Une fiche

```js
{
  id: 'powerplay.prise.points',        // domaine.sujet.detail : stable, c'est par lui qu'on la retrouve
  nom: 'ACQUISITION_POINTS',           // nom de la constante dans le code
  titre: 'Points de contrôle pour 1,0 de progression de prise',
  valeur: 120_000,
  unite: 'points de contrôle pour 1,0 de prise',
  statut: 'mesurée',                   // mesurée, publiée, déduite, à vérifier, inconnue
  date: '2026-11-01',                  // date de la dernière vérification
  source: 'journaux de référence : …',       // d'où vient la valeur (mesure, page lue, observation)
  controle: 'à remesurer',             // auto (la vigie la mesure), à remesurer, manuel
}
```

## Changer une règle

1. Trouver la fiche, par son id, son nom de constante ou un mot du titre : `grep -rn "120_000\|ACQUISITION_POINTS" server/src/regles`.
2. Changer `valeur`, puis mettre à jour `statut`, `date` et `source`. On ne garde jamais une ancienne source fausse.
3. `npm test -w server` : `regles.test.js` refuse une fiche incomplète, un identifiant ou un nom en double, et une
   constante qui ne vaut plus sa fiche.
4. `npm run controle` : le rejeu montre ce que le changement fait aux résultats de l'app, séance par séance.

Les noms de constantes ne changent pas : le code qui les utilise reste tel quel. Une règle n'est jamais écrite en dur
dans un module ; si on en trouve une, on lui fait une fiche ici, et le module l'importe.

## Ce qui n'est pas une règle du jeu

- Les réglages de l'app (délais d'affichage, tailles de file, limites de sécurité) restent dans leur module.
- Les contrats d'outils tiers (le Worker du Squadron Tracker) restent dans leur module.
- Les mesures faites sur l'historique du joueur (ratios mérites / crédits, rangs d'ingénieur relevés) ne sont pas des
  fiches : ce sont des **observations**, que la vigie compare aux fiches.
