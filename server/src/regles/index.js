// Dépôt des règles du jeu : toutes les fiches de tous les domaines, pour la vigie des règles et sa page.
// Chaque domaine est un fichier de ce dossier ; un domaine ajouté s'inscrit ici. Voir LISEZMOI.md.

import { POWERPLAY } from './powerplay.js';
import { SUPERCROISIERE } from './supercroisiere.js';
import { RACHAT } from './rachat.js';
import { INGENIERIE } from './ingenierie.js';
import { OBJECTIFS } from './objectifs.js';
import { FOREUSES } from './foreuses.js';
import { ESCADRON } from './escadron.js';
import { TEXTES } from './textes.js';
import { COLONISATION } from './colonisation.js';
import { SAUT } from './saut.js';
import { ECHANGEURS } from './echangeurs.js';

/** Domaines, dans l'ordre d'affichage. */
export const DOMAINES = Object.freeze([POWERPLAY, INGENIERIE, SUPERCROISIERE, RACHAT, OBJECTIFS, FOREUSES, ESCADRON, TEXTES, COLONISATION, SAUT, ECHANGEURS]);

/** Toutes les fiches. */
export const TOUTES = Object.freeze(DOMAINES.flatMap((d) => d.fiches));

const parId = new Map(TOUTES.map((f) => [f.id, f]));
if (parId.size !== TOUTES.length) throw new Error('Dépôt des règles : un identifiant est en double entre deux domaines.');

/** Fiche d'un identifiant (« powerplay.prise.points »), ou null. */
export const fiche = (id) => (typeof id === 'string' && parId.has(id) ? parId.get(id) : null);
