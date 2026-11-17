// Processus lancés par l'app de bureau (serveur, interface, mise à jour de la base) avec le Node du PC, sans fenêtre de
// console. Leur sortie va dans le journal de l'app (bureau.log, dans %APPDATA%\Elite Compagnon) : « lis les logs ».
//
// Le journal peut être posté sur Discord pour un diagnostic : ton dossier personnel y devient %USERPROFILE% (jamais
// ton nom d'utilisateur Windows) et les adresses perdent leurs paramètres (?…). Il s'écrit en arrière-plan, par blocs,
// jamais dans le fil principal de l'app à chaque ligne.

const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const TAILLE_MAX = 2 * 1024 * 1024; // au-delà, bureau.log devient bureau.1.log (une seule copie gardée)

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Anonymiseur d'un texte du journal : le dossier personnel (`home`, quelle que soit l'écriture de ses séparateurs)
 * devient %USERPROFILE%, et les adresses web perdent leurs paramètres (?… et #…).
 */
function anonymiseur(home = os.homedir()) {
  const parties = String(home || '').split(/[\\/]+/).filter(Boolean);
  const re = parties.length >= 2
    ? new RegExp(`${parties.map(echapper).join('(?:\\\\{1,2}|/)')}(?=[\\\\/\\s"'<>:;,)\\]]|$)`, 'gi')
    : null;
  return (texte) => {
    let s = String(texte);
    if (re) s = s.replace(re, '%USERPROFILE%');
    return s.replace(/\b((?:https?|wss?):\/\/[^\s?#"'<>]*)[?#][^\s"'<>]*/gi, '$1?…');
  };
}

/**
 * Journal de l'app : une ligne par message, horodatée, préfixée du processus, anonymisée. Les lignes sont mises de côté
 * puis écrites en arrière-plan (une écriture à la fois, dans l'ordre) ; `attendre()` rend la promesse de la dernière.
 */
function journal(fichier, { home = os.homedir(), tailleMax = TAILLE_MAX } = {}) {
  const anonymiser = anonymiseur(home);
  const copie = fichier.replace(/\.log$/, '.1.log');
  let attente = '';
  let planifie = false;
  let taille = null; // lue au premier bloc, puis suivie en mémoire
  let chaine = Promise.resolve();

  async function ecrireBloc() {
    planifie = false;
    const bloc = attente;
    attente = '';
    if (!bloc) return;
    try {
      if (taille === null) {
        await fsp.mkdir(path.dirname(fichier), { recursive: true });
        taille = await fsp.stat(fichier).then((s) => s.size, () => 0);
      }
      if (taille > tailleMax) {
        await fsp.rename(fichier, copie).catch(() => {});
        taille = 0;
      }
      await fsp.appendFile(fichier, bloc);
      taille += Buffer.byteLength(bloc);
    } catch {
      // un journal qui ne s'écrit pas n'arrête jamais l'app
    }
  }

  const ecrire = (nom, texte) => {
    const d = new Date(); // heure locale du PC, comme l'horloge de Windows
    const heure = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 19).replace('T', ' ');
    const lignes = anonymiser(texte).split(/\r?\n/).filter((l) => l.trim()).map((l) => `${heure} [${nom}] ${l}\n`).join('');
    if (!lignes) return;
    attente += lignes;
    if (planifie) return;
    planifie = true;
    chaine = chaine.then(() => new Promise((r) => setImmediate(r))).then(ecrireBloc);
  };
  return { ecrire, fichier, attendre: () => chaine };
}

/**
 * Lance un script Node avec un canal IPC. Rend { enfant, pret } : `pret` se résout au message { type: 'pret' } et se
 * rejette (avec un message en français) si le processus envoie { type: 'erreur' } ou s'arrête avant. `surSortie` est
 * appelé quand il s'arrête, prêt ou non.
 */
function lancerEnfant({ node, script, args = [], cwd, env, nom, log, surMessage, surSortie, spawnImpl = spawn }) {
  const enfant = spawnImpl(node, [script, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
  let dernier = '';
  const lire = (flux) => flux?.on('data', (b) => {
    const t = b.toString('utf8');
    dernier = (dernier + t).slice(-2000);
    log?.ecrire(nom, t);
  });
  lire(enfant.stdout);
  lire(enfant.stderr);
  const pret = new Promise((resolve, reject) => {
    let fini = false;
    enfant.on('message', (m) => {
      surMessage?.(m);
      if (fini) return;
      if (m?.type === 'pret') {
        fini = true;
        resolve(m);
      } else if (m?.type === 'erreur') {
        fini = true;
        reject(new Error(String(m.message || `${nom} : erreur`)));
      }
    });
    enfant.on('error', (err) => {
      log?.ecrire(nom, `lancement impossible : ${err.message}`);
      if (!fini) {
        fini = true;
        reject(new Error(`${nom} : lancement impossible (${err.message})`));
      }
    });
    enfant.on('exit', (code, signal) => {
      log?.ecrire(nom, `arrêté (code ${code ?? '—'}${signal ? `, signal ${signal}` : ''})`);
      if (!fini) {
        fini = true;
        reject(new Error(raisonArret(nom, dernier, code)));
      }
      surSortie?.(code, signal);
    });
  });
  return { enfant, pret };
}

// --- Port déjà pris : quel programme le tient ---

const systeme32 = (exe, env = process.env) => path.win32.join(String(env.SystemRoot || env.windir || 'C:\\Windows'), 'System32', exe);

/** Numéro du processus qui écoute sur ce port, d'après la sortie de « netstat -ano -p TCP » (toutes langues), ou null. */
function pidSurPort(sortie, port) {
  for (const l of String(sortie || '').split(/\r?\n/)) {
    // TCP    127.0.0.1:3001    0.0.0.0:0    LISTENING    1234 (adresse distante nulle : un port en écoute)
    const m = /^\s*TCP\s+\S*:(\d+)\s+(?:0\.0\.0\.0|\[::\]|\*):0\s+\S+\s+(\d+)\s*$/i.exec(l);
    if (m && Number(m[1]) === Number(port) && Number(m[2]) > 0) return Number(m[2]);
  }
  return null;
}

/** Nom du programme d'après « tasklist /FO CSV /NH » (« "node.exe","1234",… »), ou null. */
function nomProcessus(sortie) {
  return /^"([^"]+)","\d+"/m.exec(String(sortie || ''))?.[1] ?? null;
}

/** Programme qui tient ce port : { pid, nom }, ou null (introuvable, ou Windows ne répond pas). */
function quiTientLePort(port, { exec = execFileSync, env = process.env } = {}) {
  try {
    const opts = { encoding: 'utf8', timeout: 5000, windowsHide: true };
    const pid = pidSurPort(exec(systeme32('NETSTAT.EXE', env), ['-ano', '-p', 'TCP'], opts), port);
    if (!pid) return null;
    return { pid, nom: nomProcessus(exec(systeme32('tasklist.exe', env), ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], opts)) };
  } catch {
    return null;
  }
}

/** Message pour un joueur : le port pris, le programme qui le tient s'il est connu, et quoi faire. */
function messagePortPris(nom, port, qui) {
  const ou = port ? `Le port ${port} (${nom})` : `Le port du ${nom}`;
  if (qui?.nom && !/^(?:node|electron|elite compagnon)\.exe$/i.test(qui.nom)) {
    return `${ou} est déjà pris par le programme « ${qui.nom} » (n° ${qui.pid}). Ferme-le, puis relance Elite Compagnon.`;
  }
  const par = qui?.nom ? ` par « ${qui.nom} » (n° ${qui.pid})` : '';
  return `${ou} est déjà pris${par} : une autre copie d'Elite Compagnon tourne sans doute encore. Quitte-la (clic droit sur son icône près de l'horloge, puis « Quitter »), ou redémarre le PC, puis relance.`;
}

/** Message d'un processus arrêté avant d'être prêt : la cause connue, sinon la fin de sa sortie. */
function raisonArret(nom, sortie, code, { qui = quiTientLePort } = {}) {
  if (/EADDRINUSE/.test(sortie)) {
    const port = Number(/EADDRINUSE[^\n]*?:(\d{2,5})\b/.exec(sortie)?.[1]) || null;
    return messagePortPris(nom, port, port ? qui(port) : null);
  }
  // Node.js mis à jour (version majeure) depuis l'installation : better-sqlite3 (la base) a été préparé pour l'ancien,
  // et le serveur meurt sur « NODE_MODULE_VERSION … » ou ERR_DLOPEN_FAILED, 4 lignes de pile en anglais
  if (/NODE_MODULE_VERSION|ERR_DLOPEN_FAILED/.test(sortie)) {
    return `${nom} : Node.js a changé de version depuis l'installation d'Elite Compagnon, et la base n'est plus lisible par cette version. Relance l'installation (npm run installer, dans le dossier de l'app), puis relance l'app. Tes données ne sont pas touchées.`;
  }
  const fin = sortie.trim().split(/\r?\n/).slice(-4).join('\n');
  return `${nom} s'est arrêté (code ${code ?? '—'}).${fin ? `\n\n${fin}` : ''}`;
}

/** Lance un script jusqu'au bout (mise à jour de la base) : rejette si le code de sortie n'est pas 0. */
function executer({ node, script, args = [], cwd, env, nom, log, spawnImpl = spawn }) {
  return new Promise((resolve, reject) => {
    const enfant = spawnImpl(node, [script, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let sortie = '';
    for (const flux of [enfant.stdout, enfant.stderr]) {
      flux?.on('data', (b) => {
        sortie = (sortie + b.toString('utf8')).slice(-2000);
        log?.ecrire(nom, b.toString('utf8'));
      });
    }
    enfant.on('error', (err) => reject(new Error(`${nom} : lancement impossible (${err.message})`)));
    enfant.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(raisonArret(nom, sortie, code)))));
  });
}

module.exports = { TAILLE_MAX, anonymiseur, journal, lancerEnfant, executer, raisonArret, pidSurPort, nomProcessus, quiTientLePort, messagePortPris };
