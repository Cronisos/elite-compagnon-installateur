// Serveur isolé du banc de contrôle : le vrai serveur de la worktree (server/src/index.js), mais avec tout à lui.
//
//   - port libre choisi au lancement (jamais 3001, celui de l'app qui tourne peut-être) ;
//   - dossier de données temporaire (ELITE_DATA_DIR) : copie de server/data/reference et base SQLite neuve ;
//   - dossier de journaux de test (ELITE_JOURNAL_DIR) : les journaux d'une séance de référence, ou rien ;
//   - dossier d'options du jeu de test (ELITE_GAME_OPTIONS_DIR) : copie de scripts/controle/options ;
//   - dossier des sauvegardes temporaire (ELITE_SAUVEGARDES_DIR) : jamais les vrais Documents du PC ;
//   - réseau coupé (ELITE_NO_NETWORK=1), overlay jamais lancé (ELITE_NO_OVERLAY=1), tutoriels jamais lancés d'eux-mêmes (ELITE_SANS_TUTORIEL=1) ;
//   - horloge, aléa et langue figés (CONTROLE_NOW, CONTROLE_ALEA, CONTROLE_LANGUE, préchargés par figer.mjs), fuseau
//     Europe/Paris.
// Rien n'est lu ni écrit dans server/data, dans les vrais journaux ni dans les options du jeu.
//
// Usage dans une étape :
//   import { demarrerServeur } from '../banc/serveur.mjs';
//   const srv = await demarrerServeur({ seance: 'minage-rhino-2026-11-07' });
//   const etat = await srv.get('/api/state');
//   await srv.arreter();
// En ligne de commande (s'arrête avec Ctrl+C) :
//   npm run controle:serveur -- --seance=minage-rhino-2026-11-07 [--direct] [--maintenant=2026-11-07T14:00:00Z] [--garder]

import { fork } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { baseModele, copierBase } from './base.mjs';
import { FIGER, OPTIONS, RACINE, REFERENCE, SEANCES, SERVEUR } from './chemins.mjs';
import { verifierReference } from './reference.mjs';

const ENTREE = path.join(SERVEUR, 'src', 'index.js');
const SONDE = path.join(path.dirname(FIGER), 'sonde.mjs'); // préchargée avec { sonde: true }
const MEMOIRE = path.join(path.dirname(FIGER), 'memoire.mjs'); // préchargée avec { memoire: true }

/**
 * Ce que la sonde laisse faire au serveur isolé : lire son dossier temporaire, la worktree, les node_modules qu'elle
 * utilise (dans une worktree, souvent des liens vers ceux de l'app : lus, jamais écrits) et Node lui-même ; écrire dans
 * son dossier temporaire seulement. server/data de la worktree (dans l'app du joueur : SES données) : jamais, même en
 * lecture.
 *
 * Quand les node_modules sont des liens vers ceux de l'app (worktree), le client Prisma qui s'y trouve cherche aussi
 * son schéma à côté d'eux, dans le dossier de l'app (…/server/prisma) : lecture permise de ce seul dossier de code. Les
 * données de l'app à côté (…/server/data, …/data) restent interdites, même en lecture.
 */
export function permisSonde(racine) {
  const reel = (d) => {
    try { return fs.realpathSync.native(d); } catch { return null; }
  };
  const liens = ['', 'server', 'client', 'overlay'].map((d) => [path.join(RACINE, d, 'node_modules'), reel(path.join(RACINE, d, 'node_modules'))]).filter(([, r]) => r);
  const modules = liens.map(([, r]) => r);
  const ailleurs = liens.filter(([p, r]) => path.resolve(p).toLowerCase() !== path.resolve(r).toLowerCase()).map(([, r]) => path.dirname(r));
  const schemas = ailleurs.flatMap((d) => [path.join(d, 'prisma'), path.join(d, 'server', 'prisma')]);
  const donnees = [path.join(SERVEUR, 'data'), ...ailleurs.flatMap((d) => [path.join(d, 'data'), path.join(d, 'server', 'data')])];
  return {
    lire: [...new Set([RACINE, reel(RACINE), ...modules, ...schemas, path.dirname(process.execPath)].filter(Boolean))],
    ecrire: [racine, reel(racine)].filter(Boolean),
    interdits: [...new Set([...donnees, ...donnees.map(reel)].filter(Boolean))],
  };
}
const PRET_MS = 60_000; // démarrage : lecture des journaux, chargement des modules
const ARRET_MS = 10_000;
const TICK_MS = 500; // sondage du journal par le serveur (core/journalService.js)
export const CALME_MS = 1500; // après la lecture : écritures différées des modules (colonisation, sessions…)
export const GUARD = { 'X-Elite-Compagnon': '1' };

// Variables du parent jamais transmises : elles changeraient le comportement du serveur isolé
const ECARTEES = [/^ELITE_/, /^CONTROLE_/, /^GOLDEN_/, /^NODE_OPTIONS$/, /^NODE_TEST_CONTEXT$/, /^NODE_V8_COVERAGE$/, /^DATABASE_URL$/, /^TZ$/];

/** Ports de l'app du joueur (serveur, interface) : jamais pris par le banc, même si le système les proposait. */
export const PORTS_INTERDITS = new Set([3001, 5173]);

/** Port TCP libre sur 127.0.0.1 (le système en choisit un, on le rend aussitôt), hors des ports de l'app. */
export async function portLibre() {
  for (let essai = 0; essai < 20; essai += 1) {
    const port = await new Promise((resolve, reject) => {
      const s = net.createServer();
      s.unref();
      s.on('error', reject);
      s.listen(0, '127.0.0.1', () => {
        const { port: p } = s.address();
        s.close(() => resolve(p));
      });
    });
    if (!PORTS_INTERDITS.has(port)) return port;
  }
  throw new Error('Aucun port libre trouvé pour le serveur isolé.');
}

/** Séance de référence : { id, dossier, description, fichiers (journaux, dans l'ordre), maintenant } */
export function lireSeance(id) {
  if (!/^[a-z0-9-]{3,80}$/.test(String(id))) throw new Error(`Séance inconnue : « ${id} » (minuscules, chiffres et tirets).`);
  const dossier = path.join(SEANCES, id);
  const meta = path.join(dossier, 'seance.json');
  if (!fs.existsSync(meta)) throw new Error(`Séance inconnue : ${id} (pas de ${path.relative(SEANCES, meta)} dans scripts/controle/seances).`);
  const info = JSON.parse(fs.readFileSync(meta, 'utf8'));
  const fichiers = fs.readdirSync(dossier).filter((f) => /^Journal\.\d{4}-\d{2}-\d{2}T\d{6}\.\d{2}\.log$/.test(f)).sort();
  if (!fichiers.length) throw new Error(`Séance ${id} : aucun journal.`);
  return { id, dossier, ...info, fichiers: fichiers.map((f) => path.join(dossier, f)) };
}

/** Liste des séances de référence, dans l'ordre alphabétique. */
export function listerSeances() {
  if (!fs.existsSync(SEANCES)) return [];
  return fs.readdirSync(SEANCES, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(SEANCES, e.name, 'seance.json'))).map((e) => e.name).sort();
}

/** Dernier horodatage d'un journal (ms), pour dater le fichier comme le jeu l'aurait laissé. */
export function derniereHeure(fichier) {
  const lignes = fs.readFileSync(fichier, 'utf8').trimEnd().split('\n');
  for (let i = lignes.length - 1; i >= 0; i -= 1) {
    const m = /"timestamp"\s*:\s*"([^"]+)"/.exec(lignes[i]);
    if (m && Number.isFinite(Date.parse(m[1]))) return Date.parse(m[1]);
  }
  return null;
}

/** Copie un journal dans le dossier de test, daté de sa dernière ligne (le « jeu tourne-t-il ? » en dépend). */
function poserJournal(source, dossier) {
  const cible = path.join(dossier, path.basename(source));
  fs.copyFileSync(source, cible);
  const t = derniereHeure(source);
  if (t) fs.utimesSync(cible, new Date(t), new Date(t));
  return cible;
}

/**
 * Date des fichiers d'options (la garde des commandes compare celle du rapport d'erreurs aux lancements du jeu) :
 * DATE_OPTIONS pour tous, sauf ceux nommés dans `dates` ({ "Bindings/BindingLoadingErrors.log": "2026-11-07T21:13:50Z" }).
 * Sans cela, la date serait celle de la copie, donc de l'heure réelle du contrôle.
 */
export const DATE_OPTIONS = '2026-10-01T00:00:00Z';

/**
 * Date de téléchargement des données de référence copiées (meta.json, downloadedAt) : une date fixe, celle du relevé des
 * versions figées. Les données elles-mêmes sont vérifiées par leurs empreintes (reference.mjs) ; sans cela, les
 * attendus (GET /status) changeraient avec le jour où chaque copie du projet a fait son téléchargement.
 */
export const DATE_REFERENCE = '2026-11-07T00:00:00.000Z';
function daterReference(dossier) {
  const fichier = path.join(dossier, 'meta.json');
  const meta = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  fs.writeFileSync(fichier, `${JSON.stringify({ ...meta, downloadedAt: DATE_REFERENCE }, null, 2)}\n`);
}
function daterOptions(dossier, dates) {
  const parcourir = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? parcourir(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of parcourir(dossier)) {
    const rel = path.relative(dossier, f).replace(/\\/g, '/');
    const quand = new Date(Object.hasOwn(dates, rel) ? dates[rel] : DATE_OPTIONS);
    if (!Number.isFinite(quand.getTime())) throw new Error(`Date d'option illisible pour ${rel} : ${dates[rel]}`);
    fs.utimesSync(f, quand, quand);
  }
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

function effacer(dossier) {
  try {
    fs.rmSync(dossier, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    return true;
  } catch {
    return false;
  }
}

let modele = null; // base modèle de ce lancement (une seule création par processus)
function base(racineBanc) {
  if (modele && fs.existsSync(modele)) return modele;
  modele = baseModele(path.join(racineBanc, 'base-modele'));
  return modele;
}

/**
 * Démarre un serveur isolé et attend qu'il réponde.
 * @param {object} o
 * @param {string} [o.seance]      séance de référence (scripts/controle/seances/<id>)
 * @param {string[]} [o.journaux]  ou fichiers journaux à poser (à la place d'une séance)
 * @param {'historique'|'direct'} [o.mode] historique : journaux posés avant le démarrage (relus au lancement) ;
 *                                 direct : posés un à un après, comme un jeu qui écrit pendant que l'app tourne
 * @param {string} [o.maintenant]  heure figée (ISO) ; défaut : celle de la séance, sinon 5 min après sa dernière ligne
 * @param {string} [o.alea]        graine de Math.random (défaut « controle »)
 * @param {string} [o.options]     dossier d'options du jeu à copier (défaut scripts/controle/options)
 * @param {boolean} [o.garder]     garder le dossier temporaire après l'arrêt (pour regarder)
 * @param {object} [o.env]         variables en plus pour le serveur
 * @param {(srv: object) => Promise<void>} [o.avantJournaux] mode direct : préparation par l'API (rôle d'un vaisseau…),
 *                                 serveur démarré, avant que le « jeu » n'écrive le premier journal
 * @param {number} [o.portInterface] port de l'interface du banc (banc/client.mjs) dont l'origine est acceptée
 *                                 (ELITE_UI_PORT) ; sans lui, celle du port 5173, comme l'app
 * @param {boolean} [o.sonde]      précharge banc/sonde.mjs : réseau, programmes et disque hors du banc relevés ET
 *                                 refusés, prototypes surveillés ; relevés lus par srv.demander('sonde')
 * @param {string} [o.base]        base SQLite à COPIER dans le dossier temporaire à la place d'une base neuve (le
 *                                 serveur ne travaille jamais sur le fichier donné, seulement sur sa copie)
 * @param {(dossiers: object) => void} [o.preparer] pose des fichiers dans les dossiers temporaires avant le démarrage
 *                                 (données que le serveur lit à son lancement : captures de Mes repères…)
 * @param {(ligne: string) => void} [o.sortie] reçoit chaque ligne écrite par le serveur
 * @param {boolean} [o.memoire]    précharge banc/memoire.mjs (avec --expose-gc) : srv.demander('memoire') rend la
 *                                 mémoire gardée par le serveur après un ramasse-miettes complet ({ tasMo, rssMo, limiteMo })
 * @param {number} [o.tasMo]       plafond du tas de V8 (--max-old-space-size, en Mo, de 64 à 16384) : le serveur qui
 *                                 le dépasse s'arrête (manque de mémoire), comme sur un PC qui en a moins
 */
export async function demarrerServeur(o = {}) {
  const seance = o.seance ? lireSeance(o.seance) : null;
  const journaux = seance ? seance.fichiers : (o.journaux || []);
  const mode = o.mode || 'historique';
  if (!['historique', 'direct'].includes(mode)) throw new Error(`Mode inconnu : ${mode} (historique ou direct).`);
  if (o.avantJournaux && mode !== 'direct') throw new Error("avantJournaux : seulement en mode direct (en historique, les journaux sont lus avant que l'API réponde).");
  const fin = journaux.map(derniereHeure).filter(Boolean).sort((a, b) => b - a)[0];
  const maintenant = o.maintenant || seance?.maintenant || (fin ? new Date(fin + 5 * 60_000).toISOString() : '2026-11-08T12:00:00Z');
  if (!Number.isFinite(Date.parse(maintenant)) || !/(Z|[+-]\d{2}:?\d{2})$/.test(String(maintenant).trim())) {
    throw new Error(`Heure figée illisible : « ${maintenant} » (date ISO avec fuseau, par exemple 2026-11-07T14:00:00Z).`);
  }
  // L'isolement ne se négocie pas : une étape peut ajouter des variables, jamais remplacer celles du banc
  const imposees = Object.keys(o.env || {}).filter((k) => /^ELITE_/.test(k) || ['TZ', 'NODE_OPTIONS'].includes(k));
  if (imposees.length) throw new Error(`Variables réservées au banc : ${imposees.join(', ')} (le serveur isolé les règle lui-même).`);
  if (o.portInterface !== undefined && (!Number.isInteger(o.portInterface) || o.portInterface < 1024 || o.portInterface > 65535 || PORTS_INTERDITS.has(o.portInterface))) {
    throw new Error(`Port d'interface refusé : ${o.portInterface} (un port libre de 1024 à 65535, jamais 3001 ni 5173, ceux de l'app).`);
  }
  if (o.tasMo !== undefined && (!Number.isInteger(o.tasMo) || o.tasMo < 64 || o.tasMo > 16384)) {
    throw new Error(`Plafond du tas refusé : ${o.tasMo} (un nombre entier de Mo, de 64 à 16384).`);
  }
  if (!fs.existsSync(path.join(REFERENCE, 'meta.json'))) {
    throw new Error(`Données de référence absentes (${REFERENCE}) : npm run controle:reference les télécharge (versions figées, empreintes vérifiées).`);
  }
  // Seulement les versions figées : un contrôle vert sur d'autres données validerait ce que « Mettre à jour les
  // données » remplacera (noms de vaisseaux et de modules, /status)
  await verifierReference();

  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-controle-'));
  const dossiers = { racine, donnees: path.join(racine, 'donnees'), journaux: path.join(racine, 'journaux'), options: path.join(racine, 'options'), sauvegardes: path.join(racine, 'sauvegardes') };
  const lignes = [];
  let enfant = null;
  const port = await portLibre();
  const url = `http://127.0.0.1:${port}`;

  const nettoyer = () => (o.garder ? false : effacer(racine));
  try {
    fs.mkdirSync(dossiers.journaux, { recursive: true });
    fs.cpSync(REFERENCE, path.join(dossiers.donnees, 'reference'), { recursive: true });
    daterReference(path.join(dossiers.donnees, 'reference'));
    if (o.base) {
      if (!fs.statSync(o.base, { throwIfNoEntry: false })?.isFile()) throw new Error(`Base à copier introuvable : ${o.base}`);
      copierBase(o.base, dossiers.donnees); // une copie : le fichier donné n'est jamais ouvert par le serveur
    } else copierBase(base(path.join(os.tmpdir(), `elite-controle-base-${process.pid}`)), dossiers.donnees);
    fs.cpSync(o.options || OPTIONS, dossiers.options, { recursive: true });
    daterOptions(dossiers.options, { ...(seance?.datesOptions || {}), ...(o.datesOptions || {}) });
    if (mode === 'historique') for (const f of journaux) poserJournal(f, dossiers.journaux);
    o.preparer?.(dossiers); // fichiers posés par l'étape avant le démarrage (dossiers temporaires seulement)

    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !ECARTEES.some((re) => re.test(k))));
    Object.assign(env, o.env || {}, {
      ELITE_PORT: String(port),
      ELITE_DATA_DIR: dossiers.donnees,
      ELITE_JOURNAL_DIR: dossiers.journaux,
      ELITE_GAME_OPTIONS_DIR: dossiers.options,
      ELITE_SAUVEGARDES_DIR: dossiers.sauvegardes,
      ELITE_NO_NETWORK: '1',
      ELITE_NO_OVERLAY: '1',
      ELITE_SANS_TUTORIEL: '1', // aucun tutoriel ne se lance de lui-même pendant le tour des pages
      ELITE_VIGIE: '1', // vigie des règles allumée (outil de développement, coupé chez les joueurs) : ses pages sont contrôlées
      ...(o.portInterface !== undefined ? { ELITE_UI_PORT: String(o.portInterface) } : {}),
      CONTROLE_NOW: maintenant,
      CONTROLE_ALEA: o.alea || 'controle',
      CONTROLE_LANGUE: 'fr-FR',
      TZ: 'Europe/Paris',
      CHECKPOINT_DISABLE: '1',
      NO_COLOR: '1',
      ...(o.sonde ? { CONTROLE_SONDE: JSON.stringify(permisSonde(racine)) } : {}),
    });

    let pret = false;
    enfant = fork(ENTREE, [], {
      cwd: SERVEUR,
      env,
      execArgv: [
        '--import', pathToFileURL(FIGER).href,
        ...(o.sonde ? ['--import', pathToFileURL(SONDE).href] : []),
        ...(o.memoire ? ['--expose-gc', '--import', pathToFileURL(MEMOIRE).href] : []),
        ...(o.tasMo !== undefined ? [`--max-old-space-size=${o.tasMo}`] : []),
      ],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    });
    const lire = (flux) => {
      let reste = '';
      flux.setEncoding('utf8');
      flux.on('data', (d) => {
        const morceaux = (reste + d).split(/\r?\n/);
        reste = morceaux.pop();
        for (const l of morceaux) {
          lignes.push(l);
          if (lignes.length > 5000) lignes.shift();
          o.sortie?.(l);
        }
      });
    };
    lire(enfant.stdout);
    lire(enfant.stderr);
    const sortiTot = new Promise((resolve) => enfant.once('exit', (code, signal) => resolve({ code, signal })));
    // Prêt seulement sur le message de NOTRE serveur, une fois SON port ouvert : jamais une réponse d'un autre serveur
    enfant.on('message', (m) => { if (m?.type === 'pret' && m.port === port) pret = true; });
    // Réponses du serveur aux demandes du banc par le canal IPC (srv.demander : liste des routes, relevés de la sonde)
    const attentes = new Map();
    let numero = 0;
    enfant.on('message', (m) => {
      const repondre = typeof m?.id === 'string' && attentes.get(m.id);
      if (repondre) repondre(m);
    });

    const limite = Date.now() + PRET_MS;
    for (;;) {
      const fini = await Promise.race([sortiTot, attendre(100).then(() => null)]);
      if (fini) throw new Error(`Le serveur isolé s'est arrêté au démarrage (code ${fini.code ?? fini.signal}) :\n${lignes.slice(-40).join('\n')}`);
      if (pret) {
        try {
          const r = await fetch(`${url}/api/state`, { signal: AbortSignal.timeout(5000) });
          if (r.ok && (await r.json())?.journal?.ready) break;
        } catch { /* pas encore */ }
      }
      if (Date.now() > limite) throw new Error(`Le serveur isolé ne répond pas après ${PRET_MS / 1000} s :\n${lignes.slice(-40).join('\n')}`);
    }

    const requete = async (methode, chemin, corps) => {
      const r = await fetch(`${url}${chemin}`, {
        method: methode,
        headers: { ...(corps !== undefined ? { 'content-type': 'application/json' } : {}), ...(methode === 'GET' ? {} : GUARD) },
        body: corps !== undefined ? JSON.stringify(corps) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
      const texte = await r.text();
      let corpsLu = texte;
      if ((r.headers.get('content-type') || '').includes('json')) {
        try { corpsLu = JSON.parse(texte); } catch { /* texte brut */ }
      }
      return { statut: r.status, type: (r.headers.get('content-type') || '').split(';')[0], corps: corpsLu };
    };

    const srv = {
      url,
      port,
      maintenant,
      mode,
      seance: seance?.id ?? null,
      dossiers,
      /** Lignes écrites par le serveur (les 5000 dernières). */
      sortie: () => lignes.slice(),
      /**
       * Demande au serveur par le canal IPC, jamais en HTTP : 'routes' (toutes les routes, core/routeList.js),
       * 'sonde' (relevés de banc/sonde.mjs), 'sonde:repere' (photo de départ des prototypes). Rend sa réponse.
       */
      demander: (type, delaiMs = 15_000) => new Promise((resolve, reject) => {
        if (!enfant?.connected) return reject(new Error(`Serveur isolé arrêté : demande « ${type} » impossible.`));
        const id = `banc-${(numero += 1)}`;
        const minuterie = setTimeout(() => {
          attentes.delete(id);
          reject(new Error(`Le serveur isolé n'a pas répondu à « ${type} » en ${delaiMs / 1000} s${type.startsWith('sonde') && !o.sonde ? ' (lancé sans la sonde : demarrerServeur({ sonde: true }))' : ''}.`));
        }, delaiMs);
        attentes.set(id, (m) => {
          clearTimeout(minuterie);
          attentes.delete(id);
          resolve(m);
        });
        enfant.send({ type, id });
      }),
      requete,
      get: async (chemin) => {
        const r = await requete('GET', chemin);
        if (r.statut >= 400) throw new Error(`GET ${chemin} : ${r.statut} ${JSON.stringify(r.corps).slice(0, 300)}`);
        return r.corps;
      },
      post: async (chemin, corps = {}) => (await requete('POST', chemin, corps)).corps,
      /** Mode direct : pose un journal et attend que le serveur en ait lu la dernière ligne. */
      poser: async (fichier) => {
        const t = derniereHeure(fichier);
        poserJournal(fichier, dossiers.journaux);
        const nom = path.basename(fichier);
        const borne = Date.now() + 30_000;
        for (;;) {
          await attendre(TICK_MS);
          const etat = await srv.get('/api/state');
          const recent = await srv.get('/api/journal/recent');
          const vu = etat.journal.file === nom && (t == null || recent.some((e) => Date.parse(e.timestamp) === t));
          if (vu) return;
          if (Date.now() > borne) throw new Error(`Mode direct : ${nom} pas lu par le serveur en 30 s.`);
        }
      },
      /** Laisse passer les écritures différées des modules. */
      calme: () => attendre(CALME_MS),
      /** Arrêt propre (canal IPC), puis effacement du dossier temporaire. */
      arreter: async () => {
        if (enfant && enfant.exitCode === null && enfant.signalCode === null) {
          try { enfant.send({ type: 'arret' }); } catch { /* canal déjà fermé */ }
          const fini = await Promise.race([sortiTot, attendre(ARRET_MS).then(() => null)]);
          if (!fini) {
            enfant.kill();
            await Promise.race([sortiTot, attendre(ARRET_MS)]);
          }
        }
        return { efface: nettoyer(), racine };
      },
    };

    if (mode === 'direct') {
      if (o.avantJournaux) await o.avantJournaux(srv);
      for (const f of journaux) await srv.poser(f);
    }
    await srv.calme();
    return srv;
  } catch (err) {
    if (enfant && enfant.exitCode === null) enfant.kill();
    await attendre(300);
    nettoyer();
    throw err;
  }
}

/**
 * Restes d'un contrôle interrompu (Ctrl+C, plantage) dans le dossier temporaire : seulement les dossiers créés par le
 * banc (noms elite-controle-…), et seulement s'ils ont plus de deux jours (un autre contrôle peut tourner en ce moment).
 */
const RESTE = /^elite-controle-(base-\d+|obtenu-\w{6}|vite-\w{6}|chrome-\w{6}|etapes-\w{6}|\d{4}-\d{2}-\d{2}T[\d-]+Z|\w{6})$/;
export function nettoyerAnciens(ageMs = 2 * 24 * 3600_000) {
  let n = 0;
  for (const e of fs.readdirSync(os.tmpdir(), { withFileTypes: true })) {
    if (!e.isDirectory() || !RESTE.test(e.name)) continue;
    const d = path.join(os.tmpdir(), e.name);
    try {
      if (Date.now() - fs.statSync(d).mtimeMs > ageMs && effacer(d)) n += 1;
    } catch { /* déjà parti */ }
  }
  return n;
}

/** Efface la base modèle de ce processus (fin du banc). */
export function nettoyerBanc() {
  effacer(path.join(os.tmpdir(), `elite-controle-base-${process.pid}`));
  modele = null;
}

// --- Ligne de commande ---
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync.native(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }));
  if (args.aide || args.help) {
    console.log('npm run controle:serveur -- [--seance=<id>] [--direct] [--maintenant=<ISO>] [--garder]');
    console.log(`Séances : ${listerSeances().join(', ') || 'aucune'}`);
    process.exit(0);
  }
  try {
    const srv = await demarrerServeur({
      seance: typeof args.seance === 'string' ? args.seance : undefined,
      mode: args.direct ? 'direct' : 'historique',
      maintenant: typeof args.maintenant === 'string' ? args.maintenant : undefined,
      garder: Boolean(args.garder),
      sortie: args.bavard ? (l) => console.log(`[serveur] ${l}`) : undefined,
    });
    console.log(`Serveur isolé prêt : ${srv.url}`);
    console.log(`  séance ${srv.seance ?? 'aucune'}, mode ${srv.mode}, heure figée ${srv.maintenant}`);
    console.log(`  données ${srv.dossiers.donnees}`);
    console.log(`  journaux ${srv.dossiers.journaux}`);
    console.log(`  options ${srv.dossiers.options}`);
    console.log('  écritures : en-tête « X-Elite-Compagnon: 1 ». Ctrl+C pour arrêter.');
    const fin = async () => {
      const { efface, racine } = await srv.arreter();
      nettoyerBanc();
      console.log(efface ? 'Serveur arrêté, dossier temporaire effacé.' : `Serveur arrêté, dossier gardé : ${racine}`);
      process.exit(0);
    };
    process.on('SIGINT', fin);
    process.on('SIGTERM', fin);
  } catch (err) {
    console.error(err.message);
    nettoyerBanc();
    process.exit(1);
  }
}
