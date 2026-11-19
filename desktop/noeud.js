// Node.js pour lancer le serveur et l'interface : celui livré avec l'app installée (runtime/node/node.exe, mis là par
// l'installateur, scripts/release.mjs), sinon celui du PC. Pas le Node d'Electron : better-sqlite3 (la base) est
// compilé pour ce Node-là, et Electron n'aurait pas la même interface binaire.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const VERSION_MIN = 24;

/** Node livré avec l'app installée (l'installateur le met là, de la version qui a compilé better-sqlite3). */
const NODE_LIVRE = path.join(path.resolve(__dirname, '..'), 'runtime', 'node', 'node.exe');

/**
 * Emplacements essayés, dans l'ordre : le Node livré avec l'app, puis chaque dossier du PATH, puis l'installation
 * standard de Node.
 */
function pistesNode(env = process.env, livre = NODE_LIVRE) {
  const dossiers = String(env.PATH || env.Path || '').split(path.delimiter).map((d) => d.trim().replace(/^"|"$/g, '')).filter(Boolean);
  const pistes = [...(livre ? [livre] : []), ...dossiers.map((d) => path.join(d, 'node.exe'))];
  for (const v of ['ProgramFiles', 'ProgramW6432']) if (env[v]) pistes.push(path.join(env[v], 'nodejs', 'node.exe'));
  return [...new Set(pistes)];
}

/** Version majeure lue dans « v24.11.0 », ou null. */
function versionMajeure(texte) {
  const m = /^v(\d+)\./.exec(String(texte).trim());
  return m ? Number(m[1]) : null;
}

/** Chemin de node.exe (version 24 ou plus), ou une erreur en français qui dit quoi faire. */
function trouverNode(env = process.env, { existe = fs.existsSync, version = (f) => execFileSync(f, ['--version'], { encoding: 'utf8', timeout: 10000, windowsHide: true }) } = {}) {
  let trop = null;
  for (const f of pistesNode(env)) {
    if (!existe(f)) continue;
    let v = null;
    try {
      v = versionMajeure(version(f));
    } catch {
      continue;
    }
    if (v !== null && v >= VERSION_MIN) return f;
    trop ??= { f, v };
  }
  if (trop) throw new Error(`Node.js ${trop.v ?? '?'} trouvé (${trop.f}), mais Enova demande Node.js ${VERSION_MIN} ou plus : installe la version LTS depuis nodejs.org.`);
  throw new Error(`Node.js introuvable : Enova en a besoin (version ${VERSION_MIN} ou plus). Installe la version LTS depuis nodejs.org.`);
}

module.exports = { NODE_LIVRE, VERSION_MIN, pistesNode, versionMajeure, trouverNode };
