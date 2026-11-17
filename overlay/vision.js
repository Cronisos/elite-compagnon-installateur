// Vue du jeu : images de la SEULE fenêtre d'Elite Dangerous, jamais de l'écran ni d'une autre fenêtre.
//
// Garanties (le joueur l'a exigé, 12 nov. 2026 : « que des images du jeu, à aucun moment autre chose ») :
//   - la liste des fenêtres est demandée SANS vignettes (taille 0 × 0) : aucune image d'aucune fenêtre n'est faite
//     pour la parcourir ;
//   - la source retenue doit être la fenêtre principale du processus EliteDangerous64 (son numéro de fenêtre, lu dans
//     Windows) ET porter le titre du jeu : une autre fenêtre au même titre ne passe pas ;
//   - seule cette source est ouverte (un flux vidéo de cette fenêtre-là, comme un partage de fenêtre), dans une
//     fenêtre cachée de l'overlay à part, sans accès au réseau, qui n'a le droit qu'à ce flux vidéo ;
//   - ce fichier ne demande jamais une source de type « écran » (un test le vérifie) ;
//   - les images restent en mémoire, ne sont jamais écrites sur le disque ; le flux se ferme après 60 s sans demande.
// Jeu fermé, réduit, ou pas trouvé : pas d'image du tout.

const { execFile } = require('node:child_process');
const path = require('node:path');

const TITRE_JEU = 'Elite - Dangerous (CLIENT)';
const PROCESSUS_JEU = 'EliteDangerous64';
const HWND_MS = 30_000; // numéro de la fenêtre du jeu relu au plus toutes les 30 s
const INACTIF_MS = 60_000; // flux fermé après 60 s sans demande
const REVERIFIER_MS = 5 * 60_000; // flux ouvert : la fenêtre du jeu est revérifiée (numéro et titre) toutes les 5 min
const PAGE = path.join(__dirname, 'vision.html');
const PARTITION = 'vision-jeu'; // session à part, en mémoire : ni l'interface de l'app, ni ses permissions

/** Numéros des fenêtres principales du jeu, d'après la sortie de PowerShell (un nombre décimal par ligne, 0 ignoré). */
function lireHwnds(sortie) {
  return new Set(String(sortie || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[1-9]\d{0,19}$/.test(l)));
}

/**
 * La source de la fenêtre du jeu parmi les sources de desktopCapturer (« window:<numéro>:0 »), ou null.
 * Exige les deux : le numéro d'une fenêtre principale d'EliteDangerous64 et le titre du jeu.
 */
function choisirSource(sources, hwnds) {
  return (sources || []).find((s) => {
    const m = /^window:(\d+):/.exec(String(s?.id || ''));
    return Boolean(m && hwnds.has(m[1]) && s.name === TITRE_JEU);
  }) || null;
}

/** powershell.exe par son chemin complet : jamais un programme du même nom dans le dossier courant. */
const POWERSHELL = path.win32.join(String(process.env.SystemRoot || process.env.windir || 'C:\\Windows'), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

/** Fenêtres principales du processus du jeu (PowerShell, sans fenêtre visible). */
function hwndsDuJeu(executer = execFile) {
  return new Promise((resolve) => {
    executer(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Name ${PROCESSUS_JEU} -ErrorAction SilentlyContinue).MainWindowHandle`],
      { windowsHide: true, timeout: 8000 }, (err, stdout) => resolve(err ? new Set() : lireHwnds(stdout)));
  });
}

/** Seule la page de capture, et seulement la vidéo (jamais le son, le micro, la caméra ni autre chose). */
function videoSeule(wc, permission, types) {
  // Capture d'une fenêtre : « display-capture » (Electron 3x), « media » vidéo pour les versions plus anciennes
  if (!['display-capture', 'media'].includes(permission) || !types.length || !types.every((t) => t === 'video')) return false;
  try {
    return path.normalize(decodeURIComponent(new URL(wc?.getURL?.() || '').pathname).replace(/^\/([A-Za-z]:)/, '$1')) === path.normalize(PAGE);
  } catch {
    return false;
  }
}

class VueJeu {
  /** @param {{ electron: object, executer?: Function, log?: Function }} o */
  constructor({ electron, executer = execFile, log = console.warn }) {
    this.electron = electron;
    this.executer = executer;
    this.log = log;
    this.hwnds = new Set();
    this.hwndsAt = 0;
    this.win = null;
    this.prete = null; // promesse : page de capture chargée
    this.ouverte = null; // id de la source ouverte dans la page
    this.verifieeAt = 0; // dernière vérification de la source ouverte (numéro de fenêtre du jeu et titre)
    this.timer = null;
    this.attentes = new Map(); // n° de demande → resolve
    this.n = 0;
  }

  /** La source du jeu, ou null (jeu fermé, réduit…). Numéros relus si la source n'est pas trouvée. */
  async source() {
    const { desktopCapturer } = this.electron;
    const lister = () => desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
    if (Date.now() - this.hwndsAt > HWND_MS) {
      this.hwnds = await hwndsDuJeu(this.executer);
      this.hwndsAt = Date.now();
    }
    if (!this.hwnds.size) return null;
    let src = choisirSource(await lister(), this.hwnds);
    if (!src && Date.now() - this.hwndsAt > 2000) {
      this.hwnds = await hwndsDuJeu(this.executer);
      this.hwndsAt = Date.now();
      src = choisirSource(await lister(), this.hwnds);
    }
    return src;
  }

  /** Fenêtre cachée de capture, dans sa propre session verrouillée. */
  page() {
    if (this.win && !this.win.isDestroyed()) return this.prete;
    const { BrowserWindow, session, ipcMain } = this.electron;
    const ses = session.fromPartition(PARTITION, { cache: false });
    ses.setPermissionRequestHandler((wc, permission, callback, details) => callback(videoSeule(wc, permission, details?.mediaTypes || [])));
    ses.setPermissionCheckHandler((wc, permission, _origin, details) => videoSeule(wc, permission, details?.mediaType ? [details.mediaType] : []));
    ses.setDevicePermissionHandler?.(() => false);
    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      let ok = false;
      try {
        ok = details.url.startsWith('file:') && path.normalize(decodeURIComponent(new URL(details.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')) === path.normalize(PAGE);
      } catch {
        ok = false;
      }
      callback({ cancel: !ok });
    });
    this.win = new BrowserWindow({
      show: false, width: 320, height: 200, skipTaskbar: true, focusable: false,
      webPreferences: { partition: PARTITION, preload: path.join(__dirname, 'vision-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
    });
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.win.webContents.on('will-navigate', (e) => e.preventDefault());
    if (!this.ecouteur) {
      this.ecouteur = (event, n, reponse) => {
        if (!this.win || event.sender !== this.win.webContents) return; // seulement la page de capture
        this.attentes.get(n)?.(reponse);
        this.attentes.delete(n);
      };
      ipcMain.on('vision-reponse', this.ecouteur);
    }
    this.ouverte = null;
    this.prete = this.win.loadFile(PAGE);
    this.win.on('closed', () => {
      this.win = null;
      this.ouverte = null;
    });
    return this.prete;
  }

  demander(ordre, donnees, ms = 8000) {
    const n = ++this.n;
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.attentes.delete(n);
        resolve({ erreur: 'La capture du jeu ne répond pas.' });
      }, ms);
      this.attentes.set(n, (r) => {
        clearTimeout(t);
        resolve(r);
      });
      this.win.webContents.send('vision-ordre', n, ordre, donnees);
    });
  }

  /**
   * Une image de la fenêtre du jeu : entière (réduite à `largeur` pixels de large, en JPEG) ou une zone (fractions
   * x, y, l, h de l'image), en pixels bruts pour la jauge.
   * @returns {Promise<{ largeur, hauteur, jpeg?: string, px?: Uint8ClampedArray } | { erreur: string }>}
   */
  async image({ zone = null, largeur = 1280, brut = false } = {}) {
    // Flux déjà ouvert sur la fenêtre du jeu, vérifiée il y a moins de REVERIFIER_MS : l'image est prise sans relister
    // les fenêtres (la jauge des boucliers en demande une par seconde). Jeu fermé : la piste vidéo s'arrête, la page le
    // dit (fluxFerme) et la fenêtre du jeu est cherchée de nouveau. Jeu réduit : image noire, refusée par la page.
    if (this.ouverte && this.win && !this.win.isDestroyed() && Date.now() - this.verifieeAt < REVERIFIER_MS) {
      const r = await this.demander('image', { zone, largeur, brut });
      if (!r?.fluxFerme) {
        this.prolonger();
        return r;
      }
      this.ouverte = null;
    }
    const src = await this.source();
    if (!src) {
      this.fermer();
      return { erreur: 'Fenêtre du jeu introuvable (jeu fermé ou réduit) : aucune image prise.' };
    }
    await this.page();
    if (this.ouverte !== src.id) {
      const r = await this.demander('ouvrir', { id: src.id });
      if (r?.erreur) return r;
      this.ouverte = src.id;
    }
    this.verifieeAt = Date.now();
    this.prolonger();
    return this.demander('image', { zone, largeur, brut });
  }

  /** Flux fermé après INACTIF_MS sans demande. */
  prolonger() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fermer(), INACTIF_MS);
    this.timer.unref?.();
  }

  /** Flux arrêté et fenêtre de capture détruite. */
  fermer() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
    this.ouverte = null;
    this.verifieeAt = 0;
  }
}

module.exports = { VueJeu, choisirSource, lireHwnds, hwndsDuJeu, videoSeule, TITRE_JEU, PROCESSUS_JEU, PAGE };
