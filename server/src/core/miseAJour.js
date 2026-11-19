// Avis de nouvelle version : l'app peut regarder, sur le dépôt public de l'installateur, si une version plus récente
// que la sienne a été publiée, et le dire au joueur avec un lien. Coupé par défaut : rien ne part tant qu'il ne l'a
// pas activé (Paramètres). Activé, une seule demande à GitHub toutes les douze heures au plus, sans rien envoyer de
// lui (ni nom, ni version : une lecture de la page publique des versions). L'app ne télécharge et n'installe rien :
// le joueur ouvre le lien dans son navigateur et lance l'installateur lui-même.
//
// La version de l'app vient de paquet.json, écrit à sa fabrication (npm run paquet, npm run release). Sans lui (version
// de travail du développeur), il n'y a rien à comparer : aucune demande n'est faite.

import fs from 'node:fs';
import path from 'node:path';
import { isPlainObject, readJsonFile, writeJsonAtomicSync } from './atomic.js';

export const FICHIER_MISE_A_JOUR = 'mise-a-jour.json';
export const DEPOT_INSTALLATEUR = 'Cronisos/enova';
export const ADRESSE_VERSIONS = `https://api.github.com/repos/${DEPOT_INSTALLATEUR}/releases/latest`;
export const PAGE_VERSIONS = `https://github.com/${DEPOT_INSTALLATEUR}/releases/latest`;
const DOUZE_HEURES = 12 * 3600 * 1000;
/** Marge entre la fabrication d'une version et sa publication : en dessous, c'est la même version. */
const MARGE_MS = 30 * 60 * 1000;
const VERSION = /(\d{4}\.\d{2}\.\d{2}-[0-9a-f]{4,40})/;

/** Version installée : { version, fabrique } d'après paquet.json à la racine de l'app, ou null (version de travail). */
export function versionInstallee(racine) {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(racine, 'paquet.json'), 'utf8'));
    return typeof p?.version === 'string' && typeof p?.fabrique === 'string' && !Number.isNaN(Date.parse(p.fabrique))
      ? { version: p.version.slice(0, 60), fabrique: p.fabrique }
      : null;
  } catch {
    return null;
  }
}

/**
 * Ce que dit la dernière version publiée (réponse de GitHub), sans confiance : { version, publieeLe, page } ou null.
 * La version est lue dans le nom de l'installateur joint (« Installer Enova 2026.11.20-ab12cd3.exe », avant le 19 nov. 2026 « Installer Elite Compagnon … »), à
 * défaut dans l'étiquette de la version. Le lien est toujours la page des versions du dépôt, jamais une adresse lue
 * dans la réponse.
 */
export function dernierePubliee(reponse) {
  if (!isPlainObject(reponse) || reponse.draft === true || reponse.prerelease === true) return null;
  const publieeLe = typeof reponse.published_at === 'string' && !Number.isNaN(Date.parse(reponse.published_at)) ? reponse.published_at : null;
  if (!publieeLe) return null;
  const noms = [...(Array.isArray(reponse.assets) ? reponse.assets : []).map((a) => a?.name), reponse.tag_name, reponse.name];
  const version = noms.map((n) => (typeof n === 'string' ? VERSION.exec(n)?.[1] : null)).find(Boolean) ?? null;
  return { version, publieeLe, page: PAGE_VERSIONS };
}

/** La version publiée est-elle plus récente que celle installée ? (publiée nettement après la fabrication de celle-ci, et pas la même) */
export function plusRecente(publiee, installee) {
  if (!publiee || !installee) return false;
  if (publiee.version && publiee.version === installee.version) return false;
  return Date.parse(publiee.publieeLe) > Date.parse(installee.fabrique) + MARGE_MS;
}

export class MiseAJour {
  /** `lire(url)` : rend le JSON de l'adresse (passerelle réseau du serveur), ou lève une erreur. */
  constructor({ fichier, racine, lire, now = Date.now }) {
    this.fichier = fichier;
    this.installee = versionInstallee(racine);
    this.lire = lire;
    this.now = now;
    const lu = readJsonFile(fichier, { fallback: {}, accept: isPlainObject });
    this.actif = lu.actif === true;
    this.vueLe = typeof lu.vueLe === 'number' ? lu.vueLe : 0;
    this.publiee = isPlainObject(lu.publiee) && typeof lu.publiee.publieeLe === 'string' ? { version: lu.publiee.version ?? null, publieeLe: lu.publiee.publieeLe, page: PAGE_VERSIONS } : null;
    this.ignoree = typeof lu.ignoree === 'string' ? lu.ignoree : null; // version que le joueur ne veut plus voir annoncée
    this.enCours = null;
  }

  enregistrer() {
    writeJsonAtomicSync(this.fichier, { actif: this.actif, vueLe: this.vueLe, publiee: this.publiee, ignoree: this.ignoree });
  }

  /** Ce que la page affiche. `nouvelle` : la version à annoncer, ou null. */
  etat() {
    const nouvelle = this.actif && plusRecente(this.publiee, this.installee) && this.publiee.publieeLe !== this.ignoree ? this.publiee : null;
    return {
      actif: this.actif,
      installee: this.installee,
      verifiable: Boolean(this.installee),
      vueLe: this.vueLe ? new Date(this.vueLe).toISOString() : null,
      nouvelle,
      depot: DEPOT_INSTALLATEUR,
    };
  }

  /** Active ou coupe la vérification. La couper oublie ce qui avait été lu. */
  regler({ actif, ignorer }) {
    if (actif !== undefined) {
      if (typeof actif !== 'boolean') throw Object.assign(new Error('« actif » : vrai ou faux.'), { status: 400, publicMessage: '« actif » : vrai ou faux.' });
      this.actif = actif;
      if (!actif) Object.assign(this, { publiee: null, vueLe: 0, ignoree: null });
    }
    if (ignorer === true && this.publiee) this.ignoree = this.publiee.publieeLe;
    this.enregistrer();
    return this.etat();
  }

  /**
   * Regarde s'il y a une nouvelle version : seulement si c'est activé, s'il y a une version installée à comparer, et
   * si la dernière demande date de plus de douze heures (`force` : tout de suite, bouton « Vérifier maintenant »).
   * Une panne de réseau ne change rien et ne lève rien. Rend l'état.
   */
  async verifier({ force = false } = {}) {
    if (!this.actif || !this.installee) return this.etat();
    if (!force && this.now() - this.vueLe < DOUZE_HEURES) return this.etat();
    this.enCours ??= (async () => {
      try {
        this.publiee = dernierePubliee(await this.lire(ADRESSE_VERSIONS)) ?? this.publiee;
        this.vueLe = this.now();
        this.enregistrer();
      } catch {
        // GitHub injoignable, réseau coupé, dépôt sans version publiée : on réessaiera au prochain lancement
      } finally {
        this.enCours = null;
      }
    })();
    await this.enCours;
    return this.etat();
  }
}
