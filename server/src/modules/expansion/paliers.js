// Paliers déclarés atteints par le joueur, pour la semaine en cours : « c'est bon, on y est, on attend jeudi ».
// Le relevé du jeu peut rester sous le palier (il est en retard, ou d'autres joueurs l'ont passé et la vente ne paie
// plus que la moitié : 15 nov. 2026, Synuefe OU-E c28-2 à 0,971). Le rapport de la semaine montre alors le palier
// atteint, en attente du passage, et le vaisseau sur l'étape suivante. Une déclaration ne vaut que pour sa semaine :
// au passage de jeudi, le vrai relevé reprend la main.
// Fichier : expansion-paliers.json dans le dossier des données, écrit d'un bloc.

import { readJsonFile, writeJsonAtomicSync } from '../../core/atomic.js';

const GARDER = 8; // semaines gardées
const MAX_PAR_SEMAINE = 50;

export class Paliers {
  /** @param fichier chemin du JSON ; null : en mémoire seulement (tests) */
  constructor(fichier = null, { lire = readJsonFile, ecrire = writeJsonAtomicSync } = {}) {
    this.fichier = fichier;
    this.ecrire = ecrire;
    this.semaines = {}; // début de semaine (ms, en texte) → { système: date de la déclaration }
    if (fichier) {
      const d = lire(fichier, { fallback: null, label: 'Projet extension (paliers déclarés)' });
      if (d && typeof d.semaines === 'object' && !Array.isArray(d.semaines)) {
        for (const [semaine, systemes] of Object.entries(d.semaines)) {
          if (!/^\d{1,14}$/.test(semaine) || !systemes || typeof systemes !== 'object') continue;
          this.semaines[semaine] = Object.fromEntries(Object.entries(systemes).filter(([s, at]) => s && typeof at === 'string').slice(0, MAX_PAR_SEMAINE));
        }
      }
    }
  }

  /** Systèmes déclarés atteints pour la semaine qui commence à `debut` (ms). */
  pour(debut) {
    return new Set(Object.keys(this.semaines[String(debut)] || {}));
  }

  /**
   * Déclare (ou retire) le palier atteint d'un système, pour la semaine qui commence à `debut`. Le nom est comparé
   * sans tenir compte de la casse : une déclaration enregistrée avec une autre orthographe est remplacée ou retirée.
   */
  regler(systeme, debut, atteint, now = new Date()) {
    const k = String(debut);
    const s = { ...(this.semaines[k] || {}) };
    const meme = Object.keys(s).filter((n) => n.toLowerCase() === String(systeme).toLowerCase());
    for (const n of meme) delete s[n];
    if (atteint) {
      if (Object.keys(s).length >= MAX_PAR_SEMAINE) throw new Error('Trop de paliers déclarés cette semaine.');
      s[systeme] = now.toISOString();
    }
    if (Object.keys(s).length) this.semaines[k] = s;
    else delete this.semaines[k];
    // Seules les dernières semaines restent
    const gardees = Object.keys(this.semaines).sort((a, b) => Number(b) - Number(a)).slice(0, GARDER);
    this.semaines = Object.fromEntries(gardees.map((g) => [g, this.semaines[g]]));
    if (this.fichier) this.ecrire(this.fichier, { version: 1, semaines: this.semaines });
    return this.pour(debut);
  }
}
