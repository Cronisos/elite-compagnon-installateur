// Recherches en ligne automatiques de Mes repères (server/data/waypoints-online.json) : rien ne part du PC sans le
// choix du joueur. Activées, la prospection demande d'elle-même à Spansh les planètes à EEP du système où tu es (à
// chaque nouveau système), et les prix des minerais du système sont demandés à Ardent (bulle « où vendre », Top 10
// « Ce système ») ; Spansh et Ardent voient alors ton adresse IP et la suite de tes systèmes. Coupées (par défaut),
// rien ne part sans un clic sur « Charger depuis Spansh » ou « Charger les prix d'Ardent ».
//
// `asked` : le choix a été fait (la page ne le propose plus). Fichier illisible : mis de côté, et retour au défaut
// (coupé), jamais l'inverse.

import { isPlainObject, readJsonFile, writeJsonAtomicSync } from '../../core/atomic.js';

export const ONLINE_FILE = 'waypoints-online.json';

/** Réglage propre : seul un vrai `true` active ; tout le reste vaut « coupé, pas encore choisi ». */
export function cleanOnline(v) {
  const s = isPlainObject(v) ? v : {};
  const yes = (k) => Object.hasOwn(s, k) && s[k] === true;
  const at = Object.hasOwn(s, 'at') && typeof s.at === 'string' && Number.isFinite(Date.parse(s.at)) ? s.at : null;
  return { auto: yes('auto'), asked: yes('asked') || yes('auto'), at };
}

export class OnlineSetting {
  /** @param {string} file chemin du fichier (server/data, ou un dossier temporaire pour les tests) */
  constructor(file) {
    this.file = file;
    this.state = cleanOnline(readJsonFile(file, { fallback: {}, accept: isPlainObject, label: 'Recherches en ligne de Mes repères' }));
  }

  get auto() {
    return this.state.auto;
  }

  view() {
    return { ...this.state };
  }

  /** Choix du joueur (oui ou non) : enregistré d'un coup ; un fichier impossible à écrire laisse l'ancien choix. */
  choose(auto, now = new Date()) {
    if (typeof auto !== 'boolean') throw Object.assign(new Error('Choix attendu : oui (true) ou non (false).'), { status: 400, publicMessage: 'Choix attendu : oui (true) ou non (false).' });
    const next = { auto, asked: true, at: now.toISOString() };
    writeJsonAtomicSync(this.file, next);
    this.state = next;
    return this.view();
  }
}
