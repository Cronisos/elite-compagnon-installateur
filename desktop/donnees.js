// Dossier des données de l'app de bureau : %APPDATA%\Elite Compagnon\donnees. Sur le PC de celui qui développe, et
// seulement s'il le demande (ELITE_COPIER_DONNEES_DEV=1), les données de server/data (celles de npm run dev) y sont
// COPIÉES une fois au premier lancement : l'original n'est jamais modifié ni effacé. Sans ce marqueur, jamais de copie :
// un dossier de l'app zippé tel quel (server/data compris) ne recopie pas les données de son auteur chez les autres.
// La copie se fait dans un dossier temporaire voisin, renommé à la fin : un lancement coupé en plein milieu ne laisse
// pas un dossier à moitié rempli que l'app prendrait pour le bon.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const NOM_APP = 'Elite Compagnon'; // nom du dossier des données (%APPDATA%) et identité Windows de l'app : ne change pas
const NOM_AFFICHE = 'Enova'; // nom montré au joueur (titres de fenêtres, bulles, messages)
const SOUS_DOSSIER = 'donnees';
/** Dossier de l'overlay (places des fenêtres en jeu…), dans celui de l'app (overlay/dossier.js). */
const SOUS_DOSSIER_OVERLAY = 'overlay';
/** Ancien dossier de l'overlay, d'avant son rangement avec l'app : %APPDATA%\elite-companion-overlay. */
const ANCIEN_OVERLAY = 'elite-companion-overlay';
/** Marqueur explicite du développeur : copier server/data au premier lancement. */
const MARQUEUR_DEV = 'ELITE_COPIER_DONNEES_DEV';

/** Fichiers jamais copiés : journaux temporaires de SQLite (la base est refermée), copies en cours. */
const IGNORES = [/-journal$/i, /-wal$/i, /-shm$/i, /\.tmp-\d+$/i];

/** Chemin réseau (\\serveur\partage, //serveur) ou de périphérique (\\?\, \\.\, \??\) : refusé par le serveur (core/paths.js). */
function estReseau(p) {
  const s = String(p).trim();
  return /^[\\/]{2}/.test(s) || /^[\\/]\?\?[\\/]/.test(s);
}

/**
 * Dossier de Windows où ranger l'app : { base, repli }. %APPDATA% d'habitude ; redirigé sur le réseau (profil itinérant
 * d'entreprise, \\serveur\…), le serveur refuserait ce dossier et l'app ne démarrerait pas : %LOCALAPPDATA% à la place,
 * toujours sur ce PC, et `repli` dit pourquoi (écrit dans bureau.log).
 */
function racineApp(env = process.env) {
  const appData = String(env.APPDATA || '').trim();
  if (!appData) throw new Error('Variable APPDATA absente : impossible de trouver le dossier des données de Windows.');
  if (!estReseau(appData)) return { base: appData, repli: null };
  const local = String(env.LOCALAPPDATA || '').trim();
  if (local && !estReseau(local)) {
    return { base: local, repli: `%APPDATA% est sur le réseau (${appData}) : dossier de l'app rangé dans %LOCALAPPDATA% (${path.join(local, NOM_APP)})` };
  }
  throw new Error(`Tes dossiers Windows %APPDATA% (${appData}) et %LOCALAPPDATA% sont sur le réseau : Enova a besoin d'un dossier de ce PC pour ses données. Demande à la personne qui gère ce PC d'en garder un sur son disque.`);
}

/** Dossier racine de l'app (Electron y met aussi son cache) : %APPDATA%\Elite Compagnon (repli : racineApp). */
function dossierApp(env = process.env) {
  return path.join(racineApp(env).base, NOM_APP);
}

/**
 * Dossier de l'app au lancement (main.js, avant même app.ready). Sans dossier utilisable, l'app ne peut rien faire :
 * `montrer(titre, texte)` dit pourquoi, en français et sans pile technique (dialog.showErrorBox, qui marche avant
 * ready sous Windows), puis `arreter(1)` coupe le lancement. Rend le dossier, ou null après l'arrêt.
 */
function dossierAppOuArret({ montrer, arreter }, env = process.env) {
  try {
    return dossierApp(env);
  } catch (err) {
    montrer(NOM_AFFICHE, `Enova ne peut pas démarrer.\n\n${err.message}`);
    arreter(1);
    return null;
  }
}

/** Pourquoi le dossier de l'app n'est pas sous %APPDATA% (à écrire dans bureau.log), ou null. */
function repliDossierApp(env = process.env) {
  try {
    return racineApp(env).repli;
  } catch {
    return null;
  }
}

/** Dossier des données du joueur pour le serveur (ELITE_DATA_DIR). */
function dossierDonnees(env = process.env) {
  return path.join(dossierApp(env), SOUS_DOSSIER);
}

/**
 * Dossier à copier au premier lancement : server/data de `racine`, seulement avec le marqueur du développeur
 * (ELITE_COPIER_DONNEES_DEV=1). Sinon null : l'app démarre vide. Jamais déduit de « app non empaquetée » : l'app
 * tourne toujours depuis ses sources, chez tout le monde.
 */
function sourceDev(racine, env = process.env) {
  return String(env[MARQUEUR_DEV] ?? '').trim() === '1' ? path.join(racine, 'server', 'data') : null;
}

/** Des données de joueur dans server/data (base, jeton…) laissées de côté faute de marqueur ? (noté dans bureau.log) */
function donneesLaisseesDeCote(racine, env = process.env) {
  if (sourceDev(racine, env)) return false;
  try {
    return fs.readdirSync(path.join(racine, 'server', 'data')).some((n) => n !== 'reference' && !n.startsWith('.'));
  } catch {
    return false;
  }
}

function copier(source, cible) {
  fs.mkdirSync(cible, { recursive: true });
  for (const e of fs.readdirSync(source, { withFileTypes: true })) {
    if (IGNORES.some((re) => re.test(e.name))) continue;
    const de = path.join(source, e.name);
    const vers = path.join(cible, e.name);
    if (e.isDirectory()) copier(de, vers);
    else if (e.isFile()) fs.copyFileSync(de, vers, fs.constants.COPYFILE_EXCL);
    // liens et autres : jamais suivis
  }
}

/**
 * Prépare le dossier des données. Rend { dossier, copie } : copie vaut le dossier source si les données de server/data
 * viennent d'y être copiées, null si le dossier existait déjà, s'il n'y a pas de source (pas de marqueur du
 * développeur, sourceDev) ou si server/data était vide ou absent.
 */
function preparerDonnees({ source, cible }) {
  if (fs.existsSync(cible)) return { dossier: cible, copie: null };
  if (!source) { // pas de marqueur du développeur : rien à copier, l'app démarre vide
    fs.mkdirSync(cible, { recursive: true });
    return { dossier: cible, copie: null };
  }
  const aCopier = fs.existsSync(source) && fs.readdirSync(source).some((n) => n !== 'reference' && !n.startsWith('.'));
  fs.mkdirSync(path.dirname(cible), { recursive: true });
  if (!aCopier) {
    fs.mkdirSync(cible);
    return { dossier: cible, copie: null };
  }
  // Restes d'une copie coupée (autre lancement) : effacés, c'étaient des copies incomplètes
  const prefixe = `${path.basename(cible)}.tmp-`;
  for (const n of fs.readdirSync(path.dirname(cible))) {
    if (n.startsWith(prefixe)) fs.rmSync(path.join(path.dirname(cible), n), { recursive: true, force: true });
  }
  const temp = `${cible}.tmp-${process.pid}`;
  copier(source, temp);
  fs.renameSync(temp, cible);
  return { dossier: cible, copie: source };
}

// --- « Effacer mes données » (Paramètres, Mon compte) ---
// Demandé pendant que le serveur tient la base ouverte : noté dans un fichier, puis fait au lancement suivant, avant
// le serveur. Le dossier des données est vidé, pas supprimé : vide, il n'est jamais rempli par la copie de
// server/data (celle de npm run dev).

const DEMANDE = 'effacer-donnees.demande';
/** Gardés : les données de référence (publiques, téléchargées à un commit figé), pour ne pas tout retélécharger. */
const GARDES = new Set(['reference']);
/** Fichiers du dossier de l'app qui sont aussi à toi : places des fenêtres, réglages du MAR et du pavé. */
const FICHIERS_APP = ['bureau.json'];
/** Journaux de l'app (pages visitées, adresses bloquées, chemins du PC) : bureau.log et sa copie bureau.1.log. */
const JOURNAUX_APP = /^bureau(?:\.\d+)?\.log$/i;

/** Note la demande d'effacement (faite au lancement suivant). */
function demanderEffacement(env = process.env, now = new Date()) {
  const dossier = dossierApp(env);
  fs.mkdirSync(dossier, { recursive: true });
  fs.writeFileSync(path.join(dossier, DEMANDE), JSON.stringify({ demande: now.toISOString() }));
}

/**
 * Vide un dossier de l'overlay. Un overlay encore lancé (il survit quelques minutes à l'app) peut tenir des fichiers de
 * Chromium ouverts : ceux-là restent (cache, rien à toi), le reste part. Rend true si quelque chose a été effacé.
 */
function viderDossier(dossier) {
  if (!fs.existsSync(dossier)) return false;
  try {
    fs.rmSync(dossier, { recursive: true, force: true });
    return true;
  } catch {
    // fichiers tenus ouverts : un par un, ce qui se laisse effacer
  }
  const parcourir = (d) => {
    let entrees = [];
    try {
      entrees = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entrees) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) parcourir(p);
      try {
        fs.rmSync(p, { recursive: e.isDirectory(), force: true });
      } catch {
        // tenu ouvert : laissé
      }
    }
  };
  parcourir(dossier);
  return true;
}

/**
 * Efface les données si c'est demandé : tout le dossier des données sauf la référence, les fichiers à toi du dossier
 * de l'app (places des fenêtres, journaux bureau.log), et les données de l'overlay (places des fenêtres en jeu,
 * fenêtres laissées montrées, réglage de la jauge des boucliers), y compris son ancien dossier. Rend la liste de ce
 * qui a été effacé, ou null sans demande.
 */
function effacerSiDemande({ app, cible }) {
  const demande = path.join(app, DEMANDE);
  if (!fs.existsSync(demande)) return null;
  const effaces = [];
  if (fs.existsSync(cible)) {
    for (const n of fs.readdirSync(cible)) {
      if (GARDES.has(n)) continue;
      fs.rmSync(path.join(cible, n), { recursive: true, force: true });
      effaces.push(n);
    }
  } else fs.mkdirSync(cible, { recursive: true });
  for (const n of fs.readdirSync(app)) {
    if (!FICHIERS_APP.includes(n) && !JOURNAUX_APP.test(n)) continue;
    try {
      fs.rmSync(path.join(app, n), { force: true });
      effaces.push(n);
    } catch {
      // journal tenu ouvert par un autre programme : laissé
    }
  }
  if (viderDossier(path.join(app, SOUS_DOSSIER_OVERLAY))) effaces.push(SOUS_DOSSIER_OVERLAY);
  if (viderDossier(path.join(path.dirname(app), ANCIEN_OVERLAY))) effaces.push(ANCIEN_OVERLAY);
  fs.rmSync(demande, { force: true }); // en dernier : coupé avant, l'effacement reprend au lancement suivant
  return effaces;
}

// --- « Restaurer une sauvegarde » (Paramètres, Mon compte) ---
// Comme l'effacement : demandé pendant que le serveur tient la base ouverte, noté dans un fichier, fait au lancement
// suivant, avant le serveur. Les sauvegardes sont faites par le serveur (server/src/core/sauvegardes.js) dans
// Documents\Elite Compagnon - sauvegardes ; les deux fichiers doivent s'accorder sur ce nom et sur la forme d'un nom
// de sauvegarde.

const DEMANDE_RESTAURATION = 'restaurer-donnees.demande';
const NOM_SAUVEGARDES = 'Elite Compagnon - sauvegardes';
const FICHE_SAUVEGARDE = 'sauvegarde.json';
const NOM_SAUVEGARDE = /^\d{4}-\d{2}-\d{2} \d{2}h\d{2}m\d{2}$/;
/** Dossier des données d'avant la dernière restauration, gardé à côté (un seul : le précédent est remplacé). */
const SUFFIXE_AVANT = '.avant-restauration';

/**
 * Dossier des sauvegardes : ELITE_SAUVEGARDES_DIR s'il est réglé (chemin absolu, comme pour le serveur :
 * server/src/core/paths.js), sinon Documents du compte Windows.
 */
function dossierSauvegardes(env = process.env, home = os.homedir()) {
  const propre = String(env.ELITE_SAUVEGARDES_DIR ?? '').trim();
  if (propre && path.isAbsolute(propre)) return path.resolve(propre);
  return path.join(env.USERPROFILE || home, 'Documents', NOM_SAUVEGARDES);
}

/** Note la demande de restauration (faite au lancement suivant). Rend faux si le nom n'est pas celui d'une sauvegarde. */
function demanderRestauration(nom, env = process.env) {
  if (typeof nom !== 'string' || !NOM_SAUVEGARDE.test(nom)) return false;
  const dossier = dossierApp(env);
  fs.mkdirSync(dossier, { recursive: true });
  fs.writeFileSync(path.join(dossier, DEMANDE_RESTAURATION), JSON.stringify({ nom }));
  return true;
}

/**
 * Restaure la sauvegarde demandée : le dossier des données actuel est mis de côté (jamais effacé), la sauvegarde est
 * copiée à sa place, et les données de référence déjà téléchargées sont reprises. La copie se fait dans un dossier
 * temporaire, échangé à la fin : coupée en route, les données actuelles restent en place. Rend null sans demande,
 * { nom, fichiers, laisse } après une restauration, { erreur } si la sauvegarde demandée n'est pas utilisable.
 */
function restaurerSiDemande({ app, cible, sauvegardes }) {
  const demande = path.join(app, DEMANDE_RESTAURATION);
  if (!fs.existsSync(demande)) return null;
  const abandon = (erreur) => {
    fs.rmSync(demande, { force: true });
    return { erreur };
  };
  let nom = null;
  try {
    nom = JSON.parse(fs.readFileSync(demande, 'utf8'))?.nom;
  } catch {
    return abandon('demande illisible');
  }
  if (typeof nom !== 'string' || !NOM_SAUVEGARDE.test(nom)) return abandon('nom de sauvegarde refusé');
  const source = path.join(sauvegardes, nom);
  try {
    if (JSON.parse(fs.readFileSync(path.join(source, FICHE_SAUVEGARDE), 'utf8'))?.app !== NOM_APP) return abandon('ce dossier n’est pas une sauvegarde de l’app');
  } catch {
    return abandon('sauvegarde introuvable ou incomplète');
  }
  const temp = `${cible}.tmp-restauration`;
  const laisse = `${cible}${SUFFIXE_AVANT}`;
  fs.rmSync(temp, { recursive: true, force: true });
  let fichiers = 0;
  const copier = (de, vers) => {
    fs.mkdirSync(vers, { recursive: true });
    for (const e of fs.readdirSync(de, { withFileTypes: true })) {
      if (e.isDirectory()) copier(path.join(de, e.name), path.join(vers, e.name));
      else if (e.isFile() && !(de === source && e.name === FICHE_SAUVEGARDE)) {
        fs.copyFileSync(path.join(de, e.name), path.join(vers, e.name));
        fichiers += 1;
      }
    }
  };
  try {
    copier(source, temp);
    // Données de référence déjà téléchargées : reprises telles quelles (une sauvegarde ne les contient pas)
    const reference = path.join(cible, 'reference');
    if (fs.existsSync(reference) && !fs.existsSync(path.join(temp, 'reference'))) fs.cpSync(reference, path.join(temp, 'reference'), { recursive: true });
    fs.rmSync(laisse, { recursive: true, force: true });
    if (fs.existsSync(cible)) fs.renameSync(cible, laisse);
    fs.renameSync(temp, cible);
  } catch (err) {
    fs.rmSync(temp, { recursive: true, force: true });
    // Échange coupé entre les deux renommages : on remet les données d'avant
    if (!fs.existsSync(cible) && fs.existsSync(laisse)) fs.renameSync(laisse, cible);
    return abandon(`copie impossible (${err.code || err.message})`);
  }
  fs.rmSync(demande, { force: true });
  return { nom, fichiers, laisse };
}

module.exports = {
  dossierSauvegardes, demanderRestauration, restaurerSiDemande,
  NOM_APP, NOM_AFFICHE, SOUS_DOSSIER_OVERLAY, ANCIEN_OVERLAY, MARQUEUR_DEV,
  dossierApp, dossierAppOuArret, dossierDonnees, repliDossierApp, sourceDev, donneesLaisseesDeCote,
  preparerDonnees, demanderEffacement, effacerSiDemande,
};
