// Tests de l'overlay (main.js) avec un Electron simulé : aucune fenêtre, aucun raccourci, aucune photo de l'écran.
// Vérifie les gardes : permissions refusées, requêtes vers l'extérieur annulées, cadres qui ne naviguent pas, le cadre
// principal qui ne fait que se recharger, pont réservé au cadre principal, photo réservée au cadre de capture et copie
// au Coup d'œil, à leur clic seulement, mode déplacement (clavier) seulement au clic, hauteur réservée aux fenêtres qui
// la suivent, fenêtre fermée puis rouverte aussitôt jamais orpheline, ordres qui se croisent, console d'Electron 35,
// raccourci déjà pris signalé (sortie de secours). Les mêmes gardes sont essayées dans le vrai Electron par l'étape
// 26-overlay de npm run controle.

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-overlay-test-'));
const APPDATA_TEST = path.join(USER_DATA, 'appdata');
fs.mkdirSync(path.join(APPDATA_TEST, 'elite-companion-overlay'), { recursive: true });
fs.writeFileSync(path.join(APPDATA_TEST, 'elite-companion-overlay', 'position-combat.json'), '{"x":10,"y":20}');
const fenetres = [];
const ipcOn = new Map();
const ipcHandle = new Map();
const raccourcis = new Map();
const sessionNotes = { request: null, check: null, device: null, beforeRequest: null, filter: null };
const captures = [];
const copies = [];
const plateaux = [];
const avertissements = [];
const journal = [];
const LOIN = { x: -5000, y: -5000 };
let curseur = LOIN;
let pret;
const whenReady = new Promise((r) => (pret = r));

class FakeWebContents extends EventEmitter {
  constructor() {
    super();
    this.mainFrame = { id: 'cadre-principal', url: '' };
    this.sent = [];
  }
  send(...args) {
    this.sent.push(args);
  }
  setWindowOpenHandler(fn) {
    this.openHandler = fn;
  }
}

class FakeWindow extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.bounds = { x: options.x ?? 0, y: options.y ?? 0, width: options.width, height: options.height };
    this.webContents = new FakeWebContents();
    this.destroyed = false;
    this.shownNow = options.show !== false;
    this.closeCalls = 0;
    this.focusCalls = 0;
    this.setBoundsCalls = [];
    fenetres.push(this);
  }
  loadURL(url) {
    this.url = url;
    this.webContents.mainFrame.url = url;
  }
  getBounds() {
    return { ...this.bounds };
  }
  setBounds(b) {
    this.setBoundsCalls.push(b);
    this.bounds = { ...b };
  }
  isDestroyed() {
    return this.destroyed;
  }
  isVisible() {
    return this.shownNow;
  }
  isFocused() {
    return false;
  }
  close() {
    this.closeCalls += 1;
    // Comme Electron : « closed » arrive plus tard, après d'autres ordres éventuels
    setImmediate(() => {
      this.destroyed = true;
      this.emit('closed');
    });
  }
  setIgnoreMouseEvents(ignore, options = {}) {
    this.ignore = ignore;
    this.forward = Boolean(options.forward);
  }
  setFocusable() {}
  focus() {
    this.focusCalls += 1;
  }
  showInactive() {
    const avant = this.shownNow;
    this.shownNow = true;
    if (!avant) this.emit('show');
  }
  hide() {
    const avant = this.shownNow;
    this.shownNow = false;
    if (avant) this.emit('hide');
  }
  setAlwaysOnTop() {}
  setOpacity(o) {
    this.opacity = o;
  }
}

const ecran = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 };
const app = Object.assign(new EventEmitter(), {
  requestSingleInstanceLock: () => true,
  whenReady: () => whenReady,
  getPath: () => USER_DATA,
  setPath: (nom, dossier) => {
    app.cheminsRegles = { ...app.cheminsRegles, [nom]: dossier };
  },
  quit: () => {
    app.quitCalls = (app.quitCalls || 0) + 1;
  },
});
const fauxElectron = {
  app,
  BrowserWindow: FakeWindow,
  Menu: { buildFromTemplate: (t) => t },
  Tray: class {
    constructor(icon) {
      this.note = { icon, bulle: null, menu: null };
      plateaux.push(this.note);
    }
    setToolTip(t) {
      this.note.bulle = t;
    }
    setContextMenu(m) {
      this.note.menu = m;
    }
  },
  clipboard: { writeText: (t) => copies.push(t) },
  desktopCapturer: {
    getSources: async () => {
      captures.push(Date.now());
      const thumb = { crop: () => thumb, getSize: () => ({ width: 1, height: 1 }), toPNG: () => Buffer.from([0x89]), toBitmap: () => Buffer.alloc(4), resize: () => thumb };
      return [{ display_id: '1', thumbnail: thumb }];
    },
  },
  globalShortcut: {
    register: (acc, fn) => {
      raccourcis.set(acc, fn);
      return acc !== 'Alt+Shift+Q' && acc !== 'Alt+Shift+H'; // déjà pris par un autre programme
    },
    unregisterAll: () => {},
  },
  ipcMain: {
    on: (ch, fn) => ipcOn.set(ch, fn),
    handle: (ch, fn) => ipcHandle.set(ch, fn),
  },
  nativeImage: { createFromBitmap: () => { const img = { resize: () => img, getSize: () => ({ width: 1, height: 1 }), toPNG: () => Buffer.from([0x89]) }; return img; } },
  screen: { getPrimaryDisplay: () => ecran, getDisplayMatching: () => ecran, getAllDisplays: () => [ecran], getCursorScreenPoint: () => ({ ...curseur }) },
  session: {
    defaultSession: {
      setPermissionRequestHandler: (fn) => (sessionNotes.request = fn),
      setPermissionCheckHandler: (fn) => (sessionNotes.check = fn),
      setDevicePermissionHandler: (fn) => (sessionNotes.device = fn),
      webRequest: { onBeforeRequest: (filter, fn) => Object.assign(sessionNotes, { filter, beforeRequest: fn }) },
    },
  },
};

// Canal des ordres du serveur (canal.js) simulé : jamais de connexion au vrai serveur de l'app (port 3001)
const canalNotes = { ouvertures: 0, fermetures: 0, onOrdre: null };
const fauxCanal = {
  ouvrirCanal: ({ onOrdre }) => {
    canalNotes.ouvertures += 1;
    canalNotes.onOrdre = onOrdre;
    return { fermer: () => (canalNotes.fermetures += 1), branche: () => true };
  },
};

// main.js lit process.argv et require('electron') à son chargement
const chargerMain = () => {
  const avant = Module._load;
  const argv = process.argv;
  const warn = console.warn;
  const log = console.log;
  console.warn = (m) => avertissements.push(String(m));
  console.log = (m) => journal.push(String(m));
  Module._load = function charger(request, ...rest) {
    if (request === 'electron') return fauxElectron;
    if (request === './canal.js') return fauxCanal;
    return avant.call(this, request, ...rest);
  };
  process.argv = [argv[0], 'main.js', '--only=combat'];
  // Jamais le vrai %APPDATA% : le dossier de l'overlay (overlay/dossier.js) est préparé dans un dossier de test
  const appData = process.env.APPDATA;
  process.env.APPDATA = APPDATA_TEST;
  try {
    require('./main.js');
  } finally {
    Module._load = avant;
    process.argv = argv;
    if (appData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = appData;
  }
  return () => {
    console.warn = warn;
    console.log = log;
  };
};

const tick = () => new Promise((r) => setImmediate(r));
const fenetre = (page) => fenetres.filter((w) => w.url === `http://127.0.0.1:5173/hud/${page}` && !w.destroyed).at(-1);
const evenement = (win) => ({ sender: win.webContents, senderFrame: win.webContents.mainFrame });
const centre = (win) => ({ x: win.bounds.x + Math.round(win.bounds.width / 2), y: win.bounds.y + Math.round(win.bounds.height / 2) });
const ordre = async (...args) => {
  app.emit('second-instance', {}, ['electron', '.', ...args]);
  await tick(); // l'ordre passe par whenReady().then(…)
};
const ouvertes = (page) => fenetres.filter((w) => w.url === `http://127.0.0.1:5173/hud/${page}` && !w.destroyed && w.closeCalls === 0).length;
const modesDeplacement = (win) => win.webContents.sent.filter(([ch]) => ch === 'edit-mode').map(([, on]) => on);

let rendre;
test.before(async () => {
  rendre = chargerMain();
  pret();
  await tick();
});
test.after(() => {
  rendre?.();
  fs.rmSync(USER_DATA, { recursive: true, force: true });
});

test('fenêtres : interface sur 127.0.0.1:5173 (jamais « localhost »), isolées', () => {
  const w = fenetre('combat');
  assert.ok(w, 'fenêtre combat ouverte');
  assert.equal(w.url, 'http://127.0.0.1:5173/hud/combat');
  assert.equal(w.options.webPreferences.sandbox, true);
  assert.equal(w.options.webPreferences.contextIsolation, true);
  assert.equal(w.options.webPreferences.nodeIntegration, undefined);
  assert.equal(w.options.webPreferences.nodeIntegrationInSubFrames, undefined);
});

test('permissions : toutes refusées (micro, caméra, presse-papiers, notifications, applications externes…)', () => {
  for (const p of ['media', 'clipboard-read', 'clipboard-sanitized-write', 'notifications', 'openExternal', 'geolocation', 'display-capture', 'fullscreen', 'pointerLock', 'midiSysex']) {
    let reponse = 'rien';
    sessionNotes.request(null, p, (ok) => (reponse = ok), {});
    assert.equal(reponse, false, p);
    assert.equal(sessionNotes.check(null, p, 'http://127.0.0.1:5173', {}), false, p);
  }
  assert.equal(sessionNotes.device({}), false, 'périphériques (HID, USB, série)');
});

test('requêtes : seulement l’interface (http et ws sur 127.0.0.1:5173) ; tout le reste annulé', () => {
  assert.deepEqual(sessionNotes.filter, { urls: ['<all_urls>'] });
  const verdict = (url) => {
    let r;
    sessionNotes.beforeRequest({ url }, (x) => (r = x));
    return r.cancel;
  };
  for (const ok of ['http://127.0.0.1:5173/hud/combat', 'http://127.0.0.1:5173/api/stream', 'ws://127.0.0.1:5173/?token=abc', 'http://127.0.0.1:5173/src/main.jsx?t=1']) assert.equal(verdict(ok), false, ok);
  for (const non of ['https://evil.example/x', 'http://localhost:5173/hud/combat', 'http://127.0.0.1:5174/', 'http://127.0.0.1:3001/api/state', 'file:///C:/Windows/win.ini', 'mailto:audit@example.invalid', 'ws://evil.example/', 'http://user:pass@127.0.0.1:5173/', 'pas une adresse']) assert.equal(verdict(non), true, non);
});

test('navigation : le cadre principal ne fait que se recharger ; un cadre inclus ne navigue jamais ; pas de fenêtre surgissante', () => {
  const w = fenetre('combat');
  const nav = (url) => {
    let empeche = false;
    w.webContents.emit('will-navigate', { url, preventDefault: () => (empeche = true) }, url);
    return empeche;
  };
  assert.equal(nav('http://127.0.0.1:5173/hud/combat'), false, 'rechargement demandé par Vite');
  for (const ailleurs of ['http://127.0.0.1:5173/hud/glance', 'http://localhost:5173/hud/combat', 'https://evil.example/', 'mailto:x@example.invalid']) assert.equal(nav(ailleurs), true, ailleurs);
  const cadre = (isMainFrame) => {
    let empeche = false;
    w.webContents.emit('will-frame-navigate', { url: 'mailto:x', isMainFrame, preventDefault: () => (empeche = true) });
    return empeche;
  };
  assert.equal(cadre(false), true, 'cadre inclus (iframe) : bloqué');
  assert.equal(cadre(true), false, 'cadre principal : laissé à will-navigate');
  assert.deepEqual(w.webContents.openHandler(), { action: 'deny' });
});

test('console des pages : erreurs écrites, sous la forme d’Electron 33 comme d’Electron 35 et plus', () => {
  const w = fenetre('combat');
  w.webContents.emit('console-message', {}, 3, 'erreur forme 33');
  w.webContents.emit('console-message', { level: 'error', message: 'erreur forme 35' }, 3, 'erreur forme 35');
  w.webContents.emit('console-message', { level: 'info', message: 'simple info' }, 1, 'simple info');
  assert.ok(journal.includes('[combat] erreur forme 33'));
  assert.ok(journal.includes('[combat] erreur forme 35'));
  assert.ok(!journal.some((l) => l.includes('simple info')));
});

test('photo de l’écran : seulement le cadre de capture, à son clic ; jamais une autre fenêtre, un cadre inclus, ni le cadre caché', async () => {
  await ordre('--only=combat,capture');
  const combat = fenetre('combat');
  const capture = fenetre('capture');
  assert.ok(capture);
  const photo = ipcHandle.get('capture');
  curseur = centre(combat);
  assert.equal(await photo(evenement(combat)), null, 'Combat, même avec la souris dessus');
  assert.equal(captures.length, 0, 'aucune photo prise pour la fenêtre Combat');
  curseur = centre(capture);
  assert.equal(await photo(evenement(capture)), null, 'cadre de capture encore caché (ouvert caché)');
  assert.equal(captures.length, 0);
  ipcOn.get('toggle-window')(evenement(combat), 'capture'); // bouton 📷 du HUD : montre le cadre
  assert.equal(capture.isVisible(), true);
  assert.equal(await photo({ sender: capture.webContents, senderFrame: { id: 'iframe', url: capture.url } }), null, 'message d’un cadre inclus : ignoré');
  assert.equal(await photo({ sender: capture.webContents, senderFrame: null }), null, 'cadre détaché : ignoré');
  curseur = LOIN;
  assert.equal(await photo(evenement(capture)), null, 'souris ailleurs : la page ne photographie pas d’elle-même');
  assert.equal(captures.length, 0);
  curseur = centre(capture);
  const shot = await photo(evenement(capture));
  assert.ok(shot && shot.image, 'clic sur 📷 : le cadre photographie sa zone');
  assert.equal(captures.length, 1);
  // Alt+Maj+P (raccourci, décidé par l'overlay) : même cadre caché
  curseur = LOIN;
  ipcOn.get('toggle-window')(evenement(combat), 'capture');
  assert.equal(capture.isVisible(), false);
  await raccourcis.get('Alt+Shift+P')();
  assert.equal(captures.length, 2, 'Alt+Maj+P photographie le cadre caché');
});

test('dossier de l’overlay : rangé avec l’app (effacé avec tes données), tes places reprises de l’ancien dossier', () => {
  const dossier = path.join(APPDATA_TEST, 'Elite Compagnon', 'overlay');
  assert.equal(app.cheminsRegles?.userData, dossier);
  assert.equal(fs.readFileSync(path.join(dossier, 'position-combat.json'), 'utf8'), '{"x":10,"y":20}');
  assert.ok(fs.existsSync(path.join(APPDATA_TEST, 'elite-companion-overlay', 'position-combat.json')), 'ancien dossier intact');
});

test('photo de l’écran : jamais un autre écran que celui du cadre', () => {
  const { screenSource } = require('./guards.js');
  const a = { display_id: '1' };
  const b = { display_id: '2' };
  assert.equal(screenSource([b, a], 1, 2), a);
  assert.equal(screenSource([b], 1, 2), null, 'écran du cadre absent : pas de photo de l’autre');
  assert.equal(screenSource([{ display_id: '' }, { display_id: '' }], 1, 2), null, 'numéros vides, deux écrans : impossible de savoir');
  assert.equal(screenSource([{ display_id: '' }], 1, 1).display_id, '', 'un seul écran : c’est forcément lui');
  assert.equal(screenSource([], 1, 1), null);
  assert.equal(screenSource(null, 1, 1), null);
});

test('survol d’un bouton : cliquable seulement curseur dessus, et rendue au jeu quand il sort sans prévenir', async () => {
  await ordre('--only=combat');
  const combat = fenetre('combat');
  const survol = ipcOn.get('hover');
  curseur = LOIN;
  survol(evenement(combat), true);
  assert.equal(combat.ignore, true, 'la page dit « survol » alors que la souris est ailleurs : les clics vont au jeu');
  curseur = centre(combat);
  survol(evenement(combat), true);
  assert.equal(combat.ignore, false, 'souris sur le bouton : la fenêtre prend le clic');
  // Clic sur « Non » : le bouton disparaît, la page ne dit jamais « fin du survol » ; la souris s'en va
  curseur = LOIN;
  await new Promise((r) => setTimeout(r, 450));
  assert.equal(combat.ignore, true, 'souris sortie : les clics repassent au jeu');
  survol({ sender: combat.webContents, senderFrame: { id: 'iframe', url: combat.url } }, true);
  assert.equal(combat.ignore, true, 'cadre inclus : ignoré');
});

test('crochet sur la souris (forward) : seulement pour une fenêtre affichée, jamais une fenêtre cachée', async () => {
  await ordre('--only=combat,capture');
  const combat = fenetre('combat');
  const capture = fenetre('capture');
  assert.equal(combat.ignore, true);
  assert.equal(combat.forward, true, 'affichée : la souris est suivie pour ses boutons');
  assert.equal(capture.isVisible(), false, 'cadre de capture ouvert caché');
  assert.equal(capture.ignore, true);
  assert.equal(capture.forward, false, 'cachée : aucun crochet sur la souris pour elle');
  const basculer = ipcOn.get('toggle-window');
  basculer(evenement(combat), 'capture');
  assert.equal(capture.isVisible(), true);
  assert.equal(capture.forward, true, 'montrée : suivie');
  basculer(evenement(combat), 'capture');
  assert.equal(capture.isVisible(), false);
  assert.equal(capture.forward, false, 'recachée : plus suivie');
  await ordre('--only=combat');
  await tick();
});

test('mode déplacement (la fenêtre prend le clavier) : seulement au clic sur la fenêtre affichée, ou en mode souris', () => {
  const combat = fenetre('combat');
  const basculer = ipcOn.get('toggle-edit');
  const focusAvant = combat.focusCalls;
  curseur = LOIN;
  basculer(evenement(combat));
  assert.equal(combat.focusCalls, focusAvant, 'souris ailleurs : la page ne prend pas le clavier');
  assert.deepEqual(modesDeplacement(combat), []);
  curseur = centre(combat);
  basculer({ sender: combat.webContents, senderFrame: { id: 'iframe', url: combat.url } });
  assert.deepEqual(modesDeplacement(combat), [], 'cadre inclus : ignoré');
  basculer(evenement(combat));
  assert.equal(combat.focusCalls, focusAvant + 1, 'clic sur ✥ : mode déplacement');
  curseur = LOIN;
  basculer(evenement(combat));
  assert.deepEqual(modesDeplacement(combat), [true, false], '📌 : en sortir reste possible');
  // Mode souris (Alt+Maj+K) : clavier possible, sans la souris sur la fenêtre
  raccourcis.get('Alt+Shift+K')();
  basculer(evenement(combat));
  assert.deepEqual(modesDeplacement(combat), [true, false, true]);
  basculer(evenement(combat));
  raccourcis.get('Alt+Shift+K')();
  // Cachée (Alt+Maj+H) : jamais, même la souris dessus
  raccourcis.get('Alt+Shift+H')();
  curseur = centre(combat);
  basculer(evenement(combat));
  assert.equal(modesDeplacement(combat).length, 4, 'fenêtre cachée : rien');
  raccourcis.get('Alt+Shift+H')();
  curseur = LOIN;
});

test('copie : seulement le Coup d’œil, à son clic ; jamais une autre fenêtre ni une page d’elle-même', async () => {
  await ordre('--only=combat,glance');
  const combat = fenetre('combat');
  const glance = fenetre('glance');
  const copier = ipcOn.get('copy');
  curseur = centre(combat);
  copier(evenement(combat), 'Combat');
  curseur = LOIN;
  copier(evenement(glance), 'en douce');
  assert.deepEqual(copies, []);
  curseur = centre(glance);
  copier(evenement(glance), 'Sol'.repeat(100));
  assert.deepEqual(copies, ['Sol'.repeat(100).slice(0, 200)]);
  curseur = LOIN;
});

test('hauteur demandée : seulement les fenêtres qui suivent leur contenu (Coup d’œil, liste de courses)', async () => {
  const combat = fenetre('combat');
  const glance = fenetre('glance');
  const fit = ipcOn.get('fit-height');
  fit(evenement(combat), 1080);
  assert.equal(combat.setBoundsCalls.filter((b) => b.height === 1080).length, 0, 'Combat ne grandit pas jusqu’en bas de l’écran');
  fit(evenement(glance), 700);
  assert.equal(glance.getBounds().height, 700);
});

test('fermée puis rouverte aussitôt : la nouvelle fenêtre reste connue (fermable, boutons qui répondent)', async () => {
  await tick();
  await tick();
  const avant = fenetre('glance');
  assert.ok(avant);
  // Deux ordres à quelques millisecondes : le « closed » de l'ancienne arrive après l'ouverture de la nouvelle
  app.emit('second-instance', {}, ['electron', '.', '--only=combat']);
  app.emit('second-instance', {}, ['electron', '.', '--only=combat,glance']);
  await tick();
  await tick();
  await tick();
  const nouvelle = fenetre('glance');
  assert.ok(nouvelle && nouvelle !== avant, 'nouvelle fenêtre ouverte');
  assert.equal(avant.closeCalls, 1);
  // Ses messages sont toujours reconnus (elle est dans la table)
  ipcOn.get('fit-height')(evenement(nouvelle), 650);
  assert.equal(nouvelle.getBounds().height, 650, 'ses demandes sont encore entendues');
  await ordre('--only=combat');
  assert.equal(nouvelle.closeCalls, 1, 'un ordre suivant la ferme bien');
  await tick();
});

test('fenêtre ouverte cachée, laissée montrée : rouverte montrée (gardé d’un lancement à l’autre) ; cachée, rouverte cachée', async () => {
  await ordre('--only=combat,capture');
  const premiere = fenetre('capture');
  ipcOn.get('toggle-window')(evenement(fenetre('combat')), 'capture');
  assert.equal(premiere.isVisible(), true);
  app.emit('second-instance', {}, ['electron', '.', '--only=combat']);
  app.emit('second-instance', {}, ['electron', '.', '--only=combat,capture']);
  await tick();
  await tick();
  await tick();
  const rouverte = fenetre('capture');
  assert.ok(rouverte && rouverte !== premiere);
  assert.equal(rouverte.options.show, true, 'rouverte comme le joueur l’avait laissée : montrée');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(USER_DATA, 'fenetres-montrees.json'), 'utf8')), ['capture']);
  ipcOn.get('toggle-window')(evenement(fenetre('combat')), 'capture');
  await ordre('--only=combat');
  await ordre('--only=combat,capture');
  assert.equal(fenetre('capture').options.show, false, 'cachée par le joueur : rouverte cachée');
  await ordre('--only=combat');
  await tick();
});

test('ordres du serveur qui se croisent (--at) : le plus ancien, arrivé en dernier, ne défait pas le plus récent', async () => {
  const t = 1_800_000_000_000;
  await ordre('--only=combat,glance', `--at=${t}`);
  assert.equal(ouvertes('glance'), 1);
  await ordre('--only=combat', `--at=${t - 150}`); // parti 150 ms plus tôt, arrivé après
  assert.equal(ouvertes('glance'), 1, 'ordre périmé : ignoré');
  assert.ok(avertissements.some((m) => /ordre périmé ignoré \(parti 150 ms avant/.test(m)));
  await ordre('--only=combat', `--at=${t + 200}`);
  assert.equal(ouvertes('glance'), 0, 'ordre plus récent : appliqué');
  await ordre('--only=combat,glance'); // npm run overlay -- --only=… (à la main, sans heure) : toujours appliqué
  assert.equal(ouvertes('glance'), 1);
  await ordre('--only=combat', `--at=${t - 60_000}`); // horloge reculée d'une minute : appliqué
  assert.equal(ouvertes('glance'), 0);
  await tick();
});

test('raccourcis déjà pris par un autre programme : signalés dans la console et par une icône qui les nomme, masque et quitte', () => {
  assert.ok(avertissements.some((m) => /Alt\+Shift\+Q déjà pris/.test(m)));
  assert.ok(avertissements.some((m) => /Alt\+Shift\+H déjà pris/.test(m)));
  assert.equal(plateaux.length, 1, 'une seule icône');
  const [icone] = plateaux;
  assert.match(icone.icon, /EliteApp\.ico$/);
  assert.match(icone.bulle, /Raccourcis pris par un autre programme : Alt\+Maj\+H, Alt\+Maj\+Q/);
  assert.deepEqual(icone.menu.map((i) => i.label), ['Raccourcis pris par un autre programme : Alt+Maj+H, Alt+Maj+Q', 'Masquer / afficher', "Quitter l'overlay"]);
  assert.equal(icone.menu[0].enabled, false);
  let quitte = 0;
  const avant = app.quit;
  app.quit = () => (quitte += 1);
  try {
    icone.menu[2].click();
  } finally {
    app.quit = avant;
  }
  assert.equal(quitte, 1, '« Quitter l’overlay » quitte');
});

test('canal du serveur : branché une fois prêt, ses ordres appliqués comme un lancement transmis (aucun processus)', () => {
  assert.equal(canalNotes.ouvertures, 1, 'branché une fois, après les fenêtres du lancement');
  canalNotes.onOrdre(['--only=combat,glance']);
  assert.equal(ouvertes('glance'), 1, 'appliqué tout de suite');
  canalNotes.onOrdre(['--only=combat', '--if-running']);
  assert.equal(ouvertes('glance'), 0);
});

test('Signaux, refroidissement FSD : cachés au départ du système, réaffichés à l’arrivée, jamais recréés ni rechargés', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await ordre('--only=combat,signals,fsdcool');
  const signaux = fenetre('signals');
  const fsd = fenetre('fsdcool');
  const n = fenetres.length;
  assert.equal(signaux.isVisible(), true);
  await ordre('--only=combat'); // départ (StartJump) : le module ferme sa fenêtre
  assert.equal(signaux.closeCalls, 0, 'pas fermée');
  assert.equal(signaux.isVisible(), false, 'cachée');
  assert.equal(fsd.isVisible(), false);
  raccourcis.get('Alt+Shift+H')();
  raccourcis.get('Alt+Shift+H')(); // tout masquer puis tout réafficher : la fenêtre rangée reste cachée
  assert.equal(signaux.isVisible(), false);
  const focus = signaux.focusCalls;
  await ordre('--only=combat,signals'); // arrivée (FSDJump)
  assert.equal(fenetre('signals'), signaux, 'la même fenêtre');
  assert.equal(signaux.isVisible(), true, 'réaffichée');
  assert.equal(signaux.focusCalls, focus, 'sans prendre la main au jeu');
  assert.equal(fenetres.length, n, 'aucune fenêtre ni page recréée');
  assert.equal(fsd.isVisible(), false, 'le refroidissement FSD reste rangé tant qu’il n’est pas redemandé');
  // Chromium ne repeint pas une fenêtre cachée : transparente le temps que la page montre le nouveau système
  assert.equal(signaux.opacity, 0, 'transparente à sa réapparition');
  t.mock.timers.tick(120);
  assert.equal(signaux.opacity, 1, 'puis opaque, une fois repeinte');
  await ordre('--only=combat');
  t.mock.timers.tick(10 * 60_000); // rangées fermées pour de bon : les tests suivants partent sans elles
  await tick();
  assert.equal(signaux.destroyed && fsd.destroyed, true);
});

const chevauche = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('fenêtre rangée : comptée absente pour placer les autres, replacée à sa sortie sans couvrir une fenêtre ouverte entre-temps', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  fs.rmSync(path.join(USER_DATA, 'position-fsdcool.json'), { force: true });
  fs.rmSync(path.join(USER_DATA, 'position-carrier.json'), { force: true });
  await ordre('--only=combat,carrier');
  const seule = fenetre('carrier').getBounds(); // place de la fenêtre du porteur sans aucune autre fenêtre du HUD
  await ordre('--only=combat');
  await tick();
  await ordre('--only=combat,fsdcool');
  const fsd = fenetre('fsdcool');
  await ordre('--only=combat'); // fsdcool rangée (cachée)
  assert.equal(fsd.isVisible(), false);
  await ordre('--only=combat,carrier'); // alerte du porteur pendant que le refroidissement est rangé
  const porteur = fenetre('carrier').getBounds();
  assert.deepEqual(porteur, seule, 'aucun trou laissé par la fenêtre invisible');
  assert.equal(chevauche(porteur, fsd.getBounds()), true, 'elle prend la case de la fenêtre rangée');
  await ordre('--only=combat,carrier,fsdcool'); // refroidissement de nouveau
  assert.equal(fenetre('fsdcool'), fsd, 'la même fenêtre, réaffichée');
  assert.equal(fsd.isVisible(), true);
  assert.equal(chevauche(fsd.getBounds(), porteur), false, 'replacée sans couvrir la fenêtre du porteur');
  await ordre('--only=combat');
  t.mock.timers.tick(10 * 60_000);
  await tick();
});

test('disposition pendant qu’une fenêtre est rangée : elle en reste dehors, aucune place enregistrée pour elle', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fichier = path.join(USER_DATA, 'position-signals.json');
  fs.rmSync(fichier, { force: true });
  await ordre('--only=combat,signals');
  const signaux = fenetre('signals');
  await ordre('--only=combat'); // Signaux rangée
  await ordre('--only=combat', '--disposer=1');
  assert.equal(signaux.isVisible(), false, 'toujours cachée');
  assert.ok(!modesDeplacement(signaux).includes(true), 'jamais en mode déplacement');
  await ordre('--only=combat', '--disposer=0');
  assert.equal(fs.existsSync(fichier), false, 'sa place par défaut n’est pas fixée à son insu');
  assert.ok(fs.existsSync(path.join(USER_DATA, 'position-combat.json')), 'celle de la fenêtre disposée, si');
  t.mock.timers.tick(10 * 60_000);
  await tick();
});

test('liste vide avec une fenêtre rangée : l’overlay reste lancé (pas de relance au prochain saut), puis s’arrête quand elle se ferme', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await ordre('--only=fsdcool'); // npm run dev, aucun mode : seulement le refroidissement FSD
  const fsd = fenetre('fsdcool');
  const fermetures = canalNotes.fermetures;
  const quits = app.quitCalls || 0;
  canalNotes.onOrdre(['--only=,']); // refroidissement fini
  assert.equal(app.quitCalls || 0, quits, 'pas arrêté');
  assert.equal(canalNotes.fermetures, fermetures, 'canal gardé');
  assert.equal(fsd.isVisible(), false);
  canalNotes.onOrdre(['--only=fsdcool']); // saut suivant : réaffichée par le canal, sans aucun lancement
  assert.equal(fenetre('fsdcool'), fsd);
  assert.equal(fsd.isVisible(), true);
  canalNotes.onOrdre(['--only=,']);
  t.mock.timers.tick(10 * 60_000);
  await tick();
  assert.equal(fsd.destroyed, true, 'fermée pour de bon');
  app.emit('window-all-closed'); // comme Electron, plus aucune fenêtre
  assert.equal(canalNotes.fermetures, fermetures + 1, 'canal coupé d’abord : le serveur relancera l’overlay');
  assert.equal(app.quitCalls, quits + 1);
});

test('fenêtre rangée depuis 10 min : fermée pour de bon, une nouvelle s’ouvre la fois suivante', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await ordre('--only=combat,navroute');
  const route = fenetre('navroute');
  await ordre('--only=combat'); // arrivée : itinéraire fini
  assert.equal(route.closeCalls, 0);
  t.mock.timers.tick(9 * 60_000);
  assert.equal(route.closeCalls, 0, 'encore gardée à 9 min');
  t.mock.timers.tick(60_000);
  assert.equal(route.closeCalls, 1, 'fermée à 10 min');
  await tick();
  await ordre('--only=combat,navroute');
  assert.ok(fenetre('navroute') && fenetre('navroute') !== route, 'nouvel itinéraire : nouvelle fenêtre');
  await ordre('--only=combat');
  t.mock.timers.tick(10 * 60_000);
  await tick();
});

test('liste vide (tout fermer) : le canal est coupé avant de quitter ; le serveur relancera l’overlay', () => {
  const fermetures = canalNotes.fermetures;
  const quits = app.quitCalls || 0;
  canalNotes.onOrdre(['--only=,']);
  assert.equal(canalNotes.fermetures, fermetures + 1);
  assert.equal(app.quitCalls, quits + 1);
});
