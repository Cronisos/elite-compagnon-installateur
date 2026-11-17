// Règles du jeu sur les profils de commandes, regroupées ici avec leur source et leur date.
// Chaque valeur est marquée :
//   « mesurée »    : relevée sur les fichiers du joueur (PC de l’auteur) ;
//   « publiée »    : écrite par Frontier ou décrite par des joueurs dans une source datée ;
//   « à vérifier » : supposée, à confirmer en jeu.
// La future « vigie des règles » les comparera à ce que le jeu fait réellement.

import { GAME_OPTIONS_SUBDIR } from '../../core/paths.js';

/**
 * Dossier des profils de commandes, sous %LOCALAPPDATA% (dossier Options du jeu : core/paths.js, seul endroit des dossiers).
 * mesurée, 7 nov. 2026 : C:\Users\<toi>\AppData\Local\Frontier Developments\Elite Dangerous\Options\Bindings.
 * publiée : même dossier cité dans le fil Steam « controls reset » du 18-26 août 2024
 * (https://steamcommunity.com/app/359320/discussions/8/6015206719892832998/).
 */
export const BINDINGS_SUBDIR = [...GAME_OPTIONS_SUBDIR, 'Bindings'];

/**
 * Rapport d'erreurs que le jeu écrit en chargeant les commandes.
 * mesurée, 7 nov. 2026 : réécrit à chaque lancement qui a des erreurs (21:36 puis 22:13, même contenu).
 * à vérifier : ce que devient le fichier à un lancement sans erreur (vidé, supprimé ou laissé tel quel ?).
 * L'app sait traiter les trois cas : seul un fichier écrit pendant le lancement en cours compte.
 */
export const ERROR_LOG = 'BindingLoadingErrors.log';

/**
 * Lignes du rapport, reconnues par leur texte anglais (le jeu ne le traduit pas).
 *   presetErrors   : mesurée, 7 nov. 2026, « There where errors when loading preset file: Custom.4.2.binds »
 *                    (« where » est la faute du jeu, gardée telle quelle). En tête du rapport.
 *   missingDevices : mesurée, 7 nov. 2026, « Missing devices: SaitekX52 » ; publiée, fil Steam du 18-26 août 2024,
 *                    « Missing devices: ArduinoLeonardo ». La manette manque : le profil est ignoré.
 *   duplicate      : mesurée, 7 nov. 2026, « There are multiple entries of binding "MouseGUI" Only the first will be
 *                    used ». Sans gravité : le jeu garde la première et charge le profil.
 */
export const LOG_LINES = {
  presetErrors: /errors when loading preset file:\s*(.+?)\s*$/i,
  missingDevices: /^\s*Missing devices:\s*(.*?)\s*$/i,
  duplicate: /multiple entries of binding\s+"([^"]+)"/i,
};

/**
 * Séparateur entre plusieurs manettes manquantes sur la ligne « Missing devices: ».
 * à vérifier : seul le cas d'une manette a été vu (7 nov. 2026, et août 2024 sur Steam). Les identifiants de
 * manette du jeu n'ont pas d'espace (SaitekX52, ArduinoLeonardo) : virgule, point-virgule ou espace séparent.
 */
export const MISSING_DEVICES_SEPARATOR = /[\s,;]+/;

/**
 * Délai entre le lancement du jeu (Fileheader du journal) et l'écriture du rapport.
 * mesurée, 7 nov. 2026 : Fileheader à 21:13:43 UTC, rapport écrit à 21:13:47,8, LoadGame à 21:15:18.
 * Le rapport compte pour un lancement s'il date au plus de LAUNCH_TOLERANCE_MS avant son Fileheader
 * (à vérifier : marge prise si le jeu lisait un jour ses commandes avant d'ouvrir son journal), et jamais
 * d'avant la fermeture du lancement précédent.
 */
export const LAUNCH_TOLERANCE_MS = 60_000;

/**
 * Un Fileheader marque un lancement seulement en partie 1.
 * publiée : manuel du journal de Frontier, Journal Manual v30, chapitre « File Format » : « If the play session goes on
 * a long time, and the journal gets very large, the file will be closed and a new file started with an increased part
 * number » (https://hosting.zaonce.net/community/journal/v30/Journal_Manual_v30.pdf ; texte repris sur
 * https://elite-journal.readthedocs.io/en/latest/File%20Format.html, consulté le 8 nov. 2026).
 * mesurée, 7 nov. 2026 : « "part":1 » à chacun des 4 lancements de la journée.
 */
export const LAUNCH_PART = 1;

/**
 * Valeurs de Device= dans un .binds qui ne sont pas des manettes à brancher.
 * mesurée, 7 nov. 2026, Custom.4.2.binds : Keyboard (137), Mouse (14), {NoDevice} (483), SaitekX52 (142).
 */
export const BUILTIN_DEVICES = new Set(['Keyboard', 'Mouse', '{NoDevice}']);

/**
 * Profil personnel : <nom>.<majeur>.<mineur>.binds.
 * mesurée, 7 nov. 2026 : Custom.4.2.binds, racine <Root PresetName="Custom" MajorVersion="4" MinorVersion="2">.
 */
export const BINDS_FILE = /^(.+)\.(\d+)\.(\d+)\.binds$/i;

/**
 * Sauvegarde écrite par le jeu : <profil>.binds.<nombre>.backup.
 * mesurée, 7 nov. 2026 : Custom.4.2.binds.1451070215.backup, écrite à la même milliseconde que le rapport
 * (22:13:47,829), identique octet pour octet à Custom.4.2.binds. Le nombre n'est ni une date ni un CRC32 du
 * fichier : signification inconnue. Il était le même aux lancements de 21:36 et de 22:13 (un seul fichier).
 */
export const BACKUP_FILE = /^(.+\.binds)\.(\d+)\.backup$/i;

/**
 * Profils choisis au démarrage : StartPreset.start (une ligne) ou StartPreset.4.start (Odyssey, quatre lignes).
 * mesurée, 6 nov. 2026 : StartPreset.4.start = « Custom / Custom / Custom / SaitekX52 ».
 * à vérifier : l'ordre des quatre lignes (commandes générales, vaisseau, SRV, à pied) est supposé, sans source
 * vérifiée (recherche du 8 nov. 2026 sans résultat). À confirmer en jeu : Options > Commandes, le profil affiché dans
 * chaque catégorie, comparé à la ligne correspondante du fichier.
 */
export const START_PRESET_FILE = /^StartPreset(?:\.(\d+))?\.start$/i;
export const START_PRESET_CATEGORIES = ['Commandes générales', 'Vaisseau', 'SRV', 'À pied'];

/**
 * Jeu sans nouvelles : un lancement sans Shutdown est tenu pour terminé quand rien n'a bougé depuis GAME_SILENT_MS
 * (ni le journal actif, ni Status.json, ni un événement lu en direct). Sans cette règle, l'app croirait le jeu lancé
 * et ouvrirait la fenêtre en jeu par-dessus le bureau.
 * mesurée, 23 oct.-7 nov. 2026 : 9 journaux sur 49 finissent sans Shutdown, dont le dernier,
 *   Journal.2026-11-07T221347.01.log (dernier événement 21:21:42 UTC, fichier daté de 21:21:41,7 : la date du
 *   fichier suit bien le dernier événement).
 * mesurée, même période : 58 silences de plus de 10 min dans le journal en pleine partie (jusqu'à 4 h 40) : la fenêtre
 *   en jeu peut se fermer pendant un moment calme ; elle se rouvre au prochain signe de vie si elle n'a pas été fermée.
 * à vérifier : 10 min, comme la pause des chronos de session (server/src/core/activity.js, IDLE_MS).
 */
export const GAME_SILENT_MS = 10 * 60_000;
