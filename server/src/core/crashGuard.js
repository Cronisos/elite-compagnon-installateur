// Erreur imprévue hors d'une requête (minuterie, écouteur d'événement, promesse rejetée sans traitement) : l'état du
// serveur n'est plus sûr, il s'arrête. Avant, il s'arrêtait aussi, mais sur une pile en anglais seulement, et rien ne
// le relançait : l'app restait morte en pleine séance (écriture ratée du balayage de l'EEP dans sa minuterie). Ici : une
// ligne en français qui dit ce qui se passe, la pile, puis l'arrêt ; sous « npm run dev » (et « Lancer EliteApp.cmd »),
// server/dev.js le relance de lui-même (core/devSupervisor.js).
//
// Écrit d'un coup sur la console d'erreurs (descripteur 2, jamais un fichier) : le processus s'arrête juste après, une
// écriture différée de la console (terminal de Windows) pourrait se perdre.

import fs from 'node:fs';
import { inspect } from 'node:util';
import { CRASH_DELAY_MS } from './devSupervisor.js';

/** Texte d'une erreur : sa pile, ou la valeur rejetée telle quelle (une promesse peut être rejetée avec n'importe quoi). */
export function describeError(err) {
  if (err instanceof Error && typeof err.stack === 'string') return err.stack;
  return inspect(err, { depth: 3, breakLength: 120 });
}

function writeNow(text) {
  try {
    fs.writeSync(2, `${text}\n`);
  } catch {
    // console fermée : rien à faire de plus
  }
}

export const RELAUNCH_NOTE = `avec « npm run dev » ou « Lancer EliteApp.cmd », il redémarre de lui-même dans ${Math.round(CRASH_DELAY_MS / 1000)} s`;

/**
 * Branche l'arrêt propre sur erreur imprévue. Appelé une fois, au tout début du serveur (server/src/index.js).
 * @param {object} [o] remplacés dans les tests
 * @param {import('node:events').EventEmitter} [o.proc] le processus
 * @param {(text: string) => void} [o.log]
 * @param {(code: number) => void} [o.exit]
 */
export function installCrashGuard({ proc = process, log = writeNow, exit = (code) => proc.exit(code) } = {}) {
  const fatal = (what) => (err) => {
    log(`${what} : le serveur s'arrête (${RELAUNCH_NOTE}).\n${describeError(err)}`);
    exit(1);
  };
  proc.on('uncaughtException', fatal('Erreur imprévue'));
  proc.on('unhandledRejection', fatal('Promesse rejetée sans traitement'));
}
