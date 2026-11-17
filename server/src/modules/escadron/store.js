// Fichiers du module dans server/data, écrits de façon atomique (core/atomic.js : fichier temporaire, fsync, puis
// renommage) : une coupure pendant l'écriture laisse l'ancienne version intacte. Jamais d'écriture en place : un
// renommage refusé (antivirus, outil de sauvegarde) est réessayé, puis l'écriture échoue.
//
// Le jeton de membre est dans son propre fichier : escadron.json (état, file d'attente) peut être montré
// ou partagé pour un diagnostic sans dévoiler le jeton.

import fs from 'node:fs';
import path from 'node:path';
import { isPlainObject, readJsonFile, writeFileAtomicSync } from '../../core/atomic.js';

export const STATE_FILE = 'escadron.json';
export const TOKEN_FILE = 'escadron-jeton.json';

/** Lit un fichier JSON ; null s'il manque ou est illisible (illisible : mis de côté, core/atomic.js). */
export function readJson(file) {
  return readJsonFile(file, { fallback: null, accept: isPlainObject, label: `Escadron (${path.basename(file)})` });
}

/** Écrit un fichier JSON de façon atomique. */
export function writeJsonAtomic(file, value, options) {
  writeFileAtomicSync(file, JSON.stringify(value), { mode: 0o600, ...options });
}

/** Accès aux deux fichiers du module dans un dossier (server/data, ou un dossier temporaire pour les tests). */
export function fileStore(dir) {
  const stateFile = path.join(dir, STATE_FILE);
  const tokenFile = path.join(dir, TOKEN_FILE);
  return {
    readState: () => readJson(stateFile),
    writeState: (state) => writeJsonAtomic(stateFile, state),
    readToken: () => {
      const token = readJson(tokenFile)?.token;
      return typeof token === 'string' ? token : null;
    },
    writeToken: (token) => writeJsonAtomic(tokenFile, { token }),
    clearToken: () => fs.rmSync(tokenFile, { force: true }),
  };
}
