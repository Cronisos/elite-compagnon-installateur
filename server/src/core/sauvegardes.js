// Sauvegardes des données du joueur (Paramètres › Mon compte) : une copie complète du dossier des données, datée, dans
// Documents\Elite Compagnon - sauvegardes. Hors du dossier de l'app, exprès : désinstaller l'app ou « Effacer mes
// données » ne les emporte pas. Rien ne part du PC.
//
// Une sauvegarde contient tout ce qui est au joueur : sa base (repères, builds, routes, sessions…), ses réglages, ses
// captures, et aussi son jeton d'escadron et, s'il est chef, les clés de son serveur. Elle ne contient pas ce qui se
// retélécharge ou se refait (données de référence, anciennes copies de la base, journaux, fichiers temporaires).
//
// La restauration se fait au lancement suivant de l'app de bureau, base fermée (desktop/donnees.js).

import fs from 'node:fs';
import path from 'node:path';
import { DATABASE_FILE, NOM_DOSSIER_SAUVEGARDES, dossierSauvegardes } from './paths.js';

export const NOM_DOSSIER = NOM_DOSSIER_SAUVEGARDES;
// Le dossier lui-même est décidé dans core/paths.js, comme tous les chemins de l'app
export { dossierSauvegardes };
export const FICHE = 'sauvegarde.json';
/** Nom d'une sauvegarde : sa date et son heure locales, « 2026-11-17 14h32m05 ». */
export const NOM_SAUVEGARDE = /^\d{4}-\d{2}-\d{2} \d{2}h\d{2}m\d{2}$/;

/** Jamais dans une sauvegarde : [motif du chemin relatif (à barres obliques), raison]. */
const EXCLUS = [
  [/^reference(?:\/|$)/, 'données de référence (retéléchargées)'],
  [/-(?:wal|shm|journal)$/i, 'fichier temporaire de la base'],
  [/\.tmp-?\d*$/i, 'fichier temporaire'],
  [/^elite\.db\..+/i, 'ancienne copie de la base'],
  [/\.log$/i, 'journal'],
];
const exclu = (rel) => EXCLUS.some(([re]) => re.test(rel));

const deux = (n) => String(n).padStart(2, '0');
/** « 2026-11-17 14h32m05 », à l'heure du PC. */
export function nomSauvegarde(now = new Date()) {
  return `${now.getFullYear()}-${deux(now.getMonth() + 1)}-${deux(now.getDate())} ${deux(now.getHours())}h${deux(now.getMinutes())}m${deux(now.getSeconds())}`;
}

/** Fichiers d'un dossier, en chemins relatifs à barres obliques, sans ceux qu'une sauvegarde ne prend pas. */
export function fichiersASauvegarder(source) {
  const sortie = [];
  const tour = (dossier, prefixe) => {
    for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
      const rel = prefixe ? `${prefixe}/${e.name}` : e.name;
      if (exclu(rel)) continue;
      if (e.isDirectory()) tour(path.join(dossier, e.name), rel);
      else if (e.isFile()) sortie.push(rel);
    }
  };
  tour(source, '');
  return sortie.sort();
}

/**
 * Fait une sauvegarde. `copierBase(vers)` : copie cohérente de la base ouverte (VACUUM INTO) ; sans elle, ou si elle
 * échoue, la base est copiée telle quelle. La copie se fait dans un dossier temporaire voisin, renommé à la fin : une
 * sauvegarde coupée en route ne ressemble jamais à une bonne. Rend { nom, chemin, fichiers, octets, base }.
 */
export async function creerSauvegarde({ source, dossier, now = new Date(), copierBase = null }) {
  if (!fs.existsSync(source)) throw Object.assign(new Error('Dossier des données introuvable.'), { status: 500 });
  const nom = nomSauvegarde(now);
  const cible = path.join(dossier, nom);
  if (fs.existsSync(cible)) throw Object.assign(new Error('Une sauvegarde vient d’être faite : attends une seconde.'), { status: 409, publicMessage: 'Une sauvegarde vient d’être faite : attends une seconde.' });
  fs.mkdirSync(dossier, { recursive: true });
  const temp = `${cible}.tmp-${process.pid}`;
  fs.rmSync(temp, { recursive: true, force: true });
  let octets = 0;
  let base = 'absente';
  try {
    const fichiers = fichiersASauvegarder(source);
    for (const rel of fichiers) {
      const vers = path.join(temp, rel);
      fs.mkdirSync(path.dirname(vers), { recursive: true });
      if (rel === DATABASE_FILE) {
        base = 'copie simple';
        if (copierBase) {
          try {
            await copierBase(vers);
            base = 'copie cohérente';
          } catch {
            fs.rmSync(vers, { force: true });
          }
        }
        if (base === 'copie simple') fs.copyFileSync(path.join(source, rel), vers);
      } else fs.copyFileSync(path.join(source, rel), vers);
      octets += fs.statSync(vers).size;
    }
    fs.writeFileSync(path.join(temp, FICHE), `${JSON.stringify({ app: 'Elite Compagnon', le: now.toISOString(), fichiers: fichiers.length, octets, base }, null, 1)}\n`);
    fs.renameSync(temp, cible);
    return { nom, chemin: cible, fichiers: fichiers.length, octets, base };
  } catch (err) {
    fs.rmSync(temp, { recursive: true, force: true });
    throw err;
  }
}

/** Sauvegardes présentes, de la plus récente à la plus ancienne : [{ nom, le, fichiers, octets }]. */
export function listerSauvegardes(dossier) {
  let noms = [];
  try {
    noms = fs.readdirSync(dossier, { withFileTypes: true }).filter((e) => e.isDirectory() && NOM_SAUVEGARDE.test(e.name)).map((e) => e.name);
  } catch {
    return [];
  }
  const liste = [];
  for (const nom of noms) {
    try {
      const fiche = JSON.parse(fs.readFileSync(path.join(dossier, nom, FICHE), 'utf8'));
      if (fiche?.app !== 'Elite Compagnon') continue;
      liste.push({ nom, le: typeof fiche.le === 'string' ? fiche.le : null, fichiers: Number(fiche.fichiers) || 0, octets: Number(fiche.octets) || 0 });
    } catch {
      // dossier sans fiche lisible : pas une sauvegarde de l'app (ou coupée en route)
    }
  }
  return liste.sort((a, b) => (a.nom < b.nom ? 1 : -1));
}
