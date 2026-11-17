// Téléchargement des données de référence, une fois, puis sur demande.
// Sources : EDCD/coriolis-data (vaisseaux, modules, recettes), EDCD/FDevIDs (matériaux,
// identifiants), taleden/EDSY (eddb.js, pour l'import des liens edsy.org), ROMVoid95/EliteUIAssets
// (dessins de vaisseaux de CMDR Qohen Leth).
// Tout est stocké dans le dossier des données (server/data/reference/ par défaut, core/paths.js) ; l'app fonctionne
// ensuite hors ligne. Les téléchargements passent par la passerelle réseau (core/net.js).
//
// Versions figées : chaque dépôt est lu à un commit précis (jamais « master »), et les fichiers de
// données critiques sont vérifiés par leur empreinte SHA-256 : eddb.js (lu comme une donnée, jamais
// exécuté), les tables FDevIDs et coriolis-data décident de ce que l'app calcule.
// Une empreinte différente refuse tout le téléchargement : les données déjà en place ne bougent pas.
// Les dessins SVG ne sont figés que par le commit (servis ensuite avec « Content-Security-Policy: sandbox »).
// Changer de version = changer ce fichier (commit + empreintes), puis « Mettre à jour les données ».

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { referenceDir } from '../paths.js';
import { netFetch } from '../net.js';

/** Dossier des données de référence (core/paths.js), avec la barre finale comme avant. */
export const REF_DIR = referenceDir() + path.sep;

/**
 * Jour du dernier relevé des commits ci-dessous (dernier commit de master de chaque dépôt le 7 nov. 2026 ; EDSY relevé
 * de nouveau le 15 nov. 2026, après le banc contre edsy.org).
 */
export const PINNED_ON = '2026-11-15';

/** Délai maximal d'un fichier : une connexion bloquée ne laisse pas « téléchargement en cours » pour toujours. */
const FETCH_TIMEOUT_MS = 30_000;

export const SOURCES = {
  coriolis: {
    repo: 'EDCD/coriolis-data',
    commit: '0db9234b5b9ce8c939ea84133d7ce336eea88e27', // commit du 24 avril 2026
    // Empreinte de l'ensemble des 141 fichiers ships/, modules/, modifications/ (voir setDigest)
    digest: 'b9a0dfe92cc212c8b3b20392d367f23b7655f32255612bc2e29af4e53240afd2',
  },
  fdevids: {
    repo: 'EDCD/FDevIDs',
    commit: 'c7c29f7a13df543d4bc8b947eab29f88e06100fa', // commit du 30 octobre 2026
    files: {
      'material.csv': 'a838e70ad891cb1cff7b9b4de96777a4f53ad1253937486aa12bcb3d93c3ff4c',
      'shipyard.csv': 'c7c12f88aac59c9f43eb9ea67697c91d6c1917d064940b37268e2b70cbcbb4bc',
      'outfitting.csv': '6648f1554f11c2849382861f8110dea7907d00ccd96d6fc2471573d6068dfc64',
      'engineers.csv': '3b0c98a5dab2b20a65d4d17ceedae74ac01a1c6f22ca8d807678261e78bc4665',
    },
  },
  edsy: {
    repo: 'taleden/EDSY',
    // Commit du 12 novembre 2026 : eddb.js 424029903, celui d'edsy.org le 15 nov. (Soute à extension en G1-G4 avec ses
    // nouvelles capacités, chaleur et masslock de l'Anaconda Mk II renseignés). Avant : ea787cf805 (eddb 424029902)
    commit: '0f577f76e94d9c1aa06defdbb39ee92b249afa56',
    files: { 'eddb.js': '5bac16de91ab5a9812cd2e3cec08d078c47115f4f0765b91fad0db1ff0122f8a' },
  },
  images: {
    repo: 'ROMVoid95/EliteUIAssets',
    commit: '5a9b2f82796fc65abace9439aea000155f1e6eb3', // commit du 30 novembre 2020
    dir: 'public/static/img/ship-schematics/qohen-leth/',
  },
};

/** Clé coriolis du vaisseau → fichier image (les vaisseaux récents n'ont pas d'image). */
// Sans prototype : SHIP_IMAGES['constructor'] ou SHIP_IMAGES['__proto__'] ne renvoient rien.
export const SHIP_IMAGES = Object.freeze(Object.assign(Object.create(null), {
  adder: 'adder', alliance_challenger: 'alliance-challenger', alliance_chieftain: 'alliance-chieftain',
  alliance_crusader: 'alliance-crusader', anaconda: 'anaconda', asp: 'asp-explorer', asp_scout: 'asp-scout',
  beluga: 'beluga-liner', cobra_mk_iii: 'cobra-mk-iii', cobra_mk_iv: 'cobra-mk-iv',
  diamondback_explorer: 'diamondback-explorer', diamondback: 'diamondback-scout', dolphin: 'dolphin',
  eagle: 'eagle-mk-ii', federal_assault_ship: 'federal-assault-ship', federal_corvette: 'federal-corvette',
  federal_dropship: 'federal-dropship', federal_gunship: 'federal-gunship', fer_de_lance: 'fer-de-lance',
  hauler: 'hauler', imperial_clipper: 'imperial-clipper', imperial_courier: 'imperial-courier',
  imperial_cutter: 'imperial-cutter', imperial_eagle: 'imperial-eagle', keelback: 'keelback',
  krait_mkii: 'krait-mk-ii', krait_phantom: 'krait-phantom', mamba: 'mamba', orca: 'orca', python: 'python',
  sidewinder: 'sidewinder', type_10_defender: 'type-10-defender', type_6_transporter: 'type-6-transporter',
  type_7_transport: 'type-7', type_9_heavy: 'type-9-heavy', viper: 'viper-mk-iii', viper_mk_iv: 'viper-mk-iv',
  vulture: 'vulture',
}));

const COMMIT = /^[0-9a-f]{40}$/; // SHA complet : un nom de branche n'est pas accepté
const HASH = /^[0-9a-f]{64}$/;
// Fichiers coriolis gardés : noms simples, sans « .. » ni caractère qui sortirait du dossier
const CORIOLIS_PATH = /^(ships|modules|modifications)(\/[A-Za-z0-9_-]+)+\.json$/;
const HEADERS = { 'User-Agent': 'compagnon-elite' };

/** Empreinte refusée : tout le téléchargement s'arrête, les données en place sont gardées. */
export class IntegrityError extends Error {}

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Adresse d'un fichier d'un dépôt GitHub à un commit donné (contenu immuable). */
export const rawUrl = (repo, commit, file) => `https://raw.githubusercontent.com/${repo}/${commit}/${file}`;

/**
 * Empreinte d'un ensemble de fichiers (Map chemin → contenu) : SHA-256 des lignes « chemin empreinte »,
 * chemins triés. Un fichier en plus, en moins ou modifié change le résultat.
 */
export function setDigest(files) {
  const lines = [...files.keys()].sort().map((p) => `${p} ${sha256(files.get(p))}\n`).join('');
  return sha256(lines);
}

function checkDigest(label, actual, expected) {
  if (actual === expected) return;
  throw new IntegrityError(`empreinte inattendue pour ${label} (attendue ${String(expected).slice(0, 12)}…, reçue ${actual.slice(0, 12)}…) : téléchargement refusé, les données actuelles sont gardées`);
}

/** Les sources doivent toutes être figées (commit complet) et les empreintes bien formées. */
export function checkSources(sources) {
  for (const [name, s] of Object.entries(sources)) {
    if (!COMMIT.test(s?.commit || '')) throw new Error(`source ${name} : commit figé invalide (${s?.commit})`);
  }
  if (!HASH.test(sources.coriolis.digest || '')) throw new Error('source coriolis : empreinte invalide');
  for (const name of ['fdevids', 'edsy']) {
    for (const [f, h] of Object.entries(sources[name].files)) {
      if (!HASH.test(h || '')) throw new Error(`source ${name} : empreinte invalide pour ${f}`);
    }
  }
}

/** Exécute des tâches avec une concurrence limitée. */
async function pool(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: limit }, async () => {
    while (queue.length) await fn(queue.shift());
  });
  await Promise.all(workers);
}

function write(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

/**
 * Télécharge tout dans un dossier temporaire, vérifie les empreintes, puis remplace l'ancien d'un coup
 * (jamais de données à moitié à jour ; en cas d'échec, l'ancien dossier reste tel quel).
 * Options (tests) : dir (dossier cible), fetch (fonction de téléchargement), sources (versions figées).
 * @returns {{ version, files }}
 */
export async function downloadReference(onProgress = () => {}, { dir = REF_DIR, fetch: fetchImpl = netFetch, sources = SOURCES } = {}) {
  checkSources(sources);
  const get = async (url) => {
    const res = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  };

  const target = dir.replace(/[\\/]$/, '');
  const tmp = `${target}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const files = [];
  let meta;
  try {
    // 1. coriolis-data : liste des fichiers du commit figé, tout vérifié avant d'écrire quoi que ce soit
    const c = sources.coriolis;
    onProgress('Liste des fichiers coriolis-data…');
    const tree = JSON.parse((await get(`https://api.github.com/repos/${c.repo}/git/trees/${c.commit}?recursive=1`)).toString('utf8'));
    if (!Array.isArray(tree.tree) || tree.truncated) throw new Error('liste des fichiers coriolis-data incomplète');
    const wanted = tree.tree.filter((t) => t.type === 'blob' && CORIOLIS_PATH.test(t.path)).map((t) => t.path);
    const coriolis = new Map();
    await pool(wanted, 8, async (p) => {
      coriolis.set(p, await get(rawUrl(c.repo, c.commit, p)));
      if (coriolis.size % 20 === 0) onProgress(`coriolis-data : ${coriolis.size}/${wanted.length}`);
    });
    checkDigest('coriolis-data', setDigest(coriolis), c.digest);
    for (const [p, buf] of coriolis) {
      write(path.join(tmp, 'coriolis', p), buf);
      files.push(p);
    }

    // 2. FDevIDs : correspondance des noms du journal
    onProgress('Tables FDevIDs…');
    const fd = sources.fdevids;
    for (const [f, expected] of Object.entries(fd.files)) {
      const buf = await get(rawUrl(fd.repo, fd.commit, f));
      checkDigest(`fdevids/${f}`, sha256(buf), expected);
      write(path.join(tmp, 'fdevids', f), buf);
      files.push(`fdevids/${f}`);
    }

    // 3. Table des identifiants EDSY (import des liens edsy.org) — CC BY-NC 4.0, taleden
    onProgress('Données EDSY…');
    const ed = sources.edsy;
    for (const [f, expected] of Object.entries(ed.files)) {
      let buf;
      try {
        buf = await get(rawUrl(ed.repo, ed.commit, f));
      } catch (err) {
        // Injoignable (réseau, HTTP) : on garde celui en place s'il est bien la version figée. Un autre fichier en
        // place (ancienne version) : tout est refusé plutôt que de perdre le constructeur. Aucun : toléré, l'app
        // marche sans import EDSY ni constructeur.
        const previous = path.join(target, 'edsy', f);
        if (!fs.existsSync(previous)) continue;
        buf = fs.readFileSync(previous);
        if (sha256(buf) !== expected) throw new Error(`edsy/${f} injoignable (${err.message}) : données en place gardées`);
        onProgress(`edsy/${f} injoignable : version en place gardée`);
      }
      checkDigest(`edsy/${f}`, sha256(buf), expected); // fichier modifié : tout est refusé
      write(path.join(tmp, 'edsy', f), buf);
      files.push(`edsy/${f}`);
    }

    // 4. Images des vaisseaux, figées par le commit (une absence n'est pas bloquante)
    onProgress('Images des vaisseaux…');
    const im = sources.images;
    fs.mkdirSync(path.join(tmp, 'images'), { recursive: true });
    await pool(Object.values(SHIP_IMAGES), 6, async (name) => {
      try {
        write(path.join(tmp, 'images', `${name}.svg`), await get(rawUrl(im.repo, im.commit, `${im.dir}${name}.svg`)));
        files.push(`images/${name}.svg`);
      } catch {
        // image manquante : l'image par défaut sera utilisée
      }
    });

    meta = {
      version: c.commit.slice(0, 10),
      coriolisCommit: c.commit,
      sources: Object.fromEntries(Object.entries(sources).map(([name, s]) => [name, { repo: s.repo, commit: s.commit }])),
      pinnedOn: PINNED_ON,
      downloadedAt: new Date().toISOString(),
      files: files.length,
    };
    fs.writeFileSync(path.join(tmp, 'meta.json'), JSON.stringify(meta, null, 2));
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw err;
  }

  replaceDir(target, tmp);
  onProgress('Terminé.');
  return meta;
}

/**
 * Remplace target par tmp sans jamais rester sans données : l'ancien dossier est mis de côté (.old), remis en place
 * si le nouveau ne peut pas prendre sa place (fichier ouvert, antivirus), et supprimé seulement à la fin.
 */
function replaceDir(target, tmp) {
  const old = `${target}.old`;
  const RETRY = { recursive: true, force: true, maxRetries: 3, retryDelay: 200 };
  fs.rmSync(old, RETRY);
  const had = fs.existsSync(target);
  try {
    if (had) fs.renameSync(target, old);
    try {
      fs.renameSync(tmp, target);
    } catch (err) {
      if (had) fs.renameSync(old, target);
      throw err;
    }
  } catch (err) {
    fs.rmSync(tmp, RETRY);
    throw new Error(`données de référence non remplacées (${err.code || err.message}) : données en place gardées`, { cause: err });
  }
  try {
    fs.rmSync(old, RETRY);
  } catch {
    // reste de l'ancien dossier : supprimé au prochain téléchargement
  }
}

/**
 * Remplacement coupé net (coupure de courant entre les deux renommages de replaceDir) : le dossier des données manque
 * et les bonnes données sont restées dans « .old ». Remises en place ; sans cela, l'app restait sans données (et hors
 * ligne, sans moyen de les retrouver). Ne touche à rien si le dossier existe. Rend vrai si quelque chose a été remis.
 */
export function recoverInterruptedReplace(dir = REF_DIR) {
  const target = String(dir).replace(/[\\/]$/, '');
  const old = `${target}.old`;
  try {
    if (fs.existsSync(target) || !fs.existsSync(path.join(old, 'meta.json'))) return false;
    fs.renameSync(old, target);
    console.warn('Données de référence : un remplacement coupé net les avait laissées de côté (.old) ; elles sont remises en place.');
    return true;
  } catch {
    return false; // dossier verrouillé : nouvel essai au prochain chargement
  }
}

export function readMeta(dir = REF_DIR) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** Fichiers coriolis en place (ships/, modules/, modifications/), par chemin relatif : ceux que setDigest a comptés. */
function coriolisFiles(dir) {
  const out = new Map();
  const walk = (rel) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(dir, 'coriolis', rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p);
      else if (CORIOLIS_PATH.test(p)) out.set(p, fs.readFileSync(path.join(dir, 'coriolis', p)));
    }
  };
  for (const top of ['ships', 'modules', 'modifications']) walk(top);
  return out;
}

/**
 * Les données de référence EN PLACE sont-elles bien les versions figées de cette version de l'app (SOURCES) ? Les
 * empreintes ne sont vérifiées qu'au téléchargement : une copie téléchargée avant le figeage des versions (depuis
 * « master », sans empreinte), ou modifiée depuis, restait utilisée sans un mot, et « Mettre à jour les données » l'aurait
 * changée. Ici, au chargement : commits notés dans meta.json, empreinte de chaque table FDevIDs, d'eddb.js (s'il est
 * là : l'app marche sans) et de l'ensemble coriolis. Environ 2 Mo relus à chaque chargement (quelques fois au
 * démarrage, et après un téléchargement).
 * @returns {{ pinned: boolean, problems: string[] }} problems : chaque écart, en français
 */
export function verifyReference(dir = REF_DIR, sources = SOURCES) {
  const base = String(dir).replace(/[\\/]$/, '');
  const meta = readMeta(base);
  if (!meta) return { pinned: false, problems: ['meta.json absent ou illisible : données jamais téléchargées'] };
  const problems = [];
  const noted = meta.sources && typeof meta.sources === 'object' ? meta.sources : null;
  if (!noted) problems.push('versions non notées dans meta.json : données téléchargées avant le figeage des versions');
  else for (const [name, s] of Object.entries(sources)) {
    const n = Object.hasOwn(noted, name) ? noted[name] : null;
    if (!n) problems.push(`${name} : version non notée dans meta.json`);
    else if (n.commit !== s.commit || n.repo !== s.repo) {
      problems.push(`${name} : ${n.repo}@${String(n.commit).slice(0, 10)} en place, ${s.repo}@${s.commit.slice(0, 10)} attendu`);
    }
  }
  const check = (label, file, expected, { optional = false } = {}) => {
    let buf;
    try {
      buf = fs.readFileSync(file);
    } catch {
      if (!optional) problems.push(`${label} absent`);
      return;
    }
    const actual = sha256(buf);
    if (actual !== expected) problems.push(`${label} : empreinte ${actual.slice(0, 12)}… en place, ${expected.slice(0, 12)}… attendue`);
  };
  for (const [f, h] of Object.entries(sources.fdevids.files)) check(`fdevids/${f}`, path.join(base, 'fdevids', f), h);
  for (const [f, h] of Object.entries(sources.edsy.files)) check(`edsy/${f}`, path.join(base, 'edsy', f), h, { optional: true });
  const coriolis = coriolisFiles(base);
  if (!coriolis.size) problems.push('coriolis-data absent');
  else {
    const actual = setDigest(coriolis);
    if (actual !== sources.coriolis.digest) problems.push(`coriolis-data (${coriolis.size} fichiers) : empreinte ${actual.slice(0, 12)}… en place, ${sources.coriolis.digest.slice(0, 12)}… attendue`);
  }
  return { pinned: problems.length === 0, problems };
}
