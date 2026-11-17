// Version de l'app donnée à l'escadron, et de quoi la vérifier. Le paquet (scripts/paquet.mjs) écrit paquet.json à sa
// racine : sa version, et l'empreinte SHA-256 de chacun de ses fichiers. L'empreinte du paquet (celle de cette liste)
// est publiée par celui qui distribue l'app ; Paramètres → Mon compte l'affiche, et dit si un fichier a changé depuis.
// Ainsi une « version corrigée » postée par quelqu'un d'autre se reconnaît : son empreinte n'est pas l'officielle.

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const FICHIER = 'paquet.json';

const sha256 = (contenu) => createHash('sha256').update(contenu).digest('hex');

/** Empreinte de chaque fichier ({ chemin relatif à barres obliques : sha256 }), lus à la suite (script de paquet). */
function manifeste(racine, fichiers) {
  const m = {};
  for (const f of [...fichiers].sort()) m[f] = sha256(fs.readFileSync(path.join(racine, f)));
  return m;
}

/** Empreinte du paquet : celle de la liste triée « chemin empreinte ». */
function empreinteManifeste(m) {
  return sha256(Object.keys(m).sort().map((f) => `${f} ${m[f]}\n`).join(''));
}

/** Empreinte courte à lire et à comparer à voix haute : 4 groupes de 4. */
const courte = (e) => String(e || '').slice(0, 16).replace(/(.{4})(?!$)/g, '$1 ');

/**
 * Vérifie le dossier de l'app contre son paquet.json, en arrière-plan (lectures asynchrones) : { version, empreinte,
 * courte, conforme, changes: [jusqu'à 5 fichiers modifiés ou manquants] }, ou { version: null } hors paquet
 * (dossier de développement).
 */
async function verifierPaquet(racine) {
  let p;
  try {
    p = JSON.parse(await fsp.readFile(path.join(racine, FICHIER), 'utf8'));
  } catch {
    return { version: null };
  }
  const m = p && typeof p.fichiers === 'object' && p.fichiers ? p.fichiers : {};
  const empreinte = empreinteManifeste(m);
  const changes = [];
  let nb = 0;
  for (const f of Object.keys(m).sort()) {
    const plein = path.resolve(racine, f);
    if (!plein.startsWith(path.resolve(racine) + path.sep)) continue; // jamais hors du dossier de l'app
    let e = null;
    try {
      e = sha256(await fsp.readFile(plein));
    } catch {
      // manquant
    }
    if (e !== m[f]) {
      nb += 1;
      if (changes.length < 5) changes.push(f);
    }
  }
  return {
    version: typeof p.version === 'string' ? p.version.slice(0, 60) : '?',
    empreinte,
    courte: courte(empreinte),
    annoncee: typeof p.empreinte === 'string' ? p.empreinte : null,
    conforme: nb === 0 && p.empreinte === empreinte,
    nbChanges: nb,
    changes,
  };
}

module.exports = { FICHIER, manifeste, empreinteManifeste, courte, verifierPaquet };
