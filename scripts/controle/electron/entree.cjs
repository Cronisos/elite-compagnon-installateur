// Essai de l'overlay dans le VRAI Electron (étape 26-overlay de npm run controle) : le vrai overlay/main.js et le vrai
// preload, chargés tels quels, avec seulement ce qui toucherait le PC du joueur remplacé :
//   - dossier de données temporaire (positions, cache, verrou d'instance : jamais ceux de l'overlay du joueur) ;
//   - fenêtres jamais affichées ni mises au premier plan, aucun raccourci global pris, aucune photo de l'écran
//     (desktopCapturer), presse-papiers jamais touché, curseur réputé loin des fenêtres ;
//   - demandes de permission notées puis TOUJOURS refusées (rien ne s'ouvre : ni micro, ni messagerie), même si
//     main.js les accordait : sa réponse est notée, c'est elle qui est jugée ;
//   - interface du banc sur 127.0.0.1:<port> (guards.setUiOriginForTest), page de sonde servie par essai.mjs.
// Lancé par essai.mjs : electron <app temporaire> --banc-origine=… --banc-rapport=… --banc-donnees=… --banc-overlay=…
// Le rapport (JSON) est écrit dans --banc-rapport, puis Electron s'arrête.

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const electron = require('electron');

const { app } = electron;
const arg = (nom) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3);
const ORIGINE = arg('banc-origine');
const RAPPORT = arg('banc-rapport');
const DONNEES = arg('banc-donnees');
const OVERLAY = arg('banc-overlay');
const DELAI_MS = 40_000;

const notes = {
  version: process.versions.electron,
  chrome: process.versions.chrome,
  gestionnaires: { demande: false, verification: false, peripheriques: false, requetes: false },
  demandes: [], // { permission, accordee, url }
  verifications: [], // { permission, accordee }
  sansGestionnaire: [],
  captures: 0,
  copies: [],
  focus: 0,
  affichages: 0,
  raccourcis: [],
  plateaux: 0,
  hauteurs: {},
  pages: [], // messages BANC:… des pages
  journal: [], // console.log / console.warn de main.js
  course: {},
  ordres: {},
  erreurs: [],
};

let fini = false;
function terminer(raison) {
  if (fini) return;
  fini = true;
  notes.fin = raison;
  try {
    fs.writeFileSync(RAPPORT, JSON.stringify(notes, null, 2));
  } catch (err) {
    process.stderr.write(`Rapport impossible : ${err.message}\n`);
  }
  app.exit(0);
}

if (!ORIGINE || !RAPPORT || !DONNEES || !OVERLAY) {
  process.stderr.write('entree.cjs : --banc-origine, --banc-rapport, --banc-donnees et --banc-overlay sont obligatoires.\n');
  app.exit(2);
} else {
  // Rien du joueur : tout sous le dossier temporaire, avant le verrou d'instance de main.js
  app.setName('elite-controle-overlay');
  for (const [nom, dossier] of [['userData', 'userData'], ['sessionData', 'session'], ['crashDumps', 'crash'], ['logs', 'logs'], ['temp', 'temp']]) {
    try {
      fs.mkdirSync(path.join(DONNEES, dossier), { recursive: true });
      app.setPath(nom, path.join(DONNEES, dossier));
    } catch (err) {
      notes.erreurs.push(`setPath ${nom} : ${err.message}`);
    }
  }
  app.disableHardwareAcceleration(); // le jeu garde la carte graphique pour lui
  setTimeout(() => terminer(`délai de ${DELAI_MS / 1000} s dépassé`), DELAI_MS).unref();
  process.on('uncaughtException', (err) => {
    notes.erreurs.push(`exception : ${err.stack || err}`);
    terminer('exception');
  });

  // main.js écrit ses messages dans la console : gardés pour le rapport
  for (const niveau of ['log', 'warn', 'error']) {
    const avant = console[niveau].bind(console);
    console[niveau] = (...a) => {
      notes.journal.push(a.map(String).join(' '));
      avant(...a);
    };
  }

  const guards = require(path.join(OVERLAY, 'guards.js'));
  guards.setUiOriginForTest(ORIGINE);

  // Messages des pages (console.info('BANC:{…}')) : lus par l'essai, quelle que soit la garde de main.js
  app.on('web-contents-created', (_e, wc) => {
    wc.on('console-message', (event, _niveau, message) => {
      const texte = typeof event?.message === 'string' ? event.message : String(message ?? '');
      if (!texte.startsWith('BANC:')) return;
      try {
        notes.pages.push({ url: wc.getURL(), ...JSON.parse(texte.slice(5)) });
      } catch {
        notes.erreurs.push(`message de page illisible : ${texte.slice(0, 200)}`);
      }
    });
  });

  // Même nom de classe que celle d'Electron : BrowserWindow.getAllWindows() ne garde que les « BrowserWindow »
  const BancWindow = class BrowserWindow extends electron.BrowserWindow {
    constructor(options = {}) {
      super({ ...options, show: false });
      this.hauteurDepart = options.height;
    }
    show() {
      notes.affichages += 1;
    }
    showInactive() {
      notes.affichages += 1;
    }
    focus() {
      notes.focus += 1;
    }
    moveTop() {}
  };

  const sessionDuBanc = new Proxy({}, {
    get(_cible, cle) {
      const ses = electron.session.defaultSession;
      if (cle === 'setPermissionRequestHandler') {
        return (fn) => {
          notes.gestionnaires.demande = typeof fn === 'function';
          ses.setPermissionRequestHandler((wc, permission, callback, details) => {
            let reponse;
            try {
              fn(wc, permission, (ok) => (reponse = ok), details);
            } catch (err) {
              notes.erreurs.push(`gestionnaire de permission : ${err.message}`);
            }
            notes.demandes.push({ permission, accordee: reponse === true, url: details?.externalURL || details?.requestingUrl || null });
            callback(false); // toujours refusé dans l'essai : rien ne s'ouvre sur le PC du joueur
          });
        };
      }
      if (cle === 'setPermissionCheckHandler') {
        return (fn) => {
          notes.gestionnaires.verification = typeof fn === 'function';
          ses.setPermissionCheckHandler((wc, permission, origine, details) => {
            const r = fn(wc, permission, origine, details);
            notes.verifications.push({ permission, accordee: r === true });
            return r;
          });
        };
      }
      if (cle === 'setDevicePermissionHandler') {
        return (fn) => {
          notes.gestionnaires.peripheriques = typeof fn === 'function';
          ses.setDevicePermissionHandler(fn);
        };
      }
      if (cle === 'webRequest') {
        const wr = ses.webRequest;
        return new Proxy(wr, {
          get(t, k) {
            if (k === 'onBeforeRequest') {
              return (...a) => {
                notes.gestionnaires.requetes = true;
                return t.onBeforeRequest(...a);
              };
            }
            const v = Reflect.get(t, k);
            return typeof v === 'function' ? v.bind(t) : v;
          },
        });
      }
      const v = Reflect.get(ses, cle);
      return typeof v === 'function' ? v.bind(ses) : v;
    },
  });

  const LOIN = { x: -100000, y: -100000 };
  const remplacants = {
    BrowserWindow: BancWindow,
    globalShortcut: {
      register: (acc) => {
        notes.raccourcis.push(acc);
        return true;
      },
      unregister() {},
      unregisterAll() {},
      isRegistered: () => false,
    },
    desktopCapturer: {
      getSources: async () => {
        notes.captures += 1;
        return [];
      },
    },
    clipboard: {
      writeText: (t) => notes.copies.push(String(t)),
      readText: () => '',
    },
    Tray: class {
      constructor() {
        notes.plateaux += 1;
      }
      setToolTip() {}
      setContextMenu() {}
      destroy() {}
    },
    session: new Proxy(electron.session, {
      get: (t, k) => (k === 'defaultSession' ? sessionDuBanc : Reflect.get(t, k)),
    }),
    screen: new Proxy({}, {
      get(_t, k) {
        if (k === 'getCursorScreenPoint') return () => ({ ...LOIN });
        const v = Reflect.get(electron.screen, k);
        return typeof v === 'function' ? v.bind(electron.screen) : v;
      },
    }),
  };
  const electronDuBanc = new Proxy(electron, { get: (t, k) => (Object.hasOwn(remplacants, k) ? remplacants[k] : Reflect.get(t, k)) });
  const charger = Module._load;
  // Le vrai canal des ordres (overlay/canal.js) : ELITE_PORT (essai.mjs) le branche sur le serveur du banc, jamais sur
  // le port 3001 de l'app du joueur. Les premiers ordres de l'essai passent par second-instance (lancement transmis),
  // les derniers par ce canal, comme en jeu.
  if (!process.env.ELITE_PORT) notes.erreurs.push('ELITE_PORT absent : le canal viserait l’app du joueur');
  Module._load = function chargerPourLeBanc(request, parent, ...reste) {
    if (request === 'electron' && parent?.filename && path.resolve(parent.filename).startsWith(path.resolve(OVERLAY))) return electronDuBanc;
    return charger.call(this, request, parent, ...reste);
  };

  // Le vrai overlay : arguments ordinaires (fenêtre Combat), gardes posées par lui
  process.argv.push('--only=combat');
  // Jamais le dossier ni le verrou de l'overlay du joueur : main.js range ses données sous %APPDATA%, qui doit être
  // celui du banc (essai.mjs), à côté de --banc-donnees
  const racineBanc = path.dirname(path.resolve(DONNEES)).toLowerCase() + path.sep;
  if (!path.resolve(process.env.APPDATA || '').toLowerCase().startsWith(racineBanc)) {
    process.stderr.write('entree.cjs : APPDATA doit être sous le dossier du banc (sinon l’overlay du joueur recevrait les ordres d’essai).\n');
    app.exit(2);
    return;
  }
  require(path.join(OVERLAY, 'main.js'));

  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  const ouvertes = (page) => electron.BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && new URL(w.webContents.getURL() || 'about:blank').pathname === `/hud/${page}`).length;
  const ordre = (...a) => app.emit('second-instance', {}, [process.execPath, '.', ...a]);
  // Requête au serveur du banc (essai.mjs), depuis ce processus : la garde des pages (webRequest) ne s'y applique pas
  const bancJson = (chemin) => new Promise((resolve) => {
    const req = require('node:http').get(`${ORIGINE}${chemin}`, { timeout: 3000 }, (res) => {
      let corps = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (corps += d));
      res.on('end', () => {
        try {
          resolve(JSON.parse(corps));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
  // Ordre écrit par le serveur du banc dans le canal, comme le ferait le serveur de l'app
  const parLeCanal = async (args) => {
    const r = await bancJson(`/banc/ordre?args=${encodeURIComponent(JSON.stringify(args))}`);
    if (r?.remis !== 1) notes.erreurs.push(`ordre du canal non remis (${JSON.stringify(r)})`);
  };
  async function attendrePage(etape, ms) {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      if (notes.pages.some((p) => p.etape === etape)) return true;
      await attendre(100);
    }
    return false;
  }

  app.whenReady().then(async () => {
    // Après main.js (son whenReady est posé avant) : sans gestionnaire, une demande serait accordée par Electron
    if (!notes.gestionnaires.demande) {
      electron.session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
        notes.sansGestionnaire.push(permission);
        callback(false);
      });
    }
    const combat = () => electron.BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().endsWith('/hud/combat'));
    if (!(await attendrePage('rechargee', 25_000))) notes.erreurs.push('la page Combat ne s’est pas rechargée (ou ne s’est pas chargée)');
    const w = combat();
    notes.hauteurs = { depart: w?.hauteurDepart ?? null, apres: w?.getBounds().height ?? null };

    // Coup d'œil ouvert, puis fermé et rouvert aussitôt (deux ordres dans le même instant), puis fermé par l'ordre suivant
    ordre('--only=combat,glance');
    await attendre(1500);
    notes.course.avant = ouvertes('glance');
    ordre('--only=combat');
    ordre('--only=combat,glance');
    await attendre(1500);
    notes.course.apresCourse = ouvertes('glance');
    ordre('--only=combat');
    await attendre(1500);
    notes.course.apresFermeture = ouvertes('glance');

    // Deux ordres du serveur qui se croisent : le plus ancien arrive en dernier
    const t = Date.now();
    ordre('--only=combat,glance', `--at=${t}`);
    await attendre(1200);
    ordre('--only=combat', `--at=${t - 150}`);
    await attendre(1200);
    notes.ordres.apresPerime = ouvertes('glance');
    ordre('--only=combat', `--at=${t + 1}`);
    await attendre(1200);
    notes.ordres.apresRecent = ouvertes('glance');

    // Ordre --if-running du serveur (fermer une fenêtre de module, remettre en ordre) : l'overlay qui tourne l'applique
    ordre('--only=combat,glance', `--at=${Date.now() + 10}`, '--if-running');
    await attendre(1200);
    notes.ordres.siLance = ouvertes('glance');
    ordre('--only=combat', `--at=${Date.now() + 20}`, '--if-running');
    await attendre(1200);
    notes.ordres.siLanceFerme = ouvertes('glance');

    // Canal du serveur (overlay/canal.js), comme en jeu : Signaux ouverte, rangée au départ du système (cachée, pas
    // détruite), puis réaffichée à l'arrivée, toujours la même fenêtre
    notes.canal = { branche: false };
    const fin = Date.now() + 6000;
    while (Date.now() < fin && !notes.canal.branche) {
      notes.canal.branche = (await bancJson('/banc/canal'))?.branches === 1;
      if (!notes.canal.branche) await attendre(200);
    }
    if (notes.canal.branche) {
      const signaux = () => electron.BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && new URL(x.webContents.getURL() || 'about:blank').pathname === '/hud/signals');
      const t2 = Date.now() + 1000; // après les --at des ordres d'avant
      await parLeCanal(['--only=combat,signals', `--at=${t2}`]);
      await attendre(1500);
      const premiere = signaux();
      notes.canal.ouverte = Boolean(premiere);
      await parLeCanal(['--only=combat', `--at=${t2 + 1}`]);
      await attendre(1000);
      notes.canal.rangee = Boolean(premiere) && !premiere.isDestroyed() && !premiere.isVisible() && signaux() === premiere;
      const affichages = notes.affichages;
      await parLeCanal(['--only=combat,signals', `--at=${t2 + 2}`]);
      await attendre(1000);
      notes.canal.memeFenetre = Boolean(premiere) && signaux() === premiere;
      notes.canal.reaffichee = notes.affichages > affichages;
    }
    terminer('fin de l’essai');
  }).catch((err) => {
    notes.erreurs.push(`essai : ${err.stack || err}`);
    terminer('exception');
  });
}
