// Fichiers JSON des données de l'app, pour le cœur : écriture atomique (fichier temporaire à côté, puis renommage : jamais
// de fichier à moitié écrit, même si l'app s'arrête au milieu) et lecture qui met de côté un fichier illisible au lieu de
// le perdre ou de planter.
// L'écriture passe par core/atomic.js (seule écriture de fichier permise, atomic.test.js) ; la lecture garde ici sa
// forme détaillée (absent, ok, illisible avec ou sans copie, erreur), dont les rôles et les silences ont besoin.

import fs from 'node:fs';
import path from 'node:path';
import { writeFileAtomicSync } from './atomic.js';

/**
 * Écrit `data` en JSON lisible, d'un coup, par l'écriture atomique commune (core/atomic.js : fichier temporaire du
 * même dossier, puis renommage par-dessus).
 */
export function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomicSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * Lit un fichier JSON.
 * - absent : { data: null, status: 'absent' } ;
 * - lisible et accepté par `accept(data)` : { data, status: 'ok' } ;
 * - JSON cassé, ou refusé par `accept` : le fichier est renommé `<nom>.illisible-<date>` à côté (rien n'est perdu), un
 *   avertissement est écrit, et { data: null, status: 'illisible', aside }. Renommage refusé (fichier tenu par un autre
 *   programme…) : il est copié sous ce nom, et reste en place. Ni renommé ni copié : aside null, et l'appelant ne doit
 *   rien écrire par-dessus (ce serait sa seule copie) ;
 * - autre erreur de lecture (droits, fichier verrouillé…) : avertissement, { data: null, status: 'erreur' }, le fichier
 *   n'est pas touché, et l'appelant ne doit rien écrire par-dessus non plus (il garde peut-être des données).
 * @param {{ label?: string, accept?: (data: unknown) => boolean, warn?: (msg: string) => void, now?: number }} o
 */
export function readJsonOrSetAside(file, { label = path.basename(file), accept = () => true, warn = console.warn, now = Date.now() } = {}) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { data: null, status: 'absent' };
    warn(`${label} : ${file} non lu (${err.message}).`);
    return { data: null, status: 'erreur' };
  }
  let data;
  let readable = true;
  try {
    // Sans le BOM qu'ajoutent certains éditeurs (PowerShell 5.1 « Set-Content -Encoding utf8 ») : sinon le fichier
    // était mis de côté comme illisible, et tous les rôles disparaissaient de l'app
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    readable = false;
  }
  if (readable && accept(data)) return { data, status: 'ok' };
  const aside = `${file}.illisible-${new Date(now).toISOString().replace(/[:.]/g, '-')}`;
  try {
    fs.renameSync(file, aside);
    warn(`${label} : fichier illisible, mis de côté sous ${aside} ; départ à vide.`);
    return { data: null, status: 'illisible', aside };
  } catch (err) {
    try {
      writeFileAtomicSync(aside, text); // copie du texte déjà lu, par l'écriture atomique commune
      warn(`${label} : fichier illisible, copié sous ${aside} (renommage refusé : ${err.message}) ; départ à vide.`);
      return { data: null, status: 'illisible', aside };
    } catch (copyErr) {
      warn(`${label} : fichier illisible (${file}), ni renommé ni copié (${err.message} ; ${copyErr.message}).`);
      return { data: null, status: 'illisible', aside: null };
    }
  }
}
