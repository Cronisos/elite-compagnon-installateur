// Portraits des ingénieurs, fournis par le joueur : un fichier par ingénieur dans le dossier des données
// (server/data/ingenieurs/, ou %APPDATA%\Elite Compagnon\donnees\ingenieurs\ avec l'app de bureau), nommé par son nom
// (« Bill Turner.png », majuscules, accents et ponctuation sans importance) ou par son identifiant du jeu (« 300050.jpg »).
// PNG, JPEG ou WebP reconnus à leur CONTENU (core/imageCheck.js), 8 Mo et 8 192 px au plus ; un dossier, un lien ou un
// fichier qui ment sur son type est ignoré. Rien n'est versionné ni envoyé : les images restent chez le joueur.

import fs from 'node:fs';
import path from 'node:path';
import { dataPath } from '../../../core/paths.js';
import { imageSize, imageType, MAX_SIDE_PX } from '../../../core/imageCheck.js';

export const PORTRAITS_DIR = () => dataPath('ingenieurs');
const MAX_OCTETS = 8 * 1024 * 1024;
const TYPES = new Set(['png', 'jpeg', 'webp']);
const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

/** Nom comparable : « Tod 'The Blaster' McQuinn » → « tod the blaster mcquinn », « Élvira » → « elvira ». */
export const cleNom = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Portrait d'un ingénieur ({ id, name }) : { buf, mime } ou null (aucun fichier, ou aucun fichier valable).
 * `dir` : dossier des portraits (les tests en donnent un temporaire).
 */
export function portraitDe(engineer, dir = PORTRAITS_DIR()) {
  if (!engineer) return null;
  let entrees;
  try {
    entrees = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null; // pas de dossier : pas de portrait
  }
  const voulus = new Set([cleNom(engineer.id), cleNom(engineer.name)].filter(Boolean));
  for (const e of entrees) {
    if (!e.isFile()) continue; // ni dossier ni lien
    const m = /^(.+)\.(png|jpe?g|webp)$/i.exec(e.name);
    if (!m || !voulus.has(cleNom(m[1]))) continue;
    const p = path.join(dir, e.name);
    try {
      const st = fs.lstatSync(p);
      if (!st.isFile() || st.size > MAX_OCTETS) continue;
      const buf = fs.readFileSync(p);
      const type = imageType(buf);
      if (!TYPES.has(type)) continue;
      const taille = imageSize(buf, type);
      if (!taille || taille.width > MAX_SIDE_PX || taille.height > MAX_SIDE_PX) continue;
      return { buf, mime: MIME[type] };
    } catch {
      // fichier disparu ou verrouillé entre-temps : on passe au suivant
    }
  }
  return null;
}
