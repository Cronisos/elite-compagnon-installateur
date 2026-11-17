// Magasin JSON d'un fichier du dossier des données (plans validés, épingles, itinéraire…) : écrit de façon atomique
// (core/atomic.js), validé strictement à chaque lecture.
//
//   absent       : pas de fichier, valeur vide ;
//   lu           : fichier lu et valide ;
//   mis de côté  : fichier abîmé, trop gros ou refusé par la validation : renommé « <nom>.illisible-<date> »
//                  (jamais écrasé), avertissement gardé, valeur vide ;
//   non lu       : erreur de lecture (fichier verrouillé par OneDrive, un antivirus…) : rien n'est écrit, pour ne pas
//                  l'écraser ; chaque lecture le retente ;
//   plus récent  : version d'une app plus récente : ni lu, ni écrit.
// Rien n'est jamais écrit au démarrage ni par une lecture : seulement quand le joueur le demande (write).

import fs from 'node:fs';
import path from 'node:path';
import { setAside, writeJsonAtomicSync } from '../../../core/atomic.js';

function storeError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}

export class JsonStore {
  /**
   * @param {string} file chemin du fichier
   * @param {object} o
   * @param {string} o.label nom pour le joueur (« des épingles »)
   * @param {(json) => object} o.validate valeur normalisée (version 1), ou lève Error(raison)
   * @param {() => object} o.empty valeur vide
   * @param {number} [o.maxBytes]
   * @param {object} [o.fsImpl] fonctions de fichier (tests : lecture qui échoue)
   */
  constructor(file, { label, validate, empty, maxBytes = 1_000_000, fsImpl = fs, warn = console.warn } = {}) {
    this.file = file;
    this.label = label;
    this.validate = validate;
    this.empty = empty;
    this.maxBytes = maxBytes;
    this.fs = fsImpl;
    this.warn = warn;
    this.state = 'absent';
    this.value = empty();
    this.warning = null;
    this.reload();
  }

  reload() {
    let buf;
    try {
      buf = this.fs.readFileSync(this.file);
    } catch (err) {
      if (err.code === 'ENOENT') return this.set('absent', null);
      return this.set('non lu', { kind: 'non lu', code: err.code || 'EIO' });
    }
    if (buf.length > this.maxBytes) return this.putAside();
    let json;
    try {
      json = JSON.parse(buf.toString('utf8').replace(/^﻿/, ''));
    } catch {
      return this.putAside();
    }
    if (json && typeof json === 'object' && Number.isInteger(json.version) && json.version > 1) return this.set('plus récent', { kind: 'plus récent' });
    try {
      this.value = this.validate(json);
    } catch {
      return this.putAside();
    }
    this.state = 'lu';
    this.warning = null;
    return this.value;
  }

  set(state, warning) {
    this.state = state;
    this.warning = warning;
    this.value = this.empty();
    return this.value;
  }

  putAside() {
    const aside = setAside(this.file, { label: `Fichier ${this.label}`, warn: this.warn });
    // Pas pu le renommer : on ne l'écrase surtout pas (lecture refusée, comme un fichier verrouillé)
    if (!aside) return this.set('non lu', { kind: 'non lu', code: 'ILLISIBLE' });
    return this.set('mis de côté', { kind: 'mis de côté', aside: path.basename(aside), at: new Date().toISOString() });
  }

  /** Valeur courante (relit d'abord si la dernière lecture a échoué). */
  read() {
    if (this.state === 'non lu') this.reload();
    return this.value;
  }

  /** Vérifie qu'une écriture est possible (relit d'abord un fichier qui n'a pas pu l'être) ; sinon 503. */
  ensureWritable() {
    if (this.state === 'non lu') this.reload();
    if (this.state === 'non lu') {
      throw storeError(503, `Le fichier ${this.label} n'a pas pu être relu (${this.warning?.code || 'erreur'}) : rien n'est enregistré, pour ne pas l'écraser. Ferme ce qui le bloque (OneDrive, antivirus…), puis réessaie.`);
    }
    if (this.state === 'plus récent') throw storeError(503, `Le fichier ${this.label} vient d'une version plus récente de l'app : il n'est ni lu ni écrasé.`);
  }

  /** Écrit une nouvelle valeur (validée), de façon atomique. Refusé (503) tant que le fichier n'a pas pu être relu. */
  write(next) {
    this.ensureWritable();
    const value = this.validate(next);
    writeJsonAtomicSync(this.file, value, { fsImpl: this.fs });
    this.value = value;
    // Un fichier mis de côté reste signalé (le joueur doit savoir que ses anciennes saisies sont à refaire)
    if (this.warning?.kind !== 'mis de côté') this.warning = null;
    this.state = 'lu';
    return value;
  }

  /** Avertissement pour le joueur ({ file: label, kind, aside? }), ou null. */
  notice() {
    return this.warning ? { file: this.label, ...this.warning } : null;
  }
}
