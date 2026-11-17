// Dossier de l'overlay (places des fenêtres en jeu, fenêtres laissées montrées, jauge des boucliers, fermeture à
// transmettre) : %APPDATA%\Elite Compagnon\overlay, rangé avec le reste de l'app. « Effacer mes données » le vide
// (desktop/donnees.js). Avant, Electron le mettait à part, sous le nom du paquet (%APPDATA%\elite-companion-overlay) :
// au premier lancement, ce qui est à toi y est recopié (l'ancien dossier n'est pas modifié).

const fs = require('node:fs');
const path = require('node:path');
const { writeFileAtomicSync } = require('./atomic.js');

const NOM_APP = 'Elite Compagnon';
const SOUS_DOSSIER = 'overlay';
const ANCIEN = 'elite-companion-overlay';
/** Fichiers de l'overlay qui sont à toi (le reste de l'ancien dossier est le cache de Chromium). */
const A_TOI = /^(?:position-[a-z0-9-]+|fenetres-montrees|bouclier-jauge|fermeture-a-transmettre)\.json$/i;

/** %APPDATA%\Elite Compagnon\overlay, ou null sans APPDATA (Electron garde alors son dossier par défaut). */
function dossierOverlay(env = process.env) {
  const appData = String(env.APPDATA || '').trim();
  return appData ? path.join(appData, NOM_APP, SOUS_DOSSIER) : null;
}

/** Ancien dossier de l'overlay (avant le rangement). */
function ancienDossier(env = process.env) {
  const appData = String(env.APPDATA || '').trim();
  return appData ? path.join(appData, ANCIEN) : null;
}

/**
 * Prépare le dossier : créé s'il manque, avec tes fichiers de l'ancien dossier recopiés (une seule fois : le nouveau
 * dossier existe ensuite). Rend la liste des fichiers recopiés.
 */
function preparerDossier(nouveau, ancien) {
  if (!nouveau || fs.existsSync(nouveau)) return [];
  fs.mkdirSync(nouveau, { recursive: true });
  const copies = [];
  let noms = [];
  try {
    noms = ancien ? fs.readdirSync(ancien) : [];
  } catch {
    return copies;
  }
  for (const n of noms) {
    if (!A_TOI.test(n)) continue;
    try {
      if (!fs.statSync(path.join(ancien, n)).isFile()) continue;
      // Écrit d'un coup (atomic.js), comme toutes les écritures de l'overlay : jamais un fichier de position coupé
      writeFileAtomicSync(path.join(nouveau, n), fs.readFileSync(path.join(ancien, n)));
      copies.push(n);
    } catch {
      // illisible : la fenêtre reprendra sa place par défaut
    }
  }
  return copies;
}

module.exports = { dossierOverlay, ancienDossier, preparerDossier };
