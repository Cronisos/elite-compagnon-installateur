// Raccourcis clavier globaux de l'app, valables même en jeu (c'est l'overlay qui les prend auprès de Windows :
// overlay/main.js). Le joueur les règle dans Paramètres : la touche de chaque action des fenêtres en jeu (souris,
// cacher et afficher, déplacer…), et ses propres raccourcis vers des pages de l'app (« Mes vaisseaux »…).
// Gardé sur ce PC (raccourcis.json). L'overlay relit ce réglage à son lancement et à chaque changement, et le
// revérifie de son côté (overlay/raccourcis.js) : les deux fichiers doivent s'accorder sur les actions et leurs
// touches par défaut (vérifié par raccourcis.test.js).

import { isPlainObject, readJsonFile, writeJsonAtomicSync } from './atomic.js';

export const FICHIER_RACCOURCIS = 'raccourcis.json';
export const MAX_PAGES = 12;

/** Actions des fenêtres en jeu, dans l'ordre d'affichage : [identifiant, nom, à quoi elle sert, touche par défaut]. */
export const ACTIONS = Object.freeze([
  ['souris', 'Souris sur les fenêtres', 'Les fenêtres en jeu deviennent cliquables et le jeu relâche le curseur ; de nouveau pour rendre la main au jeu', 'Alt+Shift+K'],
  ['masquer', 'Cacher ou afficher les fenêtres', 'Toutes les fenêtres en jeu disparaissent, puis reviennent', 'Alt+Shift+H'],
  ['deplacer', 'Déplacer les fenêtres', 'Passe toutes les fenêtres en mode déplacement, puis les fixe', 'Alt+Shift+C'],
  ['repere', 'Poser un repère ici', 'Minage Rhino : enregistre l’endroit où tu es', 'Alt+Shift+R'],
  ['foreuse', 'Noter une foreuse posée', 'Minage Rhino : note la position de la foreuse', 'Alt+Shift+F'],
  ['photo', 'Photo des cadres de capture', 'Prend en photo la zone de chaque cadre de capture', 'Alt+Shift+P'],
  ['voix', 'Parler à l’IA de bord', 'Un appui pour commencer à parler, un pour finir', 'Alt+Shift+V'],
  ['quitter', 'Fermer les fenêtres en jeu', 'Ferme toutes les fenêtres en jeu', 'Alt+Shift+Q'],
].map(([id, titre, description, defaut]) => Object.freeze({ id, titre, description, defaut })));

const MODIFICATEURS = ['Ctrl', 'Alt', 'Shift'];
const TOUCHE = /^(?:[A-Z0-9]|F(?:[1-9]|1\d|2[0-4]))$/;

/**
 * Raccourci écrit proprement (« Alt+Shift+K », modificateurs dans l'ordre Ctrl, Alt, Shift), ou null s'il n'est pas
 * acceptable. Il faut Ctrl ou Alt : une touche seule, ou avec Maj seulement, serait volée au jeu à chaque appui.
 */
export function raccourciValide(texte) {
  if (typeof texte !== 'string' || texte.length > 30) return null;
  const parts = texte.split('+').map((p) => p.trim());
  const touche = parts.pop()?.toUpperCase() ?? '';
  const mods = parts.map((p) => MODIFICATEURS.find((m) => m.toLowerCase() === p.toLowerCase() || (m === 'Shift' && p.toLowerCase() === 'maj')));
  if (!TOUCHE.test(touche) || mods.includes(undefined) || new Set(mods).size !== mods.length) return null;
  if (!mods.includes('Ctrl') && !mods.includes('Alt')) return null;
  return [...MODIFICATEURS.filter((m) => mods.includes(m)), touche].join('+');
}

const refus = (message) => Object.assign(new Error(message), { status: 400, publicMessage: message });

export class Raccourcis {
  /** `cheminValide(c)` : la page existe-t-elle sous une forme acceptable (« /vaisseaux ») ? */
  constructor({ fichier, cheminValide }) {
    this.fichier = fichier;
    this.cheminValide = cheminValide;
    const lu = readJsonFile(fichier, { fallback: {}, accept: isPlainObject });
    try {
      ({ actions: this.actions, pages: this.pages } = this.lire(lu));
    } catch {
      ({ actions: this.actions, pages: this.pages } = this.lire({})); // fichier abîmé ou incohérent : les touches par défaut
    }
  }

  /** Réglage vérifié en entier : { actions: { id: touche | null }, pages: [{ touche, chemin }] }. Lève une erreur 400. */
  lire(demande) {
    const d = isPlainObject(demande) ? demande : {};
    const actions = {};
    for (const a of ACTIONS) {
      const v = isPlainObject(d.actions) && Object.hasOwn(d.actions, a.id) ? d.actions[a.id] : a.defaut;
      if (v === null || v === '') actions[a.id] = null; // action sans raccourci
      else {
        const r = raccourciValide(v);
        if (!r) throw refus(`Raccourci refusé pour « ${a.titre} » : il faut Ctrl ou Alt, puis une lettre, un chiffre ou une touche F1 à F24.`);
        actions[a.id] = r;
      }
    }
    const pages = [];
    for (const p of Array.isArray(d.pages) ? d.pages : []) {
      const touche = raccourciValide(p?.touche);
      if (!touche) throw refus('Raccourci de page refusé : il faut Ctrl ou Alt, puis une lettre, un chiffre ou une touche F1 à F24.');
      if (typeof p?.chemin !== 'string' || !this.cheminValide(p.chemin)) throw refus('Page inconnue pour un raccourci.');
      pages.push({ touche, chemin: p.chemin });
    }
    if (pages.length > MAX_PAGES) throw refus(`${MAX_PAGES} raccourcis de page au plus.`);
    const toutes = [...Object.values(actions).filter(Boolean), ...pages.map((p) => p.touche)];
    const double = toutes.find((t, i) => toutes.indexOf(t) !== i);
    if (double) throw refus(`Le raccourci ${double.replace('Shift', 'Maj')} sert deux fois : chaque raccourci ne peut faire qu'une chose.`);
    return { actions, pages };
  }

  /** Ce que lisent la page de réglage et l'overlay. */
  etat() {
    return {
      actions: ACTIONS.map((a) => ({ ...a, touche: this.actions[a.id] })),
      pages: this.pages.map((p) => ({ ...p })),
      maxPages: MAX_PAGES,
    };
  }

  /** Enregistre un réglage complet ({ actions, pages }), ou remet tout par défaut ({ defaut: true }). */
  regler(demande) {
    ({ actions: this.actions, pages: this.pages } = this.lire(demande?.defaut === true ? {} : demande));
    writeJsonAtomicSync(this.fichier, { actions: this.actions, pages: this.pages });
    return this.etat();
  }
}
