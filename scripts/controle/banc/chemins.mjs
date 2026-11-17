// Dossiers du banc de contrôle (le code du projet ; les dossiers temporaires sont créés à chaque lancement).

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONTROLE = fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]$/, '');
export const RACINE = path.resolve(CONTROLE, '..', '..');
export const SERVEUR = path.join(RACINE, 'server');
export const CLIENT = path.join(RACINE, 'client');
export const ETAPES = path.join(CONTROLE, 'etapes');
export const SEANCES = path.join(CONTROLE, 'seances');
export const ATTENDU = path.join(CONTROLE, 'attendu');
/** Dossier d'options du jeu de test (Bindings, Graphics), copié pour chaque serveur isolé. */
export const OPTIONS = path.join(CONTROLE, 'options');
/** Données de référence copiées dans le dossier de données temporaire. */
export const REFERENCE = path.join(SERVEUR, 'data', 'reference');
/** Préchargement du serveur isolé : horloge, aléa et langue figés. */
export const FIGER = path.join(CONTROLE, 'banc', 'figer.mjs');
