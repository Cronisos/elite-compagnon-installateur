// Règles du capteur d'escadron, regroupées pour la future « vigie des règles ».
//
// Chaque règle porte sa valeur, son statut, sa source et sa date :
//   - « mesurée »   : vérifiée sur les journaux de référence ;
//   - « publiée »   : lue dans le code ou la documentation d'un tiers (ici surtout le Squadron Tracker) ;
//   - « à vérifier » : reprise de mémoire ou d'une seule observation, à confirmer en jeu.
// Le code utilise les constantes nommées exportées en bas du fichier, jamais une valeur en dur.

import { TOUTES } from '../../regles/index.js';

const rule = (value, status, source, date) => Object.freeze({ value, status, source, date });
/** Règle du jeu reprise du dépôt des règles (une seule fiche pour toute l'app). */
const depot = (nom) => { const f = TOUTES.find((x) => x.nom === nom); return rule(f.valeur, f.statut, f.source, f.date); };

const TRACKER = 'dépôt squadron-tracker, commit 0a61058';
const JOURNAUX = 'journaux de référence, 23 oct.–7 nov. 2026 (60 Statistics, 1 154 PowerplayMerits)';

export const RULES = Object.freeze({
  // --- Contrat de l'API du Squadron Tracker (Worker Cloudflare) ---
  WORKER_PATH: rule('/v1/merits', 'publiée', `${TRACKER}, api/src/index.js (handle)`, '2026-11-07'),
  // Jeton de membre : 32 octets aléatoires en base64url, sans « = » (api newToken, load.py TOKEN_FORMAT)
  TOKEN_FORMAT: rule(/^[A-Za-z0-9_-]{43}$/, 'publiée', `${TRACKER}, load.py TOKEN_FORMAT et api newToken()`, '2026-11-07'),
  // Au-delà : 429 (api MAX_PER_MINUTE, compté par jeton et par minute)
  WORKER_MAX_PER_MINUTE: rule(120, 'publiée', `${TRACKER}, api/src/index.js MAX_PER_MINUTE`, '2026-11-07'),
  // Un gain plus vieux est refusé (400) : inutile de l'envoyer
  WORKER_MAX_AGE_MS: rule(30 * 24 * 3600 * 1000, 'publiée', `${TRACKER}, api/src/index.js MAX_AGE_MS`, '2026-11-07'),
  WORKER_MAX_AHEAD_MS: rule(5 * 60 * 1000, 'publiée', `${TRACKER}, api/src/index.js MAX_AHEAD_MS`, '2026-11-07'),
  WORKER_MAX_MERITS: rule(1_000_000, 'publiée', `${TRACKER}, api/src/index.js MAX_MERITS`, '2026-11-07'),
  // Longueur maximale du nom du commandant et du système (validMerits)
  WORKER_MAX_TEXT: rule(64, 'publiée', `${TRACKER}, api/src/index.js validMerits`, '2026-11-07'),
  WORKER_TIMESTAMP: rule(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, 'publiée', `${TRACKER}, api/src/index.js TIMESTAMP`, '2026-11-07'),
  // Déduplication côté Worker : id = sha256(commandant|heure|mérites), INSERT OR IGNORE. Le plugin EDMC et l'app
  // envoient le même triplet pour une même ligne du journal : un gain envoyé par les deux ne compte qu'une fois.
  // Limite du contrat (le plugin l'a aussi) : deux gains distincts, crédités par le jeu dans la même seconde avec la
  // même valeur, ont le même identifiant et n'en font qu'un (voir SAME_SECOND_SAME_VALUE). Un numéro d'ordre ou
  // TotalMerits dans l'identifiant, côté Worker, lèverait cette limite.
  WORKER_DEDUP: rule('cmdr|at|merits', 'publiée', `${TRACKER}, api/src/index.js postMerits ; test « un renvoi du même événement ne compte qu'une fois »`, '2026-11-07'),
  // Réponses : 200 accepté ; 400 et 413 refus définitif, le gain est écarté (le plugin écarte aussi 401 et 403) ;
  // le reste, nouvel essai
  WORKER_DROP_STATUSES: rule([400, 413], 'publiée', `${TRACKER}, load.py deliver() et api postMerits`, '2026-11-08'),
  WORKER_PAUSE_STATUSES: rule([401], 'publiée', `${TRACKER}, api postMerits (jeton inconnu) ; ici la file attend un nouveau jeton au lieu de jeter le gain`, '2026-11-07'),
  // 403 : jeton valide, mais enregistré pour un autre nom de commandant (seul cas de 403 dans postMerits). Le plugin
  // jette le gain ; ici les gains de ce commandant restent dans la file, sans autre envoi, jusqu'à un nouveau jeton
  // ou « Réessayer maintenant » (nom corrigé côté escadron).
  WORKER_CMDR_STATUSES: rule([403], 'publiée', `${TRACKER}, api/src/index.js postMerits (entry.cmdr ≠ member.cmdr)`, '2026-11-08'),
  RETRY_MS: rule(60_000, 'publiée', `${TRACKER}, load.py RETRY_SECONDS`, '2026-11-07'),

  // --- Règles du jeu : dépôt des règles (server/src/regles/escadron.js) ---
  LIVE_GALAXY_MIN_MAJOR: depot('LIVE_GALAXY_MIN_MAJOR'),
  BETA_MARKERS: depot('BETA_MARKERS'),
  DUPLICATE_SAME_TOTAL: depot('DUPLICATE_SAME_TOTAL'),
  CANCELLED_BY_NEXT: depot('CANCELLED_BY_NEXT'),
  SAME_SECOND_SAME_VALUE: depot('SAME_SECOND_SAME_VALUE'),
  // Passage de semaine Powerplay : dépôt des règles (server/src/regles/powerplay.js)
  POWERPLAY_WEEK_DAY_UTC: depot('WEEK_TICK_DAY_UTC'),
  POWERPLAY_WEEK_HOUR_UTC: depot('WEEK_TICK_HOUR_UTC'),

  // --- Statistics, partie Squadron : dépôt des règles ---
  STATS_CUMULATIVE: depot('STATS_CUMULATIVE'),
  STATS_POWERPLAY_IS_MERITS: depot('STATS_POWERPLAY_IS_MERITS'),
  STATS_MINING_IS_PROFITS: depot('STATS_MINING_IS_PROFITS'),
  STATS_BOUNTY_IS_CREDITS: depot('STATS_BOUNTY_IS_CREDITS'),
});

const v = (name) => RULES[name].value;

export const WORKER_PATH = v('WORKER_PATH');
export const TOKEN_FORMAT = v('TOKEN_FORMAT');
export const WORKER_MAX_PER_MINUTE = v('WORKER_MAX_PER_MINUTE');
export const WORKER_MAX_AGE_MS = v('WORKER_MAX_AGE_MS');
export const WORKER_MAX_AHEAD_MS = v('WORKER_MAX_AHEAD_MS');
export const WORKER_MAX_MERITS = v('WORKER_MAX_MERITS');
export const WORKER_MAX_TEXT = v('WORKER_MAX_TEXT');
export const WORKER_TIMESTAMP = v('WORKER_TIMESTAMP');
export const WORKER_DROP_STATUSES = new Set(v('WORKER_DROP_STATUSES'));
export const WORKER_PAUSE_STATUSES = new Set(v('WORKER_PAUSE_STATUSES'));
export const WORKER_CMDR_STATUSES = new Set(v('WORKER_CMDR_STATUSES'));
export const RETRY_MS = v('RETRY_MS');
export const LIVE_GALAXY_MIN_MAJOR = v('LIVE_GALAXY_MIN_MAJOR');
export const BETA_MARKERS = v('BETA_MARKERS');
export const DUPLICATE_SAME_TOTAL = v('DUPLICATE_SAME_TOTAL');
export const CANCELLED_BY_NEXT = v('CANCELLED_BY_NEXT');
export const POWERPLAY_WEEK_DAY_UTC = v('POWERPLAY_WEEK_DAY_UTC');
export const POWERPLAY_WEEK_HOUR_UTC = v('POWERPLAY_WEEK_HOUR_UTC');

// --- Choix de l'app (pas des règles du jeu) ---
/** Écart entre deux envois : 100 par minute au plus, sous la limite du Worker. */
export const SEND_GAP_MS = Math.ceil(60_000 / (WORKER_MAX_PER_MINUTE - 20));
/** Un gain trop proche de la limite d'âge serait refusé pendant son trajet : marge d'une heure. */
export const AGE_MARGIN_MS = 3600 * 1000;
/** Délai d'attente d'une réponse du Worker. */
export const REQUEST_TIMEOUT_MS = 15_000;
/** Taille maximale de la file d'attente (le plugin s'arrête à 200 ; ici le rattrapage peut en demander plus). */
export const MAX_QUEUE = 5000;
