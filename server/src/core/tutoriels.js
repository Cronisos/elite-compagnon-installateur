// Tutoriels interactifs de l'interface : ce que le joueur a déjà vu, et s'il veut qu'ils se lancent d'eux-mêmes à la
// première visite d'une page. Gardé sur ce PC (tutoriels.json, dans le dossier des données), jamais envoyé nulle part.
// Le contenu des tutoriels est dans l'interface (client/src/core/tutoriel/parcours.js) : le serveur ne retient que des
// identifiants.

import { isPlainObject, readJsonFile, writeJsonAtomicSync } from './atomic.js';

export const FICHIER_TUTORIELS = 'tutoriels.json';
const ID = /^[a-z0-9-]{1,40}$/;
const MAX_VUS = 300;

export class Tutoriels {
  /** `force` : faux pour ne jamais les lancer d'eux-mêmes, quoi que dise le fichier (banc de contrôle, ELITE_SANS_TUTORIEL=1). */
  constructor({ fichier, force = true }) {
    this.fichier = fichier;
    this.force = force;
    const lu = readJsonFile(fichier, { fallback: {}, accept: isPlainObject });
    this.actifs = lu.actifs !== false;
    this.vus = new Set((Array.isArray(lu.vus) ? lu.vus : []).filter((id) => typeof id === 'string' && ID.test(id)).slice(0, MAX_VUS));
  }

  /** { actifs, vus } : lancement à la première visite, identifiants des tutoriels déjà vus (ou passés). */
  etat() {
    return { actifs: this.actifs && this.force, vus: [...this.vus].sort() };
  }

  enregistrer() {
    writeJsonAtomicSync(this.fichier, { actifs: this.actifs, vus: [...this.vus].sort() });
  }

  /**
   * Change l'état : { actifs?: booléen, vu?: { id, vu: booléen }, vus?: [id…], reinitialiser?: true }. Lève une erreur (status 400)
   * sur une demande mal formée. Rend le nouvel état.
   */
  regler(demande) {
    const refus = (message) => Object.assign(new Error(message), { status: 400, publicMessage: message });
    if (!isPlainObject(demande)) throw refus('Demande illisible.');
    if (demande.actifs !== undefined) {
      if (typeof demande.actifs !== 'boolean') throw refus('« actifs » attend vrai ou faux.');
      this.actifs = demande.actifs;
    }
    if (demande.reinitialiser === true) this.vus.clear();
    // « Passer tous les tutoriels » : la liste de leurs identifiants, tous marqués vus
    if (demande.vus !== undefined) {
      if (!Array.isArray(demande.vus) || demande.vus.length > MAX_VUS || demande.vus.some((id) => typeof id !== 'string' || !ID.test(id))) throw refus('Liste de tutoriels illisible.');
      for (const id of demande.vus) if (this.vus.size < MAX_VUS) this.vus.add(id);
    }
    if (demande.vu !== undefined) {
      const { id, vu } = isPlainObject(demande.vu) ? demande.vu : {};
      if (typeof id !== 'string' || !ID.test(id) || typeof vu !== 'boolean') throw refus('Tutoriel inconnu.');
      if (!vu) this.vus.delete(id);
      else if (this.vus.size < MAX_VUS) this.vus.add(id);
    }
    this.enregistrer();
    return this.etat();
  }
}
