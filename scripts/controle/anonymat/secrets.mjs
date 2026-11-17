// Secrets du joueur relevés dans ses VRAIS journaux, en lecture seule, et gardés en mémoire seulement : ils ne sont
// jamais écrits dans un fichier ni affichés (les rapports donnent un nombre et un nom de fichier, pas la valeur).
//
// Dossier lu : CONTROLE_JOURNAUX_REELS s'il est réglé, sinon le dossier par défaut du jeu
// (%USERPROFILE%\Saved Games\Frontier Developments\Elite Dangerous).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Secrets } from './anonymiser.mjs';

export function dossierJournauxReels(env = process.env) {
  const own = String(env.CONTROLE_JOURNAUX_REELS || '').trim();
  return own || path.join(os.homedir(), 'Saved Games', 'Frontier Developments', 'Elite Dangerous');
}

/** Journaux du dossier (Journal.*.log), du plus ancien au plus récent. */
export function journauxReels(dossier) {
  if (!fs.existsSync(dossier)) return [];
  return fs.readdirSync(dossier).filter((f) => /^Journal\..+\.log$/.test(f)).sort().map((f) => path.join(dossier, f));
}

/**
 * Termes publics du jeu ou de l'app, qu'un autre joueur peut porter tel quel (nom par défaut d'un porteur d'escadron) :
 * termes-publics.json (versionné, rien que des termes publics) et les libellés des règles (terms de regles.json, en
 * français et en anglais). Fichier absent ou illisible : rien (le contrôle reste aussi strict qu'avant).
 */
export function termesPublics() {
  const out = new Set();
  const lireJson = (url) => {
    try {
      return JSON.parse(fs.readFileSync(url, 'utf8'));
    } catch {
      return null;
    }
  };
  for (const t of lireJson(new URL('./termes-publics.json', import.meta.url))?.termes || []) if (typeof t === 'string') out.add(t);
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      if (Array.isArray(v.terms)) for (const t of v.terms) for (const s of [t?.fr, t?.en]) if (typeof s === 'string') out.add(s);
      Object.values(v).forEach(walk);
    }
  };
  walk(lireJson(new URL('../../../server/src/modules/regles/regles.json', import.meta.url)));
  return [...out];
}

/**
 * Relève les secrets de tous les journaux du dossier ; renvoie { gele, fichiers, commandants, fids } où gele est le
 * résultat de Secrets.finish() (remplacements et listes interdites ; termes publics écartés des secrets des autres).
 * Aucun journal : null.
 */
export function lireSecrets(dossier = dossierJournauxReels()) {
  const fichiers = journauxReels(dossier);
  if (!fichiers.length) return null;
  const s = new Secrets();
  for (const f of fichiers) {
    for (const ligne of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!ligne.trim()) continue;
      try {
        s.collect(JSON.parse(ligne));
      } catch {
        // ligne incomplète : ignorée
      }
    }
  }
  return { gele: s.finish({ publicTerms: termesPublics() }), fichiers: fichiers.length, commandants: s.cmdrs.size, fids: s.fids.size };
}
