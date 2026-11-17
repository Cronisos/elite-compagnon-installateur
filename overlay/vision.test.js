// Vue du jeu : seulement la fenêtre d'Elite (numéro de fenêtre du processus ET titre), jamais l'écran ; jauge des
// boucliers par comptage des pixels des anneaux.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { VueJeu, choisirSource, lireHwnds, videoSeule, PAGE, TITRE_JEU } = require('./vision.js');
const { calibrer, pourcentage, reglageValide, MIN_MASQUE } = require('./bouclier.js');

test('vision : la source retenue est la fenêtre principale du jeu, avec son titre, rien d’autre', () => {
  const hwnds = lireHwnds('268268\r\n0\r\n\r\n');
  assert.deepEqual([...hwnds], ['268268']);
  const sources = [
    { id: 'screen:0:0', name: 'Écran entier' },
    { id: 'window:111:0', name: TITRE_JEU }, // même titre, autre programme : refusée
    { id: 'window:268268:0', name: 'Discord' }, // bon numéro, autre titre : refusée
    { id: 'window:268268:0', name: TITRE_JEU },
  ];
  assert.equal(choisirSource(sources, hwnds), sources[3]);
  assert.equal(choisirSource(sources.slice(0, 3), hwnds), null);
  assert.equal(choisirSource(sources, new Set()), null); // jeu fermé : rien
});

test('vision : le code ne demande jamais l’écran entier, ni de vignettes des fenêtres', () => {
  const code = fs.readFileSync(path.join(__dirname, 'vision.js'), 'utf8');
  assert.doesNotMatch(code, /types:\s*\[[^\]]*'screen'/);
  assert.match(code, /types:\s*\['window'\],\s*thumbnailSize:\s*\{\s*width:\s*0,\s*height:\s*0\s*\}/);
  const page = fs.readFileSync(PAGE, 'utf8');
  assert.match(page, /audio:\s*false/);
  assert.match(page, /default-src 'none'/); // aucune requête réseau depuis la page de capture
});

test('vision : la page de capture n’a droit qu’à la vidéo, et seulement elle', () => {
  const wc = (url) => ({ getURL: () => url });
  const ici = `file:///${PAGE.replace(/\\/g, '/')}`;
  assert.equal(videoSeule(wc(ici), 'display-capture', ['video']), true);
  assert.equal(videoSeule(wc(ici), 'display-capture', ['video', 'audio']), false);
  assert.equal(videoSeule(wc(ici), 'media', ['audio']), false);
  assert.equal(videoSeule(wc(ici), 'notifications', ['video']), false);
  assert.equal(videoSeule(wc('http://127.0.0.1:5173/hud/ia'), 'display-capture', ['video']), false);
});

/** Image de test : fond sombre, « hologramme » allumé au centre, anneau allumé autour sur `part` de son tour. */
function image(largeur, hauteur, { anneau = 0 } = {}) {
  const px = new Uint8ClampedArray(largeur * hauteur * 4);
  const cx = largeur / 2;
  const cy = hauteur / 2;
  for (let y = 0; y < hauteur; y += 1) {
    for (let x = 0; x < largeur; x += 1) {
      const i = (y * largeur + x) * 4;
      const d = Math.hypot(x - cx, y - cy);
      const angle = (Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI);
      const holo = d < 8;
      const ring = d > 16 && d < 20 && angle < anneau;
      if (holo || ring) {
        px[i] = 255; px[i + 1] = 120; px[i + 2] = 20; // orange du HUD
      } else {
        px[i] = 30; px[i + 1] = 32; px[i + 2] = 36; // cockpit sombre
      }
      px[i + 3] = 255;
    }
  }
  return { largeur, hauteur, px };
}

test('jauge : réglée sur tombés puis pleins, elle donne la part de l’anneau allumée', () => {
  const r = calibrer(image(60, 60), image(60, 60, { anneau: 1 }));
  assert.ok(r.pixels >= MIN_MASQUE);
  assert.ok(reglageValide(r));
  assert.equal(pourcentage(image(60, 60, { anneau: 1 }), r), 100);
  assert.ok(Math.abs(pourcentage(image(60, 60, { anneau: 0.5 }), r) - 50) <= 5);
  assert.equal(pourcentage(image(60, 60), r), 0);
  assert.equal(pourcentage(image(40, 40), r), null); // autre taille : pas de chiffre
  assert.throws(() => calibrer(image(60, 60), image(60, 60)), /Presque aucune différence/);
  assert.throws(() => calibrer(image(60, 60), image(50, 60, { anneau: 1 })), /même taille/);
  assert.equal(reglageValide({ ...r, masque: 'AAAA' }), null);
});

/** Electron simulé : fenêtres listées, page de capture qui répond aux ordres (« ouvrir », « image »). */
function electronFaux(etat) {
  let ecouteur = null;
  const wc = {
    send: (_canal, n, ordre) => {
      etat.ordres.push(ordre);
      const r = ordre === 'ouvrir' ? { largeur: 1920, hauteur: 1080 } : etat.pisteFinie ? { erreur: 'Flux du jeu fermé.', fluxFerme: true } : { largeur: 10, hauteur: 10, px: [1] };
      setImmediate(() => ecouteur({ sender: wc }, n, r));
    },
    setWindowOpenHandler: () => {},
    on: () => {},
  };
  class BrowserWindow {
    constructor() { this.webContents = wc; this.detruite = false; }
    loadFile() { return Promise.resolve(); }
    on() {}
    isDestroyed() { return this.detruite; }
    destroy() { this.detruite = true; }
  }
  const ses = { setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, setDevicePermissionHandler() {}, webRequest: { onBeforeRequest() {} } };
  return {
    BrowserWindow,
    session: { fromPartition: () => ses },
    ipcMain: { on: (_canal, fn) => { ecouteur = fn; } },
    desktopCapturer: { getSources: async () => { etat.listes += 1; return etat.jeuOuvert ? [{ id: 'window:4242:0', name: TITRE_JEU }] : []; } },
  };
}

test('vision : flux ouvert, l’image est prise sans relister les fenêtres ; piste finie (jeu fermé), la fenêtre est cherchée de nouveau', async () => {
  const etat = { listes: 0, ordres: [], jeuOuvert: true, pisteFinie: false, powershell: 0 };
  const executer = (_cmd, _args, _o, cb) => { etat.powershell += 1; cb(null, etat.jeuOuvert ? '4242\r\n' : ''); };
  const vue = new VueJeu({ electron: electronFaux(etat), executer, log: () => {} });
  try {
    for (let i = 0; i < 5; i++) assert.equal((await vue.image({ zone: { x: 0, y: 0, l: 1, h: 1 }, brut: true })).largeur, 10);
    assert.equal(etat.listes, 1, 'fenêtres listées une seule fois pour 5 images');
    assert.equal(etat.powershell, 1);
    assert.deepEqual(etat.ordres.filter((o) => o === 'ouvrir').length, 1);
    // Le jeu se ferme : la piste vidéo s'arrête, la fenêtre du jeu n'est plus là
    etat.pisteFinie = true;
    etat.jeuOuvert = false;
    vue.hwndsAt = 0; // numéros de fenêtre relus tout de suite
    assert.match((await vue.image({ brut: true })).erreur, /introuvable/);
    assert.equal(vue.ouverte, null, 'flux fermé');
    assert.equal(etat.listes, 1, 'jeu fermé : PowerShell ne trouve aucune fenêtre, rien à lister');
  } finally {
    vue.fermer();
  }
});
