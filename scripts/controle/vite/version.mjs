// Version de Vite (serveur de développement de l'interface, celui de tous les jours) : encore suivie, ou plus de
// correctifs de sécurité ? Lu sans réseau. Constat de l'audit du 9 nov. 2026 : Vite 5.4.21 n'en reçoit plus, et aucun
// contrôle ne le disait. Même règle qu'Electron (electron/version.mjs) : une version hors suivi fait échouer le contrôle,
// sauf si sa mise à jour est déclarée « en attente » ci-dessous (avertissement à chaque contrôle) ; une attente qui ne
// correspond plus à la version installée fait échouer, pour qu'on la retire après la mise à jour.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Versions majeures qui ne reçoivent plus de correctifs de sécurité (relevé du 9 nov. 2026, audit de sécurité : Vite
 * suit la dernière version majeure et corrige encore la précédente ; 6.4.x et 7.3.x étaient suivies).
 */
export const HORS_SUIVI = Object.freeze([2, 3, 4, 5]);
export const RELEVE = '2026-11-09';

/**
 * Mises à jour déjà prévues, pas encore faites : node_modules d'une worktree est un lien vers l'app du joueur, la mise à
 * jour se fait par npm install dans l'app principale (client/package.json « vite », allowScripts pour esbuild), jamais
 * depuis le banc.
 */
export const ATTENTES = Object.freeze([]); // Vite 7.3.8 installé le 9 nov. 2026 (étape M2) : plus rien en attente

/**
 * Vite tel que le client le trouve (résolution de Node depuis client/, comme « npm run dev -w client ») : { dossier,
 * entree (API JavaScript), bin (vite.js) }, ou null. Jamais un chemin interne écrit en dur : npm peut l'installer à la
 * racine ou dans client/node_modules (Vite 8, 9 nov. 2026), et dist/ change d'une version majeure à l'autre.
 */
export function trouverVite(racine) {
  try {
    // Chemins de recherche de Node depuis client/ (node_modules du client, puis de la racine…) : le premier qui a vite
    const pistes = createRequire(path.join(path.resolve(racine), 'client', 'package.json')).resolve.paths('vite') || [];
    const dossier = pistes.map((d) => path.join(d, 'vite')).find((d) => fs.existsSync(path.join(d, 'package.json')));
    if (!dossier) return null;
    const pkg = JSON.parse(fs.readFileSync(path.join(dossier, 'package.json'), 'utf8'));
    const exp = pkg.exports?.['.'];
    const rel = (typeof exp === 'string' ? exp : exp?.import?.default || exp?.import || exp?.default) || pkg.module || pkg.main;
    return { dossier, entree: path.join(dossier, typeof rel === 'string' ? rel : 'dist/node/index.js'), bin: path.join(dossier, 'bin', 'vite.js') };
  } catch {
    return null;
  }
}

/** Version de Vite installée (celle que trouve le client), ou null. */
export function lireVersionVite(racine) {
  const trouve = trouverVite(racine);
  for (const dir of trouve ? [trouve.dossier] : []) {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version ?? null;
    } catch {
      // pas ici
    }
  }
  return null;
}

/** { niveau: 'ok' | 'avertissement' | 'echec', message } */
export function verdictVite(version, { attentes = ATTENTES, horsSuivi = HORS_SUIVI } = {}) {
  if (!version) return { niveau: 'echec', message: 'Vite introuvable : lance « npm install » à la racine.' };
  const majeure = Number(String(version).split('.')[0]);
  const attente = attentes.find((a) => a.version === version);
  const perimees = attentes.filter((a) => a.version !== version);
  if (perimees.length) {
    return { niveau: 'echec', message: `Attente de mise à jour de Vite ${perimees.map((a) => a.version).join(', ')} : Vite installé est en ${version}, retire-la de scripts/controle/vite/version.mjs.` };
  }
  if (!horsSuivi.includes(majeure)) return { niveau: 'ok', message: `Vite ${version} encore suivi (relevé du ${RELEVE})` };
  if (attente) return { niveau: 'avertissement', message: `Vite ${version} (serveur de développement de l’interface) n’a plus de correctifs de sécurité : mise à jour en attente, ${attente.raison}` };
  return { niveau: 'echec', message: `Vite ${version} n’a plus de correctifs de sécurité (relevé du ${RELEVE}) : mets-le à jour, ou déclare l’attente dans scripts/controle/vite/version.mjs.` };
}
